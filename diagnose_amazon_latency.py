import sys,time
sys.path.insert(0,'backend')
import app as a
for name in ('inventory_map','seller_listing_items','sales_report','amazon_brand_sales','listing_map','fetch_returns_report'):
    original=getattr(a,name)
    def wrap(*args,_fn=original,_name=name,**kwargs):
        start=time.monotonic()
        try:return _fn(*args,**kwargs)
        finally:print('TIMING',_name,round(time.monotonic()-start,2),flush=True)
    setattr(a,name,wrap)
with a.app.test_request_context('/?organization=shelfesteem'):
    start=time.monotonic()
    rows=a.build_products(a.creds,listing_rows=True)
    print('TOTAL',round(time.monotonic()-start,2),'ROWS',len(rows),flush=True)
