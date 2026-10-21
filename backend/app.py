from console_encoding import configure_console

configure_console()

import os
import re
import sqlite3
import time
import csv
import gzip
import io
import requests
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from sp_api.api import Inventories, Products, Reports, ListingsItems, Orders
from sp_api.base import Marketplaces,ReportType
from fulfillment_orders import register_fulfillment_routes
from amazon_order_requests import order_api_call
from flipkart import flipkart
from shopify import shopify
from meta_ads import meta_ads
from amazon_ads import amazon_ads
from amazon_vendor import vendor, cb_product_inventory, product_sales_periods, refresh_product_sales, refresh_product_inventory, performance_7d
BASE=os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE,".env"))
load_dotenv(os.path.join(os.path.dirname(BASE),".env"))

from amazon_accounts import account_value, account_cache, validate_account, organization
from amazon_cache import cached_amazon
from concurrent.futures import ThreadPoolExecutor
from flask import has_request_context
from threading import Lock, Thread

from reorder_planning import planning

from inventory_integration import inventory_integration

app=Flask(__name__)
app.register_blueprint(inventory_integration)
app.register_blueprint(planning)
app.register_blueprint(flipkart)
app.register_blueprint(shopify)
app.register_blueprint(meta_ads)
app.register_blueprint(amazon_ads)
app.register_blueprint(vendor)
CORS(app,resources={r"/api/*":{"origins":"*"}})

UNIWARE_ASIN_IDENTIFIERS = {}

@app.post('/api/amazon/uniware-inventory')
def uniware_product_inventory():
    from uniware_inventory import snapshot, match_products, enrich_vendor_names
    products = (request.get_json(silent=True) or {}).get('products', [])
    if not isinstance(products, list) or len(products) > 500 or any(not isinstance(row, dict) for row in products):
        return jsonify(success=False, message='Invalid product list.'), 400
    try:
        stock = snapshot(organization())
        company = organization()
        asins = list(dict.fromkeys(row['asin'] for row in products
                     if re.fullmatch(r'B[A-Z0-9]{9}', str(row.get('asin', '')))))
        source = 'mvr' if company == 'linso' else 'cb' if company == 'rayom' else 'seller'
        uncached = [asin for asin in asins if (source, asin) not in UNIWARE_ASIN_IDENTIFIERS
                    or time.monotonic() - UNIWARE_ASIN_IDENTIFIERS[(source, asin)][0] > 86400]
        if uncached:
            try:
                if source != 'seller':
                    from amazon_vendor import amazon, account
                    config = account(source)
                    marketplace = config['marketplace']
                    def read_catalog(batch):
                        return amazon(config, '/catalog/2022-04-01/items', dict(
                            identifiers=','.join(batch), identifiersType='ASIN',
                            marketplaceIds=marketplace, includedData='identifiers', pageSize=20))
                else:
                    from sp_api.api import CatalogItemsV20220401
                    client = CatalogItemsV20220401(credentials=creds(), marketplace=Marketplaces.IN)
                    marketplace = account_value('MARKETPLACE_ID')
                    def read_catalog(batch):
                        return payload(client.search_catalog_items(identifiers=','.join(batch),
                            identifiersType='ASIN', marketplaceIds=[marketplace],
                            includedData=['identifiers'], pageSize=20)) or {}
                for index in range(0, len(uncached), 20):
                    batch = uncached[index:index + 20]
                    catalog = read_catalog(batch)
                    found = {item['asin']: [value['identifier'] for group in item.get('identifiers', [])
                             if group.get('marketplaceId') == marketplace
                             for value in group.get('identifiers', []) if value.get('identifierType') == 'EAN']
                             for item in catalog.get('items', [])}
                    for asin in batch:
                        UNIWARE_ASIN_IDENTIFIERS[(source, asin)] = (time.monotonic(), found.get(asin, []))
            except Exception:
                return jsonify(success=False, message='Catalogue EAN could not be loaded. Retry shortly.'), 503
        # Never accept barcode overrides sent by the browser.
        products = [dict(asin=row.get('asin'), catalogEans=UNIWARE_ASIN_IDENTIFIERS.get(
                    (source, row.get('asin')), (0, []))[1]) for row in products]
        return jsonify(success=True, inventory=enrich_vendor_names(match_products(products, stock), stock), facility=stock['facility'],
                       matchSource='Vendor Catalogue EAN' if source != 'seller' else 'Amazon Catalogue EAN',
                       quantityScope='Available inventory across all shelves in this warehouse')
    except RuntimeError as exc:
        return jsonify(success=False, message=str(exc)), 503

REPORT_CACHE=account_cache("reports", {"data":None,"created_at":None})
REPORT_CACHE_SECONDS=300

# def creds():
#     return {"lwa_app_id":account_value("CLIENT_ID"),"lwa_client_id":account_value("CLIENT_ID"),"lwa_client_secret":account_value("CLIENT_SECRET")}

def creds():
    return {
        "lwa_app_id": account_value("CLIENT_ID"),
        "lwa_client_id": account_value("CLIENT_ID"),
        "lwa_client_secret": account_value("CLIENT_SECRET"),
        "refresh_token": account_value("REFRESH_TOKEN"),
    }
register_fulfillment_routes(app, creds)
def ensure_credentials():
    validate_account()

@app.before_request
def select_amazon_account():
    # Let Flask answer browser preflight even when seller configuration is missing.
    if request.method == "OPTIONS":
        return None
    if request.path.startswith("/api/amazon/"):
        try:
            validate_account()
        except ValueError as exc:
            return jsonify(success=False, error=str(exc)), 400
        except RuntimeError as exc:
            return jsonify(success=False, configured=False, error=str(exc)), 503


def payload(resp):
    if resp is None:return None
    if hasattr(resp,"payload"):return resp.payload
    if isinstance(resp,dict):return resp.get("payload",resp)
    return resp

def num(v,default=0):
    try:
        if v is None or isinstance(v,bool):return default
        return float(v)
    except:return default

def norm(v):
    v=num(v,0)
    return int(v) if v.is_integer() else v

def first(obj,keys):
    if isinstance(obj,dict):
        for k in keys:
            if k in obj and obj[k] is not None:return obj[k]
        for v in obj.values():
            x=first(v,keys)
            if x is not None:return x
    elif isinstance(obj,list):
        for v in obj:
            x=first(v,keys)
            if x is not None:return x
    return None

class InventoryMap(dict):
    def __init__(self):
        super().__init__()
        self.by_sku = {}


@cached_amazon(seconds=300)
def inventory_map():
    c = Inventories(
        marketplace=Marketplaces.IN,
        refresh_token=account_value("REFRESH_TOKEN"),
        credentials=creds()
    )

    rows = []
    token = None
    seen = set()
    while True:
        params = dict(details=True, granularity_type="Marketplace",
                      granularity_id=account_value("MARKETPLACE_ID"),
                      marketplaceIds=[account_value("MARKETPLACE_ID")])
        if token:
            params["nextToken"] = token
        response = c.get_inventory_summary_marketplace(**params)
        data = payload(response) or {}
        rows.extend(data.get("inventorySummaries") or [])
        token = (getattr(response, "pagination", None) or data.get("pagination") or {}).get("nextToken")
        if not token:
            break
        if token in seen:
            raise RuntimeError("Amazon inventory returned a repeated pagination token.")
        seen.add(token)

    out = InventoryMap()

    for x in rows:
        if not isinstance(x, dict):
            continue

        asin = (
            x.get("asin")
            or x.get("ASIN")
            or x.get("productId")
        )

        if not asin:
            continue

        details = x.get("inventoryDetails") or {}

        # FBA
        fba_available = num(
            details.get("fulfillableQuantity")
        )

        fba_inbound = (
            num(details.get("inboundWorkingQuantity"))
            + num(details.get("inboundShippedQuantity"))
            + num(details.get("inboundReceivingQuantity"))
        )

        reserved_obj = details.get("reservedQuantity") or {}

        if isinstance(reserved_obj, dict):
            fba_reserved = num(
                reserved_obj.get("totalReservedQuantity")
            )
        else:
            fba_reserved = num(reserved_obj)

        unfulfillable_obj = (
            details.get("unfulfillableQuantity") or {}
        )

        if isinstance(unfulfillable_obj, dict):
            fba_unfulfillable = num(
                unfulfillable_obj.get(
                    "totalUnfulfillableQuantity"
                )
            )
        else:
            fba_unfulfillable = num(unfulfillable_obj)

        # FBM / flat inventory fields
        fulfillable = num(
            x.get("fulfillableQuantity")
            or x.get("fulfillable")
        )

        inbound = num(
            x.get("inboundQuantity")
            or x.get("inbound")
        )

        unfulfillable = num(
            x.get("unfulfillableQuantity")
            or x.get("unfulfillable")
        )

        reserved = num(
            x.get("reservedQuantity")
            or x.get("reserved")
        )

        seller_sku = (
            x.get("sellerSku")
            or x.get("sellerSKU")
            or x.get("sku")
        )

        fn_sku = x.get("fnSku")

        out[asin] = {
            # Existing inventory
            # "totalInventory": norm(
            #     fulfillable
            #     + inbound
            #     + unfulfillable
            #     + reserved
            # ),
            "totalInventory": norm(fba_available),
             "fulfillableQuantity": norm(
        fulfillable
    ),

    "inboundQuantity": norm(
        inbound
    ),

    "unfulfillableQuantity": norm(
        unfulfillable
    ),
    "reservedQuantity": norm(
        reserved
    ),

    # FBA inventory
    "fbaAvailable": norm(
        fba_available
    ),

            # "fulfillableQuantity": norm(
            #     fulfillable
            # ),

            # "inboundQuantity": norm(
            #     inbound
            # ),

            # "unfulfillableQuantity": norm(
            #     unfulfillable
            # ),

            "reservedQuantity": norm(
                reserved
            ),

            # FBA inventory
            "fbaAvailable": norm(
                fba_available
            ),

            "fbaInbound": norm(
                fba_inbound
            ),

            "fbaUnfulfillable": norm(
                fba_unfulfillable
            ),

            "fbaReserved": norm(
                fba_reserved
            ),

            "onHandFba": norm(
                fba_available
            ),

            "fbaTotalQuantity": norm(
                x.get("totalQuantity")
                if x.get("totalQuantity") is not None
                else (
                    fba_available
                    + fba_inbound
                    + fba_unfulfillable
                    + fba_reserved
                )
            ),

            "fnSku": fn_sku,

            "sellerSku": seller_sku,

            "inventoryMaxDate": (
                x.get("lastUpdatedTime")
                or x.get("lastUpdatedDate")
            )
        }

        if seller_sku:
            out.by_sku[seller_sku] = out[asin]

    print(
        "Inventory products parsed:",
        len(out)
    )

    return out


@cached_amazon(seconds=300)
def seller_listing_items():
    """Discover the full seller catalog, including FBM and zero-stock listings."""
    client = ListingsItems(marketplace=Marketplaces.IN, credentials=creds())
    items = []
    token = None
    seen = set()
    while True:
        params = dict(
            sellerId=account_value("MERCHANT_ID"),
            marketplaceIds=[account_value("MARKETPLACE_ID")],
            includedData="summaries,attributes,offers,fulfillmentAvailability",
            pageSize=20,
        )
        if token:
            params["pageToken"] = token
        data = payload(client.search_listings_items(**params)) or {}
        items.extend(data.get("items") or [])
        token = (data.get("pagination") or {}).get("nextToken")
        if not token:
            break
        if token in seen:
            raise RuntimeError("Amazon listings returned a repeated pagination token.")
        seen.add(token)
    grouped = {}
    for item in items:
        summaries = item.get("summaries") or []
        summary = next((row for row in summaries if row.get("marketplaceId") == account_value("MARKETPLACE_ID")), summaries[0] if summaries else {})
        asin = item.get("asin") or summary.get("asin")
        if asin:
            grouped.setdefault(asin, []).append(item)
    return grouped


def listing_map(asins, inv, discovered=None):
    """
    Fetch listing data by ASIN so both MFN/FBM and FBA listings
    can be discovered for the same ASIN.

    Amazon Listings Items API supports searching by ASIN and
    returning fulfillmentAvailability.

    DEFAULT = merchant fulfilled / FBM
    Non-DEFAULT = FBA / Amazon fulfillment
    """

    # Catalog-backed rows only need parsing; avoid authenticating a new client
    # for every SKU when no API call is necessary.
    c = None
    def listing_client():
        nonlocal c
        if c is None:
            c = ListingsItems(marketplace=Marketplaces.IN,
                              refresh_token=account_value("REFRESH_TOKEN"),
                              credentials=creds(), timeout=15)
        return c

    out = {}

    def parse_listing(item):
        if not isinstance(item, dict):
            return None

        sku = item.get("sku") or item.get("sellerSku")
        asin = item.get("asin") or item.get("ASIN")

        attributes = item.get("attributes") or {}
        offers = item.get("offers") or []
        summaries = item.get("summaries") or []

        fulfillment = (
            item.get("fulfillmentAvailability")
            or item.get("fulfillment_availability")
            or []
        )

        # -------------------------------------------------
        # SUMMARY
        # -------------------------------------------------
        summary = (
            summaries[0]
            if summaries and isinstance(summaries[0], dict)
            else {}
        )

        title = summary.get("itemName")

        main_image = summary.get("mainImage") or {}

        image = (
            main_image.get("link")
            if isinstance(main_image, dict)
            else None
        )

        status = summary.get("status")

        if isinstance(status, list):
            status = status[0] if status else None

        # -------------------------------------------------
        # BRAND
        # -------------------------------------------------
        brand = (
            summary.get("brand")
            or attributes.get("brand")
            or attributes.get("brandName")
        )

        # Amazon can return:
        #
        # "brand": [
        #     {
        #         "value": "Unfooled"
        #     }
        # ]
        #
        # or directly as string.

        brand_values = attributes.get("brand") or []

        if isinstance(brand_values, list) and brand_values:
            first_brand = brand_values[0]

            if isinstance(first_brand, dict):
                brand = (
                    first_brand.get("value")
                    or first_brand.get("Value")
                    or brand
                )

            elif isinstance(first_brand, str):
                brand = first_brand

        # -------------------------------------------------
        # BRAND NAME FALLBACK
        # -------------------------------------------------
        if not brand:

            brand_name_values = (
                attributes.get("brandName") or []
            )

            if (
                isinstance(brand_name_values, list)
                and brand_name_values
            ):
                first_brand_name = brand_name_values[0]

                if isinstance(first_brand_name, dict):
                    brand = (
                        first_brand_name.get("value")
                        or first_brand_name.get("Value")
                    )

                elif isinstance(first_brand_name, str):
                    brand = first_brand_name

        # -------------------------------------------------
        # TITLE FALLBACK
        # -------------------------------------------------
        if not title:

            item_names = (
                attributes.get("item_name") or []
            )

            if (
                isinstance(item_names, list)
                and item_names
            ):
                first_item_name = item_names[0]

                if isinstance(first_item_name, dict):
                    title = first_item_name.get("value")

                elif isinstance(first_item_name, str):
                    title = first_item_name

        # -------------------------------------------------
        # IMAGE FALLBACK
        # -------------------------------------------------
        if not image:

            image_values = (
                attributes.get(
                    "main_product_image_locator"
                )
                or []
            )

            if (
                isinstance(image_values, list)
                and image_values
            ):
                first_image = image_values[0]

                if isinstance(first_image, dict):
                    image = first_image.get(
                        "media_location"
                    )

                elif isinstance(first_image, str):
                    image = first_image

        # -------------------------------------------------
        # BRAND DEBUG
        # -------------------------------------------------
        print(
            f"[BRAND DEBUG] {asin} | "
            f"summary_brand={summary.get('brand')} | "
            f"attribute_brand={attributes.get('brand')} | "
            f"attribute_brandName={attributes.get('brandName')} | "
            f"final_brand={brand}"
        )

        # -------------------------------------------------
        # PRICE
        # -------------------------------------------------
        price = None

        for offer in offers:

            if not isinstance(offer, dict):
                continue

            offer_price = (
                offer.get("price")
                or offer.get("listingPrice")
            )

            if isinstance(offer_price, dict):

                amount = (
                    offer_price.get("amount")
                    or offer_price.get("Amount")
                )

                if amount is not None:

                    try:
                        price = float(amount)
                        break

                    except Exception:
                        pass

        # -------------------------------------------------
        # FULFILLMENT QUANTITIES
        # -------------------------------------------------
        merchant_available = 0
        fba_available = 0

        fulfillment_rows = []

        for row in fulfillment:

            if not isinstance(row, dict):
                continue

            channel = (
                row.get("fulfillmentChannelCode")
                or row.get("fulfillment_channel_code")
                or ""
            )

            quantity = num(
                row.get("quantity"),
                0,
            )

            fulfillment_rows.append(
                {
                    "channel": str(channel),
                    "quantity": norm(quantity),
                }
            )

            # DEFAULT = FBM / Merchant fulfilled
            if str(channel).upper() == "DEFAULT":

                merchant_available += quantity

            else:

                # Non DEFAULT = FBA / Amazon fulfillment
                fba_available += quantity

        # -------------------------------------------------
        # LEGACY FULFILLMENT FALLBACK
        # -------------------------------------------------
        if not fulfillment_rows:

            legacy_rows = (
                attributes.get(
                    "fulfillment_availability"
                )
                or []
            )

            for row in legacy_rows:

                if not isinstance(row, dict):
                    continue

                channel = (
                    row.get("fulfillment_channel_code")
                    or row.get("fulfillmentChannelCode")
                    or ""
                )

                quantity = num(
                    row.get("quantity"),
                    0,
                )

                fulfillment_rows.append(
                    {
                        "channel": str(channel),
                        "quantity": norm(quantity),
                    }
                )

                if str(channel).upper() == "DEFAULT":

                    merchant_available += quantity

                else:

                    fba_available += quantity

        # -------------------------------------------------
        # RETURN PARSED LISTING
        # -------------------------------------------------
        return {
            "asin": asin,

            "sku": sku,

            "price": (
                norm(price)
                if price is not None
                else None
            ),

            "image": image,

            "title": title,

            "brand": brand,

            "fnSku": summary.get("fnSku"),

            "status": status,

            "merchantAvailable": norm(
                merchant_available
            ),

            "fbaAvailable": norm(
                fba_available
            ),

            "fulfillmentRows": fulfillment_rows,
        }

    # =====================================================
    # FETCH EACH ASIN
    # =====================================================
    for asin in asins:

        try:

            # -------------------------------------------------
            # Search listings by ASIN
            # -------------------------------------------------
            if discovered is not None and asin in discovered:
                items = discovered[asin]
            else:
                response = listing_client().search_listings_items(
                    sellerId=account_value("MERCHANT_ID"),
                    marketplaceIds=[account_value("MARKETPLACE_ID")],
                    identifiers=[asin],
                    identifiersType="ASIN",
                    includedData="summaries,attributes,offers,fulfillmentAvailability",
                    pageSize=20,
                )
                data = payload(response) or {}
                items = data.get("items") or data.get("Items") or []

            parsed = []

            for item in items:

                item_data = parse_listing(item)

                if item_data:
                    parsed.append(item_data)

            # -------------------------------------------------
            # SELECT FBM AND FBA SEPARATELY
            # -------------------------------------------------
            fbm = None
            fba = None

            for item in parsed:

                # FBA listing
                if item["fbaAvailable"] > 0:

                    if fba is None:
                        fba = item

                # FBM listing
                if item["merchantAvailable"] > 0:

                    if fbm is None:
                        fbm = item

            # -------------------------------------------------
            # FBA FALLBACK WHEN QUANTITY = 0
            # -------------------------------------------------
            if fba is None:

                for item in parsed:

                    rows = item.get(
                        "fulfillmentRows",
                        []
                    )

                    if any(
                        str(r["channel"]).upper()
                        != "DEFAULT"
                        for r in rows
                    ):

                        fba = item
                        break

            # -------------------------------------------------
            # FBM FALLBACK WHEN QUANTITY = 0
            # -------------------------------------------------
            if fbm is None:

                for item in parsed:

                    rows = item.get(
                        "fulfillmentRows",
                        []
                    )

                    if any(
                        str(r["channel"]).upper()
                        == "DEFAULT"
                        for r in rows
                    ):

                        fbm = item
                        break

            # -------------------------------------------------
            # PRIMARY LISTING
            # -------------------------------------------------
            # Prefer FBM because this is the main merchant
            # listing when available.
            primary = fbm or fba or (parsed[0] if parsed else None)

            # -------------------------------------------------
            # EXACT SKU FALLBACK
            # -------------------------------------------------
            if primary is None:

                sku = (
                    inv.get(asin, {}).get("sellerSku")
                )

                if sku:

                    fallback_response = (
                        listing_client().get_listings_item(
                            sellerId=account_value("MERCHANT_ID"),
                            sku=sku,
                            marketplaceIds=[
                                account_value("MARKETPLACE_ID")
                            ],
                            includedData=(
                                "summaries,attributes,"
                                "offers,fulfillmentAvailability"
                            ),
                        )
                    )

                    fallback_data = payload(
                        fallback_response
                    )

                    primary = parse_listing(
                        fallback_data
                    )

            # -------------------------------------------------
            # NOTHING FOUND
            # -------------------------------------------------
            if primary is None:

                print(
                    f"[LISTING] No listing found for {asin}"
                )

                continue

            # -------------------------------------------------
            # FBA AVAILABLE
            # -------------------------------------------------
            fba_available = (
                fba["fbaAvailable"]
                if fba
                else 0
            )

            # -------------------------------------------------
            # BUILD FINAL LISTING OBJECT
            # -------------------------------------------------
            out[asin] = {

                "price": primary.get("price"),

                "image": primary.get("image"),

                "title": primary.get("title"),

                "brand": primary.get("brand"),

                "sku": primary.get("sku"),

                "fnSku": primary.get("fnSku"),

                "status": primary.get("status"),

                # -----------------------------------------
                # FBM
                # -----------------------------------------
                "merchantAvailable": (
                    fbm["merchantAvailable"]
                    if fbm
                    else 0
                ),

                # -----------------------------------------
                # FBA
                # -----------------------------------------
                "fbaAvailable": norm(
                    fba_available
                ),

                "fbaInbound": 0,

                "fbaUnfulfillable": 0,

                "fbaReserved": 0,

                "onHandFba": norm(
                    fba_available
                ),

                "fulfillmentRows": (
                    primary.get(
                        "fulfillmentRows",
                        []
                    )
                ),
            }

            print(
                f"[LISTING] {asin} | "
                f"FBM={out[asin]['merchantAvailable']} | "
                f"FBA={out[asin]['fbaAvailable']} | "
                f"price={out[asin]['price']} | "
                f"brand={out[asin]['brand']}"
            )

        except Exception as e:

            print(
                f"[LISTING] Search failed for {asin}:",
                repr(e)
            )

            # -------------------------------------------------
            # FINAL SKU FALLBACK
            # -------------------------------------------------
            try:

                sku = (
                    inv.get(asin, {}).get("sellerSku")
                )

                if not sku:
                    continue

                response = listing_client().get_listings_item(
                    sellerId=account_value("MERCHANT_ID"),
                    sku=sku,
                    marketplaceIds=[
                        account_value("MARKETPLACE_ID")
                    ],
                    includedData=(
                        "summaries,attributes,offers,"
                        "fulfillmentAvailability"
                    ),
                )

                item = parse_listing(
                    payload(response)
                )

                if item:

                    out[asin] = {

                        "price": item.get("price"),

                        "image": item.get("image"),

                        "title": item.get("title"),

                        "brand": item.get("brand"),

                        "sku": item.get("sku"),

                        "fnSku": item.get("fnSku"),

                        "status": item.get("status"),

                        "merchantAvailable": item.get(
                            "merchantAvailable",
                            0
                        ),

                        "fbaAvailable": item.get(
                            "fbaAvailable",
                            0
                        ),

                        "fbaInbound": 0,

                        "fbaUnfulfillable": 0,

                        "fbaReserved": 0,

                        "onHandFba": item.get(
                            "fbaAvailable",
                            0
                        ),

                        "fulfillmentRows": item.get(
                            "fulfillmentRows",
                            []
                        ),
                    }

            except Exception as fallback_error:

                print(
                    f"[LISTING] Fallback failed for {asin}:",
                    repr(fallback_error)
                )

    print(
        "Listings products parsed:",
        len(out)
    )

    return out
_sales_refresh_lock = Lock()
_sales_refreshing = set()
_sales_retry_after = {}


def sales_report():
    """Serve the last report immediately; Amazon report generation runs off-request."""
    from amazon_accounts import organization
    company = organization()
    cached = REPORT_CACHE["data"]
    if cached is not None and time.time() - REPORT_CACHE["created_at"] < REPORT_CACHE_SECONDS:
        return cached
    environment = dict(request.environ) if has_request_context() else None

    def refresh():
        try:
            context = app.request_context(environment) if environment else app.test_request_context("/?organization=" + company)
            with context:
                _generate_sales_report()
                build_products.cache_clear()
        except Exception as error:
            app.logger.warning("Sales report refresh failed for %s: %s", company, error)
        finally:
            with _sales_refresh_lock:
                _sales_refreshing.discard(company)
                _sales_retry_after[company] = time.monotonic() + 30

    with _sales_refresh_lock:
        if company not in _sales_refreshing and time.monotonic() >= _sales_retry_after.get(company, 0):
            _sales_refreshing.add(company)
            Thread(target=refresh, daemon=True).start()
    return cached if cached is not None else {}


def _generate_sales_report():
    now=datetime.now(timezone.utc)
    start=now-timedelta(days=30)
    if REPORT_CACHE["data"] is not None and time.time()-REPORT_CACHE["created_at"]<REPORT_CACHE_SECONDS:
        return REPORT_CACHE["data"]
    c=Reports(marketplace=Marketplaces.IN,refresh_token=account_value("REFRESH_TOKEN"),credentials=creds())
    r=c.create_report(reportType="GET_SALES_AND_TRAFFIC_REPORT",marketplaceIds=[account_value("MARKETPLACE_ID")],
        dataStartTime=start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        dataEndTime=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        reportOptions={"dateGranularity":"DAY","asinGranularity":"CHILD"})
    p=payload(r);rid=p.get("reportId") if isinstance(p,dict) else None
    if not rid:raise RuntimeError("Amazon did not return reportId")
    doc=None
    for _ in range(30):
        time.sleep(2)
        q=payload(c.get_report(rid))
        st=q.get("processingStatus") if isinstance(q,dict) else None
        if st=="DONE":doc=q.get("reportDocumentId");break
        if st in ("FATAL","CANCELLED"):raise RuntimeError("Amazon report failed: "+str(st))
    if not doc:raise RuntimeError("Sales & Traffic report did not finish")
    d=payload(c.get_report_document(doc,decrypt=True))
    if isinstance(d,dict):d=d.get("reportData") or d.get("data") or d
    REPORT_CACHE.update(data=d,created_at=time.time())
    return d


# ============================================================
# AMAZON ORDERS API - BRAND SALES
# ============================================================

ORDERS_CACHE = account_cache("orders", {"data": None, "created_at": None})

ORDERS_CACHE_SECONDS = 300

# ============================================================
# AMAZON ORDERS API
# ============================================================

def amazon_orders(start_date, end_date, max_orders=None):
    """
    Fetch Amazon orders for the selected date range.

    max_orders=None -> fetch all pages.
    max_orders=N    -> stop after N orders.
    """

    ensure_credentials()

    c = Orders(
        marketplace=Marketplaces.IN,
        refresh_token=account_value("REFRESH_TOKEN"),
        credentials=creds()
    )

    orders = []
    next_token = None

    while True:
        if max_orders is not None:
            remaining = max_orders - len(orders)
            if remaining <= 0:
                break
            page_size = min(50, remaining)
        else:
            page_size = 50

        kwargs = {
            "MarketplaceIds": [account_value("MARKETPLACE_ID")],
            "CreatedAfter": start_date.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "CreatedBefore": end_date.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "MaxResultsPerPage": page_size,
        }

        if next_token:
            kwargs["NextToken"] = next_token

        try:
            response = order_api_call('get_orders', c.get_orders, creds(), **kwargs)
            data = payload(response)
        except Exception as e:
            print("[ORDERS] get_orders failed:", repr(e))
            raise

        if not isinstance(data, dict):
            break

        batch = data.get("Orders") or data.get("orders") or []

        if isinstance(batch, list):
            orders.extend(batch)

        if max_orders is not None and len(orders) >= max_orders:
            orders = orders[:max_orders]
            break

        next_token = data.get("NextToken") or data.get("nextToken")

        if not next_token:
            break

        time.sleep(1)

    print(
        f"[ORDERS] Orders fetched: {len(orders)} "
        f"from {start_date.isoformat()} to {end_date.isoformat()}"
    )

    return orders


@cached_amazon(seconds=300)
def amazon_order_items(order_id):
    """Fetch items for one Amazon order."""
    ensure_credentials()

    c = Orders(
        marketplace=Marketplaces.IN,
        refresh_token=account_value("REFRESH_TOKEN"),
        credentials=creds()
    )

    response = order_api_call('get_order_items', c.get_order_items, creds(), order_id)
    data = payload(response)

    if not isinstance(data, dict):
        return []

    return data.get("OrderItems") or data.get("orderItems") or []


def order_item_value(item, keys):
    """Safely extract an order-item value."""
    if not isinstance(item, dict):
        return None

    for key in keys:
        if key in item and item[key] is not None:
            value = item[key]

            if isinstance(value, dict):
                value = (
                    value.get("Amount")
                    or value.get("amount")
                    or value.get("Value")
                    or value.get("value")
                )

            return value

    return None


_order_sales_refreshing = set()
_order_sales_retry_after = {}
_order_sales_lock = Lock()


def amazon_brand_sales():
    """Keep slow per-order item calls out of the products request."""
    company = organization()
    cached = ORDERS_CACHE["data"]
    if cached is not None and time.time() - ORDERS_CACHE["created_at"] < ORDERS_CACHE_SECONDS:
        return cached
    environment = dict(request.environ) if has_request_context() else None

    def refresh():
        try:
            context = app.request_context(environment) if environment else app.test_request_context('/?organization=' + company)
            with context:
                _calculate_amazon_brand_sales()
                build_products.cache_clear()
        except Exception:
            app.logger.exception('Order sales refresh failed for %s', company)
        finally:
            with _order_sales_lock:
                _order_sales_refreshing.discard(company)
                _order_sales_retry_after[company] = time.monotonic() + 30

    with _order_sales_lock:
        if company not in _order_sales_refreshing and time.monotonic() >= _order_sales_retry_after.get(company, 0):
            _order_sales_refreshing.add(company)
            Thread(target=refresh, daemon=True).start()
    return cached if cached is not None else {}


def sales_refresh_pending():
    # Reading response metadata must not launch more Amazon requests.
    return (ORDERS_CACHE['data'] is None or REPORT_CACHE['data'] is None
            or organization() in _order_sales_refreshing
            or organization() in _sales_refreshing)


def _calculate_amazon_brand_sales():
    """
    Fetch recent Amazon orders and aggregate
    units/revenue by ASIN.
    """

    now = datetime.now(timezone.utc)

    # Return cached data if available
    if (
        ORDERS_CACHE["data"] is not None
        and ORDERS_CACHE["created_at"] is not None
        and time.time() - ORDERS_CACHE["created_at"]
        < ORDERS_CACHE_SECONDS
    ):
        return ORDERS_CACHE["data"]

    # Amazon requires CreatedBefore to be safely behind current time.
    end = now - timedelta(minutes=5)

    start = end - timedelta(days=30)

    # Fetch all pages for the 30-day brand-sales calculation.
    orders = amazon_orders(
        start,
        end
    )

    result = {}

    for order in orders:

        if not isinstance(order, dict):
            continue

        order_id = (
            order.get("AmazonOrderId")
            or order.get("amazonOrderId")
            or order.get("OrderId")
            or order.get("orderId")
        )

        if not order_id:
            continue

        status = (
            order.get("OrderStatus")
            or order.get("orderStatus")
            or ""
        )

        if str(status).upper() in {
            "CANCELED",
            "CANCELLED"
        }:
            continue

        created = (
            order.get("PurchaseDate")
            or order.get("purchaseDate")
            or order.get("CreatedDate")
            or order.get("createdDate")
        )

        if not created:
            continue

        try:
            order_date = datetime.fromisoformat(
                str(created).replace("Z", "+00:00")
            )
        except Exception:
            try:
                order_date = datetime.strptime(
                    str(created)[:10],
                    "%Y-%m-%d"
                ).replace(tzinfo=timezone.utc)
            except Exception:
                continue

        # One API call per order.
        # Keep a small delay to avoid hammering Orders API.
        try:
            items = amazon_order_items(order_id)
        except Exception as e:
            error_text = str(e)

            if (
                "QuotaExceeded" in error_text
                or "Throttled" in error_text
                or "SellingApiRequestThrottledException" in error_text
            ):
                print(
                    f"[ORDERS] Throttled while fetching items "
                    f"for order {order_id}. Stopping further item calls."
                )
                break

            print(
                f"[ORDERS] Failed items for {order_id}: {e}"
            )
            continue

        time.sleep(0.5)

        for item in items:

            if not isinstance(item, dict):
                continue

            asin = (
                item.get("ASIN")
                or item.get("asin")
                or item.get("ASINCode")
            )

            if not asin:
                continue

            quantity = num(
                order_item_value(
                    item,
                    [
                        "QuantityOrdered",
                        "quantityOrdered",
                        "Quantity"
                    ]
                ),
                0
            )

            revenue = num(
                order_item_value(
                    item,
                    [
                        "ItemPrice",
                        "itemPrice",
                        "Principal"
                    ]
                ),
                0
            )

            row = result.setdefault(
                asin,
                {
                    "sales1d": 0,
                    "sales7d": 0,
                    "sales15d": 0,
                    "sales30d": 0,
                    "revenue1d": 0,
                    "revenue7d": 0,
                    "revenue15d": 0,
                    "revenue30d": 0
                }
            )

            age = (now - order_date).days

            if age < 1:
                row["sales1d"] += quantity
                row["revenue1d"] += revenue

            if age < 7:
                row["sales7d"] += quantity
                row["revenue7d"] += revenue

            if age < 15:
                row["sales15d"] += quantity
                row["revenue15d"] += revenue

            if age < 30:
                row["sales30d"] += quantity
                row["revenue30d"] += revenue

    # Normalize numbers
    for asin, row in result.items():
        for key in row:
            row[key] = norm(row[key])

    ORDERS_CACHE["data"] = result
    ORDERS_CACHE["created_at"] = time.time()

    print(
        f"[ORDERS] Brand sales calculated for "
        f"{len(result)} ASINs from {len(orders)} orders"
    )

    return result

def sales_rows(report):
    out={}
    raw=(report.get("salesAndTrafficByAsin") or report.get("salesAndTrafficByDate") or []) if isinstance(report,dict) else (report if isinstance(report,list) else [])
    for x in raw:
        if not isinstance(x,dict):continue
        asin=x.get("childAsin") or x.get("asin") or x.get("ASIN")
        if not asin:continue
        s=x.get("salesByAsin") or x.get("sales") or {}
        t=x.get("trafficByAsin") or x.get("traffic") or {}
        rev=first(s,["orderedProductSales","OrderedProductSales","revenue","Revenue"])
        if isinstance(rev,dict):rev=rev.get("amount") or rev.get("Amount") or rev.get("value")
        out.setdefault(asin,[]).append({
            "date":x.get("date") or x.get("Date"),
            "units":num(first(s,["unitsOrdered","UnitsOrdered","units_ordered"])),
            "revenue":num(rev),
            "sessions":num(first(t,["sessions","Sessions","pageViews","PageViews"]))
        })
    return out

def metrics(rows):
    if not rows:return {"revenue7d":0,"revenue15d":0,"revenue30d":0,"sales7d":0,"sales15d":0,"sales30d":0,"pageViews7d":0,"conversionRate":0,"drr1d":0,"drr1dMinus2":0,"drr7d":0,"drr15d":0,"drr30d":0,"salesMaxDate":None}
    rr=[]
    for x in rows:
        try:d=datetime.fromisoformat(str(x["date"]).replace("Z","+00:00"))
        except:
            try:d=datetime.strptime(str(x["date"])[:10],"%Y-%m-%d").replace(tzinfo=timezone.utc)
            except:continue
        y=dict(x);y["_d"]=d;rr.append(y)
    if not rr:return metrics([])
    rr.sort(key=lambda x:x["_d"]);last=rr[-1]["_d"]
    def win(n):return [x for x in rr if last-timedelta(days=n-1)<=x["_d"]<=last]
    def sm(a,k):return sum(num(x.get(k)) for x in a)
    r1,r7,r15,r30=win(1),win(7),win(15),win(30)
    t2=[x for x in rr if x["_d"].date()==(last-timedelta(days=2)).date()]
    s7=sm(r7,"units");views=sm(r7,"sessions")
    return {
        "revenue7d":norm(sm(r7,"revenue")),"revenue15d":norm(sm(r15,"revenue")),"revenue30d":norm(sm(r30,"revenue")),
        "sales7d":norm(s7),"sales15d":norm(sm(r15,"units")),"sales30d":norm(sm(r30,"units")),
        "pageViews7d":norm(views),"conversionRate":norm((s7/views*100) if views else 0),
        "drr1d":norm(sm(r1,"units")),"drr1dMinus2":norm(sm(t2,"units")),
        "drr7d":norm(s7/7),"drr15d":norm(sm(r15,"units")/15),"drr30d":norm(sm(r30,"units")/30),
        "salesMaxDate":last.strftime("%Y-%m-%d")
    }



RETURNS_CACHE = account_cache("returns", {"data": [], "generated_at": None, "report_id": None})

RETURNS_CACHE_TTL = 30 * 60  # 30 minutes


def _report_payload(response):
    if hasattr(response, "payload"):
        return response.payload or {}

    if isinstance(response, dict):
        return response.get("payload", response) or {}

    return {}


def fetch_returns_report(creds, days=30):
    """
    Get Amazon seller returns and aggregate them by SKU / ASIN.

    The result is cached so /api/amazon/products does not create a new
    Amazon report on every frontend request.
    """

    now = datetime.now(timezone.utc)

    # ---------------------------------------------------------
    # CACHE
    # ---------------------------------------------------------

    if (
        RETURNS_CACHE["generated_at"]
        and RETURNS_CACHE["data"]
        and (now - RETURNS_CACHE["generated_at"]).total_seconds()
        < RETURNS_CACHE_TTL
    ):
        return RETURNS_CACHE["data"]

    client = Reports(
        marketplace=Marketplaces.IN,
        credentials=creds(),
    )

    end_dt = now
    start_dt = end_dt - timedelta(days=min(int(days), 60))

    print(
        "[RETURNS] Requesting returns report:",
        {
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
        },
    )

    # ---------------------------------------------------------
    # FIND RECENT COMPLETED REPORT FIRST
    # ---------------------------------------------------------

    existing = client.get_reports(
        reportTypes=[
            ReportType.GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE
        ],
        processingStatuses=["DONE"],
        marketplaceIds=[
            Marketplaces.IN.marketplace_id
        ],
        pageSize=10,
        createdSince=(now - timedelta(hours=24)).isoformat(),
    )

    existing_payload = _report_payload(existing)

    reports = existing_payload.get("reports", []) or []

    report = None

    if reports:
        # newest completed report
        reports.sort(
            key=lambda x: x.get("createdTime", ""),
            reverse=True,
        )

        report = reports[0]

    # ---------------------------------------------------------
    # CREATE NEW REPORT IF NEEDED
    # ---------------------------------------------------------

    if not report:
        created = client.create_report(
            reportType=ReportType.GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE,
            dataStartTime=start_dt.isoformat(),
            dataEndTime=end_dt.isoformat(),
            marketplaceIds=[
                Marketplaces.IN.marketplace_id
            ],
        )

        created_payload = _report_payload(created)

        report_id = created_payload.get("reportId")

        if not report_id:
            raise RuntimeError(
                f"Amazon did not return reportId: {created_payload}"
            )

        print(
            "[RETURNS] Created report:",
            report_id,
        )

        # -----------------------------------------------------
        # IMPORTANT:
        # Don't wait minutes inside /products.
        # Let the next products request use the completed report.
        # -----------------------------------------------------

        return RETURNS_CACHE["data"]

    report_id = report.get("reportId")
    report_document_id = report.get("reportDocumentId")

    if not report_document_id:
        # Report exists but is not usable yet.
        return RETURNS_CACHE["data"]

    print(
        "[RETURNS] Using completed report:",
        report_id,
        report_document_id,
    )

    # ---------------------------------------------------------
    # GET REPORT DOCUMENT
    # ---------------------------------------------------------

    document_response = client.get_report_document(
        report_document_id,
        download=False,
        file=None,
        character_code=None,
        stream=False,
        timeout=60,
    )

    document = _report_payload(document_response)

    url = document.get("url")

    if not url:
        raise RuntimeError(
            f"Amazon did not return report document URL: {document}"
        )

    compression = document.get("compressionAlgorithm")

    response = requests.get(
        url,
        timeout=60,
    )

    response.raise_for_status()

    raw_data = response.content

    if compression == "GZIP":
        raw_data = gzip.decompress(raw_data)

    text = raw_data.decode(
        "utf-8-sig",
        errors="replace",
    )

    # ---------------------------------------------------------
    # PARSE TAB-DELIMITED REPORT
    # ---------------------------------------------------------

    reader = csv.DictReader(
        io.StringIO(text),
        delimiter="\t",
    )

    rows = list(reader)

    print(
        "[RETURNS] Rows received:",
        len(rows),
    )

    # ---------------------------------------------------------
    # AGGREGATE RETURNS
    # ---------------------------------------------------------

    aggregated = {}

    for row in rows:

        sku = (
            row.get("SKU")
            or row.get("Merchant SKU")
            or row.get("merchant_sku")
            or ""
        ).strip()

        asin = (
            row.get("ASIN")
            or row.get("asin")
            or ""
        ).strip()

        if not sku and not asin:
            continue

        key = sku or asin

        if key not in aggregated:
            aggregated[key] = {
                "return_count": 0,
                "return_quantity": 0,
                "return_amount": 0.0,
                "returns": [],
            }

        quantity_raw = (
            row.get("Return quantity")
            or row.get("return_quantity")
            or "0"
        )

        try:
            quantity = int(float(quantity_raw))
        except (TypeError, ValueError):
            quantity = 0

        refund_raw = (
            row.get("Refund amount")
            or row.get("refund_amount")
            or "0"
        )

        try:
            refund_amount = float(
                str(refund_raw)
                .replace(",", "")
                .replace("₹", "")
                .strip()
                or 0
            )
        except (TypeError, ValueError):
            refund_amount = 0.0

        aggregated[key]["return_count"] += 1
        aggregated[key]["return_quantity"] += quantity
        aggregated[key]["return_amount"] += refund_amount

        aggregated[key]["returns"].append({
            "orderId": (
                row.get("Order ID")
                or row.get("order_id")
            ),
            "returnDate": (
                row.get("Return request date")
                or row.get("return_request_date")
            ),
            "returnStatus": (
                row.get("Return request status")
                or row.get("return_request_status")
            ),
            "rmaId": (
                row.get("Amazon RMA ID")
                or row.get("amazon_rma_id")
            ),
            "asin": asin,
            "sku": sku,
            "quantity": quantity,
            "returnReason": (
                row.get("Return reason")
                or row.get("return_reason_code")
                or row.get("Return reason code")
            ),
            "resolution": (
                row.get("Resolution")
                or row.get("resolution")
            ),
            "refundAmount": refund_amount,
            "aToZClaim": (
                row.get("A-to-Z Claim")
                or row.get("a_to_z_claim")
            ),
            "trackingId": (
                row.get("Tracking ID")
                or row.get("tracking_id")
            ),
        })

    result = list(aggregated.values())

    # ---------------------------------------------------------
    # CACHE
    # ---------------------------------------------------------

    RETURNS_CACHE["data"] = result
    RETURNS_CACHE["generated_at"] = now
    RETURNS_CACHE["report_id"] = report_id

    print(
        "[RETURNS] Products with returns:",
        len(result),
    )

    return result


# def build_products():
#     ensure_credentials()

#     inv = inventory_map()
#     asins = list(inv.keys())
#     listings = listing_map(asins, inv)

#     # Existing Sales & Traffic report.
#     # This can remain unavailable if Amazon returns 403.
#     try:
#         sr = sales_rows(sales_report())
#     except Exception as e:
#         print("Sales/Traffic failed:", e)
#         sr = {}

#     # Orders API sales.
#     try:
#         order_sales = amazon_brand_sales()
#     except Exception as e:
#         print("Orders API sales failed:", e)
#         order_sales = {}

#     for a in sr:
#         if a not in asins:
#             asins.append(a)

#     for a in order_sales:
#         if a not in asins:
#             asins.append(a)

#     out = []

#     for asin in asins:
#         i = inv.get(asin, {})
#         l = listings.get(asin, {})
#         m = metrics(sr.get(asin, []))
#         osales = order_sales.get(asin, {})

#         # Available inventory = FBM + FBA available.
#         fbm_available = num(l.get("merchantAvailable", 0))
#         fba_available = num(i.get("fbaAvailable", 0))
#         total = fbm_available + fba_available

#         # Orders-based 1D sales.

#         print(
#        f"[INVENTORY DEBUG] {asin} | "
#     f"FBM={fbm_available} | "
#     f"FBA={fba_available} | "
#     f"TOTAL={total} | "
#     f"inv={i} | "
#     f"listing={l}"

# )
        
#         drr1d = num(osales.get("sales1d", 0))

#         # We do not have a reliable "2 days ago" Orders API
#         # value in this aggregation yet.
#         drr1d_minus2 = 0

#         trend = (
#             "up"
#             if drr1d > drr1d_minus2
#             else (
#                 "down"
#                 if drr1d < drr1d_minus2
#                 else "flat"
#             )
#         )

#         out.append({
#             "clientId": "38",
#             "productId": asin,
#             "asin": asin,
#             "marketplace": "amazon_sc",
#             "marketplaceId": account_value("MARKETPLACE_ID"),

#             # "brand": l.get("brand"),
#             "brand": (
#     l.get("brand")
#     or (
#         "Unfooled"
#         if "unfooled" in str(l.get("title", "")).lower()
#         else None
#     )
# ),
#             "itemTitle": l.get("title"),
#             "image": l.get("image"),
#             "productUrl": f"https://www.amazon.in/dp/{asin}",
#             "status": l.get("status"),
#             "finalPrice": l.get("price"),

#             "totalInventory": norm(total),

#             "fulfillableQuantity": i.get("fulfillableQuantity", 0),
#             "inboundQuantity": i.get("inboundQuantity", 0),
#             "unfulfillableQuantity": i.get("unfulfillableQuantity", 0),
#             "reservedQuantity": i.get("reservedQuantity", 0),

#             "sellerSku": l.get("sku") or i.get("sellerSku"),
#             "fnSku": l.get("fnSku") or i.get("fnSku"),
#             "inventoryMaxDate": i.get("inventoryMaxDate"),

#             # FBM
#             "fbmAvailable": norm(fbm_available),

#             # FBA
#             "onHandFba": i.get("onHandFba", 0),
#             "fbaAvailable": i.get("fbaAvailable", 0),
#             "fbaInbound": i.get("fbaInbound", 0),
#             "fbaUnfulfillable": i.get("fbaUnfulfillable", 0),
#             "fbaReserved": i.get("fbaReserved", 0),

#             # Orders API sales
#             "ordersSales1d": norm(osales.get("sales1d", 0)),
#             "ordersSales7d": norm(osales.get("sales7d", 0)),
#             "ordersSales15d": norm(osales.get("sales15d", 0)),
#             "ordersSales30d": norm(osales.get("sales30d", 0)),

#             "ordersRevenue1d": norm(osales.get("revenue1d", 0)),
#             "ordersRevenue7d": norm(osales.get("revenue7d", 0)),
#             "ordersRevenue15d": norm(osales.get("revenue15d", 0)),
#             "ordersRevenue30d": norm(osales.get("revenue30d", 0)),

#             # Existing Sales & Traffic metrics, when available.
#             **m,

#             "trend": trend
#         })

#     return out


@cached_amazon(seconds=300)
def build_products(creds=None, listing_rows=False):
    ensure_credentials()

    # Independent Amazon operations run together; each worker gets its own
    # Flask request context so credentials and caches remain company scoped.
    environment = dict(request.environ) if has_request_context() else None
    def run(fn, fallback=None):
        def invoke():
            try:
                return fn()
            except Exception:
                if fallback is not None:
                    return fallback
                raise
        if environment is None:
            return invoke()
        with app.request_context(dict(environment)):
            return invoke()

    with ThreadPoolExecutor(max_workers=4) as executor:
        inventory_future = executor.submit(run, inventory_map)
        catalog_future = executor.submit(run, seller_listing_items)
        sales_future = executor.submit(run, sales_report, {})
        orders_future = executor.submit(run, amazon_brand_sales, {})
        inv = inventory_future.result()
        discovered = catalog_future.result()
        sr = sales_rows(sales_future.result())
        order_sales = orders_future.result()
    asins = list(dict.fromkeys([*discovered, *inv]))

    for a in sr:
        if a not in asins:
            asins.append(a)

    for a in order_sales:
        if a not in asins:
            asins.append(a)

    listings = listing_map(asins, inv, discovered)

    out = []

    for asin in asins:
        i = inv.get(asin, {})
        l = listings.get(asin, {})
        m = metrics(sr.get(asin, []))
        osales = order_sales.get(asin, {})

        fbm_available = num(l.get("merchantAvailable", 0))
        fba_available = num(i.get("fbaAvailable", 0))
        total = fbm_available + fba_available

        print(
            f"[INVENTORY DEBUG] {asin} | "
            f"FBM={fbm_available} | "
            f"FBA={fba_available} | "
            f"TOTAL={total} | "
            f"inv={i} | "
            f"listing={l}"
        )

        drr1d = num(osales.get("sales1d", 0))
        drr1d_minus2 = 0

        trend = (
            "up"
            if drr1d > drr1d_minus2
            else (
                "down"
                if drr1d < drr1d_minus2
                else "flat"
            )
        )

        out.append({
            "clientId": "38",
            "productId": asin,
            "asin": asin,
            "marketplace": "amazon_sc",
            "marketplaceId": account_value("MARKETPLACE_ID"),
            "brand": (
                l.get("brand")
                or (
                    "Unfooled"
                    if "unfooled" in str(l.get("title", "")).lower()
                    else None
                )
            ),
            "itemTitle": l.get("title"),
            "image": l.get("image"),
            "productUrl": f"https://www.amazon.in/dp/{asin}",
            "status": l.get("status"),
            "finalPrice": l.get("price"),
            "totalInventory": norm(total),
            "fulfillableQuantity": i.get("fulfillableQuantity", 0),
            "inboundQuantity": i.get("inboundQuantity", 0),
            "unfulfillableQuantity": i.get("unfulfillableQuantity", 0),
            "reservedQuantity": i.get("reservedQuantity", 0),
            "sellerSku": l.get("sku") or i.get("sellerSku"),
            "fnSku": l.get("fnSku") or i.get("fnSku"),
            "inventoryMaxDate": i.get("inventoryMaxDate"),
            "fbmAvailable": norm(fbm_available),
            "onHandFba": i.get("onHandFba", 0),
            "fbaAvailable": i.get("fbaAvailable", 0),
            "fbaInbound": i.get("fbaInbound", 0),
            "fbaUnfulfillable": i.get("fbaUnfulfillable", 0),
            "fbaReserved": i.get("fbaReserved", 0),
            "ordersSales1d": norm(osales.get("sales1d", 0)),
            "ordersSales7d": norm(osales.get("sales7d", 0)),
            "ordersSales15d": norm(osales.get("sales15d", 0)),
            "ordersSales30d": norm(osales.get("sales30d", 0)),
            "ordersRevenue1d": norm(osales.get("revenue1d", 0)),
            "ordersRevenue7d": norm(osales.get("revenue7d", 0)),
            "ordersRevenue15d": norm(osales.get("revenue15d", 0)),
            "ordersRevenue30d": norm(osales.get("revenue30d", 0)),
            **m,
            "trend": trend,
        })

    if listing_rows:
        # Seller Central counts SKUs, while sales reports aggregate by ASIN.
        # Keep all current listings without duplicating ASINs in brand summaries.
        by_asin = {row["asin"]: row for row in out}
        expanded = []
        seen_skus = set()
        for asin, items in discovered.items():
            for item in items:
                sku = item.get("sku") or item.get("sellerSku")
                if not sku or sku in seen_skus:
                    continue
                seen_skus.add(sku)
                listing = listing_map([asin], inv, {asin: [item]}).get(asin, {})
                row = dict(by_asin.get(asin, {}))
                inventory = getattr(inv, "by_sku", {}).get(sku, {})
                merchant_available = num(listing.get("merchantAvailable"))
                fba_available = num(inventory.get("fbaAvailable", listing.get("fbaAvailable", 0)))
                row.update(
                    productId=f"{asin}:{sku}", asin=asin, sellerSku=sku,
                    itemTitle=listing.get("title"), image=listing.get("image"),
                    brand=listing.get("brand"), status=listing.get("status"),
                    finalPrice=listing.get("price"), fnSku=inventory.get("fnSku") or listing.get("fnSku"),
                    totalInventory=norm(merchant_available + fba_available),
                    fbmAvailable=norm(merchant_available), fbaAvailable=norm(fba_available),
                    salesMetricsScope="ASIN",
                )
                for field in ("fulfillableQuantity", "inboundQuantity", "unfulfillableQuantity",
                              "reservedQuantity", "onHandFba", "fbaInbound", "fbaUnfulfillable", "fbaReserved"):
                    row[field] = inventory.get(field, 0)
                expanded.append(row)
        out = expanded

    # ---------------------------------------------------------
    # Merge Amazon Returns data into the SAME product objects.
    # Returns are optional: a report/API failure must not break
    # the existing product API.
    # ---------------------------------------------------------
    for product in out:
        product["return_count"] = 0
        product["return_quantity"] = 0
        product["return_amount"] = 0
        product["returns"] = []

    if creds:
        try:
            returns = fetch_returns_report(creds, days=30)

            return_by_sku = {}
            return_by_asin = {}

            for item in returns or []:
                for ret in item.get("returns", []) or []:
                    sku = str(ret.get("sku") or "").strip()
                    asin_key = str(ret.get("asin") or "").strip()

                    if sku:
                        return_by_sku[sku] = item

                    if asin_key:
                        return_by_asin[asin_key] = item

            for product in out:
                sku = str(product.get("sellerSku") or "").strip()
                asin_key = str(product.get("asin") or "").strip()

                return_data = (
                    return_by_sku.get(sku)
                    or return_by_asin.get(asin_key)
                )

                if return_data:
                    product["return_count"] = return_data.get(
                        "return_count", 0
                    )
                    product["return_quantity"] = return_data.get(
                        "return_quantity", 0
                    )
                    product["return_amount"] = return_data.get(
                        "return_amount", 0
                    )
                    product["returns"] = return_data.get(
                        "returns", []
                    )

        except Exception as return_error:
            print(
                "[RETURNS] Failed to merge returns into products:",
                repr(return_error),
            )

    return out


def build_brand_sales_summary():
    if organization() in ('rayom', 'linso'):
        vendor_account = 'mvr' if organization() == 'linso' else 'cb'
        metrics, periods = product_sales_periods(vendor_account, include_units=True)
        refresh_product_sales(vendor_account, periods)
        stock = cb_product_inventory(vendor_account)
        brands = {}
        for asin in set(metrics) | set(stock):
            values = metrics.get(asin, {})
            brand = stock.get(asin, {}).get('brand') or next((v.get('brand') for v in values.values() if isinstance(v, dict) and v.get('brand')), None) or ('LINSO' if organization() == 'linso' else 'Energizer')
            row = brands.setdefault(brand.strip().casefold(), dict(brand=brand.strip(), totalInventory=0, trend='neutral',
                **{f'{metric}{days}d': 0 if periods[str(days)]['complete'] else None
                   for metric in ('drr', 'revenue') for days in (1, 7, 15, 30)}))
            row['totalInventory'] += num(stock.get(asin, {}).get('units'))
            for days in (1, 7, 15, 30):
                if not periods[str(days)]['complete']:
                    continue
                sales = values.get(str(days), {})
                row[f'drr{days}d'] += num(sales.get('orderedUnits'))
                row[f'revenue{days}d'] += num(sales.get('orderedRevenue'))
        for row in brands.values():
            for metric in ('drr', 'revenue'):
                for days in (1, 7, 15, 30):
                    field = f'{metric}{days}d'
                    if row[field] is not None:
                        row[field] = round(row[field] / days if metric == 'drr' else row[field], 2)
        return list(brands.values())
    products = build_products()
    brands = {}

    for product in products:
        raw_brand = product.get("brand")

        if not raw_brand:
            continue

        # Same brand ko case-insensitive merge karega.
        brand_key = str(raw_brand).strip().lower()

        if brand_key not in brands:
            brands[brand_key] = {
                "brand": str(raw_brand).strip(),
                "totalInventory": 0,
                "cumulativePageViews7d": 0,

                "sales7d": 0,
                "sales15d": 0,
                "sales30d": 0,

                "revenue7d": 0,
                "revenue1d": 0,
                "revenue15d": 0,
                "revenue30d": 0,

                "drr1d": 0,
                "drr1dMinus2": 0,
                "drr7d": 0,
                "drr15d": 0,
                "drr30d": 0
            }

        b = brands[brand_key]
        b['revenue1d'] += num(product.get('ordersRevenue1d'))

        # Inventory
        b["totalInventory"] += num(
            product.get("totalInventory")
        )

        # Traffic, if Sales & Traffic report is available
        b["cumulativePageViews7d"] += num(
            product.get("pageViews7d")
        )

        # Orders API sales
        b["sales7d"] += num(
            product.get("ordersSales7d")
        )

        b["sales15d"] += num(
            product.get("ordersSales15d")
        )

        b["sales30d"] += num(
            product.get("ordersSales30d")
        )

        b["revenue7d"] += num(
            product.get("ordersRevenue7d")
        )

        b["revenue15d"] += num(
            product.get("ordersRevenue15d")
        )

        b["revenue30d"] += num(
            product.get("ordersRevenue30d")
        )

        # DRR = units sold / number of days
        b["drr1d"] += num(
            product.get("ordersSales1d")
        )

        b["drr1dMinus2"] += 0

        b["drr7d"] += (
            num(product.get("ordersSales7d")) / 7
        )

        b["drr15d"] += (
            num(product.get("ordersSales15d")) / 15
        )

        b["drr30d"] += (
            num(product.get("ordersSales30d")) / 30
        )

    result = []

    for b in brands.values():

        if b["drr1d"] > b["drr1dMinus2"]:
            trend = "up"
        elif b["drr1d"] < b["drr1dMinus2"]:
            trend = "down"
        else:
            trend = "neutral"

        result.append({
            "brand": b["brand"],
            "trend": trend,

            "totalInventory": norm(
                b["totalInventory"]
            ),

            "cumulativePageViews7d": norm(
                b["cumulativePageViews7d"]
            ),

            "sales7d": norm(b["sales7d"]),
            "sales15d": norm(b["sales15d"]),
            "sales30d": norm(b["sales30d"]),

            "drr1d": norm(b["drr1d"]),
            "drr7d": norm(b["drr7d"]),
            "drr15d": norm(b["drr15d"]),
            "drr30d": norm(b["drr30d"]),

            "revenue7d": norm(b["revenue7d"]),
            "revenue1d": norm(b["revenue1d"]),
            "revenue15d": norm(b["revenue15d"]),
            "revenue30d": norm(b["revenue30d"])
        })

    return result

@app.post("/api/amazon/brand-sales-summary")
def brand_sales_summary():

    try:
        b = request.get_json(silent=True) or {}

        page = int(b.get("page", 1))
        limit = int(b.get("limit", 10))

        sort_by = b.get("sortBy", "drr_7d")
        sort_order = b.get("sortOrder", "desc")

        if page < 1:
            page = 1

        if limit <= 0:
            limit = 10

        data = build_brand_sales_summary()
        overall = {'brand': 'Overall'}
        for metric in ('drr', 'revenue'):
            for days in (1, 7, 15, 30):
                field = f'{metric}{days}d'
                overall[field] = None if any(row.get(field) is None for row in data) else round(sum(num(row.get(field)) for row in data), 2)
        summary_pending = sales_refresh_pending()
        if organization() in ('rayom', 'linso'):
            _, periods = product_sales_periods('mvr' if organization() == 'linso' else 'cb', include_units=True)
            summary_pending = any(not period['complete'] for period in periods.values())

        # Frontend naming -> backend field mapping
        sort_map = {
            "drr_1d": "drr1d",
            "drr_1d_minus2": "drr1dMinus2",
            "drr_7d": "drr7d",
            "drr_15d": "drr15d",
            "drr_30d": "drr30d",
            "revenue_7d": "revenue7d",
            "revenue_1d": "revenue1d",
            "revenue_15d": "revenue15d",
            "revenue_30d": "revenue30d",
            "pageViews7d": "cumulativePageViews7d",
            "totalInventory": "totalInventory"
        }

        actual_sort_field = sort_map.get(
            sort_by,
            sort_by
        )

        def sort_key(x):
            value = x.get(actual_sort_field)

            try:
                return float(value or 0)
            except Exception:
                return str(value or "")

        data.sort(
            key=sort_key,
            reverse=str(sort_order).lower() == "desc"
        )

        total = len(data)

        start = (page - 1) * limit
        end = start + limit

        paginated = data[start:end]

        total_pages = (
            (total + limit - 1) // limit
            if total > 0
            else 0
        )

        return jsonify({
            "data": paginated,
            "overall": overall,

            "pagination": {
                "total": total,
                "limit": limit,
                "offset": start,
                "hasMore": end < total,
                "currentPage": page,
                "totalPages": total_pages
            },

            "metadata": {
                "salesRefreshing": summary_pending,
                "timestamp": datetime.now(
                    timezone.utc
                ).isoformat(),

                "groupBy": [
                    "brand"
                ],

                "aggregations": [
                    {
                        "field": "totalInventory",
                        "type": "sum",
                        "alias": "totalInventory"
                    },
                    {
                        "field": "revenue7d",
                        "type": "sum",
                        "alias": "revenue7d"
                    },
                    {
                        "field": "revenue15d",
                        "type": "sum",
                        "alias": "revenue15d"
                    },
                    {
                        "field": "revenue30d",
                        "type": "sum",
                        "alias": "revenue30d"
                    },
                    {
                        "field": "drr1d",
                        "type": "sum",
                        "alias": "drr1d"
                    },
                    {
                        "field": "drr7d",
                        "type": "sum",
                        "alias": "drr7d"
                    },
                    {
                        "field": "drr15d",
                        "type": "sum",
                        "alias": "drr15d"
                    },
                    {
                        "field": "drr30d",
                        "type": "sum",
                        "alias": "drr30d"
                    },
                    {
                        "field": "pageViews7d",
                        "type": "sum",
                        "alias": "pageViews7d"
                    }
                ]
            }
        })

    except Exception as e:

        import traceback
        traceback.print_exc()

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.get("/api/health")
def health():return jsonify(success=True,service="amazon-sp-api")

@app.get("/api/amazon/status")
def status():
    try:
        ensure_credentials()
        return jsonify(success=True,configured=True,merchantId=account_value("MERCHANT_ID"),marketplaceId=account_value("MARKETPLACE_ID"))
    except Exception as e:return jsonify(success=False,configured=False,error=str(e)),500

@app.get("/api/amazon/listing-test")
def listing_test():
    asin=request.args.get("asin","").strip()
    sku=request.args.get("sku","8906206610079").strip()
    if not asin:return jsonify(success=False,error="asin is required"),400
    try:
        c=ListingsItems(marketplace=Marketplaces.IN,refresh_token=account_value("REFRESH_TOKEN"),credentials=creds())
        r=c.get_listings_item(sellerId=account_value("MERCHANT_ID"),sku=sku,marketplaceIds=[account_value("MARKETPLACE_ID")],includedData="summaries,attributes,offers,fulfillmentAvailability")
        return jsonify(success=True,asin=asin,data=payload(r))
    except Exception as e:return jsonify(success=False,asin=asin,error=str(e)),500

@app.get("/api/amazon/price-test")
def price_test():
    asin=request.args.get("asin","").strip()
    if not asin:return jsonify(success=False,error="asin is required"),400
    try:
        c=Products(marketplace=Marketplaces.IN,refresh_token=account_value("REFRESH_TOKEN"),credentials=creds())
        r=c.get_item_offers(asin=asin,item_condition="New",MarketplaceId=account_value("MARKETPLACE_ID"))
        p=payload(r);offers=p.get("Offers") or p.get("offers") or [] if isinstance(p,dict) else []
        price=None
        for o in offers:
            q=o.get("ListingPrice") or o.get("listingPrice") or o.get("price") if isinstance(o,dict) else None
            if isinstance(q,dict) and (q.get("Amount") is not None or q.get("amount") is not None):
                price=float(q.get("Amount") or q.get("amount"));break
        return jsonify(success=True,asin=asin,finalPrice=norm(price) if price is not None else None,offersFound=len(offers),raw=p)
    except Exception as e:return jsonify(success=False,asin=asin,finalPrice=None,error=str(e)),500

    

# @app.post("/api/amazon/products")
# def products():
#     try:
#         b=request.get_json(silent=True) or {}
#         page=int(b.get("page",1));limit=int(b.get("limit",10))
#         sort_by=b.get("sortBy","drr_1d_minus2");sort_order=b.get("sortOrder","desc")
#         data=build_products()
#         def key(x):
#             v=x.get(sort_by)
#             try:return (0, float(v)) if v is not None else (0, 0)
#             except:return (1, str(v).casefold())
#         data.sort(key=key,reverse=str(sort_order).lower()=="desc")
#         total=len(data);start=(page-1)*limit;end=start+limit
#         return jsonify(success=True,products=data[start:end],total=total,page=page,limit=limit,sortBy=sort_by,sortOrder=sort_order,hasNext=end<total)
#     except Exception as e:
#         import traceback;traceback.print_exc()
#         return jsonify(success=False,error=str(e)),500

@app.post("/api/amazon/products")
def products():

    try:
        b = request.get_json(silent=True) or {}

        try:
            page = int(b.get("page", 1))
            limit = int(b.get("limit", 10))
        except (ValueError, TypeError):
            return jsonify(success=False, error="Page and limit must be integers."), 400
        if page < 1 or not 1 <= limit <= 100:
            return jsonify(success=False, error="Page must be positive and limit must be between 1 and 100."), 400

        sort_by = b.get(
            "sortBy",
            "drr_1d_minus2"
        )

        sort_order = b.get(
            "sortOrder",
            "desc"
        )

        # Existing product data + Amazon return data
        data = build_products(creds, listing_rows=True)
        # Hide CJK-labelled duplicate listings only in Product Details.
        data=[row for row in data if not re.search(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U000323af]',str(row.get('sellerSku') or row.get('sku') or ''))]
        seller_products_by_asin={row.get('asin'):row for row in data}
        vendor_stock={}
        inventory_pending=False
        if organization()=='rayom':
            try: vendor_stock=cb_product_inventory()
            except (sqlite3.Error,ValueError): pass
        elif organization()=='linso':
            try: vendor_stock=cb_product_inventory('mvr')
            except (sqlite3.Error,ValueError): pass
            # One row per MVR ASIN, retaining seller quantities when listed.
            seller_rows={}
            for row in data:
                if row.get('asin') in vendor_stock:
                    seller_rows.setdefault(row['asin'],[]).append(row)
            merged=[]
            for asin,stock in vendor_stock.items():
                listings=seller_rows.get(asin,[])
                if listings:
                    row=dict(listings[0],productId=asin,vendorOnly=False)
                    for field in ('fbmAvailable','fbaAvailable','fbaReserved','totalInventory'):
                        values=[item[field] for item in listings if isinstance(item.get(field),(int,float))]
                        row[field]=norm(sum(values)) if values else None
                    row['sellerSkus']=[item.get('sellerSku') for item in listings if item.get('sellerSku')]
                else:
                    row=dict(asin=asin,productId=asin,itemTitle=stock.get('productTitle') or asin,brand=stock.get('brand'),productUrl='https://www.amazon.in/dp/'+asin,marketplace='amazon_vendor',vendorOnly=True,finalPrice=None,fbmAvailable=None,fbaAvailable=None,fbaReserved=None)
                merged.append(row)
            data=merged
        if organization() in ('rayom','linso'):
            inventory_pending=refresh_product_inventory('cb' if organization()=='rayom' else 'mvr')
        if organization()=='rayom':
            listed={row.get('asin') for row in data}
            for asin,stock in vendor_stock.items():
                if asin not in listed:
                    data.append(dict(asin=asin,productId=asin,itemTitle=stock.get('productTitle') or asin,brand=stock.get('brand'),productUrl='https://www.amazon.in/dp/'+asin,marketplace='amazon_vendor',vendorOnly=True,finalPrice=None,fbmAvailable=None,fbaAvailable=None,fbaReserved=None))
        data=[dict(row,vendorInventory=vendor_stock.get(row.get('asin'),{}).get('units'),vendorInventoryDate=vendor_stock.get(row.get('asin'),{}).get('asOf')) for row in data]
        data=[dict(row,combinedInventory=norm(num(row.get('fbmAvailable'))+num(row.get('fbaAvailable'))+num(row.get('vendorInventory')))) for row in data]
        vendor_periods={}
        vendor_sales_pending=False
        if organization() in ('rayom','linso'):
            vendor_account='cb' if organization()=='rayom' else 'mvr'
            vendor_sales,vendor_periods=product_sales_periods(vendor_account,include_units=True)
            vendor_sales_pending=not all(period['complete'] for period in vendor_periods.values())
            refresh_product_sales(vendor_account,vendor_periods)
            if organization() in ('rayom','linso'):
                listed={row.get('asin') for row in data}
                for asin,period_values in vendor_sales.items():
                    if asin in listed or not any(isinstance(value,dict) and (value.get('orderedRevenue') or value.get('orderedUnits')) for value in period_values.values()): continue
                    info=next((value for value in period_values.values() if isinstance(value,dict) and value.get('productTitle')), {})
                    seller=seller_products_by_asin.get(asin)
                    row=dict(seller) if seller else dict(asin=asin,productId=asin,itemTitle=info.get('productTitle') or asin,brand=info.get('brand'),productUrl='https://www.amazon.in/dp/'+asin,marketplace='amazon_vendor',vendorOnly=True,finalPrice=None,fbmAvailable=None,fbaAvailable=None,fbaReserved=None)
                    row.update(vendorInventory=None,vendorInventoryDate=None,combinedInventory=norm(num(row.get('fbmAvailable'))+num(row.get('fbaAvailable'))))
                    data.append(row);listed.add(asin)
            for row in data:
                for days in (1,7,15,30,45):
                    complete=vendor_periods[str(days)]['complete']
                    sales=vendor_sales.get(row.get('asin'),{}).get(str(days),{'orderedUnits':0,'orderedRevenue':0})
                    units=sales.get('orderedUnits') if isinstance(sales,dict) and complete else None
                    amount=sales.get('orderedRevenue') if isinstance(sales,dict) and complete else None
                    revenue=round(float(amount),2) if isinstance(amount,(int,float)) else None
                    drr=round(float(units)/days,2) if isinstance(units,(int,float)) else None
                    row[f'vendorOrderedUnits{days}d']=units
                    for field in (f'revenue_{days}d',f'revenue{days}d',f'ordersRevenue{days}d'):
                        row[field]=revenue
                    for field in (f'drr_{days}d',f'drr{days}d'):
                        row[field]=drr
                    if days==1: row['drr_1d_minus2']=drr
        search = str(b.get("search") or "").strip().casefold()
        if search:
            data = [row for row in data if any(search in str(row.get(field) or "").casefold()
                    for field in ("asin", "sellerSku", "itemTitle", "brand"))]

        def key(x):
            v = x.get(sort_by)

            try:
                return (0, float(v)) if v is not None else (0, 0)
            except:
                return (1, str(v).casefold())

        data.sort(
            key=key,
            reverse=str(sort_order).lower() == "desc"
        )

        total = len(data)

        start = (page - 1) * limit
        end = start + limit

        return jsonify(
            success=True,
            salesRefreshing=vendor_sales_pending if vendor_periods else sales_refresh_pending(),
            inventoryRefreshing=inventory_pending,
            vendorSalesPeriods=vendor_periods,
            products=data[start:end],
            total=total,
            page=page,
            limit=limit,
            sortBy=sort_by,
            sortOrder=sort_order,
            hasNext=end < total
        )

    except Exception as e:

        import traceback
        traceback.print_exc()

        return jsonify(
            success=False,
            error=str(e)
        ), 500
    
# ============================================================
# AMAZON 7-DAY PERFORMANCE
# ============================================================

def _money_amount(value):
    """
    Safely extract a numeric amount from Amazon money objects.
    Supports:
      {"Amount": 199}
      {"amount": 199}
      {"CurrencyAmount": 199}
      {"Principal": {"Amount": 199}}
    """
    if value is None:
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    if isinstance(value, dict):
        # Principal can itself be a money object.
        principal = value.get("Principal") or value.get("principal")
        if principal is not None:
            amount = _money_amount(principal)
            if amount:
                return amount

        for key in (
            "Amount",
            "amount",
            "CurrencyAmount",
            "currencyAmount",
            "Value",
            "value",
        ):
            if value.get(key) is not None:
                return _money_amount(value.get(key))

    return 0.0


def _order_item_revenue(item):
    """
    Match Amazon Seller Central's Ordered product sales value.

    From the raw Orders API data, Ordered product sales matches:
        ItemPrice + ItemTax

    Example:
        ItemPrice = 2667.12
        ItemTax   = 242.88
        Ordered product sales = 2910.00
    """
    if not isinstance(item, dict):
        return 0.0

    item_price = item.get("ItemPrice") or item.get("itemPrice")
    item_tax = item.get("ItemTax") or item.get("itemTax")

    price_amount = _money_amount(item_price)
    tax_amount = _money_amount(item_tax)

    if price_amount or tax_amount:
        return price_amount + tax_amount

    principal = item.get("Principal") or item.get("principal")
    return _money_amount(principal)

@cached_amazon(seconds=300)
def amazon_performance_7d():
    """
    Build the Seller Central-compatible 7-point performance series.

    Seller Central screenshot supplied for 2026-09-18 shows the x-axis
    as 12 Sep -> 18 Sep, while the data is updated through 17 Sep.
    Therefore we return 12..18 and fetch actual orders only through
    the start of 18 Sep; 18 Sep remains zero until today's data exists.

    Ordered product sales = ItemPrice + ItemTax.
    """
    ensure_credentials()

    today_utc = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # Seven displayed dates: today-6 through today.
    series_start = today_utc - timedelta(days=6)
    fetch_end = today_utc

    print(
        "[PERFORMANCE] Date range:",
        series_start.strftime("%Y-%m-%d"),
        "->",
        today_utc.strftime("%Y-%m-%d")
    )

    # Fetch completed data only. Today is intentionally not fetched because
    # Seller Central screenshot is updated through yesterday.
    orders = amazon_orders(series_start, fetch_end, max_orders=None)

    daily_revenue = defaultdict(float)
    daily_units = defaultdict(int)
    processed_orders = 0
    processed_items = 0

    for order in orders:
        if not isinstance(order, dict):
            continue

        status = str(
            order.get("OrderStatus")
            or order.get("orderStatus")
            or ""
        ).upper()
        if status in {"CANCELED", "CANCELLED"}:
            continue

        purchase_raw = order.get("PurchaseDate") or order.get("purchaseDate")
        if not purchase_raw:
            continue

        try:
            purchase_date = datetime.fromisoformat(
                str(purchase_raw).replace("Z", "+00:00")
            )
        except Exception:
            continue

        if purchase_date.tzinfo is None:
            purchase_date = purchase_date.replace(tzinfo=timezone.utc)

        order_date = purchase_date.astimezone(timezone.utc).strftime("%Y-%m-%d")
        if not (
            series_start.strftime("%Y-%m-%d")
            <= order_date
            < fetch_end.strftime("%Y-%m-%d")
        ):
            continue

        order_id = (
            order.get("AmazonOrderId")
            or order.get("amazonOrderId")
            or order.get("OrderId")
            or order.get("orderId")
        )
        if not order_id:
            continue

        try:
            items = amazon_order_items(order_id)
        except Exception as e:
            error_text = str(e)
            if any(x in error_text for x in (
                "QuotaExceeded",
                "Throttled",
                "SellingApiRequestThrottledException",
            )):
                print(f"[PERFORMANCE] Orders API throttled for {order_id}; stopping further item calls.")
                break
            print(f"[PERFORMANCE] Failed items for {order_id}: {e}")
            continue

        processed_orders += 1

        for item in items:
            if not isinstance(item, dict):
                continue

            quantity = (
                item.get("QuantityOrdered")
                or item.get("quantityOrdered")
                or item.get("Quantity")
                or 0
            )
            try:
                quantity = int(quantity)
            except (TypeError, ValueError):
                quantity = 0

            daily_units[order_date] += quantity
            daily_revenue[order_date] += _order_item_revenue(item)
            processed_items += 1

        time.sleep(0.5)

    revenue_data = []
    units_data = []

    for i in range(7):
        current_date = series_start + timedelta(days=i)
        date_value = current_date.strftime("%Y-%m-%d")
        revenue_data.append({
            "date": date_value,
            "value": round(daily_revenue.get(date_value, 0.0), 2),
        })
        units_data.append({
            "date": date_value,
            "value": int(daily_units.get(date_value, 0)),
        })

    total_revenue = round(sum(row["value"] for row in revenue_data), 2)
    total_units = sum(row["value"] for row in units_data)

    print(
        f"[PERFORMANCE] Orders={processed_orders}, Items={processed_items}, "
        f"Revenue={total_revenue}, Units={total_units}"
    )

    return {
        "timePeriod": "7D",
        "dateRange": {
            "startDate": revenue_data[0]["date"],
            "endDate": revenue_data[-1]["date"],
        },
        "revenueSeries": [{
            "name": "amazon_sc",
            "data": [row["value"] for row in revenue_data],
        }],
        "revenueData": revenue_data,
        "unitsData": units_data,
        "totalRevenue": total_revenue,
        "totalUnits": total_units,
    }


@app.route("/api/amazon/performance", methods=["GET"])
def amazon_performance():

    try:
        if organization() in ('rayom', 'linso'):
            vendor_account = 'cb' if organization() == 'rayom' else 'mvr'
            data = performance_7d(vendor_account)
            if not data['complete']:
                _, periods = product_sales_periods(vendor_account)
                refresh_product_sales(vendor_account, periods)
        else:
            data = amazon_performance_7d()

        return jsonify({
            "success": True,
            **data
        })

    except Exception as exc:

        print(
            f"[PERFORMANCE ERROR] {exc}"
        )

        return jsonify({
            "success": False,
            "error": str(exc)
        }), 500


@app.get("/api/amazon/performance-debug")
def amazon_performance_debug():
    """
    Debug the raw Orders API values used by the 7-day performance calculation.

    Optional query param:
      ?date=2026-09-15

    Returns order-item fields needed to reconcile Amazon Seller Central's
    "Ordered product sales" with the Orders API calculation.
    """
    try:
        ensure_credentials()

        today_utc = datetime.now(timezone.utc).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0
        )
        start_date = today_utc - timedelta(days=7)
        end_date = today_utc

        requested_date = request.args.get("date", "").strip()
        if requested_date:
            try:
                datetime.strptime(requested_date, "%Y-%m-%d")
            except ValueError:
                return jsonify({
                    "success": False,
                    "error": "date must be YYYY-MM-DD"
                }), 400

        orders = amazon_orders(start_date, end_date, max_orders=None)
        rows = []

        for order in orders:
            if not isinstance(order, dict):
                continue

            status = str(
                order.get("OrderStatus")
                or order.get("orderStatus")
                or ""
            ).upper()

            if status in {"CANCELED", "CANCELLED"}:
                continue

            purchase_raw = (
                order.get("PurchaseDate")
                or order.get("purchaseDate")
            )
            if not purchase_raw:
                continue

            try:
                purchase_date = datetime.fromisoformat(
                    str(purchase_raw).replace("Z", "+00:00")
                )
            except Exception:
                continue

            if purchase_date.tzinfo is None:
                purchase_date = purchase_date.replace(tzinfo=timezone.utc)

            order_date = purchase_date.astimezone(timezone.utc).strftime("%Y-%m-%d")

            if requested_date and order_date != requested_date:
                continue

            order_id = (
                order.get("AmazonOrderId")
                or order.get("amazonOrderId")
                or order.get("OrderId")
                or order.get("orderId")
            )
            if not order_id:
                continue

            try:
                items = amazon_order_items(order_id)
            except Exception as exc:
                rows.append({
                    "orderDate": order_date,
                    "orderId": order_id,
                    "orderStatus": status,
                    "error": str(exc),
                })
                continue

            for item in items:
                if not isinstance(item, dict):
                    continue

                qty = (
                    item.get("QuantityOrdered")
                    or item.get("quantityOrdered")
                    or item.get("Quantity")
                    or 0
                )

                def money_field(name):
                    value = item.get(name)
                    if isinstance(value, dict):
                        return (
                            value.get("Amount")
                            or value.get("amount")
                            or value.get("Value")
                            or value.get("value")
                        )
                    return value

                rows.append({
                    "orderDate": order_date,
                    "purchaseDate": purchase_raw,
                    "orderId": order_id,
                    "orderStatus": status,
                    "asin": item.get("ASIN") or item.get("asin"),
                    "sellerSKU": item.get("SellerSKU") or item.get("sellerSKU"),
                    "quantityOrdered": qty,
                    "itemPrice": money_field("ItemPrice"),
                    "itemTax": money_field("ItemTax"),
                    "shippingPrice": money_field("ShippingPrice"),
                    "shippingTax": money_field("ShippingTax"),
                    "shippingDiscount": money_field("ShippingDiscount"),
                    "promotionDiscount": money_field("PromotionDiscount"),
                    "promotionDiscountTax": money_field("PromotionDiscountTax"),
                    "codFee": money_field("CODFee"),
                    "codFeeDiscount": money_field("CODFeeDiscount"),
                    "price": money_field("Price"),
                    "principal": money_field("Principal"),
                })

            time.sleep(0.5)

        # Candidate sums are useful for immediately seeing which Amazon
        # monetary field is closest to Seller Central's Ordered Product Sales.
        def as_float(value):
            try:
                return float(value or 0)
            except (TypeError, ValueError):
                return 0.0

        def sum_field(field):
            return round(sum(as_float(r.get(field)) for r in rows), 2)

        return jsonify({
            "success": True,
            "dateRange": {
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": (end_date - timedelta(days=1)).strftime("%Y-%m-%d")
            },
            "requestedDate": requested_date or None,
            "count": len(rows),
            "candidateTotals": {
                "itemPrice": sum_field("itemPrice"),
                "principal": sum_field("principal"),
                "itemTax": sum_field("itemTax"),
                "shippingPrice": sum_field("shippingPrice"),
                "promotionDiscount": sum_field("promotionDiscount"),
                "shippingDiscount": sum_field("shippingDiscount"),
                "codFee": sum_field("codFee"),
                "codFeeDiscount": sum_field("codFeeDiscount"),
            },
            "rows": rows,
        })

    except Exception as exc:
        print(f"[PERFORMANCE DEBUG ERROR] {exc}")
        return jsonify({
            "success": False,
            "error": str(exc)
        }), 500

@app.get("/api/amazon/listing-debug")
def listing_debug():
    asin = request.args.get("asin", "").strip()

    if not asin:
        return jsonify({
            "success": False,
            "error": "asin is required"
        }), 400

    try:
        api = ListingsItems(
            marketplace=Marketplaces.IN,
            refresh_token=account_value("REFRESH_TOKEN"),
            credentials=creds()
        )

        response = api.search_listings_items(
            sellerId=account_value("MERCHANT_ID"),
            marketplaceIds=[account_value("MARKETPLACE_ID")],
            identifiers=[asin],
            identifiersType="ASIN",
            includedData=(
                "summaries,attributes,offers,fulfillmentAvailability"
            ),
            pageSize=20
        )

        raw = payload(response)

        return jsonify({
            "success": True,
            "asin": asin,
            "raw": raw
        })

    except Exception as e:
        import traceback
        traceback.print_exc()

        return jsonify({
            "success": False,
            "asin": asin,
            "error": str(e)
        }), 500

@app.get("/api/amazon/sales-debug")
def sales_debug():
    try:
        report = sales_report()

        rows = sales_rows(report)

        return jsonify({
            "success": True,
            "asinCount": len(rows),
            "asins": list(rows.keys())[:50],
            "data": {
                asin: rows[asin]
                for asin in list(rows.keys())[:10]
            }
        })

    except Exception as e:
        import traceback

        print("\n========== AMAZON SALES DEBUG ==========")
        print("ERROR TYPE:", type(e).__name__)
        print("ERROR:", repr(e))

        if hasattr(e, "headers"):
            print("AMAZON HEADERS:")
            print(e.headers)

        if hasattr(e, "response"):
            print("AMAZON RESPONSE:")
            print(e.response)

        print("========================================\n")

        traceback.print_exc()

        return jsonify({
            "success": False,
            "error": str(e),
            "errorType": type(e).__name__,
            "amazonHeaders": dict(getattr(e, "headers", {}) or {})
        }), 500
@app.get("/api/amazon/orders-debug")
def orders_debug():
    try:
        data = amazon_brand_sales()

        return jsonify({
            "success": True,
            "asinCount": len(data),
            "data": data
        })

    except Exception as e:
        import traceback
        traceback.print_exc()

        return jsonify({
            "success": False,
            "error": str(e),
            "errorType": type(e).__name__
        }), 500


@app.get("/api/amazon/fba-inventory-debug")
def fba_inventory_debug():
    asin = request.args.get("asin", "").strip()
    sku = request.args.get("sku", "").strip()

    if not asin and not sku:
        return jsonify({
            "success": False,
            "error": "asin or sku is required"
        }), 400

    try:
        c = Inventories(
            marketplace=Marketplaces.IN,
            refresh_token=account_value("REFRESH_TOKEN"),
            credentials=creds()
        )

        r = c.get_inventory_summary_marketplace(
            details=True,
            marketplaceIds=[account_value("MARKETPLACE_ID")]
        )

        raw = payload(r)

        rows = (
            raw.get("inventorySummaries", [])
            if isinstance(raw, dict)
            else []
        )

        matches = []

        for row in rows:
            if not isinstance(row, dict):
                continue

            row_asin = (
                row.get("asin")
                or row.get("ASIN")
                or row.get("productId")
            )

            row_sku = (
                row.get("sellerSku")
                or row.get("sellerSKU")
                or row.get("sku")
            )

            row_fnsku = row.get("fnSku")

            if (
                (asin and row_asin == asin)
                or
                (sku and row_sku == sku)
            ):
                matches.append(row)

        return jsonify({
            "success": True,
            "asin": asin,
            "sku": sku,
            "matches": matches,
            "matchCount": len(matches)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    
@app.get("/api/amazon/reports-debug")
def reports_debug():
    try:
        c = Reports(
            marketplace=Marketplaces.IN,
            refresh_token=account_value("REFRESH_TOKEN"),
            credentials=creds()
        )

        r = c.get_reports(
    marketplaceIds=[account_value("MARKETPLACE_ID")],
    reportTypes=["GET_SALES_AND_TRAFFIC_REPORT"],
    pageSize=5
)

        return jsonify({
            "success": True,
            "data": payload(r)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()

        return jsonify({
            "success": False,
            "error": str(e),
            "errorType": type(e).__name__,
            "amazonHeaders": dict(getattr(e, "headers", {}) or {})
        }), 500

  
if __name__=="__main__":
    app.run(host="0.0.0.0",port=5002,debug=True)
