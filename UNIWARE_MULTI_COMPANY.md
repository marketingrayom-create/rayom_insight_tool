# Uniware Multi-Company Inventory

This version keeps the logged-in Uniware Chrome session open after the manual OTP login. The React Inventory page has a Company dropdown. When a company is selected, Python navigates the same authenticated browser session to that company's Uniware tenant and reuses the session cookies for inventory API calls.

## Add your companies

Edit:

`backend/uniware_inventory_api_server.py`

Find `COMPANIES` and add the other companies from the same Uniware account:

```python
COMPANIES = {
    "shelfesteem": {
        "name": "Shelfesteem",
        "tenant": "shelfesteembrandlabsprivatelimited",
    },
    "company2": {
        "name": "Company 2",
        "tenant": "company2tenant",
    },
}
```

`tenant` is the part before `.unicommerce.com`.

## Important behavior

- OTP/login happens once at application startup.
- The authentication Chrome window stays open intentionally.
- Selecting another company does not intentionally start another OTP flow.
- If Uniware accepts the existing account session for that company, the inventory loads immediately.
- If Uniware redirects that company to login/SSO, the backend reports that the company requires a separate authenticated session. This cannot be safely assumed away without seeing Uniware's actual company-switch behavior.

## Run

```powershell
npm install
npm run dev
```

Enter OTP once in the opened Chrome window. Then use the Company dropdown on Inventory.
