// Замечания Никиты 2026-11-09: калькуляторы в начале страниц, блока «Чего я НЕ делаю» нет нигде.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stickTypes, promos } from "../src/data.mjs";
import { pairTotal } from "../src/pricing.mjs";
import { sticksBlock } from "../src/templates.mjs";

const pub = (p) => join(import.meta.dirname, "..", "public", p);
const html = (p) => readFileSync(pub(p), "utf8");
const allHtml = (dir = pub("")) => readdirSync(dir).flatMap((n) => { const f = join(dir, n); return statSync(f).isDirectory() ? (n === "assets" ? [] : allHtml(f)) : n.endsWith(".html") ? [f] : []; });
const noScripts = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "");
const at = (h, needle) => { const i = h.indexOf(needle); assert.ok(i >= 0, `нет: ${needle}`); return i; };

test("«Чего я НЕ делаю» и настройка интернета: нет ни на одной публичной странице", () => {
  const files = allHtml();
  assert.ok(files.length >= 20);
  for (const f of files) {
    const h = noScripts(readFileSync(f, "utf8"));
    assert.ok(!/Чего я НЕ делаю/i.test(h), f);
    assert.ok(!/нтернет/.test(h), f);
    assert.ok(!/class="card warn/.test(h), f);
  }
});

test("главная: Hero первый, затем калькулятор, затем «Почему мне доверяют ремонт», затем остальное без изменений", () => {
  const h = html("index.html");
  const body = h.slice(at(h, "<main"));
  const sections = [...body.matchAll(/<section[^>]*>/g)].map((m) => m[0]);
  assert.match(sections[0], /class="hero hero-c hs"/, "первая секция — Hero");
  assert.match(sections[1], /id="calc"/, "вторая секция — калькулятор");
  assert.match(sections[2], /id="trust"/, "третья секция — «Почему мне доверяют ремонт»");
  // остальные разделы остаются в прежнем порядке
  const rest = ['id="services"', 'id="works-home"', "Частые проблемы", "promo-strip-sec", "Как я работаю", "<h2>Скупка техники</h2>", 'id="video"', "Реальные работы и отзывы", 'id="contact"'];
  let prev = at(h, 'id="trust"');
  for (const marker of rest) { const i = at(h, marker); assert.ok(i > prev, `${marker} идёт после предыдущего раздела`); prev = i; }
  // Hero целиком в первой секции: H1, слайдер, кнопки, фото
  const hero = body.slice(0, body.indexOf('id="calc"'));
  assert.equal((h.match(/<h1[ >]/g) || []).length, 1, "ровно один H1");
  assert.ok(hero.includes("<h1") && hero.includes("hs-slides") && hero.includes("hero-cta") && hero.includes("hc-stats"), "H1, слайдер, кнопки и показатели внутри Hero");
  assert.ok(/<img[^>]+slide-0/.test(hero), "фото слайдера в Hero");
  assert.equal((h.match(/id="calc"/g) || []).length, 1, "ровно один общий калькулятор");
  assert.equal((h.match(/class="card trust-card/g) || []).length, 6, "шесть карточек преимуществ");
  assert.ok(h.includes("Куплю консоли, ноутбуки, комплектующие") && h.includes("<h2>Скупка техники</h2>"), "блок скупки сохранён");
  assert.match(h, /id="c-cat"/); assert.match(h, /id="c-req"/); assert.match(h, /data-cb-calc/, "заявка из калькулятора");
  assert.match(h, /href="\/zamena-stika-gamepada\/#promo"/, "ссылка на акцию");
  assert.match(h, /href="\/#calc"/, "ссылка меню «Калькулятор»");
  assert.ok(/id="services"/.test(h), "якорь #services");
});

test("страница замены стиков: калькулятор скидки идёт до статьи и описания технологий", () => {
  const h = html("zamena-stika-gamepada/index.html");
  const promo = at(h, 'id="promo"');
  assert.ok(at(h, "<h1") < promo);
  assert.ok(promo < at(h, 'id="sticks"'), "до описания типов");
  assert.ok(promo < at(h, 'class="wrap article"'), "до статьи");
  assert.ok(promo < at(h, 'id="contact"'));
  assert.equal((h.match(/id="promo"/g) || []).length, 1);
  assert.equal((h.match(/id="pr-a"/g) || []).length, 1);
  assert.equal((h.match(/<h1[ >]/g) || []).length, 1);
  assert.equal((h.match(/id="calc"/g) || []).length, 0, "общий калькулятор не подменяет специализированный");
  assert.match(h, /id="pr-b"/); assert.match(h, /data-cb-promo/);
  // значения по умолчанию: Original + Gulikit
  assert.ok(h.includes("3&nbsp;500") || /3[\s ]500/.test(h));
  assert.ok(/2[\s ]975/.test(h));
});

test("«Ремонт геймпадов»: блок стиков остаётся целиком (описание, затем калькулятор скидки)", () => {
  const h = html("remont-gamepadov/index.html");
  assert.ok(at(h, 'id="sticks"') < at(h, 'id="promo"'));
  assert.equal((h.match(/id="promo"/g) || []).length, 1);
});

test("sticksBlock: части не теряют и не дублируют разметку", () => {
  const all = sticksBlock(), promo = sticksBlock("promo"), info = sticksBlock("info");
  for (const part of [promo, info]) assert.ok(part.length > 200);
  assert.ok(promo.includes('id="promo"') && !info.includes('id="promo"'));
  assert.ok(info.includes('id="sticks"') && !promo.includes('id="sticks"'));
  assert.ok(all.includes('id="promo"') && all.includes('id="sticks"'));
  assert.match(promo, /<h2>Замена двух аналогов/);
  assert.ok(promo.includes("Бесплатная внутренняя чистка"));
});

test("цены стиков и скидка 15% не изменились", () => {
  assert.deepEqual(stickTypes.map((t) => t.price), [1000, 1200, 1500, 1800, 2500]);
  assert.equal(promos.pairDiscount.percent, 15);
  assert.deepEqual(pairTotal(1000, 2500), { sum: 3500, total: 2975, discount: 525 });
});

test("отзывы: страница и источник на месте", () => {
  const h = html("otzyvy/index.html");
  assert.ok(h.includes("Авито"));
  assert.equal((h.match(/<h1[ >]/g) || []).length, 1);
});

test("мобильная панель: нижний отступ не обнуляется при включённых заявках, фокус оставляет поля над панелью", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "src", "client", "style.css"), "utf8");
  // body.has-cb добавляется при включённых заявках; он не должен убирать отступ под fixed-панель
  assert.ok(!/body\.has-cb,\.mbar-on\{padding-bottom:0\}/.test(css), "нижний отступ обнулён");
  assert.match(css, /body\.has-cb,\.mbar-on\{padding-bottom:calc\(56px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(css, /html\{scroll-padding-bottom:calc\(52px \+ env\(safe-area-inset-bottom\) \+ 20px\)\}/);
  assert.match(css, /\.mbar\{display:flex;position:fixed;[^}]*z-index:45/, "панель остаётся и ниже модального окна (dialog в верхнем слое)");
  for (const p of ["index.html", "zamena-stika-gamepada/index.html"]) {
    const h = html(p);
    assert.equal((h.match(/class="mbar"/g) || []).length, 1, p);
    for (const t of ["Позвонить", "Telegram", "MAX", "Заявка"]) assert.ok(/<nav class="mbar"[\s\S]*?<\/nav>/.exec(h)[0].includes(t), `${p}: ${t}`);
  }
});
