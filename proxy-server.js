// Backend API Proxy Server
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Unicommerce API Configuration
const API_BASE_URL = 'https://shelfesteembrandlabsprivatelimited.unicommerce.com';
const EXPORT_ENDPOINT = '/data/tasks/export/data';

// Store cookies from successful auth - FRESH cookies from curl command
const AUTH_COOKIES = '_gcl_au=1.1.2010651924.1788237802; _clck=1i76sel%5E2%5Eg93%5E0%5E2435; _fbp=fb.1.1788237803064.556580827706978847; messagesUtk=596ae890af5549d18970575ce5be8e52; hubspotutk=37322a1a391c1842d5f4f613b95bc81e; __hssrc=1; IS_LOGIN=true; JSESSIONID=MTJmODU3ZDMtNjAxYS00ZWIxLTgxNjktM2EzMDU5ZjA5Njlj; __utmc=32092156; _ga=GA1.3.408948655.1788237802; _gid=GA1.2.1754573834.1788247272; _ga_P9KW1K4EYH=GS2.1.s1788247279$o3$g0$t1788247279$j60$l0$h1761193577; __hstc=130293328.37322a1a391c1842d5f4f613b95bc81e.1788237805375.1788240874368.1788247281970.3; _clsk=1voyqyj%5E1788247282008%5E1%5E1%5Eo.clarity.ms%2Fcollect; _ga=GA1.2.408948655.1788237802; _ga_DXGT08VXTW=GS2.2.s1788247273$o1$g1$t1788247298$j35$l0$h0; _ga_QDVX5EQBBS=GS2.3.s1788246734$o3$g0$t1788248058$j60$l0$h0; _ga_PNTTVDC8DK=GS2.1.s1788249011$o3$g0$t1788249659$j60$l0$h0; __utma=32092156.408948655.1788237802.1788244671.1788249661.3; __utmz=32092156.1788249661.3.3.utmcsr=auth2.unicommerce.com|utmccn=(referral)|utmcmd=referral|utmcct=/; __utmt=1; __utmb=32092156.1.10.1788249661';

// Proxy endpoint for inventory data
app.post('/api/inventory/export', async (req, res) => {
  try {
    const { columns, filters, sortColumns, start, noOfResults } = req.body;

    const payload = {
      columns: columns || [],
      fetchResultCount: false,
      disableLabelMany: 'false',
      noOfResults: noOfResults || 25,
      start: start || 0,
      name: 'DATATABLE SEARCH INVENTORY',
      filters: filters || [],
      sortColumns: sortColumns || [{ column: 'updated', descending: true }]
    };

    console.log('🔄 Proxying request to Unicommerce API...');
    console.log('📋 Columns:', columns);
    console.log('📋 Filters:', filters);
    console.log('📋 Payload being sent:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${API_BASE_URL}${EXPORT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9,hi;q=0.8',
        'content-type': 'application/json',
        'origin': 'https://shelfesteembrandlabsprivatelimited.unicommerce.com',
        'referer': 'https://shelfesteembrandlabsprivatelimited.unicommerce.com/ng/products/inventory',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'cookie': AUTH_COOKIES
      },
      body: JSON.stringify(payload)
    });

    console.log(`📊 API Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, errorText.substring(0, 200));
      return res.status(response.status).json({
        error: `API Error: ${response.status}`,
        message: errorText,
        success: false
      });
    }

    const data = await response.json();
    console.log(`✅ Successfully fetched ${data.data?.length || 0} records`);
    res.json(data);
  } catch (error) {
    console.error('❌ Proxy Error:', error.message);
    res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
      success: false
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Proxy server running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Inventory API Proxy running on http://localhost:${PORT}`);
  console.log(`✓ Endpoint: POST http://localhost:${PORT}/api/inventory/export`);
});
