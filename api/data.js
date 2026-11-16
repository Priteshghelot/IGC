const { getRedis } = require('./_redis');

let memData = null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const redis = getRedis();
  const REDIS_KEY = 'igc:hub_data';

  try {
    if (req.method === 'GET') {
      let data = null;
      if (redis) {
        const raw = await redis.get(REDIS_KEY);
        if (raw) data = JSON.parse(raw);
      } else {
        data = memData;
      }
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }

      if (!body || !body.data) {
        return res.status(400).json({ ok: false, error: 'Missing data payload' });
      }

      if (redis) {
        await redis.set(REDIS_KEY, JSON.stringify(body.data));
      } else {
        memData = body.data;
      }
      return res.status(200).json({ ok: true, message: 'Data saved successfully' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('API /data error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
