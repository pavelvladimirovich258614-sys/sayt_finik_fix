(function () {
  var $ = function (s) { return document.querySelector(s); };
  var csrf = "", cats = [], works = [], editing = null;
  function el(tag, props, kids) { var e = document.createElement(tag); Object.keys(props || {}).forEach(function (k) { if (k === "text") e.textContent = props[k]; else e.setAttribute(k, props[k]); }); (kids || []).forEach(function (c) { e.appendChild(c); }); return e; }
  function api(method, path, body, isForm) {
    var h = {}; if (csrf) h["X-CSRF-Token"] = csrf; if (body && !isForm) h["Content-Type"] = "application/json";
    return fetch("/admin/api" + path, { method: method, headers: h, credentials: "same-origin", body: body ? (isForm ? body : JSON.stringify(body)) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Ошибка ответа" }; }).then(function (j) { j.status = r.status; return j; }); });
  }
  function say(id, text, ok) { var m = $(id); m.textContent = text || ""; m.className = "msg" + (ok ? " ok" : ""); }
  function show(view) { $("#login").hidden = view !== "login"; $("#main").hidden = view !== "main"; }

  function boot() {
    api("GET", "/me").then(function (r) {
      if (r.ok) { csrf = r.csrf; cats = r.categories; $("#who").textContent = r.email; fillCats(); show("main"); load(); } else show("login");
    });
  }
  function fillCats() { var s = $("#edit-form select"); s.textContent = ""; cats.forEach(function (c) { s.appendChild(el("option", { value: c[0], text: c[1] })); }); }
  function load() { api("GET", "/works").then(function (r) { if (!r.ok) return say("#msg", r.error); works = r.works; render(); }); }
  function catName(k) { var f = cats.filter(function (c) { return c[0] === k; })[0]; return f ? f[1] : k; }

  function render() {
    var ul = $("#list"); ul.textContent = "";
    if (!works.length) ul.appendChild(el("li", { class: "hint", text: "Работ пока нет. Нажмите «Новая работа»." }));
    works.forEach(function (w, i) {
      var cover = w.photos[0] ? el("img", { class: "cover", src: w.photos[0].src, alt: "" }) : el("div", { class: "cover nocover", text: "нет фото" });
      var badges = el("div", { class: "badges" }, [
        el("span", { class: "badge " + (w.published ? "on" : ""), text: w.published ? "Опубликовано" : "Скрыто" }),
        el("span", { class: "badge", text: catName(w.category) }),
        el("span", { class: "badge", text: w.is_real ? "Реальная работа" : "Иллюстрация" }),
        w.on_home ? el("span", { class: "badge on", text: "На главной" }) : null,
        w.in_slider ? el("span", { class: "badge on", text: "В слайдере" }) : null,
        el("span", { class: "badge", text: "Фото: " + w.photos.length })
      ].filter(Boolean));
      function btn(t, f, extra) { var b = el("button", { class: "btn ghost sm", type: "button", text: t }); b.addEventListener("click", f); return b; }
      var acts = el("div", { class: "acts" }, [
        btn("Редактировать", function () { openEdit(w); }),
        btn("↑", function () { move(i, -1); }), btn("↓", function () { move(i, 1); }),
        btn(w.published ? "Скрыть" : "Опубликовать", function () { toggle(w); }),
        btn("Удалить", function () { if (confirm("Удалить работу «" + w.title + "» вместе с фото? Это нельзя отменить.")) api("DELETE", "/works/" + w.id).then(function (r) { r.ok ? load() : say("#msg", r.error); }); })
      ]);
      ul.appendChild(el("li", { class: "item" }, [cover, el("div", {}, [el("h3", { text: w.title }), badges, acts])]));
    });
  }
  function payload(w) { return { title: w.title, category: w.category, problem: w.problem, solution: w.solution, description: w.description, price_rub: w.price_rub, price_note: w.price_note, is_real: w.is_real, published: w.published, on_home: w.on_home, in_slider: w.in_slider }; }
  function toggle(w) { var p = payload(w); p.published = !w.published; api("PUT", "/works/" + w.id, p).then(function (r) { r.ok ? load() : say("#msg", r.error); }); }
  function move(i, d) {
    var j = i + d; if (j < 0 || j >= works.length) return;
    var ids = works.map(function (w) { return w.id; }); var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    api("POST", "/reorder", { ids: ids }).then(function (r) { r.ok ? load() : say("#msg", r.error); });
  }

  function openEdit(w) {
    editing = w || null; var f = $("#edit-form"); say("#edit-msg", "");
    $("#edit-title").textContent = w ? "Редактирование работы" : "Новая работа";
    f.elements.title.value = w ? w.title : ""; f.category.value = w ? w.category : cats[0][0];
    f.problem.value = w ? w.problem : ""; f.solution.value = w ? w.solution : ""; f.description.value = w ? w.description || "" : ""; f.price_rub.value = w && w.price_rub != null ? w.price_rub : ""; f.price_note.value = w ? w.price_note || "" : "";
    f.published.checked = w ? !!w.published : false; f.is_real.checked = w ? !!w.is_real : true;
    f.on_home.checked = w ? !!w.on_home : false; f.in_slider.checked = w ? !!w.in_slider : false;
    $("#photos-box").hidden = !w; $("#files").value = ""; renderPhotos();
    $("#edit").showModal();
  }
  function renderPhotos() {
    var box = $("#photos"); box.textContent = ""; if (!editing) return;
    editing.photos.forEach(function (p, pi) {
      var ids = function () { return editing.photos.map(function (x) { return x.id; }); };
      var mv = function (d) { return function () { var a = ids(), j = pi + d; if (j < 0 || j >= a.length) return; var t = a[pi]; a[pi] = a[j]; a[j] = t; api("POST", "/reorder", { workId: editing.id, ids: a }).then(function (r) { if (!r.ok) return say("#edit-msg", r.error); api("GET", "/works").then(function (x) { works = x.works; editing = works.filter(function (w) { return w.id === editing.id; })[0]; renderPhotos(); render(); }); }); }; };
      var bl = el("button", { class: "btn sm ghost", type: "button", text: "←", "aria-label": "Сдвинуть влево" }), br = el("button", { class: "btn sm ghost", type: "button", text: "→", "aria-label": "Сдвинуть вправо" }), bc = el("button", { class: "btn sm ghost", type: "button", text: pi === 0 ? "Обложка" : "Сделать обложкой" });
      bl.addEventListener("click", mv(-1)); br.addEventListener("click", mv(1)); bc.addEventListener("click", function () { if (pi === 0) return; var a = ids(); a.splice(pi, 1); a.unshift(p.id); api("POST", "/reorder", { workId: editing.id, ids: a }).then(function (r) { if (!r.ok) return say("#edit-msg", r.error); api("GET", "/works").then(function (x) { works = x.works; editing = works.filter(function (w) { return w.id === editing.id; })[0]; renderPhotos(); render(); }); }); });
      var b = el("button", { class: "btn sm", type: "button", text: "×", "aria-label": "Удалить фото" });
      b.addEventListener("click", function () { api("DELETE", "/photos/" + p.id).then(function (r) { if (!r.ok) return say("#edit-msg", r.error); editing.photos = editing.photos.filter(function (x) { return x.id !== p.id; }); renderPhotos(); load(); }); });
      box.appendChild(el("div", { class: "ph" }, [el("img", { src: p.src, alt: "" }), el("div", { class: "row" }, [bl, br, bc, b])]));
    });
  }
  $("#new").addEventListener("click", function () { openEdit(null); });
  $("#close").addEventListener("click", function () { $("#edit").close(); });
  $("#edit-form").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target;
    var body = { title: f.elements.title.value, category: f.category.value, problem: f.problem.value, solution: f.solution.value, description: f.description.value, price_rub: f.price_rub.value, price_note: f.price_note.value, published: f.published.checked, is_real: f.is_real.checked, on_home: f.on_home.checked, in_slider: f.in_slider.checked };
    var req = editing ? api("PUT", "/works/" + editing.id, body) : api("POST", "/works", body);
    req.then(function (r) {
      if (!r.ok) return say("#edit-msg", r.error);
      if (editing) { $("#edit").close(); load(); } else { load(); api("GET", "/works").then(function (x) { works = x.works; editing = works.filter(function (w) { return w.id === r.id; })[0]; $("#photos-box").hidden = false; $("#edit-title").textContent = "Работа создана: добавьте фото"; renderPhotos(); }); }
    });
  });
  $("#upload").addEventListener("click", function () {
    var files = $("#files").files; if (!files.length || !editing) return say("#edit-msg", "Выберите файлы");
    var fd = new FormData(); for (var i = 0; i < files.length; i++) fd.append("photo", files[i]);
    say("#edit-msg", "Загружаю…", true);
    api("POST", "/works/" + editing.id + "/photos", fd, true).then(function (r) {
      if (!r.ok) return say("#edit-msg", r.error);
      say("#edit-msg", "Фото загружены", true); $("#files").value = "";
      api("GET", "/works").then(function (x) { works = x.works; editing = works.filter(function (w) { return w.id === editing.id; })[0]; renderPhotos(); render(); });
    });
  });
  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target; say("#login-msg", "");
    api("POST", "/login", { email: f.email.value, password: f.password.value }).then(function (r) {
      if (!r.ok) return say("#login-msg", r.error);
      f.password.value = ""; boot();
    });
  });
  $("#logout").addEventListener("click", function () { api("POST", "/logout").then(function () { csrf = ""; show("login"); }); });
  // Вкладки: работы / отзывы / заявки
  var tabs = { works: ["#list", "#tab-works"], reviews: ["#reviews-panel", "#tab-reviews"], leads: ["#leads-panel", "#tab-leads"] };
  function tab(n) { Object.keys(tabs).forEach(function (k) { $(tabs[k][0]).hidden = k !== n; $(tabs[k][1]).className = "btn sm" + (k === n ? "" : " ghost"); }); if (n === "reviews") loadReviews(); if (n === "leads") loadLeads(); }
  Object.keys(tabs).forEach(function (k) { $(tabs[k][1]).addEventListener("click", function () { tab(k); }); });
  var STAT = { pending: "Ждёт проверки", approved: "Опубликован", rejected: "Отклонён", hidden: "Скрыт" };
  function loadReviews() {
    api("GET", "/reviews?status=" + encodeURIComponent($("#rv-st").value) + "&source=" + encodeURIComponent($("#rv-src").value)).then(function (r) {
      var ul = $("#rv-list"); ul.textContent = ""; if (!r.ok) return say("#msg", r.error);
      if (!r.reviews.length) ul.appendChild(el("li", { class: "hint", text: "Отзывов нет." }));
      r.reviews.forEach(function (v) {
        var acts = el("div", { class: "acts" }, [["approved", "Одобрить"], ["rejected", "Отклонить"], ["hidden", "Скрыть"], ["pending", "Вернуть на проверку"]].filter(function (a) { return a[0] !== v.status; }).map(function (a) {
          var b = el("button", { class: "btn ghost sm", type: "button", text: a[1] }); b.addEventListener("click", function () { api("POST", "/reviews/" + v.id + "/status", { status: a[0] }).then(function (x) { x.ok ? loadReviews() : say("#msg", x.error); }); }); return b; }));
        ul.appendChild(el("li", { class: "item" }, [el("div", {}, [el("h3", { text: v.author + (v.rating ? " · " + v.rating + "★" : " · оценка не указана") }), el("div", { class: "badges" }, [el("span", { class: "badge", text: v.source === "site" ? "Сайт" : "Авито" }), el("span", { class: "badge " + (v.status === "approved" ? "on" : ""), text: STAT[v.status] }), el("span", { class: "badge", text: v.kind }), el("span", { class: "badge", text: v.review_date || v.created_at.slice(0, 10) })]), el("p", { text: v.body }), acts])]));
      });
    });
  }
  $("#rv-src").addEventListener("change", loadReviews); $("#rv-st").addEventListener("change", loadReviews);
  function loadLeads() {
    api("GET", "/leads").then(function (r) {
      var ul = $("#leads-list"); ul.textContent = ""; if (!r.ok) return say("#msg", r.error);
      if (!r.leads.length) ul.appendChild(el("li", { class: "hint", text: "Заявок пока нет." }));
      r.leads.forEach(function (l) {
        ul.appendChild(el("li", { class: "item" }, [el("div", {}, [el("h3", { text: l.name + " · " + l.phone }), el("p", { text: (l.comment || "") + (l.calc ? " [" + l.calc + "]" : "") }), el("div", { class: "badges" }, [el("span", { class: "badge", text: l.created_at.slice(0, 16).replace("T", " ") })].concat(l.deliveries.map(function (d) { return el("span", { class: "badge " + (d.status === "delivered" ? "on" : ""), text: d.channel + ": " + (d.status === "delivered" ? "доставлено" : d.status === "failed" ? "не доставлено" : "ожидает (попыток " + d.attempts + ")") }); })))])]));
      });
    });
  }
  boot();
})();
