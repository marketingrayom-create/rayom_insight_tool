import unittest
from unittest.mock import patch
import uniware_inventory as module

class UniwareVendorTests(unittest.TestCase):
    def setUp(self):
        module._vendor_cache.clear()
        self.addCleanup(module._vendor_cache.clear)
    def test_enabled_vendor_mapping_and_facility_scoped_cache(self):
        def api(path,body,warehouse):
            return {'itemTypeDTO':{'skuCode':body['itemSKU'],'vendorItemTypes':[
                {'vendorEnabled':True,'vendorName':warehouse+' vendor'},
                {'vendorEnabled':False,'vendorName':'Disabled'}]}}
        with patch.object(module,'_post',side_effect=api) as request:
            self.assertEqual(module.sku_vendor_names('SKU','RAYOM')['names'],['RAYOM vendor'])
            module.sku_vendor_names('SKU','RAYOM')
            self.assertEqual(module.sku_vendor_names('SKU','SHELF')['names'],['SHELF vendor'])
            self.assertEqual(request.call_count,2)
    def test_vendor_lookup_failure_does_not_erase_inventory(self):
        output={'A':{'quantity':0,'uniwareSkus':['SKU']}}
        with patch.object(module,'_post',side_effect=RuntimeError('unavailable')):
            result=module.enrich_vendor_names(output,{'facility':'RAYOM'})
        self.assertEqual(result['A']['quantity'],0)
        self.assertIsNone(result['A']['vendorName'])
        self.assertIn('unavailable',result['A']['vendorMessage'])
    def test_wrong_sku_cannot_supply_vendor_name(self):
        with patch.object(module,'_post',return_value={'itemTypeDTO':{'skuCode':'WRONG','vendorItemTypes':[{'vendorEnabled':True,'vendorName':'Wrong vendor'}]}}):
            self.assertEqual(module.sku_vendor_names('SKU','RAYOM')['names'],[])

if __name__=='__main__':unittest.main()
