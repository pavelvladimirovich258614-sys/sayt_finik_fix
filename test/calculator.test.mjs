// Калькулятор и прайс по утверждённому прайсу Никиты (голосовое сообщение 2026-11-05).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildCalc, resolveService, priceGroupRows, priceRows } from "../src/calc.mjs";
import { services, consoleModels, calcCategories, stickTypes, categories, narrow, diagnostics } from "../src/data.mjs";
import { pairTotal } from "../src/pricing.mjs";

const pub = (p) => join(import.meta.dirname, "..", "public", p);
const html = (p) => readFileSync(pub(p), "utf8");
const M = Object.fromEntries(consoleModels.map((m) => [m.id, m]));
const price = (id, model) => { const r = resolveService(id, model); return r && r.kind === "fixed" ? r.price : r && r.kind; };
const calc = buildCalc();
const cat = (id) => calc.cats.find((c) => c.id === id);
const svcNames = (c, mid) => c.models.find((m) => m.id === mid).services.map((s) => s.name);
const allHtml = (dir = pub("")) => readdirSync(dir).flatMap((n) => { const f = join(dir, n); return statSync(f).isDirectory() ? (n === "assets" ? [] : allHtml(f)) : n.endsWith(".html") ? [f] : []; });

test("прайс: все подтверждённые цены консолей (HDMI, обслуживание, прошивка, накопители)", () => {
  const hdmi = { ps3: 3000, ps4: 4500, ps5: 6500, x360: 3000, xone: 4500, xseries: 6000 };
  const cooling = { ps3: 2500, x360: 2500, ps4: 3500, xone: 3500, ps5: 4000, xseries: 4000 };
  const firmware = { ps3: 2000, ps4: 3000, ps5: 5000, sw: 3000, swoled: 5000 };
  for (const [id, p] of Object.entries(hdmi)) assert.equal(price("hdmi", M[id]), p, `HDMI ${id}`);
  for (const [id, p] of Object.entries(cooling)) assert.equal(price("cooling", M[id]), p, `обслуживание ${id}`);
  for (const [id, p] of Object.entries(firmware)) assert.equal(price("firmware", M[id]), p, `прошивка ${id}`);
  for (const id of ["ps3", "ps4", "ps5", "x360", "xone", "xseries"]) assert.equal(price("hdd", M[id]), 1500, `HDD/SSD ${id}`);
  assert.equal(services.cooling.name, "Обслуживание системы охлаждения консоли");
});

test("прайс: геймпады, смартфоны, ПК, ноутбуки", () => {
  assert.equal(price("batteryPad"), 2000); assert.equal(price("dsPower"), 3500);
  assert.equal(price("phoneDisplay"), 2000); assert.equal(price("phoneBattery"), 2000);
  assert.deepEqual([price("pcBuild"), price("pcData"), price("pcWindows"), price("pcClean")], [4999, 2000, 1299, 2000]);
  const office = cat("laptop").models.find((m) => m.id === "office"), gaming = cat("laptop").models.find((m) => m.id === "gaming");
  assert.equal(office.services.find((s) => s.id === "laptopClean").price, 1500);
  assert.equal(gaming.services.find((s) => s.id === "laptopClean").price, 3500);
});

test("выбор модели: консоль видит только применимые услуги, нет несовместимых", () => {
  const con = cat("console");
  assert.equal(con.modelLabel, "Модель консоли"); assert.equal(con.models.length, consoleModels.length);
  const sw = svcNames(con, "sw"), swo = svcNames(con, "swoled");
  for (const names of [sw, swo]) for (const bad of ["Замена HDMI-порта", "Обслуживание системы охлаждения консоли", "Замена HDD/SSD"]) assert.ok(!names.includes(bad), `Switch: ${bad}`);
  assert.ok(sw.includes("Прошивка консоли") && sw.includes("Ремонт USB-C (зарядка) Nintendo Switch"));
  for (const id of ["ps3", "ps4", "ps5", "x360", "xone", "xseries"]) { const n = svcNames(con, id); assert.ok(n.includes("Замена HDMI-порта") && n.includes("Замена HDD/SSD"), id); assert.ok(!n.includes("Ремонт USB-C (зарядка) Nintendo Switch"), id); }
  for (const id of ["x360", "xone", "xseries"]) assert.ok(!svcNames(con, id).includes("Прошивка консоли"), `Xbox без прошивки: ${id}`);
  // сквозная проверка: у каждой фиксированной услуги целая положительная цена
  for (const c of calc.cats) for (const m of c.models) for (const s of m.services) if (s.kind === "fixed") assert.ok(Number.isInteger(s.price) && s.price > 0, `${c.id}/${m.id}/${s.id}`);
});

test("модификации без подтверждённой цены (PS4 Pro, Switch Lite) не получают чужую цену", () => {
  for (const id of ["ps4pro", "swlite"]) for (const s of cat("console").models.find((m) => m.id === id).services) assert.ok(s.kind !== "fixed", `${id}/${s.id}`);
  const pro = cat("console").models.find((m) => m.id === "ps4pro").services;
  assert.equal(pro.find((s) => s.id === "hdmi").kind, "model");
  assert.ok(pro.some((s) => s.id === "consoleBoard" && s.kind === "diag"));
});

test("без «от»: в данных калькулятора и в таблицах цен нет приставки «от» у фиксированных работ", () => {
  assert.ok(!/(^|[^а-яё])от [0-9]/i.test(JSON.stringify(calc)));
  for (const f of ["index.html", "ceny/index.html", "remont-playstation/index.html", "remont-xbox/index.html", "remont-pk/index.html", "zamena-hdmi-konsoli/index.html"]) {
    const t = html(f).replace(/<script[\s\S]*?<\/script>/g, "").replace(/&nbsp;| /g, " ");
    assert.ok(!/<td>\s*от [0-9]/.test(t) && !/>от [0-9][0-9 ]* ₽</.test(t), f);
  }
});

test("удалённые услуги нигде не фигурируют в калькуляторе, прайсе и таблицах страниц", () => {
  const bad = [/Blu-ray/i, /датчик[а-я]* питания/i, /микросхем/i, /Micro-USB/i, /Type-C/i, /чипа управления/i, /Прошивка PS3\/PS4\/Switch/, /Чистка системы охлаждения/, /^Ремонт ноутбуков$/];
  const names = Object.values(services).map((s) => s.name).concat(calc.cats.flatMap((c) => c.models.flatMap((m) => m.services.map((s) => s.name))));
  for (const re of bad) assert.ok(!names.some((n) => re.test(n)), String(re));
  const prices = html("ceny/index.html");
  for (const re of bad.slice(0, 7)) assert.ok(!re.test(prices), `страница цен: ${re}`);
  for (const c of categories) for (const k of c.items) assert.ok(services[k], `${c.slug}: услуга ${k}`);
  for (const f of ["remont-playstation", "remont-xbox", "remont-nintendo", "remont-gamepadov"]) assert.ok(!/Blu-ray|Micro-USB|чип[а-я]* управления/.test(html(f + "/index.html").replace(/<script[\s\S]*?<\/script>/g, "")), f);
});

test("пять типов стиков и цены за один аналог", () => {
  assert.deepEqual(stickTypes.map((t) => [t.short, t.price]), [["Original", 1000], ["JCD", 1200], ["Hall", 1500], ["TMR K-Silver", 1800], ["Gulikit", 2500]]);
  assert.equal(calc.sticks.types.length, 5);
  assert.equal(cat("gamepad").models[0].services[0].kind, "sticks");
});

test("скидка 15% на два стика: примеры Никиты, разные типы, единая формула", () => {
  const T = Object.fromEntries(stickTypes.map((t, i) => [t.short, i]));
  const at = (a, b) => calc.sticks.pairs[T[a]][T[b]];
  assert.deepEqual(at("Original", "Original"), { sum: 2000, total: 1700, discount: 300 });
  assert.deepEqual(at("JCD", "Hall"), { sum: 2700, total: 2295, discount: 405 });
  assert.deepEqual(at("Gulikit", "Gulikit"), { sum: 5000, total: 4250, discount: 750 });
  assert.deepEqual(at("Original", "Gulikit"), { sum: 3500, total: 2975, discount: 525 });
  assert.deepEqual(at("Gulikit", "Original"), at("Original", "Gulikit"));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) assert.deepEqual(calc.sticks.pairs[i][j], pairTotal(stickTypes[i].price, stickTypes[j].price));
  assert.equal(calc.sticks.percent, 15);
});

test("услуги без фиксированной цены: диагностика и уточнение модели, числа нет", () => {
  const diag = [["console", "ps5", ["consoleBoard", "consoleLiquid", "consolePower"]], ["console", "sw", ["usbcSwitch"]], ["phone", "_", ["phoneBoard"]], ["tablet", "_", ["tabBoard"]], ["laptop", "office", ["laptopComponent"]], ["gamepad", "_", ["padOther"]]];
  for (const [c, m, ids] of diag) for (const id of ids) { const s = cat(c).models.find((x) => x.id === m).services.find((x) => x.id === id); assert.equal(s.kind, "diag", id); assert.equal(s.price, undefined, id); }
  const lap = cat("laptop").models[0].services.find((s) => s.id === "laptopDisplay");
  assert.equal(lap.kind, "model"); assert.equal(lap.input, "laptopModel"); assert.equal(lap.price, undefined);
  for (const id of ["tabDisplay", "tabBattery"]) assert.equal(cat("tablet").models[0].services.find((s) => s.id === id).kind, "model");
  assert.match(calc.text.diag, /после диагностики/); assert.match(calc.text.model, /после уточнения модели/);
  // USB-C Switch больше не имеет цены 2 500
  assert.ok(!JSON.stringify(calc).includes("2500") || !/USB-C[^}]*2500/.test(JSON.stringify(calc)));
});

test("запчасти: что входит, что нет", () => {
  const pad = cat("gamepad").models[0].services, ph = cat("phone").models[0].services;
  assert.match(pad.find((s) => s.id === "batteryPad").parts, /входит в стоимость/);
  assert.match(pad.find((s) => s.id === "dsPower").parts, /входит в стоимость/);
  for (const id of ["phoneDisplay", "phoneBattery"]) assert.match(ph.find((s) => s.id === id).parts, /Стоимость работы без запчасти/);
  assert.match(resolveService("hdd", M.ps5).parts, /накопитель не входит/);
  for (const id of ["sw", "swoled"]) assert.match(resolveService("firmware", M[id]).note, /microSD не менее 128 ГБ покупается отдельно/);
  assert.equal(resolveService("firmware", M.ps5).note, undefined);
  assert.equal(resolveService("hdmi", M.ps5).parts, undefined, "не обещаем включённые запчасти без подтверждения");
});

test("диагностика: одинаковые условия в калькуляторе, на странице цен, в FAQ и на страницах услуг", () => {
  assert.match(diagnostics.short, /0 ₽/); assert.match(diagnostics.short, /1 000 ₽/); assert.match(diagnostics.short, /акт дефектации/);
  for (const f of ["index.html", "ceny/index.html", "remont-pk/index.html", "remont-playstation/index.html", "zamena-hdmi-konsoli/index.html", "zamena-stika-gamepada/index.html"]) {
    const t = html(f).replace(/&nbsp;| /g, " ");
    assert.ok(t.includes("1 000 ₽") && /акт дефектации/.test(t), f);
  }
  const faq = categories.find((c) => c.slug === "remont-xbox").faq.map((q) => q[1]).join(" ");
  assert.match(faq, /1 000 ₽/);
  // нигде нет «диагностика бесплатная» без условия отказа в тексте FAQ и карточках
  for (const f of allHtml()) { const t = readFileSync(f, "utf8"); assert.ok(!/Диагностика бесплатная\./.test(t), f); }
});

test("разметка калькулятора и передача выбора в заявку", () => {
  const h = html("index.html");
  for (const id of ["c-cat", "c-model", "c-srv", "c-st1", "c-qty", "c-st2", "c-lapm", "c-res", "c-req"]) assert.match(h, new RegExp(`id="${id}"`), id);
  assert.match(h, /data-cb data-cb-calc hidden id="c-req">Оставить заявку с расчётом/);
  assert.equal((h.match(/id="calc"/g) || []).length, 1);
  const js = readFileSync(pub("assets/app.js"), "utf8");
  assert.match(js, /window\.FF\.current/); assert.match(js, /cur = \{ device:/); assert.match(js, /Стоимость после диагностики/); assert.match(js, /Модель ноутбука: /);
  assert.match(js, /window\.FF && window\.FF\.current \? window\.FF\.current\(\) : null/);
});

test("страница цен строится из того же источника, что калькулятор", () => {
  const groups = priceGroupRows(); const ceny = html("ceny/index.html").replace(/&nbsp;| /g, " ");
  for (const g of groups) for (const r of g.rows) { assert.ok(ceny.includes(r.name.replace(/&/g, "&amp;")), r.name); for (const l of r.lines) assert.ok(ceny.includes(l.replace(/ /g, " ").replace(/&/g, "&amp;")), l); }
  assert.ok(ceny.includes("PS5 — 6 500 ₽") && ceny.includes("Xbox Series — 6 000 ₽") && ceny.includes("Gulikit — 2 500 ₽"));
  assert.equal(priceRows(["hdmi"], "ps")[0].lines.length, 3);
});

test("страницы услуг: цены из прайса, без устаревших сумм", () => {
  const hdmi = html("zamena-hdmi-konsoli/index.html").replace(/&nbsp;| /g, " ");
  for (const t of ["PlayStation 3 — 3 000 ₽", "PlayStation 5 — 6 500 ₽", "Xbox Series — 6 000 ₽"]) assert.ok(hdmi.includes(t), t);
  assert.ok(!/от 2 500/.test(hdmi));
  const stick = html("zamena-stika-gamepada/index.html").replace(/&nbsp;| /g, " ");
  assert.match(stick, /Original \(потенциометрический\) — 1 000 ₽/); assert.match(stick, /JCD — 1 200 ₽/);
  for (const n of narrow) assert.ok(!/от 2 500 ₽|от 1 000 ₽ за один/.test(n.desc + JSON.stringify(n.sections)), n.slug);
});
