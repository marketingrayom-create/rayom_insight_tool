import os
import unittest
from unittest.mock import patch, Mock
from flask import Flask
import meta_ads

class CreatorSearchTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(meta_ads.meta_ads)
        self.client = app.test_client()
        self.config = patch.object(meta_ads, 'configuration', return_value=('private-token','222','v23.0'))
        self.config.start()
    def tearDown(self):
        self.config.stop()
    def test_filters_mapped_to_meta_and_company_account(self):
        permission = {'data':[{'permission':meta_ads.CREATOR_PERMISSION,'status':'granted'}]}
        result = {'data':[{'id':'1','is_account_verified':True,'has_brand_partnership_experience':True}, {'id':'2','is_account_verified':False}],
                  'paging':{'next':'https://example.com/?access_token=secret','cursors':{'after':'next-page'}}}
        with patch.dict(os.environ, {'RAYOM_META_INSTAGRAM_ACCOUNT_ID':'123'}), patch.object(meta_ads,'creator_get',side_effect=[permission,result]) as get:
            response = self.client.post('/api/meta/creators/search',json={'organization':'rayom','filters':{'minFollowers':0,'maxFollowers':10000,'country':'IN','gender':'female','audienceCountry':'US','audienceGender':'male','query':'beauty','verified':True,'sponsored':True}})
            self.assertEqual(response.status_code,200)
            self.assertEqual([r['id'] for r in response.json['rows']],['1'])
            args=get.call_args.args
            self.assertEqual(args[2],'123/creator_marketplace_creators')
            self.assertEqual(args[3]['creator_max_followers'],10000)
            self.assertEqual(args[3]['creator_countries'],'["IN"]')
            self.assertEqual(args[3]['major_audience_gender'],'["male"]')
            self.assertEqual(response.json['after'],'next-page')
            self.assertNotIn('access_token',response.get_data(as_text=True))
    def test_ads_permissions_do_not_enable_creator_search(self):
        with patch.object(meta_ads,'creator_get',return_value={'data':[{'permission':'ads_management','status':'granted'}]}) as get:
            response=self.client.post('/api/meta/creators/search',json={'organization':'rayom','filters':{}})
            self.assertEqual(response.status_code,403)
            self.assertEqual(get.call_count,1)
    def test_linso_uses_its_own_instagram_setting(self):
        permission={'data':[{'permission':meta_ads.CREATOR_PERMISSION,'status':'granted'}]}
        with patch.dict(os.environ,{'RAYOM_META_LINSO_INSTA_ACT_ID':'1201443936387167','META_INSTAGRAM_ACCOUNT_ID':'999'}), patch.object(meta_ads,'creator_get',side_effect=[permission,{'data':[]}]) as get:
            response=self.client.post('/api/meta/creators/search',json={'organization':'linso','filters':{}})
            self.assertEqual(response.status_code,200)
            self.assertEqual(get.call_args.args[2],'1201443936387167/creator_marketplace_creators')
    def test_linso_business_instagram_id_takes_priority(self):
        permission={'data':[{'permission':meta_ads.CREATOR_PERMISSION,'status':'granted'}]}
        page={'instagram_business_account':{'id':'17841413502844384'},'access_token':'private-page-token'}
        with patch.dict(os.environ,{'RAYOM_META_LINSO_INSTA_ACT_ID':'1201443936387167','RAYOM_META_LINSO_BUSINESS_INSTAGRAM_ACCOUNT_ID':'17841413502844384'}), patch.object(meta_ads,'creator_get',side_effect=[permission,page,{'data':[]}]) as get:
            response=self.client.post('/api/meta/creators/search',json={'organization':'linso','filters':{}})
            self.assertEqual(response.status_code,200)
            self.assertEqual(get.call_args.args[2],'17841413502844384/creator_marketplace_creators')
            self.assertEqual(get.call_args.args[0],'private-page-token')
            self.assertNotIn('private-page-token',response.get_data(as_text=True))

    def test_marketplace_token_error_is_specific_and_does_not_expose_token(self):
        with patch.object(meta_ads.requests,'get',return_value=Mock(ok=False,json=Mock(return_value={'error':{'code':190,'message':'private-token'}}))):
            with self.assertRaisesRegex(RuntimeError, 'Creator Marketplace \\(OAuth 190\\)'):
                meta_ads.creator_get('private-token','v23.0','123/creator_marketplace_creators',{})

    def test_bad_and_unsupported_filters_never_reach_meta(self):
        with patch.object(meta_ads,'creator_get') as get:
            for filters in [{'minFollowers':200,'maxFollowers':100},{'country':'India'},{'gender':'bad'},{'minFollowers':True},{'age':18}]:
                self.assertEqual(self.client.post('/api/meta/creators/search',json={'organization':'rayom','filters':filters}).status_code,400)
            get.assert_not_called()
    def test_unsupported_platform_never_reaches_meta(self):
        with patch.object(meta_ads,'creator_get') as get:
            self.assertEqual(self.client.post('/api/meta/creators/search',json={'organization':'rayom','platform':'YouTube'}).status_code,400)
            get.assert_not_called()
    def test_unavailable_marketplace_does_not_claim_verification_is_pending(self):
        with patch.object(meta_ads.requests,'get',return_value=Mock(ok=False,json=Mock(return_value={'error':{'code':100,'message':'Unknown field'}}))):
            with self.assertRaisesRegex(RuntimeError, 'Instagram Professional account ID'):
                meta_ads.creator_get('private-token','v23.0','123/creator_marketplace_creators',{})

    def test_meta_error_redacts_token(self):
        with patch.object(meta_ads.requests,'get',return_value=Mock(ok=False,json=Mock(return_value={'error':{'message':'Denied private-token'}}))):
            with self.assertRaisesRegex(RuntimeError,r'Denied \[redacted\]'):
                meta_ads.creator_get('private-token','v23.0','me/permissions',{})

if __name__ == '__main__': unittest.main()
