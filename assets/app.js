(function () {
  var C = window.FF, $ = function (s, r) { return (r || document).querySelector(s); };
  var fmt = function (n) { return n.toLocaleString("ru-RU").replace(/ /g, " ") + " ₽"; };

  // Контакты и ссылки из конфига
  document.querySelectorAll("[data-tel]").forEach(function (a) { a.href = "tel:" + C.phoneRaw; if (!a.dataset.keep) a.textContent = C.phone; });
  document.querySelectorAll("[data-wa]").forEach(function (a) { a.href = C.whatsapp + "?text=" + encodeURIComponent(C.preset); });
  document.querySelectorAll("[data-tg]").forEach(function (a) { a.href = C.telegram; });
  document.querySelectorAll("[data-vk]").forEach(function (a) { a.href = C.vk; });
  document.querySelectorAll("[data-ch]").forEach(function (a) { a.href = C.telegramChannel; });
  document.querySelectorAll("[data-avito]").forEach(function (a) { a.href = C.avito; a.target = "_blank"; a.rel = "noopener"; });
  document.querySelectorAll("[data-avito-ad]").forEach(function (a) { a.href = C.avitoAd; });
  document.querySelectorAll("[data-hours]").forEach(function (e) { e.textContent = C.hours; });
  document.querySelectorAll("[data-place]").forEach(function (e) { e.textContent = C.place; });
  document.querySelectorAll("[data-inn]").forEach(function (e) {
    e.textContent = C.inn ? "ИНН " + C.inn + ". " : "";
  });

  // Прайс
  var box = $("#prices-box");
  if (box) {
    box.innerHTML = C.services.map(function (g) {
      return '<div class="price-group"><h3>' + g.name + "</h3><table>" + g.items.map(function (i) {
        return "<tr><td>" + i[0] + "</td><td>" + (i[1] ? (i[2] ? "" : "от ") + fmt(i[1]) : "по запросу") + "</td></tr>";
      }).join("") + "</table>" + (g.note ? '<p class="note">' + g.note + "</p>" : "") + "</div>";
    }).join("");
  }
  var shop = $("#shop-box");
  if (shop) shop.innerHTML = C.shop.map(function (s) {
    return '<div class="card"><h3>' + s[0] + '</h3><p><b style="color:var(--ac2);font-size:20px">' + fmt(s[1]) + "</b></p><p>Восстановлено после ремонта, гарантия 90 дней</p></div>";
  }).join("");

  // Калькулятор + список категорий формы
  var sd = $("#c-dev"), ss = $("#c-srv"), cr = $("#c-res"), cb = $("#c-btn"), cat = $("#f-cat");
  if (sd) {
    sd.innerHTML = C.services.map(function (g, i) { return '<option value="' + i + '">' + g.name + "</option>"; }).join("");
    var upd = function () {
      var g = C.services[sd.value];
      ss.innerHTML = g.items.map(function (it, i) { return '<option value="' + i + '">' + it[0] + "</option>"; }).join("");
      calc();
    };
    var calc = function () {
      var g = C.services[sd.value], it = g.items[ss.value];
      cr.textContent = it[1] ? (it[2] ? "" : "от ") + fmt(it[1]) : "Цена — по запросу";
      cb.dataset.sel = g.name + ": " + it[0] + " (" + cr.textContent + ")";
    };
    sd.onchange = upd; ss.onchange = calc; upd();
    cb.addEventListener("click", function () {
      var cm = $("#f-msg"); if (cm) cm.value = "Из калькулятора: " + cb.dataset.sel;
      var g = C.services[sd.value]; if (cat) cat.value = g.name;
    });
  }
  if (cat) cat.innerHTML = C.services.map(function (g) { return "<option>" + g.name + "</option>"; }).join("") + "<option>Скупка техники</option><option>Другое</option>";

  // Форма
  var f = $("#lead");
  if (f) {
    var ph = $("#f-phone");
    ph.addEventListener("input", function () {
      var d = ph.value.replace(/\D/g, "").replace(/^[78]/, "").slice(0, 10), o = "+7";
      if (d.length) o += " (" + d.slice(0, 3);
      if (d.length >= 3) o += ")";
      if (d.length > 3) o += " " + d.slice(3, 6);
      if (d.length > 6) o += "-" + d.slice(6, 8);
      if (d.length > 8) o += "-" + d.slice(8, 10);
      ph.value = d.length ? o : "";
    });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = $("#f-res"); m.className = "msg";
      if ($("#f-hp").value) return;
      if (!$("#f-ok").checked) { m.className = "msg err"; m.textContent = "Нужно согласие на обработку персональных данных."; return; }
      if (ph.value.replace(/\D/g, "").length < 11) { m.className = "msg err"; m.textContent = "Введите телефон полностью."; return; }
      var text = "Заявка с сайта FinikFix\nИмя: " + $("#f-name").value + "\nТелефон: " + ph.value + "\nКатегория: " + cat.value + "\nКомментарий: " + $("#f-msg").value;
      var done = function () { if (window.ym && C.metrika) ym(C.metrika, "reachGoal", "lead"); location.href = "spasibo.html"; };
      if (C.endpoint) {
        fetch(C.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: $("#f-name").value, phone: ph.value, category: cat.value, comment: $("#f-msg").value }) })
          .then(function (r) { if (!r.ok) throw 0; done(); })
          .catch(function () { m.className = "msg err"; m.textContent = "Не отправилось. Позвоните: " + C.phone; });
      } else {
        // Бэкенда пока нет: открываем чат мастера с готовым текстом
        window.open(C.whatsapp + "?text=" + encodeURIComponent(text), "_blank", "noopener");
        m.className = "msg ok"; m.textContent = "Открыл WhatsApp с готовой заявкой — осталось нажать «Отправить».";
      }
    });
  }
})();
