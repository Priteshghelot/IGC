const { getRedis } = require('./_redis');

// In-memory fallback if Redis is unavailable
let memRequests = [];

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const redis = getRedis();
  const REDIS_KEY = 'igc:pending_requests';

  try {
    if (req.method === 'GET') {
      let requests = [];
      if (redis) {
        const raw = await redis.get(REDIS_KEY);
        requests = raw ? JSON.parse(raw) : [];
      } else {
        requests = memRequests;
      }
      return res.status(200).json({ ok: true, requests });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }

      if (!body) {
        return res.status(400).json({ ok: false, error: 'Missing request body' });
      }

      // Check for action (e.g. approve, reject, delete)
      const { action, id, request } = body;

      if (action === 'add' || (!action && request)) {
        const newReq = request || body;
        let list = [];
        if (redis) {
          const raw = await redis.get(REDIS_KEY);
          list = raw ? JSON.parse(raw) : [];
          // Prepend new request
          list.unshift(newReq);
          await redis.set(REDIS_KEY, JSON.stringify(list));
        } else {
          memRequests.unshift(newReq);
          list = memRequests;
        }
        return res.status(200).json({ ok: true, message: 'Request submitted successfully', request: newReq });
      }

      if (action === 'approve' || action === 'reject') {
        let list = [];
        if (redis) {
          const raw = await redis.get(REDIS_KEY);
          list = raw ? JSON.parse(raw) : [];
          const item = list.find(r => r.id === id);
          if (item) item.status = action === 'approve' ? 'approved' : 'rejected';
          await redis.set(REDIS_KEY, JSON.stringify(list));
        } else {
          const item = memRequests.find(r => r.id === id);
          if (item) item.status = action === 'approve' ? 'approved' : 'rejected';
          list = memRequests;
        }
        return res.status(200).json({ ok: true, message: `Request marked as ${action}d` });
      }

      if (action === 'delete') {
        let list = [];
        if (redis) {
          const raw = await redis.get(REDIS_KEY);
          list = raw ? JSON.parse(raw) : [];
          list = list.filter(r => r.id !== id);
          await redis.set(REDIS_KEY, JSON.stringify(list));
        } else {
          memRequests = memRequests.filter(r => r.id !== id);
          list = memRequests;
        }
        return res.status(200).json({ ok: true, message: 'Request deleted' });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('API /requests error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
