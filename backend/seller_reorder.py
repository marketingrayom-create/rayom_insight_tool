"""ASIN-level Seller Central FBA data, isolated from Vendor Central metrics."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock, Thread
from time import monotonic
from copy import deepcopy
from flask import current_app
from sp_api.api import Orders, Inventories
from sp_api.base import Marketplaces
from amazon_accounts import account_value, organization
from amazon_order_requests import order_api_call

_lock=Lock()
_entries={}

def payload(response):
    return getattr(response,'payload',response)

def credentials():
    return dict(lwa_app_id=account_value('CLIENT_ID'),lwa_client_secret=account_value('CLIENT_SECRET'),refresh_token=account_value('REFRESH_TOKEN'))

def stock_rows(client, marketplace):
    result={};seen=set();token=None
    while True:
        args=dict(details=True,granularity_type='Marketplace',granularity_id=marketplace,marketplaceIds=[marketplace])
        if token:args['nextToken']=token
        response=client.get_inventory_summary_marketplace(**args)
        data=payload(response)
        if not isinstance(data,dict) or 'inventorySummaries' not in data:raise RuntimeError('FBA inventory response incomplete')
        for row in data['inventorySummaries']:
            asin=row.get('asin');sku=row.get('sellerSku');details=row.get('inventoryDetails') or {}
            identity=(asin,sku)
            if not asin or identity in seen:continue
            seen.add(identity)
            values=[details.get(k) for k in ('fulfillableQuantity','inboundWorkingQuantity','inboundShippedQuantity','inboundReceivingQuantity')]
            item=result.setdefault(asin,dict(fbaStock=0,fbaInTransit=0))
            for key,parts in [('fbaStock',values[:1]),('fbaInTransit',values[1:])]:
                if item[key] is None:continue
                if any(isinstance(v,bool) or not isinstance(v,(int,float)) or v<0 for v in parts):item[key]=None
                else:item[key]+=sum(parts)
        next_token=(getattr(response,'pagination',None) or data.get('pagination') or {}).get('nextToken')
        if not next_token:break
        if next_token==token:raise RuntimeError('Repeated FBA inventory page')
        token=next_token
    return result

def sales_rows(client, creds, marketplace, start, end):
    totals=defaultdict(int);token=None;pages=set();orders_seen=set()
    while True:
        args=dict(MarketplaceIds=[marketplace],CreatedAfter=start,CreatedBefore=end,FulfillmentChannels=['AFN'],MaxResultsPerPage=100)
        if token:args={'NextToken':token}
        data=payload(order_api_call('get_orders',client.get_orders,creds,**args))
        if not isinstance(data,dict) or not isinstance(data.get('Orders'),list):raise RuntimeError('FBA orders response incomplete')
        for order in data['Orders']:
            if order.get('FulfillmentChannel')!='AFN' or order.get('OrderStatus') in ('Canceled','Cancelled'):continue
            oid=order.get('AmazonOrderId')
            if not oid:raise RuntimeError('FBA order identifier missing')
            if oid in orders_seen:continue
            orders_seen.add(oid);item_token=None;item_pages=set();items_seen=set()
            while True:
                kwargs={'NextToken':item_token} if item_token else {}
                items=payload(order_api_call('get_order_items',client.get_order_items,creds,oid,**kwargs))
                if not isinstance(items,dict) or not isinstance(items.get('OrderItems'),list):raise RuntimeError('FBA order items incomplete')
                for item in items['OrderItems']:
                    ident=item.get('OrderItemId');asin=item.get('ASIN');qty=item.get('QuantityOrdered')
                    if ident and ident in items_seen:continue
                    if ident:items_seen.add(ident)
                    if not asin or isinstance(qty,bool) or not isinstance(qty,(int,float)) or qty<0:raise RuntimeError('FBA item quantity missing')
                    totals[asin]+=qty
                item_token=items.get('NextToken')
                if not item_token:break
                if item_token in item_pages:raise RuntimeError('Repeated FBA items page')
                item_pages.add(item_token)
        token=data.get('NextToken')
        if not token:break
        if token in pages:raise RuntimeError('Repeated FBA orders page')
        pages.add(token)
    return dict(totals)

def snapshot(start_date,end_date):
    company=organization();key=(company,start_date,end_date,account_value('MERCHANT_ID'))
    app=current_app._get_current_object()
    with _lock:
        entry=_entries.setdefault(key,dict(stock={},sales=None,pending=False,until=0,message=''))
        if not entry['pending'] and monotonic()>=entry['until']:
            entry['pending']=True
            def refresh():
                messages=[]
                try:
                    with app.test_request_context('/?organization='+company):
                        creds=credentials();marketplace=account_value('MARKETPLACE_ID')
                        try:
                            stock=stock_rows(Inventories(credentials=creds,marketplace=Marketplaces.IN),marketplace)
                            with _lock:entry['stock']=stock
                        except Exception:messages.append('Seller Central FBA inventory unavailable.')
                        try:
                            start=start_date+'T00:00:00Z'
                            end=(datetime.fromisoformat(end_date)+timedelta(days=1)).strftime('%Y-%m-%dT00:00:00Z')
                            sales=sales_rows(Orders(credentials=creds,marketplace=Marketplaces.IN),creds,marketplace,start,end)
                            with _lock:entry['sales']=sales
                        except Exception:messages.append('Seller Central FBA 45-day sales unavailable; check API access or retry.')
                finally:
                    with _lock:entry.update(pending=False,until=monotonic()+300,message=' '.join(messages))
            Thread(target=refresh,daemon=True).start()
        return deepcopy(entry)
