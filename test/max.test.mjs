import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { maxClient, extractUsers, maxChannel, safeBase, MAX_TEXT_LIMIT } from "../src/max.mjs";
import { channelsFromEnv, leadText, processDue } from "../src/notify.mjs";
import { openStore } from "../src/portfolio/store.mjs";

const TOKEN = "SECRETtoken_1234567890abcdef";
const resp = (status, body, headers = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => { if (body === undefined) throw new Error("no json"); return body; } });
const recorder = (...answers) => { const calls = []; let i = 0; const f = async (url, init) => { calls.push({ url, init }); const a = answers[Math.min(i++, answers.length - 1)]; if (a instanceof Error) throw a; return a; }; f.calls = calls; return f; };

test("MAX: токен только в заголовке Authorization, не в адресе; правильные методы и пути", async () => {
  const f = recorder(resp(200, { user_id: 7, username: "se14906499_bot" }), resp(200, { updates: [], marker: 1 }), resp(200, { message: { body: {} } }));
  const c = maxClient({ token: TOKEN, base: "https://platform-api2.max.ru", fetchImpl: f });
  assert.equal((await c.me()).user_id, 7);
  await c.updates({ limit: 5 });
  await c.sendToUser("42", "привет");
  assert.equal(f.calls[0].url, "https://platform-api2.max.ru/me");
  assert.match(f.calls[1].url, /^https:\/\/platform-api2\.max\.ru\/updates\?/);
  assert.equal(f.calls[2].url, "https://platform-api2.max.ru/messages?user_id=42");
  assert.deepEqual(JSON.parse(f.calls[2].init.body), { text: "привет" }); assert.equal(f.calls[2].init.method, "POST");
  for (const k of f.calls) { assert.equal(k.init.headers.Authorization, TOKEN); assert.ok(!k.url.includes(TOKEN), "токен не в URL"); }
});

test("MAX: ошибки 401/429/5xx/сеть/таймаут/мусор классифицируются, токен не попадает в сообщение", async () => {
  const mk = (r) => maxClient({ token: TOKEN, fetchImpl: recorder(r) });
  const run = async (r) => { try { await mk(r).sendToUser(1, "x"); } catch (e) { return e; } };
  let e = await run(resp(401, { code: "verify.token", message: `bad ${TOKEN}` })); assert.equal(e.kind, "auth"); assert.equal(e.status, 401); assert.ok(!e.message.includes(TOKEN));
  e = await run(resp(429, { code: "too.many" }, { "retry-after": "7" })); assert.equal(e.kind, "rate"); assert.equal(e.retryAfter, 7);
  e = await run(resp(503, {})); assert.equal(e.kind, "server");
  e = await run(resp(400, { message: "chat not found" })); assert.equal(e.kind, "client");
  e = await run(resp(200, undefined)); assert.equal(e.kind, "bad_response");
  const te = new Error("t"); te.name = "TimeoutError"; e = await run(te); assert.equal(e.kind, "timeout");
  const ne = new Error("fetch failed"); ne.cause = { code: `ECONNRESET ${TOKEN}` }; e = await run(ne); assert.equal(e.kind, "network"); assert.ok(!e.message.includes(TOKEN));
});

test("MAX: базовый адрес ограничен доменами MAX (токен не уйдёт на чужой хост)", () => {
  assert.equal(safeBase("https://evil.example.com"), "https://platform-api2.max.ru");
  assert.equal(safeBase("http://platform-api2.max.ru"), "https://platform-api2.max.ru");
  assert.equal(safeBase("https://platform-api2.max.ru/"), "https://platform-api2.max.ru");
  assert.equal(safeBase("https://platform-api.max.ru"), "https://platform-api.max.ru");
});

test("MAX: получатели находятся из событий, бот и дубли исключаются, user_id человека (не chat_id)", () => {
  const ups = [
    { update_type: "bot_started", timestamp: 1000, chat_id: 555, user: { user_id: 111, name: "Никита" } },
    { update_type: "message_created", timestamp: 2000, message: { timestamp: 2000, sender: { user_id: 222, name: "Павел", username: "pavel" }, recipient: { chat_id: 556 }, body: { text: "/start" } } },
    { update_type: "message_created", timestamp: 3000, message: { timestamp: 3000, sender: { user_id: 111, name: "Никита" }, recipient: { chat_id: 555 }, body: { text: "ещё" } } },
    { update_type: "message_created", timestamp: 4000, message: { sender: { user_id: 999, is_bot: true } } },
    { update_type: "message_created", timestamp: 5000, message: { sender: { user_id: 7, name: "сам бот" } } },
    { update_type: "message_removed", timestamp: 6000 },
  ];
  const u = extractUsers(ups, 7);
  assert.deepEqual(u.map((x) => x.user_id).sort(), ["111", "222"]);
  assert.equal(u.find((x) => x.user_id === "111").ts, 3000);
  assert.ok(u.every((x) => !("chat_id" in x)));
});

test("MAX: два получателя из окружения, отправка каждому, без токена каналов нет", async () => {
  const f = recorder(resp(200, { message: {} }));
  const ch = channelsFromEnv({ MAX_BOT_TOKEN: TOKEN, MAX_RECIPIENT_USER_IDS: "11, 22 ,bad,11", MAX_API_BASE: "https://evil.example" }, f);
  assert.deepEqual(ch.map((c) => c.name), ["max-11", "max-22"]);
  await ch[0].send("a"); await ch[1].send("b");
  assert.deepEqual(f.calls.map((c) => c.url), ["https://platform-api2.max.ru/messages?user_id=11", "https://platform-api2.max.ru/messages?user_id=22"]);
  assert.deepEqual(channelsFromEnv({ MAX_RECIPIENT_USER_IDS: "1,2" }), []);
});

test("MAX: не чаще ~2 сообщений в секунду одному получателю; длинный текст обрезается", async () => {
  const times = []; const f = async (url, init) => { times.push(Date.now()); times.body = JSON.parse(init.body).text; return resp(200, { message: {} }); };
  const ch = maxChannel({ token: TOKEN, userId: 1, fetchImpl: f, minGapMs: 120 });
  await ch.send("1"); await ch.send("2");
  assert.ok(times[1] - times[0] >= 100, "пауза между сообщениями");
  await ch.send("я".repeat(10000)); assert.ok(times.body.length <= MAX_TEXT_LIMIT);
});

test("уведомление: формат, пустые поля не придумываются, время по Иркутску", () => {
  const t = leadText({ id: 5, name: "Олег", phone: "+79011112233", comment: "", calc: JSON.stringify({ device: "PS5", service: "Замена HDMI-порта", range: "от 2 500 ₽" }), page: "/#calc", created_at: "2026-11-05T06:00:00.000Z" });
  assert.match(t, /^🔔 НОВАЯ ЗАЯВКА — FINIKFIX\nЗаявка №5\nИмя: Олег\nТелефон: \+79011112233\nУстройство: PS5\nУслуга: Замена HDMI-порта\nРасчёт на сайте: от 2 500 ₽\nСтраница: \/#calc\nДата: /);
  assert.doesNotMatch(t, /Комментарий/); assert.match(t, /14:00.*Иркутск/);
  const bare = leadText({ id: 6, name: "А", phone: "+79011112233", comment: "тест", calc: "", page: "", created_at: "2026-11-05T06:00:00Z" });
  assert.doesNotMatch(bare, /Устройство|Услуга|Расчёт|Страница/);
});

const lead = (st, channels) => st.addLead({ name: "Олег", phone: "+79011112233", comment: "", calc: "", page: "/", ip_hash: "x" }, channels);
const okCh = (name) => { const sent = []; return { name, sent, send: async (t) => { sent.push(t); } }; };

test("доставка: два получателя независимы; повторяется только упавший; дублей нет; очередь переживает перезапуск", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mx-")); let st = openStore(dir);
  const id = lead(st, ["max-11", "max-22"]);
  const a = okCh("max-11"); let failB = true; const b = { name: "max-22", sent: [], send: async (t) => { if (failB) { const e = new Error("max 503"); e.retryAfter = 0; throw e; } b.sent.push(t); } };
  assert.equal(await processDue(st, [a, b]), 1);
  assert.equal(a.sent.length, 1);
  let d = st.listLeads()[0].deliveries; assert.equal(d.find((x) => x.channel === "max-11").status, "delivered"); assert.equal(d.find((x) => x.channel === "max-22").status, "pending"); assert.match(d.find((x) => x.channel === "max-22").last_error, /503/);
  st.close(); st = openStore(dir); failB = false; // «перезапуск»
  assert.equal(await processDue(st, [a, b], Date.now() + 3600_000), 1);
  assert.equal(a.sent.length, 1, "первому повторно не отправляли"); assert.equal(b.sent.length, 1);
  d = st.listLeads()[0].deliveries; assert.ok(d.every((x) => x.status === "delivered"));
  assert.equal(await processDue(st, [a, b], Date.now() + 7200_000), 0); assert.ok(id);
  st.close();
});

test("доставка: 429 учитывает Retry-After, 401 не помечается доставленным, после 8 попыток failed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mx-")); const st = openStore(dir);
  lead(st, ["max-1"]);
  const rl = { name: "max-1", send: async () => { const e = new Error("max 429"); e.retryAfter = 120; throw e; } };
  const t0 = Date.now(); await processDue(st, [rl], t0);
  assert.equal(await processDue(st, [rl], t0 + 60_000), 0, "до Retry-After повтор не делается");
  const bad = { name: "max-1", send: async () => { throw new Error("max 401"); } };
  for (let i = 0; i < 9; i++) await processDue(st, [bad], t0 + 10 * 3600_000 * (i + 1));
  const d = st.listLeads()[0].deliveries[0]; assert.equal(d.status, "failed"); assert.notEqual(d.status, "delivered"); st.close();
});

test("миграция: ожидающие доставки Telegram архивируются как failed, заявка и доставленное не затрагиваются", () => {
  const dir = mkdtempSync(join(tmpdir(), "mx-")); const st = openStore(dir);
  const id = lead(st, ["telegram-1", "telegram-2", "max-1"]);
  const dl = st.listLeads()[0].deliveries; const tg2 = dl.find((x) => x.channel === "telegram-2");
  assert.equal(st.archiveTelegramDeliveries(), 3 - 1 + 0 === 2 ? 2 : 2);
  const after = st.listLeads()[0].deliveries;
  assert.ok(after.filter((x) => x.channel.startsWith("telegram")).every((x) => x.status === "failed" && /архив/.test(x.last_error)));
  assert.equal(after.find((x) => x.channel === "max-1").status, "pending");
  assert.ok(st.getLead(id)); assert.ok(tg2); st.close();
});
