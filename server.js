'use strict';
/* Taiba Tourism & Hospitality Diploma — full Node server for Render free tier.
 * Auth: bcryptjs hashes, opaque session tokens (6h) in SQLite.
 * DB: node:sqlite file (DB_PATH). On Render set DB_PATH=/var/data/taiba.db
 *      with a 1 GB persistent disk (see render.yaml).
 * Passwords: NEVER hard-coded. Staff passwords come from env vars
 * ADMIN_PASSWORD / ACADEMIC_PASSWORD / TRAINER_PASSWORD. If unset on first
 * boot, random ones are generated and printed ONCE in the startup log.
 * PDF note: the server PDF embeds Noto Sans Arabic (OFL, shipped flat beside
 * server.js as NotoSansArabic-Regular/Bold.ttf), so its Arabic is real,
 * searchable text — but pdfkit does NOT shape Arabic, so letters appear
 * unjoined. The Word (.doc) download and the in-browser print view shape
 * Arabic correctly — use those for the Arabic book. See README §7.
 * Book images: Word downloads are MHTML (multipart/related) with each image
 * embedded once (data: URIs do not render in Microsoft Word); PDF books
 * embed the cover + one image per unit, fetched with up to 3 retries, with
 * the caption shown if an image cannot be fetched. See README §7.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');
const multer = require('multer');
const XLSX = require('xlsx');
const seed = require('./seed');

const PORT = process.env.PORT || 3000;
let DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'taiba.db');
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
// /var/data needs the Render persistent disk attached; if it is not mounted
// (plain Web Service deploy without the disk) mkdir throws EACCES and the
// server crashes on boot. Fall back to a local ./data file instead so the
// site still starts — data then lives only until redeploy, see README §7.
function openDb(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return new DatabaseSync(p);
}
let db;
try {
  db = openDb(DB_PATH);
} catch (e) {
  console.warn(`[db] cannot open ${DB_PATH} (${e.code || e.message}); falling back to ./data/taiba.db — attach a disk at /var/data in Render for persistence`);
  DB_PATH = path.join(__dirname, 'data', 'taiba.db');
  db = openDb(DB_PATH);
}
db.exec(`PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL; -- WAL + NORMAL: fast seeding, still durable on Render disk
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, name TEXT, passwordHash TEXT NOT NULL, role TEXT NOT NULL, level INTEGER, createdAt TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, userId INTEGER, expiresAt INTEGER);
CREATE TABLE IF NOT EXISTS courses(code TEXT PRIMARY KEY, level INTEGER, titleAr TEXT, titleEn TEXT, descAr TEXT, descEn TEXT);
CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY AUTOINCREMENT, courseCode TEXT, idx INTEGER, titleAr TEXT, titleEn TEXT);
CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY AUTOINCREMENT, unitId INTEGER, idx INTEGER, titleAr TEXT, bodyAr TEXT, exampleAr TEXT, activityAr TEXT);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY AUTOINCREMENT, courseCode TEXT, type TEXT, question TEXT, options TEXT, correct INTEGER, explanation TEXT);
CREATE TABLE IF NOT EXISTS library_books(code TEXT PRIMARY KEY, titleAr TEXT, titleEn TEXT, descAr TEXT, kind TEXT);
CREATE TABLE IF NOT EXISTS news(id INTEGER PRIMARY KEY AUTOINCREMENT, titleAr TEXT, titleEn TEXT, bodyAr TEXT, createdAt TEXT);
CREATE TABLE IF NOT EXISTS training(id INTEGER PRIMARY KEY AUTOINCREMENT, titleAr TEXT, titleEn TEXT, hours INTEGER, descAr TEXT);
CREATE TABLE IF NOT EXISTS destinations(id INTEGER PRIMARY KEY AUTOINCREMENT, nameAr TEXT, nameEn TEXT, descAr TEXT, landmarks TEXT, season TEXT, activities TEXT, videoQuery TEXT);
CREATE TABLE IF NOT EXISTS stats(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT, unit TEXT, labelAr TEXT, labelEn TEXT);
CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY AUTOINCREMENT, titleAr TEXT, titleEn TEXT, query TEXT);
CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT, category TEXT, captionAr TEXT);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, message TEXT, createdAt TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
-- Uploaded book files: stored as BLOBs in the database (not on the disk),
-- so they survive exactly as long as the database file does — i.e. they
-- persist across redeploys only when the /var/data persistent disk is
-- attached; without the disk they are lost on redeploy like all other data.
CREATE TABLE IF NOT EXISTS uploaded_files(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, filename TEXT, mime TEXT, size INTEGER, data BLOB, uploadedBy TEXT, createdAt TEXT);`);

function seedIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) c FROM courses').get().c;
  if (n > 0) return;
  db.exec('BEGIN'); // one transaction: ~3,500 inserts commit in a single fsync
  const now = new Date().toISOString();
  const insCourse = db.prepare('INSERT INTO courses VALUES (?,?,?,?,?,?)');
  const insUnit = db.prepare('INSERT INTO units(courseCode,idx,titleAr,titleEn) VALUES (?,?,?,?)');
  const insLesson = db.prepare('INSERT INTO lessons(unitId,idx,titleAr,bodyAr,exampleAr,activityAr) VALUES (?,?,?,?,?,?)');
  const insQ = db.prepare('INSERT INTO questions(courseCode,type,question,options,correct,explanation) VALUES (?,?,?,?,?,?)');
  for (const c of seed.COURSES) {
    insCourse.run(c.code, c.level, c.titleAr, c.titleEn, c.descAr, c.descEn);
    c.units.forEach((u, ui) => {
      const unitId = insUnit.run(c.code, ui + 1, u, u).lastInsertRowid;
      seed.generateLessons(u).forEach((l, li) => insLesson.run(unitId, li + 1, l.titleAr, l.bodyAr, l.exampleAr, l.activityAr));
    });
    // Real question bank first: data/questions-full.json holds the 3,328
    // written questions exported from the live site (208 per course).
    // Falls back to the programmatic bank only if that file is absent.
    let bank = null;
    try { bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions-full.json'), 'utf8')); } catch (e) { bank = null; }
    if (!bank) { try { bank = require('./questions-full.js'); } catch (e) { bank = null; } }
    const realQs = Array.isArray(bank) ? bank.filter(q => q.courseCode === c.code && q.question && Array.isArray(q.options)) : [];
    if (realQs.length) { for (const q of realQs) insQ.run(q.courseCode, q.type || 'mcq', q.question, JSON.stringify(q.options), q.correct | 0, q.explanation || ''); }
    else { for (const q of seed.generateQuestions(c)) insQ.run(q.courseCode, q.type, q.question, JSON.stringify(q.options), q.correct, q.explanation); }
  }
  const insBook = db.prepare('INSERT INTO library_books VALUES (?,?,?,?,?)');
  for (const b of seed.BOOKING_BOOKS) insBook.run(b.code, b.titleAr, b.titleEn, b.descAr, 'booking');
  for (const c of seed.COURSES) insBook.run(c.code, 'كتاب ' + c.titleAr, c.titleEn + ' Textbook', c.descAr, 'course');
  const insNews = db.prepare('INSERT INTO news(titleAr,titleEn,bodyAr,createdAt) VALUES (?,?,?,?)');
  seed.NEWS_SEED.forEach(x => insNews.run(x.titleAr, x.titleEn, x.bodyAr, now));
  const insTr = db.prepare('INSERT INTO training(titleAr,titleEn,hours,descAr) VALUES (?,?,?,?)');
  seed.TRAINING_SEED.forEach(x => insTr.run(x.titleAr, x.titleEn, x.hours, x.descAr));
  const insD = db.prepare('INSERT INTO destinations(nameAr,nameEn,descAr,landmarks,season,activities,videoQuery) VALUES (?,?,?,?,?,?,?)');
  seed.DESTINATIONS.forEach(x => insD.run(x.nameAr, x.nameEn, x.descAr, x.landmarks, x.season, x.activities, x.video));
  const insS = db.prepare('INSERT INTO stats(value,unit,labelAr,labelEn) VALUES (?,?,?,?)');
  seed.STATS.forEach(x => insS.run(x.value, x.unit, x.labelAr, x.labelEn));
  const insV = db.prepare('INSERT INTO videos(titleAr,titleEn,query) VALUES (?,?,?)');
  seed.VIDEOS_SEED.forEach(x => insV.run(x.titleAr, x.titleEn, x.query));
  const insP = db.prepare('INSERT INTO photos(url,category,captionAr) VALUES (?,?,?)');
  const cats = ['وجهات المملكة', 'الفندقة', 'الطبيعة', 'التراث'];
  const pool = ['1507525428034-b723cf961d3e', '1512453979798-5ea266f8880c', '1503220317375-aaad61436b1b', '1544551763-46a013bb70d5', '1566073771259-6a8506099945', '1571003123894-1f0594d2b5d9', '1512632578888-169bbbc64f33', '1520250497591-112f2f40a3f4', '1551882547-ff40c63fe5fa', '1582719508461-905c673771fd'];
  // NOTE: pool IDs 1539650116574-75c0c6d73f6e and 1518684079-3c830d2e7c61 were
  // removed — both return HTTP 404 from Unsplash (verified 2026-11-24).
  // Replacements are Unsplash IDs already used in this project's Apps Script
  // file (verified HTTP 200): desert for Diriyah, nature for Asir.
  // First 8 photos are the real destination photos of the library: one per
  // destination (AlUla, Diriyah, Historic Jeddah, Red Sea, Asir, NEOM,
  // Al-Ahsa oasis, Makkah & Madinah / Kaaba). URLs reuse the existing
  // Unsplash pool IDs already in the codebase — no new URLs are invented;
  // the captions name the real destination each photo stands for, so books
  // and cards can pick the Al-Ahsa oasis and Makkah/Madinah photos by name.
  const destPhotos = [
    { n: 'العلا — مدائن صالح', id: pool[1] }, { n: 'الدرعية التاريخية', id: pool[6] },
    { n: 'جدة التاريخية — البلد', id: pool[3] }, { n: 'البحر الأحمر', id: pool[0] },
    { n: 'عسير — جبال السودة', id: pool[2] }, { n: 'نيوم', id: pool[7] },
    { n: 'واحة الأحساء — واحة النخيل', id: pool[4] }, { n: 'مكة المكرمة والمدينة المنورة — الكعبة المشرفة والمسجد النبوي', id: pool[5] },
  ];
  destPhotos.forEach(d => insP.run(`https://images.unsplash.com/photo-${d.id}?auto=format&fit=crop&w=900&q=60`, 'وجهات المملكة', 'صورة وجهة: ' + d.n));
  for (let i = 8; i < 119; i++) {
    const id = pool[i % pool.length];
    insP.run(`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=60`, cats[i % cats.length], 'صورة ' + (i + 1) + ' — ' + cats[i % cats.length]);
  }
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('contactEmail','gh.saleh@taibainstitute.com.sa')").run();
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('contactPhone','0545038454')").run();
  db.exec('COMMIT');
  const qCount = db.prepare('SELECT COUNT(*) c FROM questions').get().c;
  const bankSrc = (() => { try { if (JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions-full.json'), 'utf8')).length) return 'real bank (data/questions-full.json)'; } catch (e) {} try { if (require('./questions-full.js').length) return 'real bank (questions-full.js)'; } catch (e) {} return 'generated bank'; })();
  const contentSrc = seed.REAL_CONTENT_LOADED ? 'real content (168 lessons)' : 'generated content';
  console.log(`Seeded: 16 courses, ${qCount} questions [${bankSrc}], [${contentSrc}], 8 destinations, 119 photos, 10 videos.`);
}
seedIfEmpty();

// ---- staff accounts: passwords ONLY from env vars, else random + log once ----
function ensureStaff(username, name, role, envKey) {
  const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (existing) return;
  let pw = process.env[envKey];
  if (!pw) { pw = crypto.randomBytes(9).toString('base64url'); console.log(`[FIRST BOOT] ${role} account "${username}" password (save it, then set ${envKey} on Render): ${pw}`); }
  db.prepare('INSERT INTO users(username,name,passwordHash,role,level,createdAt) VALUES (?,?,?,?,?,?)')
    .run(username, name, bcrypt.hashSync(pw, 10), role, null, new Date().toISOString());
}
ensureStaff('admin', 'مسؤولة النظام', 'admin', 'ADMIN_PASSWORD');
ensureStaff('academic', 'المدير الأكاديمي', 'academic', 'ACADEMIC_PASSWORD');
ensureStaff('trainer', 'المدربة', 'trainer', 'TRAINER_PASSWORD');

const app = express();
process.on('unhandledRejection', (e) => console.error('Unhandled rejection (server kept running):', e && e.message));
app.use(express.json({ limit: '5mb' }));
// public/ must sit next to server.js. If the repo was uploaded with the
// taiba-tourism-render folder itself at the root (so files live at
// taiba-tourism-render/public/index.html instead of public/index.html),
// the plain __dirname path throws ENOENT stat '/app/public/index.html'.
// Resolve flexibly and log the directory actually used.
const PUBLIC_DIR = [
  path.join(__dirname, 'public'),
  path.join(__dirname, 'taiba-tourism-render', 'public'),
  path.join(process.cwd(), 'public'),
  path.join(process.cwd(), 'taiba-tourism-render', 'public'),
  // Flat upload: GitHub web upload does not take folders, so the user may
  // upload public/index.html, app.js, styles.css directly next to server.js.
  __dirname,
  process.cwd(),
].find((d) => fs.existsSync(path.join(d, 'index.html'))) || path.join(__dirname, 'public');
console.log(`[static] serving public dir: ${PUBLIC_DIR}`);
console.log(`[static] __dirname=${__dirname} cwd=${process.cwd()} files=${JSON.stringify(fs.readdirSync(__dirname))}`);
if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
  console.error(`[static] ERROR: index.html NOT FOUND in ${PUBLIC_DIR}. Upload the public/ folder next to server.js (or set Root Directory to taiba-tourism-render in Render).`);
}
app.use(express.static(PUBLIC_DIR));

function tokenFor(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 6 * 3600 * 1000;
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token, userId, expiresAt);
  return token;
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'login-required' });
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!s || s.expiresAt < Date.now()) return res.status(401).json({ error: 'session-expired' });
  const user = db.prepare('SELECT id,username,name,role,level FROM users WHERE id=?').get(s.userId);
  if (!user) return res.status(401).json({ error: 'login-required' });
  req.user = user; next();
}
function requireRole(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'forbidden' }); }
const STAFF = ['admin', 'academic', 'trainer'];

app.get('/api/health', (req, res) => res.json({ ok: true, courses: db.prepare('SELECT COUNT(*) c FROM courses').get().c, questions: db.prepare('SELECT COUNT(*) c FROM questions').get().c }));
app.get('/api/settings', (req, res) => res.json(Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]))));
app.get('/api/courses', (req, res) => res.json(db.prepare('SELECT * FROM courses ORDER BY level, code').all()));
app.get('/api/courses/:code', (req, res) => {
  const c = db.prepare('SELECT * FROM courses WHERE code=?').get(req.params.code);
  if (!c) return res.status(404).json({ error: 'not-found' });
  const units = db.prepare('SELECT * FROM units WHERE courseCode=? ORDER BY idx').all(c.code);
  for (const u of units) u.lessons = db.prepare('SELECT * FROM lessons WHERE unitId=? ORDER BY idx').all(u.id);
  c.units = units; c.questionCount = db.prepare('SELECT COUNT(*) c FROM questions WHERE courseCode=?').get(c.code).c;
  res.json(c);
});
app.get('/api/courses/:code/questions', auth, (req, res) => {
  // Cap 1000 (was 208): uploaded questions have higher ids than the seeded
  // 208, so a 208 cap cut them off entirely and they never reached a quiz.
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 1000);
  res.json(db.prepare('SELECT id,type,question,options,correct,explanation FROM questions WHERE courseCode=? ORDER BY id LIMIT ?').all(req.params.code, limit)
    .map(q => ({ ...q, options: JSON.parse(q.options) })));
});
app.get('/api/library', (req, res) => res.json(db.prepare('SELECT * FROM library_books').all()));
app.get('/api/news', (req, res) => res.json(db.prepare('SELECT * FROM news ORDER BY id DESC').all()));
app.get('/api/training', (req, res) => res.json(db.prepare('SELECT * FROM training').all()));
app.get('/api/destinations', (req, res) => res.json(db.prepare('SELECT * FROM destinations').all()));
app.get('/api/stats', (req, res) => res.json(db.prepare('SELECT * FROM stats').all()));
app.get('/api/videos', (req, res) => res.json(db.prepare('SELECT * FROM videos').all()));
app.get('/api/photos', (req, res) => res.json(db.prepare('SELECT * FROM photos').all()));
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !message) return res.status(400).json({ error: 'name-and-message-required' });
  db.prepare('INSERT INTO messages(name,email,message,createdAt) VALUES (?,?,?,?)').run(name, email || '', message, new Date().toISOString());
  res.json({ ok: true });
});

// ---- auth ----
app.post('/api/register', (req, res) => {
  const { username, password, name, level } = req.body || {};
  if (!username || !password || password.length < 6) return res.status(400).json({ error: 'username-and-password-min-6' });
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) return res.status(409).json({ error: 'username-taken' });
  const id = db.prepare('INSERT INTO users(username,name,passwordHash,role,level,createdAt) VALUES (?,?,?,?,?,?)')
    .run(username, name || username, bcrypt.hashSync(password, 10), 'trainee', parseInt(level, 10) || 1, new Date().toISOString()).lastInsertRowid;
  const user = db.prepare('SELECT id,username,name,role,level FROM users WHERE id=?').get(id);
  res.json({ ok: true, token: tokenFor(id), user });
});
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u || !bcrypt.compareSync(password || '', u.passwordHash)) return res.status(401).json({ error: 'invalid-credentials' });
  const user = { id: u.id, username: u.username, name: u.name, role: u.role, level: u.level };
  res.json({ ok: true, token: tokenFor(u.id), user });
});
app.get('/api/me', auth, (req, res) => res.json(req.user));
app.post('/api/change-password', auth, (req, res) => {
  const { current, next: nextPw } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current || '', u.passwordHash)) return res.status(400).json({ error: 'current-password-wrong' });
  if (!nextPw || nextPw.length < 6) return res.status(400).json({ error: 'new-password-min-6' });
  db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(bcrypt.hashSync(nextPw, 10), req.user.id);
  res.json({ ok: true });
});
// Staff (academic/trainer/admin) can reset OTHER accounts' passwords — never their own via this route.
app.post('/api/admin/reset-password', auth, requireRole(...STAFF), (req, res) => {
  const { username, next: nextPw } = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!target) return res.status(404).json({ error: 'user-not-found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'use-change-password-for-self' });
  if (target.role === 'admin' && req.user.role !== 'admin') return res.status(403).json({ error: 'cannot-reset-admin' });
  if (!nextPw || nextPw.length < 6) return res.status(400).json({ error: 'new-password-min-6' });
  db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(bcrypt.hashSync(nextPw, 10), target.id);
  res.json({ ok: true });
});
app.get('/api/admin/users', auth, requireRole(...STAFF), (req, res) => res.json(db.prepare('SELECT id,username,name,role,level,createdAt FROM users ORDER BY role,username').all()));
app.get('/api/admin/messages', auth, requireRole(...STAFF), (req, res) => res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC').all()));

// ---- admin CRUD (staff only) ----
app.post('/api/admin/questions/import', auth, requireRole(...STAFF), (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.questions) ? req.body.questions : []);
  if (!rows.length) return res.status(400).json({ error: 'no-questions' });
  const ins = db.prepare('INSERT INTO questions(courseCode,type,question,options,correct,explanation) VALUES (?,?,?,?,?,?)');
  let n = 0;
  for (const q of rows) { if (q.courseCode && q.question && Array.isArray(q.options)) { ins.run(q.courseCode, q.type || 'mcq', q.question, JSON.stringify(q.options), q.correct | 0, q.explanation || ''); n++; } }
  res.json({ ok: true, imported: n });
});
app.post('/api/admin/courses', auth, requireRole(...STAFF), (req, res) => {
  const { code, level, titleAr, titleEn, descAr, descEn } = req.body || {};
  if (!code || !titleAr) return res.status(400).json({ error: 'code-and-title-required' });
  db.prepare('INSERT OR REPLACE INTO courses VALUES (?,?,?,?,?,?)').run(code, level | 0, titleAr, titleEn || '', descAr || '', descEn || '');
  res.json({ ok: true });
});
app.post('/api/admin/news', auth, requireRole(...STAFF), (req, res) => {
  const { titleAr, titleEn, bodyAr } = req.body || {};
  db.prepare('INSERT INTO news(titleAr,titleEn,bodyAr,createdAt) VALUES (?,?,?,?)').run(titleAr || '', titleEn || '', bodyAr || '', new Date().toISOString());
  res.json({ ok: true });
});
app.post('/api/admin/library', auth, requireRole(...STAFF), (req, res) => {
  const { code, titleAr, titleEn, descAr, kind } = req.body || {};
  db.prepare('INSERT OR REPLACE INTO library_books VALUES (?,?,?,?,?)').run(code || ('BK-' + Date.now()), titleAr || '', titleEn || '', descAr || '', kind || 'course');
  res.json({ ok: true });
});
app.delete('/api/admin/news/:id', auth, requireRole(...STAFF), (req, res) => { db.prepare('DELETE FROM news WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---- admin file uploads (staff only) ----
// Files are stored in the SQLite database, not on disk: uploaded books as
// BLOBs in uploaded_files, question banks parsed straight into questions.
// They therefore live exactly as long as the database file — persistent
// across redeploys only with the /var/data disk attached, like all data.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some(c => c.trim() !== '')) rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => String(h).trim().toLowerCase());
  return rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i] ?? ''); return o; });
}
function normQuestions(rows, defaultCourse) {
  const out = [];
  const letterMap = { 'أ': 0, 'ب': 1, 'ج': 2, 'د': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
  for (const r of rows) {
    const q = String(r.question ?? r['السؤال'] ?? r.q ?? '').trim();
    if (!q) continue;
    let opts = r.options;
    if (typeof opts === 'string') opts = opts.split('|').map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(opts)) opts = [r.option1 ?? r['الخيار الأول'], r.option2 ?? r['الخيار الثاني'], r.option3 ?? r['الخيار الثالث'], r.option4 ?? r['الخيار الرابع']].filter(v => v !== undefined && v !== '').map(String);
    if (opts.length < 2) continue;
    let correct = r.correct ?? r['الإجابة الصحيحة'] ?? r.answer ?? 0;
    if (typeof correct === 'string') {
      const t = correct.trim();
      if (t in letterMap) correct = letterMap[t];
      else if (opts.includes(t)) correct = opts.indexOf(t);
      else { const n = parseInt(t, 10); correct = Number.isNaN(n) ? 0 : n - 1; }
    } else if (typeof correct === 'number') correct = correct >= 1 ? correct - 1 : 0;
    correct = Math.max(0, Math.min(opts.length - 1, correct | 0));
    const type = String(r.type ?? (opts.length === 2 && (opts[0] === 'صح' || opts[0] === 'خطأ') ? 'tf' : 'mcq')).toLowerCase();
    out.push({ courseCode: String((r.courseCode ?? r.code ?? defaultCourse ?? '')).trim(), type: type === 'tf' ? 'tf' : 'mcq', question: q, options: opts.map(String), correct, explanation: String(r.explanation ?? r['الشرح'] ?? '') });
  }
  return out.filter(x => x.courseCode);
}
function parseQuestionFile(buf, filename) {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.json')) { const j = JSON.parse(buf.toString('utf8')); return Array.isArray(j) ? j : (Array.isArray(j.questions) ? j.questions : []); }
  if (name.endsWith('.csv')) return parseCsv(buf.toString('utf8').replace(/^\uFEFF/, ''));
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }
  throw new Error('unsupported-file-type');
}
// Upload a book (PDF): stored in the DB and listed in the library at once.
app.post('/api/admin/upload-book', auth, requireRole(...STAFF), upload.single('file'), (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'no-file' });
    const titleAr = String(req.body.titleAr || '').trim();
    if (!titleAr) return res.status(400).json({ error: 'title-required' });
    if (!/\.pdf$/i.test(f.originalname) && f.mimetype !== 'application/pdf') return res.status(400).json({ error: 'pdf-only' });
    const code = String(req.body.code || ('UP-' + Date.now())).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '-');
    db.prepare('INSERT INTO uploaded_files(code,filename,mime,size,data,uploadedBy,createdAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET filename=excluded.filename,mime=excluded.mime,size=excluded.size,data=excluded.data,uploadedBy=excluded.uploadedBy,createdAt=excluded.createdAt')
      .run(code, f.originalname, 'application/pdf', f.size, f.buffer, req.user.username, new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO library_books VALUES (?,?,?,?,?)').run(code, titleAr, String(req.body.titleEn || ''), String(req.body.descAr || ''), 'uploaded');
    res.json({ ok: true, code, filename: f.originalname, size: f.size });
  } catch (e) { console.error('upload-book error:', e.message); res.status(500).json({ error: 'upload-failed' }); }
});
// Upload a question bank (Excel / CSV / JSON): parsed into the questions
// table, so the new questions appear immediately in the course quiz.
app.post('/api/admin/upload-questions', auth, requireRole(...STAFF), upload.single('file'), (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'no-file' });
    const courseCode = String(req.body.courseCode || '').trim();
    let rows;
    try { rows = parseQuestionFile(f.buffer, f.originalname); } catch (e) { return res.status(400).json({ error: 'parse-failed', detail: e.message }); }
    const qs = normQuestions(rows, courseCode);
    if (!qs.length) return res.status(400).json({ error: 'no-valid-questions' });
    const ins = db.prepare('INSERT INTO questions(courseCode,type,question,options,correct,explanation) VALUES (?,?,?,?,?,?)');
    for (const q of qs) ins.run(q.courseCode, q.type, q.question, JSON.stringify(q.options), q.correct, q.explanation);
    res.json({ ok: true, imported: qs.length, courseCode: qs[0].courseCode });
  } catch (e) { console.error('upload-questions error:', e.message); res.status(500).json({ error: 'upload-failed' }); }
});
app.get('/api/admin/uploads', auth, requireRole(...STAFF), (req, res) => {
  res.json(db.prepare('SELECT id,code,filename,mime,size,uploadedBy,createdAt FROM uploaded_files ORDER BY id DESC').all());
});

// ---- downloads: login required for ALL formats; Word/PPTX staff only ----
// Trainees: PDF only. Trainer / academic / admin: PDF + Word + PowerPoint.
function courseBook(code) {
  const c = db.prepare('SELECT * FROM courses WHERE code=?').get(code)
    || db.prepare('SELECT * FROM library_books WHERE code=?').get(code);
  if (!c) return null;
  const titleAr = c.titleAr, titleEn = c.titleEn || '';
  let units = [];
  if (c.level !== undefined && c.level !== null) {
    units = db.prepare('SELECT * FROM units WHERE courseCode=? ORDER BY idx').all(code);
    for (const u of units) u.lessons = db.prepare('SELECT * FROM lessons WHERE unitId=? ORDER BY idx').all(u.id);
  } else {
    units = [{ titleAr: c.descAr || c.titleAr, lessons: [{ titleAr: c.titleAr, bodyAr: c.descAr || '', exampleAr: '', activityAr: '' }] }];
  }
  return { code, titleAr, titleEn, descAr: c.descAr || '', units, level: c.level };
}
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---- book images: fetched once, retried up to 3 times, caption fallback ----
// Full-site fix ported here: Word books are MHTML (data: URIs do not render
// in Microsoft Word) and PDF books embed the images. Each image is fetched
// once even if used twice (cover + unit), and if a fetch fails after 3
// retries the image's caption is shown in its place instead of a silent blank.
async function fetchImage(url, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Taiba-Tourism/1.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) throw new Error('image too small');
      return buf;
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
  console.warn(`[book-img] failed ${url}: ${lastErr && lastErr.message}`);
  return null;
}
// Pick images for a book: cover = the destination photo named in the book's
// title/description when one matches (Al-Ahsa oasis / Makkah & Madinah Kaaba
// / AlUla / Diriyah / Jeddah / Red Sea / Asir / NEOM), otherwise the first
// library photo; then one photo per unit, all de-duplicated by URL.
function bookImages(book) {
  const all = db.prepare('SELECT * FROM photos ORDER BY id').all();
  if (!all.length) return [];
  const hay = (book.titleAr + ' ' + (book.descAr || '') + ' ' + book.units.map(u => u.titleAr).join(' '));
  const destNames = ['الأحساء', 'مكة', 'المدينة', 'العلا', 'الدرعية', 'جدة', 'البحر الأحمر', 'عسير', 'نيوم'];
  const cover = all.find(p => destNames.some(n => hay.includes(n) && p.captionAr.includes(n)))
    || all.find(p => p.category === 'وجهات المملكة') || all[0];
  const picked = [{ slot: 'cover', caption: cover.captionAr, url: cover.url, mime: 'image/jpeg' }];
  const rest = all.filter(p => p.url !== cover.url);
  book.units.forEach((u, i) => {
    const p = rest[(i * 2) % rest.length];
    picked.push({ slot: 'unit' + (i + 1), caption: u.titleAr, url: p.url, mime: 'image/jpeg' });
  });
  // De-duplicate by URL, keeping the first slot for each image.
  const seen = new Set(), out = [];
  for (const p of picked) { if (!seen.has(p.url)) { seen.add(p.url); out.push(p); } }
  return out;
}

// ---- institute / TVTC logos ----
// Files: public/taiba-logo.jpg + public/tvtc-logo.png (also accepted flat
// beside server.js, for GitHub web upload which cannot upload folders).
// Missing logos are a safe fallback: text names are drawn instead —
// the server never crashes for a missing logo file.
const LOGO_FILES = [
  { slot: 'logo-taiba', name: 'taiba-logo.jpg', mime: 'image/jpeg', label: 'شعار معهد طيبة العالي للتدريب' },
  { slot: 'logo-tvtc', name: 'tvtc-logo.png', mime: 'image/png', label: 'شعار المؤسسة العامة للتدريب التقني والمهني' },
];
function logoPaths(name) {
  return [path.join(__dirname, name), path.join(__dirname, 'public', name),
    path.join(process.cwd(), name), path.join(process.cwd(), 'public', name),
    path.join(__dirname, 'taiba-tourism-render', 'public', name)];
}
function loadLogos() {
  return LOGO_FILES.map(l => {
    const p = logoPaths(l.name).find(f => { try { return fs.existsSync(f); } catch (e) { return false; } });
    let buf = null;
    if (p) { try { buf = fs.readFileSync(p); } catch (e) { buf = null; } }
    return { ...l, buf };
  });
}

// ---- Arabic font for server PDFs ----
// pdfkit with its built-in Helvetica renders Arabic as Latin gibberish
// (WinAnsi, no Arabic glyphs). Embedding Noto Sans Arabic (OFL) makes the
// PDF's Arabic real, searchable text. pdfkit still does NOT shape Arabic
// (no joining), so letters appear unjoined — Word and the in-browser print
// view remain the correctly-shaped Arabic routes. Font files live flat
// beside server.js (NotoSansArabic-Regular.ttf / -Bold.ttf) so GitHub web
// upload works; fonts/ and public/fonts/ are also accepted. Missing fonts
// fall back silently to Helvetica — the server never crashes for this.
function fontPaths(name) {
  return [path.join(__dirname, name), path.join(__dirname, 'fonts', name),
    path.join(__dirname, 'public', 'fonts', name), path.join(process.cwd(), name),
    path.join(process.cwd(), 'fonts', name)];
}
function registerArabicFonts(doc) {
  try {
    const reg = fontPaths('NotoSansArabic-Regular.ttf').find(f => fs.existsSync(f));
    const bold = fontPaths('NotoSansArabic-Bold.ttf').find(f => fs.existsSync(f));
    if (!reg) return false;
    doc.registerFont('ar', reg);
    if (bold) doc.registerFont('ar-bold', bold);
    doc._arOk = true;
    return true;
  } catch (e) { console.warn('[pdf-font] Arabic font not registered:', e.message); return false; }
}
function arFont(doc, bold) {
  if (doc && doc._arOk) { try { doc.font(bold ? 'ar-bold' : 'ar'); } catch (e) { /* fall back to default font */ } }
  return doc;
}
async function loadBookImages(book) {
  const list = bookImages(book);
  const out = [];
  for (const item of list) {
    const buf = await fetchImage(item.url);
    out.push({ ...item, buf }); // buf null => render caption only
  }
  // Logos ride along as image parts (MHTML) / embedded images (PDF/PPTX).
  for (const lg of loadLogos()) out.push({ slot: lg.slot, caption: lg.label, url: '', mime: lg.mime, buf: lg.buf });
  return out;
}

// MHTML wrapper shared by book + bank Word downloads: HTML part + one part
// per image (each included once). data: URIs do not render in Word.
function mhtmlWrap(html, images) {
  const boundary = '----=_TaibaBook_' + crypto.randomBytes(8).toString('hex');
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  let m = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${boundary}"\r\n\r\n`;
  m += `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/book.html\r\n\r\n${b64(html)}\r\n`;
  for (const im of images) {
    if (!im.buf) continue;
    const ext = (im.mime === 'image/png') ? 'png' : 'jpg';
    m += `--${boundary}\r\nContent-Type: ${im.mime || 'image/jpeg'}\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/${im.slot}.${ext}\r\nContent-ID: <${im.slot}>\r\n\r\n${im.buf.toString('base64').replace(/(.{76})/g, '$1\r\n')}\r\n`;
  }
  m += `--${boundary}--\r\n`;
  return { mhtml: m, boundary };
}

// Second pass over buffered PDF pages: gold header (institute left /
// course centre / TVTC right), frame on every page, footer "صفحة X من Y".
function finishPdf(doc, code, titleAr) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.save().rect(40, 40, 515, 762).strokeColor('#0AA5C2').lineWidth(1).stroke().restore();
    if (i > 0) {
      arFont(doc, false).fontSize(8).fillColor('#555555');
      doc.text('معهد طيبة العالي للتدريب', 60, 48, { width: 140, align: 'left' });
      doc.text(titleAr, 205, 48, { width: 185, align: 'center' });
      doc.text('المؤسسة العامة للتدريب التقني والمهني', 395, 48, { width: 140, align: 'right' });
      doc.save().moveTo(60, 64).lineTo(535, 64).strokeColor('#FFD54F').lineWidth(2).stroke().restore();
      doc.fillColor('#000000');
    }
    arFont(doc, false).fontSize(9).fillColor('#555555').text(`صفحة ${i + 1} من ${pages.count}  |  ${code}`, 60, 782, { width: 475, align: 'center' }).fillColor('#000000');
  }
  doc.end();
}
// Draw one embedded image (or its caption fallback) at y; returns new y.
function drawImageOrCaption(doc, im, y) {
  const cap = im ? im.caption : '';
  if (im && im.buf) {
    try { doc.image(im.buf, 60, y, { fit: [475, 240], align: 'center' }); doc.y = y + 250; }
    catch (e) { doc.y = y; arFont(doc, false).fontSize(10).fillColor('#888888').text(`[صورة: ${cap} — تعذّر عرض الصورة]`, { align: 'center' }).fillColor('#000000'); }
  } else {
    doc.y = y; arFont(doc, false).fontSize(10).fillColor('#888888').text(`[صورة: ${cap} — تعذّر تحميل الصورة]`, { align: 'center' }).fillColor('#000000');
  }
  arFont(doc, false).fontSize(9).fillColor('#555555').text(cap, { align: 'center' }).fillColor('#000000');
  doc.moveDown(0.5);
}
function drawLogosPdf(doc, logos) {
  const taiba = logos.find(l => l.slot === 'logo-taiba');
  const tvtc = logos.find(l => l.slot === 'logo-tvtc');
  if (taiba && taiba.buf) { try { doc.image(taiba.buf, 60, 60, { fit: [90, 90] }); } catch (e) { /* text fallback below */ } }
  if (tvtc && tvtc.buf) { try { doc.image(tvtc.buf, 445, 60, { fit: [90, 90] }); } catch (e) { /* text fallback below */ } }
}
const AR_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];
function bankQuestions(code) {
  return db.prepare('SELECT * FROM questions WHERE courseCode=? ORDER BY id').all(code)
    .map(q => ({ ...q, options: JSON.parse(q.options) }));
}

async function handleDownload(req, res) {
  const { code } = req.params;
  let format = req.params.format;
  const isBank = format.startsWith('bank-');
  const sub = isBank ? format.slice(5) : format;
  if (!['pdf', 'doc', 'pptx'].includes(sub)) return res.status(400).json({ error: 'bad-format' });
  if ((sub === 'doc' || sub === 'pptx') && !STAFF.includes(req.user.role))
    return res.status(403).json({ error: 'word-pptx-staff-only' });

  // ---- question bank download (separate file per course) ----
  if (isBank) {
    const course = db.prepare('SELECT * FROM courses WHERE code=?').get(code);
    if (!course) return res.status(404).json({ error: 'bank-not-available' });
    const qs = bankQuestions(code);
    if (!qs.length) return res.status(404).json({ error: 'bank-empty' });
    const mcq = qs.filter(q => q.type !== 'tf');
    const tf = qs.filter(q => q.type === 'tf');
    const fileBase = `${code}-bank`;
    const logos = loadLogos();
    if (sub === 'pdf') {
      // PDF via pdfkit — structured bilingual document. Arabic shaping caveat: see header comment.
      const doc = new PDFDocument({ size: 'A4', margin: 60, bufferPages: true });
      registerArabicFonts(doc);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
      doc.pipe(res);
      drawLogosPdf(doc, logos);
      doc.moveDown(6);
      arFont(doc, true).fontSize(22).text('معهد طيبة العالي للتدريب', { align: 'center' });
      arFont(doc, true).fontSize(14).text('المؤسسة العامة للتدريب التقني والمهني', { align: 'center' });
      doc.moveDown();
      arFont(doc, true).fontSize(18).text(course.titleAr, { align: 'center' });
      arFont(doc, true).fontSize(16).text('بنك الأسئلة', { align: 'center' });
      doc.moveDown().fontSize(11).text(`عدد الأسئلة: ${qs.length} سؤالاً  |  اختيار من متعدد: ${mcq.length}  |  صح / خطأ: ${tf.length}`, { align: 'center' });
      doc.moveDown().fontSize(10).text('الإجابة الصحيحة والشرح مذكوران بعد كل سؤال.', { align: 'center' });
      let n = 0;
      const writeSection = (title, list) => {
        if (!list.length) return;
        doc.addPage();
        arFont(doc, true).fontSize(16).text(title, { align: 'left' });
        for (const q of list) {
          n++;
          doc.moveDown().fontSize(12).text(`سؤال ${n}: ${q.question}`);
          q.options.forEach((o, i) => arFont(doc, false).fontSize(10).text(`   ${AR_LETTERS[i] || (i + 1)} ) ${o}`));
          const correctText = q.options[q.correct] ?? '';
          arFont(doc, false).fontSize(10).text(`الإجابة الصحيحة: ${AR_LETTERS[q.correct] || ''} ) ${correctText}`);
          if (q.explanation) arFont(doc, false).fontSize(10).text(`الشرح: ${q.explanation}`);
        }
      };
      writeSection('القسم الأول: أسئلة الاختيار من متعدد', mcq);
      writeSection('القسم الثاني: أسئلة صح / خطأ', tf);
      finishPdf(doc, code, course.titleAr + ' — بنك الأسئلة');
      return;
    }
    if (sub === 'doc') {
      const logoRow = logos.map(l => l.buf ? `<img src="cid:${l.slot}" style="width:110px;height:110px;object-fit:contain">` : '').join(' ');
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
@page{size:A4;margin:2.5cm} body{font-family:'Sakkal Majalla',serif;font-size:15pt;text-align:justify;line-height:1.8;direction:rtl}
h1,h2,h3{font-family:'Sultan Medium','Sakkal Majalla',serif;text-align:center} .cover{text-align:center;padding-top:100px}
.q{page-break-inside:avoid;margin-bottom:14px} .ans{color:#006064;font-weight:bold}
</style></head><body><div class="cover"><p>${logoRow}</p><p>المؤسسة العامة للتدريب التقني والمهني</p><h1>معهد طيبة العالي للتدريب</h1><h2>${esc(course.titleAr)}</h2><h2>بنك الأسئلة</h2><p>عدد الأسئلة: ${qs.length} — اختيار من متعدد: ${mcq.length} — صح / خطأ: ${tf.length}</p></div>`;
      let m = 0;
      const writeSection = (title, list) => {
        if (!list.length) return;
        html += `<h2>${esc(title)}</h2>`;
        for (const q of list) {
          m++;
          html += `<div class="q"><p><b>سؤال ${m}:</b> ${esc(q.question)}</p>`;
          q.options.forEach((o, i) => { html += `<p>${AR_LETTERS[i] || (i + 1)}) ${esc(o)}</p>`; });
          html += `<p class="ans">الإجابة الصحيحة: ${AR_LETTERS[q.correct] || ''}) ${esc(q.options[q.correct] ?? '')}</p>`;
          if (q.explanation) html += `<p>الشرح: ${esc(q.explanation)}</p>`;
          html += `</div>`;
        }
      };
      writeSection('القسم الأول: أسئلة الاختيار من متعدد', mcq);
      writeSection('القسم الثاني: أسئلة صح / خطأ', tf);
      html += `</body></html>`;
      const { mhtml, boundary } = mhtmlWrap(html, logos.filter(l => l.buf));
      res.setHeader('Content-Type', `multipart/related; boundary="${boundary}"`);
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.doc"`);
      return res.send(mhtml);
    }
    // Bank PPTX: cover + 4 questions per slide.
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 }); pptx.layout = 'W';
    const cover = pptx.addSlide(); cover.background = { color: 'E0F7FA' };
    logos.forEach((l, i) => { if (l.buf) cover.addImage({ data: `data:${l.mime};base64,${l.buf.toString('base64')}`, x: i === 0 ? 0.6 : 11.6, y: 0.4, w: 1.1, h: 1.1 }); });
    cover.addText('معهد طيبة العالي للتدريب', { x: 1, y: 1.8, w: 11.3, fontSize: 30, bold: true, color: '006064', align: 'center' });
    cover.addText(course.titleAr + ' — بنك الأسئلة', { x: 1, y: 2.8, w: 11.3, fontSize: 26, color: '00838F', align: 'center' });
    cover.addText(`عدد الأسئلة: ${qs.length}`, { x: 1, y: 3.8, w: 11.3, fontSize: 16, color: '555555', align: 'center' });
    for (let s = 0; s < qs.length; s += 4) {
      const sl = pptx.addSlide(); sl.background = { color: 'FFFFFF' };
      sl.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.6, fill: { color: '00ACC1' } });
      sl.addText(`بنك أسئلة ${course.titleAr} — أسئلة ${s + 1} إلى ${Math.min(s + 4, qs.length)}`, { x: 0.3, y: 0.12, w: 12.7, fontSize: 12, color: 'FFFFFF', align: 'center' });
      let y = 0.85;
      for (const q of qs.slice(s, s + 4)) {
        const idx = qs.indexOf(q) + 1;
        sl.addText(`سؤال ${idx}: ${q.question}`, { x: 0.5, y, w: 12.3, fontSize: 13, bold: true, color: '222222' });
        y += 0.45;
        q.options.forEach((o, i) => { sl.addText(`${AR_LETTERS[i] || (i + 1)}) ${o}`, { x: 0.8, y, w: 12, fontSize: 11, color: '444444' }); y += 0.3; });
        sl.addText(`الإجابة الصحيحة: ${AR_LETTERS[q.correct] || ''}) ${q.options[q.correct] ?? ''}${q.explanation ? ' — ' + q.explanation : ''}`, { x: 0.8, y, w: 12, fontSize: 11, bold: true, color: '006064' });
        y += 0.55;
      }
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pptx"`);
    return pptx.write({ outputType: 'nodebuffer' }).then(buf => res.send(buf)).catch(e => { console.error('Bank PPTX error:', e.message); if (!res.headersSent) res.status(500).json({ error: 'pptx-failed' }); });
  }

  // ---- course / library book download ----
  const book = courseBook(code);
  if (!book) return res.status(404).json({ error: 'book-not-found' });
  // Uploaded books: the stored PDF file is served as-is (login-gated above,
  // trainees PDF only — the staff check below still applies to doc/pptx).
  if (sub === 'pdf') {
    const up = db.prepare('SELECT filename,data FROM uploaded_files WHERE code=?').get(code);
    if (up) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${String(up.filename).replace(/"/g, '')}"`);
      // node:sqlite returns BLOBs as Uint8Array; Express would JSON-encode
      // a bare Uint8Array, so convert to a Buffer for a byte-exact download.
      return res.send(Buffer.from(up.data));
    }
  } else if (db.prepare('SELECT 1 FROM uploaded_files WHERE code=?').get(code)) {
    return res.status(400).json({ error: 'uploaded-book-pdf-only' });
  }
  const fileBase = `${book.code}-${book.titleEn.replace(/[^A-Za-z0-9]+/g, '-') || 'book'}`;
  const logos = loadLogos();
  if (sub === 'doc') {
    // Word (MHTML): data: URIs do not render in Microsoft Word, so the book
    // is a multipart/related document — HTML part + one part per image,
    // each image included once even if referenced twice. Images fetched with
    // up to 3 retries; a failed image shows its caption instead of a blank.
    const images = await loadBookImages(book);
    const imgBySlot = Object.fromEntries(images.map(im => [im.slot, im]));
    const imgTag = (slot, alt) => {
      const im = imgBySlot[slot];
      if (!im) return '';
      if (im.buf) return `<p style="text-align:center"><img src="cid:${slot}" alt="${esc(alt)}" style="width:520px;max-width:100%"></p><p style="text-align:center;font-size:11pt;color:#555">${esc(im.caption)}</p>`;
      return `<p style="text-align:center;font-size:11pt;color:#555">[صورة: ${esc(im.caption)} — تعذّر تحميل الصورة]</p>`;
    };
    const logoRow = logos.map(l => l.buf ? `<img src="cid:${l.slot}" alt="${esc(l.label)}" style="width:110px;height:110px;object-fit:contain">` : '').join(' ');
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
@page{size:A4;margin:2.5cm 2.5cm 2.5cm 2.5cm} body{font-family:'Sakkal Majalla',serif;font-size:16pt;text-align:justify;line-height:1.8;direction:rtl}
h1,h2,h3{font-family:'Sultan Medium','Sakkal Majalla',serif;text-align:center} .cover{text-align:center;padding-top:100px}
.unit{page-break-before:always} .hdr{width:100%;border-bottom:3px solid gold} .hdr td{font-size:12pt} .frame{border:3px double #0aa5c2;padding:18px}
</style></head><body><div class="frame"><div class="cover"><p>${logoRow}</p><p>المؤسسة العامة للتدريب التقني والمهني</p><h1>معهد طيبة العالي للتدريب</h1><h2>دبلوم السياحة والفندقة</h2><h1>${esc(book.titleAr)}</h1><p>${esc(book.titleEn)}</p><p>المستوى ${book.level || ''} — ${esc(book.code)}</p>${imgTag('cover', book.titleAr)}<p>${esc(book.descAr)}</p></div>
<h2>فهرس المحتويات</h2><ol>`;
    book.units.forEach((u, i) => {
      html += `<li>الوحدة ${i + 1}: ${esc(u.titleAr)}<ol>`;
      for (const l of u.lessons) html += `<li>${esc(l.titleAr)}</li>`;
      html += `</ol></li>`;
    });
    html += `</ol>`;
    book.units.forEach((u, i) => {
      html += `<div class="unit"><table class="hdr"><tr><td>معهد طيبة العالي للتدريب</td><td style="text-align:center">${esc(book.titleAr)}</td><td style="text-align:left">المؤسسة العامة للتدريب التقني والمهني</td></tr></table><h2>الوحدة ${i + 1}: ${esc(u.titleAr)}</h2>${imgTag('unit' + (i + 1), u.titleAr)}`;
      for (const l of u.lessons) { html += `<h3>${esc(l.titleAr)}</h3><p>${esc(l.bodyAr)}</p>${l.exampleAr ? `<p><b>مثال تطبيقي:</b> ${esc(l.exampleAr)}</p>` : ''}${l.activityAr ? `<p><b>نشاط:</b> ${esc(l.activityAr)}</p>` : ''}`; }
      html += `</div>`;
    });
    html += `<p style="text-align:center">نهاية الكتاب — بنك الأسئلة تنزيل منفصل من الموقع.</p></div></body></html>`;
    const { mhtml, boundary } = mhtmlWrap(html, images);
    res.setHeader('Content-Type', `multipart/related; boundary="${boundary}"`);
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.doc"`);
    return res.send(mhtml);
  }
  if (sub === 'pptx') {
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 }); pptx.layout = 'W';
    const logoData = (slot) => { const l = logos.find(x => x.slot === slot); return l && l.buf ? `data:${l.mime};base64,${l.buf.toString('base64')}` : null; };
    const cover = pptx.addSlide(); cover.background = { color: 'E0F7FA' };
    const taibaData = logoData('logo-taiba'), tvtcData = logoData('logo-tvtc');
    if (taibaData) cover.addImage({ data: taibaData, x: 0.6, y: 0.4, w: 1.1, h: 1.1 });
    if (tvtcData) cover.addImage({ data: tvtcData, x: 11.6, y: 0.4, w: 1.3, h: 1.1 });
    cover.addShape(pptx.ShapeType.ellipse, { x: 5.6, y: 0.4, w: 2.1, h: 2.1, fill: { color: 'FFD54F' } });
    cover.addText('معهد طيبة العالي للتدريب', { x: 1, y: 2.6, w: 11.3, fontSize: 32, bold: true, color: '006064', align: 'center' });
    cover.addText(book.titleAr, { x: 1, y: 3.4, w: 11.3, fontSize: 28, color: '00838F', align: 'center' });
    cover.addText('المؤسسة العامة للتدريب التقني والمهني  •  دبلوم السياحة والفندقة', { x: 1, y: 4.4, w: 11.3, fontSize: 16, color: '555555', align: 'center' });
    // Table of contents slide.
    const toc = pptx.addSlide(); toc.background = { color: 'FFFFFF' };
    toc.addText('فهرس المحتويات', { x: 0.5, y: 0.4, w: 12.3, fontSize: 26, bold: true, color: '006064', align: 'center' });
    let tocY = 1.2;
    book.units.forEach((u, i) => {
      toc.addText(`الوحدة ${i + 1}: ${u.titleAr}`, { x: 0.7, y: tocY, w: 12, fontSize: 15, bold: true, color: '333333' });
      tocY += 0.45;
      for (const l of u.lessons) { toc.addText(`• ${l.titleAr}`, { x: 1.1, y: tocY, w: 11.6, fontSize: 12, color: '666666' }); tocY += 0.32; }
      tocY += 0.15;
    });
    // One title slide per unit, then one slide per lesson (all lessons,
    // with body + example + activity — not just the first 3).
    book.units.forEach((u, i) => {
      const s = pptx.addSlide(); s.background = { color: 'FFFFFF' };
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: '00ACC1' } });
      s.addText('معهد طيبة  •  ' + book.titleAr + '  •  المؤسسة العامة للتدريب التقني والمهني', { x: 0.3, y: 0.15, w: 12.7, fontSize: 12, color: 'FFFFFF', align: 'center' });
      s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.1, w: 12.33, h: 1.0, fill: { color: 'FFF8E1' }, line: { color: 'FFD54F', width: 2 } });
      s.addText(`الوحدة ${i + 1}: ${u.titleAr}`, { x: 0.7, y: 1.3, w: 11.9, fontSize: 24, bold: true, color: '006064', align: 'center' });
      let y = 2.5;
      for (const l of u.lessons) { s.addText('• ' + l.titleAr, { x: 0.7, y, w: 11.9, fontSize: 15, color: '333333' }); y += 0.45; }
      for (const l of u.lessons) {
        const ls = pptx.addSlide(); ls.background = { color: 'FFFFFF' };
        ls.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: '00ACC1' } });
        ls.addText(`الوحدة ${i + 1}: ${u.titleAr}`, { x: 0.3, y: 0.15, w: 12.7, fontSize: 12, color: 'FFFFFF', align: 'center' });
        ls.addText(l.titleAr, { x: 0.6, y: 0.95, w: 12.1, fontSize: 22, bold: true, color: '006064' });
        let ly = 1.7;
        ls.addText(l.bodyAr || '', { x: 0.6, y: ly, w: 12.1, h: 2.6, fontSize: 13, color: '333333', valign: 'top' });
        ly = 4.4;
        if (l.exampleAr) { ls.addText('مثال تطبيقي: ' + l.exampleAr, { x: 0.6, y: ly, w: 12.1, h: 1.0, fontSize: 12, color: '006064' }); ly += 1.1; }
        if (l.activityAr) ls.addText('نشاط: ' + l.activityAr, { x: 0.6, y: ly, w: 12.1, h: 1.0, fontSize: 12, bold: true, color: 'BF6A00' });
      }
    });
    const end = pptx.addSlide(); end.background = { color: 'E0F7FA' };
    end.addText('نهاية الكتاب', { x: 1, y: 3.0, w: 11.3, fontSize: 30, bold: true, color: '006064', align: 'center' });
    end.addText('بنك الأسئلة تنزيل منفصل من الموقع — ' + book.titleAr, { x: 1, y: 3.9, w: 11.3, fontSize: 16, color: '555555', align: 'center' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pptx"`);
    return pptx.write({ outputType: 'nodebuffer' }).then(buf => res.send(buf)).catch(e => { console.error('PPTX error:', e.message); if (!res.headersSent) res.status(500).json({ error: 'pptx-failed' }); });
  }
  // PDF via pdfkit — structured bilingual document. Arabic shaping caveat: see header comment.
  // Cover page (logos + institute + TVTC + course), table of contents on
  // page 2 (unit start pages recorded during generation, then filled in),
  // each unit starting on a new page, all lessons with body + example +
  // activity, images with captions, and a header/footer/frame pass at the end.
  const images = await loadBookImages(book);
  const imgBySlot = Object.fromEntries(images.map(im => [im.slot, im]));
  const doc = new PDFDocument({ size: 'A4', margin: 60, bufferPages: true });
      registerArabicFonts(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
  doc.pipe(res);
  // Cover.
  drawLogosPdf(doc, logos);
  doc.moveDown(6);
  arFont(doc, true).fontSize(22).text('معهد طيبة العالي للتدريب', { align: 'center' });
  arFont(doc, true).fontSize(14).text('المؤسسة العامة للتدريب التقني والمهني', { align: 'center' });
  doc.moveDown();
  arFont(doc, true).fontSize(20).text('دبلوم السياحة والفندقة', { align: 'center' });
  doc.moveDown();
  arFont(doc, true).fontSize(18).text(book.titleAr, { align: 'center' });
  arFont(doc, false).fontSize(13).text(book.titleEn, { align: 'center' });
  doc.moveDown().fontSize(11).text(`المستوى ${book.level || ''}  |  ${book.code}`, { align: 'center' });
  doc.moveDown();
  drawImageOrCaption(doc, imgBySlot['cover'], doc.y);
  doc.moveDown().fontSize(11).text(book.descAr || '', { align: 'left' });
  // Table of contents page (filled in after units are generated).
  doc.addPage();
  const tocPageIdx = doc.bufferedPageRange().count - 1;
  const unitPages = [];
  book.units.forEach((u, i) => {
    doc.addPage();
    unitPages.push(doc.bufferedPageRange().count); // 1-based page number
    arFont(doc, true).fontSize(16).text(`الوحدة ${i + 1}: ${u.titleAr}`, { align: 'left' });
    doc.moveDown();
    drawImageOrCaption(doc, imgBySlot['unit' + (i + 1)], doc.y);
    for (const l of u.lessons) {
      doc.moveDown().fontSize(12).text(l.titleAr);
      arFont(doc, false).fontSize(10).text(l.bodyAr || '');
      if (l.exampleAr) arFont(doc, false).fontSize(10).text('مثال تطبيقي: ' + l.exampleAr);
      if (l.activityAr) arFont(doc, false).fontSize(10).text('نشاط: ' + l.activityAr);
    }
  });
  // Fill the TOC page now that unit start pages are known.
  doc.switchToPage(tocPageIdx);
  arFont(doc, true).fontSize(18).text('فهرس المحتويات', { align: 'center' });
  doc.moveDown();
  book.units.forEach((u, i) => {
    arFont(doc, false).fontSize(13).text(`الوحدة ${i + 1}: ${u.titleAr}  .....  صفحة ${unitPages[i]}`, { align: 'right' });
    for (const l of u.lessons) arFont(doc, false).fontSize(10).text(`• ${l.titleAr}`, { align: 'right', indent: 20 });
    doc.moveDown(0.5);
  });
  finishPdf(doc, book.code, book.titleAr);
}

app.get('/api/download/:code/:format', auth, handleDownload);
app.get('/api/download/:code/bank/:format', auth, (req, res) => { req.params.format = 'bank-' + req.params.format; return handleDownload(req, res); });

// Printable HTML book view (correct Arabic shaping in the browser; print to PDF from here).
app.get('/book/:code/print', (req, res) => {
  const book = courseBook(req.params.code);
  if (!book) return res.status(404).send('Book not found');
  let h = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(book.titleAr)}</title><style>@page{size:A4;margin:2.5cm}body{font-family:'Sakkal Majalla',serif;text-align:justify;line-height:1.8}.unit{page-break-before:always}table{width:100%;border-bottom:3px solid gold}.logos{display:flex;justify-content:space-between;align-items:center}.logos img{height:80px}</style></head><body><div class="logos"><img src="/taiba-logo.jpg" alt="شعار معهد طيبة"><img src="/tvtc-logo.png" alt="شعار المؤسسة العامة للتدريب التقني والمهني"></div><h1 style="text-align:center">معهد طيبة العالي للتدريب</h1><h2 style="text-align:center">${esc(book.titleAr)}</h2>`;
  book.units.forEach((u, i) => { h += `<div class="unit"><table><tr><td>معهد طيبة</td><td style="text-align:center">${esc(book.titleAr)}</td><td style="text-align:left">المؤسسة العامة للتدريب التقني والمهني</td></tr></table><h2>الوحدة ${i + 1}: ${esc(u.titleAr)}</h2>`; for (const l of u.lessons) h += `<h3>${esc(l.titleAr)}</h3><p>${esc(l.bodyAr)}</p>${l.exampleAr ? `<p><b>مثال تطبيقي:</b> ${esc(l.exampleAr)}</p>` : ''}${l.activityAr ? `<p><b>نشاط:</b> ${esc(l.activityAr)}</p>` : ''}`; h += `</div>`; });
  res.send(h + `<script>window.print()</script></body></html>`);
});

app.get('*', (req, res) => {
  const f = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(f)) return res.status(500).send(`<h1>index.html not found</h1><p>Server dir: ${__dirname}</p><p>Working dir: ${process.cwd()}</p><p>Files here: ${fs.readdirSync(__dirname).join(', ')}</p><p>Upload the public/ folder next to server.js, or set Root Directory to taiba-tourism-render in Render.</p>`);
  res.sendFile(f);
});
app.listen(PORT, () => console.log(`Taiba Tourism Diploma running on port ${PORT} — DB: ${DB_PATH}`));
