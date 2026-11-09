import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server.mjs";
import { categories, narrow, heroSlides } from "../src/data.mjs";
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
  assert.ok(!/нтернет/.test(all.replace(/<script[\s\S]*?<\/script>/g, "")), "решение Никиты 2026-11-09: упоминаний про настройку интернета нет");
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

test("стики: цена за один аналог фиксированная, единица указана, типы по прайсу Никиты", () => {
  const h = readFileSync(pub("zamena-stika-gamepada/index.html"), "utf8");
  assert.match(h, /за один аналог/);
  assert.match(h, /−525|-525/);
  for (const k of ["Original", "JCD", "Hall", "TMR K-Silver", "Gulikit"]) assert.ok(h.includes(k), k);
  for (const old of ["Alps", "Vortengle", "K-silver"]) assert.ok(!h.includes(old), old);
  assert.ok(!/не подтвержд/i.test(h));
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
      if (path === "/" || path.startsWith("/assets/")) { if (path.startsWith("/assets/")) assert.ok(existsSync(pub(path.split("?")[0])), `${f}: ${path}`); }
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

test("юридические страницы в подвале открываются; тексты описывают формы обратного звонка и отзыва", () => {
  const home = readFileSync(pub("index.html"), "utf8");
  for (const p of ["/privacy/", "/consent/", "/cookies/", "/terms/", "/mailing/"]) {
    assert.ok(home.includes(`href="${p}"`), p);
    assert.ok(existsSync(pub(p.slice(1) + "index.html")), p);
  }
  const priv = readFileSync(pub("privacy/index.html"), "utf8");
  assert.match(priv, /обратный звонок/); assert.match(priv, /Telegram Bot API/); assert.match(priv, /трансграничн/); assert.doesNotMatch(priv, /нет формы заявки/);
  assert.match(priv, /Telegram, MAX, WhatsApp/);
  for (const f of ["privacy", "consent", "terms", "mailing"]) assert.doesNotMatch(readFileSync(pub(f + "/index.html"), "utf8"), /Postbox|Яндекс\.Облако/i);
  assert.match(readFileSync(pub("mailing/index.html"), "utf8"), /не соглашаетесь получать рекламу/);
});

test("прямые кнопки связи на месте: tel, MAX, Telegram; форма обратного звонка только штатная и скрытая до включения", () => {
  const tel = "tel:+79016624589", max = "https://web.max.ru/259685091", tg = "https://t.me/+79016624589";
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8"), rel = f.split("/public/")[1];
    assert.doesNotMatch(h, /id="lead"|href="#request"|\/api\/lead|spasibo|mailto:[^"]*\?subject/, rel);
    for (const m of h.matchAll(/<form[^>]*>/g)) assert.match(m[0], /id="(cb-form|rv-form)"/, rel + " неожиданная форма");
    if (!/admin/.test(rel)) { assert.match(h, /<button[^>]*data-cb hidden/, rel + " кнопка заявки скрыта до включения"); assert.match(h, /class="mbar"/, rel); assert.match(h, /name="consent" required/, rel); }
    if (/admin/.test(rel)) continue;
    for (const u of [tel, max, tg]) assert.ok(h.includes(`href="${u}"`), rel + " " + u);
    assert.match(h, /class="float"[^>]*aria-label="Быстрая связь"/);
    assert.match(h, /aria-label="Написать в MAX"/);
    assert.match(h, /aria-label="Написать в Telegram"/);
  }
  const home = readFileSync(pub("index.html"), "utf8");
  assert.match(home, /Позвонить/); assert.match(home, /Написать в MAX/); assert.match(home, /Написать в Telegram/);
  assert.doesNotMatch(readFileSync(join(import.meta.dirname, "..", "src/client/app.js"), "utf8"), /f-phone|#lead/);
  const app = readFileSync(join(import.meta.dirname, "..", "src/client/app.js"), "utf8");
  assert.ok(!/email|mailto/i.test(app), "отправки на email нет");
});

const webpSize = (f) => {
  const b = readFileSync(f); assert.equal(b.toString("ascii", 0, 4), "RIFF"); assert.equal(b.toString("ascii", 8, 12), "WEBP");
  const t = b.toString("ascii", 12, 16);
  if (t === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (t === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (t === "VP8L") { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  throw new Error("webp?");
};

test("слайдер: HD 2560×1440 лежит рядом с оригиналом, srcset и резерв на месте", () => {
  const root = join(import.meta.dirname, "..");
  const home = readFileSync(pub("index.html"), "utf8");
  for (const s of heroSlides) {
    const o = join(root, "src/assets/img/slides", s.file), h = join(root, "src/assets/img/slides-hq", s.file);
    assert.equal(webpSize(o)[0], s.w, "ширина оригинала в data.mjs: " + s.file);
    assert.deepEqual(webpSize(h), [2560, 1440], s.file);
    assert.ok(existsSync(pub("assets/img/slides/" + s.file)) && existsSync(pub("assets/img/slides-hq/" + s.file)), s.file);
    assert.ok(home.includes(`slides-hq/${s.file}?v=`) && home.includes(` ${s.w}w`) && home.includes(" 2560w"), s.file);
  }
  assert.equal((home.match(/data-orig="/g) || []).length, 6);
  assert.match(home, /<img src="[^"]*slides\/slide-01[^>]*fetchpriority="high"/);
  const js = readFileSync(join(root, "src/client/app.js"), "utf8");
  assert.doesNotMatch(js, /mouseenter/, "мышь не должна останавливать слайдер");
  assert.match(js, /data-orig/);
});

test("версионные адреса картинок кэшируются надолго", async () => {
  const app = createApp({ DATA_DIR: mkdtempSync(join(tmpdir(), "ff-")) });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  try {
    const m = readFileSync(pub("index.html"), "utf8").match(/\/assets\/img\/slides-hq\/slide-01-playstation\.webp\?v=\w+/)[0];
    const r = await fetch(`http://127.0.0.1:${app.address().port}${m}`);
    assert.equal(r.status, 200); assert.match(r.headers.get("cache-control"), /immutable/); assert.equal(r.headers.get("content-type"), "image/webp");
  } finally { app.closeAllConnections?.(); app.close(); }
});

test("кривые адреса не роняют сервер (400, процесс жив)", async () => {
  const net = await import("node:net");
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const app = createApp({ DATA_DIR: dir });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const port = app.address().port;
  const raw = (path) => new Promise((res) => { const s = net.connect(port, "127.0.0.1", () => s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`)); let b = ""; s.on("data", (d) => (b += d)); s.on("close", () => res(b.split(" ")[1])); });
  try {
    assert.equal(await raw("//interactsh.com%2f.."), "400");
    assert.ok(["400", "404"].includes(await raw("//x//y")));
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200, "сервер жив после плохих запросов");
  } finally { app.closeAllConnections?.(); app.close(); }
});

test("CSS и JS подключены с версией (иначе кэш на сутки держит старые стили)", () => {
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    assert.ok(!/href="\/assets\/style\.css"/.test(h) && !/src="\/assets\/app\.js"/.test(h), `${f}: без ?v=`);
    assert.match(h, /\/assets\/style\.css\?v=[0-9a-f]{8}"/, f);
  }
});

test("главная: новый H1, подзаголовок, две основные кнопки, микротекст", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  const h1 = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(h1, "Ремонт консолей, геймпадов, смартфонов и ноутбуков в Ангарске и Иркутске — бесплатная диагностика, гарантия до 90 дней");
  assert.ok(h.includes("Не включается Xbox? Дрифтит стик на DualSense? Перегревается PS5? Починю за один визит — с прозрачной ценой и гарантией. Работаю с PlayStation, Xbox, Nintendo, геймпадами, ноутбуками, ПК и смартфонами."));
  assert.ok(!h.includes("Моя основная специализация"));
  const cta = h.match(/<div class="hero-cta[\s\S]*?<\/div>/)[0];
  assert.match(cta, /<button[^>]*data-cb[^>]*>[\s\S]*Оставить заявку/);
  assert.match(cta, /href="tel:\+79016624589"[\s\S]*Позвонить: \+7 \(901\) 662-45-89/);
  assert.ok(h.includes("Бесплатная диагностика при согласии на ремонт (при отказе — 1 000 ₽, выдаю акт дефектации). Выезд по договорённости."));
  assert.match(h, /<title>Ремонт консолей, геймпадов, смартфонов и ноутбуков в Ангарске и Иркутске/);
});

test("главная: шесть карточек «Почему мне доверяют ремонт» и кнопка к калькулятору", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  assert.ok(h.includes("Почему мне доверяют ремонт"));
  assert.equal((h.match(/class="card trust-card/g) || []).length, 6);
  for (const t of ["Специализируюсь на игровой технике", "Гарантия до 90 дней", "Прозрачные цены без сюрпризов", "Быстро и удобно", "Профессиональное оборудование", "Скупка техники в любом состоянии"]) assert.ok(h.includes(t), t);
  assert.match(h, /<a class="btn" href="#calc"[^>]*>Узнать стоимость ремонта<\/a>/);
  assert.equal((h.match(/id="calc"/g) || []).length, 1, "второго калькулятора нет");
});

test("MAX: везде один фирменный значок (растр 1:1) или горизонтальный логотип, самодельных SVG нет", () => {
  const pub1 = (p) => existsSync(pub(p));
  assert.ok(pub1("assets/img/brand/max-icon.webp") && pub1("assets/img/brand/max-logo.webp"));
  const src = ["src/icons.mjs", "src/templates.mjs", "src/client/style.css"].map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(!/ffmx|MAX_MARK|bi-max"[^>]*viewBox/.test(src), "старый SVG-значок MAX удалён");
  let iconCount = 0;
  for (const f of allHtml()) {
    const h = readFileSync(f, "utf8");
    assert.ok(!/<svg[^>]*bi-max/.test(h) && !h.includes("ffmx"), f);
    for (const m of h.matchAll(/(?:src)="(\/assets\/img\/brand\/[^"]+)"/g)) {
      assert.match(m[1], /^\/assets\/img\/brand\/max-(icon|logo)\.webp\?v=[0-9a-f]{8}$/, f);
      assert.ok(existsSync(pub(m[1].split("?")[0])), `${f}: ${m[1]}`);
      iconCount++;
    }
    if (h.includes("fl-max")) assert.match(h, /class="fl-max"[^>]*aria-label="Написать в MAX"[^>]*><img class="bi bi-max"[^>]*width="28" height="28"/);
    assert.ok(!/cb-max[^>]*>[\s\S]{0,200}max-logo/.test(h), "в кнопке с подписью нет логотипа с надписью MAX");
  }
  assert.ok(iconCount > 20);
});

test("Hero: два показателя (опыт и гарантия), рейтинг Авито в Hero и рекламных блоках главной убран", () => {
  const h = readFileSync(pub("index.html"), "utf8");
  const stats = h.match(/<ul class="hc-stats[\s\S]*?<\/ul>/)[0];
  assert.equal((stats.match(/<li>/g) || []).length, 2);
  assert.match(stats, /<b>10\+<\/b><span>лет с консолями<\/span>/); assert.match(stats, /<b>90<\/b><span>дней гарантии<\/span>/);
  assert.ok(!/Авито|4,8|★/.test(stats));
  const body = h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  assert.ok(!/Рейтинг профиля на Авито|рейтинг на Авито|4,8/.test(body), "на главной нет рекламы рейтинга Авито");
  assert.ok(h.includes("Смотрите реальные фотографии выполненных ремонтов и читайте отзывы клиентов мастерской FinikFix."));
  assert.ok(h.includes('href="/otzyvy/"') && h.includes("Читать отзывы"));
});

test("страница отзывов не затронута: источник Авито указан честно, рейтинг профиля показан отдельным блоком", () => {
  const r = readFileSync(pub("otzyvy/index.html"), "utf8");
  assert.ok(r.includes("4,8 из 5 · 62 отзыва"));
  assert.match(r, /Отзывы на Авито/); assert.match(r, /Источник: профиль «Ремонт цифровой техники» на Авито/);
  assert.ok(r.includes('id="rv-avito"'));
});
