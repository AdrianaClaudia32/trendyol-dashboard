const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

const VARIANTS = [
  (base, id) => `${base}/integration/order/sellers/${id}/orders`,
  (base, id) => `${base}/sapigw/suppliers/${id}/orders`,
  (base, id) => `${base}/suppliers/${id}/orders`,
];

app.get('/api/orders', async (req, res) => {
  const { baseUrl, supplierId, startDate, endDate, page = 0, size = 200 } = req.query;
  const auth  = req.headers['x-trendyol-auth'];
  const agent = req.headers['x-trendyol-agent'] || `${supplierId} - SelfIntegration`;

  if (!supplierId || !auth || !baseUrl) {
    return res.status(400).json({ error: 'Lipsesc parametri: supplierId, baseUrl sau credentiale.' });
  }

  const headers = {
    'Authorization': auth,
    'Content-Type':  'application/json',
    'User-Agent':    agent,
  };

  const errors = [];

  for (const variant of VARIANTS) {
    const url = `${variant(baseUrl, supplierId)}?startDate=${startDate}&endDate=${endDate}&page=${page}&size=${size}`;
    try {
      const response = await fetch(url, { headers });
      const text = await response.text();
      if (response.ok) {
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        data._usedEndpoint = variant(baseUrl, supplierId);
        return res.json(data);
      } else {
        errors.push(variant(baseUrl, supplierId).replace(baseUrl, '') + ': HTTP ' + response.status + ': ' + text.slice(0, 200));
      }
    } catch (e) {
      errors.push(variant(baseUrl, supplierId).replace(baseUrl, '') + ': ' + e.message);
    }
  }

  res.status(502).json({ error: 'Niciun endpoint nu a functionat.', details: errors });
});

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Trendyol Dashboard pornit pe portul ' + PORT));
