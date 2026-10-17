"""Safe Flipkart OAuth credential test.

This prints only whether credentials are loaded and their lengths.
It never prints the App Secret or access token.
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

app_id = os.getenv("FLIPKART_APP_ID", "").strip()
app_secret = os.getenv("FLIPKART_APP_SECRET_ID", "").strip()

print("App ID loaded:", bool(app_id))
print("App Secret loaded:", bool(app_secret))
print("App ID length:", len(app_id))
print("App Secret length:", len(app_secret))

if not app_id or not app_secret:
    raise SystemExit(
        "\nMissing FLIPKART_APP_ID or FLIPKART_APP_SECRET in .env"
    )

url = "https://api.flipkart.net/oauth-service/oauth/token"

params = {
    "grant_type": "client_credentials",
    "scope": "Seller_Api",
}

try:
    response = requests.get(
        url,
        params=params,
        auth=(app_id, app_secret),
        timeout=30,
    )

    print("HTTP Status:", response.status_code)

    try:
        data = response.json()

        # Never print access_token.
        safe = {
            key: value
            for key, value in data.items()
            if key not in ("access_token", "refresh_token")
        }

        print("Response:", safe)

    except ValueError:
        print("Response: Non-JSON response received.")

except requests.RequestException as error:
    print("Request failed:", str(error))
