"""Company-scoped short-lived cache; concurrent callers share one API fetch."""
from copy import deepcopy
from functools import wraps
from hashlib import sha256
from threading import Lock
from time import monotonic
from amazon_accounts import account_value, organization


def cached_amazon(seconds=300):
    def decorate(fn):
        entries = {}
        locks = {}
        registry_lock = Lock()

        @wraps(fn)
        def wrapped(*args, **kwargs):
            identity = '\0'.join(str(account_value(key) or '') for key in
                                 ('CLIENT_ID', 'REFRESH_TOKEN', 'MERCHANT_ID', 'MARKETPLACE_ID'))
            key = (organization(), sha256(identity.encode()).digest(), repr(args), repr(sorted(kwargs.items())))
            with registry_lock:
                lock = locks.setdefault(key, Lock())
            with lock:
                entry = entries.get(key)
                if entry and monotonic() - entry[0] < seconds:
                    return deepcopy(entry[1])
                value = fn(*args, **kwargs)
                entries[key] = (monotonic(), deepcopy(value))
                return deepcopy(value)

        wrapped.cache_clear = entries.clear
        return wrapped
    return decorate
