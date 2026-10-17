import os
import unittest
from unittest.mock import patch
from flask import Flask
from amazon_accounts import account_cache, account_value, validate_account


class AmazonAccountsTests(unittest.TestCase):
    def test_linso_has_own_credentials_and_cache(self):
        values={'AMAZON_LINSO_SP_API_CLIENT_ID':'linso-client','AMAZON_LINSO_SP_API_CLIENT_SECRET':'linso-secret','AMAZON_LINSO_SP_API_REFRESH_TOKEN':'linso-token','AMAZON_LINSO_MERCHANT_ID':'linso-seller'}
        cache=account_cache('three-companies',{'data':[]})
        with patch.dict(os.environ,values),self.app.test_request_context('/?organization=linso'):
            validate_account()
            self.assertEqual(account_value('CLIENT_ID'),'linso-client')
            self.assertEqual(account_value('REFRESH_TOKEN'),'linso-token')
            cache['data'].append('linso')
        with self.app.test_request_context('/?organization=rayom'):
            self.assertEqual(cache['data'],[])

    def test_existing_linso_env_spellings_are_supported(self):
        with patch.dict(os.environ,{'AMAZON_LINSO_SP_API_CLIENT_ID':'client','AMAZON_LINSO_SP_CLIENT_SECRET':'secret','AMAZON_LINSO_REFRESH_TOKEN':'token','AMAZON_LINSO_MARCHENT_ID':'seller'}),self.app.test_request_context('/?organization=linso'):
            validate_account()
            self.assertEqual(account_value('CLIENT_SECRET'),'secret')
            self.assertEqual(account_value('REFRESH_TOKEN'),'token')
            self.assertEqual(account_value('MERCHANT_ID'),'seller')
    def setUp(self):
        self.app = Flask(__name__)
        self.env = patch.dict(os.environ, {
            "AMAZON_SP_API_CLIENT_ID": "shelf-client",
            "AMAZON_SP_API_CLIENT_SECRET": "shelf-secret",
            "AMAZON_SP_API_REFRESH_TOKEN": "shelf-token",
            "AMAZON_MERCHANT_ID": "shelf-seller",
            "AMAZON_RAYOM_SP_API_CLIENT_ID": "ray-client",
            "AMAZON_RAYOM_SP_API_CLIENT_SECRET": "ray-secret",
            "AMAZON_RAYOM_MARCHENT_ID": "ray-seller",
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_rayom_requires_own_refresh_token(self):
        with self.app.test_request_context('/?organization=rayom'):
            self.assertEqual(account_value('MERCHANT_ID'), 'ray-seller')
            self.assertEqual(account_value('CLIENT_ID'), 'ray-client')
            with self.assertRaisesRegex(RuntimeError, 'AMAZON_RAYOM_SP_API_REFRESH_TOKEN'):
                validate_account()

    def test_nested_requests_preserve_account_and_cache(self):
        cache = account_cache('test', {'data': []})
        with self.app.test_request_context('/'):
            validate_account()
            cache['data'].append('shelf-data')
            with self.app.test_request_context('/?organization=rayom'):
                self.assertEqual(cache['data'], [])
                cache['data'].append('ray-data')
                self.assertEqual(account_value('CLIENT_ID'), 'ray-client')
            self.assertEqual(cache['data'], ['shelf-data'])
            self.assertEqual(account_value('CLIENT_ID'), 'shelf-client')
        with self.app.test_request_context('/?organization=rayom'):
            self.assertEqual(cache['data'], ['ray-data'])

    def test_valid_rayom_and_invalid_company(self):
        with patch.dict(os.environ, {'AMAZON_RAYOM_SP_API_REFRESH_TOKEN': 'ray-token'}):
            with self.app.test_request_context('/?organization=rayom'):
                validate_account()
                self.assertEqual(account_value('REFRESH_TOKEN'), 'ray-token')
        with self.app.test_request_context('/?organization=unknown'):
            with self.assertRaises(ValueError):
                validate_account()


if __name__ == '__main__':
    unittest.main()
