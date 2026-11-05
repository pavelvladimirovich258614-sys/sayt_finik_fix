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
  ["Планшет 768", { viewport: { width: 768, height: 1024 }, hasTouch: true }],
  ["ПК 1280", { viewport: { width: 1280, height: 900 } }],
  ["ПК 1920", { viewport: { width: 1920, height: 1080 } }],
];

const browser = await chromium.launch();
for (const [name, prof] of profiles) {
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
  if (!mobile) {
    const cp = p.locator("[data-copy]").first();
    if (await cp.isVisible()) { await cp.click(); await p.waitForTimeout(300); const clip = await p.evaluate(() => navigator.clipboard.readText()); ok(clip === PHONE, `${name}: «Скопировать номер» кладёт ${clip} в буфер`); } else ok(false, `${name}: кнопка «Скопировать номер» не видна на ПК`);
  } else {
    ok(!(await p.locator("[data-copy]").first().isVisible()), `${name}: на смартфоне кнопка копирования скрыта, звонок через tel:`);
    const bar = p.locator(".mbar");
    ok(await bar.isVisible(), `${name}: нижняя панель связи видна`);
    const box = await bar.boundingBox(); ok(box && box.y + box.height <= prof.viewport.height + 1, `${name}: панель в пределах экрана`);
  }

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
await browser.close();
console.log(out.join("\n")); console.log(`\nИТОГ: ${out.length - bad} из ${out.length} проверок пройдено, провалов ${bad}`);
process.exit(bad ? 1 : 0);
