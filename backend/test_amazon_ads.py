import unittest
from unittest.mock import patch, Mock
from flask import Flask
import amazon_ads as ads

class AdsTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(ads.amazon_ads)
        self.client = app.test_client()
        ads._reports.clear()

    def test_missing_credentials_and_company_isolation(self):
        with patch.dict(ads.os.environ, {"AMAZON_ADS_CLIENT_ID": "shelf"}, clear=True):
            response = self.client.get("/api/advertising/amazon?organization=rayom")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(len(response.json["missing"]), 4)
        self.assertTrue(all(name.startswith("AMAZON_RAYOM_ADS_") for name in response.json["missing"]))

    def test_metrics_use_ratio_of_sums_and_zero_sales_is_unavailable(self):
        result = ads.aggregate([{"cost": 100, "sales7d": 200}, {"cost": 50, "sales7d": 800}])
        self.assertEqual(result["acos"], 15)
        self.assertIsNone(ads.aggregate([])["acos"])
        self.assertIsNone(result["tacos"])

    def test_report_pending_then_complete(self):
        config = {"CLIENT_ID": "client", "CLIENT_SECRET": "secret", "REFRESH_TOKEN": "token", "PROFILE_ID": "profile"}
        token = Mock(ok=True); token.json.return_value = {"access_token": "access"}
        created = Mock(ok=True); created.json.return_value = {"reportId": "report"}
        pending = Mock(ok=True); pending.json.return_value = {"status": "PENDING"}
        complete = Mock(ok=True); complete.json.return_value = {"status": "COMPLETED", "url": "https://example.test/report"}
        download = Mock(content=b'[{"cost":10,"sales7d":100,"clicks":2,"impressions":30}]')
        with patch.object(ads, "configuration", return_value=(config, [])), patch.object(ads.requests, "post", side_effect=[token, created, token]), patch.object(ads.requests, "get", side_effect=[pending, complete, download]):
            first = self.client.get("/api/advertising/amazon?organization=rayom")
            second = self.client.get("/api/advertising/amazon?organization=rayom")
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json["totals"]["acos"], 10)
        self.assertEqual(second.json["organization"], "rayom")

if __name__ == "__main__":
    unittest.main()
