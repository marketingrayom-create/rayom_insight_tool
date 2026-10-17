"""Shopify inventory and merchandise sales reporting, with complete pagination."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from threading import Lock
import time
from shopify import graphql, configuration, PRODUCTS

PAGE = 'pageInfo { hasNextPage endCursor }'
SHOP = 'shop { name myshopifyDomain currencyCode ianaTimezone }'
LEVEL_FIELDS = '''id location { id name }
quantities(names: ["available", "committed", "on_hand", "incoming", "reserved", "damaged", "safety_stock", "quality_control"]) { name quantity }'''
INVENTORY = '''query Inventory($after: String, $search: String) {
''' + SHOP + '''
productVariants(first: 25, after: $after, query: $search) { ''' + PAGE + '''
nodes { id title sku image { url altText } product { id title vendor featuredImage { url altText } }
inventoryItem { id tracked inventoryLevels(first: 10) { ''' + PAGE + ' nodes { ' + LEVEL_FIELDS + ''' } } }
} } }'''
LEVELS = '''query Levels($id: ID!, $after: String) {
inventoryItem(id: $id) { inventoryLevels(first: 100, after: $after) { ''' + PAGE + ' nodes { ' + LEVEL_FIELDS + ''' } } }
}'''
LINE_FIELDS = '''id title sku vendor quantity currentQuantity isGiftCard
product { id } discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount currencyCode } }'''
SALES = '''query Sales($after: String, $search: String) {
orders(first: 10, after: $after, query: $search, sortKey: CREATED_AT) { ''' + PAGE + '''
nodes { id createdAt cancelledAt test
lineItems(first: 10) { ''' + PAGE + ' nodes { ' + LINE_FIELDS + ''' } }
} } }'''
LINES = '''query Lines($id: ID!, $after: String) {
order(id: $id) { lineItems(first: 100, after: $after) { ''' + PAGE + ' nodes { ' + LINE_FIELDS + ''' } } }
}'''
_cache = {}
_lock = Lock()


def validate_filters(filters):
    if filters is None:
        filters = {}
    if not isinstance(filters, dict):
        raise ValueError('Dashboard filters must be an object.')
    result = {}
    for section in ('brand', 'product'):
        item = filters.get(section, {})
        if not isinstance(item, dict):
            raise ValueError('Invalid summary filter.')
        search = item.get('search', '')
        metric = item.get('metric', 'Revenue')
        days = item.get('days', 1)
        if not isinstance(search, str) or metric not in ('Revenue', 'DRR', 'Units', 'Inventory') or isinstance(days, bool) or days not in (1, 7, 30, 90):
            raise ValueError('Invalid search, metric or duration filter.')
        result[section] = {'search': search.strip(), 'metric': metric, 'days': days}
    return result


def filter_dashboard(report, filters):
    result = dict(report)
    result['filters'] = filters
    for section, collection in (('brand', 'brands'), ('product', 'products')):
        criteria = filters[section]
        term = criteria['search'].lower()
        field = 'totalInventory' if criteria['metric'] == 'Inventory' else criteria['metric'].lower() + str(criteria['days']) + 'd'
        keys = ('brand',) if section == 'brand' else ('title', 'vendor', 'id')
        result[collection] = [{**row, 'selectedMetric': row.get(field)} for row in report[collection]
                              if any(term in str(row.get(key, '')).lower() for key in keys)]
    # Keep overview totals independent of table searches.
    result['overview'] = {'revenue7d': sum(row['revenue7d'] for row in report['brands']),
                          'units7d': sum(row['units7d'] for row in report['brands']),
                          'products': len(report['products']),
                          'inventory': sum(row['totalInventory'] for row in report['products'])}
    return result


def all_pages(query, key, variables=None, parent=None, initial=None):
    values = dict(variables or {})
    seen = set()
    page = initial
    while True:
        if page is None:
            data = graphql(query, values)
            page = (data.get(parent) or {}).get(key) if parent else data.get(key)
        if not isinstance(page, dict) or not isinstance(page.get('nodes'), list):
            raise RuntimeError('Incomplete Shopify response; report was not generated.')
        yield from page['nodes']
        info = page['pageInfo']
        if not info['hasNextPage']:
            break
        cursor = info.get('endCursor')
        if not cursor or cursor in seen:
            raise RuntimeError('Shopify pagination did not advance; report was not generated.')
        seen.add(cursor)
        values['after'] = cursor
        page = None


def inventory_rows(variants):
    rows = []
    for variant in variants:
        item = variant['inventoryItem']
        base = {'id': variant['id'], 'title': variant['product']['title'],
                'variant': variant['title'], 'sku': (variant.get('sku') or '').strip() or 'No SKU',
                'brand': variant['product']['vendor'], 'tracked': item['tracked'],
                'image': variant.get('image') or variant['product'].get('featuredImage')}
        levels = list(all_pages(LEVELS, 'inventoryLevels', {'id': item['id']}, 'inventoryItem', item['inventoryLevels']))
        if not levels:
            rows.append({**base, 'location': 'No inventory location', 'available': None,
                         'committed': None, 'on_hand': None, 'incoming': None, 'unavailable': None})
        for level in levels:
            quantities = {q['name']: q['quantity'] for q in level['quantities']}
            unavailable = None
            if all(name in quantities for name in ('on_hand', 'available', 'committed')):
                unavailable = quantities['on_hand'] - quantities['available'] - quantities['committed']
            rows.append({**base, 'id': variant['id'] + ':' + level['id'],
                         'location': level['location']['name'], 'unavailable': unavailable,
                         **{key: quantities.get(key) for key in ('available', 'committed', 'on_hand', 'incoming')}})
    return rows


def load_inventory(after, search, all_rows=False):
    data = graphql(INVENTORY, {'after': after, 'search': search or None})
    variants = list(all_pages(INVENTORY, 'productVariants', {'search': search or None}, initial=data['productVariants'])) if all_rows else data['productVariants']['nodes']
    rows = inventory_rows(variants)
    rows.sort(key=lambda row: (not bool(str(row.get('sku') or '').strip() and row['sku'] != 'No SKU'), row['title'], row['location']))
    return {'company': data['shop']['name'], 'shop': data['shop'],
            'data': rows,
            'pageInfo': {'hasNextPage': False, 'endCursor': None} if all_rows else data['productVariants']['pageInfo']}


def summarize(products, orders, now, history_days, currency):
    # Rolling windows are measured from one consistent UTC snapshot.
    buckets = {}
    def bucket(key, title, brand, inventory=0):
        return buckets.setdefault(key, {'id': key, 'title': title, 'brand': brand or 'Unknown vendor',
            'totalInventory': inventory, 'units': {n: 0 for n in (1, 7, 14, 30, 90)},
            'revenue': {n: Decimal('0') for n in (1, 7, 14, 30, 90)}})
    for product in products:
        bucket(product['id'], product['title'], product.get('vendor'), product.get('totalInventory', 0))
    daily = { (now - timedelta(days=i)).date().isoformat(): {'units': 0, 'revenue': Decimal('0')} for i in range(30) }
    for order in orders:
        if order.get('cancelledAt') or order.get('test'):
            continue
        placed = datetime.fromisoformat(order['createdAt'].replace('Z', '+00:00'))
        age = (now - placed).total_seconds() / 86400
        if age < 0 or age >= history_days:
            continue
        for line in order['items']:
            if line.get('isGiftCard'):
                continue
            units = line['currentQuantity']
            price = line['discountedUnitPriceAfterAllDiscountsSet']['shopMoney']
            if price['currencyCode'] != currency:
                raise RuntimeError('Shop currency changed during the reporting period; mixed currencies cannot be summed.')
            revenue = Decimal(price['amount']) * units
            product_id = (line.get('product') or {}).get('id') or 'deleted:' + (line.get('sku') or line['title'])
            target = bucket(product_id, line['title'], line.get('vendor'))
            for days in target['units']:
                if age < days:
                    target['units'][days] += units
                    target['revenue'][days] += revenue
            day = placed.date().isoformat()
            if day in daily:
                daily[day]['units'] += units
                daily[day]['revenue'] += revenue
    def formatted(value):
        revenue = value['revenue']; units = value['units']
        previous = units[14] - units[7]
        return {key: value[key] for key in ('id', 'title', 'brand', 'totalInventory')} | {
            'drr1d': units[1], 'drr7d': round(units[7] / 7, 2), 'drr30d': round(units[30] / 30, 2),
            'units7d': units[7], 'units30d': units[30],
            'units1d': units[1], 'units90d': units[90] if history_days >= 90 else None,
            'revenue1d': float(revenue[1]), 'drr90d': round(units[90] / 90, 2) if history_days >= 90 else None,
            'revenue7d': float(revenue[7]), 'revenue30d': float(revenue[30]),
            'revenue90d': float(revenue[90]) if history_days >= 90 else None,
            'weekChange': round((units[7] - previous) / previous * 100, 2) if previous else None,
            'daysOfInventory': round(value['totalInventory'] / (units[30] / 30), 1) if units[30] else None,
        }
    brands = {}
    for value in buckets.values():
        brand = value['brand']
        target = brands.setdefault(brand, {'id': brand, 'title': brand, 'brand': brand, 'totalInventory': 0,
            'units': {n: 0 for n in (1, 7, 14, 30, 90)}, 'revenue': {n: Decimal('0') for n in (1, 7, 14, 30, 90)}})
        target['totalInventory'] += value['totalInventory']
        for days in target['units']:
            target['units'][days] += value['units'][days]
            target['revenue'][days] += value['revenue'][days]
    return {'brands': [formatted(value) for value in brands.values()],
            'productSales': [formatted(value) for value in buckets.values()],
            'daily': [{'date': day, 'units': row['units'], 'revenue': float(row['revenue'])} for day, row in sorted(daily.items())]}


def load_dashboard(refresh=False):
    shop_domain = configuration()[0]
    with _lock:
        cached = _cache.get(shop_domain)
        if cached and not refresh and time.time() - cached[0] < 300:
            return cached[1]
    context = graphql('query { ' + SHOP + ' currentAppInstallation { accessScopes { handle } } }', {})
    shop = context['shop']
    scopes = {scope['handle'] for scope in context['currentAppInstallation']['accessScopes']}
    now = datetime.now(timezone.utc)
    history_days = 90 if 'read_all_orders' in scopes else 59
    products = list(all_pages(PRODUCTS, 'products', {'search': None}))
    orders = []
    search = 'created_at:>=' + (now - timedelta(days=history_days)).isoformat() + ' created_at:<=' + now.isoformat()
    for order in all_pages(SALES, 'orders', {'search': search}):
        order['items'] = list(all_pages(LINES, 'lineItems', {'id': order['id']}, 'order', order['lineItems']))
        orders.append(order)
    report = summarize(products, orders, now, history_days, shop['currencyCode'])
    sales = {row['id']: row for row in report['productSales']}
    report['products'] = [{**product, **sales[product['id']]} for product in products]
    report['listingHealth'] = {state: sum(p['status'] == state for p in products) for state in ('ACTIVE', 'DRAFT', 'ARCHIVED')}
    report['listingHealth']['Out of stock'] = sum(p['totalInventory'] <= 0 for p in products)
    report.update(company=shop['name'], shop=shop, generatedAt=now.isoformat(), historyDays=history_days,
        revenueDefinition='Estimated merchandise revenue: discounted unit price × current quantity, grouped by order creation time (UTC). Excludes cancelled/test orders and gift cards; excludes shipping/tax. Monetary adjustments may differ from Shopify Analytics.',
        notices=[] if history_days >= 90 else ['Revenue 90D needs read_all_orders access. It is shown as unavailable, not zero.'])
    with _lock:
        _cache[shop_domain] = (time.time(), report)
    return report
