"""Read-only Flipkart integration for the Rayom seller account."""

import os
import time
from threading import Lock

import requests
from dotenv import load_dotenv
from flask import Blueprint, jsonify, request

BASE = os.path.dirname(os.path.abspath(__file__))

# Load backend/.env first, then project-root/.env if applicable.
load_dotenv(os.path.join(BASE, ".env"))
load_dotenv(os.path.join(os.path.dirname(BASE), ".env"))

flipkart = Blueprint("flipkart", __name__)

_token = None
_expires = 0
_lock = Lock()


def credentials():
    """
    Load Flipkart Self Access application credentials.

    IMPORTANT:
    - FLIPKART_APP_ID = Developer Access Application ID / API Key
    - FLIPKART_APP_SECRET = Secret belonging to the same application
    - FLIPKART_MERCHANT_ID is NOT used for OAuth authentication.
      It is optional and is only used later to validate sellerId.
    """
    app_id = (os.getenv("FLIPKART_APP_ID") or "").strip()
    secret = (os.getenv("FLIPKART_APP_SECRET") or "").strip()
    merchant = (os.getenv("FLIPKART_MERCHANT_ID") or "").strip()

    if not app_id or not secret:
        raise ValueError(
            "Configure FLIPKART_APP_ID and FLIPKART_APP_SECRET in backend .env"
        )

    return app_id, secret, merchant


def access_token():
    """Get and cache a Flipkart Seller API access token."""
    global _token, _expires

    with _lock:
        if _token and time.time() < _expires:
            return _token

        app_id, secret, _merchant = credentials()

        response = requests.get(
            "https://api.flipkart.net/oauth-service/oauth/token",
            auth=(app_id, secret),
            params={
                "grant_type": "client_credentials",
                "scope": "Seller_Api",
            },
            timeout=30,
        )

        if not response.ok:
            try:
                error_data = response.json()
                error_code = error_data.get("error")
            except (ValueError, AttributeError):
                error_code = None

            if error_code == "invalid_scope":
                raise RuntimeError(
                    "Flipkart rejected Seller_Api scope. "
                    "Verify Seller API access for the Rayom Self Access application."
                )

            if error_code in ("unauthorized_client", "unsupported_grant_type"):
                raise RuntimeError(
                    "Flipkart does not allow client_credentials for this application. "
                    "Verify that the Rayom application is Self Access."
                )

            if response.status_code == 401 or error_code == "invalid_client":
                raise RuntimeError(
                    "Flipkart rejected FLIPKART_APP_ID / FLIPKART_APP_SECRET "
                    f"(HTTP {response.status_code}). "
                    "Verify that both values belong to the same Self Access "
                    "application in Rayom Seller Dashboard. "
                    "Merchant ID is not used for token authentication."
                )

            if response.status_code == 403:
                raise RuntimeError(
                    "Flipkart denied access (HTTP 403). "
                    "Check the Self Access application status and Seller API access "
                    "in Rayom Seller Dashboard."
                )

            raise RuntimeError(
                f"Flipkart authentication failed (HTTP {response.status_code}). "
                "Check the Rayom Seller API application credentials and access."
            )

        try:
            data = response.json()
        except ValueError:
            raise RuntimeError("Flipkart returned an invalid token response.")

        if not data.get("access_token"):
            raise RuntimeError("Flipkart did not return an access token.")

        _token = data["access_token"]

        # Refresh one minute before the reported expiry.
        try:
            expires_in = int(data.get("expires_in", 300))
        except (TypeError, ValueError):
            expires_in = 300

        _expires = time.time() + max(0, expires_in - 60)

        return _token


def api_post(path, body):
    """POST to a Flipkart Seller API endpoint with one token retry."""
    global _token, _expires

    for attempt in range(2):
        response = requests.post(
            "https://api.flipkart.net/sellers" + path,
            headers={
                "Authorization": "Bearer " + access_token(),
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=body,
            timeout=45,
        )

        if response.status_code == 401 and attempt == 0:
            with _lock:
                _token = None
                _expires = 0
            continue

        if not response.ok:
            raise RuntimeError(
                f"Flipkart listings request failed (HTTP {response.status_code}). "
                "Verify Rayom Seller API permissions and endpoint."
            )

        try:
            return response.json()
        except ValueError:
            raise RuntimeError("Flipkart returned an invalid API response.")


@flipkart.get("/api/flipkart/status")
def status():
    try:
        app_id, secret, merchant = credentials()

        return jsonify(
            success=True,
            configured=True,
            company="Rayom",
            marketplace="Flipkart",
            merchantConfigured=bool(merchant),
        )

    except ValueError as error:
        return jsonify(
            success=False,
            configured=False,
            error=str(error),
        ), 503


@flipkart.post("/api/flipkart/products")
def products():
    try:
        _, _, merchant = credentials()

        body = request.get_json(silent=True) or {}

        batch = int(body.get("batchNo", 0))
        state = body.get("internalState", "ACTIVE")

        allowed_states = (
            "ACTIVE",
            "INACTIVE",
            "READY_FOR_ACTIVATION",
            "ARCHIVED",
            "INACTIVATED_BY_FLIPKART",
        )

        if batch < 0 or state not in allowed_states:
            raise ValueError("Invalid batchNo or internalState")

        data = api_post(
            "/listings/v3/product/search",
            {
                "batchNo": batch,
                "internalState": state,
                "searchText": str(body.get("searchText", "")),
            },
        )

        rows = data.get("listingData")

        if not isinstance(rows, list):
            raise RuntimeError(
                "Unexpected Flipkart listing response: listingData is missing."
            )

        result = []

        for row in rows:
            seller_id = str(row.get("sellerId", ""))

            # Merchant/Seller ID is only a validation step.
            # If FLIPKART_MERCHANT_ID is not configured, don't reject the response.
            if merchant and seller_id and seller_id != str(merchant):
                raise RuntimeError(
                    "Flipkart seller ID does not match "
                    "FLIPKART_MERCHANT_ID. Verify the Rayom seller account configuration."
                )

            description = row.get("product_description") or {}

            result.append(
                {
                    "company": "Rayom",
                    "marketplace": "Flipkart",
                    "listingId": row.get("listingId"),
                    "productId": row.get("productId"),
                    "sku": row.get("sku"),
                    "sellerId": row.get("sellerId"),
                    "title": row.get("product_name"),
                    "status": row.get("status"),
                    "price": description.get("ssp"),
                    "mrp": description.get("mrp"),
                }
            )

        return jsonify(
            success=True,
            company="Rayom",
            marketplace="Flipkart",
            data=result,
            total=int(data.get("totalListingsCount", 0)),
            batchNo=batch,
        )

    except (ValueError, TypeError):
        return jsonify(
            success=False,
            error="Check Flipkart environment configuration and request filters.",
        ), 400

    except requests.RequestException:
        return jsonify(
            success=False,
            error="Unable to reach Flipkart. Please retry.",
        ), 502

    except RuntimeError as error:
        return jsonify(
            success=False,
            error=str(error),
        ), 502
