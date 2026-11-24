'use strict';
/* Taiba Tourism & Hospitality Diploma — full Node server for Render free tier.
 * Auth: bcryptjs hashes, opaque session tokens (6h) in SQLite.
 * DB: node:sqlite file (DB_PATH). On Render set DB_PATH=/var/data/taiba.db
 *      with a 1 GB persistent disk (see render.yaml).
 * Passwords: NEVER hard-coded. Staff passwords come from env vars
 * ADMIN_PASSWORD / ACADEMIC_PASSWORD / TRAINER_PASSWORD. If unset on first
 * boot, random ones are generated and printed ONCE in the startup log.
 * PDF note: pdfkit does not shape Arabic script, so the server PDF is a
 * structured bilingual document (Arabic headings may render unshaped in
 * some readers). The Word (.doc) download and the in-browser print view
 * shape Arabic correctly — use those for the Arabic book. See README §7.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');
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
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);`);

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
  const pool = ['1507525428034-b723cf961d3e', '1512453979798-5ea266f8880c', '1539650116574-75c0c6d73f6e', '1544551763-46a013bb70d5', '1566073771259-6a8506099945', '1571003123894-1f0594d2b5d9', '1518684079-3c830d2e7c61', '1520250497591-112f2f40a3f4', '1551882547-ff40c63fe5fa', '1582719508461-905c673771fd'];
  for (let i = 0; i < 119; i++) {
    const id = pool[i % pool.length];
    insP.run(`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=60`, cats[i % cats.length], 'صورة ' + (i + 1) + ' — ' + cats[i % cats.length]);
  }
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('contactEmail','gh.saleh@taibainstitute.com.sa')").run();
  db.prepare("INSERT OR REPLACE INTO settings VALUES ('contactPhone','0545038454')").run();
  db.exec('COMMIT');
  const qCount = db.prepare('SELECT COUNT(*) c FROM questions').get().c;
  const bankSrc = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions-full.json'), 'utf8')).length ? 'real bank (data/questions-full.json)' : 'generated bank'; } catch (e) { return 'generated bank'; } })();
  console.log(`Seeded: 16 courses, ${qCount} questions [${bankSrc}], 8 destinations, 119 photos, 10 videos.`);
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
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 208);
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
  return { code, titleAr, titleEn, descAr: c.descAr || '', units };
}
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

app.get('/api/download/:code/:format', auth, (req, res) => {
  const { code, format } = req.params;
  if (!['pdf', 'doc', 'pptx'].includes(format)) return res.status(400).json({ error: 'bad-format' });
  if ((format === 'doc' || format === 'pptx') && !STAFF.includes(req.user.role))
    return res.status(403).json({ error: 'word-pptx-staff-only' });
  const book = courseBook(code);
  if (!book) return res.status(404).json({ error: 'book-not-found' });
  const fileBase = `${book.code}-${book.titleEn.replace(/[^A-Za-z0-9]+/g, '-') || 'book'}`;
  if (format === 'doc') {
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
@page{size:A4;margin:2.5cm 2.5cm 2.5cm 2.5cm} body{font-family:'Sakkal Majalla',serif;font-size:16pt;text-align:justify;line-height:1.8;direction:rtl}
h1,h2,h3{font-family:'Sultan Medium','Sakkal Majalla',serif;text-align:center} .cover{text-align:center;padding-top:120px}
.unit{page-break-before:always} .hdr{width:100%;border-bottom:3px solid gold} .hdr td{font-size:12pt} .frame{border:3px double #0aa5c2;padding:18px}
</style></head><body><div class="frame"><div class="cover"><p>المؤسسة العامة للتدريب التقني والمهني</p><h1>معهد طيبة العالي للتدريب</h1><h2>دبلوم السياحة والفندقة</h2><h1>${esc(book.titleAr)}</h1><p>${esc(book.titleEn)}</p></div>`;
    book.units.forEach((u, i) => {
      html += `<div class="unit"><table class="hdr"><tr><td>معهد طيبة العالي للتدريب</td><td style="text-align:center">${esc(book.titleAr)}</td><td style="text-align:left">المؤسسة العامة للتدريب التقني والمهني</td></tr></table><h2>الوحدة ${i + 1}: ${esc(u.titleAr)}</h2>`;
      for (const l of u.lessons) { html += `<h3>${esc(l.titleAr)}</h3><p>${esc(l.bodyAr)}</p>${l.exampleAr ? `<p><b>مثال تطبيقي:</b> ${esc(l.exampleAr)}</p>` : ''}${l.activityAr ? `<p><b>نشاط:</b> ${esc(l.activityAr)}</p>` : ''}`; }
      html += `</div>`;
    });
    html += `<p style="text-align:center">نهاية الكتاب — بنك الأسئلة تنزيل منفصل من الموقع.</p></div></body></html>`;
    res.setHeader('Content-Type', 'application/msword; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.doc"`);
    return res.send(html);
  }
  if (format === 'pptx') {
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 }); pptx.layout = 'W';
    const cover = pptx.addSlide(); cover.background = { color: 'E0F7FA' };
    cover.addShape(pptx.ShapeType.ellipse, { x: 5.6, y: 0.4, w: 2.1, h: 2.1, fill: { color: 'FFD54F' } });
    cover.addText('معهد طيبة العالي للتدريب', { x: 1, y: 2.6, w: 11.3, fontSize: 32, bold: true, color: '006064', align: 'center' });
    cover.addText(book.titleAr, { x: 1, y: 3.4, w: 11.3, fontSize: 28, color: '00838F', align: 'center' });
    cover.addText('المؤسسة العامة للتدريب التقني والمهني  •  دبلوم السياحة والفندقة', { x: 1, y: 4.4, w: 11.3, fontSize: 16, color: '555555', align: 'center' });
    book.units.forEach((u, i) => {
      const s = pptx.addSlide(); s.background = { color: 'FFFFFF' };
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.7, fill: { color: '00ACC1' } });
      s.addText('معهد طيبة  •  ' + book.titleAr + '  •  المؤسسة العامة للتدريب التقني والمهني', { x: 0.3, y: 0.15, w: 12.7, fontSize: 12, color: 'FFFFFF', align: 'center' });
      s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.1, w: 12.33, h: 1.0, fill: { color: 'FFF8E1' }, line: { color: 'FFD54F', width: 2 } });
      s.addText(`الوحدة ${i + 1}: ${u.titleAr}`, { x: 0.7, y: 1.3, w: 11.9, fontSize: 24, bold: true, color: '006064', align: 'center' });
      let y = 2.5;
      for (const l of u.lessons.slice(0, 3)) { s.addText('• ' + l.titleAr, { x: 0.7, y, w: 11.9, fontSize: 16, color: '333333' }); s.addText(l.bodyAr, { x: 0.7, y: y + 0.35, w: 11.9, fontSize: 12, color: '666666' }); y += 1.3; }
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pptx"`);
    return pptx.write({ outputType: 'nodebuffer' }).then(buf => res.send(buf)).catch(e => { console.error('PPTX error:', e.message); if (!res.headersSent) res.status(500).json({ error: 'pptx-failed' }); });
  }
  // PDF via pdfkit — structured bilingual document. Arabic shaping caveat: see header comment.
  const doc = new PDFDocument({ size: 'A4', margin: 60, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
  doc.pipe(res);
  doc.fontSize(22).text('Taiba Institute — Tourism & Hospitality Diploma', { align: 'center' });
  doc.moveDown().fontSize(18).text(book.titleEn, { align: 'center' });
  doc.moveDown().fontSize(12).text(`Course: ${book.code}  |  Institute: Taiba Higher Training Institute  |  TVTC`, { align: 'center' });
  doc.moveDown().fontSize(11).text(book.descAr || '', { align: 'left' });
  book.units.forEach((u, i) => {
    doc.addPage();
    doc.fontSize(16).text(`Unit ${i + 1}: ${u.titleAr}`, { align: 'left' });
    for (const l of u.lessons) { doc.moveDown().fontSize(12).text(l.titleAr); doc.fontSize(10).text(l.bodyAr || ''); if (l.exampleAr) doc.fontSize(10).text('Example: ' + l.exampleAr); }
  });
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.fontSize(9).text(`Page ${i + 1} of ${pages.count}  |  ${book.code}`, 60, 780, { align: 'center' }); doc.rect(40, 40, 515, 762).stroke(); }
  doc.end();
});

// Printable HTML book view (correct Arabic shaping in the browser; print to PDF from here).
app.get('/book/:code/print', (req, res) => {
  const book = courseBook(req.params.code);
  if (!book) return res.status(404).send('Book not found');
  let h = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(book.titleAr)}</title><style>@page{size:A4;margin:2.5cm}body{font-family:'Sakkal Majalla',serif;text-align:justify;line-height:1.8}.unit{page-break-before:always}table{width:100%;border-bottom:3px solid gold}</style></head><body><h1 style="text-align:center">معهد طيبة العالي للتدريب</h1><h2 style="text-align:center">${esc(book.titleAr)}</h2>`;
  book.units.forEach((u, i) => { h += `<div class="unit"><table><tr><td>معهد طيبة</td><td style="text-align:center">${esc(book.titleAr)}</td><td style="text-align:left">المؤسسة العامة للتدريب التقني والمهني</td></tr></table><h2>الوحدة ${i + 1}: ${esc(u.titleAr)}</h2>`; for (const l of u.lessons) h += `<h3>${esc(l.titleAr)}</h3><p>${esc(l.bodyAr)}</p>`; h += `</div>`; });
  res.send(h + `<script>window.print()</script></body></html>`);
});

app.get('*', (req, res) => {
  const f = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(f)) return res.status(500).send(`<h1>index.html not found</h1><p>Server dir: ${__dirname}</p><p>Working dir: ${process.cwd()}</p><p>Files here: ${fs.readdirSync(__dirname).join(', ')}</p><p>Upload the public/ folder next to server.js, or set Root Directory to taiba-tourism-render in Render.</p>`);
  res.sendFile(f);
});
app.listen(PORT, () => console.log(`Taiba Tourism Diploma running on port ${PORT} — DB: ${DB_PATH}`));
