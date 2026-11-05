// Проверка Telegram-бота. Токен берётся ТОЛЬКО из окружения (TG_BOT_TOKEN), нигде не печатается.
//   node --env-file=/opt/finikfix/shared/.env scripts/telegram-check.mjs          # getMe + проверка чатов (getChat)
//   node --env-file=... scripts/telegram-check.mjs --send                          # + одно тестовое сообщение каждому получателю
const token = process.env.TG_BOT_TOKEN || "", ids = String(process.env.TG_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
const base = /^https:\/\/[a-z0-9.\-]+(:\d+)?(\/[\w\-./]*)?$/i.test(process.env.TG_API_BASE || "") ? process.env.TG_API_BASE.replace(/\/$/, "") : "https://api.telegram.org";
const scrub = (t) => String(t).split(token).join("***");
if (!token || !ids.length) { console.log("НЕ НАСТРОЕНО: нужны TG_BOT_TOKEN и TG_CHAT_ID"); process.exit(2); }
async function api(method, body) {
  try {
    const r = await fetch(`${base}/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok, status: r.status, result: j.result, description: j.description };
  } catch (e) { return { ok: false, status: 0, description: scrub(e.message) + (e.cause ? ` (${scrub(e.cause.code || e.cause.message || e.cause)})` : "") }; }
}
let bad = 0;
const me = await api("getMe");
if (me.ok) console.log(`getMe: ok, бот @${me.result.username}`); else { console.log(`getMe: ОШИБКА ${me.status} ${me.description || ""}`); process.exit(1); }
for (const [i, id] of ids.entries()) {
  const tag = `получатель ${i + 1}`;
  if (process.argv.includes("--send")) {
    const r = await api("sendMessage", { chat_id: id, text: "Проверка связи FinikFix: уведомления о заявках подключены. Если вы видите это сообщение, всё работает." });
    console.log(`${tag}: sendMessage ${r.ok ? "ok (message_id " + r.result.message_id + ")" : "ОШИБКА " + r.status + " " + (r.description || "")}`); if (!r.ok) bad++;
  } else {
    const r = await api("getChat", { chat_id: id });
    console.log(`${tag}: getChat ${r.ok ? "ok" : "ОШИБКА " + r.status + " " + (r.description || "")}`); if (!r.ok) bad++;
  }
}
process.exit(bad ? 1 : 0);
