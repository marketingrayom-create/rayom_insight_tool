# Amazon Vendor Central Automation (separate Python service)

This service is separate from the existing Uniware Python script.

## Install

```bash
pip install -r requirements.txt
```

## Run

```bash
python amazon_vendor_automation.py
```

The Flask service listens on:

`http://127.0.0.1:5003`

Chrome does NOT open when the Python file starts.

Chrome opens only when React calls one of these endpoints:

- `POST /api/amazon/manage-pos` (opens one authenticated browser session)
- `POST /api/amazon/search-po` (uses the existing session)
- `POST /api/amazon/vendor-configurations` (uses the existing session)
- `POST /api/amazon/sales`
- `POST /api/amazon/inventory`

The first time Amazon asks for login, OTP, passkey, or CAPTCHA, complete that step manually.
A persistent Chrome profile is stored in `amazon_chrome_profile`, allowing the session to be reused.

## React calls

```js
fetch("/amazon-api/manage-pos", {
  method: "POST",
});
```

For Sales:

```js
fetch("/amazon-api/sales", {
  method: "POST",
});
```

For Inventory:

```js
fetch("/amazon-api/inventory", {
  method: "POST",
});
```

Security challenges are not bypassed.
