// Add this to window for debugging in browser console
import { fetchInventoryData, BASIC_COLUMNS } from '../api/inventoryApi';

export function setupDebugTools() {
  window.debugInventoryAPI = {
    testApi: async () => {
      console.log('🔍 Testing Inventory API...');
      try {
        const result = await fetchInventoryData(BASIC_COLUMNS, [], [{ column: 'updated', descending: true }], 0, 10);
        if (result.error) {
          console.error('❌ API Error:', result.error);
        } else {
          console.log('✓ API Test Successful!');
          console.log('Total Results:', result.totalResults);
          console.log('Data:', result.data);
        }
        return result;
      } catch (error) {
        console.error('❌ API Test Failed:', error);
        return null;
      }
    },
    
    getColumns: () => {
      console.log('📋 Available columns:');
      console.table(BASIC_COLUMNS);
      return BASIC_COLUMNS;
    },
    
    testWithColumns: async (columns) => {
      console.log('🔍 Testing with custom columns:', columns);
      try {
        const result = await fetchInventoryData(columns, [], [{ column: 'updated', descending: true }], 0, 10);
        if (result.error) {
          console.error('❌ Error:', result.error);
        } else {
          console.log('✓ Success!');
          console.log('Data:', result.data);
        }
        return result;
      } catch (error) {
        console.error('❌ Failed:', error);
        return null;
      }
    },
    
    testProxy: async () => {
      console.log('🔌 Testing Proxy Server...');
      try {
        const response = await fetch('http://localhost:3001/health');
        const data = await response.json();
        console.log('✓ Proxy Server Status:', data);
        return data;
      } catch (error) {
        console.error('❌ Proxy Server Error:', error.message);
        console.log('💡 Make sure to run: npm run dev:with-proxy');
        return null;
      }
    },
    
    help: () => {
      console.log(`
🎯 Inventory API Debug Tools
=============================

1. Test API:
   window.debugInventoryAPI.testApi()

2. Test Proxy Server:
   window.debugInventoryAPI.testProxy()

3. Get Available Columns:
   window.debugInventoryAPI.getColumns()

4. Test Custom Columns:
   window.debugInventoryAPI.testWithColumns(['productCode', 'itemType'])

📖 Setup Instructions:
- Run: npm install
- Run: npm run dev:with-proxy
- This starts both the dev server AND proxy server
      `);
    }
  };
  
  console.log('✓ Debug tools ready! Run window.debugInventoryAPI.help() for usage');
}
