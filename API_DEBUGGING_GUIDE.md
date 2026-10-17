# API Debugging Guide

## How to Debug the Inventory API Issue

### Step 1: Open Browser Console
1. Open your app at `http://localhost:5173/`
2. Press **F12** or **Ctrl+Shift+I** to open Developer Tools
3. Go to **Console** tab

### Step 2: Test the API
In the console, type and run:
```javascript
window.debugInventoryAPI.testApi()
```

This will make a test API call and log the response.

### What to Look For:

**If you see CORS error:**
```
Access to XMLHttpRequest at 'https://shelfesteembrandlabsprivatelimited.unicommerce.com/...' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**If you see network error:**
```
Failed to fetch inventory data: Failed to fetch
```

**If successful:**
```
✓ API Test Result: { data: [...], totalResults: 123 }
```

### Step 3: Check Network Tab
1. Go to **Network** tab in DevTools
2. Go to Inventory page
3. Look for requests to `shelfesteembrandlabsprivatelimited.unicommerce.com`
4. Click on the failed request and check:
   - **Status Code** (4xx or 5xx means error)
   - **Response** (error message)
   - **Headers** (check cookies and auth)

### Common Issues & Solutions:

#### Issue 1: CORS Policy Error
**Cause:** Browser blocks cross-origin requests for security
**Solution:** 
- Use a CORS proxy or backend proxy
- API owner must enable CORS headers

#### Issue 2: 401/403 Authentication Error
**Cause:** Cookie-based auth not working from browser
**Solution:**
- Include authentication headers explicitly
- May need to login via the API first

#### Issue 3: Mock Data Still Shows
**This means:**
- API request is failing silently
- Component falls back to mock data
- Check console for errors

### Step 4: View Console Logs
Look for messages like:
```
InventoryPage: Fetching API data with useApi=true
API Response Status: 200
API Data received: { data: [...] }
```

Or error logs if something went wrong.

### Step 5: Check Cookies
In Console, run:
```javascript
console.log(document.cookie)
```

This shows if authentication cookies are present.

## If API Still Doesn't Work:

The issue is likely **CORS** or **authentication**. You have 3 options:

1. **Backend Proxy**: Create a Node.js proxy endpoint that forwards requests
2. **CORS Extension**: Install a CORS extension (only for development)
3. **API Update**: Ask API owner to enable CORS for localhost

Would you like me to help implement any of these solutions?
