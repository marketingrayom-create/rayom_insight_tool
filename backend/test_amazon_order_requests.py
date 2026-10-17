import unittest
from unittest.mock import Mock, patch
import amazon_order_requests as pacing


class OrderPacingTests(unittest.TestCase):
    def test_separate_clients_share_account_operation_budget(self):
        pacing._states.clear()
        self.addCleanup(pacing._states.clear)
        clock = [100.0]
        def sleep(seconds):
            clock[0] += seconds
        with patch.object(pacing.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(pacing.time, 'sleep', side_effect=sleep) as wait:
            pacing.order_api_call('get_orders', Mock(), {'refresh_token':'linso'})
            pacing.order_api_call('get_orders', Mock(), {'refresh_token':'linso'})
            wait.assert_called_once_with(60.0)
            pacing.order_api_call('get_orders', Mock(), {'refresh_token':'other'})
            self.assertEqual(wait.call_count, 1)
            pacing.order_api_call('get_order_items', Mock(), {'refresh_token':'linso'})
            self.assertEqual(wait.call_count, 1)
