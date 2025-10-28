// api/ogads.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const OGADS_KEY = process.env.OGADS_API_KEY;
  const ENDPOINT = 'https://redirectapps.org/api/v2';

  // ambil IP visitor
  let ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (!ip || ip === '127.0.0.1' || ip === '::1') ip = '8.8.8.8'; // IP contoh kalau localhost

  const user_agent = req.headers['user-agent'] || 'Mozilla/5.0';

  // optional query params (country, type, ctype, traffic)
  const allowed = ['country','type','max','ctype','traffic'];
  const params = new URLSearchParams({ ip, user_agent });
  allowed.forEach(k => {
    if (req.query[k]) params.append(k, req.query[k]);
  });

  const url = `${ENDPOINT}?${params.toString()}`;

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${OGADS_KEY}`, Accept: 'application/json' },
      timeout: 10000
    });
    const json = await r.json();
    res.setHeader('Content-Type', 'application/json');
    res.status(r.status).send(JSON.stringify(json));
  } catch (err) {
    res.status(502).json({ success: false, error: 'Upstream request failed', detail: err.message });
  }
}
