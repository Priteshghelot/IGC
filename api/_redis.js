const Redis = require('ioredis');

let client = null;

function getRedis() {
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) {
    console.warn("⚠️ REDIS_URL or KV_URL not configured in environment variables.");
    return null;
  }
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 100, 2000);
      }
    });
    client.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });
  }
  return client;
}

module.exports = { getRedis };
