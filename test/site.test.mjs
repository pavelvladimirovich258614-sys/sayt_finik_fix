import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp, validateLead } from "../server.mjs";
import { categories, narrow } from "../src/data.mjs";
import { pairTotal } from "../src/pricing.mjs";
import { signV4, mailConfig, sendMail } from "../src/mail.mjs";
import { createServer } from "node:http";

const pub = (p) => join(import.meta.dirname, "..", "public", p);
const allHtml = () => {
  const out = [];
  const walk = (d) => readdirSync(d).forEach((n) => { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : f.endsWith(".html") && out.push(f); });
  walk(pub(""));
  return out;
};

test("все страницы собраны", () => {
  for (const s of ["", ...categories.map((c) => c.slug), ...narrow.map((n) => n.slug), "ceny", "o-mastere", "portfolio", "otzyvy", "kontakty", "vosstanovlennaya-tekhnika", "privacy", "consent", "spasibo"])
    assert.ok(existsSync(pub(join(s, "index.html"))), s);
});

test("на каждой странице один h1, title и description", () => {
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, f);
    assert.match(h, /<title>.+<\/title>/, f);
    assert.match(h, /<meta name="description"/, f);
  }
});

test("жёсткие правила: гарантия 90 дней, нет 12 месяцев, нет точного адреса", () => {
  const all = allHtml().map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(all.includes("90 дней"));
  assert.ok(!/12 месяцев/.test(all));
  assert.ok(!/ул\.|улица|дом \d/i.test(all.replace(/<script[\s\S]*?<\/script>/g, "")));
  assert.ok(all.includes("не настраиваю интернет на дому") || all.includes("Не настраиваю интернет на дому"));
});

test("форма: чекбокс согласия и ссылки на ПД на страницах с формой", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  assert.match(h, /id="f-ok"/);
  assert.match(h, /href="\/consent\/"/);
});

test("validateLead", () => {
  const ok = { name: "Иван", phone: "+7 (901) 662-45-89", category: "Xbox", comment: "", consent: true };
  assert.ok(validateLead(ok).lead);
  assert.ok(validateLead({ ...ok, consent: false }).error);
  assert.ok(validateLead({ ...ok, phone: "123" }).error);
  assert.ok(validateLead({ ...ok, name: " " }).error);
  assert.equal(validateLead({ ...ok, website: "x" }).error, "spam");
});

test("API и статика: без канала уведомлений заявка не принимается (503)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const app = createApp({ DATA_DIR: dir, RATE_LIMIT: "100" });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    assert.equal((await fetch(base + "/")).status, 200);
    assert.equal((await fetch(base + "/remont-xbox/")).status, 200);
    assert.equal((await fetch(base + "/nope")).status, 404);
    assert.equal((await fetch(base + "/..%2f..%2fetc/passwd")).status === 200, false);
    const post = (b) => fetch(base + "/api/lead", { method: "POST", body: JSON.stringify(b) });
    const good = { name: "Иван", phone: "+7 (901) 662-45-89", category: "Xbox", consent: true };
    const r = await post(good);
    assert.equal(r.status, 503);
    assert.notEqual((await r.json()).ok, true);
    assert.equal((await post({ name: "Иван", phone: "1", consent: true })).status, 400);
    assert.equal((await post({ name: "Иван", phone: "+7 (901) 662-45-89" })).status, 400);
    assert.equal(existsSync(join(dir, "leads.jsonl")), false);
    assert.equal((await fetch(base + "/api/lead")).status, 405);
  } finally { app.closeAllConnections?.(); app.close(); }
});

test("заявки: письмо уходит через Postbox API, при сбое заявка сохраняется и честно помечается", async () => {
  const seen = [];
  let fail = true;
  const mock = createServer((q, r) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => { seen.push({ url: q.url, auth: q.headers.authorization, body: b }); if (fail) { r.writeHead(500); return r.end("boom"); } r.writeHead(200, { "content-type": "application/json" }); r.end('{"MessageId":"m1"}'); }); });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const env = { DATA_DIR: dir, RATE_LIMIT: "100", POSTBOX_ENDPOINT: `http://127.0.0.1:${mock.address().port}`, POSTBOX_KEY_ID: "AKTEST", POSTBOX_SECRET: "secret", MAIL_FROM: "site@example.test", MAIL_TO: "owner@example.test" };
  const app = createApp(env);
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = () => fetch(base + "/api/lead", { method: "POST", body: JSON.stringify({ name: "Иван", phone: "+7 (901) 662-45-89", category: "Xbox", consent: true }) });
  try {
    let j = await (await post()).json();
    assert.equal(j.saved, true); assert.equal(j.notified, false);       // не врём, что письмо доставлено
    assert.match(readFileSync(join(dir, "leads.jsonl"), "utf8"), /Иван/);
    assert.equal(readdirSync(join(dir, "outbox")).length, 1);            // поставлено в очередь повтора
    fail = false;
    j = await (await post()).json();
    assert.equal(j.notified, true);
    assert.equal(seen.at(-1).url, "/v2/email/outbound-emails");
    assert.match(seen.at(-1).auth, /^AWS4-HMAC-SHA256 Credential=AKTEST\/\d{8}\/ru-central1\/ses\/aws4_request/);
    assert.match(JSON.parse(seen.at(-1).body).Destination.ToAddresses[0], /owner@example.test/);
  } finally { app.closeAllConnections?.(); app.close(); mock.closeAllConnections?.(); mock.close(); }
});

test("SigV4: эталонный вектор AWS (get-vanilla)", () => {
  const r = signV4({ method: "GET", path: "/", headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" }, body: "", region: "us-east-1", service: "service", accessKey: "AKIDEXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", amzDate: "20150830T123600Z" });
  assert.equal(r.signature, "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
});

test("mailConfig: без ключей или адресов отправка не настроена", () => {
  assert.equal(mailConfig({}), null);
  assert.equal(mailConfig({ MAIL_TO: "a@b.c", MAIL_FROM: "d@e.f" }), null);
  assert.ok(mailConfig({ MAIL_TO: "a@b.c", MAIL_FROM: "d@e.f", POSTBOX_KEY_ID: "k", POSTBOX_SECRET: "s" }));
});

test("скидка 15% на два аналога: арифметика", () => {
  assert.deepEqual(pairTotal(1500, 1500), { sum: 3000, total: 2550, discount: 450 });
  assert.deepEqual(pairTotal(1000, 2500), { sum: 3500, total: 2975, discount: 525 });
  assert.deepEqual(pairTotal(1000, 1000), { sum: 2000, total: 1700, discount: 300 });
});

test("стики: цена за один аналог от 1 000, единица указана, старой «от 1 800» нет", () => {
  const h = readFileSync(pub("zamena-stika-gamepada/index.html"), "utf8");
  assert.match(h, /за один аналог/);
  assert.match(h, /от 1[\s\u00a0]000/);
  assert.match(h, /−450|-450/);
  for (const k of ["Alps", "JCD", "Vortengle", "K-silver", "Gulikit"]) assert.ok(h.includes(k), k);
  assert.ok(!/не подтвержд/i.test(h));
  const prices = readFileSync(pub("ceny/index.html"), "utf8");
  assert.ok(!/Замена стиков[^<]*1[\s\u00a0]800/.test(prices));
});

test("бесплатная чистка геймпада: только на страницах геймпадов и стиков", () => {
  const re = /внутренняя чистка геймпада — бесплатно/i;
  const withIt = allHtml().filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => f.split("/public/")[1]).sort();
  assert.deepEqual(withIt, ["remont-gamepadov/index.html", "zamena-stika-gamepada/index.html"]);
});

test("cookie: страница, баннер без выдуманных категорий, форма с отдельным непредзаполненным согласием", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  assert.ok(existsSync(pub("cookies/index.html")));
  assert.match(h, /href="\/cookies\/"/);
  assert.doesNotMatch(h, /id="f-ok"[^>]*checked/);
  assert.doesNotMatch(h, /mc\.yandex\.ru\/metrika\/tag\.js/);          // метрика не грузится без согласия
  const all = allHtml().map((f) => readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(all, /самозанят|применяет НПД/i);
  assert.doesNotMatch(all, /\bИП\b/);
});

test("внутренние ссылки и якоря не битые", () => {
  const ids = (h) => new Set([...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    for (const m of h.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
      const [, path, hash] = m;
      if (path === "/" || path.startsWith("/assets/")) { if (path.startsWith("/assets/")) assert.ok(existsSync(pub(path)), `${f}: ${path}`); }
      else assert.ok(existsSync(pub(join(path, "index.html"))), `${f}: ${path}`);
      if (hash && path !== "/" ) { /* якорь на другую страницу */ }
      const target = path === "/" || path === "" ? readFileSync(pub("index.html"), "utf8") : existsSync(pub(join(path, "index.html"))) ? readFileSync(pub(join(path, "index.html")), "utf8") : "";
      if (hash && target) assert.ok(ids(target).has(hash.slice(1)), `${f}: ${path}${hash}`);
    }
    for (const m of h.matchAll(/href="#([^"]+)"/g)) assert.ok(ids(h).has(m[1]), `${f}: #${m[1]}`);
  }
});

test("юридические страницы доступны из подвала и формы", () => {
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    assert.match(h, /href="\/privacy\/"/, f);
    assert.match(h, /href="\/consent\/"/, f);
  }
});

test("слайдер: 6 кадров, первый грузится сразу, файлы на месте", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  assert.equal((h.match(/<figure class="hs-slide[" ]/g) || []).length, 6);
  assert.equal((h.match(/fetchpriority="high"/g) || []).length, 1);
  assert.equal((h.match(/data-src="\/assets\/img\/slides\//g) || []).length, 5);
  assert.equal((h.match(/class="hs-dot"/g) || []).length, 6);
  for (const f of h.match(/\/assets\/img\/(?:slides|cats)\/[\w.-]+\.webp/g) || []) assert.ok(existsSync(pub(f)), f);
});

test("главная: семь категорий со ссылками на существующие страницы", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  const links = [...h.matchAll(/class="cat-card[^"]*" href="\/([\w-]+)\/"/g)].map((m) => m[1]);
  assert.equal(links.length, 7);
  for (const s of links) assert.ok(existsSync(pub(join(s, "index.html"))), s);
});

test("микроскоп упоминается редко, контакты актуальны, MAX не выдуман", () => {
  const all = allHtml().map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok((all.match(/икроскоп/g) || []).length <= 2);
  assert.ok(all.includes("Fil.nikita98@mail.ru"));
  assert.ok(all.includes("https://web.max.ru/259685091"));
  assert.ok(all.includes("Написать в MAX"));
});
