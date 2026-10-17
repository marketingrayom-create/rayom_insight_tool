"""Read-only Uniware inventory, with facility-scoped caches and explicit SKU mapping."""
import os
import re
import time
from threading import Lock
import requests

_token = None
_expires = 0
_cache = {}
_lock = Lock()


def facility(company):
    defaults = {'shelfesteem': 'shelfesteembrandlabsprivatelimited',
                'rayom': 'RAYOMBUSINESSCASEPRIVATELIMITED',
                'linso': 'RAYOMBUSINESSCASEPRIVATELIMITED'}
    return os.getenv('UNIWARE_' + company.upper() + '_FACILITY') or defaults[company]


def _base():
    # Credentials must only be sent to the configured Uniware HTTPS tenant.
    base = os.getenv('UNIWARE_BASE_URL', 'https://shelfesteembrandlabsprivatelimited.unicommerce.com').rstrip('/')
    if not re.fullmatch(r'https://[a-zA-Z0-9-]+\.unicommerce\.com', base):
        raise RuntimeError('Invalid Uniware tenant URL.')
    return base


def _access_token():
    global _token, _expires
    if _token and time.monotonic() < _expires:
        return _token
    email = os.getenv('UNIWARE_EMAIL') or os.getenv('UNIWARE_EMAIL_ID')
    password = os.getenv('UNIWARE_PASSWORD')
    if not email or not password:
        raise RuntimeError('Uniware credentials are not configured.')
    try:
        response = requests.get(_base() + '/oauth/token', params={
            'grant_type': 'password', 'client_id': 'my-trusted-client',
            'username': email, 'password': password}, timeout=(5, 20))
        data = response.json()
    except (requests.RequestException, ValueError):
        # Never expose a requests exception: the OAuth URL contains credentials.
        raise RuntimeError('Unable to connect to Uniware.') from None
    if not response.ok or not data.get('access_token'):
        raise RuntimeError('Uniware login failed. Check API access and credentials.')
    _token = data['access_token']
    _expires = time.monotonic() + max(1, int(data.get('expires_in', 300)) - 30)
    return _token


def _post(path, body, warehouse):
    global _token
    for attempt in range(2):
        try:
            response = requests.post(_base() + path, json=body, headers={
                'Authorization': 'bearer ' + _access_token(), 'Facility': warehouse}, timeout=(5, 20))
            if response.status_code == 401 and attempt == 0:
                _token = None
                continue
            data = response.json()
        except (requests.RequestException, ValueError):
            raise RuntimeError('Unable to read Uniware inventory.') from None
        if not response.ok or not data.get('successful'):
            raise RuntimeError('Uniware inventory access failed. Check the user facility permissions.')
        return data


def snapshot(company):
    warehouse = facility(company)
    with _lock:
        saved = _cache.get(warehouse)
        if saved and time.monotonic() - saved['time'] < 60:
            return saved
        catalog = []
        offset = 0
        while True:
            result = _post('/services/rest/v1/product/itemType/search', {
                'searchOptions': {'displayLength': 500, 'displayStart': offset, 'getCount': True}}, warehouse)
            batch = result.get('elements') or []
            catalog.extend(batch)
            offset += len(batch)
            if not batch or offset >= result.get('totalRecords', offset):
                break
        quantities = {}
        codes = list(dict.fromkeys(x['skuCode'] for x in catalog if x.get('skuCode')))
        for index in range(0, len(codes), 500):
            result = _post('/services/rest/v1/inventory/inventorySnapshot/get',
                           {'itemTypeSKUs': codes[index:index + 500]}, warehouse)
            for item in result.get('inventorySnapshots') or []:
                if item.get('inventory') is not None:
                    quantities[item['itemTypeSKU']] = item['inventory']
        saved = {'time': time.monotonic(), 'catalog': catalog, 'quantities': quantities,
                 'facility': warehouse}
        _cache[warehouse] = saved
        return saved


def normalize_ean(value):
    value = str(value or '').strip()
    return value if re.fullmatch(r'(?:[0-9]{8}|[0-9]{13})', value) else None


def match_products(products, stock):
    # Only catalog EAN to Uniware EAN. Seller SKU, title and custom ASIN
    # aliases are deliberately excluded: they can identify a different variant.
    by_ean = {}
    for item in stock['catalog']:
        ean = normalize_ean(item.get('ean'))
        if ean and item.get('skuCode'):
            by_ean.setdefault(ean, set()).add(item['skuCode'])
    output = {}
    for product in products:
        eans = set(filter(None, (normalize_ean(value) for value in product.get('catalogEans', []))))
        codes = set().union(*(by_ean.get(ean, set()) for ean in eans)) if eans else set()
        known = codes and all(code in stock['quantities'] for code in codes)
        output[str(product.get('asin') or '')] = {
            'quantity': sum(stock['quantities'][code] for code in codes) if known else None,
            'mapped': bool(codes), 'eans': sorted(eans), 'uniwareSkus': sorted(codes),
        }
    return output


_vendor_cache = {}
_vendor_lock = Lock()

def sku_vendor_names(sku, warehouse):
    key=(warehouse,sku)
    with _vendor_lock:
        saved=_vendor_cache.get(key)
        if saved and time.monotonic()-saved[0]<300:
            return saved[1]
        try:
            detail=_post('/services/rest/v1/product/itemType/searchBySku',{'itemSKU':sku},warehouse).get('itemTypeDTO') or {}
            if detail.get('skuCode')!=sku:
                raise RuntimeError('Uniware returned a different SKU.')
            names=sorted({item['vendorName'].strip() for item in detail.get('vendorItemTypes',[])
                          if item.get('vendorEnabled') is True and isinstance(item.get('vendorName'),str) and item['vendorName'].strip()})
            result={'names':names,'message':'' if names else 'No enabled vendor mapping in Uniware.'}
        except RuntimeError:
            result={'names':[],'message':'Uniware vendor mapping is temporarily unavailable.'}
        _vendor_cache[key]=(time.monotonic(),result)
        return result

def enrich_vendor_names(output, stock):
    for item in output.values():
        names=set();messages=[]
        for sku in item['uniwareSkus']:
            result=sku_vendor_names(sku,stock['facility'])
            names.update(result['names'])
            if result['message']:messages.append(result['message'])
        item['vendorNames']=sorted(names)
        item['vendorName']=', '.join(sorted(names)) or None
        item['vendorMessage']=' '.join(sorted(set(messages)))
    return output
