"""Read-only Shopify Admin GraphQL integration."""
import os
import re
import time
from threading import Lock
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from flask import Blueprint, jsonify, request, g, has_request_context

BASE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE, '.env'))
load_dotenv(os.path.join(os.path.dirname(BASE), '.env'))
shopify = Blueprint('shopify', __name__)
_tokens = {}
_lock = Lock()


def configuration():
    organization = getattr(g, 'shopify_organization', 'shelfesteem') if has_request_context() else 'shelfesteem'
    suffix = '_RAYOM' if organization == 'rayom' else ''
    def setting(key):
        return os.getenv(key + suffix, '').strip()
    value = setting('SHOPIFY_SHOP')
    if '://' in value:
        value = urlparse(value).hostname or ''
    value = value.rstrip('/').lower()
    if value and '.' not in value:
        value += '.myshopify.com'
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*\.myshopify\.com', value):
        raise ValueError('SHOPIFY_SHOP must be the store subdomain or its myshopify.com domain.')
    client = setting('SHOPIFY_CLIENT_ID')
    secret = setting('SHOPIFY_CLIENT_SECRET')
    token = setting('SHOPIFY_ACCESS_TOKEN')
    if not token and not (client and secret):
        raise ValueError('Configure SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or SHOPIFY_ACCESS_TOKEN.')
    return value, client, secret, token


def access_token():
    shop, client, secret, static_token = configuration()
    if static_token:
        return static_token
    with _lock:
        cached = _tokens.get((shop, client))
        if cached and time.time() < cached[1]:
            return cached[0]
        response = requests.post(f'https://{shop}/admin/oauth/access_token', data={
            'grant_type': 'client_credentials', 'client_id': client, 'client_secret': secret,
        }, timeout=30, allow_redirects=False)
        if not response.ok:
            raise RuntimeError(f'Shopify authentication failed (HTTP {response.status_code}). Verify the client credentials and install the app on this store. Client credentials requires the app and store to belong to your Shopify organization.')
        data = response.json()
        if not data.get('access_token'):
            raise RuntimeError('Shopify did not return an access token.')
        _tokens[(shop, client)] = (data['access_token'], time.time() + max(0, int(data.get('expires_in', 86400)) - 60))
        return data['access_token']


def graphql(query, variables):
    shop, client, _, static_token = configuration()
    version = os.getenv('SHOPIFY_API_VERSION', '2026-07')
    if not re.fullmatch(r'\d{4}-(01|04|07|10)', version):
        raise ValueError('Invalid SHOPIFY_API_VERSION.')
    for attempt in range(2):
        response = requests.post(f'https://{shop}/admin/api/{version}/graphql.json',
            headers={'X-Shopify-Access-Token': access_token()},
            json={'query': query, 'variables': variables}, timeout=45, allow_redirects=False)
        if response.status_code == 401 and not static_token and attempt == 0:
            with _lock:
                _tokens.pop((shop, client), None)
            continue
        if not response.ok:
            raise RuntimeError(f'Shopify API failed (HTTP {response.status_code}). Verify app installation and access scopes; retry if rate limited.')
        result = response.json()
        if result.get('errors'):
            codes = {item.get('extensions', {}).get('code') for item in result['errors']}
            if 'ACCESS_DENIED' in codes:
                errors = result['errors']
                if all(item.get('path', [])[-1:] == ['resourcePublicationsCount'] for item in errors) and 'resourcePublicationsCount { count }' in query:
                    return graphql(query.replace('resourcePublicationsCount { count }', ''), variables)
                required = sorted({str(item.get('extensions', {}).get('requiredAccess')) for item in errors if item.get('extensions', {}).get('requiredAccess')})
                detail = '; '.join(required) if required else 'the requested resource scopes'
                raise RuntimeError(f'Shopify denied access. Required access: {detail}. Update the app scopes and approve the installation permissions.')
            if 'THROTTLED' in codes:
                raise RuntimeError('Shopify rate limit reached. Please retry shortly.')
            raise RuntimeError('Shopify GraphQL request failed. Verify API version and app permissions.')
        if not isinstance(result.get('data'), dict):
            raise RuntimeError('Unexpected Shopify response.')
        return result['data']


PRODUCTS = '''query Products($after: String, $search: String) {
  shop { name myshopifyDomain currencyCode }
  products(first: 25, after: $after, query: $search) {
    pageInfo { hasNextPage endCursor }
    nodes { id title vendor status totalInventory productType onlineStoreUrl
      featuredImage { url altText } category { name }
      resourcePublicationsCount { count }
      priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
    }
  }
}'''
ORDERS = '''query Orders($after: String, $search: String) {
  shop { name myshopifyDomain currencyCode }
  orders(first: 25, after: $after, query: $search, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes { id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
      customer { displayName } sourceName tags currentSubtotalLineItemsQuantity
      shippingLine { title } fulfillments { displayStatus }
      totalPriceSet { shopMoney { amount currencyCode } }
    }
  }
}'''

CHECKOUTS = '''query Checkouts($after: String, $search: String) {
  shop { name myshopifyDomain currencyCode }
  abandonedCheckouts(first: 25, after: $after, query: $search, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes { id name createdAt completedAt customer { displayName }
      shippingAddress { country } totalPriceSet { shopMoney { amount currencyCode } }
    }
  }
}'''


@shopify.post('/api/shopify/<resource>')
def data_route(resource):
    if resource not in ('products', 'orders', 'inventory', 'dashboard', 'abandoned-checkouts'):
        return jsonify(success=False, error='Unknown Shopify resource'), 404
    try:
        body = request.get_json(silent=True) or {}
        organization = body.get('organization', 'shelfesteem')
        if organization not in ('shelfesteem', 'rayom'):
            raise ValueError('Unknown organization.')
        g.shopify_organization = organization
        after = body.get('after')
        search = body.get('search', '')
        if (after is not None and not isinstance(after, str)) or not isinstance(search, str):
            raise ValueError('Invalid pagination cursor or search text.')
        if resource in ('inventory', 'dashboard'):
            from shopify_reporting import load_inventory, load_dashboard, filter_dashboard, validate_filters
            filters = validate_filters(body.get('filters')) if resource == 'dashboard' else None
            result = load_inventory(after, search, bool(body.get('allRows'))) if resource == 'inventory' else filter_dashboard(load_dashboard(body.get('refresh', False)), filters)
            return jsonify(success=True, marketplace='Shopify', **result)
        query = PRODUCTS if resource == 'products' else CHECKOUTS if resource == 'abandoned-checkouts' else ORDERS
        connection_key = 'abandonedCheckouts' if resource == 'abandoned-checkouts' else resource
        data = graphql(query, {'after': after, 'search': search or None})
        connection = data.get(connection_key)
        shop = data.get('shop')
        if not isinstance(connection, dict) or not isinstance(shop, dict):
            raise RuntimeError('Unexpected Shopify resource response.')
        if body.get('allRows'):
            from shopify_reporting import all_pages
            rows = list(all_pages(query, connection_key,
                                  {'search': search or None}, initial=connection))
            return jsonify(success=True, marketplace='Shopify', company=shop['name'], shop=shop,
                           data=rows, pageInfo={'hasNextPage': False, 'endCursor': None})
        return jsonify(success=True, marketplace='Shopify', company=shop['name'], shop=shop,
                       data=connection['nodes'], pageInfo=connection['pageInfo'])
    except ValueError as error:
        return jsonify(success=False, error=str(error)), 400
    except requests.RequestException:
        return jsonify(success=False, error='Unable to reach Shopify. Please retry.'), 502
    except RuntimeError as error:
        return jsonify(success=False, error=str(error)), 502
