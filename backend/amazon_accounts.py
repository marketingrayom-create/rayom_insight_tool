"""Request-scoped Amazon seller credentials and company-separated caches."""
import os
from copy import deepcopy
from flask import g, has_request_context, request
from werkzeug.local import LocalProxy


def organization():
    if not has_request_context():
        return "shelfesteem"
    company = request.args.get("organization", "shelfesteem").strip().lower()
    if company not in ("shelfesteem", "rayom", "linso"):
        raise ValueError("Choose Shelfesteem, Rayom Energizer or Rayom Linso.")
    return company


def configuration():
    company = organization()
    if has_request_context() and company in getattr(g, "amazon_accounts", {}):
        return g.amazon_accounts[company]
    prefix = {"rayom":"AMAZON_RAYOM_","linso":"AMAZON_LINSO_","shelfesteem":"AMAZON_"}[company]
    names = {
        "CLIENT_ID": prefix + "SP_API_CLIENT_ID",
        "CLIENT_SECRET": prefix + "SP_API_CLIENT_SECRET",
        "REFRESH_TOKEN": prefix + "SP_API_REFRESH_TOKEN",
        "MERCHANT_ID": prefix + "MERCHANT_ID",
        "MARKETPLACE_ID": prefix + "MARKETPLACE_ID",
    }
    values = {key: (os.getenv(name) or "").strip() for key, name in names.items()}
    if company=='linso':
        values['CLIENT_SECRET']=values['CLIENT_SECRET'] or (os.getenv('AMAZON_LINSO_SP_CLIENT_SECRET') or '').strip()
        values['REFRESH_TOKEN']=values['REFRESH_TOKEN'] or (os.getenv('AMAZON_LINSO_REFRESH_TOKEN') or '').strip()
        values['MERCHANT_ID']=values['MERCHANT_ID'] or (os.getenv('AMAZON_LINSO_SP_API_MERCHANT_ID') or os.getenv('AMAZON_LINSO_SELLER_ID') or '').strip()
    # Support the spelling already used in this project's Rayom environment.
    if not values["MERCHANT_ID"]:
        values["MERCHANT_ID"] = (os.getenv(prefix + "MARCHENT_ID") or "").strip()
    values["MARKETPLACE_ID"] = values["MARKETPLACE_ID"] or "A21TJRUUN4KGV"
    result = (company, names, values)
    if has_request_context():
        if not hasattr(g, "amazon_accounts"):
            g.amazon_accounts = {}
        g.amazon_accounts[company] = result
    return result


def account_value(key):
    return configuration()[2][key]


def validate_account():
    company, names, values = configuration()
    missing = [names[key] for key in ("CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN", "MERCHANT_ID") if not values[key]]
    if missing:
        raise RuntimeError(f"Missing Amazon environment variables for {company}: " + ", ".join(missing))


def account_cache(name, initial):
    caches = {}

    def current():
        company = organization()
        if company not in caches:
            caches[company] = deepcopy(initial)
        return caches[company]

    return LocalProxy(current)
