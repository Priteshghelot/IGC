const { getRedis } = require('./_redis');
const { REQ_KEY, readJSON } = require('./_ops');

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  const id = String(req.query?.id || '').trim();
  const isImg = String(req.query?.img || '') === '1';
  const baseUrl = 'https://igcewc.vercel.app';
  let title = 'India EWC & ENC27 Hub | Daily IGC Update';
  let desc = 'Track active rosters for S8UL Esports & GodLike Esports, Road to ENC27 Team India lineups, Major & 3rd-Party Tournaments, and Daily IGC Updates.';
  let image = `${baseUrl}/images/ewc_banner.jpg`;
  let isCustomImage = false;
  let post = null;

  try {
    const redis = getRedis();
    if (redis && id) {
      const list = await readJSON(redis, REQ_KEY, []);
      post = Array.isArray(list) ? list.find(r => r.id === id) : null;
    }
  } catch (e) {}

  if (isImg) {
    const raw = post?.imageUrl || '';
    const m = raw.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      res.setHeader('Content-Type', m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase());
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(buf);
    }
    if (/^https?:\/\//i.test(raw)) {
      return res.redirect(302, raw);
    }
    return res.redirect(302, `${baseUrl}/images/ewc_banner.jpg`);
  }

  if (post) {
    const author = post.submittedBy || 'India EWC Desk';
    title = `${author} — India EWC & ENC27 Hub`;
    if (post.caption) desc = String(post.caption).replace(/\s+/g, ' ').trim().slice(0, 200);
    if (post.imageUrl && /^https?:\/\//i.test(post.imageUrl)) {
      image = post.imageUrl;
      isCustomImage = true;
    } else if (post.imageUrl && /^data:image\//i.test(post.imageUrl)) {
      image = `${baseUrl}/post-image/${encodeURIComponent(id)}.jpg`;
      isCustomImage = true;
    }
  }

  const shareUrl = id ? `${baseUrl}/post/${encodeURIComponent(id)}` : `${baseUrl}/`;
  const dimTags = isCustomImage
    ? ''
    : `\n  <meta property="og:image:width" content="1024">\n  <meta property="og:image:height" content="576">`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="India EWC &amp; ENC27 Hub">
  <meta property="og:url" content="${esc(shareUrl)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(image)}">${dimTags}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta http-equiv="refresh" content="0;url=/#daily-updates">
</head>
<body style="background:#0a0f1c;color:#fff;font-family:sans-serif;text-align:center;padding:3rem;">
  <p>Redirecting to <a href="/#daily-updates" style="color:#38bdf8;">India EWC &amp; ENC27 Hub</a>...</p>
  <script>window.location.replace("/#daily-updates");</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.status(200).send(html);
};
