# Сайт FinikFix (Ангарск)

Сайт мастерской по ремонту консолей, геймпадов, ноутбуков, ПК и смартфонов. Проектные правила и факты — в [AGENTS.md](AGENTS.md).

**Стек:** Node.js ≥ 20, без внешних зависимостей. Страницы генерируются скриптом в статический `public/`, `server.mjs` отдаёт их и принимает заявки (`POST /api/lead`).

## Локальный запуск

```bash
npm run dev      # собрать и запустить: http://127.0.0.1:3000
npm test         # сборка + тесты
```

## Где что править

| Что | Файл |
|---|---|
| Цены, контакты, тексты категорий, FAQ, витрина | `src/data.mjs` |
| Вёрстка страниц | `src/templates.mjs` |
| Стили, скрипты | `src/client/style.css`, `src/client/app.js` |
| Фото мастера | положить в `src/assets/img/master.jpg` (4:5, лучше 1200×1500) |

После правок: `npm run build` (на сервере затем `sudo systemctl restart finikfix` не нужен, статика читается с диска).

## Развёртывание на своём сервере (Ubuntu/Debian + nginx)

Нужно: сервер с Node.js ≥ 20, nginx, домен, направленный на IP сервера.
[Уточнить: ОС и версия сервера, домен, SSH-доступ].

```bash
# 1. Код
sudo useradd -r -m -d /opt/finikfix finikfix
sudo -u finikfix git clone <URL репозитория> /opt/finikfix
cd /opt/finikfix

# 2. Настройки
sudo -u finikfix cp .env.example .env
sudo -u finikfix nano .env      # SITE_URL, METRIKA_ID, SITE_INN

# 3. Фото мастера: скопировать в src/assets/img/master.jpg, затем
sudo -u finikfix npm run build   # SITE_URL и др. берутся из .env
```

Файл `.env` читается автоматически и при сборке, и при запуске (на Windows тоже).

```bash
# 4. Сервис
sudo cp deploy/finikfix.service /etc/systemd/system/
sudo mkdir -p /opt/finikfix/data && sudo chown finikfix /opt/finikfix/data
sudo systemctl daemon-reload && sudo systemctl enable --now finikfix

# 5. nginx + HTTPS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/finikfix   # поправьте server_name
sudo ln -s /etc/nginx/sites-available/finikfix /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d finikfix.ru -d www.finikfix.ru
```

Обновление: `git pull && npm run build`.

## Связь с мастером

Формы заявки на сайте нет (решение владельца). Связь: кнопки «Позвонить» (`tel:`), MAX и Telegram, плавающая панель связи. Ссылки задаются в `src/data.mjs` (`site.phoneRaw`, `site.max`, `site.telegram`). `/api/lead` всегда отвечает 503.

Данные хранятся на вашем сервере в РФ ([Уточнить: расположение сервера]). `data/` закрыт от веб-доступа, потому что сервер отдаёт только `public/`.

## Что ещё нужно от заказчика

- Фото мастера (`master.jpg`).
- Домен, ИНН самозанятого, номер Метрики, токен и chat id Telegram-бота.
- Цена диагностики без ремонта, прайс ноутбуков и ПК, гарантия на смартфоны (сейчас везде 90 дней), решение по акции «от 3 000 ₽ — чистка бесплатно».
- Скриншоты отзывов Авито и фото кейса со стиком (на сайт пока не выводятся, чтобы не выдумывать).
- Карточки Яндекс.Бизнес и 2ГИС создаются отдельно (адрес указывать только там).
