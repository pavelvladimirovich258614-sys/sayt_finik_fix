// SQLite-хранилище портфолио и админки (встроенный node:sqlite, без зависимостей).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { CATEGORIES, CAT_SET, cleanWork } from "./model.mjs";
export { CATEGORIES, cleanWork };

export function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o750 });
  const db = new DatabaseSync(join(dataDir, "portfolio.db"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
  CREATE TABLE IF NOT EXISTS works(id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, problem TEXT NOT NULL DEFAULT '', solution TEXT NOT NULL DEFAULT '',
    is_real INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 0, on_home INTEGER NOT NULL DEFAULT 0, in_slider INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY, work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE, file TEXT NOT NULL UNIQUE, width INTEGER NOT NULL, height INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, source TEXT NOT NULL CHECK(source IN ('avito','site')), source_key TEXT UNIQUE, kind TEXT NOT NULL DEFAULT 'repair',
    author TEXT NOT NULL, rating INTEGER CHECK(rating IS NULL OR (rating BETWEEN 1 AND 5)), body TEXT NOT NULL, review_date TEXT NOT NULL DEFAULT '', item TEXT NOT NULL DEFAULT '', reply TEXT NOT NULL DEFAULT '',
    has_photos INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','hidden')), ip_hash TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', calc TEXT NOT NULL DEFAULT '', page TEXT NOT NULL DEFAULT '', consent_at TEXT NOT NULL,
    ip_hash TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lead_deliveries(id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE, channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed')),
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', next_try INTEGER NOT NULL DEFAULT 0, delivered_at TEXT, UNIQUE(lead_id, channel));
  CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);`);

  // Миграции для баз, созданных до появления импорта кейсов.
  const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
  const wc = cols("works");
  for (const [n, d] of [["source_id", "TEXT"], ["price_rub", "INTEGER"], ["price_note", "TEXT NOT NULL DEFAULT ''"], ["expected_photos", "INTEGER NOT NULL DEFAULT 0"], ["description", "TEXT NOT NULL DEFAULT ''"]]) if (!wc.has(n)) db.exec(`ALTER TABLE works ADD COLUMN ${n} ${d}`);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS works_source_id ON works(source_id) WHERE source_id IS NOT NULL");
  if (!cols("photos").has("sha256")) db.exec("ALTER TABLE photos ADD COLUMN sha256 TEXT");

  const now = () => new Date().toISOString();
  const q = (sql) => db.prepare(sql);
  const withPhotos = (works) => {
    if (!works.length) return [];
    const ph = q(`SELECT id, work_id, file, width, height FROM photos WHERE work_id IN (${works.map(() => "?").join(",")}) ORDER BY sort, id`).all(...works.map((w) => w.id));
    return works.map((w) => ({ ...w, photos: ph.filter((p) => p.work_id === w.id).map(({ work_id, ...p }) => p) }));
  };
  const plain = (rows) => rows.map((r) => ({ ...r }));

  return {
    db,
    close: () => db.close(),
    // --- импорт кейсов (идемпотентно по source_id) ---
    getWorkBySource: (sid) => withPhotos(plain(q("SELECT * FROM works WHERE source_id=?").all(sid)))[0] || null,
    createImported(c) {
      const max = q("SELECT COALESCE(MAX(sort),0) AS m FROM works").get().m;
      return Number(q("INSERT INTO works(title,category,problem,solution,is_real,published,on_home,in_slider,sort,created_at,updated_at,source_id,price_rub,price_note,expected_photos,description) VALUES(?,?,?,?,1,0,0,0,?,?,?,?,?,?,?,?)")
        .run(c.title, c.category, c.problem || "", c.solution || "", max + 1, now(), now(), c.source_id, c.price_rub ?? null, c.price_note || "", c.expected_photos, c.description || "").lastInsertRowid);
    },
    setPublished: (id, v) => q("UPDATE works SET published=?,updated_at=? WHERE id=?").run(v ? 1 : 0, now(), id),
    photoHashes: (workId) => new Set(q("SELECT sha256 FROM photos WHERE work_id=? AND sha256 IS NOT NULL").all(workId).map((r) => r.sha256)),
    setCover(workId, photoId) { // обложка = первое фото
      const ids = q("SELECT id FROM photos WHERE work_id=? ORDER BY sort,id").all(workId).map((r) => r.id).filter((i) => i !== photoId);
      this.reorderPhotos(workId, [photoId, ...ids]);
    },
    // --- отзывы ---
    addReview(r) {
      return Number(q("INSERT INTO reviews(source,source_key,kind,author,rating,body,review_date,item,reply,has_photos,status,ip_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(r.source, r.source_key ?? null, r.kind || "repair", r.author, r.rating ?? null, r.body, r.review_date || "", r.item || "", r.reply || "", r.has_photos ? 1 : 0, r.status || "pending", r.ip_hash || "", now()).lastInsertRowid);
    },
    hasReviewKey: (k) => !!q("SELECT 1 FROM reviews WHERE source_key=?").get(k),
    listReviews: ({ status, source } = {}) => {
      let sql = "SELECT * FROM reviews WHERE 1=1"; const a = [];
      if (status) { sql += " AND status=?"; a.push(status); }
      if (source) { sql += " AND source=?"; a.push(source); }
      return plain(q(sql + " ORDER BY id DESC").all(...a));
    },
    setReviewStatus: (id, status) => q("UPDATE reviews SET status=? WHERE id=?").run(status, id).changes > 0,
    recentReviewsByIp: (h, since) => q("SELECT COUNT(*) AS n FROM reviews WHERE ip_hash=? AND source='site' AND created_at>?").get(h, since).n,
    // --- заявки ---
    addLead(l, channels) {
      db.exec("BEGIN");
      try {
        const id = Number(q("INSERT INTO leads(name,phone,comment,calc,page,consent_at,ip_hash,created_at) VALUES(?,?,?,?,?,?,?,?)").run(l.name, l.phone, l.comment, l.calc, l.page, now(), l.ip_hash || "", now()).lastInsertRowid);
        for (const c of channels) q("INSERT INTO lead_deliveries(lead_id,channel) VALUES(?,?)").run(id, c);
        db.exec("COMMIT"); return id;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    getLead: (id) => q("SELECT * FROM leads WHERE id=?").get(id) || null,
    listLeads: () => plain(q("SELECT * FROM leads ORDER BY id DESC LIMIT 200").all()).map((l) => ({ ...l, deliveries: plain(q("SELECT channel,status,attempts,last_error,delivered_at FROM lead_deliveries WHERE lead_id=?").all(l.id)) })),
    dueDeliveries: (t) => plain(q("SELECT * FROM lead_deliveries WHERE status='pending' AND next_try<=? ORDER BY id LIMIT 20").all(t)),
    markDelivery(id, ok, err, nextTry) {
      if (ok) q("UPDATE lead_deliveries SET status='delivered',attempts=attempts+1,delivered_at=?,last_error='' WHERE id=?").run(now(), id);
      else { const a = q("SELECT attempts FROM lead_deliveries WHERE id=?").get(id).attempts + 1; q("UPDATE lead_deliveries SET status=?,attempts=?,last_error=?,next_try=? WHERE id=?").run(a >= 8 ? "failed" : "pending", a, String(err).slice(0, 200), nextTry, id); }
    },
    recentLeadsByIp: (h, since) => q("SELECT COUNT(*) AS n FROM leads WHERE ip_hash=? AND created_at>?").get(h, since).n,
    listPublic({ category, home, slider } = {}) {
      let sql = "SELECT * FROM works WHERE published=1"; const args = [];
      if (category && CAT_SET.has(category)) { sql += " AND category=?"; args.push(category); }
      if (home) sql += " AND on_home=1";
      if (slider) sql += " AND in_slider=1";
      const rows = withPhotos(plain(q(sql + " ORDER BY sort, id DESC").all(...args))).filter((w) => w.photos.length);
      return rows.map((w) => ({ id: w.id, title: w.title, category: w.category, problem: w.problem, solution: w.solution, is_real: !!w.is_real, description: w.description || "", price_rub: w.price_rub, price_note: w.price_note || "", photos: w.photos }));
    },
    listAll: () => withPhotos(plain(q("SELECT * FROM works ORDER BY sort, id DESC").all())),
    getWork: (id) => withPhotos(plain(q("SELECT * FROM works WHERE id=?").all(id)))[0] || null,
    createWork(w) {
      const min = q("SELECT COALESCE(MIN(sort),0) AS m FROM works").get().m;
      const r = q("INSERT INTO works(title,category,problem,solution,is_real,published,on_home,in_slider,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(w.title, w.category, w.problem, w.solution, w.is_real, w.published, w.on_home, w.in_slider, min - 1, now(), now());
      return Number(r.lastInsertRowid);
    },
    updateWork(id, w) {
      return q("UPDATE works SET title=?,category=?,problem=?,solution=?,description=?,price_rub=?,price_note=?,is_real=?,published=?,on_home=?,in_slider=?,updated_at=? WHERE id=?")
        .run(w.title, w.category, w.problem, w.solution, w.description, w.price_rub, w.price_note, w.is_real, w.published, w.on_home, w.in_slider, now(), id).changes > 0;
    },
    deleteWork(id) { // возвращает файлы, которые нужно удалить с диска
      const files = q("SELECT file FROM photos WHERE work_id=?").all(id).map((r) => r.file);
      return q("DELETE FROM works WHERE id=?").run(id).changes ? files : null;
    },
    photoCount: (workId) => q("SELECT COUNT(*) AS n FROM photos WHERE work_id=?").get(workId).n,
    addPhoto(workId, { file, width, height, sha256 = null }) {
      const max = q("SELECT COALESCE(MAX(sort),0) AS m FROM photos WHERE work_id=?").get(workId).m;
      return Number(q("INSERT INTO photos(work_id,file,width,height,sort,sha256) VALUES(?,?,?,?,?,?)").run(workId, file, width, height, max + 1, sha256).lastInsertRowid);
    },
    deletePhoto(id) {
      const r = q("SELECT file FROM photos WHERE id=?").get(id);
      if (!r) return null;
      q("DELETE FROM photos WHERE id=?").run(id); return r.file;
    },
    reorderWorks(ids) { const st = q("UPDATE works SET sort=? WHERE id=?"); ids.forEach((id, i) => st.run(i, id)); },
    reorderPhotos(workId, ids) { const st = q("UPDATE photos SET sort=? WHERE id=? AND work_id=?"); ids.forEach((id, i) => st.run(i, id, workId)); },
    // админы и сессии
    adminCount: () => q("SELECT COUNT(*) AS n FROM admins").get().n,
    getAdminByEmail: (email) => q("SELECT * FROM admins WHERE email=?").get(String(email).toLowerCase()) || null,
    saveAdmin(email, hash) { q("INSERT INTO admins(email,pass_hash,created_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET pass_hash=excluded.pass_hash").run(String(email).toLowerCase(), hash, now()); },
    putSession: (id, adminId, csrf, expires) => q("INSERT INTO sessions(id,admin_id,csrf,expires) VALUES(?,?,?,?)").run(id, adminId, csrf, expires),
    getSession(id) {
      const s = q("SELECT s.id, s.csrf, s.expires, a.id AS admin_id, a.email FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.id=?").get(id);
      if (!s) return null;
      if (s.expires < Date.now()) { q("DELETE FROM sessions WHERE id=?").run(id); return null; }
      return { ...s };
    },
    delSession: (id) => q("DELETE FROM sessions WHERE id=?").run(id),
    purgeSessions: () => q("DELETE FROM sessions WHERE expires<?").run(Date.now()),
    deleteSessionsOf: (adminId) => q("DELETE FROM sessions WHERE admin_id=?").run(adminId),
  };
}
