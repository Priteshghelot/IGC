const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const handlerMap = {
  data: require('./api/data'),
  requests: require('./api/requests')
};

const parseRequestBody = (req) => new Promise((resolve) => {
  const contentType = (req.headers && req.headers['content-type']) || '';
  if (req.method === 'GET' || req.method === 'HEAD') {
    resolve(undefined);
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    if (!body) {
      resolve(undefined);
      return;
    }

    if (contentType.includes('application/json')) {
      try {
        req.body = JSON.parse(body);
      } catch (err) {
        req.body = body;
      }
    } else {
      req.body = body;
    }

    resolve(req.body);
  });
});

const server = http.createServer(async (req, res) => {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const apiPath = (req.url || '').split('?')[0];
  if (apiPath.startsWith('/api/')) {
    const route = apiPath.replace(/^\/api\/+/, '').split('/')[0];
    const handler = handlerMap[route];

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ ok: false, error: 'API route not found' }));
      return;
    }

    try {
      await parseRequestBody(req);
      await handler(req, res);
    } catch (error) {
      console.error(`API route error for ${apiPath}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA if not an asset
      const ext = path.extname(reqPath);
      if (!ext || ext === '.html') {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (err2, content) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
            res.end(content);
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File not found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎮 BHARAT ESPORTS HUB (EWC & INDIAN ORGS TRACKER)`);
  console.log(`⚡ Live local server running at: http://localhost:${PORT}`);
  console.log(`📁 Serving directory: ${PUBLIC_DIR}`);
  console.log(`====================================================`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    const nextPort = Number(PORT) + 1;
    console.log(`Port ${PORT} is busy, retrying on port ${nextPort}...`);
    server.listen(nextPort);
  } else {
    console.error('Server error:', e);
  }
});
