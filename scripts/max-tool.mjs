// Инструмент MAX для обслуживания. Токен ТОЛЬКО из окружения (MAX_BOT_TOKEN), нигде не печатается.
//   me        — GET /me: проверка токена, user_id и username бота, сверка с ожидаемым (EXPECT_USERNAME)
//   discover  — GET /updates: кто написал боту (user_id людей) — для выбора двух получателей
//   test      — отправка тестового сообщения каждому MAX_RECIPIENT_USER_IDS
//   status    — настроено ли (без значений секретов)
import { maxClient, extractUsers, safeBase } from "../src/max.mjs";

const cmd = process.argv[2] || "status";
const token = process.env.MAX_BOT_TOKEN || "";
const base = safeBase(process.env.MAX_API_BASE);
const ids = String(process.env.MAX_RECIPIENT_USER_IDS || "").split(",").map((s) => s.trim()).filter((s) => /^\d{1,20}$/.test(s));
const expect = (process.env.EXPECT_USERNAME || "se14906499_bot").toLowerCase();
const scrub = (s) => (token ? String(s).split(token).join("***") : String(s));
const fail = (m, code = 1) => { console.log(scrub(m)); process.exit(code); };

if (cmd === "status") {
  console.log(`MAX_BOT_TOKEN: ${token ? "задан" : "НЕ задан"}; MAX_RECIPIENT_USER_IDS: ${ids.length} получателей; API: ${base}`);
  process.exit(token && ids.length ? 0 : 2);
}
if (!token) fail("НЕ НАСТРОЕНО: нет MAX_BOT_TOKEN", 2);
const api = maxClient({ token, base, timeoutMs: 15000 });

async function me() {
  try {
    const m = await api.me();
    const uname = String(m.username || "").toLowerCase();
    console.log(`GET /me: ok; бот user_id=${m.user_id}, username=@${m.username || "?"}, имя="${String(m.name || m.first_name || "").slice(0, 40)}", API ${base}`);
    if (uname && uname !== expect && uname !== expect.replace(/^@/, "")) console.log(`ВНИМАНИЕ: username бота (@${m.username}) не совпадает с ожидаемым (@${expect})`);
    else console.log(`username совпадает с ожидаемым @${expect}`);
    return m;
  } catch (e) { fail(`GET /me: ОШИБКА ${e.status || ""} ${e.message}${e.kind ? " [" + e.kind + "]" : ""}`); }
}

if (cmd === "me") { await me(); process.exit(0); }
if (cmd === "discover") {
  const m = await me();
  try {
    const r = await api.updates({ limit: 100, timeout: 0 });
    const users = extractUsers(r.updates, m.user_id);
    console.log(`GET /updates: событий ${(r.updates || []).length}, marker=${r.marker ?? "-"}`);
    if (!users.length) fail("Пока нет людей, написавших боту. Нужно: открыть https://max.ru/" + expect + " и отправить /start (или любое сообщение), затем повторить.", 3);
    users.forEach((u, i) => console.log(`#${i + 1} user_id=${u.user_id} имя="${u.name}" username=${u.username ? "@" + u.username : "-"} событие=${u.via} время=${u.ts ? new Date(u.ts).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "?"}`));
    process.exit(0);
  } catch (e) { fail(`GET /updates: ОШИБКА ${e.status || ""} ${e.message}${e.kind ? " [" + e.kind + "]" : ""}${e.status === 409 || e.status === 400 ? " (возможно, у бота настроен Webhook: polling недоступен)" : ""}`); }
}
if (cmd === "test") {
  if (!ids.length) fail("НЕ НАСТРОЕНО: нет MAX_RECIPIENT_USER_IDS", 2);
  let bad = 0;
  for (const id of ids) {
    try { await api.sendToUser(id, "🔔 FinikFix: проверка связи. Уведомления о заявках подключены. Если вы видите это сообщение, всё работает."); console.log(`получатель ${id}: отправлено (API подтвердил)`); }
    catch (e) { bad++; console.log(`получатель ${id}: ОШИБКА ${e.status || ""} ${e.message}`); }
    await new Promise((r) => setTimeout(r, 700));
  }
  process.exit(bad ? 1 : 0);
}
fail("неизвестная команда: " + cmd, 2);
