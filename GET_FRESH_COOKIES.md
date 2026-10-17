# 🔐 Get Fresh Unicommerce Cookies (REQUIRED TO FIX API)

## ⚠️ Why It's Not Working

Your authentication cookies **expired**. The Unicommerce API returned:
```
DataIntegrityViolationException: could not extract ResultSet
```

This means the server couldn't process your request because your session is no longer valid.

## ✅ Step-by-Step: Get Fresh Cookies

### Step 1: Log In to Unicommerce
```
1. Open browser and go to: 
   https://shelfesteembrandlabsprivatelimited.unicommerce.com

2. Log in with your username and password

3. Navigate to: Products → Inventory (or just click Inventory in the left menu)
```

### Step 2: Open DevTools & Network Tab
```
1. Press F12 on your keyboard (or Ctrl+Shift+I)

2. Click on "Network" tab at the top

3. Make sure recording is enabled (there's usually a dot/circle button)
```

### Step 3: Trigger an API Request
```
1. In the Inventory page, click any of these to trigger a request:
   - Any filter button (Good inventory, Bad inventory, All)
   - Refresh button
   - Search box

2. You'll see requests appear in the Network tab
```

### Step 4: Find & Copy the Cookie Header
```
1. Look for a request to `/data/tasks/export/data` in the Network tab
   (scroll right to see full URLs if needed)

2. Click on that request

3. Go to the "Request Headers" section (or scroll down)

4. Find the header that starts with: Cookie: 

5. The value is a long string like:
   _gcl_au=1.1.2010651924.1788237802; _clck=1i76sel%5E2%5Eg93%5E0%5E2435; ...

6. Highlight the ENTIRE cookie string (from first character to the last one)
   (It might wrap to multiple lines - select all of it)

7. Copy it (Ctrl+C)
```

### Step 5: Update Your Project
```
1. Open this file in VS Code:
   proxy-server.js

2. Find this line (around line 26):
   const AUTH_COOKIES = '_gcl_au=1.1.2010651924...';

3. Delete everything between the quotes

4. Paste your fresh cookie string there

5. Make sure the line looks like:
   const AUTH_COOKIES = '[YOUR LONG COOKIE STRING HERE]';

6. Save the file (Ctrl+S)

7. The server will auto-reload
```

### Step 6: Re-Enable the API
```
1. Open this file in VS Code:
   src/pages/InventoryPage.jsx

2. Go to line 120 (around there)

3. Find this line:
   useApi = false;

4. Delete that entire line

5. Save the file

6. The app will auto-reload
```

### Step 7: Test It
```
1. Go to http://localhost:5173/

2. Click Inventory in the sidebar

3. You should see the API data loading without errors!

4. If you see "Good inventory / Bad inventory / All" buttons with real data,
   it worked! 🎉
```

## 🚨 Common Issues

**Issue: Still getting 500 errors**
- Make sure you copied the ENTIRE cookie string (it's usually very long)
- Check that the cookies don't have any extra spaces at the start/end
- Try getting fresh cookies again - maybe they expired while you were copying

**Issue: Page won't load**
- Did you delete the line `useApi = false;` completely?
- Check browser console (F12) for errors
- Try refreshing the page

**Issue: Mock data shows instead of real data**
- Check browser console errors
- Check terminal logs for the proxy server (port 3001)
- Make sure you're actually logged in to Unicommerce

## 📝 Important Notes

- 🍪 The `JSESSIONID` cookie is the most important one
- ✅ Copy the ENTIRE cookie string, not just one cookie
- ⏰ Cookies typically last for your session (several hours)
- 🔄 If they expire, repeat these steps to get fresh ones
- 📱 Don't share your cookie string - it's like a password!

## 🎯 What Should Happen After This

Once you update with fresh cookies:
- ✅ Inventory page loads with real Unicommerce data
- ✅ You can filter by Good/Bad/All inventory types  
- ✅ Pagination works with API data
- ✅ No 500 errors in console
- ✅ Mock data is replaced with live data

## Still Not Working?

If you've tried everything above and still getting errors:
1. Check that you're still logged into Unicommerce (the page should work)
2. Try logging out and logging back in to Unicommerce
3. Get fresh cookies again
4. Update the proxy-server.js with the new cookies
5. Refresh the app

The key is that your Unicommerce session must be active for the cookies to work!
