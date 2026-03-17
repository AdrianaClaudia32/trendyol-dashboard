const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

const VARIANTS = [
  (base, id) => base + '/integration/order/sellers/' + id + '/orders',
  (base, id) => base + '/integration/oms/core/sellers/' + id + '/orders',
  (base, id) => base + '/sapigw/suppliers/' + id + '/orders',
  (base, id) => base + '/sapigw/sellers/' + id + '/orders',
  (base, id) => base + '/suppliers/' + id + '/orders',
  (base, id) => base + '/integration/order/sellers/' + id + '/shipment-packages',
  (base, id) => base + '/sapigw/suppliers/' + id + '/shipment-packages',
];

// Debug endpoint - echoes what the server receives
app.get('/api/debug', (req, res) => {
  const agent = req.headers['x-trendyol-agent'] || 'NOT SET';
  const auth = req.headers['x-trendyol-auth'] || 'NOT SET';
  res.json({
    receivedAgent: agent,
    receivedAuth: auth ? auth.slice(0, 20) + '...' : 'missing',
    allHeaders: Object.keys(req.headers)
  });
});

app.get('/api/orders', async (req, res) => {
  const { baseUrl, supplierId, startDate, endDate, page = 0, size = 200 } = req.query;
  const auth = req.headers['x-trendyol-auth'];
  const agent = req.headers['x-trendyol-agent'] || (supplierId + ' - SelfIntegration');
  if (!supplierId || !auth || !baseUrl) {
    return res.status(400).json({ error: 'Lipsesc parametri.' });
  }
  const headers = {
    'Authorization': auth,
    'Content-Type': 'application/json',
    'User-Agent': agent,
  };
  const allResults = [];
  for (const variant of VARIANTS) {
    const endpoint = variant(baseUrl, supplierId);
    const urlVariants = [
      endpoint + '?startDate=' + startDate + '&endDate=' + endDate + '&page=' + page + '&size=' + size + '&orderByField=PackageLastModifiedDate&orderByDirection=DESC',
      endpoint + '?startDate=' + startDate + '&endDate=' + endDate + '&page=' + page + '&size=' + size,
    ];
    for (const url of urlVariants) {
      try {
        const response = await fetch(url, { headers });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        const totalEl = data.page?.totalElements ?? data.totalElements ?? data.total ?? data.totalCount ?? '?';
        allResults.push({
          endpoint: endpoint.replace(baseUrl, ''),
          withOrderBy: url.includes('orderByField'),
          status: response.status,
          totalElements: totalEl,
          keys: data && typeof data === 'object' ? Object.keys(data) : [],
          agentUsed: agent
        });
        if (response.ok) {
          const content = data.content ?? data.orders ?? data.shipmentPackages ?? data.orderPackages ?? data.data ?? (Array.isArray(data) ? data : null) ?? [];
          const count = Array.isArray(content) ? content.length : 0;
          if (count > 0 || (totalEl !== '?' && parseInt(totalEl) > 0)) {
            data._usedEndpoint = endpoint;
            data._diagnostics = allResults;
            return res.json(data);
          }
        }
      } catch (e) {
        allResults.push({ endpoint: endpoint.replace(baseUrl, ''), error: e.message });
      }
    }
  }
  res.json({ totalElements: 0, totalPages: 0, content: [], _usedEndpoint: 'none', _diagnostics: allResults });
});

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Trendyol Dashboard pornit pe portul ' + PORT));
