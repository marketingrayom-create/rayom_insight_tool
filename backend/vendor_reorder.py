"""ASIN-scoped Vendor Central planning data; no spreadsheet observations."""
import json
import math
import threading
import time
from datetime import datetime,timedelta,timezone
from urllib.parse import urlparse
import requests
import amazon_vendor as vendor

_jobs={}
_lock=threading.Lock()
_errors={}

def number(value):
    return value if isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) else None

def inventory_rows(account,end):
    data,_=vendor.range_snapshot((account,'inventory@MANUFACTURING',end,end))
    result={}
    for row in vendor.inventory_asin_rows(data.get('rows',[])):
        asin=row.get('asin')
        if not asin:continue
        result[asin]={'vcStock':number(row.get('sellableOnHandInventoryUnits')),
                      'vcOpenPo':number(row.get('openPurchaseOrderUnits')),
                      'vendorLeadTimeDays':number(row.get('averageVendorLeadTimeDays')),
                      'productName':row.get('productTitle'),'brand':row.get('brand'),'inventoryDate':end}
    return result,data

def transit_query(day):
    return '''query ReorderTransit { analytics_vendorAnalytics_2024_09_30 {
      manufacturingView(startDate: "%s", endDate: "%s", aggregateBy: DAY) {
        startDate endDate marketplaceId
        metrics { groupByKey { asin ean } metrics { productAvailability { sellableInTransitInventory } } }
      } } }'''%(day,day)

def parse_transit(documents,marketplace,day):
    rows={}
    for document in documents:
        if document.get('marketplaceId')!=marketplace or document.get('endDate')!=day:continue
        for item in document.get('metrics',[]):
            key=item.get('groupByKey') or {};asin=key.get('asin')
            if not asin:continue
            value=number(((item.get('metrics') or {}).get('productAvailability') or {}).get('sellableInTransitInventory'))
            row={'asin':asin,'ean':key.get('ean'),'vcInTransit':value,'transitDate':day}
            if asin in rows and rows[asin]!=row:
                raise vendor.VendorError('Ambiguous ASIN/EAN transit records; values left unavailable.',502)
            rows[asin]=row
    return list(rows.values())

def advance_transit(config,day):
    key=(config['id'],'reorder-transit',day,day);saved=vendor.snapshot(key)
    if saved['status'] in ('DONE','FATAL','CANCELLED'):return
    if not saved.get('report_id'):
        response=vendor.amazon(config,'/dataKiosk/2023-11-15/queries',body={'query':transit_query(day)})
        saved.update(status='IN_QUEUE',report_id=response['queryId'])
    else:
        response=vendor.amazon(config,'/dataKiosk/2023-11-15/queries/'+saved['report_id'])
        saved['status']=response.get('processingStatus','IN_PROGRESS')
        if saved['status']=='DONE':
            document_id=response.get('dataDocumentId')
            if not document_id:
                raise vendor.VendorError('Amazon returned no transit data document.',502)
            document=vendor.amazon(config,'/dataKiosk/2023-11-15/documents/'+document_id)
            url=document['documentUrl'];host=urlparse(url)
            if host.scheme!='https' or not any(host.hostname==base or (host.hostname or '').endswith('.'+base) for base in ('amazonaws.com','amazon.com')):
                raise vendor.VendorError('Unexpected Amazon document host.',502)
            with requests.get(url,timeout=(5,30),stream=True,allow_redirects=False) as response:
                if response.status_code!=200:raise vendor.VendorError('Transit document download failed.',502)
                content=bytearray()
                for chunk in response.iter_content(65536):
                    content.extend(chunk)
                    if len(content)>8*1024*1024:raise vendor.VendorError('Transit document too large.',502)
            documents=[json.loads(line) for line in bytes(content).decode('utf-8-sig').splitlines() if line.strip()]
            saved['rows']=parse_transit(documents,config['marketplace'],day)
    saved['updated']=datetime.now(timezone.utc).isoformat()
    vendor.save(key,saved)

def refresh(account,start,end):
    key=(account,start,end)
    with _lock:
        if _jobs.get(key,0)>time.monotonic():return
        _jobs[key]=float('inf')
    def run():
        errors=[]
        try:
            config=vendor.account(account)
            for kind,first in [('inventory',end),('sales',start)]:
                report_key=(account,kind+'@MANUFACTURING',first,end)
                data,_=vendor.range_snapshot(report_key)
                if data.get('coverage',{}).get('complete',data['status']=='DONE'):continue
                with vendor.ACTIVE_LOCK:
                    if report_key in vendor.ACTIVE:continue
                    vendor.ACTIVE.add(report_key)
                try:
                    vendor.save(report_key,vendor.sync_daily_inventory_range(config,report_key))
                except vendor.VendorError as exc:errors.append(f'{kind.title()}: {str(exc)[:180]}')
                except Exception:errors.append(kind.title()+': report temporarily unavailable.')
                finally:
                    with vendor.ACTIVE_LOCK:vendor.ACTIVE.discard(report_key)
            try:advance_transit(config,end)
            except vendor.VendorError as exc:errors.append('VC transit: '+str(exc)[:180])
            except Exception:errors.append('VC transit: service temporarily unavailable.')
        except vendor.VendorError as exc:errors.append(str(exc)[:180])
        except Exception:errors.append('Vendor Central planning is temporarily unavailable.')
        finally:
            with _lock:
                _errors[key]=errors
                _jobs[key]=time.monotonic()+(60 if errors else 12)
    threading.Thread(target=run,daemon=True).start()

def live_data(company,asins):
    account={'linso':'mvr','rayom':'cb'}.get(company)
    if not account:
        return {'success':True,'inventory':{},'pending':False,'message':'Vendor Central planning is available for LINSO and Energizer.'}
    end=vendor.inventory_latest_date();start=(datetime.strptime(end,'%Y-%m-%d')-timedelta(days=44)).strftime('%Y-%m-%d')
    rows,inventory=inventory_rows(account,end)
    sales,_=vendor.range_snapshot((account,'sales@MANUFACTURING',start,end))
    complete=sales.get('coverage',{}).get('complete',sales['status']=='DONE')
    sales_rows={row['asin']:row for row in vendor.sales_asin_rows(sales.get('rows',[]))} if complete else {}
    transit=vendor.snapshot((account,'reorder-transit',end,end))
    transit_rows={row['asin']:row for row in transit['rows']} if transit['status']=='DONE' else {}
    from confirmed_open_po import snapshot as confirmed_po_snapshot
    po=None;po_message=''
    try:po=confirmed_po_snapshot(account)
    except vendor.VendorError as exc:po_message='Confirmed Manage PO: '+str(exc)
    except Exception:po_message='Confirmed Manage PO data is temporarily unavailable.'
    output={}
    for asin in asins:
        row=rows.get(asin,{})
        output[asin]={**row,'asin':asin,'vcStock':row.get('vcStock'),'vcOpenPo':po['quantities'].get(asin,0) if po is not None else None,
          'openPoAsOf':po['asOf'] if po is not None else None,
          'openPoSource':'Manage POs: confirmed OPEN item requested units',
          'vcSales45':number(sales_rows.get(asin,{}).get('orderedUnits',0)) if complete else None,
          'vcInTransit':transit_rows.get(asin,{}).get('vcInTransit'),
          'ean':transit_rows.get(asin,{}).get('ean'),'salesStart':start,'salesEnd':end,
          'inventoryDate':end,'transitDate':end if transit['status']=='DONE' else None}
    pending=not complete or inventory['status']!='DONE' or transit['status'] not in ('DONE','FATAL','CANCELLED')
    if pending:refresh(account,start,end)
    covered=sales.get('coverage',{}).get('dates',[])
    sales_message='' if complete else f'VC Sales (45 Days): {start} to {end}; {len(covered)}/45 dates ready. Amazon report is preparing; totals appear after all dates are complete.'
    messages=[*([sales_message] if sales_message else []),*_errors.get((account,start,end),[]),*([po_message] if po_message else [])]
    if transit['status'] in ('FATAL','CANCELLED'):messages=[*messages,'Amazon could not prepare VC transit data. Check Data Kiosk access.']
    return {'success':True,'inventory':output,'account':account,'salesRange':{'start':start,'end':end},
            'pending':pending,'message':' '.join(messages),'source':'Amazon Vendor Central (manufacturing view)'}
