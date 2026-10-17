import unittest
from unittest.mock import patch
import uniware_inventory as uniware


class UniwareTests(unittest.TestCase):
    def test_only_catalog_ean_matches_and_sku_aliases_cannot_add_stock(self):
        stock = {'catalog': [
            {'skuCode': 'CORRECT', 'ean': '8906218300012'},
            {'skuCode': 'WRONG', 'ean': '8906218300036', 'customFieldValues': [
                {'fieldName': 'cocoblu_channel_product', 'fieldValue': 'B0HFVXMLC5'}]}],
            'quantities': {'CORRECT': 14, 'WRONG': 999}}
        result = uniware.match_products([
            {'asin': 'B0HFVXMLC5', 'catalogEans': ['8906218300012', '8906218300012'], 'sellerSku': 'WRONG'},
            {'asin': 'B000000002', 'sellerSku': 'CORRECT'}], stock)
        self.assertEqual(result['B0HFVXMLC5']['quantity'], 14)
        self.assertEqual(result['B0HFVXMLC5']['uniwareSkus'], ['CORRECT'])
        self.assertIsNone(result['B000000002']['quantity'])

    def test_missing_snapshot_is_not_zero(self):
        stock = {'catalog': [{'skuCode': 'SKU', 'ean': '8906218300012'}], 'quantities': {}}
        products = [{'asin': 'X', 'catalogEans': ['8906218300012']}]
        self.assertIsNone(uniware.match_products(products, stock)['X']['quantity'])
        stock['quantities']['SKU'] = 0
        self.assertEqual(uniware.match_products(products, stock)['X']['quantity'], 0)

    def test_multiple_eans_sum_stock_without_duplicate_skus(self):
        stock = {'catalog': [
            {'skuCode': 'WHITE', 'ean': '8906218300012'},
            {'skuCode': 'BLACK', 'ean': '8906218300036'},
            {'skuCode': 'WHITE', 'ean': '8906218300548'}],
            'quantities': {'WHITE': 14, 'BLACK': 39}}
        result = uniware.match_products([{'asin': 'B0HFVXMLC5', 'catalogEans': [
            '8906218300012', '8906218300036', '8906218300012', '8906218300548']}], stock)
        self.assertEqual(result['B0HFVXMLC5']['quantity'], 53)
        self.assertEqual(result['B0HFVXMLC5']['uniwareSkus'], ['BLACK', 'WHITE'])

    def test_facility_is_company_scoped(self):
        with patch.dict('os.environ', {}, clear=True):
            self.assertNotEqual(uniware.facility('shelfesteem'), uniware.facility('rayom'))
            self.assertEqual(uniware.facility('rayom'), uniware.facility('linso'))

    def test_auth_network_errors_hide_credentials(self):
        with patch.dict('os.environ', {'UNIWARE_EMAIL': 'user', 'UNIWARE_PASSWORD': 'secret'}), \
             patch.object(uniware, '_token', None), \
             patch.object(uniware.requests, 'get', side_effect=uniware.requests.ConnectionError('password=secret')):
            with self.assertRaisesRegex(RuntimeError, '^Unable to connect to Uniware.$'):
                uniware._access_token()

    def test_endpoint_resolves_vendor_only_asin_and_caches_identifiers(self):
        import app as integration
        import amazon_vendor
        stock = {'catalog': [{'skuCode': '8901', 'ean': '8906218300012'}], 'quantities': {'8901': 17}, 'facility': 'RAYOM'}
        catalog = {'items': [{'asin': 'B0HFW89379', 'identifiers': [{'marketplaceId': 'A21TJRUUN4KGV', 'identifiers': [
            {'identifierType': 'EAN', 'identifier': '8906218300012'}]}]}]}
        integration.UNIWARE_ASIN_IDENTIFIERS.clear()
        with patch.object(integration, 'validate_account'), patch.object(uniware, 'snapshot', return_value=stock), patch.object(uniware,'sku_vendor_names',return_value={'names':['BALAJI'],'message':''}), \
             patch.object(amazon_vendor, 'account', return_value={'marketplace': 'A21TJRUUN4KGV'}), \
             patch.object(amazon_vendor, 'amazon', return_value=catalog) as search:
            client = integration.app.test_client()
            for unused in range(2):
                result = client.post('/api/amazon/uniware-inventory?organization=linso',
                                     json={'products': [{'asin': 'B0HFW89379', 'catalogEans': ['9999999999999']}]})
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json['inventory']['B0HFW89379']['quantity'], 17)
            self.assertEqual(search.call_count, 1)
        integration.UNIWARE_ASIN_IDENTIFIERS.clear()


if __name__ == '__main__':
    unittest.main()
