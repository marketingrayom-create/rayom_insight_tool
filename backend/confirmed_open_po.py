"""Confirmed OPEN Manage-PO item requested units, scoped to vendor account."""
import math
import threading
import time
from datetime import datetime,timezone
import amazon_vendor as vendor

_cache={}
_lock=threading.Lock()

def quantity_units(quantity):
    if not isinstance(quantity,dict):return None
    amount=quantity.get('amount')
    if isinstance(amount,bool) or not isinstance(amount,(int,float)) or not math.isfinite(amount) or amount<0:return None
    unit=quantity.get('unitOfMeasure')
    if unit=='Eaches':return amount
    size=quantity.get('unitSize')
    if unit=='Cases' and isinstance(size,(int,float)) and not isinstance(size,bool) and math.isfinite(size) and size>0:
        return amount*size
    return None

def aggregate(orders):
    # A refreshed PO can be present in overlapping pages; take its latest version.
    unique={}
    for order in orders:
        po=order.get('purchaseOrderNumber')
        if not po:raise vendor.VendorError('Manage PO response is missing a PO number.',502)
        if po not in unique or order.get('lastUpdatedDate','')>unique[po].get('lastUpdatedDate',''):
            unique[po]=order
    totals={};eans={};confirmed=set();seen=set()
    for po,order in unique.items():
        if order.get('purchaseOrderStatus')!='OPEN':continue
        for item in order.get('itemStatus',[]):
            state=(item.get('acknowledgementStatus') or {}).get('confirmationStatus')
            if state not in ('ACCEPTED','PARTIALLY_ACCEPTED'):continue
            asin=item.get('buyerProductIdentifier');sequence=item.get('itemSequenceNumber')
            if not asin or sequence is None:raise vendor.VendorError('Confirmed PO item identity is incomplete.',502)
            identity=(po,str(sequence))
            if identity in seen:continue
            seen.add(identity)
            value=quantity_units((item.get('orderedQuantity') or {}).get('orderedQuantity'))
            if value is None:raise vendor.VendorError('Confirmed PO requested quantity or case size is unavailable.',502)
            totals[asin]=totals.get(asin,0)+value
            identifier=item.get('vendorProductIdentifier')
            if identifier:eans.setdefault(asin,set()).add(identifier)
            confirmed.add(po)
    return {'quantities':totals,'identifiers':{asin:sorted(values) for asin,values in eans.items()},'confirmedPoCount':len(confirmed)}

def snapshot(account_id):
    with _lock:
        saved=_cache.get(account_id)
        if saved and time.monotonic()-saved[0]<60:return saved[1]
        config=vendor.account(account_id);orders=[];token=None;tokens=set()
        for _ in range(100):
            params={'purchaseOrderStatus':'OPEN','limit':100}
            if token:params['nextToken']=token
            data=vendor.amazon(config,'/vendor/orders/v1/purchaseOrdersStatus',params)
            payload=data.get('payload',data)
            if not isinstance(payload.get('ordersStatus'),list):
                raise vendor.VendorError('Manage PO item statuses were not returned.',502)
            orders.extend(payload['ordersStatus'])
            token=(payload.get('pagination') or {}).get('nextToken') or payload.get('nextToken')
            if not token:break
            if token in tokens:raise vendor.VendorError('Manage PO pagination did not complete.',502)
            tokens.add(token)
        else:raise vendor.VendorError('Manage PO pagination limit reached; totals unavailable.',502)
        result=aggregate(orders)
        result.update(asOf=datetime.now(timezone.utc).isoformat(),source='Manage POs: confirmed OPEN item requested units')
        _cache[account_id]=(time.monotonic(),result)
        return result
