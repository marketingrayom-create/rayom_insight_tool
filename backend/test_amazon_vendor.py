import os, tempfile, unittest
from unittest.mock import patch
from flask import Flask
import amazon_vendor as av

class VendorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.db=patch.object(av,'DB_PATH',os.path.join(self.tmp.name,'vendor.sqlite3'));self.db.start();self.addCleanup(self.db.stop)
        self.env=patch.dict(os.environ,{'AMAZON_RAYOM_SP_API_CLIENT_ID':'lwa-client','AMAZON_RAYOM_SP_API_CLIENT_SECRET':'secret','AMAZON_RAYOM_VENDER_CLIENT_ID':'amzn1.sp.solution.invalid','AMAZON_RAYOM_VENDOR_REFRESH_TOKEN':'ray-token','AMAZON_RAYOM_VENDOR_MASTER_CJ_TOKEN':'cj-token','AMAZON_RAYOM-VENDOR_MVR_TOKEN':'mvr-token'},clear=True);self.env.start();self.addCleanup(self.env.stop)
        self.enrich=patch.object(av,'enrich_products',return_value=None);self.enrich.start();self.addCleanup(self.enrich.stop)
        self.cutoff=patch.object(av,'inventory_latest_date',return_value='2026-10-12');self.cutoff.start();self.addCleanup(self.cutoff.stop)
        app=Flask(__name__);app.register_blueprint(av.vendor);self.client=app.test_client()
    def test_account_separation_and_no_secrets_in_response(self):
        self.assertEqual(av.account('rayom')['client'],'lwa-client')
        self.assertEqual(av.account('master-cj')['token'],'cj-token')
        self.assertEqual(av.account('mvr')['token'],'mvr-token')
        response=self.client.get('/api/amazon-vendor/accounts')
        self.assertEqual(response.status_code,200)
        for row in response.json['accounts']:
            for key in ('client','secret','token'): self.assertNotIn(key,row)
        self.assertFalse(next(a for a in response.json['accounts'] if a['id']=='etrade')['ready'])
    def test_date_validation(self):
        for query in ('account=bad&kind=orders&start=2026-01-01&end=2026-01-02','account=rayom&kind=orders&start=2026-02-30&end=2026-03-01','account=rayom&kind=sales&start=2099-01-01&end=2099-01-02'):
            self.assertEqual(self.client.get('/api/amazon-vendor/data?'+query).status_code,400)

    def test_product_sales_refresh_prioritizes_latest_day_before_history(self):
        periods={str(days):dict(start='2026-10-12' if days==1 else '2026-09-13',end='2026-10-12',complete=False) for days in (1,7,15,30)}
        completed={key:dict(value,complete=True) for key,value in periods.items()}
        av.PRODUCT_SALES_JOBS.clear()
        self.addCleanup(av.PRODUCT_SALES_JOBS.clear)
        with patch.object(av,'account',return_value={}), patch.object(av.threading,'Thread') as thread, patch.object(av,'product_sales_periods',side_effect=[({},periods),({},completed)]), patch.object(av,'sync_daily_inventory_range',return_value=dict(rows=[],status='DONE')) as sync:
            av.refresh_product_sales('cb',periods)
            thread.call_args.kwargs['target']()
        self.assertEqual(sync.call_args.args[1],('cb','sales@MANUFACTURING','2026-10-12','2026-10-12'))

    def test_product_sales_windows_use_ordered_revenue_ending_at_cutoff(self):
        rows=[dict(asin='A',startDate='2026-09-14',endDate='2026-09-14',orderedRevenue=dict(amount=5,currencyCode='INR'))]
        from datetime import datetime,timedelta
        start=datetime(2026,9,14)
        rows=[dict(asin='A',startDate=(start+timedelta(days=i)).strftime('%Y-%m-%d'),endDate=(start+timedelta(days=i)).strftime('%Y-%m-%d'),orderedRevenue=dict(amount=10,currencyCode='INR')) for i in range(30)]
        av.save(('cb','sales@MANUFACTURING','2026-09-14','2026-10-13'),dict(rows=rows,status='DONE'))
        with patch.object(av,'inventory_latest_date',return_value='2026-10-13'):
            metrics,periods=av.product_sales_periods('cb')
        self.assertEqual(metrics['A'],{'1':10,'7':70,'15':150,'30':300})
        self.assertEqual(periods['7']['start'],'2026-10-07')
        self.assertEqual(periods['15']['start'],'2026-09-29')
        self.assertTrue(all(period['complete'] for period in periods.values()))
    def test_performance_has_seven_vendor_dates_and_matching_totals(self):
        from datetime import datetime, timedelta
        start=datetime(2026,10,6)
        rows=[dict(asin='A',startDate=(start+timedelta(days=i)).strftime('%Y-%m-%d'),endDate=(start+timedelta(days=i)).strftime('%Y-%m-%d'),orderedRevenue=dict(amount=10,currencyCode='INR'),orderedUnits=2) for i in range(7)]
        av.save(('mvr','sales@MANUFACTURING','2026-10-06','2026-10-12'),dict(rows=rows,status='DONE'))
        result=av.performance_7d('mvr')
        self.assertEqual(result['dateRange'],dict(startDate='2026-10-06',endDate='2026-10-12'))
        self.assertEqual((result['totalRevenue'],result['totalUnits']),(70,14))
        self.assertEqual(len(result['revenueData']),7)
        self.assertTrue(result['complete'])
        missing=av.performance_7d('cb')
        self.assertFalse(missing['complete'])
        self.assertTrue(all(row['value'] is None for row in missing['revenueData']))
    def test_company_vendor_scope(self):
        linso=self.client.get('/api/amazon-vendor/accounts?organization=linso').json
        self.assertEqual({row['id'] for row in linso['accounts']},{'master-cj','etrade','mvr','cj','cb'})
        energizer=self.client.get('/api/amazon-vendor/accounts?organization=rayom').json
        self.assertEqual({row['id'] for row in energizer['accounts']},{'master-cj','etrade','mvr','cj','cb'})
        response=self.client.get('/api/amazon-vendor/data?organization=linso&account=cb&kind=inventory&start=2026-10-08&end=2026-10-08')
        self.assertEqual(response.status_code,200)
    def test_cb_product_inventory_uses_latest_date_and_preserves_zero(self):
        av.save(('cb','inventory@MANUFACTURING','2026-10-08','2026-10-09'),dict(rows=[dict(asin='A',endDate='2026-10-08',sellableOnHandInventoryUnits=99),dict(asin='A',endDate='2026-10-09',sellableOnHandInventoryUnits=0),dict(asin='B',endDate='2026-10-08',sellableOnHandInventoryUnits=5)],status='DONE',updated='2026-10-12T00:00:00Z'))
        av.save(('mvr','inventory@MANUFACTURING','2026-10-10','2026-10-10'),dict(rows=[dict(asin='A',sellableOnHandInventoryUnits=100)],status='DONE'))
        result=av.cb_product_inventory()
        self.assertEqual(result['A']['units'],0)
        self.assertEqual(result['A']['asOf'],'2026-10-09')
        self.assertNotIn('B',result)

    def test_cb_vendor_token_alias(self):
        with patch.dict(os.environ,{'cb_vendor_token':'cb-alias-token'}):
            self.assertEqual(av.account('cb')['token'],'cb-alias-token')
    def test_open_po_filter_excludes_closed_before_pagination(self):
        av.save(('mvr','orders','2026-10-01','2026-10-09'),dict(rows=[dict(purchaseOrderNumber='P1',purchaseOrderState='Closed'),dict(purchaseOrderNumber='P2',purchaseOrderState='New'),dict(purchaseOrderNumber='P3',purchaseOrderState='Acknowledged')],status='DONE'))
        url='/api/amazon-vendor/data?account=mvr&kind=orders&start=2026-10-01&end=2026-10-09&orderStatus=open&orderView=orders&limit=1&page=2'
        result=self.client.get(url).json
        self.assertEqual(result['total'],2)
        self.assertEqual(result['rows'][0]['purchaseOrderNumber'],'P3')
        self.assertEqual(result['orderCounts'],{'all':3,'open':2})
        self.assertEqual(self.client.get(url.replace('account=mvr','account=cb')).json['total'],0)
    def test_sales_range_returns_available_data_while_missing_day_is_pending(self):
        av.save(('mvr','sales@MANUFACTURING','2026-10-09','2026-10-09'),dict(rows=[{'asin':'A','orderedUnits':5}],status='DONE',updated='2026-10-12T00:00:00Z'))
        av.save(('mvr','sales@MANUFACTURING','2026-10-08','2026-10-10'),dict(rows=[],status='IN_PROGRESS',report_id='pending-range'))
        result=self.client.get('/api/amazon-vendor/data?account=mvr&kind=sales&distributorView=MANUFACTURING&start=2026-10-08&end=2026-10-10&exact=false').json
        self.assertEqual(result['total'],1)
        self.assertEqual(result['summary']['orderedUnits'],5)
        self.assertFalse(result['coverage']['complete'])
        self.assertEqual(result['coverage']['dates'],['2026-10-09'])
        self.assertEqual(result['status'],'IN_PROGRESS')
    def test_single_day_inventory_keeps_report_id_and_polls_same_report(self):
        body=dict(account='mvr',kind='inventory',distributorView='MANUFACTURING',start='2026-10-09',end='2026-10-09')
        key=('mvr','inventory@MANUFACTURING','2026-10-09','2026-10-09')
        with patch.object(av,'amazon',return_value={'reportId':'mvr-inventory'}) as create:
            self.assertEqual(self.client.post('/api/amazon-vendor/sync',json=body).json['status'],'IN_QUEUE')
            self.assertEqual(av.snapshot(key)['report_id'],'mvr-inventory')
            with patch.object(av,'report_rows',side_effect=[dict(status='IN_PROGRESS'),dict(status='DONE',rows=[{'asin':'A'}])]) as poll:
                self.assertEqual(self.client.post('/api/amazon-vendor/sync',json=body).json['status'],'IN_PROGRESS')
                self.assertEqual(av.snapshot(key)['report_id'],'mvr-inventory')
                self.assertEqual(self.client.post('/api/amazon-vendor/sync',json=body).json['status'],'DONE')
                self.assertEqual(poll.call_count,2)
                self.assertTrue(all(call.args[1]=='mvr-inventory' for call in poll.call_args_list))
            self.assertEqual(create.call_count,1)
    def test_sync_rate_limit_returns_pending_with_retry_delay(self):
        body=dict(account='mvr',kind='sales',start='2026-10-09',end='2026-10-09')
        with patch.object(av,'amazon',side_effect=av.VendorError('limited',429,75)):
            result=self.client.post('/api/amazon-vendor/sync',json=body)
        self.assertEqual(result.status_code,202)
        self.assertEqual(result.json['status'],'IN_PROGRESS')
        self.assertEqual(result.json['retryAfter'],75)
        self.assertEqual(av.snapshot(('mvr','sales','2026-10-09','2026-10-09'))['status'],'waiting')

    def test_sales_apply_reuses_completed_report_without_amazon_call(self):
        av.save(('mvr','sales@MANUFACTURING','2026-10-09','2026-10-09'),dict(rows=[{'asin':'A','orderedUnits':10}],status='DONE'))
        with patch.object(av,'amazon') as remote:
            result=self.client.post('/api/amazon-vendor/sync',json=dict(account='mvr',kind='sales',distributorView='MANUFACTURING',start='2026-10-09',end='2026-10-09'))
            self.assertEqual(result.json['status'],'DONE')
            remote.assert_not_called()

    def test_report_creation_cooldown_is_isolated_by_authorization(self):
        with patch.object(av,'REQUEST_WINDOWS',{}),patch.object(av.time,'monotonic',return_value=100):
            av.request_window(av.account('mvr'),'/reports/2021-06-30/reports',{})
            av.request_window(av.account('master-cj'),'/reports/2021-06-30/reports',{})
            with self.assertRaises(av.VendorError) as error:
                av.request_window(av.account('mvr'),'/reports/2021-06-30/reports',{})
            self.assertEqual(error.exception.status,429)
            self.assertEqual(error.exception.retry_after,60)
    def test_inventory_monday_cutoff_is_friday(self):
        self.cutoff.stop()
        from datetime import datetime,timezone
        self.assertEqual(av.inventory_latest_date(datetime(2026,10,12,5,tzinfo=timezone.utc)),'2026-10-09')
        self.assertEqual(av.inventory_latest_date(datetime(2026,10,11,19,tzinfo=timezone.utc)),'2026-10-09')
        self.assertEqual(av.inventory_latest_date(datetime(2026,10,15,5,tzinfo=timezone.utc)),'2026-10-13')

    def test_sales_daily_rows_are_summed_before_pagination(self):
        rows=[dict(asin='A',startDate='2026-10-'+str(day).zfill(2),endDate='2026-10-'+str(day).zfill(2),orderedUnits=2,orderedRevenue=dict(amount=100,currencyCode='INR')) for day in range(1,13)]
        rows.append(dict(asin='B',startDate='2026-10-01',endDate='2026-10-01',orderedUnits=0,orderedRevenue=dict(amount=0,currencyCode='INR')))
        av.save(('cb','sales@MANUFACTURING','2026-10-01','2026-10-12'),dict(rows=rows,status='DONE'))
        response=self.client.get('/api/amazon-vendor/data?account=cb&kind=sales&distributorView=MANUFACTURING&start=2026-10-01&end=2026-10-12&limit=25').json
        self.assertEqual(response['total'],2)
        self.assertEqual(response['totalPages'],1)
        self.assertEqual(response['rows'][0]['orderedUnits'],24)
        self.assertEqual(response['rows'][0]['orderedRevenue']['amount'],1200)
        self.assertEqual(response['summary']['orderedUnits'],24)

    def test_inventory_apply_normalizes_end_date_and_returns_effective_dates(self):
        body=dict(account='mvr',kind='inventory',distributorView='MANUFACTURING',reportPeriod='DAY',start='2026-10-01',end='2026-10-10')
        with patch.object(av,'inventory_latest_date',return_value='2026-10-09'),patch.object(av,'amazon',return_value={'reportId':'cutoff'}) as remote:
            result=self.client.post('/api/amazon-vendor/sync',json=body)
            self.assertEqual(result.json['effectiveRange']['end'],'2026-10-09')
            self.assertEqual(remote.call_args.kwargs['body']['dataEndTime'][:10],'2026-10-09')

    def test_sales_apply_uses_same_cutoff_as_inventory(self):
        body=dict(account='mvr',kind='sales',distributorView='MANUFACTURING',reportPeriod='DAY',start='2026-10-01',end='2026-10-12')
        with patch.object(av,'inventory_latest_date',return_value='2026-10-09'),patch.object(av,'amazon',return_value={'reportId':'sales-cutoff'}) as remote:
            result=self.client.post('/api/amazon-vendor/sync',json=body)
            self.assertEqual(result.json['effectiveRange']['end'],'2026-10-09')
            self.assertEqual(remote.call_args.kwargs['body']['dataEndTime'][:10],'2026-10-09')
            invalid=self.client.post('/api/amazon-vendor/sync',json={**body,'start':'2026-10-10'})
            self.assertEqual(invalid.status_code,400)
            self.assertIn('Sales is available through 2026-10-09',invalid.json['message'])
    def test_long_daily_inventory_sync_uses_fifteen_day_chunks(self):
        body=dict(account='cb',kind='inventory',distributorView='MANUFACTURING',start='2026-09-10',end='2026-10-09')
        with patch.dict(os.environ,{'AMAZON_RAYOM_VENDOR_CB_TOKEN':'cb-token'}), patch.object(av,'amazon',return_value={'reportId':'chunk'}) as remote, patch.object(av,'report_rows',return_value=dict(status='DONE',rows=[{'asin':'A','startDate':'2026-09-10','endDate':'2026-09-24'}])):
            for _ in range(5): result=self.client.post('/api/amazon-vendor/sync',json=body)
            self.assertEqual(result.json['status'],'DONE')
            self.assertEqual(remote.call_count,2)
            self.assertEqual(remote.call_args_list[0].kwargs['body']['dataEndTime'][:10],'2026-09-24')
            self.assertEqual(remote.call_args_list[1].kwargs['body']['dataStartTime'][:10],'2026-09-25')
            self.assertEqual(remote.call_args_list[1].kwargs['body']['dataEndTime'][:10],'2026-10-09')
    def test_range_reads_saved_days_without_saving_partial_range(self):
        for day,units in [('08',10),('09',20)]:
            av.save(('cb','inventory@MANUFACTURING','2026-10-'+day,'2026-10-'+day),dict(rows=[{'asin':'ENERGIZER','sellableOnHandInventoryUnits':units}],status='DONE',updated='2026-10-10T12:00:00Z'))
        av.save(('cb','inventory@MANUFACTURING','2026-10-07','2026-10-10'),dict(rows=[{'asin':'ENERGIZER','startDate':'2026-10-08','endDate':'2026-10-08','sellableOnHandInventoryUnits':15}],status='DONE',updated='2026-10-11T12:00:00Z'))
        base='/api/amazon-vendor/data?account=cb&kind=inventory&distributorView=MANUFACTURING&start=2026-10-01&end=2026-10-12'
        result=self.client.get(base+'&limit=1').json
        self.assertEqual(result['total'],1)
        self.assertEqual(result['rows'][0]['sellableOnHandInventoryUnits'],20)
        self.assertEqual(result['summary']['sellableOnHandInventoryUnits'],20)
        self.assertEqual(result['coverage']['dates'],['2026-10-08','2026-10-09'])
        self.assertFalse(result['coverage']['complete'])
        self.assertEqual(av.snapshot(('cb','inventory@MANUFACTURING','2026-10-01','2026-10-12'))['status'],'waiting')
        self.assertEqual(self.client.get(base.replace('account=cb','account=cj')).json['total'],0)
        self.assertEqual(self.client.get(base.replace('MANUFACTURING','SOURCING')).json['total'],0)
        narrow=self.client.get(base.replace('2026-10-01','2026-10-09').replace('2026-10-12','2026-10-10')).json
        self.assertEqual(narrow['total'],1)
        exact=self.client.get(base+'&exact=true').json
        self.assertEqual(exact['rows'],[])
        self.assertIsNone(exact['coverage'])

    def test_inventory_asin_rows_sum_receipts_and_keep_latest_stock(self):
        rows=av.inventory_asin_rows([dict(asin='A',endDate='2026-10-08',netReceivedInventoryUnits=10,sellableOnHandInventoryUnits=100),dict(asin='A',endDate='2026-10-09',netReceivedInventoryUnits=-2,sellableOnHandInventoryUnits=90)])
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['netReceivedInventoryUnits'],8)
        self.assertEqual(rows[0]['sellableOnHandInventoryUnits'],90)

    def test_apply_reuses_complete_cached_inventory_dates(self):
        for day in ('08','09'):
            av.save(('mvr','inventory@MANUFACTURING','2026-10-'+day,'2026-10-'+day),dict(rows=[{'asin':'A'}],status='DONE',updated='2026-10-10T12:00:00Z'))
        body=dict(account='mvr',kind='inventory',distributorView='MANUFACTURING',start='2026-10-08',end='2026-10-09')
        with patch.object(av,'amazon') as remote:
            result=self.client.post('/api/amazon-vendor/sync',json=body)
            self.assertEqual(result.json['status'],'DONE')
            remote.assert_not_called()
        result=self.client.get('/api/amazon-vendor/data?'+ '&'.join(k+'='+v for k,v in body.items())+'&exact=true').json
        self.assertEqual(result['status'],'DONE')
        self.assertEqual(result['total'],1)

    def test_inventory_requests_only_missing_dates(self):
        av.save(('mvr','inventory@MANUFACTURING','2026-10-01','2026-10-09'),dict(rows=[dict(asin='A',startDate='2026-10-'+str(day).zfill(2),endDate='2026-10-'+str(day).zfill(2)) for day in range(1,10)],status='DONE',updated='2026-10-12T00:00:00Z'))
        body=dict(account='mvr',kind='inventory',distributorView='MANUFACTURING',start='2026-10-01',end='2026-10-10')
        with patch.object(av,'amazon',return_value={'reportId':'missing'}) as remote:
            result=self.client.post('/api/amazon-vendor/sync',json=body)
            self.assertEqual(result.json['status'],'IN_QUEUE')
            self.assertEqual(remote.call_args.kwargs['body']['dataStartTime'][:10],'2026-10-10')
            self.assertEqual(remote.call_args.kwargs['body']['dataEndTime'][:10],'2026-10-10')
        with patch.object(av,'report_rows',return_value=dict(status='FATAL')):
            result=self.client.post('/api/amazon-vendor/sync',json=body)
            self.assertEqual(result.status_code,502)
            self.assertIn('2026-10-10 to 2026-10-10',result.json['message'])
    def test_available_snapshot_matches_account_and_report_view(self):
        av.save(('cb','inventory@MANUFACTURING','2026-10-08','2026-10-08'),dict(rows=[{'asin':'ENERGIZER'}],status='DONE',updated='2026-10-10T12:00:00Z'))
        base='/api/amazon-vendor/data?account=cb&kind=inventory&distributorView=MANUFACTURING&start=2026-10-09&end=2026-10-09'
        result=self.client.get(base).json
        self.assertEqual(result['rows'],[])
        self.assertEqual(result['availableSnapshot']['start'],'2026-10-08')
        self.assertIsNone(self.client.get(base.replace('account=cb','account=cj')).json['availableSnapshot'])
        self.assertIsNone(self.client.get(base.replace('MANUFACTURING','SOURCING')).json['availableSnapshot'])
    def test_saved_data_search_pagination_and_account_isolation(self):
        av.save(('rayom','sales','2026-09-01','2026-09-02'),dict(rows=[{'asin':'ASIN'+str(i)} for i in range(61)],status='DONE'))
        base='/api/amazon-vendor/data?account=rayom&kind=sales&start=2026-09-01&end=2026-09-02'
        data=self.client.get(base+'&limit=50&page=2').json
        self.assertEqual(len(data['rows']),11);self.assertEqual(data['total'],61);self.assertEqual(data['page'],2)
        self.assertEqual(self.client.get(base+'&search=ASIN60').json['total'],1)
        self.assertEqual(self.client.get(base.replace('account=rayom','account=mvr')).json['total'],0)
    def test_order_windows_pagination_and_duplicate_boundaries(self):
        key,after,before=av.selection(dict(account='rayom',kind='orders',start='2026-09-01',end='2026-09-10'))
        calls=[]
        def fake(config,path,params=None,body=None):
            calls.append(params)
            if len(calls)==1:return {'payload':{'orders':[{'purchaseOrderNumber':'PO1'}],'pagination':{'nextToken':'next'}}}
            return {'payload':{'orders':[{'purchaseOrderNumber':'PO1'},{'purchaseOrderNumber':'PO2'}]}}
        with patch.object(av,'amazon',fake): rows=av.load_rows(av.account('rayom'),'orders',after,before)
        self.assertEqual(len(rows),2);self.assertEqual(len(calls),5);self.assertEqual(calls[1]['nextToken'],'next')
        self.assertTrue(any('changedAfter' in call for call in calls))
    def test_failed_sync_preserves_existing_snapshot(self):
        key=('rayom','invoices','2026-09-01','2026-09-02');av.save(key,dict(rows=[{'invoiceNumber':'old'}],status='DONE'))
        with patch.object(av,'load_rows',side_effect=av.VendorError('Amazon unavailable',502)):
            response=self.client.post('/api/amazon-vendor/sync',json=dict(zip(('account','kind','start','end'),key)))
        self.assertEqual(response.status_code,502);self.assertEqual(av.snapshot(key)['rows'][0]['invoiceNumber'],'old')
        result=self.client.get('/api/amazon-vendor/data?account=rayom&kind=invoices&start=2026-09-01&end=2026-09-02').json
        self.assertEqual(result['syncError'],'Amazon unavailable')
        other=self.client.get('/api/amazon-vendor/data?account=mvr&kind=invoices&start=2026-09-01&end=2026-09-02').json
        self.assertIsNone(other['syncError'])
    def test_reports_are_requested_then_checked_without_duplicates(self):
        body=dict(account='rayom',kind='sales',start='2026-09-01',end='2026-09-02')
        with patch.object(av,'amazon',return_value={'reportId':'report1'}) as create:
            self.assertEqual(self.client.post('/api/amazon-vendor/sync',json=body).json['status'],'IN_QUEUE')
            self.assertEqual(create.call_args.kwargs['body']['reportOptions']['reportPeriod'],'DAY')
        with patch.object(av,'report_rows',return_value=dict(status='DONE',rows=[{'asin':'B1'}])):
            self.assertEqual(self.client.post('/api/amazon-vendor/sync',json=body).json['status'],'DONE')
        self.assertEqual(av.snapshot(tuple(body.values()))['rows'][0]['asin'],'B1')


    def test_report_period_and_view_cache_are_separate(self):
        base=dict(account='mvr',kind='inventory',start='2025-01-01',end='2025-12-31',distributorView='MANUFACTURING',reportPeriod='YEAR')
        key,_,_=av.selection(base)
        self.assertEqual(key[1],'inventory@MANUFACTURING@YEAR')
        sourcing,_,_=av.selection(dict(base,distributorView='SOURCING'))
        self.assertNotEqual(key,sourcing)
        with self.assertRaises(av.VendorError): av.selection(dict(base,reportPeriod='DAY'))
        with self.assertRaises(av.VendorError): av.selection(dict(base,reportPeriod='INVALID'))

    def test_inventory_totals_use_all_rows_and_latest_period(self):
        key=('mvr','inventory@MANUFACTURING','2026-10-07','2026-10-08')
        av.save(key,dict(status='DONE',rows=[{'asin':'A','endDate':'2026-10-07','openPurchaseOrderUnits':999},{'asin':'A','endDate':'2026-10-08','openPurchaseOrderUnits':40,'vendorConfirmationRate':0.2},{'asin':'B','endDate':'2026-10-08','openPurchaseOrderUnits':30,'vendorConfirmationRate':0.8}]))
        result=self.client.get('/api/amazon-vendor/data?account=mvr&kind=inventory&distributorView=MANUFACTURING&start=2026-10-07&end=2026-10-08&limit=1&search=A').json
        self.assertEqual(len(result['rows']),1)
        self.assertEqual(result['summary']['openPurchaseOrderUnits'],70)
        self.assertNotIn('vendorConfirmationRate',result['summary'])

    def test_vendor_central_raw_values_map_by_column_id(self):
        import json
        with open(os.path.join(os.path.dirname(__file__),'fixtures','vendor_inventory_raw.json'),encoding='utf-8') as source: payload=json.load(source)
        rows,aggregate=av.normalize_inventory_report(payload)
        self.assertEqual(len(rows),9)
        self.assertEqual(rows[0]['productTitle'],payload['reportData']['rows'][0][1]['rawValue'])
        self.assertEqual(rows[0]['brand'],'Energizer')
        self.assertEqual(rows[0]['_cells']['productTitle'],payload['reportData']['rows'][0][1])
        self.assertEqual(rows[0]['_cells']['netReceivedInventoryUnits'],{'rawValue':'0.0','decoration':'quantity','currencyCode':'INR','value':'0'})
        self.assertEqual(sum(row.get('openPurchaseOrderUnits',0) for row in rows),211)
        self.assertEqual(sum(row['sellableOnHandInventoryUnits'] for row in rows),1349)
        self.assertEqual(rows[0]['vendorConfirmationRate'],0)
        self.assertEqual(rows[0]['sellableOnHandInventoryCost']['currencyCode'],'INR')
        self.assertEqual(aggregate,[])
        # Column reordering must not change names or values.
        payload['reportData']['columns'].reverse()
        for row in payload['reportData']['rows']: row.reverse()
        reordered,_=av.normalize_inventory_report(payload)
        self.assertEqual(reordered,rows)

    def test_catalog_enrichment_preserves_raw_titles_and_caches_by_account(self):
        self.enrich.stop()
        config=av.account('mvr')
        result={'items':[{'asin':'TESTASIN','summaries':[{'marketplaceId':config['marketplace'],'itemName':'Catalog Title','brand':'Catalog Brand'}]}]}
        with patch.object(av,'amazon',return_value=result) as remote:
            rows=[{'asin':'TESTASIN'}]
            self.assertIsNone(av.enrich_products(config,rows))
            self.assertEqual(rows[0]['productTitle'],'Catalog Title')
            self.assertEqual(rows[0]['brand'],'Catalog Brand')
            av.enrich_products(config,[{'asin':'TESTASIN'}])
            self.assertEqual(remote.call_count,1)
            original=[{'asin':'TESTASIN','productTitle':'Exact rawValue Title','brand':'Raw Brand'}]
            av.enrich_products(config,original)
            self.assertEqual(original[0]['productTitle'],'Exact rawValue Title')
            self.assertEqual(original[0]['brand'],'Raw Brand')
            av.enrich_products(av.account('master-cj'),[{'asin':'TESTASIN'}])
            self.assertEqual(remote.call_count,2)

    def test_switching_accounts_reads_cached_data_without_amazon_calls(self):
        self.enrich.stop()
        av.save(('mvr','inventory@MANUFACTURING','2026-10-08','2026-10-08'),dict(rows=[{'asin':'A'}],status='DONE'))
        with av.connection() as db:
            db.execute('INSERT INTO catalog_products VALUES (?,?,?,?,?,?)',('mvr','A21TJRUUN4KGV','A','Cached title','Cached brand',0))
        with patch.object(av,'amazon') as remote:
            result=self.client.get('/api/amazon-vendor/data?account=mvr&kind=inventory&distributorView=MANUFACTURING&start=2026-10-08&end=2026-10-08&exact=true')
            self.assertEqual(result.json['rows'][0]['productTitle'],'Cached title')
            remote.assert_not_called()

    def test_cb_has_separate_refresh_token_and_saved_data(self):
        with patch.dict(os.environ,{'AMAZON_RAYOM_VENDOR_CB_TOKEN':'cb-only-token'}):
            self.assertEqual(av.account('cb')['token'],'cb-only-token')
            self.assertNotEqual(av.account('cb')['token'],av.account('mvr')['token'])
            accounts=self.client.get('/api/amazon-vendor/accounts').json['accounts']
            self.assertTrue(next(row for row in accounts if row['id']=='cb')['ready'])
            av.save(('cb','inventory','2026-10-08','2026-10-08'),dict(rows=[{'asin':'CBASIN'}],status='DONE'))
            result=self.client.get('/api/amazon-vendor/data?account=cb&kind=inventory&start=2026-10-08&end=2026-10-08').json
            self.assertEqual(result['rows'][0]['asin'],'CBASIN')
            result=self.client.get('/api/amazon-vendor/data?account=mvr&kind=inventory&start=2026-10-08&end=2026-10-08').json
            self.assertEqual(result['rows'],[])

    def test_status_poll_does_not_requeue_completed_empty_sales(self):
        av.save(('mvr','sales@MANUFACTURING','2026-10-08','2026-10-08'),dict(rows=[],status='DONE'))
        with patch.object(av,'amazon') as remote:
            result=self.client.post('/api/amazon-vendor/sync',json=dict(account='mvr',kind='sales',distributorView='MANUFACTURING',start='2026-10-08',end='2026-10-08',checkOnly=True))
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json['status'],'DONE')
            remote.assert_not_called()

    def test_pending_sales_transitions_to_done_without_rows(self):
        av.save(('mvr','sales@MANUFACTURING','2026-10-08','2026-10-08'),dict(rows=[],status='IN_QUEUE',report_id='pending-sales'))
        with patch.object(av,'report_rows',return_value=dict(status='DONE',rows=[])):
            result=self.client.post('/api/amazon-vendor/sync',json=dict(account='mvr',kind='sales',distributorView='MANUFACTURING',start='2026-10-08',end='2026-10-08',checkOnly=True))
            self.assertEqual(result.json['status'],'DONE')
            self.assertEqual(av.snapshot(('mvr','sales@MANUFACTURING','2026-10-08','2026-10-08'))['status'],'DONE')

    def test_sales_totals_include_negative_units_and_all_pages(self):
        key=('cb','sales@MANUFACTURING','2026-10-08','2026-10-08')
        av.save(key,dict(status='DONE',rows=[{'asin':'A','orderedUnits':3,'orderedRevenue':{'amount':6353.4,'currencyCode':'INR'},'shippedUnits':None},{'asin':'B','orderedUnits':-1,'orderedRevenue':{'amount':-1270.34,'currencyCode':'INR'},'shippedUnits':0}]))
        response=self.client.get('/api/amazon-vendor/data?account=cb&kind=sales&distributorView=MANUFACTURING&start=2026-10-08&end=2026-10-08&limit=1').json
        self.assertEqual(len(response['rows']),1)
        self.assertEqual(response['summary']['orderedUnits'],2)
        self.assertEqual(response['summary']['orderedRevenue']['amount'],5083.06)
        self.assertEqual(response['summary']['shippedUnits'],0)

    def test_legacy_rayom_option_hidden_from_vendor_picker(self):
        ids=[row['id'] for row in self.client.get('/api/amazon-vendor/accounts').json['accounts']]
        self.assertNotIn('rayom',ids)
        self.assertIn('master-cj',ids)
        self.assertIn('cb',ids)

    def test_po_items_use_status_quantities_and_do_not_treat_closed_as_cancelled(self):
        orders=[{'purchaseOrderNumber':'PO1','purchaseOrderState':'Closed','orderDetails':{'deliveryWindow':'2026-10-01T00:00:00Z--2026-10-08T00:00:00Z','items':[{'itemSequenceNumber':'1','amazonProductIdentifier':'A','orderedQuantity':{'amount':0}},{'itemSequenceNumber':'2','amazonProductIdentifier':'B'}]},'_orderStatus':{'itemStatus':[{'itemSequenceNumber':'1','orderedQuantity':{'cancelledQuantity':{'amount':10,'unitOfMeasure':'Cases','unitSize':2}},'acknowledgementStatus':{'acceptedQuantity':{'amount':10}}}]}}]
        rows=av.po_item_rows(orders)
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]['cancelledQuantity']['amount'],10)
        self.assertEqual(rows[0]['previousAcceptedQuantity']['amount'],10)
        self.assertIn('cancelled',rows[0]['modificationTypes'])
        self.assertNotIn('cancelled',rows[1]['modificationTypes'])
        self.assertIsNone(rows[1]['cancelledQuantity'])
        self.assertEqual(rows[0]['windowEnd'],'2026-10-08T00:00:00Z')

    def test_cancellation_quantity_comes_from_order_history(self):
        rows=av.po_item_rows([{'purchaseOrderNumber':'PO1','orderDetails':{'items':[{'itemSequenceNumber':'1','amazonProductIdentifier':'A'}]},'_orderStatus':{'itemStatus':[{'itemSequenceNumber':'1','orderedQuantity':{'orderedQuantityDetails':[{'updatedDate':'2026-10-01T14:33:52Z','cancelledQuantity':{'amount':110,'unitSize':1,'unitOfMeasure':'Eaches'}}]}}]}}])
        self.assertEqual(rows[0]['cancelledQuantity']['amount'],110)
        self.assertIn('cancelled',rows[0]['modificationTypes'])
        self.assertEqual(rows[0]['modificationDate'],'2026-10-01T14:33:52Z')
