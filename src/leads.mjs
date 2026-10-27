// Приём заявок: сохранение на сервере, доставка уведомлений (email и/или Telegram), очередь повторов.
// Клиенту никогда не сообщается, что письмо доставлено, если это не так: ответ различает «сохранено» и «мастер уведомлён».
import { appendFile, mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { mailConfig, sendMail } from "./mail.mjs";

const oneLine = (s, n) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
export const leadText = (lead, id, at) => `Заявка с сайта FinikFix\nИмя: ${lead.name}\nТелефон: ${lead.phone}\nКатегория: ${lead.category}\nКомментарий: ${lead.comment || "—"}\nСтраница: ${lead.page || "—"}\nВремя: ${at}\nНомер заявки: ${id}`;

async function sendTelegram(env, text) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text }), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error("telegram http " + r.status);
}

export function createLeadService(env, dataDir) {
  const outDir = join(dataDir, "outbox");
  const mail = mailConfig(env);
  const tg = env.TG_BOT_TOKEN && env.TG_CHAT_ID;
  const channels = [...(mail ? ["email"] : []), ...(tg ? ["telegram"] : [])];
  const MAX_ATTEMPTS = Number(env.LEAD_RETRY_MAX || 12);
  const backoff = (n) => Math.min(2 ** n * 60_000, 6 * 3600_000);

  async function deliver(channel, lead, id, at) {
    const text = leadText(lead, id, at);
    if (channel === "email") await sendMail(mail, { subject: `Заявка с сайта FinikFix: ${oneLine(lead.name, 60)}`, text });
    else await sendTelegram(env, text);
  }
  const fileOf = (id, ch) => join(outDir, `${id}.${ch}.json`);
  async function queue(id, ch, lead, at, attempts, err) {
    await mkdir(outDir, { recursive: true, mode: 0o750 });
    await writeFile(fileOf(id, ch), JSON.stringify({ id, channel: ch, lead, at, attempts, nextAt: Date.now() + backoff(attempts), lastError: oneLine(err, 200), dead: attempts >= MAX_ATTEMPTS }), { mode: 0o640 });
  }

  return {
    channels,
    enabled: channels.length > 0,
    /** Сохраняет заявку и пытается уведомить мастера. Бросает Error("no_channel"), если уведомлять некуда. */
    async submit(lead) {
      if (!channels.length) throw new Error("no_channel");
      const id = randomBytes(6).toString("hex"), at = new Date().toISOString();
      await mkdir(dataDir, { recursive: true });
      await appendFile(join(dataDir, "leads.jsonl"), JSON.stringify({ id, ...lead, at }) + "\n");
      const results = await Promise.allSettled(channels.map((ch) => deliver(ch, lead, id, at)));
      let notified = false;
      for (let i = 0; i < channels.length; i++) {
        if (results[i].status === "fulfilled") notified = true;
        else { console.error(`lead ${id}: ${channels[i]} failed: ${oneLine(results[i].reason?.message, 160)}`); await queue(id, channels[i], lead, at, 1, results[i].reason?.message).catch((e) => console.error("outbox write failed", e.message)); }
      }
      return { id, notified };
    },
    /** Повторная отправка неудавшихся уведомлений. Возвращает число отправленных. */
    async retryPending(now = Date.now()) {
      let files; try { files = await readdir(outDir); } catch { return 0; }
      let sent = 0;
      for (const f of files.filter((x) => x.endsWith(".json"))) {
        let job; try { job = JSON.parse(await readFile(join(outDir, f), "utf8")); } catch { continue; }
        if (job.dead || job.nextAt > now || !channels.includes(job.channel)) continue;
        try { await deliver(job.channel, job.lead, job.id, job.at); await unlink(join(outDir, f)); sent++; }
        catch (e) { console.error(`lead ${job.id}: retry ${job.channel} failed: ${oneLine(e.message, 160)}`); await queue(job.id, job.channel, job.lead, job.at, job.attempts + 1, e.message).catch(() => {}); }
      }
      return sent;
    },
    startRetryLoop(ms = 60_000) { const t = setInterval(() => this.retryPending().catch(() => {}), ms); t.unref(); return t; },
  };
}
