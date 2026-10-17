from playwright.sync_api import sync_playwright
import json
from scraper import read_price
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True)
 try:
  page=browser.new_page(locale='en-IN')
  page.goto('https://www.amazon.in/dp/B0GP6VJMVD',wait_until='domcontentloaded',timeout=45000)
  page.wait_for_timeout(2500)
  print('Extracted selling price:',read_price(page))
  for el in page.locator('#corePriceDisplay_desktop_feature_div .apex-pricetopay-value, #apex_price .apex-pricetopay-value').all():
   print('PRICE DEBUG',el.is_visible(),repr(el.inner_text()),el.locator('.a-offscreen').count(),repr(el.locator('.a-offscreen').first.text_content()) if el.locator('.a-offscreen').count() else '')
  print(json.dumps(page.locator('.a-price, [id*=price], [id*=Price]').evaluate_all('els=>els.filter(e=>e.offsetWidth||e.offsetHeight).slice(0,30).map(e=>({id:e.id,cls:e.className,text:e.innerText.slice(0,180)}))'),ensure_ascii=True))
 finally: browser.close()
