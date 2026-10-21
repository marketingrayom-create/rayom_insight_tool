"""Amazon Vendor data, separate from Seller credentials and caches."""
import os, json, sqlite3, threading, gzip, time, math
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
import requests
from contextlib import contextmanager
from flask import Blueprint, request, jsonify, g

vendor = Blueprint('amazon_vendor', __name__, url_prefix='/api/amazon-vendor')
DB_PATH = os.path.join(os.path.dirname(__file__), 'amazon_vendor.sqlite3')
ACCOUNT_DEFS = [('rayom','Rayom',['AMAZON_RAYOM_VENDOR_REFRESH_TOKEN']),('master-cj','Master - CE - RJ',['AMAZON_RAYOM_VENDOR_MASTER_CJ_TOKEN']),('etrade','Auto Etrade',['AMAZON_RAYOM_VENDOR_ETRADE_REFRESH_TOKEN']),('mvr','MVR - Rajasthan',['AMAZON_RAYOM_VENDOR_MVR_REFRESH_TOKEN','AMAZON_RAYOM_VENDOR_MVR_TOKEN','AMAZON_RAYOM-VENDOR_MVR_TOKEN']),('cj','CJ',['AMAZON_RAYOM_VENDOR_CJ_REFRESH_TOKEN','AMAZON_RAYOM_VENDOR-CJ_TOKEN']),('cb','Rajasthan - CB',['AMAZON_RAYOM_VENDOR_CB_REFRESH_TOKEN','AMAZON_RAYOM_VENDOR_CB_TOKEN'])]
REPORTS = {'sales':'GET_VENDOR_SALES_REPORT','inventory':'GET_VENDOR_INVENTORY_REPORT'}
ENDPOINTS = {'EU':'https://sellingpartnerapi-eu.amazon.com','NA':'https://sellingpartnerapi-na.amazon.com','FE':'https://sellingpartnerapi-fe.amazon.com'}
TOKENS, TOKEN_LOCK, ACTIVE, ACTIVE_LOCK = {}, threading.Lock(), set(), threading.Lock()
REQUEST_WINDOWS, REQUEST_WINDOW_LOCK = {}, threading.Lock()
CATALOG_JOBS, CATALOG_JOB_LOCK = {}, threading.Lock()
PRODUCT_SALES_JOBS, PRODUCT_SALES_LOCK = {}, threading.Lock()

class VendorError(Exception):
    def __init__(self, message, status=400, retry_after=60):
        super().__init__(message)
        self.status = status
        self.retry_after=retry_after

def request_window(config,path,body):
    operation='createReport' if path=='/reports/2021-06-30/reports' and body is not None else 'getReport' if path.startswith('/reports/2021-06-30/reports/') else 'getDocument' if path.startswith('/reports/2021-06-30/documents/') else path
    key=(config['region'],config['client'],config['token'],operation)
    interval=60 if operation=='createReport' else 2 if operation in ('getReport','getDocument') else 0
    with REQUEST_WINDOW_LOCK:
        now=time.monotonic()
        ready=REQUEST_WINDOWS.get(key,0)
        if ready>now: raise VendorError('Waiting for the Amazon request cooldown.',429,max(1,math.ceil(ready-now)))
        REQUEST_WINDOWS[key]=now+interval
    return key

def inventory_latest_date(now=None):
    # Two calendar days, with Monday explicitly using Friday.
    india=timezone(timedelta(hours=5,minutes=30))
    today=(now or datetime.now(timezone.utc)).astimezone(india).date()
    return (today-timedelta(days=3 if today.weekday()==0 else 2)).isoformat()

@vendor.after_request
def effective_inventory_dates(response):
    dates=getattr(g,'vendor_effective_range',None)
    if dates and response.is_json:
        payload=response.get_json()
        payload['effectiveRange']=dates
        response.set_data(json.dumps(payload))
    return response

def accounts():
    output = []
    for key, name, names in ACCOUNT_DEFS:
        prefix = 'AMAZON_RAYOM_VENDOR_' + key.upper().replace('-','_')
        client = os.getenv(prefix+'_CLIENT_ID') or os.getenv('AMAZON_RAYOM_VENDOR_CLIENT_ID') or os.getenv('AMAZON_RAYOM_VENDER_CLIENT_ID') or ''
        # SP solution ID is not the Login with Amazon OAuth client ID.
        if not client or client.startswith('amzn1.sp.solution.'):
            client = os.getenv('AMAZON_RAYOM_SP_API_CLIENT_ID','')
        secret = os.getenv(prefix+'_CLIENT_SECRET') or os.getenv('AMAZON_RAYOM_VENDOR_CLIENT_SECRET') or os.getenv('AMAZON_RAYOM_SP_API_CLIENT_SECRET','')
        token_names=names+(['cb_vendor_token','CB_VENDOR_TOKEN'] if key=='cb' else [])
        token = next((os.getenv(n) for n in token_names if os.getenv(n)), '')
        missing = [label for label,value in [('LWA client ID',client),('LWA client secret',secret),('Refresh token',token)] if not value]
        output.append(dict(id=key,name=os.getenv(prefix+'_NAME',name),groupId=os.getenv(prefix+'_GROUP_ID',''),client=client,secret=secret,token=token,missing=missing,ready=not missing,region=os.getenv(prefix+'_REGION',os.getenv('AMAZON_VENDOR_REGION','EU')),marketplace=os.getenv(prefix+'_MARKETPLACE_ID',os.getenv('AMAZON_VENDOR_MARKETPLACE_ID','A21TJRUUN4KGV'))))
    return output

def public_accounts():
    return [{k:a[k] for k in ('id','name','groupId','ready','missing','region','marketplace')} for a in accounts() if a['id']!='rayom']

def account(key):
    found = next((a for a in accounts() if a['id']==key),None)
    if not found: raise VendorError('Choose a valid vendor account.')
    if not found['ready']: raise VendorError('Configure '+', '.join(found['missing'])+' for '+found['name']+' in backend .env.',503)
    if found['region'] not in ENDPOINTS: raise VendorError('Vendor region must be EU, NA or FE.',503)
    return found

def access_token(config):
    with TOKEN_LOCK:
        now = datetime.now(timezone.utc).timestamp()
        key = (config['id'],config['client'],config['secret'],config['token'])
        cached = TOKENS.get(key)
        if cached and cached[1]>now+60: return cached[0]
        try:
            response = requests.post('https://api.amazon.com/auth/o2/token',data={'grant_type':'refresh_token','client_id':config['client'],'client_secret':config['secret'],'refresh_token':config['token']},timeout=30)
            data = response.json()
        except (requests.RequestException,ValueError): raise VendorError('Amazon authorization service unavailable. Retry shortly.',502)
        if not response.ok or not data.get('access_token'): raise VendorError('Amazon authorization failed. Check LWA client credentials and this vendor account refresh token.',502)
        TOKENS[key] = (data['access_token'],now+int(data.get('expires_in',3600)))
        return data['access_token']

def amazon(config,path,params=None,body=None):
    window=request_window(config,path,body)
    try:
        response = requests.request('POST' if body is not None else 'GET',ENDPOINTS[config['region']]+path,params=params,json=body,headers={'x-amz-access-token':access_token(config),'x-amz-date':datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'),'User-Agent':'KuberBeacon/1.0 (Language=Python)','Accept':'application/json'},timeout=30)
        if not response.ok:
            if response.status_code==429:
                try: retry=max(60,int(response.headers.get('Retry-After','60')))
                except (ValueError,TypeError): retry=60
                with REQUEST_WINDOW_LOCK: REQUEST_WINDOWS[window]=max(REQUEST_WINDOWS.get(window,0),time.monotonic()+retry)
                raise VendorError('Amazon is busy. Retrying after the request cooldown.',429,retry)
            message = 'Amazon denied access. Check vendor authorization and required API roles.' if response.status_code==403 else 'Amazon rate limit reached. Wait a minute and retry.' if response.status_code==429 else 'Amazon request failed. Check dates, marketplace and account configuration.'
            raise VendorError(message,429 if response.status_code==429 else 502)
        return response.json()
    except (requests.RequestException,ValueError): raise VendorError('Amazon service unavailable or timed out. Previous saved data is retained.',502)

def selection(data):
    key,kind,start,end = (str(data.get(k,'')) for k in ('account','kind','start','end'))
    if key not in [a[0] for a in ACCOUNT_DEFS] or kind not in ('orders','invoices','sales','inventory'): raise VendorError('Choose a valid vendor account and tab.')
    try:
        after = datetime.strptime(start,'%Y-%m-%d').replace(tzinfo=timezone.utc)
        before = datetime.strptime(end,'%Y-%m-%d').replace(tzinfo=timezone.utc)+timedelta(days=1)-timedelta(seconds=1)
        if after.strftime('%Y-%m-%d')!=start or before.strftime('%Y-%m-%d')!=end: raise ValueError()
    except ValueError: raise VendorError('Choose valid dates.')
    now = datetime.now(timezone.utc)
    period=str(data.get('reportPeriod','DAY')).upper()
    if period not in ('DAY','WEEK','MONTH','QUARTER','YEAR'): raise VendorError('Choose a valid reporting period.')
    maximum=366 if kind in REPORTS and period!='DAY' else 90
    if before<after or (before-after).days>=maximum or after>now or before.date()>now.date(): raise VendorError('Choose valid past dates within the selected reporting period (daily ranges: up to 90 days).')
    if kind=='orders' and (now-after).days>180: raise VendorError('Choose purchase order dates within the past six months.')
    view=str(data.get('distributorView','SOURCING')).upper()
    if view not in ('MANUFACTURING','SOURCING'): raise VendorError('Choose Manufacturing or Sourcing.')
    stored_kind=kind+'@MANUFACTURING' if kind in REPORTS and view=='MANUFACTURING' else kind
    if kind in REPORTS and period!='DAY': stored_kind+='@'+period
    return (key,stored_kind,start,end),after,min(before,now)

@contextmanager
def connection():
    db=sqlite3.connect(DB_PATH,timeout=20)
    db.execute('CREATE TABLE IF NOT EXISTS snapshots (account TEXT, kind TEXT, start TEXT, end TEXT, rows TEXT NOT NULL DEFAULT "[]", status TEXT, report_id TEXT, updated TEXT, PRIMARY KEY(account,kind,start,end))')
    db.execute('CREATE TABLE IF NOT EXISTS sync_errors (account TEXT,kind TEXT,start TEXT,end TEXT,message TEXT,PRIMARY KEY(account,kind,start,end))')
    db.execute('CREATE TABLE IF NOT EXISTS report_metadata (report_id TEXT PRIMARY KEY, aggregate_data TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS catalog_products (account TEXT,marketplace TEXT,asin TEXT,title TEXT,brand TEXT,updated REAL,PRIMARY KEY(account,marketplace,asin))')
    try:
        with db:
            yield db
    finally:
        db.close()

def snapshot(key):
    with connection() as db:
        row=db.execute('SELECT rows,status,report_id,updated FROM snapshots WHERE account=? AND kind=? AND start=? AND end=?',key).fetchone()
    return dict(rows=json.loads(row[0]),status=row[1],report_id=row[2],updated=row[3]) if row else dict(rows=[],status='waiting',report_id=None,updated=None)

def cb_product_inventory(account_id='cb'):
    """Latest completed CB manufacturing stock, never summed across dates."""
    with connection() as db:
        saved=db.execute("SELECT end,rows,updated FROM snapshots WHERE account=? AND kind='inventory@MANUFACTURING' AND status='DONE' ORDER BY updated DESC",(account_id,)).fetchall()
    records=[]
    for end,content,updated in saved:
        for row in json.loads(content):
            if row.get('asin'):
                records.append((str(row.get('endDate') or end)[:10],row,updated))
    latest=max((entry[0] for entry in records),default=None)
    result={}
    for as_of,row,updated in records:
        if as_of!=latest or row['asin'] in result: continue
        units=row.get('sellableOnHandInventoryUnits')
        result[row['asin']]=dict(units=units if isinstance(units,(int,float)) and not isinstance(units,bool) else None,asOf=as_of,updatedAt=updated,productTitle=row.get('productTitle'),brand=row.get('brand'))
    return result

def refresh_product_inventory(account_id):
    """Advance the latest inventory report without blocking product requests."""
    end=inventory_latest_date()
    report_key=(account_id,'inventory@MANUFACTURING',end,end)
    if snapshot(report_key)['status']=='DONE': return False
    job_key=(account_id,'inventory',end)
    with PRODUCT_SALES_LOCK:
        if PRODUCT_SALES_JOBS.get(job_key,0)>time.monotonic(): return True
        PRODUCT_SALES_JOBS[job_key]=float('inf')
    def run():
        try:
            config=account(account_id)
            for _ in range(60):
                with ACTIVE_LOCK:
                    available=report_key not in ACTIVE
                    if available: ACTIVE.add(report_key)
                if not available:
                    time.sleep(5); continue
                try:
                    result=sync_daily_inventory_range(config,report_key)
                    save(report_key,result)
                    sync_error(report_key,None)
                    if result['status']=='DONE': return
                    delay=5
                except VendorError as exc:
                    sync_error(report_key,str(exc))
                    if exc.status!=429: return
                    delay=exc.retry_after
                finally:
                    with ACTIVE_LOCK: ACTIVE.discard(report_key)
                time.sleep(delay)
        finally:
            with PRODUCT_SALES_LOCK: PRODUCT_SALES_JOBS[job_key]=time.monotonic()+60
    threading.Thread(target=run,daemon=True).start()
    return True


def range_snapshot(key):
    """Read cached retail periods without creating a completed range snapshot."""
    data=snapshot(key)
    if not key[1].startswith(('inventory','sales')) or (data['status']=='DONE' and data['rows']):
        return data,False
    with connection() as db:
        sources=db.execute("SELECT start,end,rows,updated FROM snapshots WHERE account=? AND kind=? AND status='DONE' AND start<=? AND end>=? ORDER BY updated DESC",(key[0],key[1],key[3],key[2])).fetchall()
    merged={}; covered=set(); updated=[]
    for start,end,content,synced in sources:
        if key[2]<=start and end<=key[3]:
            day=datetime.strptime(start,'%Y-%m-%d').date()
            until=datetime.strptime(end,'%Y-%m-%d').date()
            while day<=until:
                covered.add(day.isoformat()); day+=timedelta(days=1)
            if synced: updated.append(synced)
        for raw in json.loads(content):
            row=dict(raw)
            first=str(row.get('startDate') or start)[:10]
            last=str(row.get('endDate') or end)[:10]
            # Never include an aggregate whose period extends outside the request.
            if first<key[2] or last>key[3]: continue
            identity=(row.get('asin'),first,last)
            if identity in merged: continue
            if any(asin==identity[0] and saved_first<=last and saved_last>=first for asin,saved_first,saved_last in merged): continue
            row.update(startDate=first,endDate=last)
            merged[identity]=row
            day=datetime.strptime(first,'%Y-%m-%d').date()
            until=datetime.strptime(last,'%Y-%m-%d').date()
            while day<=until:
                covered.add(day.isoformat()); day+=timedelta(days=1)
            if synced: updated.append(synced)
    if not merged and not covered: return data,False
    data['rows']=sorted(merged.values(),key=lambda row:(row['endDate'],str(row.get('asin',''))))
    data['updated']=max(updated) if updated else None
    data['coverage']=dict(source='savedReports',dates=sorted(covered),complete=len(covered)==(datetime.strptime(key[3],'%Y-%m-%d')-datetime.strptime(key[2],'%Y-%m-%d')).days+1)
    return data,True

def inventory_asin_rows(rows):
    grouped={}
    for row in rows:
        grouped.setdefault(row.get('asin'),[]).append(row)
    output=[]
    for periods in grouped.values():
        latest=dict(max(periods,key=lambda row:row.get('endDate','')))
        latest['_cells']=dict(latest.get('_cells',{}))
        for field in ('netReceivedInventoryUnits','netReceivedInventoryCost'):
            values=[row[field] for row in periods if row.get(field) is not None]
            if len(values)>1:
                if field.endswith('Cost'):
                    if not all(isinstance(value,dict) for value in values) or len({value.get('currencyCode') for value in values})!=1: continue
                    latest[field]=dict(amount=sum(float(value.get('amount',0)) for value in values),currencyCode=values[0].get('currencyCode'))
                else: latest[field]=sum(values)
                latest['_cells'].pop(field,None)
        output.append(latest)
    return output

def sales_asin_rows(rows):
    grouped={}
    seen=set()
    for row in rows:
        if not row.get('asin'): continue
        identity=(row['asin'],row.get('startDate'),row.get('endDate'))
        if identity in seen: continue
        seen.add(identity)
        grouped.setdefault(row['asin'],[]).append(row)
    output=[]
    for asin,periods in grouped.items():
        result=dict(asin=asin,startDate=min(row.get('startDate','') for row in periods),endDate=max(row.get('endDate','') for row in periods))
        for field in ('productTitle','brand'):
            result[field]=next((row[field] for row in periods if row.get(field)),None)
        for field in ('orderedUnits','shippedUnits','customerReturns'):
            values=[row[field] for row in periods if isinstance(row.get(field),(int,float))]
            if values: result[field]=sum(values)
        for field in ('orderedRevenue','shippedRevenue','shippedCogs'):
            values=[row[field] for row in periods if isinstance(row.get(field),dict)]
            if values and len({v.get('currencyCode') for v in values})==1:
                result[field]=dict(amount=round(sum(float(v.get('amount',0)) for v in values),2),currencyCode=values[0].get('currencyCode'))
        output.append(result)
    return sorted(output,key=lambda row:float((row.get('orderedRevenue') or {}).get('amount',0)),reverse=True)

def performance_7d(account_id):
    end = inventory_latest_date()
    start = datetime.strptime(end, '%Y-%m-%d') - timedelta(days=6)
    revenue, units = [], []
    complete = True
    for offset in range(7):
        day = (start + timedelta(days=offset)).strftime('%Y-%m-%d')
        data, _ = range_snapshot((account_id, 'sales@MANUFACTURING', day, day))
        ready = data.get('coverage', {}).get('complete', data['status'] == 'DONE')
        complete = complete and ready
        rows = sales_asin_rows(data['rows']) if ready else []
        revenue.append(dict(date=day, value=round(sum(float((row.get('orderedRevenue') or {}).get('amount', 0)) for row in rows), 2) if ready else None))
        units.append(dict(date=day, value=sum(row.get('orderedUnits') or 0 for row in rows) if ready else None))
    return dict(timePeriod='7D', source='Amazon Vendor', complete=complete,
                dateRange=dict(startDate=revenue[0]['date'], endDate=end),
                revenueData=revenue, unitsData=units,
                revenueSeries=[dict(name='amazon_vendor', data=[row['value'] for row in revenue])],
                totalRevenue=round(sum(row['value'] or 0 for row in revenue), 2),
                totalUnits=sum(row['value'] or 0 for row in units))


def product_sales_periods(account_id,include_units=False):
    end=inventory_latest_date()
    periods={};metrics={}
    for days in (1,7,15,30,45):
        start=(datetime.strptime(end,'%Y-%m-%d')-timedelta(days=days-1)).strftime('%Y-%m-%d')
        data,_=range_snapshot((account_id,'sales@MANUFACTURING',start,end))
        complete=data.get('coverage',{}).get('complete',data['status']=='DONE')
        periods[str(days)]=dict(start=start,end=end,complete=complete)
        if complete:
            for row in sales_asin_rows(data['rows']):
                amount=(row.get('orderedRevenue') or {}).get('amount')
                value=dict(orderedUnits=row.get('orderedUnits'),orderedRevenue=amount,productTitle=row.get('productTitle'),brand=row.get('brand')) if include_units else amount
                if include_units or amount is not None: metrics.setdefault(row['asin'],{})[str(days)]=value
    return metrics,periods

def refresh_product_sales(account_id,periods):
    """Fetch missing daily periods in the background without blocking products."""
    if all(period['complete'] for period in periods.values()): return
    end=periods['30']['end'];key=(account_id,end)
    with PRODUCT_SALES_LOCK:
        if PRODUCT_SALES_JOBS.get(key,0)>time.monotonic(): return
        PRODUCT_SALES_JOBS[key]=float('inf')
    def run():
        try:
            config=account(account_id)
            for _ in range(60):
                # Make the latest day available before filling older windows.
                # Re-read coverage so completed chunks are reused on each poll.
                _, current_periods=product_sales_periods(account_id)
                missing=next((current_periods[str(days)] for days in (1,7,15,30,45) if not current_periods[str(days)]['complete']),None)
                if missing is None: return
                report_key=(account_id,'sales@MANUFACTURING',missing['start'],end)
                with ACTIVE_LOCK:
                    available=report_key not in ACTIVE
                    if available: ACTIVE.add(report_key)
                if not available:
                    time.sleep(5);continue
                try:
                    result=sync_daily_inventory_range(config,report_key)
                    save(report_key,result)
                    sync_error(report_key,None)
                except VendorError as exc:
                    sync_error(report_key,str(exc))
                    if exc.status!=429: return
                    delay=exc.retry_after
                else:
                    if result['status']=='DONE': continue
                    if result['status'] in ('FATAL','CANCELLED'): return
                    delay=5
                finally:
                    with ACTIVE_LOCK: ACTIVE.discard(report_key)
                time.sleep(delay)
        finally:
            with PRODUCT_SALES_LOCK: PRODUCT_SALES_JOBS[key]=time.monotonic()+60
    threading.Thread(target=run,daemon=True).start()

def sync_error(key,message):
    with connection() as db:
        if message: db.execute('INSERT OR REPLACE INTO sync_errors VALUES (?,?,?,?,?)',(*key,message))
        else: db.execute('DELETE FROM sync_errors WHERE account=? AND kind=? AND start=? AND end=?',key)

def save(key,data):
    content=json.dumps(data['rows'])
    if len(content.encode())>8*1024*1024: raise VendorError('Too much data. Select a shorter date range.')
    with connection() as db:
        db.execute('INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?,?,?,?,?)',(*key,content,data['status'],data.get('report_id'),data.get('updated')))

def load_rows(config,kind,after,before):
    windows=[]
    if kind=='orders':
        while after<before:
            end=min(after+timedelta(days=7),before)
            windows.append(dict(createdAfter=after.isoformat(),createdBefore=end.isoformat(),limit=100,includeDetails='true',sortOrder='DESC'))
            windows.append(dict(changedAfter=after.isoformat(),changedBefore=end.isoformat(),isPOChanged='true',limit=100,includeDetails='true',sortOrder='DESC'))
            after=end
    else: windows=[dict(marketplaceId=config['marketplace'],fromIssueDate=after.isoformat(),toIssueDate=before.isoformat())]
    rows={}
    for window in windows:
        token=None
        for _ in range(100):
            params={**window,**({'nextToken':token} if token else {})}
            data=amazon(config,'/vendor/orders/v1/purchaseOrders' if kind=='orders' else '/finances/invoices/2026-06-25/invoices',params)
            payload=data.get('payload',data)
            for row in payload.get('orders' if kind=='orders' else 'invoices',[]): rows[row.get('purchaseOrderNumber' if kind=='orders' else 'invoiceIdentifier')]=row
            if len(json.dumps(list(rows.values())).encode())>8*1024*1024: raise VendorError('Too many results. Select a shorter date range.')
            token=payload.get('pagination',{}).get('nextToken') or payload.get('nextToken')
            if not token: break
        else: raise VendorError('Too many pages. Select a shorter date range.')
    return list(rows.values())

INVENTORY_COLUMN_MAP={"ASIN":"asin","ITEM_NAME":"productTitle","BRAND":"brand","SOURCEABLE_PRODUCT_OOS_PERCENTAGE":"procurableProductOutOfStockRate","VENDOR_CONFIRMATION_RATE":"vendorConfirmationRate","NET_RECEIVED":"netReceivedInventoryCost","NET_RECEIVED_UNITS":"netReceivedInventoryUnits","OPEN_PO_QTY":"openPurchaseOrderUnits","RECEIVE_FILL_RATE":"receiveFillRate","OVERALL_VENDOR_LEAD_TIME":"averageVendorLeadTimeDays","UNFILLED_CUST_ORDERED_UNITS":"unfilledCustomerOrderedUnits","AGED_90_DAYS_SELLABLE_INVENTORY":"aged90PlusDaysSellableInventoryCost","AGED_90_DAYS_SELLABLE_UNITS":"aged90PlusDaysSellableInventoryUnits","SELLABLE_ON_HAND_INVENTORY":"sellableOnHandInventoryCost","SELLABLE_ON_HAND_UNITS":"sellableOnHandInventoryUnits","UNSELLABLE_ON_HAND_INVENTORY":"unsellableOnHandInventoryCost","UNSELLABLE_ON_HAND_UNITS":"unsellableOnHandInventoryUnits"}

def po_item_rows(orders):
    output=[]
    for order in orders:
        details=order.get('orderDetails',{})
        status=order.get('_orderStatus',{})
        statuses={str(item.get('itemSequenceNumber')):item for item in status.get('itemStatus',[])}
        for item in details.get('items',[]):
            item_status=statuses.get(str(item.get('itemSequenceNumber')), {})
            quantities=item_status.get('orderedQuantity',{})
            acknowledgement=item_status.get('acknowledgementStatus',{})
            history=sorted(acknowledgement.get('acknowledgementStatusDetails',[]),key=lambda entry:entry.get('acknowledgementDate',''))
            quantity_history=sorted(quantities.get('orderedQuantityDetails',[]),key=lambda entry:entry.get('updatedDate',''))
            cancelled=quantities.get('cancelledQuantity') or next((entry.get('cancelledQuantity') for entry in reversed(quantity_history) if entry.get('cancelledQuantity')),None)
            modifications=list(item.get('_modificationTypes',[]))
            if len(history)>1 and history[-1].get('acceptedQuantity')!=history[-2].get('acceptedQuantity'): modifications.append('accepted')
            if cancelled and float(cancelled.get('amount',0))>0: modifications.append('cancelled')
            window=details.get('deliveryWindow') or details.get('shipWindow') or ''
            parts=window.split('--')
            output.append(dict(purchaseOrderNumber=order['purchaseOrderNumber'],itemSequenceNumber=item.get('itemSequenceNumber'),asin=item.get('amazonProductIdentifier') or item_status.get('buyerProductIdentifier'),vendorProductIdentifier=item.get('vendorProductIdentifier'),vendorCode=details.get('sellingParty',{}).get('partyId'),modificationDate=(quantity_history[-1].get('updatedDate') if quantity_history else None) or status.get('lastUpdatedDate') or details.get('purchaseOrderStateChangedDate'),purchaseOrderDate=details.get('purchaseOrderDate'),shipTo=details.get('shipToParty',{}).get('partyId'),windowStart=parts[0] if parts else None,windowEnd=parts[1] if len(parts)>1 else None,previousAcceptedQuantity=history[-2].get('acceptedQuantity') if len(history)>1 else acknowledgement.get('acceptedQuantity'),cancelledQuantity=cancelled,netCost=item.get('netCost') or item_status.get('netCost'),freightTerms=details.get('freightTerms'),modificationTypes=list(set(modifications)),orderDetails=details))
    return output

def enrich_products(config,rows,allow_remote=True):
    warning=None
    now=datetime.now(timezone.utc).timestamp()
    products={}
    with connection() as db:
        for asin,title,brand,updated in db.execute('SELECT asin,title,brand,updated FROM catalog_products WHERE account=? AND marketplace=?',(config['id'],config['marketplace'])):
            if not allow_remote or updated>now-86400: products[asin]=dict(productTitle=title,brand=brand)
    missing=list(dict.fromkeys(row['asin'] for row in rows if row.get('asin') and (not row.get('productTitle') or not row.get('brand')) and row['asin'] not in products))
    for offset in range(0,len(missing) if allow_remote else 0,20):
        try:
            result=amazon(config,'/catalog/2022-04-01/items',dict(identifiers=','.join(missing[offset:offset+20]),identifiersType='ASIN',marketplaceIds=config['marketplace'],includedData='summaries',pageSize=20))
            for item in result.get('items',[]):
                summary=next((value for value in item.get('summaries',[]) if value.get('marketplaceId')==config['marketplace']),{})
                title,brand=summary.get('itemName'),summary.get('brand')
                if item.get('asin') and (title or brand):
                    products[item['asin']]=dict(productTitle=title,brand=brand)
                    with connection() as db:
                        db.execute('INSERT OR REPLACE INTO catalog_products VALUES (?,?,?,?,?,?)',(config['id'],config['marketplace'],item['asin'],title,brand,now))
        except VendorError as exc:
            warning='Product names and brands could not be loaded from Amazon Catalog: '+str(exc)
            break
    for row in rows:
        for field,value in products.get(row.get('asin'),{}).items():
            if not row.get(field) and value: row[field]=value
    return warning

def warm_catalog(config,rows):
    missing=[dict(row) for row in rows if row.get('asin') and (not row.get('productTitle') or not row.get('brand'))]
    if not missing: return
    key=(config['id'],config['marketplace'])
    with CATALOG_JOB_LOCK:
        now=time.monotonic()
        if CATALOG_JOBS.get(key,0)>now: return
        CATALOG_JOBS[key]=float('inf')
    def run():
        try: enrich_products(config,missing)
        except Exception: pass
        finally:
            with CATALOG_JOB_LOCK: CATALOG_JOBS[key]=time.monotonic()+300
    threading.Thread(target=run,daemon=True).start()

def normalize_inventory_report(payload):
    report=payload.get('reportData')
    if not isinstance(report,dict):
        return payload.get('inventoryByAsin',[]),payload.get('inventoryAggregate',[])
    columns=report.get('columns',[])
    dates=report.get('dateRange',{})
    def convert(cells):
        row=dict(startDate=dates.get('startDate'),endDate=dates.get('endDate'),_cells={})
        for column,cell in zip(columns,cells):
            field=INVENTORY_COLUMN_MAP.get(column.get('id'))
            if not field or not isinstance(cell,dict): continue
            row['_cells'][field]={key:cell.get(key) for key in ('rawValue','decoration','currencyCode','value')}
            # rawValue is authoritative; null remains missing and numeric zero is retained.
            value=cell.get('rawValue')
            if value is None or value=='': continue
            if field in ('asin','productTitle','brand'): row[field]=str(value); continue
            try: number=float(value)
            except (ValueError,TypeError): continue
            row[field]=dict(amount=number,currencyCode=cell.get('currencyCode')) if cell.get('decoration')=='currency' or field.endswith('Cost') else number
        return row
    rows=[convert(cells) for cells in report.get('rows',[]) if isinstance(cells,list)]
    totals=report.get('totals')
    aggregate=[convert(totals)] if isinstance(totals,list) and all(isinstance(cell,dict) for cell in totals) else []
    return rows,aggregate

def report_rows(config,report_id,kind):
    result=amazon(config,'/reports/2021-06-30/reports/'+report_id)
    if result.get('reportType')!=REPORTS[kind]: raise VendorError('Unexpected Amazon report type.',502)
    if result['processingStatus']!='DONE': return dict(status=result['processingStatus'])
    document=amazon(config,'/reports/2021-06-30/documents/'+result['reportDocumentId'])
    parsed=urlparse(document['url'])
    if parsed.scheme!='https' or not any(parsed.hostname==h or (parsed.hostname or '').endswith('.'+h) for h in ('amazonaws.com','amazon.com')): raise VendorError('Unexpected report download host.',502)
    try:
        with requests.get(document['url'],stream=True,timeout=30,allow_redirects=False) as response:
            response.raise_for_status()
            chunks=[]; size=0
            for chunk in response.iter_content(65536):
                size+=len(chunk)
                if size>8*1024*1024: raise VendorError('Report too large. Choose a shorter date range.')
                chunks.append(chunk)
        raw=b''.join(chunks)
        if document.get('compressionAlgorithm')=='GZIP':
            import io
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream: raw=stream.read(8*1024*1024+1)
        if len(raw)>8*1024*1024: raise VendorError('Report too large. Choose a shorter date range.')
        data=json.loads(raw)
    except (requests.RequestException,ValueError,OSError): raise VendorError('Could not read the Amazon report. Retry shortly.',502)
    rows,aggregate=normalize_inventory_report(data) if kind=='inventory' else (data.get('salesByAsin',[]),data.get('salesAggregate',[]))
    enrich_products(config,rows,allow_remote=False)
    warm_catalog(config,rows)
    with connection() as db:
        db.execute('INSERT OR REPLACE INTO report_metadata VALUES (?,?)',(report_id,json.dumps(aggregate)))
    return dict(status='DONE',rows=rows)

def sync_daily_inventory_range(config,key):
    """Advance one <=15-day report per call; reuse completed chunks."""
    kind=key[1].split('@')[0]
    cursor=datetime.strptime(key[2],'%Y-%m-%d').replace(tzinfo=timezone.utc)
    end=datetime.strptime(key[3],'%Y-%m-%d').replace(tzinfo=timezone.utc)
    cached,_=range_snapshot(key)
    covered=set(cached.get('coverage',{}).get('dates',[]))
    collected=list(cached['rows']) if covered else []
    updated=[cached['updated']] if covered and cached['updated'] else []
    while cursor<=end:
        if cursor.strftime('%Y-%m-%d') in covered:
            cursor+=timedelta(days=1)
            continue
        last=min(cursor+timedelta(days=14),end)
        probe=cursor+timedelta(days=1)
        while probe<=last:
            if probe.strftime('%Y-%m-%d') in covered:
                last=probe-timedelta(days=1)
                break
            probe+=timedelta(days=1)
        child=(key[0],key[1],cursor.strftime('%Y-%m-%d'),last.strftime('%Y-%m-%d'))
        saved=snapshot(child)
        if saved['status']!='DONE':
            if saved['report_id'] and saved['status'] in ('IN_QUEUE','IN_PROGRESS'):
                saved.update(report_rows(config,saved['report_id'],kind))
            else:
                result=amazon(config,'/reports/2021-06-30/reports',body=dict(reportType=REPORTS[kind],marketplaceIds=[config['marketplace']],dataStartTime=cursor.isoformat(),dataEndTime=(last+timedelta(days=1)-timedelta(seconds=1)).isoformat(),reportOptions=dict(reportPeriod='DAY',distributorView='MANUFACTURING' if '@MANUFACTURING' in key[1] else 'SOURCING',sellingProgram='RETAIL')))
                saved.update(status='IN_QUEUE',report_id=result['reportId'])
            if saved['status']=='DONE': saved['updated']=datetime.now(timezone.utc).isoformat()
            save(child,saved)
            if saved['status'] in ('FATAL','CANCELLED'):
                raise VendorError('Amazon could not prepare Inventory for '+child[2]+' to '+child[3]+'. Recent inventory dates can take 72 hours to become available. Choose an earlier end date and apply again.',502)
            if saved['status']!='DONE':
                # A single chunk has the same key as its parent. Preserve its
                # report ID when sync_data saves the parent, so retries poll it.
                return dict(rows=[],status=saved['status'],report_id=saved['report_id'] if child==key else None,updated=None)
        collected.extend(saved['rows'])
        if saved['updated']: updated.append(saved['updated'])
        cursor=last+timedelta(days=1)
    return dict(rows=collected,status='DONE',report_id=None,updated=max(updated) if updated else None)

@vendor.get('/accounts')
def list_accounts():
    return jsonify(accounts=public_accounts())

@vendor.before_request
def check_company_vendor_scope():
    company=request.args.get('organization')
    if company is None: return
    scope={'rayom':'cb','linso':'mvr'}.get(company)
    if scope is None: raise VendorError('Choose Rayom Energizer or Rayom Linso.')
    # Both Rayom workspaces can inspect all explicitly configured Vendor groups.
    # Seller Product Details still maps Energizer->CB and Linso->MVR separately.

@vendor.get('/data')
def get_data():
    key,_,_=selection(request.args)
    data,from_range=(snapshot(key),False) if request.args.get('exact')=='true' else range_snapshot(key)
    if request.args.get('exact')=='true' and data['status']!='DONE': data['rows']=[]
    query=request.args.get('search','').strip().lower()
    catalog_warning=None
    modification_counts={}
    order_counts={}
    if key[1]=='orders':
        order_counts=dict(all=len(data['rows']),open=sum(row.get('purchaseOrderState') in ('New','Acknowledged') for row in data['rows']))
        order_status=request.args.get('orderStatus','all')
        if order_status not in ('all','open'): raise VendorError('Choose a valid PO status filter.')
        if order_status=='open': data['rows']=[row for row in data['rows'] if row.get('purchaseOrderState') in ('New','Acknowledged')]
    if key[1]=='orders' and request.args.get('orderView')=='items':
        data['rows']=po_item_rows(data['rows'])
        try: catalog_warning=enrich_products(account(key[0]),data['rows'],allow_remote=False)
        except VendorError as exc: catalog_warning=str(exc)
        for row in data['rows']:
            for modification in row['modificationTypes']: modification_counts[modification]=modification_counts.get(modification,0)+1
        modification=request.args.get('modification','all')
        if modification!='all': data['rows']=[row for row in data['rows'] if modification in row['modificationTypes']]
    if key[1].startswith(('inventory','sales')) and data['rows']:
        # Enrich existing saved reports too; do not require a fresh report download.
        try:
            target=data['rows'] if len(data['rows'])<=100 else data['rows'][max(0,int(request.args.get('page',1))-1)*min(100,max(1,int(request.args.get('limit',25)))):max(0,int(request.args.get('page',1))-1)*min(100,max(1,int(request.args.get('limit',25))))+100]
            catalog_warning=enrich_products(account(key[0]),target,allow_remote=False)
        except VendorError as exc: catalog_warning=str(exc)
        except ValueError: raise VendorError('Invalid page or limit.')
    display_rows=inventory_asin_rows(data['rows']) if key[1].startswith('inventory') else sales_asin_rows(data['rows']) if key[1].startswith('sales') else data['rows']
    rows=[r for r in display_rows if not query or query in json.dumps(r).lower()]
    try: limit=min(100,max(1,int(request.args.get('limit',25)))); page=max(1,int(request.args.get('page',1)))
    except ValueError: raise VendorError('Invalid page or limit.')
    pages=max(1,(len(rows)+limit-1)//limit); page=min(page,pages)
    with connection() as db:
        failure=db.execute('SELECT message FROM sync_errors WHERE account=? AND kind=? AND start=? AND end=?',key).fetchone()
        saved=db.execute("SELECT start,end,updated FROM snapshots WHERE account=? AND kind=? AND status='DONE' AND rows!='[]' ORDER BY updated DESC LIMIT 1",key[:2]).fetchone()
    available_snapshot=dict(start=saved[0],end=saved[1],lastSyncAt=saved[2]) if saved else None
    summary=None
    if key[1].startswith('inventory'):
        with connection() as db:
            metadata=db.execute('SELECT aggregate_data FROM report_metadata WHERE report_id=?',(data['report_id'],)).fetchone()
        aggregates=json.loads(metadata[0]) if metadata else []
        if aggregates and not from_range: summary=max(aggregates,key=lambda row:row.get('endDate',''))
        elif data['rows']:
            latest=max(row.get('endDate','') for row in data['rows'])
            latest_rows=[row for row in data['rows'] if row.get('endDate','')==latest]
            summary={}
            for field in ('netReceivedInventoryUnits','openPurchaseOrderUnits','unfilledCustomerOrderedUnits','aged90PlusDaysSellableInventoryUnits','sellableOnHandInventoryUnits','unsellableOnHandInventoryUnits'):
                source=data['rows'] if field=='netReceivedInventoryUnits' else latest_rows
                values=[row[field] for row in source if isinstance(row.get(field),(int,float))]
                if values: summary[field]=sum(values)
            for field in ('netReceivedInventoryCost','aged90PlusDaysSellableInventoryCost','sellableOnHandInventoryCost','unsellableOnHandInventoryCost'):
                source=data['rows'] if field=='netReceivedInventoryCost' else latest_rows
                values=[row[field] for row in source if isinstance(row.get(field),dict)]
                currencies={value.get('currencyCode') for value in values}
                if values and len(currencies)==1: summary[field]=dict(amount=sum(float(value.get('amount',0)) for value in values),currencyCode=values[0].get('currencyCode'))
    if key[1].startswith('sales') and data['rows']:
        summary={}
        for field in ('orderedUnits','shippedUnits','customerReturns'):
            values=[row[field] for row in display_rows if isinstance(row.get(field),(int,float))]
            if values: summary[field]=sum(values)
        for field in ('orderedRevenue','shippedRevenue','shippedCogs'):
            values=[row[field] for row in display_rows if isinstance(row.get(field),dict)]
            if values and len({value.get('currencyCode') for value in values})==1:
                summary[field]=dict(amount=round(sum(float(value.get('amount',0)) for value in values),2),currencyCode=values[0].get('currencyCode'))
    return jsonify(orderCounts=order_counts,coverage=data.get('coverage'),availableSnapshot=available_snapshot,modificationCounts=modification_counts,catalogWarning=catalog_warning,summary=summary,rows=rows[(page-1)*limit:page*limit],total=len(rows),page=page,totalPages=pages,limit=limit,status=data['status'],lastSyncAt=data['updated'],syncError=failure[0] if failure else None)

@vendor.post('/sync')
def sync_data():
    options=request.get_json(silent=True) or {}
    if options.get('kind') in ('inventory','sales') and str(options.get('reportPeriod','DAY')).upper()=='DAY':
        latest=inventory_latest_date()
        if str(options.get('end',''))>latest:
            options={**options,'end':latest}
        if str(options.get('start',''))>str(options.get('end','')):
            raise VendorError(options['kind'].title()+' is available through '+latest+'. Choose a start date on or before this date.')
        g.vendor_effective_range={k:options.get(k) for k in ('start','end')}
    key,after,before=selection(options)
    config=account(key[0])
    with ACTIVE_LOCK:
        if key in ACTIVE: raise VendorError('This account and date range are already syncing.',409)
        ACTIVE.add(key)
    try:
        data=snapshot(key)
        if options.get('checkOnly') and data['status'] not in ('IN_QUEUE','IN_PROGRESS'):
            return jsonify(status=data['status'],message='Report complete. No sales or inventory records for these dates.' if data['status']=='DONE' and not data['rows'] else 'Saved report is ready.' if data['status']=='DONE' else 'Report is not pending. Apply dates to request a report.')
        kind=key[1].split('@')[0]
        view='MANUFACTURING' if '@MANUFACTURING' in key[1] else 'SOURCING'
        period=next((p for p in key[1].split('@')[1:] if p in ('WEEK','MONTH','QUARTER','YEAR')),'DAY')
        if kind in REPORTS:
            cached,_=range_snapshot(key)
            if cached.get('coverage',{}).get('complete'):
                cached.pop('coverage',None)
                cached.update(status='DONE',report_id=None)
                save(key,cached); sync_error(key,None)
                return jsonify(status='DONE',message='Selected dates are ready.')
            if data['status']=='DONE':
                return jsonify(status='DONE',message='Selected dates are ready.')
        if kind in REPORTS:
            if kind=='inventory' and period=='DAY':
                data.update(sync_daily_inventory_range(config,key))
            elif data['report_id'] and data['status'] in ('IN_QUEUE','IN_PROGRESS'):
                result=report_rows(config,data['report_id'],kind); data.update(result)
            else:
                result=amazon(config,'/reports/2021-06-30/reports',body=dict(reportType=REPORTS[kind],marketplaceIds=[config['marketplace']],dataStartTime=after.isoformat(),dataEndTime=before.isoformat(),reportOptions=dict(reportPeriod=period,distributorView=view,sellingProgram='RETAIL')))
                data.update(status='IN_QUEUE',report_id=result['reportId'])
        else:
            rows=load_rows(config,key[1],after,before)
            if kind=='orders':
                previous={order['purchaseOrderNumber']:order for order in data['rows']}
                for order in rows:
                    response=amazon(config,'/vendor/orders/v1/purchaseOrdersStatus',dict(purchaseOrderNumber=order['purchaseOrderNumber']))
                    statuses=response.get('payload',response).get('ordersStatus',[])
                    order['_orderStatus']=next((status for status in statuses if status.get('purchaseOrderNumber')==order['purchaseOrderNumber']),{})
                    old=previous.get(order['purchaseOrderNumber'],{}).get('orderDetails',{})
                    new=order.get('orderDetails',{})
                    old_items={str(item.get('itemSequenceNumber')):item for item in old.get('items',[])}
                    for item in new.get('items',[]):
                        prior=old_items.get(str(item.get('itemSequenceNumber')))
                        changes=list(prior.get('_modificationTypes',[])) if prior else []
                        if prior:
                            if prior.get('netCost')!=item.get('netCost'): changes.append('cost')
                            if old.get('deliveryWindow')!=new.get('deliveryWindow') or old.get('shipWindow')!=new.get('shipWindow'): changes.append('window')
                            if old.get('shipToParty')!=new.get('shipToParty'): changes.append('shipto')
                        item['_modificationTypes']=list(set(changes))
            data.update(rows=rows,status='DONE')
        if data['status']=='DONE': data['updated']=datetime.now(timezone.utc).isoformat()
        save(key,data)
        sync_error(key,None)
        if data['status'] in ('FATAL','CANCELLED'):
            message='Amazon could not prepare '+kind+' for '+key[2]+' to '+key[3]+'. Recent Inventory dates can take 72 hours to become available. Choose an earlier end date or retry later.'
            sync_error(key,message)
            return jsonify(status=data['status'],message=message)
        message='Sync complete. Saved data is ready.' if data['status']=='DONE' else 'Amazon could not generate this report. Request it again.' if data['status'] in ('FATAL','CANCELLED') else 'Amazon is preparing the report. Click Check status shortly.'
        return jsonify(status=data['status'],message=message)
    except VendorError as exc:
        if exc.status==429:
            return jsonify(status='IN_PROGRESS',message='Amazon is busy. Retrying automatically.',retryAfter=exc.retry_after),202
        sync_error(key,str(exc))
        raise
    finally:
        with ACTIVE_LOCK: ACTIVE.discard(key)

@vendor.get('/invoices/<account_id>/<path:invoice_id>')
def invoice_details(account_id,invoice_id):
    from urllib.parse import quote
    config=account(account_id)
    params=dict(marketplaceId=config['marketplace'])
    if request.args.get('nextTokenForLineItems'): params['nextTokenForLineItems']=request.args['nextTokenForLineItems']
    return jsonify(amazon(config,'/finances/invoices/2026-06-25/invoices/'+quote(invoice_id,safe=''),params))

@vendor.errorhandler(VendorError)
def vendor_error(exc):
    response=jsonify(message=str(exc))
    response.status_code=exc.status
    if exc.status==429: response.headers['Retry-After']=str(exc.retry_after)
    return response

@vendor.errorhandler(Exception)
def unexpected_error(exc): return jsonify(message='Vendor request could not complete. Previous saved data is retained.'),502
