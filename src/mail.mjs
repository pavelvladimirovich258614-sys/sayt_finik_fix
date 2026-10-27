// Отправка писем через HTTPS API Yandex Cloud Postbox (совместим с AWS SES v2). Без зависимостей.
// Аутентификация по документации Postbox: либо статический ключ сервисного аккаунта с подписью AWS Signature V4
// (регион ru-central1, сервис ses), либо IAM-токен в заголовке X-YaCloud-SubjectToken (живёт ~12 часов, для постоянной работы не подходит).
import { createHash, createHmac } from "node:crypto";

const sha256hex = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (key, d) => createHmac("sha256", key).update(d).digest();

/** Подпись AWS Signature V4. headers: объект заголовков для подписи (включая host и x-amz-date). */
export function signV4({ method, path, query = "", headers, body = "", region, service, accessKey, secretKey, amzDate }) {
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, " ")]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonical = [method, path, query, canonicalHeaders, signedHeaders, sha256hex(body)].join("\n");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac("AWS4" + secretKey, date), region), service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  return { signature, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/** Настройки почты из окружения или null, если отправка не настроена. */
export function mailConfig(env) {
  const to = String(env.MAIL_TO || "").trim(), from = String(env.MAIL_FROM || "").trim();
  const keyId = env.POSTBOX_KEY_ID, secret = env.POSTBOX_SECRET, iam = env.POSTBOX_IAM_TOKEN;
  if (!to || !from || !((keyId && secret) || iam)) return null;
  return { endpoint: (env.POSTBOX_ENDPOINT || "https://postbox.cloud.yandex.net").replace(/\/$/, ""), region: env.POSTBOX_REGION || "ru-central1", keyId, secret, iam, from, to };
}

const oneLine = (s, n) => String(s).replace(/[\r\n\u0000-\u001f]+/g, " ").trim().slice(0, n);

/** Отправляет простое текстовое письмо. Бросает Error при любом сбое; текст ошибки не содержит ключей и персональных данных. */
export async function sendMail(cfg, { subject, text }) {
  const url = new URL(cfg.endpoint + "/v2/email/outbound-emails");
  const body = JSON.stringify({
    FromEmailAddress: cfg.from,
    Destination: { ToAddresses: [cfg.to] },
    Content: { Simple: { Subject: { Data: oneLine(subject, 200), Charset: "UTF-8" }, Body: { Text: { Data: String(text).slice(0, 20000), Charset: "UTF-8" } } } },
  });
  const headers = { "content-type": "application/json", host: url.host };
  if (cfg.keyId && cfg.secret) {
    const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const { authorization } = signV4({ method: "POST", path: url.pathname, headers: { ...headers, "x-amz-date": amzDate }, body, region: cfg.region, service: "ses", accessKey: cfg.keyId, secretKey: cfg.secret, amzDate });
    headers["x-amz-date"] = amzDate; headers.authorization = authorization;
  } else headers["x-yacloud-subjecttoken"] = cfg.iam;
  delete headers.host; // fetch выставит Host сам
  let res;
  try { res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) }); }
  catch (e) { throw new Error("mail network: " + (e.cause?.code || e.name || "error")); }
  if (!res.ok) {
    const t = (await res.text().catch(() => "")).slice(0, 300).replace(/\s+/g, " ");
    throw new Error(`mail http ${res.status}${t ? ": " + t : ""}`);
  }
  const j = await res.json().catch(() => ({}));
  return { messageId: j.MessageId || null };
}
