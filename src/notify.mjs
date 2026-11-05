// Каналы уведомлений о заявках. Токены берутся только из окружения (секреты), в логи и клиентский код не попадают.
// Telegram: Bot API, метод sendMessage (https://core.telegram.org/bots/api#sendmessage). MAX: НЕ реализован,
// пока нет доступа к документации и подтверждённого бота (см. docs/LEADS.md).

export function telegramChannel({ token, chatId, name = "telegram", fetchImpl = fetch, timeoutMs = 5000, apiBase = "https://api.telegram.org" }) {
  return {
    name,
    async send(text) {
      const res = await fetchImpl(`${apiBase}/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let j = null; try { j = await res.json(); } catch {}
      if (!res.ok || !j?.ok) throw new Error(`telegram ${res.status}${j?.description ? ": " + String(j.description).slice(0, 80) : ""}`); // токен в сообщение не попадает
    },
  };
}

export function channelsFromEnv(env, fetchImpl = fetch) {
  const list = [];
  // TG_CHAT_ID: один id или несколько через запятую; на каждого получателя своя запись доставки (сбой одного не блокирует другого).
  const ids = String(env.TG_CHAT_ID || "").split(",").map((x) => x.trim()).filter((x) => /^-?\d+$/.test(x));
  if (env.TG_BOT_TOKEN) ids.forEach((id, i) => list.push(telegramChannel({ token: env.TG_BOT_TOKEN, chatId: id, apiBase: /^https:\/\/[a-z0-9.\-]+(:\d+)?(\/[\w\-./]*)?$/i.test(env.TG_API_BASE || "") ? env.TG_API_BASE.replace(/\/$/, "") : undefined, name: ids.length > 1 ? `telegram-${i + 1}` : "telegram", fetchImpl })));
  return list;
}

export function leadText(l) {
  const dt = new Date(String(l.created_at || "").replace(" ", "T") || Date.now());
  const when = isNaN(dt) ? "" : dt.toLocaleString("ru-RU", { timeZone: "Asia/Irkutsk", dateStyle: "short", timeStyle: "short" }) + " (Иркутск)";
  return ["Новая заявка на обратный звонок FinikFix", `Имя: ${l.name}`, `Телефон: ${l.phone}`, l.comment ? `Комментарий: ${l.comment}` : "", l.calc ? `Расчёт на сайте: ${l.calc}` : "", l.page ? `Страница: ${l.page}` : "", when ? `Дата: ${when}` : ""].filter(Boolean).join("\n");
}

/** Пробует доставить все ожидающие отправки. Возвращает число доставленных. */
export async function processDue(store, channels, now = Date.now()) {
  const byName = new Map(channels.map((c) => [c.name, c]));
  let ok = 0;
  for (const d of store.dueDeliveries(now)) {
    const ch = byName.get(d.channel); if (!ch) continue;
    const lead = store.getLead(d.lead_id); if (!lead) continue;
    try { await ch.send(leadText(lead)); store.markDelivery(d.id, true); ok++; }
    catch (e) { store.markDelivery(d.id, false, e.message, now + Math.min(3600_000, 30_000 * 2 ** d.attempts)); }
  }
  return ok;
}
