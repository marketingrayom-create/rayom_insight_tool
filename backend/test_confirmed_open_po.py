import unittest
from unittest.mock import patch
import confirmed_open_po as module

def item(asin,quantity,state='ACCEPTED',sequence='1',unit='Eaches',size=1):
    return {'buyerProductIdentifier':asin,'vendorProductIdentifier':'8906218300012','itemSequenceNumber':sequence,
      'acknowledgementStatus':{'confirmationStatus':state},
      'orderedQuantity':{'orderedQuantity':{'amount':quantity,'unitOfMeasure':unit,'unitSize':size}}}
def order(po,items,state='OPEN'):
    return {'purchaseOrderNumber':po,'purchaseOrderStatus':state,'itemStatus':items}

class ConfirmedPoTests(unittest.TestCase):
    def setUp(self):module._cache.clear();self.addCleanup(module._cache.clear)
    def test_only_confirmed_open_item_requested_units_count(self):
        rows=[order('ONE',[item('A',7),item('B',5,'UNCONFIRMED','2')]),
              order('TWO',[item('A',4,'PARTIALLY_ACCEPTED')]),
              order('CLOSED',[item('A',999)],'CLOSED'),
              order('UNCONFIRMED',[item('A',31,'UNCONFIRMED')]),
              order('REJECTED',[item('A',8,'REJECTED')])]
        result=module.aggregate(rows)
        self.assertEqual(result['quantities'],{'A':11})
        self.assertEqual(result['confirmedPoCount'],2)
    def test_case_units_and_po_line_deduplication(self):
        row=order('ONE',[item('A',2,unit='Cases',size=6),item('A',3,sequence='2')])
        result=module.aggregate([row,row])
        self.assertEqual(result['quantities']['A'],15)
    def test_zero_is_retained_but_missing_quantity_is_not_silently_zero(self):
        self.assertEqual(module.aggregate([order('ONE',[item('A',0)])])['quantities']['A'],0)
        with self.assertRaises(module.vendor.VendorError):module.aggregate([order('ONE',[item('A',None)])])
    def test_latest_closed_version_overrides_earlier_open(self):
        old=dict(order('ONE',[item('A',10)]),lastUpdatedDate='2026-10-16')
        new=dict(order('ONE',[item('A',10)],'CLOSED'),lastUpdatedDate='2026-10-17')
        self.assertEqual(module.aggregate([old,new])['quantities'],{})
    def test_pagination_and_company_scoped_cache(self):
        responses=[{'payload':{'ordersStatus':[order('ONE',[item('A',7)])],'pagination':{'nextToken':'page2'}}},
                   {'payload':{'ordersStatus':[order('TWO',[item('A',4)])]}},
                   {'payload':{'ordersStatus':[]}}]
        with patch.object(module.vendor,'account',side_effect=lambda account:{'id':account}),patch.object(module.vendor,'amazon',side_effect=responses) as request:
            self.assertEqual(module.snapshot('mvr')['quantities']['A'],11)
            module.snapshot('mvr')
            self.assertEqual(module.snapshot('cb')['quantities'],{})
            self.assertEqual(request.call_count,3)
            self.assertEqual(request.call_args_list[0].args[2]['purchaseOrderStatus'],'OPEN')
            self.assertEqual(request.call_args_list[1].args[2]['nextToken'],'page2')

if __name__=='__main__':unittest.main()
