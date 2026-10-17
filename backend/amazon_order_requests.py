"""Pace all seller order calls sharing the same credentials and operation."""
import hashlib
import json
import threading
import time

_states = {}
_lock = threading.Lock()
INTERVALS = {'get_orders': 60.0, 'get_order_items': 2.0}


def order_api_call(operation, fn, credentials, *args, **kwargs):
    identity = hashlib.sha256(json.dumps(credentials, sort_keys=True).encode()).hexdigest()
    key = (identity, operation)
    with _lock:
        state = _states.setdefault(key, {'lock': threading.Lock(), 'next': 0})
    with state['lock']:
        remaining = state['next'] - time.monotonic()
        while remaining > 0:
            time.sleep(min(60, remaining))
            remaining = state['next'] - time.monotonic()
        state['next'] = time.monotonic() + INTERVALS[operation]
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            if 'QuotaExceeded' in str(exc):
                state['next'] = max(state['next'], time.monotonic() + 60)
            raise
