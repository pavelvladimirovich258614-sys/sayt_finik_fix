(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var goal = function (n) { try { if (window.ym && window.__ym) window.ym(window.__ym, "reachGoal", n); } catch (e) {} };
  var fmt = function (n) { return n.toLocaleString("ru-RU").replace(/[  ]/g, " ") + " ₽"; };

  // Меню
  var b = $("#burger"), nav = $("#nav");
  if (b) {
    b.addEventListener("click", function () { var o = nav.classList.toggle("open"); b.setAttribute("aria-expanded", o); });
    nav.addEventListener("click", function (e) {
      var t = e.target.closest("a"); if (t) { nav.classList.remove("open"); b.setAttribute("aria-expanded", false); }
    });
    document.querySelectorAll(".dd-b").forEach(function (d) {
      d.addEventListener("click", function () { var o = d.parentNode.classList.toggle("open"); d.setAttribute("aria-expanded", o); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { nav.classList.remove("open"); b.setAttribute("aria-expanded", false); } });
  }

  // Шапка при прокрутке и индикатор чтения
  var hdr = $(".hdr"), pr = $("#progress");
  var onScroll = function () {
    var y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    if (hdr) hdr.classList.toggle("scrolled", y > 8);
    if (pr) pr.style.width = (h > 0 ? Math.min(100, y / h * 100) : 0) + "%";
  };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // Активный пункт меню на главной по разделу, который на экране
  if (location.pathname === "/" && "IntersectionObserver" in window) {
    var links = {};
    nav.querySelectorAll('a[href^="/#"]').forEach(function (a) { links[a.getAttribute("href").slice(2)] = a; });
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].removeAttribute("aria-current"); });
        if (links[e.target.id]) links[e.target.id].setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(links).forEach(function (k) { var el = document.getElementById(k); if (el) so.observe(el); });
  }

  // Свечение карточек за курсором
  document.querySelectorAll(".tile,.btn,.tel").forEach(function (c) {
    c.addEventListener("pointermove", function (e) { var r = c.getBoundingClientRect(); c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px"); });
  });
  // Каскад появления внутри сеток
  document.querySelectorAll(".grid").forEach(function (g) { Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty("--i", i % 6); }); });

  // Появление блоков при прокрутке
  var els = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12 });
    els.forEach(function (e) { io.observe(e); });
  } else els.forEach(function (e) { e.classList.add("in"); });

  // Цели Метрики по клику
  document.addEventListener("click", function (e) { var a = e.target.closest("[data-goal]"); if (a) goal(a.dataset.goal); });

  // Калькулятор: категория → [модель] → услуга. Данные и суммы готовит сервер (src/calc.mjs → window.FF.calc), здесь только показ.
  var cc = $("#c-cat");
  if (cc && window.FF && window.FF.calc) {
    var C = window.FF.calc, ST = C.sticks;
    var cm = $("#c-model"), cmr = $("#c-model-row"), cml = $("#c-model-l"), cs = $("#c-srv"), cres = $("#c-res"), clines = $("#c-lines"), cmeta = $("#c-meta"), creq = $("#c-req");
    var stBox = $("#c-stick"), st1 = $("#c-st1"), st2 = $("#c-st2"), qty = $("#c-qty"), st2r = $("#c-st2row"), lap = $("#c-lap"), lapm = $("#c-lapm");
    var opt = function (v, t) { return '<option value="' + v + '">' + t + "</option>"; };
    var cur = null;
    var cat = function () { return C.cats[cc.value]; };
    var mdl = function () { return cat().models[cm.value || 0]; };
    var typeOpts = ST.types.map(function (t, i) { return opt(i, t.name + " — " + fmt(t.price)); }).join("");
    st1.innerHTML = typeOpts; st2.innerHTML = typeOpts;
    var render = function () {
      var c = cat(), m = mdl(), s = m.services[cs.value];
      if (!s) { cres.textContent = ""; cur = null; return; }
      var range = "", note = "", metaTxt = "", rows = "";
      stBox.hidden = s.kind !== "sticks"; lap.hidden = s.input !== "laptopModel";
      if (s.kind === "fixed") { range = fmt(s.price); cres.textContent = range; metaTxt = s.note || s.parts || ""; note = metaTxt; }
      else if (s.kind === "sticks") {
        var two = qty.value === "2", i = Number(st1.value), j = Number(st2.value);
        st2r.hidden = !two;
        if (two) {
          var p = ST.pairs[i][j];
          cres.textContent = fmt(p.total); range = "итого " + fmt(p.total);
          rows = "<div><dt>Сумма двух стиков</dt><dd>" + fmt(p.sum) + "</dd></div><div><dt>Скидка " + ST.percent + "%</dt><dd>−" + fmt(p.discount) + "</dd></div><div class=\"tot\"><dt>Итого</dt><dd>" + fmt(p.total) + "</dd></div>";
          note = "2 стика: " + ST.types[i].short + " + " + ST.types[j].short + "; сумма " + fmt(p.sum) + ", скидка " + ST.percent + "% −" + fmt(p.discount);
          metaTxt = "Скидка " + ST.percent + "% считается от суммы двух выбранных стиков.";
        } else { range = fmt(ST.types[i].price); cres.textContent = range; note = "1 стик: " + ST.types[i].short; metaTxt = "Цена за один стик (аналог)."; }
      } else if (s.kind === "diag") { range = "Стоимость после диагностики"; cres.textContent = C.text.diag; }
      else { range = "Стоимость после уточнения модели"; cres.textContent = C.text.model; if (s.input === "laptopModel") metaTxt = "Укажите модель ноутбука и отправьте заявку: уточню стоимость."; else metaTxt = "Отправьте заявку: уточню модель и стоимость."; }
      if (s.input === "laptopModel" && lapm.value.trim()) note = "Модель ноутбука: " + lapm.value.trim().slice(0, 60);
      clines.hidden = !rows; clines.innerHTML = rows; cmeta.textContent = metaTxt;
      var priced = s.kind === "fixed" || s.kind === "sticks";
      creq.textContent = priced ? "Оставить заявку с расчётом" : "Оставить заявку";
      cur = { device: c.name + (c.modelLabel ? ": " + m.name : ""), service: s.name, range: range, note: note };
    };
    var fillServices = function (keepId) {
      var m = mdl(), keep = 0;
      cs.innerHTML = m.services.map(function (s, i) { if (s.id === keepId) keep = i; return opt(i, s.name); }).join("");
      cs.value = String(keep);
    };
    var fillModels = function () {
      var c = cat(); cmr.hidden = !c.modelLabel;
      if (c.modelLabel) cml.textContent = c.modelLabel;
      cm.innerHTML = c.models.map(function (m, i) { return opt(i, m.name); }).join("");
      var def = 0; if (c.id === "console") c.models.forEach(function (m, i) { if (m.id === "ps5") def = i; });
      cm.value = String(def);
    };
    cc.innerHTML = C.cats.map(function (c, i) { return opt(i, c.name); }).join("");
    cc.onchange = function () { fillModels(); fillServices(); render(); };
    cm.onchange = function () { var s = mdl().services[cs.value]; fillServices(s && s.id); render(); };
    [cs, st1, st2, qty].forEach(function (e) { e.onchange = render; });
    lapm.addEventListener("input", render);
    st1.value = "0"; st2.value = String(ST.types.length - 1);
    fillModels(); fillServices(); render();
    window.FF.current = function () { render(); return cur; };
  }

  // Акция: два аналога, скидка 15%. Суммы берутся из таблицы FF.calc.sticks.pairs (формула одна: src/pricing.mjs)
  var pa = $("#pr-a"), pb = $("#pr-b"), promo = $("#promo");
  if (pa && pb && promo && window.FF && window.FF.calc) {
    var PT = window.FF.calc.sticks;
    var pupd = function () {
      var p = PT.pairs[Number(pa.value)][Number(pb.value)];
      $("#pr-sum").textContent = fmt(p.sum); $("#pr-disc").textContent = "−" + fmt(p.discount); $("#pr-total").textContent = fmt(p.total);
    };
    pa.addEventListener("change", pupd); pb.addEventListener("change", pupd);
    window.FF.promoCurrent = function () {
      var p = PT.pairs[Number(pa.value)][Number(pb.value)], A = PT.types[Number(pa.value)], B = PT.types[Number(pb.value)];
      return { device: "Геймпады", service: "Замена двух стиков (скидка " + PT.percent + "%)", range: "итого " + fmt(p.total), note: "2 стика: " + A.short + " + " + B.short + "; сумма " + fmt(p.sum) + ", скидка " + PT.percent + "% −" + fmt(p.discount) };
    };
  }

})();

// Дополнительные HD-версии создаются заранее, до деплоя. Если их нет или они недоступны,
// всегда показываем исходное изображение. Ключи API никогда не попадают в браузер.
(function () {
  function upgrade(img) {
    if (!img || img.hasAttribute("data-src")) return;
    var url = img.getAttribute("data-hq-src");
    if (!url || img.dataset.hqState) return;
    img.dataset.hqState = "loading";
    var holder = img.closest(".hs-slide") || img.closest(".cat-pic") || img.parentElement;
    if (holder) holder.classList.add("is-enhancing");
    var high = new Image();
    high.onload = function () {
      if (img.dataset.hqState !== "loading") return;
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.src = url;
      img.dataset.hqState = "ready";
      if (holder) holder.classList.remove("is-enhancing");
    };
    high.onerror = function () {
      img.dataset.hqState = "fallback";
      if (holder) holder.classList.remove("is-enhancing");
      var status = document.getElementById("photo-enhance-status");
      if (status) status.textContent = "HD-фото временно недоступно. Показан оригинал.";
    };
    high.src = url;
  }
  window.FFEnhance = upgrade;
  document.querySelectorAll('img[data-hq-src]:not([data-src])').forEach(upgrade);
})();

// Слайдер первого экрана
(function () {
  var wrap = document.querySelector(".hs-slides");
  if (!wrap) return;
  var stage = wrap.parentNode, slides = [].slice.call(wrap.querySelectorAll(".hs-slide"));
  var dots = [].slice.call(stage.querySelectorAll(".hs-dot"));
  var pp = stage.querySelector(".hs-pp");
  var interval = Number(wrap.getAttribute("data-interval")) || 5000;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cur = 0, timer = null, userPaused = reduce, focus = false, hidden = document.hidden, offscreen = false, touchUntil = 0;

  // HD не загрузился: возвращаем оригинал (адрес в data-orig), один раз
  function fallback(img) {
    var o = img.getAttribute("data-orig");
    if (!o || img.getAttribute("data-fb")) return;
    img.setAttribute("data-fb", "1"); img.removeAttribute("srcset"); img.src = o;
    var status = document.getElementById("photo-enhance-status");
    if (status) status.textContent = "HD-фото временно недоступно. Показан оригинал.";
  }
  function watch(img) {
    img.addEventListener("error", function () { fallback(img); });
    if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) fallback(img);
  }
  function load(i) {
    var img = slides[i] && slides[i].querySelector("img[data-src]");
    if (!img) return;
    var ss = img.getAttribute("data-srcset");
    if (ss) img.srcset = ss;
    img.src = img.getAttribute("data-src");
    img.removeAttribute("data-src"); img.removeAttribute("data-srcset");
    if (img.decode) img.decode().catch(function () {}); // декодируем заранее, чтобы смена кадра не мерцала
  }
  function show(i) {
    i = (i + slides.length) % slides.length;
    load(i); load((i + 1) % slides.length);
    slides[cur].classList.remove("is-active"); slides[cur].setAttribute("aria-hidden", "true"); dots[cur].removeAttribute("aria-current");
    cur = i;
    slides[cur].classList.add("is-active"); slides[cur].removeAttribute("aria-hidden"); dots[cur].setAttribute("aria-current", "true");
  }
  function active() { return !userPaused && !focus && !hidden && !offscreen && Date.now() >= touchUntil; }
  function schedule() {
    clearTimeout(timer);
    if (!active()) return;
    timer = setTimeout(function () { show(cur + 1); schedule(); }, interval);
  }
  // Любое взаимодействие: следующая автосмена не раньше чем через interval после последнего действия
  function interact() { touchUntil = Date.now() + interval; schedule(); }
  function go(i) { show(i); interact(); }

  stage.querySelector(".hs-prev").addEventListener("click", function () { go(cur - 1); });
  stage.querySelector(".hs-next").addEventListener("click", function () { go(cur + 1); });
  dots.forEach(function (d, i) { d.addEventListener("click", function () { go(i); }); });
  pp.addEventListener("click", function () {
    userPaused = !userPaused;
    pp.setAttribute("aria-pressed", userPaused);
    pp.setAttribute("aria-label", userPaused ? "Запустить смену фото" : "Остановить смену фото");
    pp.innerHTML = pp.getAttribute(userPaused ? "data-play" : "data-pause");
    schedule();
  });
  if (userPaused) { pp.setAttribute("aria-pressed", "true"); pp.setAttribute("aria-label", "Запустить смену фото"); pp.innerHTML = pp.getAttribute("data-play"); }

  // Наведение мыши больше не останавливает автоматическую смену фото.
  // Пауза сохраняется при фокусе с клавиатуры и по кнопке.
  stage.addEventListener("focusin", function (e) { try { focus = e.target.matches(":focus-visible"); } catch (x) { focus = true; } schedule(); }); // пауза только при фокусе с клавиатуры
  stage.addEventListener("focusout", function () { focus = false; schedule(); });
  stage.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") go(cur - 1); else if (e.key === "ArrowRight") go(cur + 1);
  });

  // Свайп на смартфоне (горизонтальный жест; вертикальная прокрутка не мешает)
  var sx = 0, sy = 0, swiping = false;
  stage.addEventListener("touchstart", function (e) { var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; swiping = true; touchUntil = Date.now() + interval * 2; schedule(); }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (!swiping) return; swiping = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? cur + 1 : cur - 1); else interact();
  }, { passive: true });
  stage.addEventListener("touchcancel", function () { swiping = false; }, { passive: true });

  document.addEventListener("visibilitychange", function () { hidden = document.hidden; schedule(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { offscreen = !en[0].isIntersecting; schedule(); }, { threshold: 0.2 }).observe(stage);
  }

  slides.forEach(function (sl) { var im = sl.querySelector("img"); if (im) watch(im); });
  // Второй кадр подгружаем после загрузки страницы; дальше каждый следующий — заранее при показе предыдущего
  function preload() { load(1); }
  var idle = window.requestIdleCallback || function (f) { setTimeout(f, 1200); };
  if (document.readyState === "complete") idle(preload); else window.addEventListener("load", function () { idle(preload); });
  schedule();

  // Работы, отмеченные в админке «Включить в слайдер», добавляются в конец после основных шести фото
  if (window.fetch) {
    fetch("/api/portfolio/slides").then(function (r) { return r.json(); }).then(function (d) {
      var dotsBox = stage.querySelector(".hs-dots");
      (d.works || []).slice(0, 6).forEach(function (w) {
        var ph = w.photos && w.photos[0]; if (!ph) return;
        var fig = document.createElement("figure"); fig.className = "hs-slide"; fig.setAttribute("role", "group"); fig.setAttribute("aria-roledescription", "слайд"); fig.setAttribute("aria-hidden", "true"); fig.style.setProperty("--pos", "50%");
        var img = document.createElement("img"); img.setAttribute("data-src", ph.src); img.alt = w.title; img.width = ph.width; img.height = ph.height; img.decoding = "async";
        fig.appendChild(img); wrap.appendChild(fig); slides.push(fig);
        var idx = slides.length - 1, dot = document.createElement("button"); dot.type = "button"; dot.className = "hs-dot";
        dot.addEventListener("click", function () { go(idx); }); dotsBox.appendChild(dot); dots.push(dot);
      });
      slides.forEach(function (sl, i) { sl.setAttribute("aria-label", (i + 1) + " из " + slides.length); dots[i].setAttribute("aria-label", "Фото " + (i + 1) + " из " + slides.length); });
    }).catch(function () {});
  }
})();

// Портфолио: блок на главной, галерея /portfolio/, релевантные кейсы на страницах услуг (данные из /api/portfolio). Всё внутри сайта.
(function () {
  var home = document.getElementById("works-home-grid"), grid = document.getElementById("works-grid");
  var rel = document.querySelectorAll(".works-rel");
  if (!home && !grid && !rel.length) return;
  var fmt = function (n) { return n.toLocaleString("ru-RU").replace(/[  ]/g, " ") + " ₽"; };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var plural = function (n, a, b, c) { var m = n % 100, d = n % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
  function cardBody(w, node) {
    var ph = w.photos[0], img = document.createElement("img");
    img.src = ph.src; img.alt = w.title + " — фото ремонта"; img.loading = "lazy"; img.decoding = "async"; img.width = ph.width; img.height = ph.height;
    var pic = el("span", "work-pic"); pic.appendChild(img);
    if (!w.is_real) pic.appendChild(el("span", "work-tag", "Иллюстрация"));
    pic.appendChild(el("span", "work-count", w.photos.length + " " + plural(w.photos.length, "фото", "фото", "фото")));
    node.appendChild(pic); node.appendChild(el("span", "work-title", w.title));
    if (w.price_rub != null) node.appendChild(el("span", "work-price", "Стоимость выполненной работы: " + fmt(w.price_rub)));
    return node;
  }
  var linkCard = function (w) { var a = el("a", "work-card"); a.href = "/portfolio/#w" + w.id; a.setAttribute("data-goal", "portfolio"); return cardBody(w, a); };
  var btnCard = function (w, onOpen) { var b = el("button", "work-card"); b.type = "button"; cardBody(w, b); b.addEventListener("click", function () { onOpen(w); }); return b; };

  var cache = null;
  function load() { if (!cache) cache = fetch("/api/portfolio", { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); }).then(function (d) { if (!d || !d.ok) throw new Error("bad"); return d; }); return cache; }
  function failBox(node, retry) {
    node.textContent = ""; var box = el("div", "card works-err"); box.setAttribute("role", "alert");
    box.appendChild(el("h3", "", "Не удалось загрузить работы")); box.appendChild(el("p", "", "Проверьте соединение и попробуйте ещё раз."));
    var b = el("button", "btn", "Повторить"); b.type = "button"; b.addEventListener("click", function () { cache = null; node.textContent = ""; node.appendChild(el("p", "note", "Загружаю…")); retry(); }); box.appendChild(b); node.appendChild(box);
  }

  // Главная: 6 карточек из реального портфолио
  function runHome() {
    home.textContent = ""; home.appendChild(el("p", "note", "Загружаю работы…"));
    load().then(function (d) {
      var works = d.works || []; home.textContent = "";
      if (!works.length) { home.appendChild(el("p", "note", "Работы скоро появятся.")); return; }
      works.slice(0, 6).forEach(function (w) { home.appendChild(linkCard(w)); });
      var all = document.getElementById("works-all-btn"); if (all) all.textContent = "Смотреть все " + works.length + " " + plural(works.length, "работу", "работы", "работ");
    }).catch(function () { failBox(home, runHome); });
  }
  if (home) runHome();

  // Страницы услуг: релевантные кейсы по категории
  rel.forEach(function (box) {
    var cat = box.getAttribute("data-wcat");
    function runRel() {
      load().then(function (d) {
        var list = (d.works || []).filter(function (w) { return w.category === cat; }); box.textContent = "";
        if (!list.length) { box.closest("section").hidden = true; return; }
        list.slice(0, 4).forEach(function (w) { box.appendChild(linkCard(w)); });
      }).catch(function () { failBox(box, runRel); });
    }
    runRel();
  });
  if (!grid) return;

  // Страница /portfolio/
  var filters = document.getElementById("works-filters"), empty = document.getElementById("works-empty");
  var lb = document.getElementById("lightbox"), cur = null, idx = 0, opener = null, active = "", works = [], cats = [];
  var lbTimer = null, lbDelay = 5000;
  var lbReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function stopAuto() { if (lbTimer) clearInterval(lbTimer); lbTimer = null; }
  function startAuto() { stopAuto(); if (!lbReduced && cur && cur.photos.length > 1 && !document.hidden) lbTimer = setInterval(function () { step(1, false); }, lbDelay); }
  function render() { grid.textContent = ""; works.filter(function (w) { return !active || w.category === active; }).forEach(function (w) { grid.appendChild(btnCard(w, open)); }); }
  function chip(label, key, count) {
    var b = el("button", "chip-f" + (active === key ? " on" : ""), label + (count != null ? " · " + count : "")); b.type = "button"; b.setAttribute("aria-pressed", active === key);
    b.addEventListener("click", function () { active = key; draw(); }); return b;
  }
  function draw() {
    filters.textContent = ""; filters.appendChild(chip("Все", "", works.length));
    cats.forEach(function (c) { var n = works.filter(function (w) { return w.category === c[0]; }).length; if (n) filters.appendChild(chip(c[1], c[0], n)); });
    render();
  }
  function thumbs() {
    var box = lb.querySelector(".lb-thumbs"); box.textContent = ""; box.hidden = cur.photos.length < 2;
    cur.photos.forEach(function (p, i) { var t = el("button", "lb-th" + (i === idx ? " on" : "")); t.type = "button"; t.setAttribute("aria-label", "Фото " + (i + 1) + " из " + cur.photos.length); var im = document.createElement("img"); im.src = p.src; im.alt = ""; im.loading = "lazy"; im.width = 64; im.height = 64; t.appendChild(im); t.addEventListener("click", function () { idx = i; show(); startAuto(); }); box.appendChild(t); });
  }
  function show() {
    var p = cur.photos[idx], img = lb.querySelector("img");
    lb.classList.add("is-image-loading");
    img.onload = function () { lb.classList.remove("is-image-loading"); };
    img.onerror = function () { lb.classList.remove("is-image-loading"); var s = lb.querySelector(".lb-photo-status"); if (s) s.textContent = "Фото недоступно. Попробуйте другое изображение."; };
    var note = lb.querySelector(".lb-photo-status"); if (note) note.textContent = "";
    img.src = p.enhancedSrc || p.src; img.alt = cur.title + " — фото " + (idx + 1);
    if (p.enhancedSrc) { img.onerror = function () { img.onerror = null; img.src = p.src; lb.classList.remove("is-image-loading"); var s = lb.querySelector(".lb-photo-status"); if (s) s.textContent = "HD-версия недоступна, показан оригинал."; }; }
    lb.querySelector(".lb-title").textContent = cur.title;
    lb.querySelector(".lb-desc").textContent = cur.description || "";
    lb.querySelector(".lb-price").textContent = cur.price_rub != null ? "Стоимость этой выполненной работы: " + fmt(cur.price_rub) + ". " + (cur.price_note || "Не является текущим прайсом.") : "";
    lb.querySelector(".lb-badge").textContent = cur.is_real ? "Реальная работа" : "Иллюстрация";
    lb.querySelector(".lb-problem").textContent = cur.problem ? "Проблема: " + cur.problem : "";
    lb.querySelector(".lb-solution").textContent = cur.solution ? "Что сделал мастер: " + cur.solution : "";
    lb.querySelector(".lb-count").textContent = cur.photos.length > 1 ? (idx + 1) + " из " + cur.photos.length : "";
    lb.querySelector(".lb-prev").hidden = lb.querySelector(".lb-next").hidden = cur.photos.length < 2;
    lb.querySelectorAll(".lb-th").forEach(function (t, i) { t.classList.toggle("on", i === idx); });
  }
  function open(w) { cur = w; idx = 0; opener = document.activeElement; thumbs(); show(); if (lb.showModal) lb.showModal(); else lb.setAttribute("open", ""); startAuto(); try { history.replaceState(null, "", "#w" + w.id); } catch (e) {} }
  function step(d, reset) { idx = (idx + d + cur.photos.length) % cur.photos.length; show(); if (reset !== false) startAuto(); }
  lb.querySelector(".lb-x").addEventListener("click", function () { lb.close(); });
  lb.querySelector(".lb-prev").addEventListener("click", function () { step(-1); });
  lb.querySelector(".lb-next").addEventListener("click", function () { step(1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1); });
  var tx = null; var pic = lb.querySelector(".lb-pic");
  pic.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
  pic.addEventListener("touchend", function (e) { if (tx == null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 40 && cur.photos.length > 1) step(dx < 0 ? 1 : -1); }, { passive: true });
  lb.addEventListener("close", function () { stopAuto(); if (opener && opener.focus) opener.focus(); try { history.replaceState(null, "", location.pathname); } catch (e) {} });
  lb.querySelectorAll(".lb-actions a, .lb-actions button").forEach(function (a) { a.addEventListener("click", function () { if (a.hasAttribute("data-cb")) lb.close(); }); });
  document.addEventListener("visibilitychange", function () { if (document.hidden || !lb.open) stopAuto(); else startAuto(); });
  function runPage() {
    grid.textContent = ""; grid.appendChild(el("p", "note", "Загружаю работы…")); empty.hidden = true;
    load().then(function (d) {
      works = d.works || []; cats = d.categories || [];
      if (!works.length) { grid.textContent = ""; empty.hidden = false; return; }
      draw();
      var m = /^#w(\d+)$/.exec(location.hash); if (m) { var w = works.filter(function (x) { return String(x.id) === m[1]; })[0]; if (w) open(w); }
    }).catch(function () { failBox(grid, runPage); });
  }
  runPage();
})();

// Обратный звонок и отзывы: показываются, только если сервер сообщает, что приём включён (/api/config)
(function () {
  if (!window.fetch) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var post = function (url, data) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; }).then(function (j) { j.status = r.status; return j; }); });
  };
  var calcNote = null;
  var promoChosen = function () { return window.FF && window.FF.promoCurrent ? window.FF.promoCurrent() : null; };
  var chosen = function () { return window.FF && window.FF.current ? window.FF.current() : null; };

  fetch("/api/config").then(function (r) { return r.json(); }).then(function (cfg) {
    if (cfg.leads) {
      document.querySelectorAll("[data-cb]").forEach(function (b) { b.hidden = false; });
      document.body.classList.add("has-cb");
    }
    if (cfg.reviews) { var w = $("#rv-form-wrap"); if (w) w.hidden = false; }
  }).catch(function () {});

  // Диалог обратного звонка
  var dlg = $("#cb-dialog"), form = $("#cb-form");
  if (dlg && form) {
    var msg = $("#cb-msg"), cn = $("#cb-calc"), opener = null, busy = false;
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-cb]"); if (!t) return;
      opener = t; calcNote = t.hasAttribute("data-cb-calc") ? chosen() : t.hasAttribute("data-cb-promo") ? promoChosen() : null;
      cn.hidden = !calcNote; cn.textContent = calcNote ? "Ваш расчёт: " + calcNote.device + ", " + calcNote.service + (calcNote.range ? " — " + calcNote.range : "") : "";
      msg.textContent = ""; msg.className = "cb-msg"; form.hidden = false;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      form.name.focus();
    });
    dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("[data-cb-close]")) dlg.close(); });
    dlg.addEventListener("close", function () { if (opener) opener.focus(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (busy) return;
      var fail = function (t) { msg.textContent = t; msg.className = "cb-msg err"; };
      if (form.name.value.trim().length < 2) { fail("Укажите имя"); form.name.focus(); return; }
      if (form.phone.value.replace(/\D/g, "").length < 10) { fail("Проверьте номер телефона"); form.phone.focus(); return; }
      if (!form.consent.checked) { fail("Нужно согласие на обработку персональных данных"); form.consent.focus(); return; }
      busy = true; msg.textContent = "Отправляю…"; msg.className = "cb-msg";
      var data = { name: form.name.value, phone: form.phone.value, comment: form.comment.value, consent: true, website: form.website.value, page: location.pathname };
      if (calcNote) data.calc = calcNote;
      post("/api/lead", data).then(function (j) {
        busy = false;
        if (j.ok) { msg.textContent = j.message || "Заявка сохранена."; msg.className = "cb-msg ok"; form.reset(); try { if (window.ym && window.__ym) window.ym(window.__ym, "reachGoal", "lead"); } catch (x) {} }
        else fail(j.error || "Не удалось отправить. Позвоните мастеру.");
      }).catch(function () { busy = false; fail("Нет связи с сервером. Позвоните мастеру."); });
    });
  }

  // Отзывы
  var av = $("#rv-avito");
  if (av) {
    var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
    var item = function (r, src) {
      var a = el("article", "card rv"); var h = el("div", "rv-h");
      h.appendChild(el("b", "", r.author)); if (r.date) h.appendChild(el("span", "rv-d", r.date));
      if (src === "site") h.appendChild(el("span", "rv-r", "★".repeat(r.rating) + "☆".repeat(5 - r.rating)));
      a.appendChild(h); if (src === "avito" && r.item) a.appendChild(el("p", "rv-i", "Услуга на Авито: " + r.item));
      a.appendChild(el("p", "rv-t", r.text));
      if (src === "avito") a.appendChild(el("p", "rv-s", "Источник: Авито" + (r.has_photos ? " · в отзыве были фото (не опубликованы)" : "") + " · оценка отзыва в выгрузке не указана"));
      if (r.reply) a.appendChild(el("p", "rv-reply", "Ответ мастера: " + r.reply));
      return a;
    };
    fetch("/api/reviews").then(function (r) { return r.json(); }).then(function (d) {
      (d.avito || []).forEach(function (r) { av.appendChild(item(r, "avito")); });
      if (!(d.avito || []).length) av.appendChild(el("p", "note", "Отзывы скоро появятся."));
      var ss = $("#rv-site"); (d.site || []).forEach(function (r) { ss.appendChild(item(r, "site")); });
      $("#rv-site-sum").textContent = d.siteCount ? "Рейтинг на сайте: " + d.siteAvg.toString().replace(".", ",") + " из 5 · отзывов: " + d.siteCount + " (считается отдельно от Авито)" : "Пока нет проверенных отзывов, оставленных на сайте.";
    }).catch(function () { av.appendChild(el("p", "note", "Не удалось загрузить отзывы. Обновите страницу или попробуйте позже.")); });
    var rf = $("#rv-form");
    if (rf) rf.addEventListener("submit", function (e) {
      e.preventDefault(); var m = $("#rv-msg"), bad = function (t) { m.textContent = t; m.className = "cb-msg err"; };
      var rating = rf.querySelector("input[name=rating]:checked");
      if (rf.name.value.trim().length < 2) return bad("Укажите имя");
      if (!rating) return bad("Поставьте оценку");
      if (rf.text.value.trim().length < 10) return bad("Напишите отзыв подробнее");
      if (!rf.consent.checked) return bad("Нужно согласие");
      m.textContent = "Отправляю…"; m.className = "cb-msg";
      post("/api/reviews", { name: rf.name.value, rating: Number(rating.value), text: rf.text.value, consent: true, website: rf.website.value }).then(function (j) {
        if (j.ok) { m.textContent = j.message; m.className = "cb-msg ok"; rf.reset(); } else bad(j.error || "Не удалось отправить отзыв");
      }).catch(function () { bad("Нет связи с сервером"); });
    });
  }
})();


// Скопировать номер (для компьютера): Clipboard API с запасным вариантом, сообщение для скринридеров и глаз
(function () {
  var btns = document.querySelectorAll("[data-copy]"); if (!btns.length) return;
  var toast = document.createElement("div"); toast.className = "copy-toast"; toast.setAttribute("role", "status"); toast.setAttribute("aria-live", "polite"); document.body.appendChild(toast);
  var timer = null;
  function say(t) { toast.textContent = t; toast.classList.add("on"); clearTimeout(timer); timer = setTimeout(function () { toast.classList.remove("on"); }, 2500); }
  function fallback(text) { var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); return ok; }
  btns.forEach(function (b) {
    b.addEventListener("click", function () {
      var text = b.getAttribute("data-copy"), label = b.getAttribute("data-copy-label") || text;
      var done = function (ok) { say(ok ? "Номер скопирован: " + label : "Не удалось скопировать. Номер: " + label); try { if (ok && window.ym && window.__ym) window.ym(window.__ym, "reachGoal", "copy_phone"); } catch (e) {} };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback(text)); });
      else done(fallback(text));
    });
  });
})();
