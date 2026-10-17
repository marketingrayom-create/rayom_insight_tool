import unittest
import io
from types import SimpleNamespace
from unittest.mock import patch
import app as integration
from console_encoding import configure_console


def listing(index):
    return {'sku': f'SKU{index}', 'summaries': [{'asin': f'ASIN{index}',
            'marketplaceId': 'A21TJRUUN4KGV', 'itemName': f'Product {index}'}],
            'fulfillmentAvailability': [{'fulfillmentChannelCode': 'DEFAULT', 'quantity': 0}]}


class CatalogTests(unittest.TestCase):
    def test_brand_summary_all_windows_include_vendor_only_products(self):
        periods = {str(d): dict(complete=d != 30) for d in (1, 7, 15, 30)}
        sales = {asin: {str(d): dict(orderedUnits=units * d, orderedRevenue=revenue * d, brand='LINSO' if asin == 'A' else None)
                       for d in (1, 7, 15, 30)} for asin, units, revenue in [('A', 2, 100), ('B', 1, 50)]}
        with patch.object(integration, 'validate_account'), patch.object(integration, 'product_sales_periods', return_value=(sales, periods)), \
             patch.object(integration, 'cb_product_inventory', return_value={'A': dict(units=5, brand='LINSO')}):
            result = integration.app.test_client().post('/api/amazon/brand-sales-summary?organization=linso', json={}).json
        self.assertEqual(len(result['data']), 1)
        row = result['data'][0]
        self.assertEqual(row['brand'], 'LINSO')
        for days in (1, 7, 15):
            self.assertEqual(row[f'drr{days}d'], 3)
            self.assertEqual(row[f'revenue{days}d'], 150 * days)
        self.assertIsNone(row['revenue30d'])
        self.assertIsNone(result['overall']['drr30d'])
        self.assertEqual(result['overall']['revenue1d'], 150)
        self.assertTrue(result['metadata']['salesRefreshing'])

    def test_linso_includes_revenue_asin_missing_from_inventory(self):
        periods={str(days):dict(start='2026-10-13',end='2026-10-13',complete=True) for days in (1,7,15,30)}
        sales={'B0HLRZ7D4J':{'1':dict(orderedUnits=1,orderedRevenue=683.05,productTitle='Replacement Filter for HUSH',brand='LINSO')}}
        with patch.object(integration,'validate_account'),patch.object(integration,'build_products',return_value=[]),patch.object(integration,'cb_product_inventory',return_value={'A':dict(units=2)}),patch.object(integration,'product_sales_periods',return_value=(sales,periods)),patch.object(integration,'refresh_product_sales'):
            result=integration.app.test_client().post('/api/amazon/products?organization=linso',json={}).json
            self.assertEqual(result['total'],2)
            row=next(row for row in result['products'] if row['asin']=='B0HLRZ7D4J')
            self.assertEqual(row['revenue_1d'],683.05)
            self.assertEqual(row['drr_1d'],1)
            self.assertEqual(row['itemTitle'],'Replacement Filter for HUSH')
            self.assertIsNone(row['vendorInventory'])
    def setUp(self):
        refresh=patch.object(integration,'refresh_product_sales');refresh.start();self.addCleanup(refresh.stop)
        for name in ('build_products', 'inventory_map', 'seller_listing_items'):
            getattr(integration, name).cache_clear()

    def test_product_details_join_cb_vendor_units_without_changing_seller_stock(self):
        seller=[dict(asin='A',sellerSku='SKU1',fbaAvailable=7),dict(asin='A',sellerSku='SKU2',fbaAvailable=3),dict(asin='B',fbaAvailable=9)]
        with patch.object(integration,'validate_account'),patch.object(integration,'build_products',return_value=seller),patch.object(integration,'cb_product_inventory',return_value={'A':dict(units=0,asOf='2026-10-09')}) as vendor,patch.object(integration,'sales_refresh_pending',return_value=False):
            client=integration.app.test_client()
            result=client.post('/api/amazon/products?organization=rayom',json={'sortBy':'asin','sortOrder':'asc'}).json
            self.assertTrue(result['success'])
            self.assertEqual([row['vendorInventory'] for row in result['products']],[0,0,None])
            self.assertEqual([row['fbaAvailable'] for row in result['products']],[7,3,9])
            other=client.post('/api/amazon/products?organization=shelfesteem',json={}).json
            self.assertTrue(all(row['vendorInventory'] is None for row in other['products']))
            self.assertEqual(vendor.call_count,1)
            self.assertNotIn('vendorInventory',seller[0])

    def test_product_details_hide_chinese_skus_and_add_vendor_fbm_fba_total(self):
        seller=[dict(asin='B0C5DKGG2J',sellerSku='UE10101PQ_LR (印度用)',fbmAvailable=99,fbaAvailable=99),dict(asin='B0C5DKGG2J',sellerSku='UE10101PQ_LR',fbmAvailable=10,fbaAvailable=20,totalInventory=30),dict(asin='B',sellerSku='SKU-B',fbmAvailable=0,fbaAvailable=5)]
        with patch.object(integration,'validate_account'),patch.object(integration,'build_products',return_value=seller),patch.object(integration,'cb_product_inventory',return_value={'B0C5DKGG2J':dict(units=7,asOf='2026-10-10')}),patch.object(integration,'sales_refresh_pending',return_value=False):
            result=integration.app.test_client().post('/api/amazon/products?organization=rayom',json={'sortBy':'combinedInventory','sortOrder':'desc','limit':1}).json
            self.assertEqual(result['total'],2)
            self.assertEqual(result['products'][0]['sellerSku'],'UE10101PQ_LR')
            self.assertEqual(result['products'][0]['combinedInventory'],37)
            self.assertEqual(result['products'][0]['totalInventory'],30)

    def test_linso_products_use_mvr_vendor_stock(self):
        with patch.object(integration,'validate_account'),patch.object(integration,'build_products',return_value=[dict(asin='A',fbmAvailable=2,fbaAvailable=3)]),patch.object(integration,'cb_product_inventory',return_value={'A':dict(units=4,asOf='2026-10-10')}) as vendor,patch.object(integration,'sales_refresh_pending',return_value=False):
            result=integration.app.test_client().post('/api/amazon/products?organization=linso',json={}).json
            self.assertEqual(result['products'][0]['combinedInventory'],9)
            vendor.assert_called_once_with('mvr')

    def test_linso_shows_only_common_mvr_seller_asins_with_mvr_revenue(self):
        seller=[dict(asin='L'+str(i),fbmAvailable=1,fbaAvailable=2,finalPrice=125) for i in range(7)]
        stock={'L'+str(i):dict(units=0 if i==0 else 10,asOf='2026-10-13') for i in range(6)}
        periods={str(days):dict(start='2026-10-13',end='2026-10-13',complete=True) for days in (1,7,15,30)}
        with patch.object(integration,'validate_account'),patch.object(integration,'build_products',return_value=seller),patch.object(integration,'cb_product_inventory',return_value=stock),patch.object(integration,'product_sales_periods',return_value=({'L0':{'1':{'orderedUnits':2,'orderedRevenue':250}}},periods)) as sales:
            result=integration.app.test_client().post('/api/amazon/products?organization=linso',json={'sortBy':'asin','sortOrder':'asc'}).json
            self.assertEqual(result['total'],6)
            self.assertEqual({row['asin'] for row in result['products']},set(stock))
            self.assertEqual(result['products'][0]['vendorInventory'],0)
            self.assertEqual(result['products'][0]['drr_1d'],2)
            self.assertEqual(result['products'][0]['revenue_1d'],250)
            self.assertEqual(result['products'][1]['drr_1d'],0)
            sales.assert_called_once_with('mvr',include_units=True)

    def test_linso_includes_all_six_mvr_asins_when_only_three_are_seller_listed(self):
        stock={'L'+str(i):dict(units=10+i,asOf='2026-10-13',productTitle='Linso '+str(i),brand='LINSO') for i in range(6)}
        seller=[dict(asin='L'+str(i),fbmAvailable=1,fbaAvailable=2) for i in range(3)]
        periods={str(days):dict(start='2026-10-13',end='2026-10-13',complete=True) for days in (1,7,15,30)}
        with patch.object(integration,'validate_account'),patch.object(integration,'build_products',return_value=seller),patch.object(integration,'cb_product_inventory',return_value=stock),patch.object(integration,'product_sales_periods',return_value=({'L3':{'1':{'orderedUnits':1,'orderedRevenue':99}}},periods)):
            result=integration.app.test_client().post('/api/amazon/products?organization=linso',json={'sortBy':'asin','sortOrder':'asc'}).json
            self.assertEqual(result['total'],6)
            rows={row['asin']:row for row in result['products']}
            self.assertEqual(rows['L3']['itemTitle'],'Linso 3')
            self.assertTrue(rows['L3']['vendorOnly'])
            self.assertIsNone(rows['L3']['fbmAvailable'])
            self.assertIsNone(rows['L3']['fbaAvailable'])
            self.assertIsNone(rows['L3']['finalPrice'])
            self.assertEqual(rows['L3']['vendorInventory'],13)
            self.assertEqual(rows['L3']['drr_1d'],1)

    def test_revenue_uses_vendor_ordered_revenue_and_drr_is_units_per_day(self):
        periods={str(days):dict(start='2026-10-07',end='2026-10-13',complete=True) for days in (1,7,15,30)}
        seller=[dict(asin='A',finalPrice=100,fbmAvailable=1,fbaAvailable=2)]
        metrics={'A':{'1':{'orderedUnits':-1,'orderedRevenue':-999},'7':{'orderedUnits':14,'orderedRevenue':9999}}}
        with patch.object(integration,'validate_account'),patch.object(integration,'build_products',return_value=seller),patch.object(integration,'cb_product_inventory',return_value={'A':dict(units=4)}),patch.object(integration,'product_sales_periods',return_value=(metrics,periods)):
            row=integration.app.test_client().post('/api/amazon/products?organization=linso',json={}).json['products'][0]
            self.assertEqual(row['revenue_7d'],9999)
            self.assertEqual(row['drr_7d'],2)
            self.assertEqual(row['vendorOrderedUnits7d'],14)
            self.assertEqual(row['revenue_1d'],-999)
            self.assertEqual(row['drr_1d'],-1)
            self.assertEqual(row['fbmAvailable'],1)

    def test_parallel_sources_keep_selected_company_context(self):
        from amazon_accounts import organization
        observed = []
        def source(value):
            def load():
                observed.append(organization())
                return value
            return load
        with integration.app.test_request_context('/api/amazon/products?organization=rayom'), \
             patch.object(integration, 'ensure_credentials'), \
             patch.object(integration, 'inventory_map', side_effect=source({})), \
             patch.object(integration, 'seller_listing_items', side_effect=source({})), \
             patch.object(integration, 'sales_report', side_effect=source({})), \
             patch.object(integration, 'amazon_brand_sales', side_effect=source({})), \
             patch.object(integration, 'ListingsItems'):
            integration.build_products()
        self.assertEqual(observed, ['rayom'] * 4)

    def test_nineteen_skus_sharing_twelve_asins_are_kept(self):
        catalog = {}
        for index in range(19):
            item = listing(index)
            asin = f'ASIN{index % 12}'
            item['summaries'][0]['asin'] = asin
            catalog.setdefault(asin, []).append(item)
        with patch.object(integration, 'ensure_credentials'), \
             patch.object(integration, 'inventory_map', return_value={}), \
             patch.object(integration, 'seller_listing_items', return_value=catalog), \
             patch.object(integration, 'ListingsItems'), \
             patch.object(integration, 'sales_report', return_value={}), \
             patch.object(integration, 'amazon_brand_sales', return_value={}):
            products = integration.build_products(listing_rows=True)
            summary_products = integration.build_products()
        self.assertEqual(len(products), 19)
        self.assertEqual(len({row['productId'] for row in products}), 19)
        self.assertEqual(len({row['sellerSku'] for row in products}), 19)
        self.assertEqual(len(summary_products), 12)
        self.assertTrue(all(row['totalInventory'] == 0 for row in products))

    def test_windows_console_can_log_unicode_product_titles(self):
        buffer = io.BytesIO()
        stream = io.TextIOWrapper(buffer, encoding='cp1252')
        with patch('sys.stdout', stream), patch('sys.stderr', stream):
            configure_console()
            print('Product: नमस्ते ™ 🌿')
            stream.flush()
        self.assertIn('नमस्ते ™ 🌿', buffer.getvalue().decode('utf-8'))

    def test_all_pages_and_zero_stock_listings(self):
        client = unittest.mock.Mock()
        client.search_listings_items.side_effect = [
            {'items': [listing(i) for i in range(10)], 'pagination': {'nextToken': 'page2'}},
            {'items': [listing(i) for i in range(10, 19)]},
        ]
        with patch.object(integration, 'ListingsItems', return_value=client):
            catalog = integration.seller_listing_items()
            self.assertEqual(len(catalog), 19)
            self.assertEqual(client.search_listings_items.call_args.kwargs['pageToken'], 'page2')
            client.search_listings_items.reset_mock()
            rows = integration.listing_map(list(catalog), {}, catalog)
            self.assertEqual(len(rows), 19)
            self.assertEqual(rows['ASIN18']['title'], 'Product 18')
            client.search_listings_items.assert_not_called()

    def test_catalog_products_without_inventory_or_sales(self):
        catalog = {f'ASIN{i}': [listing(i)] for i in range(19)}
        with patch.object(integration, 'ensure_credentials'), \
             patch.object(integration, 'inventory_map', return_value={'ASIN0': {}}), \
             patch.object(integration, 'seller_listing_items', return_value=catalog), \
             patch.object(integration, 'ListingsItems'), \
             patch.object(integration, 'sales_report', return_value={}), \
             patch.object(integration, 'amazon_brand_sales', return_value={}):
            products = integration.build_products()
        self.assertEqual(len(products), 19)
        self.assertEqual(products[-1]['itemTitle'], 'Product 18')

    def test_inventory_pagination(self):
        client = unittest.mock.Mock()
        client.get_inventory_summary_marketplace.side_effect = [
            SimpleNamespace(payload={'inventorySummaries': [{'asin': 'A'}]}, pagination={'nextToken': 'next'}),
            SimpleNamespace(payload={'inventorySummaries': [{'asin': 'B'}]}, pagination={}),
        ]
        with patch.object(integration, 'Inventories', return_value=client):
            self.assertEqual(set(integration.inventory_map()), {'A', 'B'})
        self.assertEqual(client.get_inventory_summary_marketplace.call_args.kwargs['nextToken'], 'next')


if __name__ == '__main__':
    unittest.main()
