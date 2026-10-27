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

  // Калькулятор
  var sd = $("#c-dev");
  if (sd && window.FF) {
    var G = window.FF.groups, ss = $("#c-srv"), cr = $("#c-res");
    sd.innerHTML = G.map(function (g, i) { return '<option value="' + i + '">' + g.name + "</option>"; }).join("");
    var calc = function () {
      var it = G[sd.value].items[ss.value];
      cr.textContent = it[1] ? (it[2] ? "" : "от ") + fmt(it[1]) : "Цена — по запросу";
    };
    var upd = function () { ss.innerHTML = G[sd.value].items.map(function (it, i) { return '<option value="' + i + '">' + it[0] + "</option>"; }).join(""); calc(); };
    sd.onchange = upd; ss.onchange = calc; upd();
  }

  // Акция: два аналога, скидка 15%. Итого = (цена первого + цена второго) × 0,85 (та же формула в src/pricing.mjs)
  var pa = $("#pr-a"), pb = $("#pr-b"), promo = $("#promo");
  if (pa && pb && promo) {
    var disc = Number(promo.getAttribute("data-discount")) / 100;
    var pupd = function () {
      var sum = Number(pa.value) + Number(pb.value), total = Math.round(sum * (1 - disc));
      $("#pr-sum").textContent = "от " + fmt(sum); $("#pr-disc").textContent = "−" + fmt(sum - total); $("#pr-total").textContent = "от " + fmt(total);
    };
    pa.addEventListener("change", pupd); pb.addEventListener("change", pupd);
  }

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
  var cur = 0, timer = null, userPaused = reduce, hover = false, focus = false, hidden = false, offscreen = false, touchUntil = 0;

  function load(i) {
    var img = slides[i] && slides[i].querySelector("img[data-src]");
    if (img) { img.src = img.getAttribute("data-src"); img.removeAttribute("data-src"); }
  }
  function show(i) {
    i = (i + slides.length) % slides.length;
    load(i); load((i + 1) % slides.length);
    slides[cur].classList.remove("is-active"); slides[cur].setAttribute("aria-hidden", "true"); dots[cur].removeAttribute("aria-current");
    cur = i;
    slides[cur].classList.add("is-active"); slides[cur].removeAttribute("aria-hidden"); dots[cur].setAttribute("aria-current", "true");
  }
  function active() { return !userPaused && !hover && !focus && !hidden && !offscreen && Date.now() >= touchUntil; }
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

  // Наведение мыши и фокус с клавиатуры ставят на паузу
  stage.addEventListener("mouseenter", function () { hover = true; schedule(); });
  stage.addEventListener("mouseleave", function () { hover = false; schedule(); });
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

// Портфолио: блок на главной и галерея /portfolio/ (данные из /api/portfolio)
(function () {
  var home = document.getElementById("works-home-grid"), grid = document.getElementById("works-grid");
  if (!home && !grid) return;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(w, onOpen) {
    var b = el("button", "work-card"); b.type = "button";
    var ph = w.photos[0], img = document.createElement("img");
    img.src = ph.src; img.alt = w.title; img.loading = "lazy"; img.decoding = "async"; img.width = ph.width; img.height = ph.height;
    var pic = el("span", "work-pic"); pic.appendChild(img);
    if (!w.is_real) pic.appendChild(el("span", "work-tag", "Иллюстрация"));
    b.appendChild(pic); b.appendChild(el("span", "work-title", w.title));
    b.addEventListener("click", function () { onOpen(w); });
    return b;
  }
  fetch("/api/portfolio" + (home && !grid ? "?home=1" : ""), { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (data) {
    var works = data.works || [], cats = data.categories || [];
    if (home) {
      if (!works.length) return;
      document.getElementById("works-home").hidden = false;
      works.slice(0, 6).forEach(function (w) { home.appendChild(card(w, function () { location.href = "/portfolio/"; })); });
      return;
    }
    // страница /portfolio/
    var filters = document.getElementById("works-filters"), empty = document.getElementById("works-empty");
    var lb = document.getElementById("lightbox"), cur = null, idx = 0, opener = null, active = "";
    if (!works.length) { empty.hidden = false; return; }
    function render() {
      grid.textContent = "";
      works.filter(function (w) { return !active || w.category === active; }).forEach(function (w) { grid.appendChild(card(w, function (x) { open(x); })); });
    }
    function chip(label, key, count) {
      var b = el("button", "chip-f" + (active === key ? " on" : ""), label + (count != null ? " · " + count : "")); b.type = "button"; b.setAttribute("aria-pressed", active === key);
      b.addEventListener("click", function () { active = key; draw(); });
      return b;
    }
    function draw() {
      filters.textContent = ""; filters.appendChild(chip("Все", "", works.length));
      cats.forEach(function (c) { var n = works.filter(function (w) { return w.category === c[0]; }).length; if (n) filters.appendChild(chip(c[1], c[0], n)); });
      render();
    }
    function show() {
      var p = cur.photos[idx], img = lb.querySelector("img");
      img.src = p.src; img.alt = cur.title;
      lb.querySelector(".lb-title").textContent = cur.title;
      lb.querySelector(".lb-badge").textContent = cur.is_real ? "Реальная работа" : "Иллюстрация";
      lb.querySelector(".lb-problem").textContent = cur.problem ? "Проблема: " + cur.problem : "";
      lb.querySelector(".lb-solution").textContent = cur.solution ? "Что сделано: " + cur.solution : "";
      lb.querySelector(".lb-count").textContent = cur.photos.length > 1 ? (idx + 1) + " из " + cur.photos.length : "";
      lb.querySelector(".lb-prev").hidden = lb.querySelector(".lb-next").hidden = cur.photos.length < 2;
    }
    function open(w) { cur = w; idx = 0; opener = document.activeElement; show(); if (lb.showModal) lb.showModal(); else lb.setAttribute("open", ""); }
    function step(d) { idx = (idx + d + cur.photos.length) % cur.photos.length; show(); }
    lb.querySelector(".lb-x").addEventListener("click", function () { lb.close(); });
    lb.querySelector(".lb-prev").addEventListener("click", function () { step(-1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { step(1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1); });
    lb.addEventListener("close", function () { if (opener && opener.focus) opener.focus(); });
    draw();
  }).catch(function () { var e = document.getElementById("works-empty"); if (e) e.hidden = false; });
})();


// Согласие на cookie. Яндекс.Метрика (если подключена, data-ym на body) загружается только после согласия на аналитику.
(function () {
  var KEY = "ff_consent", ymId = Number(document.body.getAttribute("data-ym")) || 0;
  var box = document.getElementById("ck"); if (!box) return;
  var set = box.querySelector(".ck-set"), main = box.querySelector(".ck-main"), an = document.getElementById("ck-an");
  var mem = null;
  function read() { try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && v.v === 1) return v; } catch (e) {} return mem; }
  function save(analytics) { var v = { v: 1, analytics: !!analytics, date: new Date().toISOString().slice(0, 10) }; mem = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} return v; }
  function loadYm() {
    if (!ymId || window.__ym) return;
    (function (m, e, t, r, i, k, a) { m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date(); k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a); })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
    window.ym(ymId, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true });
    window.__ym = ymId;
  }
  function dropYmCookies() {
    document.cookie.split(";").forEach(function (c) {
      var n = c.split("=")[0].trim();
      if (/^(_ym|yabs-|_ga)/.test(n) || n === "yandexuid" || n === "ymex") { ["", "." + location.hostname].forEach(function (d) { document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + (d ? "; domain=" + d : ""); }); }
    });
  }
  function apply(analytics, prev) {
    save(analytics);
    box.hidden = true;
    if (analytics) loadYm();
    else if (prev && prev.analytics) { dropYmCookies(); location.reload(); }
  }
  function open(settings) {
    var cur = read();
    if (an) an.checked = !!(cur && cur.analytics);
    if (set) { set.hidden = !settings; main.hidden = !!settings; }
    box.hidden = false;
    var f = box.querySelector("button"); if (f) f.focus();
  }
  function bind(id, fn) { var b = document.getElementById(id); if (b) b.addEventListener("click", fn); }
  bind("ck-all", function () { apply(true, read()); });
  bind("ck-min", function () { apply(false, read()); });
  bind("ck-cfg", function () { open(true); });
  bind("ck-save", function () { apply(!!(an && an.checked), read()); });
  bind("ck-close", function () { box.hidden = true; });
  bind("ck-open", function () { open(!!set); });
  function mark() { document.body.classList.toggle("ck-on", !box.hidden); }
  new MutationObserver(mark).observe(box, { attributes: true, attributeFilter: ["hidden"] }); mark();
  var cur = read();
  if (cur && cur.analytics) loadYm();
  else if (ymId && !cur) open(false);
})();
