import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from shopify_reporting import summarize, inventory_rows, all_pages, load_inventory, validate_filters, filter_dashboard


class ReportingTests(unittest.TestCase):
    def test_filters_select_server_metric_without_mutating_cached_report(self):
        report = {'brands': [{'brand': 'A', 'revenue7d': 10, 'units7d': 2, 'drr90d': None}],
                  'products': [{'title': 'Cleanser', 'vendor': 'A', 'id': '1', 'totalInventory': 50, 'revenue1d': 5},
                               {'title': 'Serum', 'vendor': 'A', 'id': '2', 'totalInventory': 20, 'revenue1d': 10}]}
        filters = validate_filters({'brand': {'metric': 'DRR', 'days': 90}, 'product': {'search': 'cleanser'}})
        result = filter_dashboard(report, filters)
        self.assertEqual(len(result['products']), 1)
        self.assertEqual(result['products'][0]['selectedMetric'], 5)
        self.assertIsNone(result['brands'][0]['selectedMetric'])
        self.assertEqual(result['overview']['inventory'], 70)
        self.assertEqual(len(report['products']), 2)
        self.assertNotIn('selectedMetric', report['products'][0])
        with self.assertRaises(ValueError):
            validate_filters({'brand': {'days': 100}})

    @patch('shopify_reporting.graphql')
    def test_inventory_sku_priority_includes_later_api_pages(self, graphql):
        def variant(identifier, sku):
            return {'id': identifier, 'title': 'Default', 'sku': sku,
                    'product': {'title': identifier, 'vendor': 'Brand'},
                    'inventoryItem': {'id': identifier, 'tracked': True, 'inventoryLevels': {
                        'nodes': [], 'pageInfo': {'hasNextPage': False}}}}
        graphql.side_effect = [
            {'shop': {'name': 'Store'}, 'productVariants': {'nodes': [variant('first', '')],
                'pageInfo': {'hasNextPage': True, 'endCursor': 'next'}}},
            {'productVariants': {'nodes': [variant('second', 'SKU-2')],
                'pageInfo': {'hasNextPage': False}}},
        ]
        result = load_inventory(None, '', all_rows=True)
        self.assertEqual([row['sku'] for row in result['data']], ['SKU-2', 'No SKU'])
        self.assertFalse(result['pageInfo']['hasNextPage'])

    def test_sales_windows_refunds_cancellations_and_zero_sales_products(self):
        now = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
        products = [{'id': 'p1', 'title': 'Cleanser', 'vendor': 'Unfooled', 'totalInventory': 50},
                    {'id': 'p2', 'title': 'Unsold', 'vendor': 'Unfooled', 'totalInventory': 10}]
        def order(days, qty, cancelled=False, test=False):
            return {'createdAt': (now - timedelta(days=days)).isoformat(),
                    'cancelledAt': 'cancelled' if cancelled else None, 'test': test,
                    'items': [{'title': 'Cleanser', 'vendor': 'Unfooled', 'product': {'id': 'p1'},
                        'currentQuantity': qty, 'quantity': 5,
                        'discountedUnitPriceAfterAllDiscountsSet': {'shopMoney': {'amount': '12.50', 'currencyCode': 'INR'}}}]}
        report = summarize(products, [order(0.5, 2), order(8, 3), order(40, 4), order(0.2, 5, True), order(0.3, 5, test=True)], now, 59, 'INR')
        brand = report['brands'][0]
        self.assertEqual(brand['revenue7d'], 25)
        self.assertEqual(brand['revenue30d'], 62.5)
        self.assertEqual(brand['drr1d'], 2)
        self.assertEqual(brand['totalInventory'], 60)
        self.assertIsNone(brand['revenue90d'])
        self.assertEqual(report['productSales'][1]['revenue7d'], 0)
        self.assertEqual(sum(row['revenue'] for row in report['daily']), 62.5)

    def test_ninety_day_revenue_and_currency_check(self):
        now = datetime.now(timezone.utc)
        line = {'title': 'Deleted', 'vendor': 'Brand', 'currentQuantity': 1,
                'discountedUnitPriceAfterAllDiscountsSet': {'shopMoney': {'amount': '10', 'currencyCode': 'INR'}}}
        orders = [{'createdAt': (now - timedelta(days=70)).isoformat(), 'items': [line]}]
        report = summarize([], orders, now, 90, 'INR')
        self.assertEqual(report['brands'][0]['revenue90d'], 10)
        self.assertEqual(report['brands'][0]['revenue30d'], 0)
        with self.assertRaises(RuntimeError):
            summarize([], orders, now, 90, 'USD')

    @patch('shopify_reporting.graphql')
    def test_every_connection_page_is_loaded(self, graphql):
        graphql.side_effect = [
            {'products': {'nodes': [{'id': 'a'}], 'pageInfo': {'hasNextPage': True, 'endCursor': 'c'}}},
            {'products': {'nodes': [{'id': 'b'}], 'pageInfo': {'hasNextPage': False, 'endCursor': 'd'}}},
        ]
        self.assertEqual(list(all_pages('query', 'products')), [{'id': 'a'}, {'id': 'b'}])
        self.assertEqual(graphql.call_args.args[1]['after'], 'c')

    @patch('shopify_reporting.graphql')
    def test_nested_line_item_connection_continues_after_initial_page(self, graphql):
        initial = {'nodes': [{'id': 'first'}], 'pageInfo': {'hasNextPage': True, 'endCursor': 'line-cursor'}}
        graphql.return_value = {'order': {'lineItems': {'nodes': [{'id': 'second'}], 'pageInfo': {'hasNextPage': False}}}}
        rows = list(all_pages('query', 'lineItems', {'id': 'order-id'}, 'order', initial))
        self.assertEqual([row['id'] for row in rows], ['first', 'second'])
        self.assertEqual(graphql.call_args.args[1], {'id': 'order-id', 'after': 'line-cursor'})

    @patch('shopify_reporting.graphql')
    def test_repeated_cursor_fails_instead_of_partial_success(self, graphql):
        graphql.return_value = {'products': {'nodes': [], 'pageInfo': {'hasNextPage': True, 'endCursor': 'same'}}}
        with self.assertRaises(RuntimeError):
            list(all_pages('query', 'products'))

    def test_inventory_unavailable_is_not_committed(self):
        variant = {'id': 'v1', 'title': 'Default Title', 'sku': '',
                   'product': {'title': 'Cleanser', 'vendor': 'Brand'},
                   'inventoryItem': {'id': 'i1', 'tracked': True, 'inventoryLevels': {
                       'nodes': [{'id': 'l1', 'location': {'name': 'Warehouse'}, 'quantities': [
                           {'name': 'on_hand', 'quantity': 50}, {'name': 'available', 'quantity': 40},
                           {'name': 'committed', 'quantity': 7}, {'name': 'incoming', 'quantity': 5}]}],
                       'pageInfo': {'hasNextPage': False, 'endCursor': None}}}}
        row = inventory_rows([variant])[0]
        self.assertEqual(row['unavailable'], 3)
        self.assertEqual(row['committed'], 7)
        self.assertEqual(row['sku'], 'No SKU')
        self.assertEqual(row['location'], 'Warehouse')


if __name__ == '__main__':
    unittest.main()
