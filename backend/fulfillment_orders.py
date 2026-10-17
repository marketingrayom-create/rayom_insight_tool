from datetime import datetime, timedelta, timezone
import time
import json
import threading
from copy import deepcopy

from flask import jsonify, request
from sp_api.api import Orders
from sp_api.base import Marketplaces
from functools import partial
from amazon_order_requests import order_api_call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _iso_z(dt):
    """Convert an aware datetime to Amazon's UTC ISO-8601 format."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _payload(response):
    """Safely extract the SP-API payload from the SDK response."""
    if hasattr(response, "payload"):
        return response.payload or {}

    if isinstance(response, dict):
        return response.get("payload", response) or {}

    return {}


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _is_quota_error(exc):
    return "QuotaExceeded" in str(exc)


def _call_with_retry(fn, *args, retries=0, base_delay=0, **kwargs):
    """Retry only throttled background operations, with a bounded cooldown."""
    for attempt in range(retries + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            if not _is_quota_error(exc) or attempt == retries:
                raise
            time.sleep(base_delay)


# ---------------------------------------------------------------------------
# Order items
# ---------------------------------------------------------------------------

def fetch_order_items(client, order_id, raise_errors=False, credentials=None):
    """
    Fetch all items for one Amazon order.

    Quota errors are retried. Item failures are logged and return an empty
    list so one problematic order does not destroy the complete response.
    """
    items = []
    get_items = partial(order_api_call, 'get_order_items', client.get_order_items, credentials) if credentials is not None else client.get_order_items

    if not order_id:
        return items

    try:
        # Avoid firing item requests as a tight burst after get_orders.
        time.sleep(1.0)

        response = _call_with_retry(
            get_items,
            order_id,
            retries=3 if raise_errors else 0,
            base_delay=60,
        )

        payload = _payload(response)
        items.extend(payload.get("OrderItems", []) or [])

        next_token = payload.get("NextToken")

        while next_token:
            response = _call_with_retry(
                get_items,
                order_id,
                NextToken=next_token,
                retries=3 if raise_errors else 0,
                base_delay=60,
            )

            payload = _payload(response)
            items.extend(payload.get("OrderItems", []) or [])
            next_token = payload.get("NextToken")

            # Keep item pagination below the API rate limit.
            if next_token:
                time.sleep(3.0)

    except Exception as exc:
        if raise_errors:
            raise
        print(
            f"[FULFILLMENT] Items failed for {order_id}: {exc}"
        )

    return items


def normalized_item(item):
    fields = {'orderItemId': 'OrderItemId', 'asin': 'ASIN', 'sellerSku': 'SellerSKU',
              'title': 'Title', 'quantityOrdered': 'QuantityOrdered',
              'quantityShipped': 'QuantityShipped', 'quantityUnshipped': 'QuantityUnshipped',
              'itemPrice': 'ItemPrice', 'itemTax': 'ItemTax',
              'promotionDiscount': 'PromotionDiscount', 'conditionId': 'ConditionId'}
    return {field: item.get(source) for field, source in fields.items()}


# ---------------------------------------------------------------------------
# Main fetch
# ---------------------------------------------------------------------------
def normalize_orders(orders, client=None, include_items=False, credentials=None):
    result = []

    for index, order in enumerate(orders):
        order_id = order.get("AmazonOrderId")

        items = (
            fetch_order_items(client, order_id, credentials=credentials)
            if include_items and order_id
            else []
        )

        total_units = sum(
            _safe_int(
                item.get("QuantityOrdered")
            )
            for item in items
        )

        easy_ship_shipment_status = order.get(
            "EasyShipShipmentStatus"
        )

        normalized_program = (
            "easyship"
            if easy_ship_shipment_status
            else None
        )

        normalized_easy_status = str(
            easy_ship_shipment_status or ""
        ).strip().lower().replace("_", "")

        normalized_subtab = (
            "handover-ready"
            if normalized_easy_status == "pendingpickup"
            else "handover-done"
            if normalized_easy_status
            else None
        )

        result.append(
            {
                "orderId": order_id,
                "purchaseDate": order.get(
                    "PurchaseDate"
                ),
                "lastUpdateDate": order.get(
                    "LastUpdateDate"
                ),
                "orderStatus": order.get(
                    "OrderStatus"
                ),
                "easyShipShipmentStatus":
                    easy_ship_shipment_status,
                "program": normalized_program,
                "subtab": normalized_subtab,
                "fulfillmentChannel": order.get(
                    "FulfillmentChannel"
                ),
                "salesChannel": order.get(
                    "SalesChannel"
                ),
                "shipServiceLevel": order.get(
                    "ShipServiceLevel"
                ),
                "orderType": order.get(
                    "OrderType"
                ),
                "isPrime": order.get(
                    "IsPrime"
                ),
                "isBusinessOrder": order.get(
                    "IsBusinessOrder"
                ),
                "numberOfItemsShipped": order.get(
                    "NumberOfItemsShipped"
                ),
                "numberOfItemsUnshipped": order.get(
                    "NumberOfItemsUnshipped"
                ),
                "earliestShipDate": order.get(
                    "EarliestShipDate"
                ),
                "latestShipDate": order.get(
                    "LatestShipDate"
                ),
                "earliestDeliveryDate": order.get(
                    "EarliestDeliveryDate"
                ),
                "latestDeliveryDate": order.get(
                    "LatestDeliveryDate"
                ),
                "orderTotal": order.get(
                    "OrderTotal"
                ),
                "totalUnits": total_units,
                "items": [normalized_item(item) for item in items],
            }
        )

        if (
            include_items
            and index < len(orders) - 1
        ):
            time.sleep(1.0)

    return result

def fetch_fulfillment_orders(
    creds,
    days=7,
    max_orders=100,
    include_items=True,
    fulfillment_channel=None,
    order_status=None,
    date=None,
    subtab=None,
    program=None,
    easy_ship_status=None,
    on_page=None,
):
    """
    Fetch Amazon IN fulfillment orders.

    Ready to Ship / Handover Ready is treated as:
        OrderStatus = Shipped
        EasyShipShipmentStatus = PendingPickUp

    The Easy Ship status is filtered locally as a safety check even when
    EasyShipShipmentStatuses is sent to SP-API.
    """

    # ------------------------------------------------------------------
    # Sanitize request values
    # ------------------------------------------------------------------

    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 7

    try:
        max_orders = int(max_orders)
    except (TypeError, ValueError):
        max_orders = 100

    days = max(1, min(days, 90))
    max_orders = max(1, min(max_orders, 500))

    if isinstance(fulfillment_channel, str):
        fulfillment_channel = fulfillment_channel.strip().upper()

    if fulfillment_channel not in ("AFN", "MFN"):
        fulfillment_channel = None

    if isinstance(order_status, str):
        order_status = [order_status]

    if not isinstance(order_status, list):
        order_status = []

    order_status = [
        str(status).strip()
        for status in order_status
        if str(status).strip()
    ]

    if isinstance(subtab, str):
        subtab = subtab.strip().lower()
    else:
        subtab = None

    if isinstance(program, str):
        program = program.strip().lower()
    else:
        program = None

    if isinstance(easy_ship_status, str):
        easy_ship_status = [easy_ship_status]

    if not isinstance(easy_ship_status, list):
        easy_ship_status = []

    easy_ship_status = [
        str(status).strip()
        for status in easy_ship_status
        if str(status).strip()
    ]

    normalized_easy_ship_status = {
        status.lower().replace("_", "")
        for status in easy_ship_status
    }

    # ------------------------------------------------------------------
    # Ready to Ship detection
    # ------------------------------------------------------------------

    is_ready_to_ship = (
        subtab == "handover-ready"
        or (
            program == "easyship"
            and subtab == "handover-ready"
        )
        or "pendingpickup" in normalized_easy_ship_status
    )

    # Ready to Ship is an explicit PendingPickUp filter.
    # Seller Central's Shipped / handover-done view is different: it is
    # the remaining Shipped orders after PendingPickUp is excluded.
    # Do NOT restrict SP-API to only PickedUp/DroppedOff here because
    # other completed Easy Ship statuses (for example Delivered) can
    # also belong to the handover-done / Shipped view.
    if is_ready_to_ship:
        easy_ship_statuses = ["PendingPickUp"]
    else:
        easy_ship_statuses = None

    if is_ready_to_ship:
        order_status = ["Shipped"]

    # ------------------------------------------------------------------
    # Date range
    # ------------------------------------------------------------------

    now = datetime.now(timezone.utc)
    end_dt = now - timedelta(minutes=5)
    start_dt = end_dt - timedelta(days=days)

    selected_date = None

    if date:
        try:
            selected_date = datetime.strptime(
                str(date).strip(),
                "%Y-%m-%d",
            ).replace(tzinfo=timezone.utc)

            start_dt = selected_date
            end_dt = selected_date + timedelta(days=1)

        except ValueError:
            raise ValueError(
                "Invalid date. Expected YYYY-MM-DD."
            )

    print(
        "[FULFILLMENT] Request:",
        {
            "start": _iso_z(start_dt),
            "end": _iso_z(end_dt),
            "days": days,
            "date": date,
            "fulfillment_channel": fulfillment_channel,
            "order_status": order_status,
            "subtab": subtab,
            "program": program,
            "easy_ship_status": easy_ship_status,
            "easy_ship_statuses": easy_ship_statuses,
            "is_ready_to_ship": is_ready_to_ship,
            "max_orders": max_orders,
            "include_items": include_items,
        },
    )

    # ------------------------------------------------------------------
    # Amazon Orders client
    # ------------------------------------------------------------------

    credentials = creds()
    client = Orders(
        marketplace=Marketplaces.IN,
        credentials=credentials,
    )

    orders = []
    next_token = None

    # ------------------------------------------------------------------
    # Get orders
    # ------------------------------------------------------------------

    while len(orders) < max_orders:
        try:
            if next_token:
                response = _call_with_retry(
                    partial(order_api_call, 'get_orders', client.get_orders, credentials),
                    NextToken=next_token,
                    retries=3 if on_page else 0, base_delay=60,
                )

            else:
                kwargs = {
                    "CreatedAfter": _iso_z(start_dt),
                    "CreatedBefore": _iso_z(end_dt),
                    "MarketplaceIds": [
                        Marketplaces.IN.marketplace_id
                    ],
                    "MaxResultsPerPage": min(
                        100,
                        max_orders - len(orders),
                    ),
                }

                if fulfillment_channel:
                    kwargs["FulfillmentChannels"] = [
                        fulfillment_channel
                    ]

                if order_status:
                    kwargs["OrderStatuses"] = order_status

                if easy_ship_statuses:
                    kwargs["EasyShipShipmentStatuses"] = (
                        easy_ship_statuses
                    )

                print(
                    "[FULFILLMENT] get_orders params:",
                    kwargs,
                )

                response = _call_with_retry(
                    partial(order_api_call, 'get_orders', client.get_orders, credentials),
                    retries=3 if on_page else 0, base_delay=60,
                    **kwargs,
                )

            payload = _payload(response)

            page_orders = (
                payload.get("Orders", []) or []
            )

            if not page_orders:
                break

            orders.extend(page_orders)
            if on_page:
                on_page(normalize_orders(orders[:max_orders]))

            next_token = payload.get("NextToken")

            if not next_token:
                break

            # Give the Orders operation time to recover before requesting
            # another page, especially after a quota response.
            time.sleep(5.0)

        except Exception as exc:
            print(
                f"[FULFILLMENT] Orders request failed: {exc}"
            )
            raise

    print(
        "[FULFILLMENT] Orders received from SP-API:",
        len(orders),
    )

    # ------------------------------------------------------------------
    # Mandatory local Easy Ship filtering
    # ------------------------------------------------------------------
    # SP-API can return a broader set than requested by
    # EasyShipShipmentStatuses, so apply the requested status locally too.

    if is_ready_to_ship:
        filtered_orders = []

        for order in orders:
            order_status_value = str(
                order.get("OrderStatus") or ""
            ).strip().lower()

            easy_ship_status_value = str(
                order.get("EasyShipShipmentStatus") or ""
            ).strip().lower()

            if (
                order_status_value == "shipped"
                and easy_ship_status_value == "pendingpickup"
            ):
                filtered_orders.append(order)

        print(
            "[FULFILLMENT] Ready-to-Ship local filter:",
            {
                "before": len(orders),
                "after": len(filtered_orders),
                "requested_easy_ship_status": easy_ship_status,
            },
        )

        orders = filtered_orders

    elif "shipped" in normalized_easy_ship_status:
        # Seller Central's Shipped tab is program=easyship +
        # subtab=handover-done. In the SP-API response there is no
        # EasyShipShipmentStatus literally named "Shipped".
        #
        # The reliable distinction from Ready to Ship is: keep Shipped
        # orders but exclude PendingPickUp. This is important because
        # completed orders may have different EasyShipShipmentStatus
        # values (e.g. PickedUp, DroppedOff, Delivered).
        filtered_orders = []

        for order in orders:
            order_status_value = str(
                order.get("OrderStatus") or ""
            ).strip().lower()

            easy_ship_status_value = str(
                order.get("EasyShipShipmentStatus") or ""
            ).strip().lower().replace("_", "")

            if (
                order_status_value == "shipped"
                and easy_ship_status_value
                and easy_ship_status_value != "pendingpickup"
            ):
                filtered_orders.append(order)

        print(
            "[FULFILLMENT] Shipped / handover-done local filter:",
            {
                "before": len(orders),
                "after": len(filtered_orders),
                "requested_easy_ship_status": easy_ship_status,
                "excluded_status": "PendingPickUp",
            },
        )

        orders = filtered_orders

    elif normalized_easy_ship_status:
        # Generic exact Easy Ship status filtering for any other status.
        requested_statuses = set(normalized_easy_ship_status)
        filtered_orders = []

        for order in orders:
            easy_ship_status_value = str(
                order.get("EasyShipShipmentStatus") or ""
            ).strip().lower().replace("_", "")

            if easy_ship_status_value in requested_statuses:
                filtered_orders.append(order)

        print(
            "[FULFILLMENT] Easy Ship local filter:",
            {
                "before": len(orders),
                "after": len(filtered_orders),
                "requested_easy_ship_status": easy_ship_status,
                "normalized_requested_status": sorted(requested_statuses),
            },
        )

        orders = filtered_orders

    # For non-Ready-to-Ship requests, keep the requested maximum.
    orders = orders[:max_orders]

    # ------------------------------------------------------------------
    # Build response
    # ------------------------------------------------------------------

    result = normalize_orders(orders, client, include_items, credentials)

    return {
        "success": True,
        "marketplace": "IN",
        "startDate": _iso_z(start_dt),
        "endDate": _iso_z(end_dt),
        "days": 1 if selected_date else days,
        "date": (
            selected_date.strftime("%Y-%m-%d")
            if selected_date
            else None
        ),
        "fulfillmentChannel": fulfillment_channel,
        "orderStatus": order_status,
        "subtab": subtab,
        "program": program,
        "easyShipShipmentStatuses": easy_ship_statuses,
        "count": len(result),
        "orders": result,
    }


# ---------------------------------------------------------------------------
# Flask route
# ---------------------------------------------------------------------------

def register_fulfillment_routes(app, creds):
    cache = {}
    cache_lock = threading.Lock()
    cooldowns = {}

    def fast_orders(**options):
        # One retained job per selection; HTTP polling never restarts pagination.
        company = request.args.get('organization', 'shelfesteem')
        key = (company, json.dumps(options, sort_keys=True))
        with cache_lock:
            entry = cache.get(key)
            if entry and (entry['pending'] or time.monotonic() - entry['at'] < entry.get('ttl', 120)):
                owner = False
            else:
                remaining = cooldowns.get(company, 0) - time.monotonic()
                if remaining > 0:
                    error = RuntimeError('QuotaExceeded')
                    error.retry_after = max(1, int(remaining) + 1)
                    raise error
                entry = {'pending': True, 'at': time.monotonic(), 'result':
                         {'success': True, 'orders': [], 'count': 0, 'ordersRefreshing': True, 'itemsRefreshing': False}}
                cache[key] = entry
                owner = True
                for old_key, old in list(cache.items()):
                    if not old['pending'] and time.monotonic() - old['at'] > 120:
                        cache.pop(old_key, None)
        if not owner:
            with cache_lock:
                return deepcopy(entry['result'])
        credentials = creds()
        def publish(orders):
            with cache_lock:
                entry['result'].update(orders=orders, count=len(orders))
        def run():
            listing = True
            try:
                result = fetch_fulfillment_orders(creds=lambda: credentials, on_page=publish,
                                                  **{**options, 'include_items': False})
                listing = False
                needs_items = bool(options.get('include_items') and result['orders'])
                result.update(ordersRefreshing=False, itemsRefreshing=needs_items)
                with cache_lock:
                    entry['result'] = result
                if needs_items:
                    client = Orders(marketplace=Marketplaces.IN, credentials=credentials)
                    for index, order in enumerate(result['orders']):
                        items = fetch_order_items(client, order['orderId'], raise_errors=True, credentials=credentials)
                        enriched = {**order, 'items': [normalized_item(item) for item in items],
                                    'totalUnits': sum(_safe_int(item.get('QuantityOrdered')) for item in items)}
                        with cache_lock:
                            entry['result']['orders'][index] = enriched
                    with cache_lock:
                        entry['result']['itemsRefreshing'] = False
            except Exception as exc:
                with cache_lock:
                    entry['result'].update(ordersRefreshing=False, itemsRefreshing=False)
                    field = 'ordersError' if listing else 'itemsError'
                    entry['result'][field] = 'Amazon request limit reached. Retrying after the cooldown.' if _is_quota_error(exc) else 'Amazon order data could not be loaded. Please retry.'
                    if _is_quota_error(exc):
                        cooldowns[company] = time.monotonic() + 60
                        entry['result'].update(ordersRefreshing=True, retryAfter=60)
                        entry['ttl'] = 60
            finally:
                with cache_lock:
                    entry.update(pending=False, at=time.monotonic())
        threading.Thread(target=run, daemon=True).start()
        with cache_lock:
            return deepcopy(entry['result'])

    @app.route(
        "/api/amazon/fulfillment-orders",
        methods=["POST"],
    )
    def fulfillment_orders():

        try:
            data = request.get_json(
                silent=True
            ) or {}

            result = fast_orders(

    days=data.get(
        "days",
        7,
    ),

    max_orders=data.get(
        "max_orders",
        100,
    ),

    include_items=data.get(
        "include_items",
        True,
    ),

    fulfillment_channel=data.get(
        "fulfillment_channel"
    ),

    order_status=data.get(
        "order_status"
    ),

    subtab=data.get(
        "subtab"
    ),

    program=data.get(
        "program"
    ),

    easy_ship_status=data.get(
        "easy_ship_status"
    ),

    date=data.get(
        "date"
    ),
)
            return jsonify(result), 200

        except Exception as exc:

            print(
                "[FULFILLMENT] Endpoint error:",
                exc,
            )

            if _is_quota_error(exc):
                company = request.args.get('organization', 'shelfesteem')
                retry_after = max(1, int(cooldowns.get(company, time.monotonic() + 60) - time.monotonic()) + 1)
                return jsonify({
                    "success": False,
                    "error": "Amazon request limit reached. Retrying after the cooldown.",
                    "code": "QuotaExceeded",
                    "message": "Amazon request limit reached. Retrying after the cooldown.",
                    "retryAfter": retry_after,
                }), 429, {'Retry-After': str(retry_after)}

            return jsonify({
                "success": False,
                "error": str(exc),
            }), 500

    print(
        "[AMAZON] POST "
        "/api/amazon/fulfillment-orders registered"
    )
