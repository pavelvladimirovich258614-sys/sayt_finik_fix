// Мини-сервер без зависимостей: отдаёт public/, портфолио и админку. Приём заявок через сайт отключён (/api/lead отвечает 503).
import "./src/env.mjs";
// Запуск: node server.mjs   (переменные окружения см. .env.example)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPortfolio } from "./src/portfolio/api.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(root, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon" };

export function createApp(env = process.env) {
  const dataDir = env.DATA_DIR || join(root, "data");
  const portfolio = createPortfolio(env, dataDir);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try { if (await portfolio.handle(req, res, url)) return; } catch (e) { console.error("portfolio error", e.message); if (!res.headersSent) { res.writeHead(500, { "Content-Type": "application/json" }); } return res.end('{"ok":false}'); }
    const sec = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" };
    // Приём заявок через сайт отключён (решение владельца): все запросы к /api/lead получают 503.
    if (url.pathname === "/api/lead") { res.writeHead(503, { ...sec, "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "Заявки через сайт не принимаются. Позвоните или напишите в мессенджер." })); }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, sec); return res.end(); }
    let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400, sec); return res.end(); }
    let file = normalize(join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403, sec); return res.end(); }
    try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch {}
    try {
      const data = await readFile(file);
      const ext = extname(file);
      res.writeHead(200, { ...sec, "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=86400" });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      const nf = await readFile(join(PUBLIC, "404.html")).catch(() => "Not found");
      res.writeHead(404, { ...sec, "Content-Type": "text/html; charset=utf-8" }); res.end(nf);
    }
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || "127.0.0.1";
  createApp().listen(port, host, () => console.log(`FinikFix: http://${host}:${port}`));
}
