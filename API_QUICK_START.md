# 🚀 API Integration - Quick Start Guide

## ✅ Servers Running
```
✓ Proxy Server:  http://localhost:3001/api/inventory/export
✓ Dev Server:    http://localhost:5173
```

## 🔍 How to Test the API

### Step 1: Open Browser Console
1. Go to **http://localhost:5173/**
2. Press **F12** (or **Ctrl+Shift+I**) to open Developer Tools
3. Click on the **Console** tab

### Step 2: Run Debug Commands

**Test the API:**
```javascript
window.debugInventoryAPI.testApi()
```

**Test Proxy Server:**
```javascript
window.debugInventoryAPI.testProxy()
```

**View Help:**
```javascript
window.debugInventoryAPI.help()
```

## 📊 What to Expect

**If successful, you'll see:**
```
✓ Successfully fetched data from: http://localhost:3001/api/inventory/export
✓ API Test Successful!
Total Results: 123
Data: [...]
```

**If it fails, you'll see:**
```
❌ API Error: Failed to fetch from all endpoints
```

## 🛠️ How It Works

1. **Your React App** (http://localhost:5173)
   - Makes API request to the proxy server
   - No CORS issues since proxy is on same origin

2. **Proxy Server** (http://localhost:3001)
   - Receives request from React app
   - Forwards it to Unicommerce API
   - Returns data back to React app

3. **Unicommerce API** (shelfesteembrandlabsprivatelimited.unicommerce.com)
   - The actual API that stores your inventory data
   - Proxy handles CORS and authentication

## ⚙️ Troubleshooting

### If you see "Proxy Server Error"
**Problem:** Proxy not running
**Solution:** Make sure you ran:
```bash
npm run dev:with-proxy
```

### If you see "API Error: 401/403"
**Problem:** Authentication failed
**Solution:** 
- Check if cookies are stored
- May need to login to Unicommerce first
- Run in an authenticated browser session

### If you see "timeout" error
**Problem:** API is taking too long
**Solution:**
- The Unicommerce server might be slow
- Try again after a few seconds
- Check network in browser DevTools

## 🎯 Next Steps

1. **Test the API:**
   - Run the test command above
   - Check browser console for logs

2. **Go to Inventory Page:**
   - Click "Inventory" in the sidebar
   - You should see data loading from the API

3. **Filter by Type:**
   - Click "Good" / "Bad" / "All" tabs
   - API should fetch filtered data

4. **Check Network Tab:**
   - Open DevTools > Network
   - Look for requests to `localhost:3001`
   - These are your API calls

## 📝 Terminal Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Run dev server only (mock data) |
| `npm run dev:with-proxy` | Run dev + proxy (real API) |
| `npm run proxy` | Run proxy server only |
| `npm install` | Install dependencies |

## 🔗 Endpoints

**API Proxy:**
```
POST http://localhost:3001/api/inventory/export
```

**Health Check:**
```
GET http://localhost:3001/health
```

## 🎓 Debugging Tips

**View all console logs:**
```javascript
// Check browser DevTools Console tab
```

**Test with different columns:**
```javascript
window.debugInventoryAPI.testWithColumns(['productCode', 'itemType', 'totalQuantity'])
```

**Get available columns:**
```javascript
window.debugInventoryAPI.getColumns()
```

## ✨ Expected Behavior

- ✅ Mock data shows initially (from state)
- ✅ API request starts automatically
- ✅ Data replaces mock data when API responds
- ✅ Loading state shows while fetching
- ✅ Error message shows if API fails
- ✅ Falls back to mock data on error

Enjoy your integrated API! 🎉
