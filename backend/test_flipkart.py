import unittest
from unittest.mock import patch
from flask import Flask
from flipkart import flipkart
import flipkart as integration


class FlipkartTests(unittest.TestCase):
    @patch('flipkart.credentials', return_value=('app', 'secret', 'seller'))
    @patch('flipkart.requests.get')
    def test_auth_failure_does_not_expose_upstream_secrets(self, get, credentials):
        integration._token = None
        integration._expires = 0
        get.return_value.ok = False
        get.return_value.status_code = 401
        get.return_value.json.return_value = {'error': 'invalid_client', 'error_description': 'sensitive-secret'}
        with self.assertRaises(RuntimeError) as context:
            integration.access_token()
        self.assertIn('App ID/App Secret', str(context.exception))
        self.assertNotIn('sensitive-secret', str(context.exception))
        self.assertEqual(get.call_args.kwargs['auth'], ('app', 'secret'))

    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(flipkart)
        self.client = app.test_client()

    @patch('flipkart.credentials', return_value=('app', 'secret', 'rayom-seller'))
    @patch('flipkart.api_post')
    def test_rayom_products_and_pagination(self, api, credentials):
        api.return_value = {'totalListingsCount': 25, 'listingData': [{
            'sellerId': 'rayom-seller', 'sku': 'R1', 'product_name': 'Rayom product',
            'product_description': {'ssp': 100, 'mrp': 120},
        }]}
        response = self.client.post('/api/flipkart/products', json={'batchNo': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['data'][0]['company'], 'Rayom')
        self.assertEqual(response.json['data'][0]['price'], 100)
        self.assertEqual(api.call_args.args[1]['batchNo'], 1)

    @patch('flipkart.credentials', return_value=('app', 'secret', 'rayom-seller'))
    @patch('flipkart.api_post', return_value={'listingData': [{'sellerId': 'another-company'}]})
    def test_other_company_data_is_rejected(self, api, credentials):
        response = self.client.post('/api/flipkart/products', json={})
        self.assertEqual(response.status_code, 502)
        self.assertFalse(response.json['success'])

    @patch('flipkart.credentials', return_value=('app', 'secret', 'seller'))
    @patch('flipkart.api_post')
    def test_invalid_filter_does_not_call_flipkart(self, api, credentials):
        response = self.client.post('/api/flipkart/products', json={'batchNo': -1})
        self.assertEqual(response.status_code, 400)
        api.assert_not_called()


if __name__ == '__main__':
    unittest.main()
