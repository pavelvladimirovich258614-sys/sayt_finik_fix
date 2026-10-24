import { site, prices, priceGroups, shop, categories, narrow, pagesOther } from "./data.mjs";

export const rub = (n) => n.toLocaleString("ru-RU").replace(/ | /g, " ") + " ₽";
export const priceText = ([, p, fixed]) => (p == null ? "по запросу" : (fixed ? "" : "от ") + rub(p));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const waLink = `${site.whatsapp}?text=${encodeURIComponent(site.preset)}`;

export function priceTable(items) {
  return `<table class="ptable">${items.map((i) => `<tr><td>${esc(i[0])}</td><td>${priceText(i)}</td></tr>`).join("")}</table>`;
}

export const portfolioBtn = (cls = "") => `<a class="btn ${cls}" href="${site.avito}" target="_blank" rel="noopener" data-goal="portfolio">${esc(site.portfolioText)}</a>`;

export const faqBlock = (faq) => `<div class="faq">${faq.map(([q, a]) => `<details class="reveal"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;

export const noInternet = `<div class="card warn reveal"><span class="tag">Чего я НЕ делаю</span><h3>Не настраиваю интернет на дому</h3><p>Только ремонт цифровой техники. Выезд возможен по договорённости, но не для настройки интернета.</p></div>`;

export function photoBlock(hasPhoto, cls = "") {
  return hasPhoto
    ? `<figure class="photo ${cls}"><img src="/assets/img/${site.photo}" alt="Мастер FinikFix, Ангарск" width="640" height="800" loading="eager"><figcaption>${esc(site.owner)}, мастер FinikFix</figcaption></figure>`
    : `<figure class="photo ph ${cls}"><div><b>ff</b><span>Здесь будет фото мастера</span></div></figure>`;
}

export function leadForm(defaultCat = "") {
  const opts = [...categories.map((c) => c.cat), "Другое"];
  return `<form class="form reveal" id="lead" novalidate>
  <label for="f-name">Имя</label><input id="f-name" name="name" required autocomplete="name" maxlength="80">
  <label for="f-phone">Телефон</label><input id="f-phone" name="phone" required inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__">
  <label for="f-cat">Что ремонтируем</label><select id="f-cat" name="category">${opts.map((o) => `<option${o === defaultCat ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>
  <label for="f-msg">Комментарий</label><textarea id="f-msg" name="comment" rows="3" maxlength="1000" placeholder="Модель, что случилось"></textarea>
  <input class="hp" id="f-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label class="chk"><input type="checkbox" id="f-ok" name="consent"><span>Согласен(на) на <a href="/consent/" target="_blank">обработку персональных данных</a> и с <a href="/privacy/" target="_blank">политикой конфиденциальности</a></span></label>
  <button class="btn" type="submit">Отправить заявку</button>
  <div class="msg" id="f-res" role="status"></div>
  <p class="note">Не настраиваю интернет на дому.</p>
</form>`;
}

export function requestSection(defaultCat = "", title = "Оставить заявку") {
  return `<section id="request" class="alt"><div class="wrap two">
  <div class="reveal"><span class="eyebrow">Заявка</span><h2>${esc(title)}</h2>
  <p class="lead">Перезвоню в рабочее время (${site.hours}) и подскажу по цене и срокам. Диагностика бесплатная.</p>
  <ul class="ticks"><li>Гарантия 90 дней</li><li>Договор, расписка или акт</li><li>Чек «Мой налог» по запросу</li></ul>
  <p>Или сразу: <a href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a> · <a href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp</a> · <a href="${site.telegram}" target="_blank" rel="noopener" data-goal="messenger">Telegram</a></p></div>
  ${leadForm(defaultCat)}
  </div></section>`;
}

export function calcSection() {
  return `<section id="calc"><div class="wrap">
  <span class="eyebrow reveal">Калькулятор</span><h2 class="reveal">Сколько это примерно стоит</h2><p class="lead reveal">Выберите устройство и услугу — получите ориентир. Точная стоимость — после бесплатной диагностики.</p>
  <div class="calc reveal" id="calc-box"><label for="c-dev">Устройство</label><select id="c-dev"></select><label for="c-srv">Услуга</label><select id="c-srv"></select>
  <div class="res" id="c-res" aria-live="polite"></div><a id="c-btn" class="btn" href="#request">Оставить заявку</a></div>
  </div></section>`;
}

const nav = [["/#services", "Услуги"], ["/ceny/", "Цены"], ["/#calc", "Калькулятор"], ["/skupka/", "Скупка"], ["/o-mastere/", "О мастере"], ["/otzyvy/", "Отзывы"], ["/kontakty/", "Контакты"]];

export function layout({ path, title, desc, body, jsonld = [], hasPhoto, metrika, siteUrl, noindex = false }) {
  const url = siteUrl ? siteUrl.replace(/\/$/, "") + path : "";
  const local = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: site.brand, description: "Ремонт консолей, геймпадов, ноутбуков, ПК и смартфонов. Скупка техники.",
    telephone: site.phoneRaw, areaServed: site.city, address: { "@type": "PostalAddress", addressLocality: site.city, addressCountry: "RU" },
    openingHours: "Mo-Fr 10:00-20:00", sameAs: [site.vk, site.channel], ...(url ? { url: siteUrl } : {}),
  };
  const ld = [local, ...jsonld].map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  const ym = metrika ? `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${Number(metrika)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});window.__ym=${Number(metrika)};</script>` : "";
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ""}${url ? `<link rel="canonical" href="${url}">` : ""}
<meta name="theme-color" content="#0b0d12"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:locale" content="ru_RU">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
${ld}
</head><body>
<a class="skip" href="#main">К содержимому</a>
<header class="hdr"><div class="wrap bar">
  <a class="logo" href="/" aria-label="FinikFix, на главную"><span class="mark">ff</span><span>Finik<b>Fix</b></span></a>
  <nav id="nav" aria-label="Основное">${nav.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
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
    <div><h4>Связь</h4><a href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a><a href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp</a><a href="${site.telegram}" target="_blank" rel="noopener" data-goal="messenger">Telegram</a><a href="${site.channel}" target="_blank" rel="noopener">Telegram-канал</a><a href="${site.vk}" target="_blank" rel="noopener">ВКонтакте</a><span>${site.hours}</span><span>${site.place}</span></div>
  </div>
  <p class="legal-line">${site.inn ? `ИНН ${esc(site.inn)}. ` : ""}Исполнитель — самозанятый, применяет НПД. Цены «от» и вилки не являются публичной офертой.</p>
  <p class="legal-line"><a href="/privacy/">Политика конфиденциальности</a> · <a href="/consent/">Согласие на обработку ПД</a> · © ${site.brand}</p>
</div></footer>
<div class="float"><a class="wa" href="${waLink}" target="_blank" rel="noopener" aria-label="Написать в WhatsApp" data-goal="messenger">WA</a><a class="tg" href="${site.telegram}" target="_blank" rel="noopener" aria-label="Написать в Telegram" data-goal="messenger">TG</a></div>
<script>window.FF=${JSON.stringify({ groups: priceGroups.map((g) => ({ name: g.name, items: g.items.map((i) => [i[0], i[1], !!i[2]]) })), avito: site.avito })}</script>
${ym}
<script src="/assets/app.js" defer></script>
</body></html>`;
}

const crumbs = (cur) => `<nav class="crumbs wrap" aria-label="Навигация"><a href="/">Главная</a> / <span>${esc(cur)}</span></nav>`;
const faqLd = (faq) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
const serviceLd = (name, desc) => ({ "@context": "https://schema.org", "@type": "Service", name, description: desc, provider: { "@type": "LocalBusiness", name: site.brand, telephone: site.phoneRaw }, areaServed: site.city });

export function homePage(o) {
  const tiles = [...categories.filter((c) => c.slug !== "skupka").map((c) => [`/${c.slug}/`, c.cat, c.intro.split(". ")[0] + ".", c.icon]), ["/vosstanovlennaya-tekhnika/", "Восстановленная техника", "Куплено, отремонтировано, с гарантией 90 дней.", "♻"]];
  const problems = [["/zamena-stika-gamepada/", "Дрифт стика", "Курсор уезжает сам. Заменю аналог, поставлю датчики Холла."], ["/zamena-hdmi-konsoli/", "Картинка только в наклоне", "Изношен HDMI-порт. Замена от 2 500 ₽."], ["/remont-playstation/", "Перегрев и шум", "Чистка системы охлаждения от 1 200 ₽."], ["/remont-xbox/", "Не включается", "Проверю питание, чип управления питанием, плату."], ["/remont-gamepadov/", "Не заряжается", "Порт Micro-USB от 1 500 ₽, аккумулятор геймпада от 2 000 ₽."]];
  const steps = [["Заявка", "Звоните, пишите в мессенджер или оставьте заявку на сайте."], ["Бесплатная диагностика", "Находим причину неисправности."], ["Согласование цены", "Называю точную стоимость. Без вашего согласия не начинаю."], ["Ремонт и выдача", "Договор или расписка, гарантия 90 дней."]];
  const body = `
<section class="hero"><div class="wrap hero-grid">
  <div class="hero-txt">
    <span class="badge reveal">Ангарск · ${site.tagline}</span>
    <h1 class="reveal">Ремонт консолей и геймпадов <em>в Ангарске</em></h1>
    <p class="hero-p reveal">Диагностика бесплатно. Гарантия 90 дней. Консоли и геймпады — моя основная специализация: опыт 10+ лет, микроскоп, замеры напряжений. Федеральные сети консоли не берут, я чиню.</p>
    <div class="acts reveal"><a class="btn" href="#request" data-goal="lead_click">Оставить заявку</a><a class="btn ghost" href="tel:${site.phoneRaw}" data-goal="call">Позвонить</a><a class="btn ghost" href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp / Telegram</a></div>
    <ul class="chips reveal"><li>Договор, расписка или акт</li><li>Рейтинг 4,8 · 60 отзывов на Авито</li><li>Чек «Мой налог» по запросу</li></ul>
  </div>
  ${photoBlock(o.hasPhoto, "reveal hero-photo")}
</div></section>

<section id="services"><div class="wrap">
  <span class="eyebrow reveal">Услуги</span><h2 class="reveal">Что ремонтирую</h2><p class="lead reveal">Основное направление — консоли и геймпады. Остальное делаю в той же мастерской.</p>
  <div class="grid">${tiles.map(([h, t, p, ic]) => `<a class="card tile reveal" href="${h}"><span class="ico">${ic}</span><h3>${esc(t)}</h3><p>${esc(p)}</p><span class="more">Подробнее →</span></a>`).join("")}</div>
</div></section>

<section class="alt"><div class="wrap">
  <span class="eyebrow reveal">Симптомы</span><h2 class="reveal">Частые проблемы</h2><p class="lead reveal">Узнали свою? Оставьте заявку — цену назову после бесплатной диагностики.</p>
  <div class="grid">${problems.map(([h, t, p]) => `<a class="card tile reveal" href="${h}"><h3>${esc(t)}</h3><p>${esc(p)}</p><span class="more">Читать →</span></a>`).join("")}</div>
</div></section>

<section><div class="wrap">
  <span class="eyebrow reveal">Процесс</span><h2 class="reveal">Как я работаю</h2><p class="lead reveal">Без сюрпризов в цене.</p>
  <div class="grid steps">${steps.map(([t, p]) => `<div class="card reveal"><h3>${t}</h3><p>${p}</p></div>`).join("")}</div>
</div></section>

<section class="alt"><div class="wrap two">
  <div class="reveal"><span class="eyebrow">Скупка</span><h2>Скупка техники</h2><p class="lead">Куплю консоли, ноутбуки, комплектующие в любом состоянии — даже нерабочие. Оформляю по расписке или акту приёмки.</p><a class="btn" href="/skupka/">Условия скупки</a></div>
  ${noInternet}
</div></section>

${calcSection()}

<section class="alt"><div class="wrap">
  <span class="eyebrow reveal">Доказательства</span><h2 class="reveal">Реальные работы и отзывы</h2>
  <p class="lead reveal">Рейтинг 4,8 и 60 отзывов на Авито. Фото ремонтов — в портфолио, там всё без ретуши.</p>
  <div class="reveal">${portfolioBtn()}</div>
</div></section>

${requestSection()}

<section><div class="wrap"><span class="eyebrow reveal">Контакты</span><h2 class="reveal">Где найти</h2>
  <div class="grid">
   <div class="card reveal"><h3>Телефон</h3><p><a href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a></p></div>
   <div class="card reveal"><h3>Мессенджеры</h3><p><a href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp</a> · <a href="${site.telegram}" target="_blank" rel="noopener" data-goal="messenger">Telegram</a> · <a href="${site.vk}" target="_blank" rel="noopener">ВКонтакте</a></p></div>
   <div class="card reveal"><h3>Режим работы</h3><p>${site.hours}</p></div>
   <div class="card reveal"><h3>Где</h3><p>${site.city}, ${site.place}</p></div>
  </div></div></section>`;
  return layout({ ...o, path: "/", title: `Ремонт консолей и геймпадов в Ангарске — ${site.brand}`, desc: "Ремонт PlayStation, Xbox, Nintendo Switch, геймпадов, ноутбуков, ПК и смартфонов в Ангарске. Диагностика бесплатно, гарантия 90 дней. Скупка техники в любом состоянии.", body });
}

export function categoryPage(c, o) {
  const items = c.items.map((k) => prices[k]);
  const body = `${crumbs(c.cat)}
<section class="page-hero"><div class="wrap"><span class="badge">${esc(c.cat)}</span><h1>${esc(c.h1)}</h1><p class="hero-p">${esc(c.intro)}</p>
 <div class="acts"><a class="btn" href="#request" data-goal="lead_click">Оставить заявку</a><a class="btn ghost" href="tel:${site.phoneRaw}" data-goal="call">Позвонить</a></div></div></section>
${c.noprices ? "" : `<section><div class="wrap"><span class="eyebrow">Цены</span><h2>Услуги и цены</h2>${priceTable(items)}<p class="note">${c.slug === "remont-smartfonov" ? "Минимальный заказ — 500 ₽. Диагностика бесплатна при ремонте. " : "Точная стоимость — после бесплатной диагностики. "}Цены «от» не являются публичной офертой.</p></div></section>`}
<section class="alt"><div class="wrap two"><div><span class="eyebrow">Подход</span><h2>Чем отличается ремонт</h2><ul class="ticks">${c.diff.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>${c.links.length ? `<p>${c.links.map(([s, t]) => `<a href="/${s}/">${esc(t)} →</a>`).join("<br>")}</p>` : ""}</div>${noInternet}</div></section>
${requestSection(c.cat)}
<section><div class="wrap"><span class="eyebrow">FAQ</span><h2>Частые вопросы</h2>${faqBlock(c.faq)}<div class="portfolio-row">${portfolioBtn()}</div></div></section>`;
  return layout({ ...o, path: `/${c.slug}/`, title: c.title + ` — ${site.brand}`, desc: c.desc, body, jsonld: [serviceLd(c.h1, c.desc), faqLd(c.faq)] });
}

export function narrowPage(n, o) {
  const body = `${crumbs(n.h1)}
<section class="page-hero"><div class="wrap"><span class="badge">${esc(n.cat)}</span><h1>${esc(n.h1)}</h1></div></section>
<section><div class="wrap article">${n.sections.map(([h, t]) => `<h2 class="reveal">${esc(h)}</h2><p class="reveal">${esc(t)}</p>`).join("")}
 <p><a href="/${n.back[0]}/">${esc(n.back[1])} →</a></p><div>${portfolioBtn()}</div></div></section>
${requestSection(n.cat)}
<section class="alt"><div class="wrap"><span class="eyebrow">FAQ</span><h2>Частые вопросы</h2>${faqBlock(n.faq)}</div></section>`;
  return layout({ ...o, path: `/${n.slug}/`, title: n.title + ` — ${site.brand}`, desc: n.desc, body, jsonld: [serviceLd(n.h1, n.desc), faqLd(n.faq)] });
}

export function pricesPage(o) {
  const body = `${crumbs("Цены")}
<section class="page-hero"><div class="wrap"><h1>Цены на ремонт в Ангарске</h1><p class="hero-p"><b>Точная стоимость — после бесплатной диагностики.</b> Указаны цены «от», они не являются публичной офертой.</p></div></section>
<section><div class="wrap">${priceGroups.map((g) => `<div class="pgroup reveal"><h3>${esc(g.name)}</h3>${priceTable(g.items)}${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}</div>`).join("")}</div></section>
${calcSection()}${requestSection()}`;
  return layout({ ...o, path: "/ceny/", title: pagesOther.prices.title, desc: pagesOther.prices.desc, body });
}

export function aboutPage(o) {
  const body = `${crumbs("О мастере")}
<section class="page-hero"><div class="wrap two"><div><span class="badge">О мастере</span><h1>Мастер FinikFix: ремонт на совесть</h1>
<p class="hero-p">Консолями занимаюсь 10+ лет, смартфонами — 3 года. Ремонтирую в мастерской в Ангарске.</p>
<ul class="ticks"><li>Микроскоп и замеры напряжений</li><li>Ремонт по схемам</li><li>Договор, расписка или акт</li><li>Гарантия 90 дней</li><li>Чек «Мой налог» по запросу</li><li>Специализация: замена HDMI, датчики Холла вместо изношенных стиков, прошивки PS3/PS4/Switch</li></ul>
<div class="acts">${portfolioBtn()}</div></div>${photoBlock(o.hasPhoto, "reveal")}</div></section>
${requestSection()}`;
  return layout({ ...o, path: "/o-mastere/", title: pagesOther.about.title, desc: pagesOther.about.desc, body });
}

export function reviewsPage(o) {
  const body = `${crumbs("Отзывы")}
<section class="page-hero"><div class="wrap"><h1>Отзывы клиентов</h1><p class="hero-p">Рейтинг <b>4,8</b> и <b>60 отзывов</b> на Авито. Читайте их в профиле, а фото реальных ремонтов смотрите в портфолио.</p>
<div class="acts">${portfolioBtn()}<a class="btn ghost" href="${site.avitoAd}" target="_blank" rel="noopener">Объявление по смартфонам на Авито</a></div></div></section>
${requestSection()}`;
  return layout({ ...o, path: "/otzyvy/", title: pagesOther.reviews.title, desc: pagesOther.reviews.desc, body });
}

export function contactsPage(o) {
  const body = `${crumbs("Контакты")}
<section class="page-hero"><div class="wrap"><h1>Контакты</h1></div></section>
<section><div class="wrap two"><div class="grid one">
  <div class="card reveal"><h3>Телефон</h3><p><a href="tel:${site.phoneRaw}" data-goal="call">${site.phone}</a></p></div>
  <div class="card reveal"><h3>Мессенджеры</h3><p><a href="${waLink}" target="_blank" rel="noopener" data-goal="messenger">WhatsApp</a> · <a href="${site.telegram}" target="_blank" rel="noopener" data-goal="messenger">Telegram</a> · <a href="${site.vk}" target="_blank" rel="noopener">ВКонтакте</a> · <a href="${site.channel}" target="_blank" rel="noopener">Telegram-канал</a></p></div>
  <div class="card reveal"><h3>Режим работы</h3><p>${site.hours}</p></div>
  <div class="card reveal"><h3>Где</h3><p>${site.city}, ${site.place}</p></div>
  ${noInternet}</div>${leadForm()}</div></section>`;
  return layout({ ...o, path: "/kontakty/", title: pagesOther.contacts.title, desc: pagesOther.contacts.desc, body });
}

export function shopPage(o) {
  const body = `${crumbs("Восстановленная техника")}
<section class="page-hero"><div class="wrap"><h1>Восстановленная техника</h1><p class="hero-p">Куплено, отремонтировано и проверено. Восстановлено после ремонта, гарантия 90 дней. Наличие уточняйте.</p></div></section>
<section><div class="wrap"><div class="grid">${shop.map((s) => `<div class="card reveal"><h3>${esc(s.name)}</h3><p class="big">${rub(s.price)}</p><p>Восстановлено после ремонта, гарантия 90 дней</p><a class="btn sm" href="#request">Узнать наличие</a></div>`).join("")}</div></div></section>
${requestSection("Другое", "Узнать наличие")}`;
  return layout({ ...o, path: "/vosstanovlennaya-tekhnika/", title: pagesOther.shop.title, desc: pagesOther.shop.desc, body });
}

export function legalPage(o, path, title, html) {
  const body = `${crumbs(title)}<section><div class="wrap article"><h1>${esc(title)}</h1>${html}</div></section>`;
  return layout({ ...o, path, title: `${title} — ${site.brand}`, desc: title, body, noindex: true });
}

export const privacyHtml = `<p>Оператор персональных данных — ${site.owner}, самозанятый, применяет НПД (далее — Оператор). Контакт: <a href="tel:${site.phoneRaw}">${site.phone}</a>.</p>
<h2>1. Какие данные собираем</h2><p>Имя и номер телефона, а также текст комментария, которые вы указываете в форме заявки. Обезличенные данные о посещении сайта могут собираться сервисом Яндекс.Метрика.</p>
<h2>2. Зачем</h2><p>Только чтобы связаться с вами по заявке на ремонт или скупку техники.</p>
<h2>3. Хранение и передача</h2><p>Данные хранятся только для связи по заявке и не передаются третьим лицам, кроме случаев, предусмотренных законом. Заявка пересылается Оператору в мессенджер Telegram. Хранение осуществляется на сервере в Российской Федерации.</p>
<h2>4. Ваши права</h2><p>Вы можете запросить уточнение или удаление данных, а также отозвать согласие, связавшись с Оператором по контактам на сайте. Обработка осуществляется в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».</p>
<h2>5. Cookies</h2><p>Сайт может использовать cookies и сервисы статистики для анализа посещаемости. Вы можете отключить их в настройках браузера.</p>`;
export const consentHtml = `<p>Отправляя форму на сайте, я свободно, своей волей и в своём интересе даю Оператору (${site.owner}, самозанятый) согласие на обработку моих персональных данных в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».</p>
<h2>Перечень данных</h2><p>Имя, номер телефона, содержание комментария.</p>
<h2>Цель</h2><p>Связь со мной по заявке на ремонт или скупку техники.</p>
<h2>Действия</h2><p>Сбор, запись, хранение, использование, удаление. Передача третьим лицам не осуществляется.</p>
<h2>Срок и отзыв</h2><p>Согласие действует до достижения цели обработки или до его отзыва. Отозвать согласие можно, сообщив Оператору по контактам на сайте. Подробнее — в <a href="/privacy/">Политике конфиденциальности</a>.</p>`;
export const thanksHtml = `<p>Заявка принята. Перезвоню в рабочее время (${site.hours}). Если срочно — позвоните: <a href="tel:${site.phoneRaw}">${site.phone}</a>.</p><p><a class="btn" href="/">На главную</a></p>`;
