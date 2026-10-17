import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from flask import Flask
import reorder_planning as rp

class PlanningTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.tmp.cleanup)
        self.db=patch.object(rp,'DB_PATH',Path(self.tmp.name)/'plans.sqlite3')
        self.db.start();self.addCleanup(self.db.stop)
        app=Flask(__name__);app.register_blueprint(rp.planning);self.client=app.test_client()
    def get(self,company='linso'):
        return self.client.get('/api/amazon/reorder-planning?organization='+company)
    def put(self,row,company='linso'):
        return self.client.put('/api/amazon/reorder-planning/'+row['ean']+'?organization='+company,json=row)
    def test_seed_company_separation(self):
        linso=self.get().json['rows'];rayom=self.get('rayom').json['rows']
        self.assertEqual(len(linso),11);self.assertEqual(len(rayom),5)
        self.assertTrue(all(r['brand']=='LINSO' for r in linso))
        self.assertEqual(self.get('shelfesteem').json['rows'],[])
    def test_saved_inputs_reload_zero_and_blank_override(self):
        row=self.get().json['rows'][0];row.update(override=0,incoming=100)
        saved=self.put(row);self.assertEqual(saved.status_code,200)
        reloaded=self.get().json['rows'][0]
        self.assertEqual(reloaded['override'],0);self.assertEqual(reloaded['incoming'],100)
        self.assertEqual(reloaded['revision'],1)
        reloaded['override']=None
        self.assertEqual(self.put(reloaded).status_code,200)
        self.assertIsNone(self.get().json['rows'][0]['override'])
    def test_stale_edits_rejected_and_companies_cannot_read_each_others_changes(self):
        row=self.get().json['rows'][0]
        self.assertEqual(self.put(dict(row,incoming=999)).status_code,200)
        self.assertEqual(self.put(row).status_code,409)
        self.assertNotIn(row['ean'],{r['ean'] for r in self.get('rayom').json['rows']})
    def test_validation_and_new_product(self):
        row=self.get().json['rows'][0]
        for fields in ({'incoming':-1},{'incoming':True},{'incoming':'2'},{'demandDays':0},{'unknown':1}):
            self.assertEqual(self.put(dict(row,**fields)).status_code,400)
        new=dict(ean='8900000000001',productName='New',brand='LINSO',leadTimeDays=60,demandDays=30,revision=0)
        self.assertEqual(self.put(new).status_code,200)
        self.assertIn(new['ean'],{r['ean'] for r in self.get().json['rows']})

if __name__=='__main__':unittest.main()
