// Minimal Node HTTP server with:
// - Static UI (public/index.html)
// - ASR stub: POST /api/asr/:lang  -> saves audio + metadata JSON
// - Link EN+HT pair: POST /api/samples/link -> writes <uuid>.pair.json
// - List samples: GET /api/samples?kind=audio|pair|all
// - Health: GET /healthz
//
// Requirements:
//   - package.json should have: { "type": "module", ... }
//   - docker-compose.yml should bind-mount ./data -> /app/data
//
// Mental model:
//   - We receive audio as raw bytes (Blob) from the browser
//   - We store it as /app/data/<id>.<ext> and /app/data/<id>.json
//   - Linking endpoint creates /app/data/<sampleId>.pair.json pointing at the two audio ids

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 8080;

// __dirname equivalent for ES modules
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// ---------- Helpers ----------
const DATA_DIR = path.join(__dirname, 'data'); // bind-mounted via docker-compose

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

// Naive mapping from Content-Type to file extension (good enough for dev)
function extFromContentType(ct = '') {
  const t = String(ct).toLowerCase();
  if (t.includes('audio/webm')) return '.webm';
  if (t.includes('audio/wav'))  return '.wav';
  if (t.includes('audio/mpeg') || t.includes('audio/mp3')) return '.mp3';
  if (t.includes('audio/ogg'))  return '.ogg';
  return '.bin'; // fallback
}

// Serve a static file with a sensible content-type
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

// Read entire request body (fine for short audio clips)
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ---------- HTTP Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method || 'GET';

  // CORS (development-friendly)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- Health check ---
  if (url.pathname === '/healthz' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'translator-lab0' }));
    return;
  }

  // --- Static files ---
  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    serveFile(res, path.join(__dirname, 'public', 'index.html'));
    return;
  }
  if (method === 'GET' && url.pathname.startsWith('/public/')) {
    serveFile(res, path.join(__dirname, url.pathname));
    return;
  }

  // --- ASR STUB: POST /api/asr/:lang  (lang = 'en' | 'ht') ---
  if (url.pathname.startsWith('/api/asr/') && method === 'POST') {
    try {
      ensureDir(DATA_DIR);

      // 1) Parse lang from path
      //    /api/asr/en -> 'en', /api/asr/ht -> 'ht'
      const parts = url.pathname.split('/'); // ["", "api", "asr", "<lang>"]
      const lang = parts[3] || 'en';

      // 2) Read raw audio bytes + metadata
      const body = await readBody(req);
      const contentType = req.headers['content-type'] || 'application/octet-stream';

      // 3) Generate ids & paths
      const id = randomUUID();
      const ext = extFromContentType(contentType);
      const audioPath = path.join(DATA_DIR, `${id}${ext}`);
      const metaPath  = path.join(DATA_DIR, `${id}.json`);

      // 4) Stub transcript (swap for Whisper/Google later)
      const transcript = (lang === 'ht') ? 'Bonjou mond (ASR stub)' : 'Hello World (ASR stub)';

      // 5) Write audio + metadata
      fs.writeFileSync(audioPath, body);
      const metadata = {
        kind: 'audio',
        id,
        lang, // 'en' or 'ht'
        createdAt: new Date().toISOString(),
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] || '',
        contentType,
        bytes: body.length,
        audioFile: path.basename(audioPath),
        transcript,
        notes: 'Replace transcript with real ASR later.'
      };
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

      // 6) Respond
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...metadata }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'ASR save failed', details: String(err) }));
    }
    return;
  }

  // --- Link EN + HT into a single paired sample ---
  // POST /api/samples/link
  // Body JSON:
  // {
  //   "term": "Hypertension",
  //   "category": "medical",
  //   "enText": "Hypertension",
  //   "htText": "Tansyon wo",
  //   "enAudioId": "<uuid-from-/api/asr/en>",
  //   "htAudioId": "<uuid-from-/api/asr/ht>",
  //   "annotator": "wally"
  // }
  if (url.pathname === '/api/samples/link' && method === 'POST') {
    try {
      ensureDir(DATA_DIR);
      const body = await readBody(req);
      const payload = JSON.parse(body.toString('utf8'));

      const {
        term,
        category,
        enText,
        htText,
        enAudioId,
        htAudioId,
        annotator = 'anonymous'
      } = payload || {};

      // Minimal validation
      if (!term || !category || !enAudioId || !htAudioId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing required fields' }));
        return;
      }

      const sampleId = randomUUID();
      const samplePath = path.join(DATA_DIR, `${sampleId}.pair.json`);
      const record = {
        kind: 'pair',
        sampleId,
        createdAt: new Date().toISOString(),
        term,
        category,
        annotator,
        en: { text: enText || term, audioRef: enAudioId },
        ht: { text: htText || '',   audioRef: htAudioId }
      };

      fs.writeFileSync(samplePath, JSON.stringify(record, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sampleId, record }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Linking failed', details: String(err) }));
    }
    return;
  }

  // --- List saved items ---
  // GET /api/samples?kind=audio|pair|all    (default: all)
  // Returns last 50 items of the requested kind(s)
  if (url.pathname === '/api/samples' && method === 'GET') {
    try {
      ensureDir(DATA_DIR);
      const kind = (url.searchParams.get('kind') || 'all').toLowerCase();
      const files = fs.readdirSync(DATA_DIR);

      const selected = files.filter(f => {
        if (kind === 'audio') return f.endsWith('.json') && !f.endsWith('.pair.json');
        if (kind === 'pair')  return f.endsWith('.pair.json');
        // all: include both
        return f.endsWith('.json');
      });

      // Read and parse most recent 50
      const items = selected
        .map(f => ({ f, stat: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
        .sort((a, b) => b.stat - a.stat)  // newest first
        .slice(0, 50)
        .map(({ f }) => {
          try {
            const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
            return JSON.parse(raw);
          } catch {
            return null;
          }
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

  // --- Fallback 404 ---
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start the HTTP server
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});