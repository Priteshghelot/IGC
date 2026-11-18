const { getRedis } = require('./_redis');

const TOTAL_KEY = 'igc:stats:total_views';
const DAILY_PREFIX = 'igc:stats:daily_views:';
const ACTIVE_ZSET = 'igc:stats:active_sessions';
const SOCIAL_CACHE_KEY = 'igc:stats:socials_v2';
const SOCIAL_LAST_GOOD_KEY = 'igc:stats:socials_last_good';
const ACTIVE_TTL_MS = 75000; // 75s window for active live viewers

const memStats = {
  total: 0,
  daily: {},
  sessions: new Map(),
  socials: null,
  socialsAt: 0
};

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

async function fetchLiveSocials(redis) {
  const now = Date.now();
  if (redis) {
    try {
      const cached = await redis.get(SOCIAL_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  } else if (memStats.socials && (now - memStats.socialsAt < 30000)) {
    return memStats.socials;
  }

  let lastGood = { ytSubs: '6.38K', kickFollowers: '54', igFollowers: '8,228' };
  if (redis) {
    try {
      const lg = await redis.get(SOCIAL_LAST_GOOD_KEY);
      if (lg) lastGood = { ...lastGood, ...JSON.parse(lg) };
    } catch (e) {}
  } else if (memStats.socials) {
    lastGood = { ...lastGood, ...memStats.socials };
  }

  let ytSubs = lastGood.ytSubs;
  let kickFollowers = lastGood.kickFollowers;
  let igFollowers = lastGood.igFollowers;

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  try {
    const [ytRes, kickRes, igRes] = await Promise.all([
      fetch('https://www.youtube.com/@priteshgehlot', { cache: 'no-store', headers: { 'User-Agent': ua } })
        .then(r => r.text()).catch(() => ''),
      fetch('https://kick.com/api/v2/channels/pritesh-gehlot', { cache: 'no-store', headers: { 'User-Agent': ua } })
        .then(r => r.json()).catch(() => null),
      fetch('https://www.instagram.com/pritesh__gehlot/', { cache: 'no-store', headers: { 'User-Agent': ua } })
        .then(r => r.text()).catch(() => '')
    ]);

    if (ytRes) {
      // Match the channel header handle (@priteshgehlot • X subscribers) so featured channels don't override it
      const m = ytRes.match(/@priteshgehlot[\s\S]{0,60}?([\d.,]+\s*[kKmMbB]?)\s+subscribers/i);
      if (m && m[1]) ytSubs = m[1].replace(/\s+/g, '').toUpperCase();
    }

    if (kickRes && Number.isFinite(Number(kickRes.followers_count))) {
      kickFollowers = Number(kickRes.followers_count).toLocaleString('en-IN');
    }

    if (igRes) {
      const mIg = igRes.match(/([\d.,]+\s*[kKmMbB]?)\s+Followers/i);
      if (mIg && mIg[1]) igFollowers = mIg[1].replace(/\s+/g, '');
    }
  } catch (e) {}

  const out = { ytSubs, kickFollowers, igFollowers };
  if (redis) {
    try {
      await redis.set(SOCIAL_CACHE_KEY, JSON.stringify(out), 'EX', 30);
      await redis.set(SOCIAL_LAST_GOOD_KEY, JSON.stringify(out));
    } catch (e) {}
  } else {
    memStats.socials = out;
    memStats.socialsAt = now;
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const redis = getRedis();
  const today = getTodayIST();
  const dailyKey = DAILY_PREFIX + today;
  const now = Date.now();
  const cutoff = now - ACTIVE_TTL_MS;

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
    body = body || {};

    const isHit = req.method === 'POST' && Boolean(body.hit);
    const sid = req.method === 'POST' && body.sid ? String(body.sid).slice(0, 64) : null;

    const socialsPromise = fetchLiveSocials(redis);

    if (redis) {
      const multi = redis.multi();
      if (isHit) {
        multi.incr(TOTAL_KEY);
        multi.incr(dailyKey);
        multi.expire(dailyKey, 172800);
      } else {
        multi.get(TOTAL_KEY);
        multi.get(dailyKey);
      }

      if (sid) {
        multi.zadd(ACTIVE_ZSET, now, sid);
      }
      multi.zremrangebyscore(ACTIVE_ZSET, '-inf', cutoff);
      multi.zcard(ACTIVE_ZSET);

      const [results, socials] = await Promise.all([multi.exec(), socialsPromise]);
      const totalViews = parseInt(results[0][1], 10) || 0;
      const dailyViews = parseInt(results[1][1], 10) || 0;
      const activeNow = Math.max(1, parseInt(results[results.length - 1][1], 10) || 0);

      return res.status(200).json({
        ok: true,
        activeNow,
        dailyViews,
        totalViews,
        ytSubs: socials.ytSubs,
        kickFollowers: socials.kickFollowers,
        igFollowers: socials.igFollowers,
        date: today
      });
    }

    // In-memory fallback
    if (isHit) {
      memStats.total += 1;
      memStats.daily[today] = (memStats.daily[today] || 0) + 1;
    }
    if (sid) memStats.sessions.set(sid, now);
    for (const [k, ts] of memStats.sessions.entries()) {
      if (ts < cutoff) memStats.sessions.delete(k);
    }
    const socials = await socialsPromise;

    return res.status(200).json({
      ok: true,
      activeNow: Math.max(1, memStats.sessions.size),
      dailyViews: memStats.daily[today] || 0,
      totalViews: memStats.total || 0,
      ytSubs: socials.ytSubs,
      kickFollowers: socials.kickFollowers,
      igFollowers: socials.igFollowers,
      date: today
    });
  } catch (err) {
    console.error('API /analytics error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
