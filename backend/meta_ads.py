"""Company-scoped, read-only Meta Marketing API."""
import os
import re
import requests
import json
import sqlite3
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from flask import Blueprint, jsonify, request

meta_ads = Blueprint('meta_ads', __name__)


def configuration(company):
    if company not in ('rayom', 'shelfesteem', 'linso'):
        raise ValueError('Choose Rayom Energizer, Rayom Linso or Shelfesteem.')
    if company == 'linso':
        token = os.getenv('RAYOM_META_LINSO_TOKEN', '').strip()
        account = os.getenv('RAYOM_META_LINSO_AD_ACCOUNT_ID', '').strip()
    elif company == 'rayom':
        token = (os.getenv('RAYOM_META_ADS_MANAGEMENT') or os.getenv('RAYOM_META_ADS_READ') or '').strip()
        account = os.getenv('RAYOM_META_AD_ACCOUNT_ID', '').strip()
    else:
        token = (os.getenv('META_ADS_MANAGEMENT') or os.getenv('META_ADS__READ') or os.getenv('META_ADS_READ') or '').strip()
        account = os.getenv('META_AD_ACCOUNT_ID', '').strip()
    account = account.removeprefix('act_')
    if not token or not re.fullmatch(r'[0-9]+', account):
        raise ValueError('Meta access token and ad account ID are missing or invalid for this company.')
    version = os.getenv('META_GRAPH_API_VERSION', 'v23.0').strip()
    if not re.fullmatch(r'v[0-9]+\.[0-9]+', version):
        raise ValueError('Invalid META_GRAPH_API_VERSION.')
    return token, account, version


@meta_ads.get('/api/meta/<resource>')
def records(resource):
    if resource not in ('campaigns', 'posts'):
        return jsonify(error='Unknown Meta resource.'), 404
    try:
        company = request.args.get('organization', 'shelfesteem')
        token, account, version = configuration(company)
        edge = 'campaigns' if resource == 'campaigns' else 'ads'
        fields = 'id,name,status,effective_status,objective,created_time,updated_time' if edge == 'campaigns' else 'id,name,status,effective_status,created_time,updated_time,campaign{id,name},creative{id,name,title,body,thumbnail_url,image_url,video_id,effective_object_story_id,instagram_permalink_url}'
        params = {'fields': fields, 'limit': 50}
        after = request.args.get('after', '')
        if after:
            if len(after) > 4096:
                raise ValueError('Invalid page cursor.')
            params['after'] = after
        response = requests.get(f'https://graph.facebook.com/{version}/act_{account}/{edge}', params=params, headers={'Authorization': f'Bearer {token}'}, timeout=30)
        payload = response.json()
        if not response.ok or payload.get('error'):
            code = payload.get('error', {}).get('code')
            message = 'Meta token expired or invalid. Update the company token.' if code == 190 else 'Meta could not read this ad account. Check account access and ads_read permission.'
            return jsonify(error=message), 502
        paging = payload.get('paging', {})
        # Never return upstream paging URLs, which can contain access tokens.
        rows = payload.get('data', [])
        if resource == 'campaigns':
            saved = metadata_for(company, account)
            rows = [{**row, 'tracking': saved.get(str(row.get('id')), {})} for row in rows]
        return jsonify(rows=rows, organization=company, after=paging.get('cursors', {}).get('after') if paging.get('next') else None)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except (requests.RequestException, TypeError):
        return jsonify(error='Meta service is unavailable. Please retry.'), 502


DB_PATH = Path(os.getenv('META_CAMPAIGN_DB_PATH', str(Path(__file__).parent / 'meta_campaigns.sqlite3')))
OBJECTIVES = {'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_TRAFFIC', 'OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_APP_PROMOTION'}


@contextmanager
def database():
    db = sqlite3.connect(str(DB_PATH), timeout=35)
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE IF NOT EXISTS campaigns (company TEXT, account TEXT, request_id TEXT, state TEXT, meta_id TEXT, metadata TEXT, PRIMARY KEY(company,account,request_id))')
    try:
        with db:
            yield db
    finally:
        db.close()


def metadata_for(company, account):
    if not DB_PATH.exists(): return {}
    with database() as db:
        return {r['meta_id']: json.loads(r['metadata']) for r in db.execute("SELECT * FROM campaigns WHERE company=? AND account=? AND state='linked'", (company, account))}


def write_origin_allowed():
    from urllib.parse import urlparse
    origin = request.headers.get('Origin')
    return not origin or urlparse(origin).hostname in ('localhost', '127.0.0.1', request.host.split(':')[0]) or origin in os.getenv('META_ALLOWED_ORIGINS', '').split(',')


def meta_write(token, version, path, form):
    response = requests.post(f'https://graph.facebook.com/{version}/{path}', data=form, headers={'Authorization': f'Bearer {token}'}, timeout=30)
    try:
        payload = response.json()
    except ValueError:
        raise requests.RequestException('Meta did not return a valid confirmation.')
    if not response.ok or payload.get('error'):
        error = payload.get('error', {})
        code = error.get('code')
        if code == 190:
            raise RuntimeError('Meta token expired or invalid.')
        detail = error.get('error_user_msg') or error.get('error_user_title') or 'Check ads_management permission, account access and campaign settings.'
        detail = str(detail).replace(token, '[redacted]')[:1500]
        raise RuntimeError(f'Meta rejected this change: {detail} (code {code}, subcode {error.get("error_subcode", "unknown")}).')
    return payload


@meta_ads.post('/api/meta/campaigns')
def create_campaign():
    if not write_origin_allowed(): return jsonify(error='Origin not allowed.'), 403
    try:
        body = request.get_json(silent=True) or {}
        company = body.get('organization')
        token, account, version = configuration(company)
        name = str(body.get('name', '')).strip()
        if not name or len(name) > 200: raise ValueError('Enter a campaign name of 1â€“200 characters.')
        objective, status = body.get('objective'), body.get('status')
        if objective not in OBJECTIVES or status not in ('ACTIVE', 'PAUSED'): raise ValueError('Choose objective and Active or Paused status.')
        start, end = date.fromisoformat(body.get('start_date', '')), date.fromisoformat(body.get('end_date', ''))
        if end < start: raise ValueError('End date must follow start date.')
        if body.get('brand') != company: raise ValueError('Brand must match the selected company.')
        tags = body.get('hashtags', [])
        if not isinstance(tags, list) or len(tags) > 30 or any(not isinstance(t, str) or not re.fullmatch(r'#?\w{1,100}', t) for t in tags): raise ValueError('Enter valid hashtags.')
        categories = body.get('special_ad_categories', [])
        if not isinstance(categories, list) or any(c not in ('HOUSING', 'EMPLOYMENT', 'CREDIT', 'ISSUES_ELECTIONS_POLITICS') for c in categories): raise ValueError('Invalid special ad category.')
        if body.get('financial_arrangement') not in ('Paid', 'Barter', 'Unpaid') or body.get('refresh_frequency') not in ('6', '12', '24'): raise ValueError('Choose arrangement and refresh frequency.')
        description = str(body.get('description', ''))
        if len(description) > 5000: raise ValueError('Description is too long.')
        metadata = {k: body.get(k) for k in ('brand', 'hashtags', 'start_date', 'end_date', 'description', 'financial_arrangement', 'refresh_frequency')}
        key = request.headers.get('Idempotency-Key', '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,80}', key): raise ValueError('Invalid submission ID.')
        with database() as db:
            prior = db.execute('SELECT * FROM campaigns WHERE company=? AND account=? AND request_id=?', (company, account, key)).fetchone()
            if prior:
                if prior['state'] == 'linked': return jsonify(id=prior['meta_id'], tracking=json.loads(prior['metadata'])), 200
                return jsonify(error='Submission already sent. Check Meta Ads Manager before creating again.'), 409
            try: db.execute('INSERT INTO campaigns VALUES (?,?,?,?,?,?)', (company, account, key, 'pending', None, json.dumps(metadata)))
            except sqlite3.IntegrityError: return jsonify(error='Submission already processing.'), 409
        try:
            payload = meta_write(token, version, f'act_{account}/campaigns', {'name': name, 'objective': objective, 'status': status, 'special_ad_categories': json.dumps(categories), 'is_adset_budget_sharing_enabled': 'false'})
        except RuntimeError as error:
            with database() as db: db.execute("UPDATE campaigns SET state='failed' WHERE company=? AND account=? AND request_id=?", (company, account, key))
            return jsonify(error=str(error)), 502
        if not payload.get('id'): return jsonify(error='Meta did not confirm creation. Check Ads Manager before retrying.', uncertain=True), 502
        with database() as db: db.execute("UPDATE campaigns SET state='linked', meta_id=? WHERE company=? AND account=? AND request_id=?", (str(payload['id']), company, account, key))
        return jsonify(id=str(payload['id']), name=name, status=status, tracking=metadata), 201
    except (ValueError, TypeError) as error: return jsonify(error=str(error)), 400
    except requests.RequestException: return jsonify(error='Meta did not confirm creation. Check Ads Manager before retrying.', uncertain=True), 502
    except sqlite3.Error: return jsonify(error='Tracking save failed. Check Ads Manager before retrying.'), 500


@meta_ads.post('/api/meta/campaigns/<campaign_id>/status')
def campaign_status(campaign_id):
    if not write_origin_allowed(): return jsonify(error='Origin not allowed.'), 403
    try:
        body = request.get_json(silent=True) or {}
        token, account, version = configuration(body.get('organization'))
        target = body.get('status')
        if not campaign_id.isdigit() or target not in ('ACTIVE', 'PAUSED'): raise ValueError('Invalid campaign or status.')
        response = requests.get(f'https://graph.facebook.com/{version}/{campaign_id}', params={'fields': 'account_id'}, headers={'Authorization': f'Bearer {token}'}, timeout=30)
        details = response.json()
        if not response.ok or str(details.get('account_id')) != account: return jsonify(error='Campaign does not belong to this company or is inaccessible.'), 403
        result = meta_write(token, version, campaign_id, {'status': target})
        if not result.get('success'): return jsonify(error='Meta did not confirm the status change.'), 502
        return jsonify(id=campaign_id, status=target)
    except (ValueError, TypeError) as error: return jsonify(error=str(error)), 400
    except RuntimeError as error: return jsonify(error=str(error)), 502
    except requests.RequestException: return jsonify(error='Meta did not confirm the status change. Refresh before retrying.'), 502


CREATOR_PERMISSION = 'instagram_creator_marketplace_discovery'


def creator_params(filters):
    if not isinstance(filters, dict):
        raise ValueError('Invalid creator filters.')
    allowed = {'minFollowers', 'maxFollowers', 'country', 'gender', 'query', 'audienceCountry', 'audienceGender', 'verified', 'sponsored'}
    if set(filters) - allowed:
        raise ValueError('One or more filters are not supported by this Meta integration.')
    params = {'platform': 'instagram', 'limit': 20,
              'fields': 'id,username,biography,country,gender,age_bucket,is_account_verified,has_brand_partnership_experience,profile_picture_url'}
    for key, target in [('minFollowers','creator_min_followers'),('maxFollowers','creator_max_followers')]:
        if filters.get(key) not in (None, ''):
            value = filters[key]
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1000000000:
                raise ValueError('Invalid follower range.')
            params[target] = value
    if params.get('creator_min_followers', 0) > params.get('creator_max_followers', 1000000000):
        raise ValueError('Maximum followers must be greater than minimum followers.')
    for key,target in [('country','creator_countries'),('audienceCountry','major_audience_countries')]:
        if filters.get(key):
            if not isinstance(filters[key], str) or not re.fullmatch('[A-Z]{2}', filters[key]):
                raise ValueError('Choose a country.')
            params[target] = json.dumps([filters[key]])
    for key,target in [('gender','creator_gender'),('audienceGender','major_audience_gender')]:
        if filters.get(key):
            if filters[key] not in ('male','female'): raise ValueError('Invalid gender.')
            params[target] = json.dumps([filters[key]])
    query = filters.get('query', '')
    if not isinstance(query, str) or len(query) > 200: raise ValueError('Search text is too long.')
    if query.strip(): params['query'] = query.strip()
    for key in ('verified','sponsored'):
        if key in filters and not isinstance(filters[key], bool): raise ValueError('Invalid profile filter.')
    return params


def creator_get(token, version, path, params):
    response = requests.get(f'https://graph.facebook.com/{version}/{path}', params=params,
                            headers={'Authorization': f'Bearer {token}'}, timeout=30)
    payload = response.json()
    if not response.ok or payload.get('error'):
        error = payload.get('error', {})
        if path.endswith('/creator_marketplace_creators') and error.get('code') == 100:
            raise RuntimeError('Meta Creator Marketplace is unavailable for the configured Instagram account. Check the Instagram Professional account ID and Creator Marketplace eligibility. Meta did not return creator results.')
        if path.endswith('/creator_marketplace_creators') and error.get('code') == 190:
            raise RuntimeError('Meta did not accept this token for Creator Marketplace (OAuth 190). Check the linked Facebook Page token and Instagram account access. Profile access alone does not confirm creator discovery access.')
        detail = error.get('error_user_msg') or error.get('message') or 'Creator Marketplace request rejected.'
        raise RuntimeError(str(detail).replace(token, '[redacted]')[:1000])
    return payload


@meta_ads.post('/api/meta/creators/search')
def search_creators():
    try:
        body = request.get_json(silent=True) or {}
        company = body.get('organization')
        token, _, version = configuration(company)
        filters = body.get('filters', {})
        params = creator_params(filters)
        if body.get('platform', 'Instagram') != 'Instagram':
            raise ValueError('Meta creator search supports Instagram here. YouTube and TikTok need their own data providers.')
        after = body.get('after')
        if after:
            if not isinstance(after,str) or len(after)>4096: raise ValueError('Invalid cursor.')
            params['after'] = after
        permissions = creator_get(token, version, 'me/permissions', {})
        granted = {item.get('permission') for item in permissions.get('data', []) if item.get('status') == 'granted'}
        if CREATOR_PERMISSION not in granted:
            return jsonify(error='Enable instagram_creator_marketplace_discovery and its required Instagram/Page permissions for this company, then connect a Creator Marketplace brand account. Ads permissions alone do not enable creator search.', requiredPermission=CREATOR_PERMISSION), 403
        prefix = 'RAYOM_' if company == 'rayom' else ''
        ig_setting = 'RAYOM_META_LINSO_BUSINESS_INSTAGRAM_ACCOUNT_ID' if company == 'linso' else prefix + 'META_INSTAGRAM_ACCOUNT_ID'
        ig_id = os.getenv(ig_setting, '').strip()
        if company == 'linso' and not ig_id:
            ig_id = os.getenv('RAYOM_META_LINSO_INSTA_ACT_ID', '').strip()
        if not re.fullmatch(r'[0-9]+', ig_id):
            return jsonify(error=f'Configure {ig_setting} with this company’s Creator Marketplace Instagram brand account ID.'), 400
        discovery_token = token
        page_id = os.getenv('RAYOM_META_LINSO_INSTA_ACT_ID', '').strip() if company == 'linso' else ''
        if page_id and page_id != ig_id:
            if not re.fullmatch(r'[0-9]+', page_id): raise ValueError('Invalid linked Linso Facebook Page ID.')
            page = creator_get(token, version, page_id, {'fields':'id,access_token,instagram_business_account'})
            if str(page.get('instagram_business_account', {}).get('id')) != ig_id:
                raise ValueError('The configured Linso Facebook Page is not linked to the configured Business Instagram account.')
            discovery_token = page.get('access_token')
            if not discovery_token: raise ValueError('Meta did not provide a token for the linked Linso Facebook Page. Check Page access for the configured user token.')
        payload = creator_get(discovery_token, version, f'{ig_id}/creator_marketplace_creators', params)
        rows = payload.get('data', [])
        if not isinstance(rows,list): raise RuntimeError('Unexpected Meta creator response.')
        rows = [row for row in rows if (not filters.get('verified') or row.get('is_account_verified') is True)
                and (not filters.get('sponsored') or row.get('has_brand_partnership_experience') is True)]
        paging = payload.get('paging', {})
        return jsonify(rows=rows, organization=company, source='Meta Creator Marketplace',
                       after=paging.get('cursors',{}).get('after') if paging.get('next') else None)
    except (ValueError, TypeError) as error: return jsonify(error=str(error)),400
    except RuntimeError as error: return jsonify(error=str(error)),502
    except requests.RequestException: return jsonify(error='Meta Creator Marketplace is unavailable. Please retry.'),502
