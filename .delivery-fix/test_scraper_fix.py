import unittest
from unittest.mock import Mock, patch
from scraper import stable_content, read_price, set_pincode

class FixTests(unittest.TestCase):
 def test_pincode_confirmation_button_is_clicked_before_wait(self):
  page=Mock();page.url='https://www.amazon.in/';postal=Mock();postal.is_visible.return_value=True
  confirm=Mock();confirm.count.return_value=1;confirm.is_visible.return_value=True
  generic=Mock();generic.first=postal;confirmation=Mock();confirmation.first=confirm
  page.locator.side_effect=lambda selector: confirmation if selector.startswith('#GLUXConfirmClose:') else generic
  with patch('scraper.location_text',return_value=None),patch('scraper.stable_content',return_value='<html/>'):
   set_pincode(page,{'pincode':'110001'})
  confirm.click.assert_called_once()
  page.wait_for_function.assert_called_once()

 def test_unconfirmed_pincode_returns_clear_error(self):
  page=Mock();page.url='https://www.amazon.in/';element=Mock();element.is_visible.return_value=True;element.count.return_value=0
  page.locator.return_value.first=element
  page.wait_for_function.side_effect=RuntimeError('Timeout 20000ms exceeded')
  with patch('scraper.location_text',side_effect=[None,'Delivering to 400001']),patch('scraper.stable_content',return_value='<html/>'):
   with self.assertRaisesRegex(RuntimeError,'did not confirm pincode 110001'):
    set_pincode(page,{'pincode':'110001'})
 def test_content_recovers_from_navigation(self):
  page=Mock()
  page.content.side_effect=[RuntimeError('Page.content: Unable to retrieve content because the page is navigating and changing the content.'),'<html>ready</html>']
  self.assertEqual(stable_content(page),'<html>ready</html>')
  self.assertEqual(page.content.call_count,2)
  page.wait_for_load_state.assert_called_once()

 def test_content_retry_is_bounded(self):
  page=Mock();page.content.side_effect=RuntimeError('page is navigating')
  with self.assertRaisesRegex(RuntimeError,'did not settle'): stable_content(page)
  self.assertEqual(page.content.call_count,4)

 def test_price_uses_visible_alternate_buybox(self):
  page=Mock();empty=Mock();empty.count.return_value=0
  group=Mock();group.is_visible.return_value=True
  price=Mock();price.count.return_value=1;price.text_content.return_value='₹39,999.50'
  group.locator.return_value.first=price
  matches=Mock();matches.count.return_value=1;matches.nth.return_value=group
  page.locator.side_effect=lambda selector: matches if selector.startswith('#corePrice_feature_div') else empty
  self.assertEqual(read_price(page),39999.50)

 def test_empty_offscreen_price_falls_back_to_visible_selling_price(self):
  page=Mock();empty=Mock();empty.count.return_value=0
  group=Mock();group.is_visible.return_value=True;group.inner_text.return_value='₹44,999'
  price=Mock();price.count.return_value=1;price.text_content.return_value=' '
  group.locator.return_value.first=price
  matches=Mock();matches.count.return_value=1;matches.nth.return_value=group
  page.locator.side_effect=lambda selector: matches if selector.startswith('#corePriceDisplay_desktop_feature_div .apex-pricetopay-value') else empty
  self.assertEqual(read_price(page),44999)

if __name__=='__main__': unittest.main()
