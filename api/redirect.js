// /api/redirect.js
// Serverless handler for Vercel — smart redirect to OGads offers
// Features:
// - Uses OGADS_API_KEY from env
// - Auto-detect country from x-vercel-ip-country (Vercel header)
// - Bot UA filter
// - Optional VPN/proxy check via ipapi.co (gracefully fails if service unavailable)
// - Query params: aff_sub4, aff_sub5, debug=true
// - Uses redirectapps.org/api/v2 endpoint (pass ip & user_agent, optionally country)

export default async function handler(req, res) {
  const apiKey = process.env.OGADS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not set" });

  // Allow CORS so debug can be called from browser (optional)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    // 1) Get IP (first item if x-forwarded-for contains a list)
    const rawXff = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
    const ip = (rawXff || '8.8.8.8').split(',')[0].trim(); // fallback to public IP for testing

    // 2) Country detection — prefer Vercel header, else we'll try ipapi
    let country = (req.headers['x-vercel-ip-country'] || '').toUpperCase();
    // if header missing, we'll attempt to detect later via ipapi (but non-blocking)
    const wantsDebug = String(req.query.debug || '').toLowerCase() === 'true';

    // 3) Query params
    const { aff_sub4 = '', aff_sub5 = '' } = req.query;

    // 4) Basic bot/user-agent filtering
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const botPatterns = [
      'bot','crawler','spider','facebookexternalhit','facebot','curl','wget',
      'python','postman','monitor','uptime','check','preview','googlebot','bingbot'
    ];
    if (botPatterns.some(b => userAgent.includes(b))) {
      return res.status(403).json({ blocked: true, reason: 'Bot traffic detected' });
    }

    // 5) Optional VPN/proxy check (non-fatal if ipapi fails)
    let vpnDetected = false;
    try {
      // Only call if ip is not obviously private
      const privateIpPattern = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])|127\.)/;
      if (!privateIpPattern.test(ip)) {
        const chk = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
        if (chk.ok) {
          const chkJson = await chk.json();
          // ipapi returns fields like 'proxy' or 'threat' depending on provider — we check common booleans
          // Some ipapi instances may not return 'proxy'/'vpn' — so guard with optional chaining
          if (chkJson.proxy === true || chkJson.vpn === true || chkJson.hosting === true) {
            vpnDetected = true;
          }
          // If country header missing, use ipapi country as fallback
          if (!country && chkJson.country) country = String(chkJson.country).toUpperCase();
        }
      }
    } catch (e) {
      // ip lookup failed — don't block everything; just log and continue
      console.warn('ipapi check failed:', e?.message || e);
    }

    if (vpnDetected) {
      return res.status(403).json({ blocked: true, reason: 'VPN/Proxy detected' });
    }

    // 6) Build OGAds endpoint call (redirectapps.org API v2)
    const ENDPOINT = 'https://redirectapps.org/api/v2';
    const params = new URLSearchParams({ ip, user_agent: userAgent });
    // add country filter if we have it
    if (country && country !== 'ALL') params.append('country', country);

    const ogadsUrl = `${ENDPOINT}?${params.toString()}`;

    // 7) Call OGAds API
    const ogRes = await fetch(ogadsUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      // don't timeout here (Vercel will handle), but keep lightweight
    });

    // handle upstream non-JSON or network errors
    if (!ogRes.ok) {
      const text = await ogRes.text().catch(() => null);
      return res.status(502).json({ error: 'Failed to retrieve data from OGAds', status: ogRes.status, body: text });
    }

    const ogJson = await ogRes.json();

    // OGAds v2 expected: { success: true, offers: [...] }
    if (!ogJson || !ogJson.success || !Array.isArray(ogJson.offers)) {
      return res.status(502).json({ error: 'Failed to retrieve data', details: ogJson });
    }

    // 8) Filter offers that include the country (if country present)
    const offers = ogJson.offers.filter(o => {
      // some offers may have country as CSV string (e.g. "ID,PH,US")
      if (!o.country) return false;
      const list = String(o.country).split(',').map(s => s.trim().toUpperCase());
      if (!country || country === 'ALL') return true;
      return list.includes(country);
    });

    if (offers.length === 0) {
      return res.status(404).json({ error: `No active offers for country ${country || 'unknown'}` });
    }

    // 9) Pick random offer
    const randomOffer = offers[Math.floor(Math.random() * offers.length)];

    // 10) Build final link and append aff_sub4 & aff_sub5 safely
    // randomOffer.link usually already contains query params — use URL to append safely
    let finalLink;
    try {
      const u = new URL(randomOffer.link);
      if (aff_sub4) u.searchParams.set('aff_sub4', aff_sub4);
      if (aff_sub5) u.searchParams.set('aff_sub5', aff_sub5);
      finalLink = u.toString();
    } catch (e) {
      // fallback if randomOffer.link is not a valid absolute URL
      const sep = randomOffer.link.includes('?') ? '&' : '?';
      finalLink = `${randomOffer.link}${sep}aff_sub4=${encodeURIComponent(aff_sub4)}&aff_sub5=${encodeURIComponent(aff_sub5)}`;
    }

    // 11) Debug mode: return useful info instead of redirecting
    if (wantsDebug) {
      return res.status(200).json({
        ok: true,
        ip,
        country: country || null,
        offer_count: offers.length,
        selected_offer: {
          offerid: randomOffer.offerid ?? randomOffer.offer_id ?? randomOffer.id ?? null,
          name: randomOffer.name ?? randomOffer.name_short ?? null,
        },
        link: finalLink,
        user_agent: userAgent
      });
    }

    // 12) Finally redirect to finalLink
    return res.redirect(302, finalLink);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'A server error occurred', details: String(err?.message || err) });
  }
}
