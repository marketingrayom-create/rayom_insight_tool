import os
import unittest
from unittest.mock import patch
from flask import Flask
import shopify as integration


class ShopifyTests(unittest.TestCase):
    @patch.dict(os.environ, {'SHOPIFY_SHOP': 'unfooled.myshopify.com', 'SHOPIFY_ACCESS_TOKEN': 'shelf-token',
                             'SHOPIFY_SHOP_RAYOM': 'rayom.myshopify.com', 'SHOPIFY_ACCESS_TOKEN_RAYOM': 'ray-token'})
    def test_organization_selects_own_credentials(self):
        from flask import g
        with self.client.application.test_request_context():
            g.shopify_organization = 'shelfesteem'
            self.assertEqual(integration.configuration()[0::3], ('unfooled.myshopify.com', 'shelf-token'))
            g.shopify_organization = 'rayom'
            self.assertEqual(integration.configuration()[0::3], ('rayom.myshopify.com', 'ray-token'))

    @patch('shopify.configuration', return_value=('demo.myshopify.com', 'client', 'secret', 'token'))
    @patch('shopify.requests.post')
    def test_optional_publications_denial_retries_without_field(self, post, config):
        post.return_value.ok = True
        post.return_value.status_code = 200
        post.return_value.json.side_effect = [
            {'errors': [{'extensions': {'code': 'ACCESS_DENIED'}, 'path': ['products', 'nodes', 0, 'resourcePublicationsCount']}]},
            {'data': {'products': {'nodes': [{'id': 'p1'}]}}},
        ]
        result = integration.graphql(integration.PRODUCTS, {})
        self.assertEqual(result['products']['nodes'][0]['id'], 'p1')
        self.assertNotIn('resourcePublicationsCount', post.call_args.kwargs['json']['query'])

    @patch('shopify.graphql')
    def test_unknown_organization_rejected(self, graphql):
        response = self.client.post('/api/shopify/products', json={'organization': 'other'})
        self.assertEqual(response.status_code, 400)
        graphql.assert_not_called()

    @patch('shopify.graphql')
    def test_abandoned_checkouts_use_own_connection_and_all_pages(self, graphql):
        graphql.side_effect = [
            {'shop': {'name': 'Store'}, 'abandonedCheckouts': {'nodes': [{'id': 'c1', 'completedAt': None}],
                'pageInfo': {'hasNextPage': True, 'endCursor': 'next'}}},
            {'abandonedCheckouts': {'nodes': [{'id': 'c2', 'completedAt': '2026-10-01'}],
                'pageInfo': {'hasNextPage': False}}},
        ]
        with patch('shopify_reporting.graphql', graphql):
            response = self.client.post('/api/shopify/abandoned-checkouts', json={'allRows': True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.json['data']], ['c1', 'c2'])
        self.assertIn('abandonedCheckouts', graphql.call_args.args[0])
        self.assertEqual(graphql.call_args.args[1]['after'], 'next')

    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(integration.shopify)
        self.client = app.test_client()

    @patch('shopify.graphql')
    def test_company_and_cursor_from_store(self, graphql):
        graphql.return_value = {'shop': {'name': 'Real Store'}, 'products': {
            'nodes': [{'id': 'p1', 'title': 'Product'}],
            'pageInfo': {'hasNextPage': True, 'endCursor': 'next'},
        }}
        response = self.client.post('/api/shopify/products', json={'after': 'previous'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['company'], 'Real Store')
        self.assertEqual(response.json['pageInfo']['endCursor'], 'next')
        self.assertEqual(graphql.call_args.args[1]['after'], 'previous')

    @patch('shopify.graphql')
    def test_invalid_cursor_does_not_request_shopify(self, graphql):
        response = self.client.post('/api/shopify/orders', json={'after': 15})
        self.assertEqual(response.status_code, 400)
        graphql.assert_not_called()

    @patch.dict(os.environ, {'SHOPIFY_SHOP': 'https://untrusted.example', 'SHOPIFY_ACCESS_TOKEN': 'secret'})
    def test_shop_host_is_restricted(self):
        with self.assertRaises(ValueError):
            integration.configuration()

    @patch('shopify.configuration', return_value=('demo.myshopify.com', 'client', 'secret', ''))
    @patch('shopify.requests.post')
    def test_token_cached_and_secret_never_returned(self, post, config):
        integration._tokens.clear()
        post.return_value.ok = True
        post.return_value.json.return_value = {'access_token': 'token', 'expires_in': 86400}
        self.assertEqual(integration.access_token(), 'token')
        self.assertEqual(integration.access_token(), 'token')
        self.assertEqual(post.call_count, 1)
        self.assertEqual(post.call_args.kwargs['data']['grant_type'], 'client_credentials')
        integration._tokens.clear()

    @patch('shopify.configuration', return_value=('demo.myshopify.com', 'client', 'secret', 'token'))
    @patch('shopify.requests.post')
    def test_permission_error_does_not_become_empty_data(self, post, config):
        post.return_value.ok = True
        post.return_value.status_code = 200
        post.return_value.json.return_value = {'errors': [{'extensions': {'code': 'ACCESS_DENIED'}}]}
        response = self.client.post('/api/shopify/orders', json={})
        self.assertEqual(response.status_code, 502)
        self.assertIn('Required access', response.json['error'])


if __name__ == '__main__':
    unittest.main()
