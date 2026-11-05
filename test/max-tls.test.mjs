import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import https from "node:https";
import tls from "node:tls";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { X509Certificate } from "node:crypto";
import { makeHttpsFetch, loadTrustedRoot, RU_ROOT_SHA256, RU_ROOT_PATH } from "../src/max-tls.mjs";

const sh = (cwd, ...a) => execFileSync("openssl", a, { cwd, stdio: "pipe" });
function pki() {
  const d = mkdtempSync(join(tmpdir(), "pki-"));
  sh(d, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-subj", "/CN=Test Root CA", "-days", "30", "-addext", "basicConstraints=critical,CA:TRUE");
  sh(d, "req", "-newkey", "rsa:2048", "-nodes", "-keyout", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=localhost");
  writeFileSync(join(d, "ext"), "subjectAltName=DNS:localhost,IP:127.0.0.1\n");
  sh(d, "x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "leaf.pem", "-days", "30", "-extfile", "ext");
  return { d, ca: readFileSync(join(d, "ca.pem"), "utf8"), key: readFileSync(join(d, "leaf.key")), cert: readFileSync(join(d, "leaf.pem")) };
}
const serve = (p, handler) => new Promise((r) => { const s = createServer({ key: p.key, cert: p.cert }, handler); s.listen(0, "127.0.0.1", () => r(s)); });

test("TLS-клиент MAX: доверяет только добавленному корню, проверка сертификата не отключена, токен в заголовке", async () => {
  const p = pki(); let seen = null;
  const srv = await serve(p, (req, res) => { seen = { url: req.url, auth: req.headers.authorization, method: req.method }; let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { seen.body = b; res.writeHead(200, { "content-type": "application/json", "retry-after": "3" }); res.end('{"ok":true}'); }); });
  const url = `https://localhost:${srv.address().port}/me?x=1`;
  try {
    // 1) без корня — отказ (UNABLE_TO_VERIFY_LEAF_SIGNATURE / SELF_SIGNED), запрос не выполняется
    const strict = makeHttpsFetch({ agent: new https.Agent({ ca: [...tls.rootCertificates] }) });
    await assert.rejects(strict(url, { headers: { Authorization: "TOK" } }), (e) => /UNABLE_TO_VERIFY|SELF_SIGNED|DEPTH_ZERO|CERT/.test(e.cause?.code || ""));
    assert.equal(seen, null, "до проверки сертификата запрос на сервер не дошёл");
    // 2) с корнем — успех; заголовок Authorization и тело доходят
    const ok = makeHttpsFetch({ agent: new https.Agent({ ca: [...tls.rootCertificates, p.ca] }) });
    const r = await ok(url, { method: "POST", headers: { Authorization: "TOK", "Content-Type": "application/json" }, body: '{"text":"x"}' });
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true }); assert.equal(r.headers.get("Retry-After"), "3");
    assert.deepEqual({ ...seen }, { url: "/me?x=1", auth: "TOK", method: "POST", body: '{"text":"x"}' });
    // 3) таймаут
    const slow = await serve(p, () => {}); const to = AbortSignal.timeout(150);
    await assert.rejects(ok(`https://localhost:${slow.address().port}/`, { signal: to }), (e) => e.name === "TimeoutError" || e.name === "AbortError"); slow.close();
    // 4) http запрещён
    await assert.rejects(ok("http://localhost/"), /только https/);
  } finally { srv.close(); }
});

test("корневой сертификат Минцифры: проверка отпечатка, признака УЦ и срока; подмена файла отклоняется", () => {
  const p = pki(); const f = join(p.d, "x.pem"); writeFileSync(f, p.ca);
  assert.throws(() => loadTrustedRoot(f), /отпечаток/);
  const fp = new X509Certificate(p.ca).fingerprint256;
  assert.equal(loadTrustedRoot(f, fp), p.ca, "свой отпечаток подходит");
  if (existsSync(RU_ROOT_PATH)) {
    const pem = loadTrustedRoot();
    const c = new X509Certificate(pem); assert.equal(c.fingerprint256.toUpperCase(), RU_ROOT_SHA256); assert.ok(c.ca); assert.match(c.subject, /Russian Trusted Root CA/);
  }
});
