import unittest
from unittest.mock import Mock, patch
import fulfillment_orders as fulfillment
from flask import Flask


class FulfillmentPaginationTests(unittest.TestCase):
    def test_quota_cooldown_covers_filter_changes_and_returns_retry_after(self):
        app = Flask(__name__)
        fulfillment.register_fulfillment_routes(app, lambda: {})
        client = app.test_client()
        with patch.object(fulfillment, 'fetch_fulfillment_orders', side_effect=RuntimeError('QuotaExceeded')) as fetch, patch.object(fulfillment.threading, 'Thread') as thread:
            first = client.post('/api/amazon/fulfillment-orders?organization=linso', json={})
            self.assertTrue(first.json['ordersRefreshing'])
            thread.call_args.kwargs['target']()
            second = client.post('/api/amazon/fulfillment-orders?organization=linso', json={'days':30})
            self.assertEqual(second.status_code, 429)
            self.assertGreater(int(second.headers['Retry-After']), 0)
            self.assertNotIn('details', second.json['error'])
            self.assertEqual(fetch.call_count, 1)

    def test_background_quota_retry_waits_before_retrying(self):
        operation = Mock(side_effect=[RuntimeError('QuotaExceeded'), 'ready'])
        with patch.object(fulfillment.time, 'sleep') as sleep:
            result = fulfillment._call_with_retry(operation, retries=1, base_delay=60)
        self.assertEqual(result, 'ready')
        sleep.assert_called_once_with(60)

    def test_list_returns_before_items_and_reuses_cache_with_company_isolation(self):
        app = Flask(__name__)
        fulfillment.register_fulfillment_routes(app, lambda: {'refresh_token': 'test'})
        client = app.test_client()
        header = {'success': True, 'orders': [{'orderId': 'one', 'items': []}]}
        with patch.object(fulfillment, 'fetch_fulfillment_orders', return_value=header) as fetch, patch.object(fulfillment.threading, 'Thread') as thread:
            first = client.post('/api/amazon/fulfillment-orders?organization=linso', json={}).json
            self.assertTrue(first['ordersRefreshing'])
            fetch.assert_not_called()
            client.post('/api/amazon/fulfillment-orders?organization=linso', json={})
            self.assertEqual(thread.call_count, 1)
            target = thread.call_args.kwargs['target']
            with patch.object(fulfillment, 'Orders'), patch.object(fulfillment, 'fetch_order_items', return_value=[{'ASIN':'A','QuantityOrdered':2}]):
                target()
            self.assertFalse(fetch.call_args.kwargs['include_items'])
            complete = client.post('/api/amazon/fulfillment-orders?organization=linso', json={}).json
            self.assertFalse(complete['itemsRefreshing'])
            self.assertEqual(complete['orders'][0]['items'][0]['asin'], 'A')
            self.assertEqual(complete['orders'][0]['totalUnits'], 2)
            client.post('/api/amazon/fulfillment-orders?organization=rayom', json={})
            self.assertEqual(thread.call_count, 2)

    def test_orders_follow_next_token_using_installed_sdk_method(self):
        client = Mock(spec=['get_orders'])
        client.get_orders.side_effect = [
            {'Orders': [{'AmazonOrderId': 'one'}], 'NextToken': 'page-two'},
            RuntimeError('QuotaExceeded'),
            {'Orders': [{'AmazonOrderId': 'two'}]},
        ]
        progress = Mock()
        with patch.object(fulfillment, 'Orders', return_value=client), patch.object(fulfillment.time, 'sleep'), patch.object(fulfillment, 'order_api_call', side_effect=lambda operation, fn, credentials, *args, **kwargs: fn(*args, **kwargs)):
            result = fulfillment.fetch_fulfillment_orders(lambda: {}, include_items=False, on_page=progress)
        self.assertEqual([row['orderId'] for row in result['orders']], ['one', 'two'])
        self.assertEqual(client.get_orders.call_args.kwargs, {'NextToken': 'page-two'})
        self.assertEqual(client.get_orders.call_args_list[1].kwargs, {'NextToken': 'page-two'})
        self.assertEqual(progress.call_args_list[0].args[0][0]['orderId'], 'one')

    def test_item_pagination_preserves_order_id(self):
        client = Mock(spec=['get_order_items'])
        client.get_order_items.side_effect = [
            {'OrderItems': [{'ASIN': 'one'}], 'NextToken': 'items-two'},
            {'OrderItems': [{'ASIN': 'two'}]},
        ]
        with patch.object(fulfillment.time, 'sleep'):
            items = fulfillment.fetch_order_items(client, 'order-one')
        self.assertEqual(len(items), 2)
        client.get_order_items.assert_called_with('order-one', NextToken='items-two')
