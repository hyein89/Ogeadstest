export default async function handler(req, res) {
  const apiKey = process.env.OGADS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not set" });

  try {
    // 1️⃣ Deteksi IP & negara otomatis
    const ip =
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "0.0.0.0";

    const ipCountry = req.headers["x-vercel-ip-country"] || "US";
    const country = ipCountry.toUpperCase();

    // 2️⃣ Ambil parameter tambahan
    const { aff_sub4 = "", aff_sub5 = "", debug = "false" } = req.query;

    // 3️⃣ Filter bot berdasarkan User-Agent
    const userAgent = req.headers["user-agent"]?.toLowerCase() || "";
    const botPatterns = [
      "bot", "crawler", "spider", "facebook", "curl", "wget",
      "python", "postman", "monitor", "uptime", "check", "preview"
    ];
    if (botPatterns.some(b => userAgent.includes(b))) {
      return res.status(403).json({ blocked: true, reason: "Bot traffic detected" });
    }

    // 4️⃣ Cek VPN / Proxy (pakai layanan gratis ipapi.co)
    const vpnCheck = await fetch(`https://ipapi.co/${ip}/json/`);
    const vpnData = await vpnCheck.json();

    if (vpnData?.proxy || vpnData?.vpn) {
      return res.status(403).json({ blocked: true, reason: "VPN/Proxy detected" });
    }

    // 5️⃣ Ambil data dari OGAds API
    const response = await fetch("https://api.ogads.com/v3/offers", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    const data = await response.json();
    if (!data.success || !data.offers) {
      return res.status(500).json({ error: "Failed to retrieve data", details: data });
    }

    // 6️⃣ Filter offer berdasarkan negara
    const offers = data.offers.filter(
      (offer) => offer.country && offer.country.includes(country)
    );

    if (offers.length === 0) {
      return res.status(404).json({ error: `There are no active offers for the country ${country}` });
    }

    // 7️⃣ Pilih offer acak
    const randomOffer = offers[Math.floor(Math.random() * offers.length)];

    // 8️⃣ Tambahkan sub tracking
    const finalLink = `${randomOffer.link}&aff_sub4=${encodeURIComponent(aff_sub4)}&aff_sub5=${encodeURIComponent(aff_sub5)}`;

    // 9️⃣ Mode debug (lihat hasil tanpa redirect)
    if (debug === "true") {
      return res.status(200).json({
        ip,
        country,
        offer_count: offers.length,
        selected_offer: randomOffer.name,
        link: finalLink,
        user_agent: userAgent,
      });
    }

    // 🔟 Redirect ke offer
    return res.redirect(302, finalLink);

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "A server error occurred", details: err.message });
  }
}
