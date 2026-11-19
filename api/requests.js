const { getRedis } = require('./_redis');
const { DATA_KEY, REQ_KEY, applyOp, requestToOp, readJSON } = require('./_ops');

let memRequests = [];
let memData = {};

function requestFingerprint(r) {
  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const d = r && r.data && typeof r.data === 'object' ? { ...r.data } : {};
  delete d.updatedAt;
  delete d.submittedAt;
  const sortedData = Object.keys(d).sort().reduce((acc, k) => {
    acc[k] = typeof d[k] === 'string' ? norm(d[k]) : d[k];
    return acc;
  }, {});
  return JSON.stringify({
    type: norm(r && r.type),
    teamKey: norm(r && r.teamKey),
    targetId: norm(r && r.targetId),
    targetName: norm(r && r.targetName),
    caption: norm(r && r.caption),
    imageUrl: String((r && r.imageUrl) || '').trim(),
    data: sortedData
  });
}

// Atomic read-modify-write on a Redis key (retries if someone else wrote meanwhile)
async function atomicUpdate(redis, keys, fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await redis.watch(...keys);
    const values = await Promise.all(keys.map(k => readJSON(redis, k, k === REQ_KEY ? [] : {})));
    let out;
    try { out = await fn(...values); }
    catch (e) { await redis.unwatch(); throw e; }
    const multi = redis.multi();
    keys.forEach((k, i) => multi.set(k, JSON.stringify(values[i])));
    const result = await multi.exec();
    if (result) return { out, values };
  }
  throw new Error('Busy, please retry');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const redis = getRedis();

  try {
    if (req.method === 'GET') {
      const requests = redis ? await readJSON(redis, REQ_KEY, []) : memRequests;
      return res.status(200).json({ ok: true, requests });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
    if (!body) return res.status(400).json({ ok: false, error: 'Missing request body' });

    const { action, id, request } = body;

    // ── Add new community request ──
    if (action === 'add' || (!action && request)) {
      const newReq = { ...(request || body), status: 'pending' };
      if (String(newReq.type || '').startsWith('delete_')) {
        return res.status(403).json({ ok: false, error: 'Delete requests are restricted to Admin only.' });
      }
      if (!newReq.id) newReq.id = 'req-' + Date.now();
      const newFp = requestFingerprint(newReq);
      let isDup = false;
      if (redis) {
        await atomicUpdate(redis, [REQ_KEY], (list) => {
          isDup = list.some(r => r.id === newReq.id || (r.status === 'pending' && requestFingerprint(r) === newFp));
          if (!isDup) list.unshift(newReq);
        });
      } else {
        isDup = memRequests.some(r => r.id === newReq.id || (r.status === 'pending' && requestFingerprint(r) === newFp));
        if (!isDup) memRequests.unshift(newReq);
      }
      if (isDup) {
        return res.status(200).json({ ok: true, duplicate: true, message: 'This request is already pending Admin review.' });
      }
      return res.status(200).json({ ok: true, message: 'Request submitted successfully', request: newReq });
    }

    // ── Approve: applies the change to the LIVE database on the server ──
    if (action === 'approve') {
      if (redis) {
        try {
          const { out, values } = await atomicUpdate(redis, [REQ_KEY, DATA_KEY], (list, data) => {
            const item = list.find(r => r.id === id);
            if (!item) throw new Error('Request not found');
            if (item.status !== 'pending') throw new Error(`Request already ${item.status}`);
            const op = requestToOp(item);
            const message = op ? applyOp(data, op) : 'Approved';
            item.status = 'approved';
            return message;
          });
          return res.status(200).json({ ok: true, message: out, data: values[1], requests: values[0] });
        } catch (e) {
          return res.status(400).json({ ok: false, error: e.message });
        }
      }
      const item = memRequests.find(r => r.id === id);
      if (!item) return res.status(404).json({ ok: false, error: 'Request not found' });
      const op = requestToOp(item);
      const message = op ? applyOp(memData, op) : 'Approved';
      item.status = 'approved';
      return res.status(200).json({ ok: true, message, data: memData });
    }

    if (action === 'like_post') {
      const delta = Number(body.delta) < 0 ? -1 : 1;
      let likes = 0;
      if (redis) {
        await atomicUpdate(redis, [REQ_KEY], (list) => {
          const item = list.find(r => r.id === id);
          if (!item) throw new Error('Post not found');
          item.likes = Math.max(0, (Number(item.likes) || 0) + delta);
          likes = item.likes;
        });
      } else {
        const item = memRequests.find(r => r.id === id);
        if (!item) return res.status(404).json({ ok: false, error: 'Post not found' });
        item.likes = Math.max(0, (Number(item.likes) || 0) + delta);
        likes = item.likes;
      }
      return res.status(200).json({ ok: true, likes });
    }

    if (action === 'comment_post') {
      const text = String(body.text || '').trim().slice(0, 500);
      const author = String(body.author || 'Community Fan').trim().slice(0, 60) || 'Community Fan';
      if (!text) return res.status(400).json({ ok: false, error: 'Comment text is required' });
      const comment = {
        id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        author,
        text,
        createdAt: new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
      };
      let comments = [];
      if (redis) {
        await atomicUpdate(redis, [REQ_KEY], (list) => {
          const item = list.find(r => r.id === id);
          if (!item) throw new Error('Post not found');
          if (!Array.isArray(item.comments)) item.comments = [];
          item.comments.push(comment);
          comments = item.comments;
        });
      } else {
        const item = memRequests.find(r => r.id === id);
        if (!item) return res.status(404).json({ ok: false, error: 'Post not found' });
        if (!Array.isArray(item.comments)) item.comments = [];
        item.comments.push(comment);
        comments = item.comments;
      }
      return res.status(200).json({ ok: true, comment, comments });
    }

    if (action === 'delete_comment') {
      const commentId = String(body.commentId || '');
      let comments = [];
      if (redis) {
        await atomicUpdate(redis, [REQ_KEY], (list) => {
          const item = list.find(r => r.id === id);
          if (!item) throw new Error('Post not found');
          item.comments = (Array.isArray(item.comments) ? item.comments : []).filter(c => c.id !== commentId);
          comments = item.comments;
        });
      } else {
        const item = memRequests.find(r => r.id === id);
        if (!item) return res.status(404).json({ ok: false, error: 'Post not found' });
        item.comments = (Array.isArray(item.comments) ? item.comments : []).filter(c => c.id !== commentId);
        comments = item.comments;
      }
      return res.status(200).json({ ok: true, comments });
    }

    if (action === 'reject' || action === 'delete') {
      if (redis) {
        await atomicUpdate(redis, [REQ_KEY], (list) => {
          if (action === 'reject') {
            const item = list.find(r => r.id === id);
            if (item) item.status = 'rejected';
          } else {
            const idx = list.findIndex(r => r.id === id);
            if (idx !== -1) list.splice(idx, 1);
          }
        });
      } else if (action === 'reject') {
        const item = memRequests.find(r => r.id === id);
        if (item) item.status = 'rejected';
      } else {
        memRequests = memRequests.filter(r => r.id !== id);
      }
      return res.status(200).json({ ok: true, message: action === 'reject' ? 'Request rejected' : 'Request deleted' });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (error) {
    console.error('API /requests error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
