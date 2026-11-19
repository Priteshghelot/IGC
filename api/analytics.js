const crypto = require('crypto');
const { getRedis } = require('./_redis');

const TOTAL_KEY = 'igc:stats:total_views';
const DAILY_PREFIX = 'igc:stats:daily_views:';
const ACTIVE_ZSET = 'igc:stats:active_sessions';
const POLL_S8UL_KEY = 'igc:poll:s8ul';
const POLL_GODL_KEY = 'igc:poll:godlike';
const POLL_VOTERS_HASH = 'igc:poll:voters';
const SOCIAL_CACHE_KEY = 'igc:stats:socials_v4';
const SOCIAL_LAST_GOOD_KEY = 'igc:stats:socials_last_good_v2';
const ACTIVE_TTL_MS = 75000; // 75s window for active live viewers

const memStats = {
  total: 0,
  daily: {},
  sessions: new Map(),
  poll: { s8ul: 0, godlike: 0 },
  voters: new Map(),
  socials: null,
  socialsAt: 0
};

function getVoterKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  const ua = String(req.headers['user-agent'] || '').slice(0, 120);
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 24);
}

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
  } else if (memStats.socials && (now - memStats.socialsAt < 10000)) {
    return memStats.socials;
  }

  let lastGood = { ytSubs: '6.38K', kickFollowers: '54', igFollowers: '8,232' };
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
  let ytOk = false;
  let kickOk = false;
  let igOk = false;

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  try {
    const [ytRes, kickV2, igHtml] = await Promise.all([
      fetch('https://www.youtube.com/@priteshgehlot?hl=en', {
        cache: 'no-store',
        headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' }
      }).then(r => r.text()).catch(() => ''),
      fetch('https://kick.com/api/v2/channels/pritesh-gehlot', {
        cache: 'no-store',
        headers: { 'User-Agent': ua, 'Accept': 'application/json' }
      }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('https://www.instagram.com/pritesh__gehlot/', {
        cache: 'no-store',
        headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Accept-Language': 'en-US,en;q=0.9' }
      }).then(r => r.text()).catch(() => '')
    ]);

    if (ytRes) {
      const m = ytRes.match(/@priteshgehlot[\s\S]{0,60}?([\d.,]+\s*[kKmMbB]?)\s+subscribers/i);
      if (m && m[1]) {
        ytSubs = m[1].replace(/\s+/g, '').toUpperCase();
        ytOk = true;
      }
    }

    if (kickV2 && Number.isFinite(Number(kickV2.followers_count))) {
      kickFollowers = Number(kickV2.followers_count).toLocaleString('en-IN');
      kickOk = true;
    } else {
      const kickV1 = await fetch('https://kick.com/api/v1/channels/pritesh-gehlot', {
        cache: 'no-store',
        headers: { 'User-Agent': ua, 'Accept': 'application/json' }
      }).then(r => (r.ok ? r.json() : null)).catch(() => null);
      if (kickV1 && Number.isFinite(Number(kickV1.followersCount ?? kickV1.followers_count))) {
        kickFollowers = Number(kickV1.followersCount ?? kickV1.followers_count).toLocaleString('en-IN');
        kickOk = true;
      }
    }

    if (igHtml) {
      const mIg = igHtml.match(/([\d.,]+\s*[kKmMbB]?)\s+Followers/i);
      if (mIg && mIg[1]) {
        igFollowers = mIg[1].replace(/\s+/g, '');
        igOk = true;
      }
    }
    if (!igOk) {
      const igApi = await fetch('https://i.instagram.com/api/v1/users/web_profile_info/?username=pritesh__gehlot', {
        cache: 'no-store',
        headers: { 'User-Agent': ua, 'x-ig-app-id': '936619743392459', 'Accept': 'application/json' }
      }).then(r => (r.ok ? r.json() : null)).catch(() => null);
      const count = igApi?.data?.user?.edge_followed_by?.count;
      if (Number.isFinite(Number(count))) {
        igFollowers = Number(count).toLocaleString('en-IN');
        igOk = true;
      }
    }
  } catch (e) {}

  const out = { ytSubs, kickFollowers, igFollowers, liveOk: { ytOk, kickOk, igOk } };
  if (redis) {
    try {
      await redis.set(SOCIAL_CACHE_KEY, JSON.stringify(out), 'EX', 10);
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

    const voterKey = getVoterKey(req);

    if (req.method === 'POST' && body.action === 'vote') {
      const team = body.team === 's8ul' ? 's8ul' : (body.team === 'godlike' ? 'godlike' : null);
      if (!team) return res.status(400).json({ ok: false, error: 'Invalid team' });

      if (redis) {
        const existing = await redis.hget(POLL_VOTERS_HASH, voterKey);
        if (existing === team) {
          const [s8ulRaw, godlRaw] = await Promise.all([redis.get(POLL_S8UL_KEY), redis.get(POLL_GODL_KEY)]);
          return res.status(200).json({
            ok: true,
            alreadyVoted: true,
            myVote: existing,
            poll: { s8ul: Math.max(0, parseInt(s8ulRaw, 10) || 0), godlike: Math.max(0, parseInt(godlRaw, 10) || 0) }
          });
        }
        await redis.hset(POLL_VOTERS_HASH, voterKey, team);
        const incKey = team === 's8ul' ? POLL_S8UL_KEY : POLL_GODL_KEY;
        await redis.incr(incKey);
        if (existing && existing !== team) {
          const decKey = existing === 's8ul' ? POLL_S8UL_KEY : POLL_GODL_KEY;
          const cur = parseInt(await redis.get(decKey), 10) || 0;
          if (cur > 0) await redis.decr(decKey);
        }
        const [s8ulRaw, godlRaw] = await Promise.all([redis.get(POLL_S8UL_KEY), redis.get(POLL_GODL_KEY)]);
        return res.status(200).json({
          ok: true,
          myVote: team,
          poll: { s8ul: Math.max(0, parseInt(s8ulRaw, 10) || 0), godlike: Math.max(0, parseInt(godlRaw, 10) || 0) }
        });
      }

      const existing = memStats.voters.get(voterKey);
      if (existing === team) {
        return res.status(200).json({ ok: true, alreadyVoted: true, myVote: existing, poll: { ...memStats.poll } });
      }
      memStats.voters.set(voterKey, team);
      memStats.poll[team] += 1;
      if (existing && memStats.poll[existing] > 0) memStats.poll[existing] -= 1;
      return res.status(200).json({ ok: true, myVote: team, poll: { ...memStats.poll } });
    }

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
      multi.get(POLL_S8UL_KEY);
      multi.get(POLL_GODL_KEY);
      multi.hget(POLL_VOTERS_HASH, voterKey);

      const [results, socials] = await Promise.all([multi.exec(), socialsPromise]);
      const totalViews = parseInt(results[0][1], 10) || 0;
      const dailyViews = parseInt(results[1][1], 10) || 0;
      const len = results.length;
      const activeNow = Math.max(1, parseInt(results[len - 4][1], 10) || 0);
      const poll = {
        s8ul: Math.max(0, parseInt(results[len - 3][1], 10) || 0),
        godlike: Math.max(0, parseInt(results[len - 2][1], 10) || 0)
      };
      const myVote = results[len - 1][1] || null;

      return res.status(200).json({
        ok: true,
        activeNow,
        dailyViews,
        totalViews,
        poll,
        myVote,
        ytSubs: socials.ytSubs,
        kickFollowers: socials.kickFollowers,
        igFollowers: socials.igFollowers,
        liveOk: socials.liveOk || null,
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
      poll: { ...memStats.poll },
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
