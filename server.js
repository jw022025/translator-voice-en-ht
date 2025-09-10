// Minimal Node HTTP server with:
// - Static UI (public/index.html)
// - ASR stub: POST /api/asr/:lang  -> saves audio + metadata JSON under data/audio/<lang>
// - Link pair: POST /api/samples/link -> writes data/pairs/<sampleId>.pair.json
// - List items: GET /api/samples?kind=audio|pair|all
// - Health: GET /healthz
//
// Layout created on disk (relative to project root via docker volume):
// data/
//   audio/
//     en/  <audio_id>.webm + <audio_id>.json
//     ht/  <audio_id>.webm + <audio_id>.json
//   pairs/
//     <sample_id>.pair.json
//   manifests/           (reserved for future JSONL exports)

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Simple structured logging
const logger = {
  info: (message, meta = {}) => console.log(JSON.stringify({ level: 'info', message, ...meta, timestamp: new Date().toISOString() })),
  error: (message, meta = {}) => console.error(JSON.stringify({ level: 'error', message, ...meta, timestamp: new Date().toISOString() })),
  warn: (message, meta = {}) => console.warn(JSON.stringify({ level: 'warn', message, ...meta, timestamp: new Date().toISOString() }))
};

// ---------- paths & helpers ----------
const DATA_ROOT     = path.join(__dirname, 'data');
const AUDIO_EN_DIR  = path.join(DATA_ROOT, 'audio', 'en');
const AUDIO_HT_DIR  = path.join(DATA_ROOT, 'audio', 'ht');
const PAIRS_DIR     = path.join(DATA_ROOT, 'pairs');
const MANIFESTS_DIR = path.join(DATA_ROOT, 'manifests');

function ensureDir(dir) { 
  try { 
    fs.mkdirSync(dir, { recursive: true }); 
    logger.info('Directory ensured', { dir });
  } catch (err) {
    logger.error('Failed to create directory', { dir, error: err.message });
    throw err;
  }
}

function extFromContentType(ct = '') {
  const t = String(ct).toLowerCase();
  if (t.includes('audio/webm')) return '.webm';
  if (t.includes('audio/wav'))  return '.wav';
  if (t.includes('audio/mpeg') || t.includes('audio/mp3')) return '.mp3';
  if (t.includes('audio/ogg'))  return '.ogg';
  return '.bin';
}

function serveFile(res, absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  const type = types[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(absPath);
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

async function readBody(req, maxSize = MAX_FILE_SIZE) {
  const chunks = [];
  let totalSize = 0;
  
  for await (const chunk of req) {
    totalSize += chunk.length;
    if (totalSize > maxSize) {
      throw new Error(`Request body too large. Max size: ${maxSize} bytes`);
    }
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

// ---------- http server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method || 'GET';

  // CORS configuration based on environment
  const allowedOrigins = NODE_ENV === 'production' 
    ? ['https://translator-voice-en-ht.netlify.app']
    : ['*'];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  if (method === 'OPTIONS') { 
    res.writeHead(204); 
    res.end(); 
    return; 
  }

  // Enhanced health check
  if (url.pathname === '/healthz' && method === 'GET') {
    const health = {
      ok: true,
      service: 'translator-voice-en-ht',
      version: '0.1.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      memory: process.memoryUsage(),
      diskSpace: {
        dataDir: DATA_ROOT,
        exists: fs.existsSync(DATA_ROOT)
      }
    };
    
    logger.info('Health check requested', { ip: req.socket.remoteAddress });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
    return;
  }

  // Static UI
  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    serveFile(res, path.join(__dirname, 'public', 'index.html'));
    return;
  }
  if (method === 'GET' && url.pathname.startsWith('/public/')) {
    serveFile(res, path.join(__dirname, url.pathname));
    return;
  }

  // POST /api/asr/:lang  (lang = en | ht)
  if (url.pathname.startsWith('/api/asr/') && method === 'POST') {
    try {
      const parts = url.pathname.split('/');        // ["", "api", "asr", "en"]
      const lang = (parts[3] || 'en').toLowerCase();
      const body = await readBody(req);
      const contentType = req.headers['content-type'] || 'application/octet-stream';
      const id  = randomUUID();
      const ext = extFromContentType(contentType);

      // choose folder by lang
      const folder = lang === 'ht' ? AUDIO_HT_DIR : AUDIO_EN_DIR;
      ensureDir(folder);
      ensureDir(MANIFESTS_DIR);

      const audioPath = path.join(folder, `${id}${ext}`);
      const metaPath  = path.join(folder, `${id}.json`);

      const transcript = lang === 'ht' ? 'Bonjou mond (ASR stub)' : 'Hello World (ASR stub)';

      fs.writeFileSync(audioPath, body);
      const metadata = {
        kind: 'audio',
        id,
        lang: lang === 'ht' ? 'ht-HT' : 'en-US',
        createdAt: new Date().toISOString(),
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] || '',
        contentType,
        bytes: body.length,
        audioFile: path.basename(audioPath),
        transcript,
        codec: ext === '.wav' ? 'pcm_s16le' : (ext === '.webm' ? 'opus' : 'unknown'),
        sr: null,            // fill later if you transcode to WAV 16k
        duration_s: null,    // fill later in a batch step
        domain: []           // optional tags (set on link if you want)
      };
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...metadata }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'ASR save failed', details: String(err) }));
    }
    return;
  }

  // POST /api/samples/link
  // {
  //   term, category, enText, htText, enAudioId, htAudioId, annotator, consent
  // }
  if (url.pathname === '/api/samples/link' && method === 'POST') {
    try {
      ensureDir(PAIRS_DIR);
      const body = await readBody(req);
      const payload = JSON.parse(body.toString('utf8'));

      const {
        term, category, enText, htText, enAudioId, htAudioId,
        annotator = 'anonymous', consent = false
      } = payload || {};

      if (!term || !category || !enAudioId || !htAudioId || !consent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing required fields or consent=false' }));
        return;
      }

      const sampleId = randomUUID();
      const record = {
        kind: 'pair',
        sampleId,
        createdAt: new Date().toISOString(),
        term,
        category,
        annotator,
        consent: !!consent,
        en: { text: enText || term, audioRef: enAudioId },
        ht: { text: htText || '',   audioRef: htAudioId }
      };

      fs.writeFileSync(path.join(PAIRS_DIR, `${sampleId}.pair.json`), JSON.stringify(record, null, 2));

      // (Optional future) append JSONL manifests here for training toolchains

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sampleId, record }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Linking failed', details: String(err) }));
    }
    return;
  }

  // GET /api/samples?kind=audio|pair|all
  if (url.pathname === '/api/samples' && method === 'GET') {
    try {
      const kind = (url.searchParams.get('kind') || 'all').toLowerCase();
      ensureDir(DATA_ROOT);

      const collect = [];
      if (kind === 'audio' || kind === 'all') {
        for (const dir of [AUDIO_EN_DIR, AUDIO_HT_DIR]) {
          ensureDir(dir);
          for (const f of fs.readdirSync(dir)) {
            if (f.endsWith('.json')) collect.push(path.join(dir, f));
          }
        }
      }
      if (kind === 'pair' || kind === 'all') {
        ensureDir(PAIRS_DIR);
        for (const f of fs.readdirSync(PAIRS_DIR)) {
          if (f.endsWith('.pair.json')) collect.push(path.join(PAIRS_DIR, f));
        }
      }

      const items = collect
        .map(f => ({ f, m: fs.statSync(f).mtimeMs }))
        .sort((a, b) => b.m - a.m)
        .slice(0, 50)
        .map(({ f }) => {
          try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
          catch { return null; }
        })
        .filter(Boolean);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: items.length, kind, items }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'List failed', details: String(err) }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    // Catch any unhandled errors and ensure we always return JSON
    try {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          ok: false, 
          error: 'Internal server error', 
          details: String(err) 
        }));
      } else {
        res.end();
      }
    } catch (finalErr) {
      // Last resort - just end the response
      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});