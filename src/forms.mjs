// Публичные формы: отзывы (модерация) и обратный звонок (сохранение + уведомления). Обе выключены, пока не включены в окружении.
import { createHash, timingSafeEqual } from "node:crypto";
import { createLimiter } from "./portfolio/auth.mjs";
import { leadText, processDue } from "./notify.mjs";

const baseHeaders = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY", "Cache-Control": "no-store" };
const strip = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​-‏‪-‮]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, n);
const hasLink = (s) => /(https?:|www\.|\.(ru|com|net|org|su|xyz|top)\b|t\.me\/|@\w{4,})/i.test(s);

export function cleanReview(b) {
  const author = strip(b.name, 60), text = strip(b.text, 1500), rating = Number(b.rating);
  if (b.consent !== true) return { error: "Нужно согласие на обработку и публикацию отзыва" };
  if (author.length < 2) return { error: "Укажите имя" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Поставьте оценку от 1 до 5" };
  if (text.length < 10) return { error: "Напишите отзыв подробнее (не короче 10 символов)" };
  if (hasLink(text) || hasLink(author)) return { error: "Ссылки и контакты в отзыве не принимаются" };
  return { review: { author, rating, body: text } };
}

export function cleanLead(b) {
  const name = strip(b.name, 60), comment = strip(b.comment, 500);
  const digits = String(b.phone ?? "").replace(/\D/g, "");
  const d = digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits.length === 10 ? digits : null;
  if (b.consent !== true) return { error: "Нужно согласие на обработку персональных данных" };
  if (name.length < 2) return { error: "Укажите имя" };
  if (!d || d[0] !== "9" && !/^[3-8]/.test(d[0])) return { error: "Проверьте номер телефона" };
  // Выбранное в калькуляторе: только короткие строки известных полей, хранится как JSON ({device, service, range, note}).
  let calc = "";
  if (b.calc && typeof b.calc === "object") { const o = {}; for (const k of ["device", "service", "range", "note"]) { const v = strip(b.calc[k], 120); if (v) o[k] = v; } if (Object.keys(o).length) calc = JSON.stringify(o); }
  const page = /^\/[a-z0-9\-/]*$/i.test(String(b.page || "")) ? String(b.page).slice(0, 80) : "";
  return { lead: { name, phone: `+7${d}`, comment, calc, page } };
}

export function createForms(env, ensureStore, channels = []) {
  const reviewsOn = env.REVIEWS_FORM === "1";
  const leadsOn = env.LEADS_ENABLED === "1" && channels.length > 0;
  const salt = env.IP_SALT || "finikfix";
  const perMin = Number(env.RATE_LIMIT || 5);
  const revLimiter = createLimiter(perMin, 60_000), leadLimiter = createLimiter(perMin, 60_000);
  const json = (res, code, obj) => { res.writeHead(code, { ...baseHeaders, "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
  const isSecure = (req) => !!req.socket.encrypted || (env.TRUST_PROXY === "1" && req.headers["x-forwarded-proto"] === "https");
  const clientIp = (req) => (env.TRUST_PROXY === "1" && String(req.headers["x-real-ip"] || "").trim()) || req.socket.remoteAddress || "?";
  const ipHash = (req) => createHash("sha256").update(salt + clientIp(req)).digest("hex").slice(0, 24);
  const sameOrigin = (req) => req.headers.origin === `${isSecure(req) ? "https" : "http"}://${req.headers.host}`;
  async function body(req, max = 8192) { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > max) return null; ch.push(c); } try { return JSON.parse(Buffer.concat(ch).toString()); } catch { return null; } }

  async function approvedReviews(store) {
    const rows = store.listReviews({ status: "approved" });
    const pub = (r) => ({ author: r.author, rating: r.rating, text: r.body, date: r.review_date, item: r.item, reply: r.reply, has_photos: !!r.has_photos, kind: r.kind });
    const site = rows.filter((r) => r.source === "site"), avito = rows.filter((r) => r.source === "avito");
    return { site: site.map((r) => ({ ...pub(r), date: r.created_at.slice(0, 10) })), avito: avito.map(pub), siteCount: site.length, siteAvg: site.length ? Math.round((site.reduce((a, r) => a + r.rating, 0) / site.length) * 10) / 10 : null };
  }

  return {
    leadsOn, reviewsOn,
    async handle(req, res, url) {
      const p = url.pathname;
      if (p === "/api/config") { json(res, 200, { reviews: reviewsOn, leads: leadsOn }); return true; }
      if (p === "/api/reviews") {
        if (req.method === "GET") { const store = await ensureStore(); const h = { rating: 4.8, count: 62, distribution: { 5: 58, 4: 0, 3: 1, 2: 0, 1: 3 } }; res.writeHead(200, { ...baseHeaders, "Cache-Control": "public, max-age=30", "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify({ ok: true, avitoStats: h, ...(await approvedReviews(store)) })); return true; }
        if (req.method !== "POST") { res.writeHead(405, baseHeaders); res.end(); return true; }
        if (!reviewsOn) { json(res, 503, { ok: false, error: "Приём отзывов на сайте пока не включён." }); return true; }
        if (!sameOrigin(req)) { json(res, 403, { ok: false, error: "Запрещено" }); return true; }
        if (!/^application\/json/.test(req.headers["content-type"] || "")) { json(res, 415, { ok: false, error: "Неверный формат" }); return true; }
        const ih = ipHash(req);
        if (revLimiter.blocked(ih)) { json(res, 429, { ok: false, error: "Слишком много запросов. Повторите позже." }); return true; }
        revLimiter.fail(ih);
        const b = await body(req); if (!b || typeof b !== "object") { json(res, 400, { ok: false, error: "Неверный запрос" }); return true; }
        if (b.website) { json(res, 200, { ok: true, message: "Спасибо! Отзыв появится после проверки." }); return true; } // honeypot: боту не сообщаем
        const v = cleanReview(b); if (v.error) { json(res, 400, { ok: false, error: v.error }); return true; }
        const store = await ensureStore();
        if (store.recentReviewsByIp(ih, new Date(Date.now() - 86400_000).toISOString()) >= 3) { json(res, 429, { ok: false, error: "С одного адреса можно отправить не больше 3 отзывов в сутки." }); return true; }
        store.addReview({ source: "site", kind: "repair", ...v.review, review_date: "", status: "pending", ip_hash: ih });
        json(res, 201, { ok: true, message: "Спасибо! Отзыв сохранён и появится на сайте после проверки мастером." });
        return true;
      }
      if (p === "/api/lead") {
        if (!leadsOn || req.method !== "POST") { json(res, leadsOn ? 405 : 503, { ok: false, error: "Заявки через сайт не принимаются. Позвоните или напишите в мессенджер." }); return true; }
        if (!sameOrigin(req)) { json(res, 403, { ok: false, error: "Запрещено" }); return true; }
        if (!/^application\/json/.test(req.headers["content-type"] || "")) { json(res, 415, { ok: false, error: "Неверный формат" }); return true; }
        const ih = ipHash(req);
        if (leadLimiter.blocked(ih)) { json(res, 429, { ok: false, error: "Слишком много запросов. Позвоните или повторите позже." }); return true; }
        leadLimiter.fail(ih);
        const b = await body(req); if (!b || typeof b !== "object") { json(res, 400, { ok: false, error: "Неверный запрос" }); return true; }
        if (b.website) { json(res, 200, { ok: true, saved: true, notified: false }); return true; } // honeypot
        const v = cleanLead(b); if (v.error) { json(res, 400, { ok: false, error: v.error }); return true; }
        const store = await ensureStore();
        if (store.recentLeadsByIp(ih, new Date(Date.now() - 3600_000).toISOString()) >= 5) { json(res, 429, { ok: false, error: "Слишком много заявок. Позвоните мастеру." }); return true; }
        const id = store.addLead({ ...v.lead, ip_hash: ih }, channels.map((c) => c.name));
        await processDue(store, channels).catch(() => {});
        const st = store.listLeads().find((l) => l.id === id);
        const notified = st.deliveries.some((d) => d.status === "delivered");
        json(res, 201, { ok: true, saved: true, notified, message: notified ? "Заявка принята. Мастер перезвонит вам." : "Заявка сохранена. Если мастер не перезвонит в рабочее время, позвоните сами." });
        return true;
      }
      return false;
    },
  };
}
