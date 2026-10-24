// Мини-сервер без зависимостей: отдаёт public/ и принимает заявки на POST /api/lead.
// Запуск: node server.mjs   (переменные окружения см. .env.example)
import { createServer } from "node:http";
import { readFile, appendFile, mkdir, stat } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(root, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon" };

export function validateLead(b) {
  const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const phone = clean(b.phone, 30);
  const lead = { name: clean(b.name, 80), phone, category: clean(b.category, 80), comment: clean(b.comment, 1000), page: clean(b.page, 200) };
  if (b.website) return { error: "spam" };
  if (b.consent !== true) return { error: "Нужно согласие на обработку данных" };
  if (!lead.name) return { error: "Укажите имя" };
  if (phone.replace(/\D/g, "").length < 11) return { error: "Неверный телефон" };
  return { lead };
}

const hits = new Map();
function limited(ip, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

async function notify(lead, env) {
  const text = `Заявка с сайта FinikFix\nИмя: ${lead.name}\nТелефон: ${lead.phone}\nКатегория: ${lead.category}\nКомментарий: ${lead.comment || "—"}\nСтраница: ${lead.page || "—"}`;
  if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
    const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text }) });
    if (!r.ok) throw new Error("telegram " + r.status);
  }
}

export function createApp(env = process.env) {
  const dataDir = env.DATA_DIR || join(root, "data");
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const sec = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" };
    if (url.pathname === "/api/lead") {
      const send = (code, obj) => { res.writeHead(code, { ...sec, "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.method !== "POST") return send(405, { ok: false });
      const ip = (env.TRUST_PROXY === "1" && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
      let raw = ""; let big = false;
      for await (const ch of req) { raw += ch; if (raw.length > 10_000) { big = true; break; } }
      if (big) return send(413, { ok: false });
      let body; try { body = JSON.parse(raw); } catch { return send(400, { ok: false, error: "bad json" }); }
      if (limited(ip, Number(env.RATE_LIMIT || 5))) return send(429, { ok: false, error: "Слишком много заявок, позвоните нам" });
      const v = validateLead(body);
      if (v.error === "spam") return send(200, { ok: true }); // ботам делаем вид, что всё принято
      if (v.error) return send(400, { ok: false, error: v.error });
      try {
        await mkdir(dataDir, { recursive: true });
        await appendFile(join(dataDir, "leads.jsonl"), JSON.stringify({ ...v.lead, at: new Date().toISOString() }) + "\n");
      } catch (e) { console.error("save lead failed", e.message); return send(500, { ok: false }); }
      try { await notify(v.lead, env); } catch (e) { console.error("notify failed", e.message); }
      return send(200, { ok: true });
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, sec); return res.end(); }
    let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400, sec); return res.end(); }
    let file = normalize(join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403, sec); return res.end(); }
    try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch {}
    try {
      const data = await readFile(file);
      const ext = extname(file);
      res.writeHead(200, { ...sec, "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400" });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      const nf = await readFile(join(PUBLIC, "404.html")).catch(() => "Not found");
      res.writeHead(404, { ...sec, "Content-Type": "text/html; charset=utf-8" }); res.end(nf);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || "127.0.0.1";
  createApp().listen(port, host, () => console.log(`FinikFix: http://${host}:${port}`));
}
