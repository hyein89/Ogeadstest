import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS supaya bisa dipanggil dari Blogger
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const OGADS_KEY = process.env.OGADS_API_KEY;
  if (!OGADS_KEY) {
    return res.status(500).json({ success: false, error: "API key not set" });
  }

  const ENDPOINT = 'https://redirectapps.org/api/v2';

  // Ambil IP visitor
  let ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (!ip || ip === '127.0.0.1' || ip === '::1') ip = '8.8.8.8';

  const user_agent = req.headers['user-agent'] || 'Mozilla/5.0';

  const params = new URLSearchParams({ ip, user_agent });
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
