/**
 * FocusTube - Local Development Server
 * 
 * Provides unified local development:
 * 1. Serves static frontend assets (HTML, CSS, JS, JSON, images) with correct MIME types.
 * 2. Executes serverless API functions in /api (playlist, quiz, youtube) matching Vercel runtime.
 * 3. Reads environment variables from .env if present.
 * 
 * Run with: node server.js [port]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Simple .env parser (zero-dependency)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
      console.log('[Server] Loaded configuration from .env');
    } catch (e) {
      console.warn('[Server] Notice: Could not read .env file:', e.message);
    }
  }
}

loadEnv();

const PORT = parseInt(process.argv[2] || process.env.PORT || '8000', 10);
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

// Resolve serverless function handler with dynamic cache invalidation in dev
function getApiHandler(pathname) {
  const cleanPath = pathname.endsWith('.js') ? pathname : `${pathname}.js`;
  const moduleName = path.basename(cleanPath);
  const apiFilePath = path.join(__dirname, 'api', moduleName);
  
  if (fs.existsSync(apiFilePath)) {
    try {
      delete require.cache[require.resolve(apiFilePath)];
      return require(apiFilePath);
    } catch (e) {
      console.error(`[Server] Error loading ${apiFilePath}:`, e);
      return null;
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;

  // -------------------------------------------------------------------------
  // 1. API Routes Handler (/api/*)
  // -------------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    const handler = getApiHandler(pathname);
    if (handler) {
      // Parse query params into req.query object
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());

      // Read body if POST/PUT
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', async () => {
        try {
          if (bodyData) {
            try {
              req.body = JSON.parse(bodyData);
            } catch (e) {
              req.body = bodyData;
            }
          } else {
            req.body = {};
          }

          // Enhance res with helper methods matching Vercel / Express
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
          };

          await handler(req, res);
        } catch (err) {
          console.error(`[Server] Error executing API route ${pathname}:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
          }
        }
      });
      return;
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not Found', message: `API route ${pathname} not found.` }));
      return;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Static File Serving
  // -------------------------------------------------------------------------
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  // Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      // If extension omitted, try appending .html
      if (!path.extname(filePath)) {
        const htmlPath = filePath + '.html';
        if (fs.existsSync(htmlPath)) {
          serveFile(htmlPath, res);
          return;
        }
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>404 Not Found</h2><p>The requested file <code>${pathname}</code> was not found.</p><a href="/">Return Home</a></body></html>`);
      return;
    }

    if (stats.isDirectory()) {
      const indexFile = path.join(filePath, 'index.html');
      if (fs.existsSync(indexFile)) {
        serveFile(indexFile, res);
      } else {
        res.statusCode = 403;
        res.end('Directory listing forbidden.');
      }
      return;
    }

    serveFile(filePath, res);
  });
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.end('Error reading file.');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 FocusTube Server running at http://localhost:${PORT}`);
  console.log(`- Frontend: http://localhost:${PORT}/index.html`);
  console.log(`- Study Room: http://localhost:${PORT}/study.html`);
  console.log(`- API Endpoints: /api/playlist, /api/quiz, /api/youtube`);
  console.log(`======================================================\n`);
});
