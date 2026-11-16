const { getRedis } = require('./_redis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const redis = getRedis();
  const redisConnected = !!redis;
  let pingResult = null;
  let errorMsg = null;

  if (redis) {
    try {
      pingResult = await redis.ping();
    } catch(e) {
      errorMsg = e.message;
    }
  }

  return res.status(200).json({
    status: 'online',
    hasEnvRedisUrl: !!process.env.REDIS_URL,
    hasEnvKvUrl: !!process.env.KV_URL,
    redisConnected,
    ping: pingResult,
    error: errorMsg,
    time: new Date().toISOString()
  });
};
