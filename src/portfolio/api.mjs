// HTTP-маршруты портфолио: публичные (чтение) и админские (только HTTPS + ADMIN_ENABLED=1).
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cleanWork, CATEGORIES } from "./model.mjs";
import { verifyPassword, DUMMY_HASH, sha256, newToken, SESSION_MS, parseCookies, sessionCookie, createLimiter } from "./auth.mjs";
import { inspectImage } from "./images.mjs";
import { boundaryOf, parseMultipart } from "./multipart.mjs";

const ADMIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "admin");
const ADMIN_FILES = { "/admin/": ["index.html", "text/html; charset=utf-8"], "/admin/admin.js": ["admin.js", "text/javascript; charset=utf-8"], "/admin/admin.css": ["admin.css", "text/css; charset=utf-8"] };
const MEDIA_TYPES = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };
const MEDIA_RE = /^\/media\/([a-f0-9]{32})\.(webp|jpg|png)$/;
const MAX_FILE = 8 * 1024 * 1024, MAX_BODY = 30 * 1024 * 1024, MAX_FILES = 10, MAX_PHOTOS_PER_WORK = 20;

export function createPortfolio(env, dataDir) {
  const uploadDir = env.UPLOAD_DIR || join(dataDir, "uploads");
  let store = null;
  const getStore = () => store; // открывается лениво в ensureStore(): node:sqlite подключается только при обращении к портфолио
  async function ensureStore() { if (!store) store = (await import("./store.mjs")).openStore(dataDir); return store; }
  const adminOn = env.ADMIN_ENABLED === "1";
  const loginByIp = createLimiter(5, 15 * 60 * 1000), loginByEmail = createLimiter(5, 15 * 60 * 1000);

  const isSecure = (req) => !!req.socket.encrypted || (env.TRUST_PROXY === "1" && req.headers["x-forwarded-proto"] === "https");
  // За nginx берём X-Real-IP (его выставляет nginx из $remote_addr). X-Forwarded-For клиент может подделать, на нём лимит входа не строим.
  const clientIp = (req) => (env.TRUST_PROXY === "1" && String(req.headers["x-real-ip"] || "").trim()) || req.socket.remoteAddress || "?";
  const baseHeaders = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY" };
  const json = (res, code, obj, extra = {}) => { res.writeHead(code, { ...baseHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }); res.end(JSON.stringify(obj)); };
  const notFound = (res) => { res.writeHead(404, baseHeaders); res.end(); };

  async function readBody(req, max) {
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > max) return null; chunks.push(c); }
    return Buffer.concat(chunks);
  }
  const sameOrigin = (req) => {
    const o = req.headers.origin; if (!o) return false;
    const proto = isSecure(req) ? "https" : "http";
    return o === `${proto}://${req.headers.host}`;
  };
  const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

  function currentSession(req) {
    const sid = parseCookies(req.headers.cookie).ff_sid; if (!sid) return null;
    return getStore().getSession(sha256(sid));
  }
  const publicWork = (w) => ({ ...w, photos: w.photos.map((p) => ({ id: p.id, src: `/media/${p.file}`, width: p.width, height: p.height })) });

  async function removeFiles(files) { for (const f of files || []) { if (/^[a-f0-9]{32}\.(webp|jpg|png)$/.test(f)) await unlink(join(uploadDir, f)).catch(() => {}); } }

  async function admin(req, res, url) {
    const path = url.pathname;
    if (ADMIN_FILES[path] || path === "/admin") {
      if (path === "/admin") { res.writeHead(301, { Location: "/admin/" }); return res.end(); }
      if (req.method !== "GET") return notFound(res);
      const [f, type] = ADMIN_FILES[path];
      res.writeHead(200, { ...baseHeaders, "Content-Type": type, "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
      return res.end(await readFile(join(ADMIN_DIR, f)));
    }
    if (!path.startsWith("/admin/api/")) return notFound(res);
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    if (mutating && !sameOrigin(req)) return json(res, 403, { ok: false, error: "Запрещено" });

    if (path === "/admin/api/login" && req.method === "POST") {
      const ip = clientIp(req);
      const buf = await readBody(req, 4096); let b; try { b = JSON.parse(buf?.toString() || ""); } catch { return json(res, 400, { ok: false, error: "Неверный запрос" }); }
      const email = String(b.email || "").trim().toLowerCase().slice(0, 200), pw = String(b.password || "").slice(0, 300);
      if (loginByIp.blocked(ip) || loginByEmail.blocked(email)) return json(res, 429, { ok: false, error: "Слишком много попыток входа. Подождите и повторите." }, { "Retry-After": String(Math.max(loginByIp.retryAfter(ip), loginByEmail.retryAfter(email))) });
      const a = getStore().getAdminByEmail(email);
      const good = await verifyPassword(pw, a ? a.pass_hash : DUMMY_HASH);
      if (!a || !good) { loginByIp.fail(ip); loginByEmail.fail(email); return json(res, 401, { ok: false, error: "Неверный email или пароль" }); }
      loginByIp.reset(ip); loginByEmail.reset(email);
      const token = newToken(), csrf = newToken();
      getStore().purgeSessions();
      getStore().putSession(sha256(token), a.id, csrf, Date.now() + SESSION_MS);
      return json(res, 200, { ok: true, email: a.email, csrf }, { "Set-Cookie": sessionCookie(token, true) });
    }

    const sess = currentSession(req);
    if (!sess) return json(res, 401, { ok: false, error: "Требуется вход" });
    if (path === "/admin/api/me" && req.method === "GET") return json(res, 200, { ok: true, email: sess.email, csrf: sess.csrf, categories: CATEGORIES });
    if (mutating && !eq(req.headers["x-csrf-token"] || "", sess.csrf)) return json(res, 403, { ok: false, error: "Запрещено" });
    const st = getStore();

    if (path === "/admin/api/logout" && req.method === "POST") { st.delSession(sess.id); return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", true, 0) }); }
    if (path === "/admin/api/works" && req.method === "GET") return json(res, 200, { ok: true, works: st.listAll().map(publicWork) });

    const jsonBody = async () => { const buf = await readBody(req, 64 * 1024); try { return JSON.parse(buf?.toString() || ""); } catch { return null; } };
    if (path === "/admin/api/works" && req.method === "POST") {
      const b = await jsonBody(); if (!b) return json(res, 400, { ok: false, error: "Неверный запрос" });
      const v = cleanWork(b); if (v.error) return json(res, 400, { ok: false, error: v.error });
      return json(res, 201, { ok: true, id: st.createWork(v.work) });
    }
    if (path === "/admin/api/reorder" && req.method === "POST") {
      const b = await jsonBody(); const ids = Array.isArray(b?.ids) ? b.ids.map(Number).filter(Number.isInteger) : null;
      if (!ids) return json(res, 400, { ok: false, error: "Неверный запрос" });
      if (b.workId) st.reorderPhotos(Number(b.workId), ids); else st.reorderWorks(ids);
      return json(res, 200, { ok: true });
    }
    let m = /^\/admin\/api\/works\/(\d+)$/.exec(path);
    if (m) {
      const id = Number(m[1]);
      if (req.method === "PUT") {
        const b = await jsonBody(); if (!b) return json(res, 400, { ok: false, error: "Неверный запрос" });
        const v = cleanWork(b); if (v.error) return json(res, 400, { ok: false, error: v.error });
        return st.updateWork(id, v.work) ? json(res, 200, { ok: true }) : json(res, 404, { ok: false, error: "Не найдено" });
      }
      if (req.method === "DELETE") { const files = st.deleteWork(id); if (!files) return json(res, 404, { ok: false, error: "Не найдено" }); await removeFiles(files); return json(res, 200, { ok: true }); }
    }
    m = /^\/admin\/api\/works\/(\d+)\/photos$/.exec(path);
    if (m && req.method === "POST") {
      const id = Number(m[1]); if (!st.getWork(id)) return json(res, 404, { ok: false, error: "Не найдено" });
      const boundary = boundaryOf(req.headers["content-type"]); if (!boundary) return json(res, 400, { ok: false, error: "Ожидается multipart/form-data" });
      const declared = Number(req.headers["content-length"] || 0);
      if (declared > MAX_BODY) return json(res, 413, { ok: false, error: "Слишком большой запрос" });
      const buf = await readBody(req, MAX_BODY); if (!buf) return json(res, 413, { ok: false, error: "Слишком большой запрос" });
      const pm = parseMultipart(buf, boundary, { maxParts: MAX_FILES + 2 }); if (pm.error) return json(res, 400, { ok: false, error: "Неверный запрос" });
      const files = pm.parts.filter((p) => p.filename !== null && p.data.length);
      if (!files.length) return json(res, 400, { ok: false, error: "Файлы не выбраны" });
      if (files.length > MAX_FILES) return json(res, 400, { ok: false, error: `Не больше ${MAX_FILES} файлов за раз` });
      if (st.photoCount(id) + files.length > MAX_PHOTOS_PER_WORK) return json(res, 400, { ok: false, error: `Не больше ${MAX_PHOTOS_PER_WORK} фото на работу` });
      const checked = [];
      for (const f of files) {
        if (f.data.length > MAX_FILE) return json(res, 413, { ok: false, error: "Файл больше 8 МБ" });
        const r = inspectImage(f.data); if (r.error) return json(res, 400, { ok: false, error: r.error });
        checked.push(r.image);
      }
      await mkdir(uploadDir, { recursive: true, mode: 0o750 });
      const added = [];
      for (const img of checked) {
        const name = `${randomBytes(16).toString("hex")}.${img.ext}`;
        await writeFile(join(uploadDir, name), img.data, { flag: "wx", mode: 0o640 });
        added.push({ id: st.addPhoto(id, { file: name, width: img.width, height: img.height }), src: `/media/${name}` });
      }
      return json(res, 201, { ok: true, photos: added });
    }
    m = /^\/admin\/api\/photos\/(\d+)$/.exec(path);
    if (m && req.method === "DELETE") { const f = st.deletePhoto(Number(m[1])); if (!f) return json(res, 404, { ok: false, error: "Не найдено" }); await removeFiles([f]); return json(res, 200, { ok: true }); }
    return notFound(res);
  }

  return {
    store: ensureStore,
    /** true, если запрос обработан */
    async handle(req, res, url) {
      const p = url.pathname;
      if (p === "/api/portfolio" || p === "/api/portfolio/slides") {
        if (req.method !== "GET") { res.writeHead(405, baseHeaders); res.end(); return true; }
        await ensureStore();
        const works = getStore().listPublic({ category: url.searchParams.get("category") || "", home: url.searchParams.get("home") === "1", slider: p.endsWith("/slides") });
        json(res, 200, { ok: true, categories: CATEGORIES, works: works.map(publicWork) }, { "Cache-Control": "public, max-age=30" });
        return true;
      }
      const mm = MEDIA_RE.exec(p);
      if (mm) {
        if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, baseHeaders); res.end(); return true; }
        try {
          const data = await readFile(join(uploadDir, `${mm[1]}.${mm[2]}`));
          res.writeHead(200, { ...baseHeaders, "Content-Type": MEDIA_TYPES[mm[2]], "Cache-Control": "public, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'; sandbox" });
          res.end(req.method === "HEAD" ? undefined : data);
        } catch { notFound(res); }
        return true;
      }
      if (p === "/admin" || p.startsWith("/admin/")) {
        if (!adminOn || !isSecure(req)) { notFound(res); return true; } // админки для посетителей по HTTP не существует
        try { await ensureStore(); await admin(req, res, url); } catch (e) { console.error("admin error", e.message); if (!res.headersSent) json(res, 500, { ok: false, error: "Ошибка сервера" }); }
        return true;
      }
      return false;
    },
  };
}
