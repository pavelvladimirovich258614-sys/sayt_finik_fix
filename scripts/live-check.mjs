// Проверка живого сайта в Chromium с профилями смартфонов и ПК (запускается из GitHub Actions, без отправки реальных заявок).
//   SITE=https://finikfix.ru node scripts/live-check.mjs
import { chromium, devices } from "playwright";

const SITE = process.env.SITE || "https://finikfix.ru";
const out = []; let bad = 0;
const ok = (c, m) => { out.push(`${c ? "OK  " : "FAIL"} ${m}`); if (!c) bad++; };
const PHONE = "+79016624589", TG = "https://t.me/+79016624589", MAX = "https://web.max.ru/259685091";

const profiles = [
  ["iPhone 13 (375)", devices["iPhone 13"]],
  ["Pixel 7 (412)", devices["Pixel 7"]],
  ["Малый экран 320", { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent, deviceScaleFactor: 2 }],
  ["Планшет 768 (сенсор)", { viewport: { width: 768, height: 1024 }, hasTouch: true }],
  ["Планшет 768 (мышь)", { viewport: { width: 768, height: 1024 } }],
  ["ПК 1280", { viewport: { width: 1280, height: 900 } }],
  ["ПК 1920", { viewport: { width: 1920, height: 1080 } }],
];

const browser = await chromium.launch();
for (const [name, prof] of process.env.CALC_ONLY ? [] : profiles) {
  const ctx = await browser.newContext({ ...prof, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  const errs = []; const failedImgs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on("response", (r) => { if (/\/media\//.test(r.url()) && r.status() !== 200) failedImgs.push(r.status() + " " + r.url()); });
  const mobile = !!prof.isMobile;

  for (const path of ["/", "/portfolio/", "/otzyvy/", "/kontakty/", "/remont-playstation/", "/zamena-stika-gamepada/", "/ceny/"]) {
    const r = await p.goto(SITE + path, { waitUntil: "networkidle" });
    const m = await p.evaluate(() => ({ ov: document.documentElement.scrollWidth > document.documentElement.clientWidth, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).length, avito: [...document.querySelectorAll("a[href]")].filter((a) => /avito/i.test(a.href)).length }));
    ok(r.status() === 200 && !m.ov && !m.broken && !m.avito, `${name} ${path}: статус ${r.status()}, прокрутка ${m.ov ? "ЕСТЬ" : "нет"}, битых картинок ${m.broken}, ссылок на Авито ${m.avito}`);
  }

  // Сценарий А: главная -> «Наши работы» -> карточка -> галерея
  await p.goto(SITE + "/", { waitUntil: "networkidle" });
  const cards = await p.locator("#works-home-grid .work-card").count();
  ok(cards === 6, `${name}: на главной 6 карточек работ (найдено ${cards})`);
  const allBtn = (await p.textContent("#works-all-btn"))?.trim();
  ok(/10/.test(allBtn || ""), `${name}: кнопка «${allBtn}»`);
  await p.locator("#works-home-grid .work-card").first().click();
  await p.waitForURL(/\/portfolio\/#w\d+/); await p.waitForTimeout(800);
  ok(await p.locator("#lightbox").evaluate((d) => d.open), `${name}: галерея открылась по карточке, URL остался на сайте (${new URL(p.url()).host})`);
  const th = await p.locator(".lb-th").count();
  ok(th >= 2, `${name}: миниатюр в галерее ${th}`);
  if (mobile || prof.hasTouch) { const before = await p.textContent(".lb-count"); await p.locator(".lb-next").click(); ok((await p.textContent(".lb-count")) !== before, `${name}: листание фото работает`); }
  await p.keyboard.press("Escape");

  // Все 32 фото портфолио
  const data = await (await ctx.request.get(SITE + "/api/portfolio")).json();
  const works = data.works.length, photos = data.works.reduce((a, w) => a + w.photos.length, 0);
  ok(works === 10 && photos === 32, `${name}: API портфолио ${works} работ, ${photos} фото`);
  if (name.startsWith("iPhone")) { let badp = 0; for (const w of data.works) for (const ph of w.photos) { const r = await ctx.request.get(SITE + ph.src); if (r.status() !== 200 || !(r.headers()["content-type"] || "").startsWith("image/")) badp++; } ok(badp === 0, `${name}: все 32 фото отдаются как изображения (проблем ${badp})`); }

  // Сценарий В: контакты
  await p.goto(SITE + "/kontakty/", { waitUntil: "networkidle" });
  const hrefs = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  ok(hrefs.includes("tel:" + PHONE), `${name}: ссылка tel:${PHONE}`);
  ok(hrefs.includes(TG), `${name}: личная ссылка Telegram ${TG}`); ok(hrefs.includes(MAX), `${name}: личная ссылка MAX ${MAX}`);
  ok(!hrefs.some((h) => /se14906499|uved_nikita/.test(h || "")), `${name}: ссылок на ботов уведомлений нет`);
  ok(hrefs.filter((h) => /t\.me|max\.ru/.test(h || "")).every((h) => [TG, MAX, "https://t.me/finik_fix"].includes(h)), `${name}: все ссылки на Telegram/MAX — из утверждённых`);
  // Кнопка «Скопировать номер» нужна только при мыши (hover:hover + pointer:fine); на сенсорных устройствах скрыта, звонок идёт через tel:.
  // Критерий — тип ввода профиля (hasTouch), а не ширина экрана или isMobile.
  const touch = !!prof.hasTouch;
  if (!touch) {
    const cp = p.locator("[data-copy]").first();
    if (await cp.isVisible()) { await cp.click(); await p.waitForTimeout(300); const clip = await p.evaluate(() => navigator.clipboard.readText()); ok(clip === PHONE, `${name}: «Скопировать номер» кладёт ${clip} в буфер`); } else ok(false, `${name}: кнопка «Скопировать номер» не видна при управлении мышью`);
  } else {
    ok(!(await p.locator("[data-copy]").first().isVisible()), `${name}: при сенсорном вводе кнопка копирования скрыта, звонок через tel:`);
  }
  // Нижняя панель связи показывается на ширине ≤ 700 px и в пределах экрана; шире её нет
  const bar = p.locator(".mbar");
  if (prof.viewport.width <= 700) {
    ok(await bar.isVisible(), `${name}: нижняя панель связи видна`);
    const box = await bar.boundingBox(); ok(box && box.y + box.height <= prof.viewport.height + 1, `${name}: панель в пределах экрана`);
  } else ok(!(await bar.isVisible()), `${name}: нижней панели на широком экране нет`);

  // Сценарий Б: калькулятор -> окно заявки (без отправки)
  await p.goto(SITE + "/", { waitUntil: "networkidle" });
  await p.selectOption("#c-cat", { label: "Игровые консоли" }); await p.selectOption("#c-model", { label: "PlayStation 5" }); await p.selectOption("#c-srv", { label: "Замена HDMI-порта" });
  const res = (await p.textContent("#c-res")).trim(); ok(/^6\s500/.test(res.replace(/\u00a0/g, " ")), `${name}: калькулятор «${res}»`);
  const cfg = await (await ctx.request.get(SITE + "/api/config")).json();
  const calcBtn = p.locator("[data-cb-calc]");
  if (cfg.leads) { await calcBtn.scrollIntoViewIfNeeded(); await calcBtn.click(); await p.waitForTimeout(300); ok(await p.locator("#cb-dialog").evaluate((d) => d.open) && /Замена HDMI-порта/.test(await p.textContent("#cb-calc")) && /6.500/.test(await p.textContent("#cb-calc")), `${name}: заявка из калькулятора открывается с выбранной услугой`); await p.keyboard.press("Escape"); } else ok(true, `${name}: приём заявок выключен (кнопка скрыта)`);

  // Отзывы
  await p.goto(SITE + "/otzyvy/", { waitUntil: "networkidle" });
  const rv = await p.locator("#rv-avito .rv").count(); ok(rv === 32, `${name}: отзывов клиентов на странице ${rv}`);
  ok((await p.textContent("body")).includes("4,8 из 5 · 62 отзыва"), `${name}: рейтинг профиля Авито показан отдельным блоком`);
  ok(errs.length === 0, `${name}: ошибок JavaScript ${errs.length}${errs.length ? " — " + errs.slice(0, 2).join(" | ") : ""}`);
  ok(failedImgs.length === 0, `${name}: фото с кодом не 200: ${failedImgs.length}`);
  await ctx.close();
}

// ===== Мобильные калькуляторы: доступность и перекрытие нижней панелью (решение 2026-11-09) =====
// Заявки НЕ отправляются: /api/config подменяется (чтобы кнопки заявки были видны), любой POST /api/lead обрывается.
const calcViewports = [[320, 640, true], [360, 800, true], [375, 667, true], [375, 812, true], [390, 844, true], [412, 915, true], [768, 1024, true], [1024, 768, true], [1440, 900, false], [1920, 1080, false]];
const nb = (t) => String(t).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

// Элемент ставится в видимую область так же, как это делает браузер при фокусе/клавиатуре, и проверяется реальное перекрытие
// (координаты и elementFromPoint) шапкой и нижней панелью.
async function reach(p, sel) {
  return p.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { err: "нет элемента" };
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return { err: "скрыт" };
    if (el.matches("select,input,button,a,textarea")) el.focus(); else el.scrollIntoView({ block: "nearest", behavior: "instant" });
    await new Promise((r) => setTimeout(r, 800));
    const r = el.getBoundingClientRect();
    const bar = document.querySelector(".mbar"); const barOn = bar && getComputedStyle(bar).display !== "none";
    const b = barOn ? bar.getBoundingClientRect() : null;
    const hdr = document.querySelector(".hdr").getBoundingClientRect();
    const bottomLimit = b ? b.top : innerHeight;
    const pts = [[.5, .5], [.5, .15], [.5, .85], [.15, .5], [.85, .5]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]);
    const hit = pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t)); });
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), hdrBottom: Math.round(hdr.bottom), barTop: b ? Math.round(b.top) : null, vh: innerHeight, h: Math.round(r.height), hit,
      visible: r.top >= hdr.bottom - 1 && r.bottom <= bottomLimit + 1, tooTall: r.height > bottomLimit - hdr.bottom };
  }, sel);
}

for (const [w, h, touch] of calcViewports.filter(([ww, hh]) => !process.env.VP || process.env.VP === `${ww}x${hh}`)) {
  const name = `${w}×${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w <= 700, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; let leadPosts = 0;
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.route("**/api/config", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reviews: false, leads: true }) }));
  await p.route("**/api/lead", (r) => { leadPosts++; r.abort(); });
  const barOn = w <= 700;
  const needReach = async (sel, label) => {
    const r = await reach(p, sel);
    ok(!r.err && r.visible && r.hit, `${name} ${label}: ${r.err ? r.err : `виден и не перекрыт (верх ${r.top}, низ ${r.bottom}, шапка ${r.hdrBottom}, панель ${r.barTop ?? "нет"}, экран ${r.vh})`}`);
  };

  // --- А. Главная: общий калькулятор
  await p.goto(SITE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
  const order = await p.evaluate(() => { const s = [...document.querySelectorAll("main section")].map((x) => x.id || x.className); return { first: s[0], second: s[1], h1Before: !!document.querySelector("#calc")?.compareDocumentPosition(document.querySelector("h1")) && !(document.querySelector("#calc").compareDocumentPosition(document.querySelector("h1")) & Node.DOCUMENT_POSITION_PRECEDING) }; });
  ok(order.first === "calc" && order.second === "trust", `${name} /: первая секция — калькулятор, вторая — «Почему мне доверяют» (${order.first}, ${order.second})`);
  const hdrB = await p.evaluate(() => Math.round(document.querySelector(".hdr").getBoundingClientRect().bottom));
  const calcTop = await p.evaluate(() => Math.round(document.querySelector("#calc").getBoundingClientRect().top));
  ok(calcTop <= hdrB + 4, `${name} /: калькулятор начинается сразу под шапкой (${calcTop} px, шапка до ${hdrB})`);
  await p.selectOption("#c-cat", { label: "Игровые консоли" });
  await p.selectOption("#c-model", { label: "PlayStation 5" });
  await p.selectOption("#c-srv", { label: "Замена HDMI-порта" });
  ok(/^6 500/.test(nb(await p.textContent("#c-res"))), `${name} /: PS5 + замена HDMI = «${nb(await p.textContent("#c-res"))}»`);
  for (const [sel, label] of [["#c-cat", "список «Что ремонтируем»"], ["#c-model", "список модели"], ["#c-srv", "список услуги"], ["#c-res", "итоговая стоимость"], ["#c-req", "кнопка «Оставить заявку с расчётом»"]]) await needReach(sel, `/ ${label}`);
  // переключение: ноутбуки -> модель ноутбука; обратно на консоль
  await p.selectOption("#c-cat", { index: 1 }); await p.waitForTimeout(200);
  await needReach("#c-srv", "/ список услуги после смены категории");
  await p.selectOption("#c-cat", { label: "Игровые консоли" }); await p.selectOption("#c-model", { label: "PlayStation 5" }); await p.selectOption("#c-srv", { label: "Замена HDMI-порта" });
  // окно заявки
  await reach(p, "#c-req"); await p.locator("#c-req").click(); await p.waitForTimeout(400);
  const dlg = await p.evaluate(() => { const d = document.querySelector("#cb-dialog"); const bar = document.querySelector(".mbar"); let barCovered = true; if (bar && getComputedStyle(bar).display !== "none") { const b = bar.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); barCovered = !t || !bar.contains(t); } return { open: d.open, calc: d.querySelector("#cb-calc")?.textContent || "", barCovered, r: d.getBoundingClientRect().toJSON() }; });
  ok(dlg.open, `${name} /: окно заявки открывается`);
  ok(/PlayStation 5/.test(nb(dlg.calc)) && /Замена HDMI-порта/.test(nb(dlg.calc)) && /6 500/.test(nb(dlg.calc)), `${name} /: в окне заявки модель, услуга и 6 500 ₽ («${nb(dlg.calc).slice(0, 90)}»)`);
  ok(dlg.barCovered, `${name} /: окно заявки поверх нижней панели`);
  ok(dlg.r.left >= -1 && dlg.r.right <= w + 1 && dlg.r.top >= -1 && dlg.r.bottom <= h + 1, `${name} /: окно заявки помещается на экран`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  ok(!(await p.locator("#cb-dialog").evaluate((d) => d.open)), `${name} /: окно закрывается`);
  await p.selectOption("#c-srv", { index: 1 }).catch(() => {}); await p.selectOption("#c-srv", { label: "Замена HDMI-порта" });
  ok(/^6 500/.test(nb(await p.textContent("#c-res"))), `${name} /: после закрытия окна калькулятор работает`);

  // --- Б. Страница стиков
  await p.goto(SITE + "/zamena-stika-gamepada/", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
  const ord = await p.evaluate(() => { const pos = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : -1; }; return { h1: pos("h1"), promo: pos("#promo"), sticks: pos("#sticks"), article: pos(".article"), calc: document.querySelectorAll("#calc").length, promos: document.querySelectorAll("#promo").length }; });
  ok(ord.h1 >= 0 && ord.h1 < ord.promo && ord.promo < ord.sticks && ord.promo < ord.article && ord.calc === 0 && ord.promos === 1, `${name} /zamena-stika-gamepada/: #promo после заголовка и до описания и статьи (${JSON.stringify(ord)})`);
  await p.selectOption("#pr-a", { label: "Original — 1 000 ₽" }).catch(async () => p.selectOption("#pr-a", { index: 0 }));
  await p.selectOption("#pr-b", { label: "Gulikit — 2 500 ₽" }).catch(async () => p.selectOption("#pr-b", { index: 4 }));
  const [sum, disc, tot] = [nb(await p.textContent("#pr-sum")), nb(await p.textContent("#pr-disc")), nb(await p.textContent("#pr-total"))];
  ok(sum === "3 500 ₽" && /525 ₽$/.test(disc) && tot === "2 975 ₽", `${name} /zamena-stika-gamepada/: сумма ${sum}, скидка ${disc}, итого ${tot}`);
  for (const [sel, label] of [["#pr-a", "первый список"], ["#pr-b", "второй список"], ["#pr-sum", "сумма"], ["#pr-disc", "скидка"], ["#pr-total", "итого"], ["[data-cb-promo]", "кнопка заявки со скидкой"]]) await needReach(sel, `стики ${label}`);
  await reach(p, "[data-cb-promo]"); await p.locator("[data-cb-promo]").click(); await p.waitForTimeout(400);
  const d2 = await p.evaluate(() => { const d = document.querySelector("#cb-dialog"); return { open: d.open, calc: d.querySelector("#cb-calc")?.textContent || "" }; });
  ok(d2.open && /2 975/.test(nb(d2.calc)), `${name} стики: окно заявки с расчётом («${nb(d2.calc).slice(0, 100)}»)`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  await p.selectOption("#pr-a", { index: 2 });
  ok(nb(await p.textContent("#pr-total")) !== "2 975 ₽", `${name} стики: после закрытия окна пересчёт работает`);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok(!ov, `${name}: горизонтальной прокрутки нет`);
  // конец страницы: последний элемент не прячется под панелью
  await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })); await p.waitForTimeout(500);
  if (barOn) { const gap = await p.evaluate(() => { const b = document.querySelector(".mbar").getBoundingClientRect(); const f = document.querySelector("footer"); return Math.round(b.top - f.getBoundingClientRect().bottom); }); ok(gap >= -1 && gap <= 60, `${name}: конец страницы: подвал над панелью, зазор ${gap} px`); }
  ok(leadPosts === 0, `${name}: реальных заявок не отправлено (перехвачено ${leadPosts})`);
  ok(errs.length === 0, `${name}: ошибок JavaScript ${errs.length}${errs.length ? " — " + errs.slice(0, 2).join(" | ") : ""}`);
  await ctx.close();
}

await browser.close();
console.log(out.join("\n")); console.log(`\nИТОГ: ${out.length - bad} из ${out.length} проверок пройдено, провалов ${bad}`);
process.exit(bad ? 1 : 0);
