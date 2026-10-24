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
sudo -u finikfix nano .env      # SITE_URL, METRIKA_ID, SITE_INN, TG_BOT_TOKEN, TG_CHAT_ID

# 3. Фото мастера: скопировать в src/assets/img/master.jpg, затем
sudo -u finikfix npm run build   # SITE_URL и др. подхватываются из окружения
```

`npm run build` читает переменные окружения. Чтобы подхватить `.env`, собирайте так: `set -a; . ./.env; set +a; npm run build`.

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

Обновление: `git pull`, `set -a; . ./.env; set +a; npm run build`.

## Заявки

Каждая заявка дописывается в `data/leads.jsonl` и, если заданы `TG_BOT_TOKEN` и `TG_CHAT_ID`, уходит мастеру в Telegram. Бота создать у @BotFather, `chat_id` узнать, написав боту и открыв `https://api.telegram.org/bot<TOKEN>/getUpdates`. Отправки на email пока нет ([Уточнить: SMTP или почтовый сервис]). Защита: honeypot-поле и лимит 5 заявок за 10 минут с одного IP.

Данные хранятся на вашем сервере в РФ ([Уточнить: расположение сервера]). `data/` закрыт от веб-доступа, потому что сервер отдаёт только `public/`.

## Что ещё нужно от заказчика

- Фото мастера (`master.jpg`).
- Домен, ИНН самозанятого, номер Метрики, токен и chat id Telegram-бота.
- Цена диагностики без ремонта, прайс ноутбуков и ПК, гарантия на смартфоны (сейчас везде 90 дней), решение по акции «от 3 000 ₽ — чистка бесплатно».
- Скриншоты отзывов Авито и фото кейса со стиком (на сайт пока не выводятся, чтобы не выдумывать).
- Карточки Яндекс.Бизнес и 2ГИС создаются отдельно (адрес указывать только там).
