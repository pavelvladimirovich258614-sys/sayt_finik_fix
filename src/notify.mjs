// Каналы уведомлений о заявках. Токены берутся только из окружения (секреты), в логи и клиентский код не попадают.
// Основной канал — MAX (src/max.mjs). Telegram отключён: Bot API недоступен с российского VPS (см. docs/LEADS.md).
import { maxChannel } from "./max.mjs";

export function channelsFromEnv(env, fetchImpl) {
  // Единственный автоматический канал уведомлений — MAX (Telegram Bot API недоступен с российского VPS и отключён).
  // MAX_RECIPIENT_USER_IDS: MAX user_id получателей через запятую; на каждого своя запись доставки.
  const ids = String(env.MAX_RECIPIENT_USER_IDS || "").split(",").map((x) => x.trim()).filter((x) => /^\d{1,20}$/.test(x));
  if (!env.MAX_BOT_TOKEN) return [];
  return [...new Set(ids)].map((id) => maxChannel({ token: env.MAX_BOT_TOKEN, userId: id, base: env.MAX_API_BASE, fetchImpl }));
}

const irk = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("ru-RU", { timeZone: "Asia/Irkutsk", dateStyle: "short", timeStyle: "short" }) + " (Иркутск)"; };
export function leadText(l) {
  let c = {}; try { c = JSON.parse(l.calc || "{}") || {}; } catch { c = { note: String(l.calc || "") }; }
  const calcLine = [c.range, c.note].filter(Boolean).join("; ");
  return ["🔔 НОВАЯ ЗАЯВКА — FINIKFIX", l.id ? `Заявка №${l.id}` : "", `Имя: ${l.name}`, `Телефон: ${l.phone}`, l.comment ? `Комментарий: ${l.comment}` : "", c.device ? `Устройство: ${c.device}` : "", c.service ? `Услуга: ${c.service}` : "", calcLine ? `Расчёт на сайте: ${calcLine}` : "", l.page ? `Страница: ${l.page}` : "", irk(l.created_at) ? `Дата: ${irk(l.created_at)}` : ""].filter(Boolean).join("\n");
}

/** Пробует доставить все ожидающие отправки. Возвращает число доставленных. */
export async function processDue(store, channels, now = Date.now()) {
  const byName = new Map(channels.map((c) => [c.name, c]));
  let ok = 0;
  for (const d of store.dueDeliveries(now)) {
    const ch = byName.get(d.channel); if (!ch) continue;
    const lead = store.getLead(d.lead_id); if (!lead) continue;
    try { await ch.send(leadText(lead)); store.markDelivery(d.id, true); ok++; }
    catch (e) { store.markDelivery(d.id, false, e.message, now + Math.max(Math.min(3600_000, 30_000 * 2 ** d.attempts), (e.retryAfter || 0) * 1000)); }
  }
  return ok;
}
