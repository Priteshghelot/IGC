const { getRedis } = require('./_redis');
const { DATA_KEY, applyOp, readJSON } = require('./_ops');

let memData = null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const redis = getRedis();

  try {
    if (req.method === 'GET') {
      const data = redis ? await readJSON(redis, DATA_KEY, null) : memData;
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
      if (!body) return res.status(400).json({ ok: false, error: 'Missing body' });

      // Whole-database overwrites are BLOCKED. This is what used to bring back
      // deleted rows: any browser with an old local copy overwrote the server.
      if (body.data && !body.op) {
        return res.status(409).json({ ok: false, error: 'Full overwrite disabled. Please refresh the page (Ctrl+F5).' });
      }

      if (redis) {
        // Optimistic lock so two simultaneous edits never overwrite each other.
        for (let attempt = 0; attempt < 5; attempt++) {
          await redis.watch(DATA_KEY);
          const data = await readJSON(redis, DATA_KEY, {});
          let message;
          try { message = applyOp(data, body); }
          catch (e) { await redis.unwatch(); return res.status(400).json({ ok: false, error: e.message, data }); }
          const result = await redis.multi().set(DATA_KEY, JSON.stringify(data)).exec();
          if (result) return res.status(200).json({ ok: true, message, data });
        }
        return res.status(503).json({ ok: false, error: 'Busy, please retry' });
      }

      memData = memData || {};
      const message = applyOp(memData, body);
      return res.status(200).json({ ok: true, message, data: memData });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('API /data error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
