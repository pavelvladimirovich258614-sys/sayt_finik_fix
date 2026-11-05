// HTTPS-клиент для MAX API с доверием к российскому корневому сертификату (Минцифры) ТОЛЬКО для этих запросов.
// Проверка TLS не отключается: к системным/встроенным корням Node добавляется один корень, чей SHA-256 отпечаток зашит ниже.
import https from "node:https";
import tls from "node:tls";
import { readFileSync, existsSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// «Russian Trusted Root CA», Министерство цифрового развития (официальный файл gu-st.ru). Владелец сверяет отпечаток с https://www.gosuslugi.ru/crt.
export const RU_ROOT_SHA256 = "D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31";
export const RU_ROOT_PATH = join(dirname(fileURLToPath(import.meta.url)), "certs", "russian-trusted-root-ca.pem");

/** Читает и проверяет сертификат: отпечаток, признак УЦ, срок действия. Бросает ошибку при несоответствии. */
export function loadTrustedRoot(path = RU_ROOT_PATH, expectedFp = RU_ROOT_SHA256) {
  const pem = readFileSync(path, "utf8");
  const c = new X509Certificate(pem);
  if (c.fingerprint256.toUpperCase() !== expectedFp.toUpperCase()) throw new Error("max-tls: отпечаток корневого сертификата не совпал, файл не используется");
  if (!c.ca) throw new Error("max-tls: сертификат не является центром сертификации");
  if (new Date(c.validTo) < new Date()) throw new Error("max-tls: корневой сертификат просрочен");
  return pem;
}

let cachedAgent = null;
function defaultAgent() {
  if (cachedAgent) return cachedAgent;
  const ca = [...tls.rootCertificates];
  if (existsSync(RU_ROOT_PATH)) ca.push(loadTrustedRoot());
  cachedAgent = new https.Agent({ ca, keepAlive: false });
  return cachedAgent;
}

/** fetch-совместимая функция поверх node:https: (url, {method, headers, body, signal}) -> {ok, status, headers:{get}, json()} */
export function makeHttpsFetch({ agent } = {}) {
  return function httpsFetch(url, init = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      if (u.protocol !== "https:") return reject(new Error("max-tls: только https"));
      const req = https.request(u, { method: init.method || "GET", headers: init.headers || {}, agent: agent || defaultAgent(), signal: init.signal }, (res) => {
        const chunks = []; let n = 0;
        res.on("data", (d) => { n += d.length; if (n > 1_000_000) { req.destroy(new Error("max-tls: слишком большой ответ")); return; } chunks.push(d); });
        res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, headers: { get: (k) => { const v = res.headers[String(k).toLowerCase()]; return Array.isArray(v) ? v[0] : v ?? null; } }, json: async () => JSON.parse(text), text: async () => text }); });
        res.on("error", reject);
      });
      req.on("error", (e) => { const err = new Error(e.message); err.cause = { code: e.code }; err.name = e.name === "AbortError" ? "TimeoutError" : e.name; reject(err); });
      if (init.body) req.write(init.body);
      req.end();
    });
  };
}
