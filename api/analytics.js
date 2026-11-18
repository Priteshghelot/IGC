const { getRedis } = require('./_redis');

const TOTAL_KEY = 'igc:stats:total_views';
const DAILY_PREFIX = 'igc:stats:daily_views:';
const ACTIVE_ZSET = 'igc:stats:active_sessions';
const ACTIVE_TTL_MS = 75000; // 75s window for active live viewers

const memStats = {
  total: 0,
  daily: {},
  sessions: new Map()
};

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
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

    if (redis) {
      const multi = redis.multi();
      if (isHit) {
        multi.incr(TOTAL_KEY);
        multi.incr(dailyKey);
        multi.expire(dailyKey, 172800); // keep daily counter for 48h
      } else {
        multi.get(TOTAL_KEY);
        multi.get(dailyKey);
      }

      if (sid) {
        multi.zadd(ACTIVE_ZSET, now, sid);
      }
      multi.zremrangebyscore(ACTIVE_ZSET, '-inf', cutoff);
      multi.zcard(ACTIVE_ZSET);

      const results = await multi.exec();
      // Multi results: [total, daily, (expire if isHit), (zadd if sid), zrem, zcard]
      const totalViews = parseInt(results[0][1], 10) || 0;
      const dailyViews = parseInt(results[1][1], 10) || 0;
      const activeNow = Math.max(1, parseInt(results[results.length - 1][1], 10) || 0);

      return res.status(200).json({ ok: true, activeNow, dailyViews, totalViews, date: today });
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

    return res.status(200).json({
      ok: true,
      activeNow: Math.max(1, memStats.sessions.size),
      dailyViews: memStats.daily[today] || 0,
      totalViews: memStats.total || 0,
      date: today
    });
  } catch (err) {
    console.error('API /analytics error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
