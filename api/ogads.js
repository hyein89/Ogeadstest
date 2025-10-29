import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const OGADS_KEY = process.env.OGADS_API_KEY;
  if (!OGADS_KEY) {
    return res.status(500).json({ success: false, error: "API key not set" });
  }

  const ENDPOINT = 'https://redirectapps.org/api/v2';

  // Ambil IP visitor
  let ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const country = req.query.country || '';

  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    if (country === 'US') ip = '8.8.8.8';
    else if (country === 'PH') ip = '203.177.39.0';
    else if (country === 'SG') ip = '43.250.0.0';
    else ip = '103.27.7.0'; // default Asia
  }

  const user_agent = req.headers['user-agent'] || 'Mozilla/5.0';

  const params = new URLSearchParams({ ip, user_agent });
  if (country && country !== 'ALL') {
    params.append('country', country);
  }

  const url = `${ENDPOINT}?${params.toString()}`;

  try {
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${OGADS_KEY}`,
        'Accept': 'application/json'
      }
    });
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (err) {
    res.status(502).json({ success: false, error: 'Upstream request failed', detail: err.message });
  }
}
