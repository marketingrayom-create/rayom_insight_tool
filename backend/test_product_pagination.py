import unittest
from unittest.mock import patch
import app as integration


class ProductPaginationTests(unittest.TestCase):
    def setUp(self):
        self.client = integration.app.test_client()
        self.rows = [{'asin': f'A{i:02}', 'itemTitle': f'Product {i}', 'drr_1d': i}
                     for i in range(19)]

    def get_page(self, **params):
        with patch.object(integration, 'validate_account'), patch.object(
                integration, 'build_products', return_value=list(self.rows)):
            return self.client.post('/api/amazon/products?organization=rayom', json=params)

    def test_two_pages_cover_all_nineteen_products(self):
        first = self.get_page(page=1, limit=10, sortBy='drr_1d').json
        second = self.get_page(page=2, limit=10, sortBy='drr_1d').json
        self.assertEqual((len(first['products']), len(second['products'])), (10, 9))
        self.assertEqual(first['total'], 19)
        self.assertTrue(first['hasNext'])
        self.assertFalse(second['hasNext'])
        self.assertEqual(len({row['asin'] for row in first['products'] + second['products']}), 19)

    def test_larger_page_and_sort(self):
        result = self.get_page(limit=25, sortBy='drr_1d', sortOrder='asc').json
        self.assertEqual(len(result['products']), 19)
        self.assertEqual(result['products'][0]['asin'], 'A00')
        self.assertFalse(result['hasNext'])

    def test_search_before_pagination_and_count(self):
        result = self.get_page(search='product 18', limit=10).json
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['products'][0]['asin'], 'A18')

    def test_invalid_page_and_limit(self):
        for params in ({'page': 0}, {'limit': 0}, {'limit': 101}, {'page': 'invalid'}):
            self.assertEqual(self.get_page(**params).status_code, 400)


if __name__ == '__main__':
    unittest.main()
