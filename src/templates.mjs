import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pairTotal } from "./pricing.mjs";
export { privacyHtml, consentHtml, cookiesHtml, termsHtml, mailingHtml } from "./legal.mjs";
import { site, shop, categories, narrow, pagesOther, heroSlides, homeCats, stickTypes, stickTech, stickUnit, promos, workCats, diagnostics, priceNote } from "./data.mjs";
import { priceRows, priceGroupRows, buildCalc } from "./calc.mjs";
import { icon, brandIcon, maxLogoImg } from "./icons.mjs";

export const rub = (n) => n.toLocaleString("ru-RU").replace(/ | /g, " ") + " ₽";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const waLink = `${site.whatsapp}?text=${encodeURIComponent(site.preset)}`;

export function priceTable(rows) {
  return `<table class="ptable">${rows.map((r) => `<tr><td>${esc(r.name)}${r.note ? `<small class="pnote">${esc(r.note)}</small>` : ""}</td><td>${r.lines.map(esc).join("<br>")}</td></tr>`).join("")}</table>`;
}

export const portfolioBtn = (cls = "") => `<a class="btn ${cls}" href="/portfolio/" data-goal="portfolio">${esc(site.portfolioText)}</a>`;
// Релевантные кейсы на странице услуги (заполняется из /api/portfolio, скрывается, если подходящих работ нет)
export const relatedWorks = (slug) => workCats[slug] ? `<section class="alt"><div class="wrap"><span class="eyebrow">Примеры работ</span><h2>Похожие выполненные ремонты</h2><div class="works-grid works-rel" data-wcat="${workCats[slug]}" aria-live="polite"></div><p class="cat-more"><a class="btn ghost" href="/portfolio/" data-goal="portfolio">Всё портфолио</a></p></div></section>` : "";

export const faqBlock = (faq) => `<div class="faq">${faq.map(([q, a]) => `<details class="reveal"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;

export const noInternet = `<div class="card warn reveal"><span class="tag">Чего я НЕ делаю</span><h3>Не настраиваю интернет на дому</h3><p>Только ремонт цифровой техники. Выезд возможен по договорённости, но не для настройки интернета.</p></div>`;

export function photoBlock(o, cls = "") {
  return o.hasPhoto
    ? `<figure class="photo ${cls}"><img src="/assets/img/${o.photoFile}?v=${o.photoVer}"${imageUrl("portrait-hq", o.photoFile) ? ` data-hq-src="${imageUrl("portrait-hq", o.photoFile)}"` : ""}${o.hasPhotoSm ? ` srcset="/assets/img/master-640.webp?v=${o.photoVer} 640w, /assets/img/${o.photoFile}?v=${o.photoVer} 1024w" sizes="(max-width:860px) 92vw, 560px"` : ""} alt="Никита, мастер FinikFix, Ангарск" width="1024" height="1024" fetchpriority="high"><figcaption>${esc(site.owner)}, мастер FinikFix</figcaption></figure>`
    : `<figure class="photo ph ${cls}"><div><b>ff</b><span>Здесь будет фото мастера</span></div></figure>`;
}

const ctlIcon = {
  prev: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  next: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
};

// Слайдер первого экрана. Первый кадр грузится сразу (fetchpriority=high), остальные подгружает app.js после загрузки страницы (data-src).
// Версия файла в адресе: при замене фото браузер не показывает старое из кэша.
const imageUrl = (folder, file) => {
  const f = new URL("./assets/img/" + folder + "/" + file, import.meta.url);
  if (!existsSync(f)) return null;
  const v = createHash("md5").update(readFileSync(f)).digest("hex").slice(0, 8);
  return "/assets/img/" + folder + "/" + file + "?v=" + v;
};
const HQ_W = 2560;
// Оригинал (резерв) и HD-версия слайда: браузер сам выбирает подходящую по размеру и плотности экрана (без двойной загрузки);
// при ошибке HD app.js возвращает оригинал (data-orig).
const slideImg = (sl) => {
  const orig = imageUrl("slides", sl.file), hq = imageUrl("slides-hq", sl.file);
  return { src: orig, srcset: hq ? `${orig} ${sl.w}w, ${hq} ${HQ_W}w` : "" };
};
// Размер слайда в CSS-пикселях с учётом object-fit: cover (кадр 16:9): до 560 px квадрат, до 1100 px — 16:10, шире — рамка высотой ~840 px.
const SLIDE_SIZES = "(max-width:560px) 178vw, (max-width:1100px) 111vw, 1500px";
export function heroSlider() {
  const n = heroSlides.length;
  const slides = heroSlides.map((sl, i) => {
    const im = slideImg(sl);
    const attrs = `sizes="${SLIDE_SIZES}" alt="${esc(sl.alt)}" width="1600" height="900" decoding="async" data-orig="${im.src}"`;
    const img = i
      ? `<img data-src="${im.src}"${im.srcset ? ` data-srcset="${im.srcset}"` : ""} ${attrs}>`
      : `<img src="${im.src}"${im.srcset ? ` srcset="${im.srcset}"` : ""} fetchpriority="high" ${attrs}>`;
    return `<figure class="hs-slide${i ? "" : " is-active"}" role="group" aria-roledescription="слайд" aria-label="${i + 1} из ${n}"${i ? ' aria-hidden="true"' : ""} style="--pos:${sl.pos}">${img}</figure>`;
  }).join("");
  const dots = heroSlides.map((_, i) => `<button type="button" class="hs-dot" aria-label="Фото ${i + 1} из ${n}"${i ? "" : ' aria-current="true"'}></button>`).join("");
  return `<div class="hs-stage" role="region" aria-roledescription="карусель" aria-label="Фото мастера FinikFix">
  <div class="hs-slides" data-interval="5000">${slides}</div>
  <span id="photo-enhance-status" class="visually-hidden" role="status" aria-live="polite"></span>
  <div class="hs-ctl" role="group" aria-label="Управление слайдером"><button type="button" class="hs-btn hs-prev" aria-label="Предыдущее фото">${ctlIcon.prev}</button><div class="hs-dots">${dots}</div><button type="button" class="hs-btn hs-next" aria-label="Следующее фото">${ctlIcon.next}</button><button type="button" class="hs-btn hs-pp" aria-label="Остановить смену фото" aria-pressed="false" data-pause="${esc(ctlIcon.pause)}" data-play="${esc(ctlIcon.play)}">${ctlIcon.pause}</button></div>
</div>`;
}

const maxLink = () => (site.max ? `<a href="${esc(site.max)}" target="_blank" rel="noopener noreferrer" data-goal="messenger" class="max-pill" aria-label="Написать в MAX">${maxLogoImg(22)}</a>` : "");
// Кнопки прямой связи: звонок, MAX, Telegram (+ WhatsApp по желанию). Форма заявки на сайте не используется.
export function contactBtns({ wa = false, cls = "" } = {}) {
  const ext = 'target="_blank" rel="noopener noreferrer" data-goal="messenger"';
  return `<div class="cbtns${cls ? " " + cls : ""}">` +
    `<button type="button" class="cbtn cb-req" data-cb hidden>${brandIcon("call", 22)}<span>Оставить заявку</span></button>` +
    `<a class="cbtn cb-call" href="tel:${site.phoneRaw}" data-goal="call">${brandIcon("call", 22)}<span>Позвонить</span></a>` +
    `<button type="button" class="cbtn cb-copy" data-copy="${site.phoneRaw}" data-copy-label="${site.phone}" aria-label="Скопировать номер ${site.phone}"><span>Скопировать номер</span></button>` +
    (site.max ? `<a class="cbtn cb-max" href="${esc(site.max)}" ${ext}>${brandIcon("max", 24)}<span>Написать в MAX</span></a>` : "") +
    `<a class="cbtn cb-tg" href="${esc(site.telegram)}" ${ext}>${brandIcon("tg", 24)}<span>Написать в Telegram</span></a>` +
    (wa ? `<a class="cbtn cb-wa" href="${waLink}" ${ext}>${brandIcon("wa", 24)}<span>WhatsApp</span></a>` : "") + `</div>`;
}
const emailLink = () => `<a href="mailto:${site.email}">${site.email}</a>`;

// Сравнение стиков и акция. Цены указаны за ОДИН аналог (подтверждено заказчиком); цены только «от».
const fmtRub = (n) => rub(n);
export function sticksBlock() {
  const opts = stickTypes.map((t) => [t.name, t.price]);
  const defA = 0, defB = 4; // по умолчанию Original + Gulikit: 1 000 + 2 500 = 3 500, скидка 525, итого 2 975
  const r = pairTotal(opts[defA][1], opts[defB][1]);
  const options = (sel) => opts.map(([n, pr], i) => `<option value="${i}"${i === sel ? " selected" : ""}>${esc(n)} — ${fmtRub(pr)}</option>`).join("");
  return `<section class="alt" id="sticks"><div class="wrap">
  <span class="eyebrow reveal">Замена стиков</span><h2 class="reveal">Какие стики я ставлю</h2>
  <p class="lead reveal">Подберу вариант под ваш геймпад и бюджет. Цена указана <b>${stickUnit}</b>.</p>
  <div class="stick-tech">${Object.values(stickTech).map((t) => `<div class="card reveal"><span class="ico">${icon("stick", 26)}</span><span class="tag-s">${esc(t.tag)}</span><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></div>`).join("")}</div>
  <div class="stick-opts">${stickTypes.map((t) => `<div class="card stick-opt reveal"><span class="tag-s">${esc(stickTech[t.tech].title)}</span><h3>${esc(t.name)}</h3><p class="big">${rub(t.price)}</p><span class="unit">${stickUnit}</span></div>`).join("")}</div>
  <div class="promo reveal" id="promo" data-discount="${promos.pairDiscount.percent}">
    <div class="promo-badge" aria-hidden="true">−${promos.pairDiscount.percent}%</div>
    <div class="promo-body">
      <span class="eyebrow">Акция</span>
      <h3>Замена двух аналогов — скидка ${promos.pairDiscount.percent}%</h3>
      <p>${esc(promos.pairDiscount.text)} Формула: (цена первого + цена второго) × 0,85.</p>
      <div class="promo-calc">
        <label>Первый аналог<select id="pr-a">${options(defA)}</select></label>
        <label>Второй аналог<select id="pr-b">${options(defB)}</select></label>
        <dl class="promo-res" aria-live="polite"><div><dt>Сумма</dt><dd id="pr-sum">${fmtRub(r.sum)}</dd></div><div><dt>Скидка ${promos.pairDiscount.percent}%</dt><dd id="pr-disc">−${fmtRub(r.discount)}</dd></div><div class="tot"><dt>Итого</dt><dd id="pr-total">${fmtRub(r.total)}</dd></div></dl>
      </div>
      <p class="note">Скидка считается от суммы двух выбранных стиков (типы могут быть разными). ${esc(diagnostics.short)}</p>
      <p><button type="button" class="btn" data-cb data-cb-promo hidden>Оставить заявку со скидкой ${promos.pairDiscount.percent}%</button></p>
      ${contactBtns()}
    </div>
  </div>
  <p class="free-clean reveal">${icon("shield", 22)}<span><b>Бесплатная внутренняя чистка.</b> ${esc(promos.freeCleaning.text)}</span></p>
  <p class="note reveal">Цены не являются публичной офертой. Ни одна технология не отменяет механический износ геймпада, поэтому я называю вариант и цену заранее, а не обещаю «навсегда». Гарантия на работу — 90 дней.</p>
</div></section>`;
}

export function contactSection(title = "Связаться со мной") {
  return `<section id="contact" class="alt"><div class="wrap two">
  <div class="reveal"><span class="eyebrow">Связь</span><h2>${esc(title)}</h2>
  <p class="lead">Позвоните или напишите в мессенджер в рабочее время (${site.hours}): подскажу по цене и срокам. ${esc(diagnostics.short)}</p>
  <ul class="ticks"><li>Гарантия 90 дней</li><li>Договор, расписка или акт</li></ul>
  <p class="note">Не настраиваю интернет на дому.</p></div>
  <div class="reveal">${contactBtns({ cls: "stack" })}</div>
  </div></section>`;
}

export function calcSection() {
  return `<section id="calc"><div class="wrap">
  <span class="eyebrow reveal">Калькулятор</span><h2 class="reveal">Сколько стоит ремонт</h2><p class="lead reveal">Выберите, что ремонтируем, модель и услугу. Цены фиксированные; где объём работ неизвестен, цену называю после диагностики.</p>
  <div class="calc reveal" id="calc-box">
  <label for="c-cat">Что ремонтируем</label><select id="c-cat"></select>
  <div id="c-model-row"><label for="c-model" id="c-model-l">Модель</label><select id="c-model"></select></div>
  <label for="c-srv">Услуга</label><select id="c-srv"></select>
  <div id="c-stick" hidden><label for="c-st1">Тип стика</label><select id="c-st1"></select><label for="c-qty">Сколько стиков меняем</label><select id="c-qty"><option value="1">1 стик</option><option value="2">2 стика (скидка ${promos.pairDiscount.percent}%)</option></select><div id="c-st2row" hidden><label for="c-st2">Тип второго стика</label><select id="c-st2"></select></div></div>
  <div id="c-lap" hidden><label for="c-lapm">Модель ноутбука</label><input id="c-lapm" type="text" maxlength="60" autocomplete="off" placeholder="Например: ASUS TUF F15 FX506"></div>
  <div class="res" id="c-res" aria-live="polite"></div>
  <dl class="calc-lines" id="c-lines" hidden></dl>
  <p class="note" id="c-meta"></p>
  <p class="note diag-note"><b>${esc(diagnostics.short)}</b></p>
  <button type="button" class="btn" data-cb data-cb-calc hidden id="c-req">Оставить заявку с расчётом</button><p class="note">Или позвоните и напишите, чтобы уточнить:</p>${contactBtns({ cls: "stack" })}</div>
  </div></section>`;
}

const navMain = [["/ceny/", "Цены"], ["/portfolio/", "Портфолио"], ["/#calc", "Калькулятор"], ["/o-mastere/", "О мастере"], ["/otzyvy/", "Отзывы"], ["/kontakty/", "Контакты"]];
const svcLinks = () => [...categories.map((c) => [`/${c.slug}/`, c.cat]), ...narrow.map((n) => [`/${n.slug}/`, n.h1.replace(/ в Ангарске$/, "")]), ["/vosstanovlennaya-tekhnika/", "Восстановленная техника"]];
function navHtml(path) {
  const svc = svcLinks();
  const inSvc = svc.some(([h]) => h === path);
  return `<div class="dd"><a class="dd-t" href="/#services"${inSvc ? ' aria-current="true"' : ""}>Услуги</a><button class="dd-b" aria-label="Список услуг" aria-expanded="false"><i></i></button><div class="dd-m">${svc.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("")}</div></div>` +
    navMain.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ""}>${t}</a>`).join("");
}

// Окно выбора cookie. Категория «Аналитика» существует только если подключена Яндекс.Метрика (METRIKA_ID); иначе есть лишь информационное окно.
function cookieUi(metrika) {
  const an = !!metrika;
  const links = `<a href="/cookies/">о файлах cookie</a> и <a href="/privacy/">политика обработки персональных данных</a>`;
  return `<div class="ck" id="ck" hidden role="region" aria-label="Настройки cookie">
  <div class="ck-main"><p><b>Файлы cookie</b></p>
  <p>${an ? `Для работы сайта используются необходимые технологии. С вашего согласия мы подключаем Яндекс.Метрику, чтобы понимать, какие разделы полезны.` : "Сайт не использует cookie и не сохраняет данные в вашем браузере. Аналитики и рекламных технологий нет, выбирать нечего."} Подробнее: ${links}.</p>
  <div class="ck-acts">${an ? `<button type="button" class="btn sm" id="ck-all">Принять все</button><button type="button" class="btn sm ghost" id="ck-min">Только необходимые</button><button type="button" class="btn sm ghost" id="ck-cfg">Настроить</button>` : `<button type="button" class="btn sm" id="ck-close">Понятно</button>`}</div></div>
  ${an ? `<div class="ck-set" hidden><label class="ck-row"><input type="checkbox" checked disabled><span><b>Необходимые</b>: запоминают ваш выбор настроек. Всегда включены.</span></label>
  <label class="ck-row"><input type="checkbox" id="ck-an"><span><b>Аналитика</b>: Яндекс.Метрика (посещаемость и карты кликов). Включается только по вашему согласию.</span></label>
  <div class="ck-acts"><button type="button" class="btn sm" id="ck-save">Сохранить выбор</button></div></div>` : ""}
</div>`;
}

const cbDialog = `<dialog id="cb-dialog" class="cb-dialog" aria-labelledby="cb-title"><form id="cb-form" method="dialog" novalidate>
  <button type="button" class="lb-x" data-cb-close aria-label="Закрыть">×</button>
  <h2 id="cb-title">Заказать обратный звонок</h2>
  <p class="note">Оставьте телефон, и мастер перезвонит в рабочее время (${site.hours}).</p>
  <p class="cb-calc" id="cb-calc" hidden></p>
  <label>Имя<input name="name" autocomplete="name" required maxlength="60"></label>
  <label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" required maxlength="20"></label>
  <label>Комментарий (необязательно)<textarea name="comment" rows="3" maxlength="500"></textarea></label>
  <label class="cb-hp" aria-hidden="true">Не заполняйте<input name="website" tabindex="-1" autocomplete="off"></label>
  <label class="cb-consent"><input type="checkbox" name="consent" required><span>Я даю <a href="/consent/" target="_blank" rel="noopener">согласие на обработку персональных данных</a> (имя, телефон) для обратной связи по этой заявке и ознакомлен с <a href="/privacy/" target="_blank" rel="noopener">политикой</a>.</span></label>
  <p class="cb-msg" id="cb-msg" role="status" aria-live="polite"></p>
  <button type="submit" class="btn">Отправить заявку</button>
  <p class="note">Данные передаются мастеру через Telegram-бота и не используются для рассылок.</p>
</form></dialog>`;
const mobileBar = `<nav class="mbar" aria-label="Быстрая связь"><a href="tel:${site.phoneRaw}" data-goal="call">${brandIcon("call", 20)}<span>Позвонить</span></a><a href="${esc(site.telegram)}" target="_blank" rel="noopener noreferrer" data-goal="messenger">${brandIcon("tg", 20)}<span>Telegram</span></a>${site.max ? `<a href="${esc(site.max)}" target="_blank" rel="noopener noreferrer" data-goal="messenger">${brandIcon("max", 20)}<span>MAX</span></a>` : ""}<button type="button" data-cb hidden><span>Заявка</span></button></nav>`;
export function videoSection() {
  return `<section id="video"><div class="wrap"><span class="eyebrow reveal">Видеовизитка</span><h2 class="reveal">Знакомство с мастером</h2>
  ${site.video ? `<div class="video-box reveal"><video controls preload="none" playsinline src="${esc(site.video)}"></video></div>` : `<div class="video-box video-wait reveal" role="img" aria-label="Место для видеовизитки мастера"><span>Видеовизитка появится здесь</span></div>`}
  </div></section>`;
}

export function layout({ path, title, desc, body, jsonld = [], hasPhoto, metrika, siteUrl, noindex = false }) {
  const url = siteUrl ? siteUrl.replace(/\/$/, "") + path : "";
  const local = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: site.brand, description: "Ремонт консолей, геймпадов, ноутбуков, ПК и смартфонов. Скупка техники.",
    telephone: site.phoneRaw, areaServed: site.city, address: { "@type": "PostalAddress", addressLocality: site.city, addressCountry: "RU" },
    openingHours: "Mo-Fr 10:00-20:00", sameAs: [site.vk, site.channel], ...(url ? { url: siteUrl } : {}),
  };
  const ld = [local, ...jsonld].map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ""}${url ? `<link rel="canonical" href="${url}">` : ""}
<meta name="theme-color" content="#0b0d12"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:locale" content="ru_RU">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/unbounded-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/onest-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css">
${ld}
</head><body${metrika ? ` data-ym="${Number(metrika)}"` : ""}>
<a class="skip" href="#main">К содержимому</a>
<div class="progress" id="progress"></div>
<header class="hdr"><div class="wrap bar">
  <a class="logo" href="/" aria-label="FinikFix, на главную"><span class="mark">ff</span><span>Finik<b>Fix</b></span></a>
  <nav id="nav" aria-label="Основное">${navHtml(path)}<a class="btn sm nav-cta" href="tel:${site.phoneRaw}" data-goal="call">Позвонить</a></nav>
  <a class="tel" href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a>
  <button class="burger" id="burger" aria-label="Меню" aria-expanded="false" aria-controls="nav"><i></i><i></i><i></i></button>
</div></header>
<main id="main">
${body}
</main>
<footer class="ftr"><div class="wrap">
  <div class="fgrid">
    <div><a class="logo" href="/"><span class="mark">ff</span><span>Finik<b>Fix</b></span></a><p>Ремонт консолей, геймпадов, ноутбуков, ПК и смартфонов в Ангарске. «${site.tagline}».</p></div>
    <div><h4>Услуги</h4>${categories.map((c) => `<a href="/${c.slug}/">${esc(c.cat)}</a>`).join("")}</div>
    <div><h4>Связь</h4><a href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a><a href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp</a><a href="${site.telegram}" target="_blank" rel="noopener noreferrer" data-goal="messenger">Telegram</a><a href="${site.channel}" target="_blank" rel="noopener">Telegram-канал</a><a href="${site.vk}" target="_blank" rel="noopener">ВКонтакте</a>${maxLink()}${emailLink()}<span>${site.hours}</span><span>${site.place}</span></div>
  </div>
  <p class="legal-line">${site.inn ? `ИНН ${esc(site.inn)}. ` : ""}Цены «от» и вилки не являются публичной офертой.</p>
  <p class="legal-line"><a href="/privacy/">Политика конфиденциальности</a> · <a href="/consent/">Согласие на обработку ПД</a> · <a href="/cookies/">Файлы cookie</a> · <a href="/terms/">Пользовательское соглашение</a> · <a href="/mailing/">Уведомления и рассылки</a> · <button type="button" class="linkbtn" id="ck-open">Настройки cookie</button> · © ${site.brand}</p>
</div></footer>
<nav class="float" aria-label="Быстрая связь"><a class="fl-call" href="tel:${site.phoneRaw}" aria-label="Позвонить мастеру: ${site.phone}" data-goal="call">${brandIcon("call", 24)}</a>${site.max ? `<a class="fl-max" href="${esc(site.max)}" target="_blank" rel="noopener noreferrer" aria-label="Написать в MAX" data-goal="messenger">${brandIcon("max", 28)}</a>` : ""}<a class="fl-tg" href="${esc(site.telegram)}" target="_blank" rel="noopener noreferrer" aria-label="Написать в Telegram" data-goal="messenger">${brandIcon("tg", 28)}</a><a class="fl-wa" href="${waLink}" target="_blank" rel="noopener noreferrer" aria-label="Написать в WhatsApp" data-goal="messenger">${brandIcon("wa", 28)}</a></nav>${mobileBar}${cbDialog}
<script>window.FF=${JSON.stringify({ calc: buildCalc() }).replace(/</g, "\\u003c")}</script>
${cookieUi(metrika)}
<script src="/assets/app.js" defer></script>
</body></html>`;
}

const crumbs = (cur) => `<nav class="crumbs wrap" aria-label="Навигация"><a href="/">Главная</a> / <span>${esc(cur)}</span></nav>`;
const faqLd = (faq) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
const stickServiceLd = (name, desc) => ({ ...serviceLd(name, desc), offers: { "@type": "AggregateOffer", priceCurrency: "RUB", lowPrice: Math.min(...stickTypes.map((t) => t.price)), highPrice: Math.max(...stickTypes.map((t) => t.price)), offerCount: stickTypes.length, description: `Цена за один аналог (стик). ${promos.pairDiscount.text}` } });
const serviceLd = (name, desc) => ({ "@context": "https://schema.org", "@type": "Service", name, description: desc, provider: { "@type": "LocalBusiness", name: site.brand, telephone: site.phoneRaw }, areaServed: site.city });

const problemIcons = ["stick", "hdmi", "fan", "power", "battery"];
const stepIcons = ["chat", "search", "tag", "shield"];
const tools = [["meter", "Замеры напряжений"], ["chip", "Работа по схемам"], ["code", "Прошивки PS3/PS4/Switch"], ["shield", "Договор и гарантия 90 дней"]];

const trustCards = [
  ["gamepad", "Специализируюсь на игровой технике", "Починил более 500 консолей и геймпадов. Знаю типичные «болячки» PS5, Xbox Series X, Switch и DualSense — не учусь на вашем устройстве."],
  ["shield", "Гарантия до 90 дней", "Если после ремонта проблема вернётся — переделаю бесплатно. Даю гарантию на работу и запчасти, а не «на словах»."],
  ["tag", "Прозрачные цены без сюрпризов", "Стоимость согласовываю до начала работ. Стандартные работы — по фиксированному прайсу, сложный ремонт — после диагностики. Никаких «доплат в конце»."],
  ["clock", "Быстро и удобно", "Многие ремонты делаю в день обращения. Самовывоз в Ангарске или встреча в городе. По договорённости могу забрать устройство и вернуть после ремонта."],
  ["toolbox", "Профессиональное оборудование", "Паяльная станция, термостол, микроскоп — не «ремонт на коленке». Сложные случаи (замена HDMI, BGA-пайка, чистка после жидкости) мне по плечу."],
  ["box", "Скупка техники в любом состоянии", "Скупаю ноутбуки, консоли, геймпады и комплектующие — даже нерабочие. Оценка в день обращения, оплата наличными или переводом."],
];

export function homePage(o) {
  const problems = [["/zamena-stika-gamepada/", "Дрифт стика", "Курсор уезжает сам. Заменю аналог, поставлю датчики Холла."], ["/zamena-hdmi-konsoli/", "Картинка только в наклоне", "Изношен HDMI-порт. Замена: PS4 и Xbox One — 4 500 ₽, PS5 — 6 500 ₽."], ["/remont-playstation/", "Перегрев и шум", "Обслуживание системы охлаждения: PS4 — 3 500 ₽, PS5 — 4 000 ₽."], ["/remont-xbox/", "Не включается", "Проверю питание и плату. Стоимость ремонта — после диагностики."], ["/remont-gamepadov/", "Не заряжается", "Замена аккумулятора геймпада — 2 000 ₽ (аккумулятор входит в цену)."]];
  const steps = [["Обращение", "Позвоните или напишите в MAX или Telegram."], ["Диагностика", "Находим причину. Бесплатно, если вы соглашаетесь на ремонт; при отказе — 1 000 ₽ и акт дефектации."], ["Согласование цены", "Называю точную стоимость. Без вашего согласия не начинаю."], ["Ремонт и выдача", "Договор или расписка, гарантия 90 дней."]];
  const body = `
<section class="hero hero-c hs"><div class="hero-bg" aria-hidden="true"><i class="orb o1"></i><i class="orb o2"></i></div>
${heroSlider()}
<div class="wrap hc-grid">
  <div class="hc-txt">
    <span class="kicker reveal"><span class="mark">ff</span> FinikFix · Ангарск · ${site.tagline}</span>
    <h1 class="reveal">Ремонт <span class="o">консолей, геймпадов, смартфонов и ноутбуков</span> в&nbsp;Ангарске и&nbsp;Иркутске<span class="h1-tail"> — бесплатная диагностика, гарантия до 90 дней</span></h1>
    <p class="hero-p reveal">Не включается Xbox? Дрифтит стик на DualSense? Перегревается PS5? Починю за один визит — с прозрачной ценой и гарантией. Работаю с PlayStation, Xbox, Nintendo, геймпадами, ноутбуками, ПК и смартфонами.</p>
    <div class="hero-cta reveal"><button type="button" class="cbtn cb-req" data-cb hidden>${brandIcon("call", 22)}<span>Оставить заявку</span></button><a class="cbtn cb-call" href="tel:${site.phoneRaw}" data-goal="call">${brandIcon("call", 22)}<span>Позвонить: ${site.phone}</span></a></div>
    <p class="hero-note reveal">Бесплатная диагностика при согласии на ремонт (при отказе — 1 000 ₽, выдаю акт дефектации). Выезд по договорённости. На дому интернет не настраиваю — только ремонт техники.</p>
    <div class="hero-alt reveal" aria-label="Другие способы связи"><button type="button" class="cbtn cb-copy" data-copy="${site.phoneRaw}" data-copy-label="${site.phone}" aria-label="Скопировать номер ${site.phone}"><span>Скопировать номер</span></button>${site.max ? `<a class="cbtn cb-max" href="${esc(site.max)}" target="_blank" rel="noopener noreferrer" data-goal="messenger">${brandIcon("max", 22)}<span>MAX</span></a>` : ""}<a class="cbtn cb-tg" href="${esc(site.telegram)}" target="_blank" rel="noopener noreferrer" data-goal="messenger">${brandIcon("tg", 22)}<span>Telegram</span></a></div>
    <ul class="chips reveal"><li>Договор, расписка или акт</li><li>Приём по записи</li></ul>
    <ul class="hc-stats reveal" aria-label="Коротко о мастере"><li><b>10+</b><span>лет с консолями</span></li><li><b>90</b><span>дней гарантии</span></li><li><b>4,8 ★</b><span>рейтинг на Авито (62 отзыва)</span></li></ul>
  </div>
</div>
<div class="marquee" aria-hidden="true"><div class="track">${[0, 1].map(() => `<span>${["PlayStation", "Xbox", "Nintendo Switch", "DualSense", "Joy-Con", "Steam Deck", "Ноутбуки", "Смартфоны", "ПК", "Скупка"].map((x) => `<em>${x}</em>`).join("")}</span>`).join("")}</div></div>
</section>

<section class="trust" id="trust"><div class="wrap">
  <span class="eyebrow reveal">Мастер</span><h2 class="reveal">Почему мне доверяют ремонт</h2>
  <div class="trust-grid">${trustCards.map(([ic, t, p]) => `<article class="card trust-card reveal"><span class="ico lg">${icon(ic, 32)}</span><h3>${esc(t)}</h3><p>${esc(p)}</p></article>`).join("")}</div>
  <p class="cat-more reveal"><a class="btn" href="#calc" data-goal="calc">Узнать стоимость ремонта</a></p>
</div></section>

<section id="services"><div class="wrap">
  <span class="eyebrow reveal">Услуги</span><h2 class="reveal">Что ремонтируем</h2><p class="lead reveal">Основное направление — консоли и геймпады. Остальную технику тоже принимаю в мастерской.</p>
  <div class="cat-grid">${homeCats.map((hc) => {
    const c = categories.find((x) => x.slug === hc.slug);
    const text = c.intro.split(". ")[0].replace(/\.?$/, ".");
    const pic = hc.img ? `<img src="/assets/img/cats/${hc.img}"${imageUrl("cats-hq", hc.img) ? ` data-hq-src="${imageUrl("cats-hq", hc.img)}"` : ""} alt="${esc(hc.title)} в мастерской FinikFix" width="800" height="500" loading="lazy" decoding="async">` : `<span class="cat-ph" aria-hidden="true">${icon(hc.icon, 56)}</span>`;
    return `<a class="cat-card reveal" href="/${hc.slug}/"><span class="cat-pic">${pic}</span><span class="cat-body"><span class="cat-t"><span class="ico">${icon(hc.icon, 22)}</span><h3>${esc(hc.title)}</h3></span><span class="cat-d">${esc(text)}</span><span class="more">Подробнее →</span></span></a>`;
  }).join("")}</div>
  <p class="cat-more reveal">Также: <a href="/vosstanovlennaya-tekhnika/">восстановленная техника</a> · <a href="/skupka/">скупка техники</a></p>
</div></section>

<section class="alt" id="works-home"><div class="wrap">
  <span class="eyebrow">Портфолио</span><h2>Наши работы — реальный ремонт</h2><p class="lead">Фото и цены выполненных ремонтов: консоли, геймпады, пайка. Цены — это стоимость конкретных работ, а не текущий прайс.</p>
  <div class="works-grid" id="works-home-grid" aria-live="polite"></div>
  <p class="cat-more"><a class="btn" id="works-all-btn" href="/portfolio/" data-goal="portfolio">Смотреть все работы</a></p>
</div></section>

<section class="alt"><div class="wrap">
  <span class="eyebrow reveal">Симптомы</span><h2 class="reveal">Частые проблемы</h2><p class="lead reveal">Узнали свою? Позвоните или напишите — всё посчитаем в калькуляторе или после диагностики.</p>
  <div class="grid five">${problems.map(([h, t, p], i) => `<a class="card tile prob reveal" href="${h}"><span class="ico lg">${icon(problemIcons[i], 34)}</span><h3>${esc(t)}</h3><p>${esc(p).replace(/(\d) (\d)/g, "$1\u00a0$2").replace(/ ₽/g, "\u00a0₽")}</p><span class="more">Подробнее →</span></a>`).join("")}</div>
</div></section>

<section class="promo-strip-sec"><div class="wrap"><a class="promo-strip reveal" href="/zamena-stika-gamepada/#promo"><span class="promo-badge" aria-hidden="true">−15%</span><span><b>Замена двух аналогов — скидка 15%.</b> Посчитайте итог для своих аналогов</span><span class="more">Рассчитать →</span></a></div></section>

<section><div class="wrap">
  <span class="eyebrow reveal">Процесс</span><h2 class="reveal">Как я работаю</h2><p class="lead reveal">Без сюрпризов в цене.</p>
  <div class="grid steps">${steps.map(([t, p], i) => `<div class="card reveal"><span class="sico">${icon(stepIcons[i], 30)}</span><h3>${t}</h3><p>${p}</p></div>`).join("")}</div>
  <div class="tools reveal"><h3>Как я ремонтирую</h3><ul>${tools.map(([ic, t]) => `<li>${icon(ic, 34)}<span>${t}</span></li>`).join("")}</ul></div>
</div></section>

<section class="alt"><div class="wrap two">
  <div class="reveal"><span class="eyebrow">Скупка</span><h2>Скупка техники</h2><p class="lead">Куплю консоли, ноутбуки, комплектующие в любом состоянии — даже нерабочие. Оформляю по расписке или акту приёмки.</p><a class="btn" href="/skupka/">Условия скупки</a></div>
  ${noInternet}
</div></section>

${calcSection()}
${videoSection()}

<section class="alt"><div class="wrap">
  <span class="eyebrow reveal">Доказательства</span><h2 class="reveal">Реальные работы и отзывы</h2>
  <p class="lead reveal">Рейтинг профиля на Авито — 4,8 (62 отзыва). Читайте отзывы клиентов и смотрите реальные кейсы с фото прямо на сайте.</p>
  <div class="acts reveal">${portfolioBtn()}<a class="btn ghost" href="/otzyvy/">Читать отзывы</a></div>
</div></section>

${contactSection()}

<section><div class="wrap"><span class="eyebrow reveal">Контакты</span><h2 class="reveal">Где найти</h2>
  <div class="grid">
   <div class="card reveal"><h3>Телефон</h3><p><a href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a></p></div>
   <div class="card reveal"><h3>Мессенджеры</h3><p><a href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp</a> · <a href="${site.telegram}" target="_blank" rel="noopener" data-goal="messenger">Telegram</a> · <a href="${site.vk}" target="_blank" rel="noopener">ВКонтакте</a>${site.max ? ` · ${maxLink()}` : ""}</p></div>
   <div class="card reveal"><h3>Режим работы</h3><p>${site.hours}</p></div>
   <div class="card reveal"><h3>Где</h3><p>${site.city}, ${site.place}</p></div>
  </div></div></section>`;
  return layout({ ...o, path: "/", title: `Ремонт консолей, геймпадов, смартфонов и ноутбуков в Ангарске и Иркутске — ${site.brand}`, desc: "Ремонт PlayStation, Xbox, Nintendo Switch, геймпадов, ноутбуков, ПК и смартфонов в Ангарске и Иркутске. Диагностика бесплатна при согласии на ремонт (1 000 ₽ при отказе), гарантия до 90 дней, фиксированные цены. Скупка техники.", body });
}

export function categoryPage(c, o) {
  const items = priceRows(c.items, c.fam);
  const body = `${crumbs(c.cat)}
<section class="page-hero"><div class="wrap"><span class="badge">${esc(c.cat)}</span><h1>${esc(c.h1)}</h1><p class="hero-p">${esc(c.intro)}</p>
 ${contactBtns()}</div></section>
${c.noprices ? "" : `<section><div class="wrap"><span class="eyebrow">Цены</span><h2>Услуги и цены</h2>${priceTable(items)}<p class="note">${c.priceNote ? esc(c.priceNote) + " " : ""}${esc(priceNote)}</p></div></section>`}
${c.more ? `<section><div class="wrap two"><div><span class="eyebrow">Что делаю</span><h2>Что ещё ремонтирую</h2><ul class="ticks">${c.more.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>${c.devices ? `<p class="note">${esc(c.devices)}</p>` : ""}</div><div><span class="eyebrow">Как всё устроено</span><h2>Порядок работы</h2><div class="grid one steps">${c.process.map(([h, p]) => `<div class="card reveal"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></div></div></section>` : ""}
<section class="alt"><div class="wrap two"><div><span class="eyebrow">Подход</span><h2>Чем отличается ремонт</h2><ul class="ticks">${c.diff.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>${c.links.length ? `<p>${c.links.map(([s, t]) => `<a href="/${s}/">${esc(t)} →</a>`).join("<br>")}</p>` : ""}</div>${noInternet}</div></section>
${c.slug === "remont-gamepadov" ? sticksBlock() : ""}
${contactSection()}
<section><div class="wrap"><span class="eyebrow">FAQ</span><h2>Частые вопросы</h2>${faqBlock(c.faq)}</div></section>
${relatedWorks(c.slug)}`;
  return layout({ ...o, path: `/${c.slug}/`, title: c.title + ` — ${site.brand}`, desc: c.desc, body, jsonld: [serviceLd(c.h1, c.desc), faqLd(c.faq)] });
}

export function narrowPage(n, o) {
  const body = `${crumbs(n.h1)}
<section class="page-hero"><div class="wrap"><span class="badge">${esc(n.cat)}</span><h1>${esc(n.h1)}</h1></div></section>
<section><div class="wrap article">${n.sections.map(([h, t]) => `<h2 class="reveal">${esc(h)}</h2><p class="reveal">${esc(t)}</p>`).join("")}
 <p><a href="/${n.back[0]}/">${esc(n.back[1])} →</a></p></div></section>
${relatedWorks(n.slug)}
${n.slug === "zamena-stika-gamepada" ? sticksBlock() : ""}
${contactSection()}
<section class="alt"><div class="wrap"><span class="eyebrow">FAQ</span><h2>Частые вопросы</h2>${faqBlock(n.faq)}</div></section>`;
  return layout({ ...o, path: `/${n.slug}/`, title: n.title + ` — ${site.brand}`, desc: n.desc, body, jsonld: [n.slug === "zamena-stika-gamepada" ? stickServiceLd(n.h1, n.desc) : serviceLd(n.h1, n.desc), faqLd(n.faq)] });
}

export function pricesPage(o) {
  const body = `${crumbs("Цены")}
<section class="page-hero"><div class="wrap"><h1>Цены на ремонт в Ангарске</h1><p class="hero-p"><b>Цены фиксированные.</b> Где объём работ неизвестен, стоимость определяется после диагностики. ${esc(diagnostics.short)} Цены не являются публичной офертой.</p></div></section>
<section><div class="wrap">${priceGroupRows().map((g) => `<div class="pgroup reveal"><h3>${esc(g.name)}</h3>${priceTable(g.rows)}${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}</div>`).join("")}</div></section>
${calcSection()}${contactSection()}`;
  return layout({ ...o, path: "/ceny/", title: pagesOther.prices.title, desc: pagesOther.prices.desc, body });
}

export function aboutPage(o) {
  const body = `${crumbs("О мастере")}
<section class="page-hero"><div class="wrap two"><div><span class="badge">О мастере</span><h1>Мастер FinikFix: ремонт на совесть</h1>
<p class="hero-p">Консолями занимаюсь 10+ лет, смартфонами — 3 года. Ремонтирую в мастерской в Ангарске.</p>
<ul class="ticks"><li>Микроскоп и замеры напряжений</li><li>Ремонт по схемам</li><li>Договор, расписка или акт</li><li>Гарантия 90 дней</li><li>Специализация: замена HDMI, датчики Холла вместо изношенных стиков, прошивки PS3/PS4/Switch</li></ul>
<div class="acts">${portfolioBtn()}</div></div>${photoBlock(o, "reveal")}</div></section>
${contactSection()}`;
  return layout({ ...o, path: "/o-mastere/", title: pagesOther.about.title, desc: pagesOther.about.desc, body });
}

export function portfolioPage(o) {
  const body = `${crumbs("Портфолио")}
<section class="page-hero"><div class="wrap"><h1>Портфолио: выполненные ремонты</h1><p class="hero-p">Фото реальных работ из мастерской FinikFix. Выберите категорию, чтобы посмотреть похожие ремонты.</p></div></section>
<section><div class="wrap">
  <div class="works-filters" id="works-filters" role="group" aria-label="Категории"></div>
  <div class="works-grid" id="works-grid" aria-live="polite"></div>
  <div id="works-empty" class="card" hidden><h3>Работы скоро появятся</h3><p>Мы добавляем фото выполненных ремонтов. Свяжитесь с мастером, и он расскажет о похожих работах.</p></div>
  <noscript><p class="note">Для просмотра галереи включите JavaScript.</p></noscript>
</div></section>
<dialog id="lightbox" class="lightbox" aria-label="Просмотр работы"><div class="lb-box"><button type="button" class="lb-x" aria-label="Закрыть">×</button><div class="lb-pic"><button type="button" class="lb-n lb-prev" aria-label="Предыдущее фото">‹</button><img alt=""><button type="button" class="lb-n lb-next" aria-label="Следующее фото">›</button></div><div class="lb-thumbs" hidden></div><p class="lb-photo-status" role="status" aria-live="polite"></p><div class="lb-txt"><span class="lb-badge"></span><h2 class="lb-title"></h2><p class="lb-desc"></p><p class="lb-price"></p><p class="lb-problem"></p><p class="lb-solution"></p><div class="lb-count"></div><div class="lb-actions"><a class="btn sm" href="#contact">Связаться с мастером</a><button type="button" class="btn sm ghost" data-cb hidden>Оставить заявку</button></div></div></div></dialog>
${contactSection()}`;
  return layout({ ...o, path: "/portfolio/", title: "Портфолио работ — FinikFix, Ангарск", desc: "Фото выполненных ремонтов игровых консолей, геймпадов, ноутбуков и ПК в мастерской FinikFix, Ангарск.", body });
}

export function reviewsPage(o) {
  const body = `${crumbs("Отзывы")}
<section class="page-hero"><div class="wrap"><h1>Отзывы клиентов</h1><p class="hero-p">Отзывы с Авито и отзывы, оставленные на этом сайте, показываются отдельно. Новые отзывы с сайта публикуются только после проверки.</p>
<div class="acts">${portfolioBtn()}</div></div></section>
<section><div class="wrap"><span class="eyebrow">Авито</span><h2>Отзывы на Авито</h2>
  <div class="card rv-stats"><p class="big">4,8 из 5 · 62 отзыва</p><p class="note">Источник: профиль «Ремонт цифровой техники» на Авито, данные на 5 ноября 2026: 58 оценок «5», одна «3», три «1». Это общий рейтинг профиля (в него входят и покупки). Оценки отдельных отзывов в выгрузке не указаны, поэтому ниже они не показаны. Этот рейтинг не является рейтингом сайта.</p></div>
  <div id="rv-avito" class="rv-list" aria-live="polite"></div><noscript><p class="note">Для просмотра отзывов включите JavaScript или откройте профиль на Авито.</p></noscript></div></section>
<section class="alt"><div class="wrap"><span class="eyebrow">FinikFix</span><h2>Отзывы на сайте</h2>
  <p id="rv-site-sum" class="note"></p><div id="rv-site" class="rv-list" aria-live="polite"></div>
  <div id="rv-form-wrap" hidden><h3>Оставить отзыв</h3>
  <form id="rv-form" class="rv-form" novalidate>
    <label>Имя<input name="name" required maxlength="60" autocomplete="given-name"></label>
    <fieldset class="rv-stars"><legend>Оценка</legend>${[5, 4, 3, 2, 1].map((n) => `<label><input type="radio" name="rating" value="${n}" required><span>${n} ★</span></label>`).join("")}</fieldset>
    <label>Отзыв<textarea name="text" rows="5" required minlength="10" maxlength="1500"></textarea></label>
    <label class="cb-hp" aria-hidden="true">Не заполняйте<input name="website" tabindex="-1" autocomplete="off"></label>
    <label class="cb-consent"><input type="checkbox" name="consent" required><span>Я согласен на <a href="/consent/" target="_blank" rel="noopener">обработку персональных данных</a> и публикацию моего имени и отзыва на сайте после проверки.</span></label>
    <p class="cb-msg" id="rv-msg" role="status" aria-live="polite"></p>
    <button type="submit" class="btn">Отправить отзыв</button>
    <p class="note">Отзыв сохраняется и проверяется мастером. Ссылки и контакты в тексте не принимаются.</p>
  </form></div></div></section>
${contactSection()}`;
  return layout({ ...o, path: "/otzyvy/", title: pagesOther.reviews.title, desc: pagesOther.reviews.desc, body });
}

export function contactsPage(o) {
  const body = `${crumbs("Контакты")}
<section class="page-hero"><div class="wrap"><h1>Контакты</h1></div></section>
<section><div class="wrap two"><div class="grid one">
  <div class="card reveal"><h3>Телефон</h3><p><a href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a></p></div>
  <div class="card reveal"><h3>Мессенджеры</h3><p><a href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp</a> · <a href="${site.telegram}" target="_blank" rel="noopener" data-goal="messenger">Telegram</a> · <a href="${site.vk}" target="_blank" rel="noopener">ВКонтакте</a> · <a href="${site.channel}" target="_blank" rel="noopener">Telegram-канал</a></p></div>
  <div class="card reveal"><h3>Почта</h3><p>${emailLink()}</p></div>
  <div class="card reveal"><h3>Режим работы</h3><p>${site.hours}</p></div>
  <div class="card reveal"><h3>Где</h3><p>${site.city}, ${site.place}</p></div>
  ${noInternet}</div><div class="reveal">${contactBtns({ wa: true, cls: "stack" })}</div></div></section>`;
  return layout({ ...o, path: "/kontakty/", title: pagesOther.contacts.title, desc: pagesOther.contacts.desc, body });
}

export function shopPage(o) {
  const body = `${crumbs("Восстановленная техника")}
<section class="page-hero"><div class="wrap"><h1>Восстановленная техника</h1><p class="hero-p">Куплено, отремонтировано и проверено. Восстановлено после ремонта, гарантия 90 дней. Наличие уточняйте.</p></div></section>
<section><div class="wrap"><div class="grid">${shop.map((s) => `<div class="card reveal"><h3>${esc(s.name)}</h3><p class="big">${rub(s.price)}</p><p>Восстановлено после ремонта, гарантия 90 дней</p><a class="btn sm" href="#contact">Узнать наличие</a></div>`).join("")}</div></div></section>
${contactSection("Узнать наличие")}`;
  return layout({ ...o, path: "/vosstanovlennaya-tekhnika/", title: pagesOther.shop.title, desc: pagesOther.shop.desc, body });
}

export function legalPage(o, path, title, html) {
  const body = `${crumbs(title)}<section><div class="wrap article"><h1>${esc(title)}</h1>${html}</div></section>`;
  return layout({ ...o, path, title: `${title} — ${site.brand}`, desc: title, body, noindex: true });
}

