import unittest
from unittest.mock import patch
import app as integration


class SalesReportRefreshTests(unittest.TestCase):
    def setUp(self):
        integration._sales_refreshing.clear()
        integration._sales_retry_after.clear()

    def test_cold_requests_return_without_waiting_and_start_once_per_company(self):
        with patch.object(integration, 'Thread') as thread:
            for company in ('rayom', 'rayom', 'shelfesteem'):
                with integration.app.test_request_context('/?organization=' + company):
                    integration.REPORT_CACHE.update(data=None, created_at=None)
                    self.assertEqual(integration.sales_report(), {})
            self.assertEqual(thread.call_count, 2)
            self.assertEqual(thread.return_value.start.call_count, 2)

    def test_stale_report_is_served_and_worker_keeps_company_context(self):
        from amazon_accounts import organization
        companies = []
        with patch.object(integration, 'Thread') as thread, patch.object(
                integration, '_generate_sales_report', side_effect=lambda: companies.append(organization())), patch.object(
                integration.build_products, 'cache_clear') as clear:
            with integration.app.test_request_context('/?organization=rayom'):
                integration.REPORT_CACHE.update(data={'sales': 'previous'}, created_at=0)
                self.assertEqual(integration.sales_report(), {'sales': 'previous'})
            thread.call_args.kwargs['target']()
            self.assertEqual(companies, ['rayom'])
            clear.assert_called_once()
            self.assertNotIn('rayom', integration._sales_refreshing)

    def test_fresh_report_does_not_start_worker(self):
        with integration.app.test_request_context('/?organization=rayom'), patch.object(integration, 'Thread') as thread:
            integration.REPORT_CACHE.update(data={'fresh': True}, created_at=integration.time.time())
            self.assertEqual(integration.sales_report(), {'fresh': True})
            thread.assert_not_called()


class OrderSalesRefreshTests(unittest.TestCase):
    def setUp(self):
        integration._order_sales_refreshing.clear()
        integration._order_sales_retry_after.clear()

    def test_cold_company_requests_start_one_background_calculation(self):
        with patch.object(integration, 'Thread') as thread:
            for company in ('rayom', 'rayom', 'shelfesteem'):
                with integration.app.test_request_context('/?organization=' + company):
                    integration.ORDERS_CACHE.update(data=None, created_at=None)
                    self.assertEqual(integration.amazon_brand_sales(), {})
            self.assertEqual(thread.call_count, 2)

    def test_worker_keeps_company_and_invalidates_product_rows(self):
        from amazon_accounts import organization
        companies = []
        with patch.object(integration, 'Thread') as thread, patch.object(
                integration, '_calculate_amazon_brand_sales', side_effect=lambda: companies.append(organization())), patch.object(
                integration.build_products, 'cache_clear') as clear:
            with integration.app.test_request_context('/?organization=rayom'):
                integration.ORDERS_CACHE.update(data={'ASIN': {'sales1d': 2}}, created_at=0)
                self.assertEqual(integration.amazon_brand_sales(), {'ASIN': {'sales1d': 2}})
            thread.call_args.kwargs['target']()
            self.assertEqual(companies, ['rayom'])
            clear.assert_called_once()
            self.assertNotIn('rayom', integration._order_sales_refreshing)

    def test_failure_releases_worker_and_backs_off(self):
        with patch.object(integration, 'Thread') as thread, patch.object(
                integration, '_calculate_amazon_brand_sales', side_effect=RuntimeError('temporary')), patch.object(
                integration.app.logger, 'exception'):
            with integration.app.test_request_context('/?organization=rayom'):
                integration.ORDERS_CACHE.update(data=None, created_at=None)
                integration.amazon_brand_sales()
            thread.call_args.kwargs['target']()
            with integration.app.test_request_context('/?organization=rayom'):
                integration.amazon_brand_sales()
            self.assertEqual(thread.call_count, 1)
            self.assertNotIn('rayom', integration._order_sales_refreshing)


if __name__ == '__main__':
    unittest.main()
