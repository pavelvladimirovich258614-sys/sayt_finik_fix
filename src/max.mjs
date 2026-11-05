// Клиент MAX Bot API (https://dev.max.ru/docs-api): GET /me, GET /updates, POST /messages?user_id=.
// Токен передаётся только в заголовке Authorization (никогда в query), в ошибки и журналы не попадает.
export const MAX_DEFAULT_BASE = "https://platform-api2.max.ru";
export const MAX_TEXT_LIMIT = 3900; // лимит текста сообщения в API 4000 символов, запас на служебные символы

export const safeBase = (v) => (/^https:\/\/platform-api[0-9]*\.max\.ru$/i.test(String(v || "").replace(/\/$/, "")) ? String(v).replace(/\/$/, "") : MAX_DEFAULT_BASE);

export function maxClient({ token, base = MAX_DEFAULT_BASE, fetchImpl = fetch, timeoutMs = 8000 }) {
  const scrub = (s) => (token ? String(s).split(token).join("***") : String(s));
  async function call(method, path, { query, body } = {}) {
    const qs = query ? "?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== "")).toString() : "";
    let res;
    try {
      res = await fetchImpl(`${base}${path}${qs}`, { method, headers: { Authorization: token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const code = e?.cause?.code || e?.name || "network";
      const err = new Error(`max сеть: ${scrub(code)}`); err.kind = e?.name === "TimeoutError" ? "timeout" : "network"; throw err;
    }
    let j = null; try { j = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(`max ${res.status}${j?.code ? " " + String(j.code).slice(0, 40) : ""}${j?.message ? ": " + scrub(String(j.message)).slice(0, 80) : ""}`);
      err.status = res.status; err.retryAfter = Number(res.headers?.get?.("retry-after")) || 0; err.kind = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate" : res.status >= 500 ? "server" : "client"; throw err;
    }
    if (j === null || typeof j !== "object") { const err = new Error("max: некорректный ответ API"); err.kind = "bad_response"; throw err; }
    return j;
  }
  return {
    me: () => call("GET", "/me"),
    updates: ({ marker, types = "message_created,bot_started", limit = 100, timeout = 0 } = {}) => call("GET", "/updates", { query: { marker, types, limit, timeout } }),
    sendToUser: (userId, text) => call("POST", "/messages", { query: { user_id: String(userId) }, body: { text: String(text).slice(0, MAX_TEXT_LIMIT) } }),
  };
}

/** Из событий /updates достаём авторов (user_id людей, не бота). Только минимум для сверки: id, имя, username, время. */
export function extractUsers(updates, botUserId) {
  const found = new Map();
  for (const u of updates || []) {
    let usr = null, ts = u.timestamp;
    if (u.update_type === "bot_started") usr = u.user;
    else if (u.update_type === "message_created") { usr = u.message?.sender; ts = u.message?.timestamp ?? ts; }
    if (!usr || usr.user_id == null || String(usr.user_id) === String(botUserId) || usr.is_bot) continue;
    const id = String(usr.user_id);
    const prev = found.get(id);
    if (!prev || (ts || 0) > prev.ts) found.set(id, { user_id: id, name: String(usr.name || [usr.first_name, usr.last_name].filter(Boolean).join(" ") || "").slice(0, 60), username: usr.username ? String(usr.username).slice(0, 40) : "", ts: ts || 0, via: u.update_type });
  }
  return [...found.values()].sort((a, b) => b.ts - a.ts);
}

/** Канал уведомлений: { name, send(text) } для src/notify.mjs. Не чаще ~2 сообщений в секунду одному получателю. */
export function maxChannel({ token, userId, base, fetchImpl, timeoutMs, minGapMs = 600 }) {
  const client = maxClient({ token, base: safeBase(base), fetchImpl, timeoutMs });
  let last = 0;
  return {
    name: `max-${userId}`,
    async send(text) {
      const wait = last + minGapMs - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      const r = await client.sendToUser(userId, text);
      if (!r || (!r.message && r.success === false)) throw new Error("max: сообщение не подтверждено API");
    },
  };
}
