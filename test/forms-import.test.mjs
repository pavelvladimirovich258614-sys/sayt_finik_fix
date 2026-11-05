import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server.mjs";
import { openStore } from "../src/portfolio/store.mjs";
import { importCases } from "../src/portfolio/importer.mjs";
import { parseAvito } from "../scripts/parse-avito-reviews.mjs";
import { hashPassword } from "../src/portfolio/auth.mjs";
import { processDue } from "../src/notify.mjs";

const CONTENT = join(import.meta.dirname, "..", "content", "portfolio");
const tmp = () => mkdtempSync(join(tmpdir(), "fff-"));

test("импорт: 10 кейсов, 32 фото, повторный запуск без дублей, данные переживают перезапуск", async () => {
  const dir = tmp(), up = join(dir, "uploads");
  let st = openStore(dir);
  const dry = await importCases({ store: st, uploadDir: up, dir: CONTENT, commit: false });
  assert.equal(st.listAll().length, 0, "dry-run ничего не меняет");
  assert.equal(dry.reduce((a, r) => a + r.added, 0), 32);
  const r1 = await importCases({ store: st, uploadDir: up, dir: CONTENT, commit: true });
  assert.equal(r1.length, 10); assert.equal(r1.reduce((a, r) => a + r.added, 0), 32); assert.ok(r1.every((r) => !r.errors.length && r.published));
  const r2 = await importCases({ store: st, uploadDir: up, dir: CONTENT, commit: true });
  assert.equal(r2.reduce((a, r) => a + r.added, 0), 0); assert.equal(r2.reduce((a, r) => a + r.skipped, 0), 32);
  assert.equal(st.listAll().length, 10); assert.equal(readdirSync(up).length, 32);
  st.close(); st = openStore(dir); // «перезапуск»
  const pub = st.listPublic();
  assert.equal(pub.length, 10); assert.equal(pub.reduce((a, w) => a + w.photos.length, 0), 32);
  const av01 = st.getWorkBySource("AV-01"); assert.equal(av01.photos.length, 4); assert.equal(av01.price_rub, 4500); assert.match(av01.description, /термоинтерфейс/);
  assert.equal(st.getWorkBySource("AV-04").price_rub, 4500); assert.equal(st.getWorkBySource("AV-06").price_rub, 3000);
  assert.notEqual(st.getWorkBySource("AV-04").id, st.getWorkBySource("AV-06").id);
  assert.doesNotMatch(JSON.stringify(pub), /24 месяца/, "гарантия 24 месяца не публикуется (на сайте везде 90 дней)");
  st.close();
});

test("импорт: скрытая админом работа остаётся скрытой, новая пачка и обложка, битый файл не ломает остальное", async () => {
  const dir = tmp(), up = join(dir, "uploads"), src = tmp();
  const manifest = JSON.parse(readFileSync(join(CONTENT, "cases.json")));
  const c = manifest.cases[2]; // AV-03: 1 фото
  mkdirSync(join(src, c.folder)); writeFileSync(join(src, "cases.json"), JSON.stringify({ cases: [{ ...c, expected_photos: 3, files: undefined }] }));
  copyFileSync(join(CONTENT, c.folder, "photo-01.webp"), join(src, c.folder, "photo-01.webp"));
  const st = openStore(dir);
  let r = await importCases({ store: st, uploadDir: up, dir: src, commit: true });
  assert.equal(r[0].published, false, "ожидается 3 фото, загружено 1: не публикуем");
  // вторая пачка: фото другого кейса как новое + битый файл + cover
  copyFileSync(join(CONTENT, "01-zamena-porta-hdmi-ps5", "photo-02.webp"), join(src, c.folder, "cover.webp"));
  writeFileSync(join(src, c.folder, "photo-99.webp"), Buffer.from("not an image"));
  r = await importCases({ store: st, uploadDir: up, dir: src, commit: true });
  assert.equal(r[0].added, 1); assert.equal(r[0].errors.length, 1);
  const w = st.getWorkBySource("AV-03"); assert.equal(w.photos.length, 2);
  assert.equal(st.getWorkBySource("AV-03").photos[0].id, w.photos[0].id);
  assert.equal(st.photoHashes(w.id).size, 2);
  assert.equal(readdirSync(up).length, 2, "файл с ошибкой не оставил мусора");
  st.close();
});

const SAMPLE = `Danzel
1 ноября · Клиент

Сделка состоялась · Инженерный ремонт консолей и геймпадов

Перепаивал разëм hdmi на ps 5


Ремонт цифровой техники
2 ноября

Фото из отзыва
Фото из отзыва
Спасибо большое за отзыв.


Иван
22 октября · Покупатель

Сделка состоялась · Джойстик dualsense

все хорошо


Роман
27 января 2025 · Продавец

Всё прошло хорошо.
`;
test("разбор выгрузки Авито: роли, ответы мастера отдельно, оценки не выдумываются", () => {
  const r = parseAvito(SAMPLE);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.kind), ["repair", "sale", "purchase"]);
  assert.equal(r[0].body, "Перепаивал разëм hdmi на ps 5"); assert.equal(r[0].reply, "Спасибо большое за отзыв."); assert.equal(r[0].has_photos, true);
  assert.ok(r.every((x) => x.rating === null));
  const real = JSON.parse(readFileSync(join(import.meta.dirname, "..", "content", "reviews", "avito-reviews.json"))).reviews;
  assert.equal(real.length, 62); assert.ok(real.every((x) => x.rating === null && x.body));
});

async function boot(extra = {}, opts = {}) {
  const dir = tmp();
  const st0 = openStore(dir); st0.saveAdmin("a@b.ru", await hashPassword("correct horse battery")); st0.close();
  const app = createApp({ DATA_DIR: dir, TRUST_PROXY: "1", ADMIN_ENABLED: "1", RATE_LIMIT: "100", ...extra }, opts);
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const host = `127.0.0.1:${app.address().port}`, base = `http://${host}`;
  const call = (path, { method = "GET", body, origin = true, secure = false, headers = {} } = {}) => fetch(base + path, { method, redirect: "manual", body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), headers: { ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}), ...(secure ? { "X-Forwarded-Proto": "https" } : {}), ...(origin && method !== "GET" ? { Origin: `${secure ? "https" : "http"}://${host}` } : {}), ...headers } });
  return { app, dir, call, close: () => app.close() };
}
const review = (o = {}) => ({ name: "Анна", rating: 5, text: "Отличный мастер, всё починил быстро.", consent: true, ...o });

test("отзывы сайта: выключено по умолчанию, модерация, XSS/спам/CSRF, раздельная статистика", async () => {
  let t = await boot();
  assert.equal((await t.call("/api/reviews", { method: "POST", body: review() })).status, 503); t.close();
  t = await boot({ REVIEWS_FORM: "1" });
  assert.equal((await t.call("/api/reviews", { method: "POST", body: review(), origin: false })).status, 403, "без Origin");
  assert.equal((await t.call("/api/reviews", { method: "POST", body: review({ consent: false }) })).status, 400);
  assert.equal((await t.call("/api/reviews", { method: "POST", body: review({ rating: 7 }) })).status, 400);
  assert.equal((await t.call("/api/reviews", { method: "POST", body: review({ text: "Пишите на spam.ru" }) })).status, 400, "ссылки отклоняются");
  assert.equal((await t.call("/api/reviews", { method: "POST", body: "{bad" , headers: { "Content-Type": "application/json" } })).status, 400);
  const hp = await t.call("/api/reviews", { method: "POST", body: review({ website: "x" }) }); assert.equal(hp.status, 200);
  const ok = await t.call("/api/reviews", { method: "POST", body: review({ name: "<script>alert(1)</script>Аня" }) }); assert.equal(ok.status, 201);
  let pub = await (await t.call("/api/reviews")).json();
  assert.equal(pub.site.length, 0, "до одобрения не публикуется"); assert.equal(pub.avitoStats.count, 62);
  const st = openStore(t.dir); const rows = st.listReviews({ source: "site" }); st.close();
  assert.equal(rows.length, 1, "honeypot ничего не сохранил"); assert.equal(rows[0].status, "pending");
  // одобрение через админку
  const lg = await t.call("/admin/api/login", { method: "POST", secure: true, body: { email: "a@b.ru", password: "correct horse battery" } });
  const { csrf } = await lg.json(); const cookie = lg.headers.get("set-cookie").split(";")[0];
  const noCsrf = await t.call(`/admin/api/reviews/${rows[0].id}/status`, { method: "POST", secure: true, headers: { Cookie: cookie }, body: { status: "approved" } });
  assert.equal(noCsrf.status, 403);
  const ap = await t.call(`/admin/api/reviews/${rows[0].id}/status`, { method: "POST", secure: true, headers: { Cookie: cookie, "X-CSRF-Token": csrf }, body: { status: "approved" } });
  assert.equal(ap.status, 200);
  pub = await (await t.call("/api/reviews")).json();
  assert.equal(pub.site.length, 1); assert.equal(pub.siteCount, 1); assert.equal(pub.siteAvg, 5); assert.equal(pub.avito.length, 0);
  assert.equal(pub.site[0].author, "<script>alert(1)</script>Аня", "хранится как текст; клиент выводит через textContent");
  t.close();
});

test("отзывы: лимит отправок с одного адреса", async () => {
  const t = await boot({ REVIEWS_FORM: "1" });
  const codes = []; for (let i = 0; i < 4; i++) codes.push((await t.call("/api/reviews", { method: "POST", body: review() })).status);
  assert.deepEqual(codes, [201, 201, 201, 429]); t.close();
});

const lead = (o = {}) => ({ name: "Олег", phone: "+7 (901) 111-22-33", comment: "PS5 не включается", consent: true, ...o });
const mockCh = (fail = false) => { const sent = []; return { sent, name: "telegram", send: async (t) => { if (fail) throw new Error("telegram 502"); sent.push(t); } }; };

test("заявки: по умолчанию 503; без каналов 503; без согласия 400", async () => {
  let t = await boot(); assert.equal((await t.call("/api/lead", { method: "POST", body: lead() })).status, 503); t.close();
  t = await boot({ LEADS_ENABLED: "1" }); assert.equal((await t.call("/api/lead", { method: "POST", body: lead() })).status, 503, "нет каналов"); t.close();
  t = await boot({ LEADS_ENABLED: "1" }, { channels: [mockCh()] });
  assert.equal((await t.call("/api/lead", { method: "POST", body: lead({ consent: false }) })).status, 400);
  assert.equal((await t.call("/api/lead", { method: "POST", body: lead({ phone: "123" }) })).status, 400);
  assert.equal((await t.call("/api/lead", { method: "POST", body: lead(), origin: false })).status, 403);
  t.close();
});

test("заявки: доставка в Telegram (мок), параметры калькулятора, honeypot", async () => {
  const ch = mockCh(); const t = await boot({ LEADS_ENABLED: "1" }, { channels: [ch] });
  const r = await t.call("/api/lead", { method: "POST", body: lead({ calc: { device: "PlayStation", service: "Замена HDMI-порта", range: "от 2 500 ₽" }, page: "/#calc" }) });
  const j = await r.json(); assert.equal(r.status, 201); assert.equal(j.saved, true); assert.equal(j.notified, true);
  assert.equal(ch.sent.length, 1); assert.match(ch.sent[0], /\+79011112233/); assert.match(ch.sent[0], /Замена HDMI-порта/);
  const h = await t.call("/api/lead", { method: "POST", body: lead({ website: "bot" }) }); assert.equal(h.status, 200);
  assert.equal(ch.sent.length, 1, "honeypot не уходит в Telegram");
  const st = openStore(t.dir); assert.equal(st.listLeads().length, 1); st.close(); t.close();
});

test("заявки: сбой канала не теряет заявку и не врёт о доставке; повторная отправка доходит", async () => {
  const bad = mockCh(true); const t = await boot({ LEADS_ENABLED: "1" }, { channels: [bad] });
  const r = await t.call("/api/lead", { method: "POST", body: lead() }); const j = await r.json();
  assert.equal(r.status, 201); assert.equal(j.saved, true); assert.equal(j.notified, false); assert.doesNotMatch(j.message, /перезвонит вам\.$/);
  let st = openStore(t.dir); let l = st.listLeads()[0]; assert.equal(l.deliveries[0].status, "pending"); assert.equal(l.deliveries[0].attempts, 1); assert.match(l.deliveries[0].last_error, /502/);
  const good = mockCh(); assert.equal(await processDue(st, [good], Date.now() + 3600_000), 1);
  l = st.listLeads()[0]; assert.equal(l.deliveries[0].status, "delivered"); assert.equal(good.sent.length, 1); st.close(); t.close();
});

test("заявки: лимит частоты", async () => {
  const t = await boot({ LEADS_ENABLED: "1" }, { channels: [mockCh()] });
  const codes = []; for (let i = 0; i < 6; i++) codes.push((await t.call("/api/lead", { method: "POST", body: lead() })).status);
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429]); t.close();
});

test("/api/config отражает включённые функции", async () => {
  let t = await boot(); assert.deepEqual(await (await t.call("/api/config")).json(), { reviews: false, leads: false }); t.close();
  t = await boot({ REVIEWS_FORM: "1", LEADS_ENABLED: "1" }, { channels: [mockCh()] }); assert.deepEqual(await (await t.call("/api/config")).json(), { reviews: true, leads: true }); t.close();
});

test("Telegram: несколько получателей, на каждого своя доставка; токен не попадает в ошибку", async () => {
  const { channelsFromEnv } = await import("../src/notify.mjs");
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: calls.length !== 2, status: 401, json: async () => ({ ok: calls.length !== 2, description: "Unauthorized" }) }; };
  const ch = channelsFromEnv({ TG_BOT_TOKEN: "SECRET:TOKEN", TG_CHAT_ID: "111, 222 ,bad" }, fakeFetch);
  assert.deepEqual(ch.map((c) => c.name), ["telegram-1", "telegram-2"]);
  await ch[0].send("hi");
  assert.equal(calls[0].body.chat_id, "111");
  await assert.rejects(ch[1].send("hi"), (e) => { assert.doesNotMatch(e.message, /SECRET/); return /telegram 401/.test(e.message); });
  assert.deepEqual(channelsFromEnv({ TG_BOT_TOKEN: "x" }).length, 0);
});
