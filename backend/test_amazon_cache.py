import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from time import sleep
from unittest.mock import patch
from flask import Flask
from amazon_cache import cached_amazon


class CacheTests(unittest.TestCase):
    def test_concurrent_requests_fetch_once_and_do_not_share_mutable_rows(self):
        calls = []
        @cached_amazon()
        def load():
            calls.append(1)
            sleep(.02)
            return [{'sku': 'original'}]
        with ThreadPoolExecutor(max_workers=4) as pool:
            values = list(pool.map(lambda _: load(), range(4)))
        self.assertEqual(len(calls), 1)
        values[0][0]['sku'] = 'changed'
        self.assertEqual(load()[0]['sku'], 'original')

    def test_company_and_credential_change_isolate_cache(self):
        app = Flask(__name__)
        calls = []
        @cached_amazon()
        def load():
            calls.append(1)
            return len(calls)
        with app.test_request_context('/?organization=rayom'):
            self.assertEqual(load(), 1)
            self.assertEqual(load(), 1)
        with app.test_request_context('/?organization=shelfesteem'):
            self.assertEqual(load(), 2)
        with patch.dict('os.environ', {'AMAZON_RAYOM_SP_API_REFRESH_TOKEN': 'new-token'}):
            with app.test_request_context('/?organization=rayom'):
                self.assertEqual(load(), 3)

    def test_expired_and_failed_fetches_retry(self):
        calls = []
        @cached_amazon(seconds=0)
        def load():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError('temporary failure')
            return len(calls)
        with self.assertRaises(RuntimeError):
            load()
        self.assertEqual(load(), 2)
        self.assertEqual(load(), 3)
