import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server.mjs";
import { categories, narrow } from "../src/data.mjs";
import { pairTotal } from "../src/pricing.mjs";

const pub = (p) => join(import.meta.dirname, "..", "public", p);
const allHtml = () => {
  const out = [];
  const walk = (d) => readdirSync(d).forEach((n) => { const f = join(d, n); statSync(f).isDirectory() ? walk(f) : f.endsWith(".html") && out.push(f); });
  walk(pub(""));
  return out;
};

test("все страницы собраны", () => {
  for (const s of ["", ...categories.map((c) => c.slug), ...narrow.map((n) => n.slug), "ceny", "o-mastere", "portfolio", "otzyvy", "kontakty", "vosstanovlennaya-tekhnika", "privacy", "consent"])
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

test("API и статика: /api/lead недоступен (503) для любых методов, данные не сохраняются", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const app = createApp({ DATA_DIR: dir });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    assert.equal((await fetch(base + "/")).status, 200);
    assert.equal((await fetch(base + "/remont-xbox/")).status, 200);
    assert.equal((await fetch(base + "/spasibo/")).status, 404);
    assert.equal((await fetch(base + "/nope")).status, 404);
    assert.equal((await fetch(base + "/..%2f..%2fetc/passwd")).status === 200, false);
    const r = await fetch(base + "/api/lead", { method: "POST", body: JSON.stringify({ name: "Иван", phone: "+7 (901) 662-45-89", consent: true }) });
    assert.equal(r.status, 503);
    assert.equal((await fetch(base + "/api/lead")).status, 503);
    assert.equal(existsSync(join(dir, "leads.jsonl")), false);
  } finally { app.closeAllConnections?.(); app.close(); }
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

test("cookie: страница и баннер без выдуманных категорий, метрика не грузится без согласия", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  assert.ok(existsSync(pub("cookies/index.html")));
  assert.match(h, /href="\/cookies\/"/);
  assert.doesNotMatch(h, /mc\.yandex\.ru\/metrika\/tag\.js/);
  const all = allHtml().map((f) => readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(all, /самозанят|применяет НПД|Мой налог/i);
  assert.doesNotMatch(all, /\bИП\b/);
  assert.match(readFileSync(pub("cookies/index.html"), "utf8"), /не устанавливает cookie/);
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

test("юридические страницы в подвале открываются; текст соответствует отсутствию формы", () => {
  const home = readFileSync(pub("index.html"), "utf8");
  for (const p of ["/privacy/", "/consent/", "/cookies/", "/terms/", "/mailing/"]) {
    assert.ok(home.includes(`href="${p}"`), p);
    assert.ok(existsSync(pub(p.slice(1) + "index.html")), p);
  }
  const priv = readFileSync(pub("privacy/index.html"), "utf8");
  assert.match(priv, /нет формы заявки/);
  assert.match(priv, /Telegram, MAX, WhatsApp/);
  for (const f of ["privacy", "consent", "terms", "mailing"]) assert.doesNotMatch(readFileSync(pub(f + "/index.html"), "utf8"), /Postbox|Яндекс\.Облако/i);
  assert.match(readFileSync(pub("mailing/index.html"), "utf8"), /не соглашаетесь получать рекламу/);
});

test("форм заявки нет, кнопки связи на месте: tel, MAX, Telegram", () => {
  const tel = "tel:+79016624589", max = "https://web.max.ru/259685091", tg = "https://t.me/+79016624589";
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8"), rel = f.split("/public/")[1];
    assert.doesNotMatch(h, /<form|id="lead"|Оставить заявку|href="#request"|\/api\/lead|spasibo/, rel);
    if (/admin/.test(rel)) continue;
    for (const u of [tel, max, tg]) assert.ok(h.includes(`href="${u}"`), rel + " " + u);
    assert.match(h, /class="float"[^>]*aria-label="Быстрая связь"/);
    assert.match(h, /aria-label="Написать в MAX"/);
    assert.match(h, /aria-label="Написать в Telegram"/);
  }
  const home = readFileSync(pub("index.html"), "utf8");
  assert.match(home, /Позвонить/); assert.match(home, /Написать в MAX/); assert.match(home, /Написать в Telegram/);
  assert.doesNotMatch(readFileSync(join(import.meta.dirname, "..", "src/client/app.js"), "utf8"), /api\/lead|f-phone|#lead/);
});
