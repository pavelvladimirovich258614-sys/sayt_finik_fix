// Проверка доставки: node --env-file=/opt/finikfix/shared/.env scripts/send-test-email.mjs
import { mailConfig, sendMail } from "../src/mail.mjs";
const cfg = mailConfig(process.env);
if (!cfg) { console.error("Почта не настроена: нужны MAIL_TO, MAIL_FROM, POSTBOX_KEY_ID и POSTBOX_SECRET."); process.exit(1); }
try { const r = await sendMail(cfg, { subject: "FinikFix: тестовое письмо", text: "Если вы видите это письмо, уведомления о заявках настроены." }); console.log("Принято API Postbox, MessageId:", r.messageId, "\nПроверьте, что письмо пришло в ящик получателя (в т.ч. «Спам»)."); }
catch (e) { console.error("Ошибка отправки:", e.message); process.exit(2); }
