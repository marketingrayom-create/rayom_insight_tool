import unittest
from unittest.mock import patch
import vendor_reorder as module

class VendorReorderTests(unittest.TestCase):
    def setUp(self):
        saved=patch('confirmed_open_po.snapshot',return_value={'quantities':{},'asOf':'2026-10-17T00:00:00Z'})
        saved.start();self.addCleanup(saved.stop)
    def test_transit_filters_date_marketplace_and_preserves_zero(self):
        item={'groupByKey':{'asin':'B000000001','ean':'8906218300012'},'metrics':{'productAvailability':{'sellableInTransitInventory':0}}}
        data=[{'marketplaceId':'IN','endDate':'2026-10-15','metrics':[item]},
              {'marketplaceId':'OTHER','endDate':'2026-10-15','metrics':[dict(item,groupByKey={'asin':'WRONG'})]}]
        rows=module.parse_transit(data,'IN','2026-10-15')
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['vcInTransit'],0)
    def test_live_asin_scope_and_incomplete_45_day_sales_never_become_partial_totals(self):
        inventory={'status':'DONE','rows':[{'asin':'B000000001','endDate':'2026-10-15','sellableOnHandInventoryUnits':40,'openPurchaseOrderUnits':0}]}
        def report(key):
            return (inventory,False) if key[1].startswith('inventory') else ({'status':'IN_PROGRESS','rows':[{'asin':'B000000001','startDate':'2026-10-15','endDate':'2026-10-15','orderedUnits':99}]},False)
        with patch.object(module.vendor,'inventory_latest_date',return_value='2026-10-15'),patch.object(module.vendor,'range_snapshot',side_effect=report),patch.object(module.vendor,'snapshot',return_value={'status':'IN_QUEUE','rows':[]}),patch.object(module,'refresh') as refresh:
            result=module.live_data('linso',['B000000001','B000000002'])
        self.assertEqual(result['account'],'mvr');self.assertEqual(result['inventory']['B000000001']['vcStock'],40)
        self.assertEqual(result['inventory']['B000000001']['vcOpenPo'],0)
        self.assertIsNone(result['inventory']['B000000001']['vcSales45'])
        self.assertIsNone(result['inventory']['B000000002']['vcStock'])
        refresh.assert_called_once_with('mvr','2026-09-01','2026-10-15')
    def test_complete_sales_use_only_selected_asin_and_correct_account(self):
        def report(key):
            if key[1].startswith('inventory'):return {'status':'DONE','rows':[]},False
            return {'status':'DONE','rows':[{'asin':'B000000001','startDate':key[2],'endDate':key[3],'orderedUnits':20},{'asin':'B000000002','startDate':key[2],'endDate':key[3],'orderedUnits':999}]},False
        with patch.object(module.vendor,'inventory_latest_date',return_value='2026-10-15'),patch.object(module.vendor,'range_snapshot',side_effect=report),patch.object(module.vendor,'snapshot',return_value={'status':'DONE','rows':[]}),patch.object(module,'refresh'):
            result=module.live_data('rayom',['B000000001'])
        self.assertEqual(result['account'],'cb');self.assertEqual(result['inventory']['B000000001']['vcSales45'],20)
        self.assertEqual(set(result['inventory']),{'B000000001'})

if __name__=='__main__':unittest.main()
