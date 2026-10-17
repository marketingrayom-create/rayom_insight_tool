import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from flask import Flask
import meta_ads

class MetaCampaignTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = patch.object(meta_ads, 'DB_PATH', Path(self.temp.name) / 'tracking.sqlite3'); self.db.start()
        self.env = patch.dict(os.environ, {'META_AD_ACCOUNT_ID': '111', 'META_ADS__READ': 'shelf-token', 'RAYOM_META_AD_ACCOUNT_ID': '222', 'RAYOM_META_ADS_READ': 'rayom-token'}, clear=True); self.env.start()
        app = Flask(__name__); app.register_blueprint(meta_ads.meta_ads); self.client = app.test_client()
        self.form = {'organization':'shelfesteem', 'brand':'shelfesteem', 'name':'Test campaign', 'objective':'OUTCOME_ENGAGEMENT', 'status':'PAUSED', 'start_date':'2026-10-02', 'end_date':'2026-10-12', 'hashtags':['test'], 'description':'Test', 'refresh_frequency':'24', 'financial_arrangement':'Paid', 'special_ad_categories':[]}
        self.headers = {'Idempotency-Key':'test-request-12345678'}
    def tearDown(self):
        self.db.stop(); self.env.stop(); self.temp.cleanup()
    def response(self, payload):
        return Mock(ok=True, json=Mock(return_value=payload))
    def test_linso_campaigns_use_separate_account_and_token(self):
        with patch.dict(os.environ, {'RAYOM_META_LINSO_AD_ACCOUNT_ID':'act_333','RAYOM_META_LINSO_TOKEN':'linso-token'}), patch.object(meta_ads.requests,'get',return_value=self.response({'data':[{'id':'L1','name':'Linso campaign'}]})) as get:
            result=self.client.get('/api/meta/campaigns?organization=linso')
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json['organization'],'linso')
            self.assertIn('/act_333/campaigns',get.call_args.args[0])
            self.assertEqual(get.call_args.kwargs['headers']['Authorization'],'Bearer linso-token')
    def test_linso_missing_credentials_never_fall_back_to_rayom(self):
        with patch.object(meta_ads.requests,'get') as get:
            self.assertEqual(self.client.get('/api/meta/campaigns?organization=linso').status_code,400)
            get.assert_not_called()
    def test_linso_posts_use_linso_ads_and_return_creatives(self):
        rows=[{'id':'ad1','creative':{'id':'creative1','body':'Linso post'}}]
        with patch.dict(os.environ, {'RAYOM_META_LINSO_AD_ACCOUNT_ID':'333','RAYOM_META_LINSO_TOKEN':'linso-token'}), patch.object(meta_ads.requests,'get',return_value=self.response({'data':rows})) as get:
            result=self.client.get('/api/meta/posts?organization=linso')
            self.assertEqual(result.json['rows'],rows)
            self.assertIn('/act_333/ads',get.call_args.args[0])
            self.assertEqual(get.call_args.kwargs['headers']['Authorization'],'Bearer linso-token')
    def test_create_is_company_scoped_persistent_and_idempotent(self):
        with patch.object(meta_ads.requests, 'post', return_value=self.response({'id':'987'})) as post:
            result = self.client.post('/api/meta/campaigns', json=self.form, headers=self.headers)
            self.assertEqual(result.status_code, 201)
            self.assertIn('/act_111/campaigns', post.call_args.args[0])
            self.assertEqual(post.call_args.kwargs['data']['status'], 'PAUSED')
            self.assertEqual(post.call_args.kwargs['data']['objective'], 'OUTCOME_ENGAGEMENT')
            self.assertEqual(post.call_args.kwargs['data']['is_adset_budget_sharing_enabled'], 'false')
            repeat = self.client.post('/api/meta/campaigns', json=self.form, headers=self.headers)
            self.assertEqual(repeat.status_code, 200); self.assertEqual(post.call_count, 1)
        self.assertEqual(meta_ads.metadata_for('shelfesteem','111')['987']['hashtags'], ['test'])
        self.assertEqual(meta_ads.metadata_for('rayom','222'), {})
    def test_active_rayom_campaign_and_all_objectives(self):
        for index, objective in enumerate(meta_ads.OBJECTIVES):
            with patch.object(meta_ads.requests, 'post', return_value=self.response({'id':str(900+index)})) as post:
                result = self.client.post('/api/meta/campaigns', json={**self.form,'organization':'rayom','brand':'rayom','status':'ACTIVE','objective':objective}, headers={'Idempotency-Key':f'objective-request-{index}-12345'})
                self.assertEqual(result.status_code, 201)
                self.assertIn('/act_222/',post.call_args.args[0]); self.assertEqual(post.call_args.kwargs['data']['status'],'ACTIVE')
    def test_bad_dates_and_cross_company_brand_do_not_call_meta(self):
        with patch.object(meta_ads.requests, 'post') as post:
            for changes in ({'end_date':'2026-01-01'},{'brand':'rayom'},{'objective':'INVALID'}):
                self.assertEqual(self.client.post('/api/meta/campaigns',json={**self.form,**changes},headers=self.headers).status_code,400)
            post.assert_not_called()
    def test_pause_and_resume_verify_account(self):
        for target in ('PAUSED','ACTIVE'):
            with patch.object(meta_ads.requests,'get',return_value=self.response({'account_id':'111'})), patch.object(meta_ads.requests,'post',return_value=self.response({'success':True})) as post:
                result=self.client.post('/api/meta/campaigns/987/status',json={'organization':'shelfesteem','status':target})
                self.assertEqual(result.status_code,200); self.assertEqual(post.call_args.kwargs['data']['status'],target)
        with patch.object(meta_ads.requests,'get',return_value=self.response({'account_id':'222'})),patch.object(meta_ads.requests,'post') as post:
            self.assertEqual(self.client.post('/api/meta/campaigns/987/status',json={'organization':'shelfesteem','status':'PAUSED'}).status_code,403); post.assert_not_called()
    def test_timeout_does_not_resubmit(self):
        with patch.object(meta_ads.requests,'post',side_effect=meta_ads.requests.Timeout()) as post:
            result=self.client.post('/api/meta/campaigns',json=self.form,headers=self.headers)
            self.assertTrue(result.get_json()['uncertain'])
            self.assertEqual(self.client.post('/api/meta/campaigns',json=self.form,headers=self.headers).status_code,409); self.assertEqual(post.call_count,1)
    def test_meta_validation_error_is_specific_and_redacts_token(self):
        response = Mock(ok=False, json=Mock(return_value={'error': {'code':100, 'error_subcode':4834011, 'error_user_msg':'Specify budget sharing shelf-token'}}))
        with patch.object(meta_ads.requests, 'post', return_value=response):
            result = self.client.post('/api/meta/campaigns', json=self.form, headers=self.headers)
            self.assertEqual(result.status_code, 502)
            error = result.get_json()['error']
            self.assertIn('Specify budget sharing', error)
            self.assertIn('4834011', error)
            self.assertNotIn('shelf-token', error)

    def test_rejects_unrelated_browser_origin(self):
        self.assertEqual(self.client.post('/api/meta/campaigns',json=self.form,headers={**self.headers,'Origin':'https://example.com'}).status_code,403)
if __name__ == '__main__': unittest.main()
