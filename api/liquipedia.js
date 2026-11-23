// Serverless Liquipedia Auto-Sync Endpoint for Upcoming & Ongoing Tournaments
// Cached at Vercel Edge (1h fresh, 24h stale-while-revalidate) to respect Liquipedia API limits.

const UA = "IndiaEWCENC27Hub/1.0 (https://igcewc.vercel.app)";

const SOURCES = [
  { wiki: "pubgmobile", page: "Portal:Tournaments", game: "BGMI / PUBG Mobile", bucket: "major" },
  { wiki: "freefire", page: "Portal:Tournaments", game: "Free Fire", bucket: "major" },
  { wiki: "valorant", page: "Portal:Tournaments", game: "Valorant", bucket: "major" }
];

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
};

function parseDateRange(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  // Match e.g. "Nov 26 - Dec 13, 2026" or "Nov 27 - 29, 2026" or "Dec 26, 2026 - Jan 10, 2027"
  const m1 = clean.match(/([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})?\s*[-–]\s*([A-Za-z]{3})?\s*(\d{1,2}),\s*(\d{4})/);
  if (!m1) return null;
  const [, mStart, dStart, yStartOpt, mEndOpt, dEnd, yEnd] = m1;
  const ms = MONTHS[mStart.toLowerCase()];
  const me = MONTHS[(mEndOpt || mStart).toLowerCase()];
  if (!ms || !me) return null;
  const ys = yStartOpt || yEnd;
  return {
    startDate: `${ys}-${ms}-${String(dStart).padStart(2, "0")}`,
    endDate: `${yEnd}-${me}-${String(dEnd).padStart(2, "0")}`
  };
}

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUpcomingRows(html, wiki, defaultGame) {
  const results = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const rowRegex = /<div class="gridRow"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="gridRow"|<\/div>)/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null && results.length < 15) {
    const rowHtml = match[1];
    const linkMatch = rowHtml.match(/<a[^>]+href="(\/[^"]+)"[^>]*>([^<]+)<\/a>/);
    const dateMatch = rowHtml.match(/class="[^"]*Date[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!linkMatch || !dateMatch) continue;
    const dates = parseDateRange(stripTags(dateMatch[1]));
    if (!dates || dates.endDate < todayIso) continue;

    const prizeMatch = rowHtml.match(/class="[^"]*Prize[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const locMatch = rowHtml.match(/class="[^"]*Location[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const title = stripTags(linkMatch[2]);
    if (!title || title.length < 4) continue;

    results.push({
      title,
      game: defaultGame,
      startDate: dates.startDate,
      endDate: dates.endDate,
      prize: prizeMatch ? stripTags(prizeMatch[1]) || "TBA" : "TBA",
      location: locMatch ? stripTags(locMatch[1]) || "Global" : "Global",
      liquipediaUrl: `https://liquipedia.net/${wiki}${linkMatch[1].replace(new RegExp(`^/${wiki}`), "")}`
    });
  }
  return results;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const major = [];
  const errors = [];

  await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const url = `https://liquipedia.net/${src.wiki}/api.php?action=parse&page=${encodeURIComponent(src.page)}&prop=text&format=json`;
        const resp = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: AbortSignal.timeout(5000)
        });
        if (!resp.ok) {
          errors.push(`${src.wiki}: HTTP ${resp.status}`);
          return;
        }
        const json = await resp.json();
        const html = json?.parse?.text?.["*"] || "";
        const rows = extractUpcomingRows(html, src.wiki, src.game);
        major.push(...rows);
      } catch (err) {
        errors.push(`${src.wiki}: ${err.message}`);
      }
    })
  );

  return res.status(200).json({
    ok: true,
    updatedAt: new Date().toISOString(),
    major,
    errors
  });
};
