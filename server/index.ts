import http from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';

const execAsync = promisify(exec);

const PORT = Number(process.env.PORT || 3001);
const DEFAULT_SHELL = process.env.SHELL_CMD || process.env.SHELL || 'bash';
const DEFAULT_SHELL_ARGS = process.env.SHELL_ARGS ? process.env.SHELL_ARGS.split(' ') : ['-l'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

// Helper to list existing zellij sessions
async function getZellijSessions(): Promise<Array<{ name: string; raw: string }>> {
  try {
    const { stdout } = await execAsync('zellij list-sessions -n');
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.map((line) => {
      // Ex: "dl_bestfin [Created 2days ago]" or "dl_homecontrol [Created 2days ago] (current)"
      const parts = line.split(' ');
      const name = parts[0];
      return { name, raw: line };
    });
  } catch (err) {
    // If zellij has no active server or sessions, it exits with non-zero or error
    return [];
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Endpoint to discover sessions and modes
  if (parsedUrl.pathname === '/api/sessions') {
    const sessions = await getZellijSessions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      defaultShell: DEFAULT_SHELL,
      sessions,
    }));
    return;
  }

  // Serve static files from dist
  if (req.method === 'GET' || req.method === 'HEAD') {
    const safePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
    let targetPath = path.join(DIST_DIR, safePath);

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }

    // SPA fallback: if not an asset request (no extension), serve index.html
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      const fallback = path.join(DIST_DIR, 'index.html');
      if (fs.existsSync(fallback)) {
        targetPath = fallback;
      }
    }

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(targetPath).pipe(res);
      return;
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('PTY WebSocket Server is running.');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const mode = parsedUrl.searchParams.get('mode') || 'default'; // 'default' | 'zellij-new' | 'zellij-attach'
  const targetSession = parsedUrl.searchParams.get('session');

  let command = DEFAULT_SHELL;
  let args = [...DEFAULT_SHELL_ARGS];

  if (mode === 'zellij-new') {
    command = 'zellij';
    args = targetSession ? ['--session', targetSession] : [];
  } else if (mode === 'zellij-attach' && targetSession) {
    command = 'zellij';
    args = ['attach', targetSession];
  } else if (mode === 'zellij-attach') {
    command = 'zellij';
    args = ['attach'];
  }

  console.log(`[server] Client connected (mode=${mode}, session=${targetSession || 'none'}). Spawning:`, command, args);

  let ptyProcess: pty.IPty | null = null;

  try {
    ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });
  } catch (err) {
    console.error('[server] Failed to spawn PTY:', err);
    ws.send(`\r\n\x1b[31mErro ao iniciar processo (${command}): ${(err as Error).message}\x1b[0m\r\n`);
    ws.close();
    return;
  }

  // Forward PTY output -> WebSocket
  ptyProcess.onData((data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[server] PTY exited with code ${exitCode}, signal ${signal}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`\r\n\x1b[33m[Sessão/Processo finalizado com código ${exitCode}]\x1b[0m\r\n`);
      ws.close();
    }
  });

  // Handle messages from Client -> PTY
  ws.on('message', (message: Buffer | string) => {
    const raw = message.toString();

    // Check if it's a JSON control message (e.g. resize)
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.type === 'resize' && typeof parsed.cols === 'number' && typeof parsed.rows === 'number') {
          const cols = Math.max(1, Math.floor(parsed.cols));
          const rows = Math.max(1, Math.floor(parsed.rows));
          ptyProcess?.resize(cols, rows);
          return;
        }
      } catch {
        // Not a JSON message, treat as raw input bytes
      }
    }

    // Direct terminal raw bytes
    ptyProcess?.write(raw);
  });

  ws.on('close', () => {
    console.log('[server] Client disconnected. Killing PTY...');
    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (err) {
        console.error('[server] Error killing PTY:', err);
      }
      ptyProcess = null;
    }
  });

  ws.on('error', (err) => {
    console.error('[server] WebSocket error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`[server] PTY WebSocket server listening on ws://localhost:${PORT}`);
});
