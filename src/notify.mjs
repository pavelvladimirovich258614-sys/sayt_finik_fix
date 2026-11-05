// Каналы уведомлений о заявках. Токены берутся только из окружения (секреты), в логи и клиентский код не попадают.
// Telegram: Bot API, метод sendMessage (https://core.telegram.org/bots/api#sendmessage). MAX: НЕ реализован,
// пока нет доступа к документации и подтверждённого бота (см. docs/LEADS.md).

export function telegramChannel({ token, chatId, fetchImpl = fetch, timeoutMs = 5000 }) {
  return {
    name: "telegram",
    async send(text) {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
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
  if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) list.push(telegramChannel({ token: env.TG_BOT_TOKEN, chatId: env.TG_CHAT_ID, fetchImpl }));
  return list;
}

export function leadText(l) {
  return ["Новая заявка на обратный звонок FinikFix", `Имя: ${l.name}`, `Телефон: ${l.phone}`, l.comment ? `Комментарий: ${l.comment}` : "", l.calc ? `Калькулятор: ${l.calc}` : "", l.page ? `Страница: ${l.page}` : ""].filter(Boolean).join("\n");
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
