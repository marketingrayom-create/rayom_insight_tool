import unittest
from unittest.mock import Mock,patch
import seller_reorder as module

class SellerReorderTests(unittest.TestCase):
    def test_inventory_aggregates_skus_and_all_pages_without_duplicates(self):
        def row(sku,qty):return dict(asin='A',sellerSku=sku,inventoryDetails=dict(fulfillableQuantity=qty,inboundWorkingQuantity=1,inboundShippedQuantity=2,inboundReceivingQuantity=3))
        client=Mock()
        client.get_inventory_summary_marketplace.side_effect=[dict(inventorySummaries=[row('s1',4)],pagination={'nextToken':'next'}),dict(inventorySummaries=[row('s1',4),row('s2',5)])]
        self.assertEqual(module.stock_rows(client,'IN'),{'A':dict(fbaStock=9,fbaInTransit=12)})
    def test_only_afn_sales_and_all_order_item_pages(self):
        client=Mock()
        orders=dict(Orders=[dict(AmazonOrderId='1',FulfillmentChannel='AFN',OrderStatus='Shipped'),dict(AmazonOrderId='2',FulfillmentChannel='MFN'),dict(AmazonOrderId='3',FulfillmentChannel='AFN',OrderStatus='Canceled')])
        pages=[orders,dict(OrderItems=[dict(OrderItemId='a',ASIN='A',QuantityOrdered=2)],NextToken='items2'),dict(OrderItems=[dict(OrderItemId='a',ASIN='A',QuantityOrdered=2),dict(OrderItemId='b',ASIN='A',QuantityOrdered=3)])]
        with patch.object(module,'order_api_call',side_effect=pages) as call:
            self.assertEqual(module.sales_rows(client,{},'IN','start','end'),{'A':5})
            self.assertEqual(call.call_args_list[0].kwargs['FulfillmentChannels'],['AFN'])
    def test_missing_order_items_never_yields_false_zero_sales(self):
        with patch.object(module,'order_api_call',side_effect=[dict(Orders=[dict(AmazonOrderId='1',FulfillmentChannel='AFN')]),{}]):
            with self.assertRaises(RuntimeError):module.sales_rows(Mock(),{},'IN','start','end')
    def test_missing_inventory_stays_unknown(self):
        client=Mock();client.get_inventory_summary_marketplace.return_value=dict(inventorySummaries=[dict(asin='A',sellerSku='sku',inventoryDetails={})])
        self.assertEqual(module.stock_rows(client,'IN'),{'A':dict(fbaStock=None,fbaInTransit=None)})

if __name__=='__main__':unittest.main()
