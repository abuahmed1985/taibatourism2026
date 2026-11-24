'use strict';
/* Taiba Tourism Diploma — Render UI (bright, shiny, light colours only). */
let lang = 'ar', me = null, token = localStorage.getItem('taibaToken') || '';
let allCourses = [], allPhotos = [];
const TABS = [
  ['home','الرئيسية','Home'],['courses','المقررات','Courses'],['library','المكتبة','Library'],
  ['news','الأخبار','News'],['training','الدورات التدريبية','Training'],['places','الأرقام والأماكن','Places'],
  ['vision','رؤية 2030','Vision 2030'],['media','المكتبة المرئية','Media'],['contact','تواصل معنا','Contact'],
  ['login','دخول المتدربات','Login']
];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const isStaff = () => me && ['admin','academic','trainer'].includes(me.role);
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500); }
function headers(){ return token ? {'Content-Type':'application/json',Authorization:'Bearer '+token} : {'Content-Type':'application/json'}; }
async function api(p, opts={}){ const r = await fetch(p, {...opts, headers:headers()}); if(!r.ok){ const e = await r.json().catch(()=>({})); throw new Error(e.error || ('HTTP '+r.status)); } return r.json(); }

/* ---------- tabs & language ---------- */
function renderTabs(){ $('tabs').innerHTML = TABS.map(t=>`<button data-v="${t[0]}" onclick="show('${t[0]}')">${lang==='ar'?t[1]:t[2]}</button>`).join(''); }
function show(v){
  document.querySelectorAll('.view').forEach(s=>s.classList.add('hidden'));
  const el = $('view-'+v); if(el) el.classList.remove('hidden');
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active', b.dataset.v===v));
  if(v==='courses') loadCourses();
  if(v==='library') loadLibrary();
  if(v==='news') loadNews();
  if(v==='training') loadTraining();
  if(v==='places') loadPlaces();
  if(v==='vision') loadVision();
  if(v==='media') loadMedia();
  window.scrollTo(0,0);
}
function showCoursesLevel(lv){ $('levelFilter').value = String(lv); show('courses'); }
function toggleLang(){
  lang = lang==='ar' ? 'en' : 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang==='ar' ? 'rtl' : 'ltr';
  $('langBtn').textContent = lang==='ar' ? 'English' : 'العربية';
  renderTabs(); show('home'); loadHome();
}

/* ---------- downloads (login-gated) ---------- */
function dlBtns(code){
  if(!me) return `<button class="btn" onclick="show('login')">🔒 تسجيل الدخول للتنزيل</button>`;
  let h = `<button class="btn" onclick="download('${esc(code)}','pdf')">📄 PDF</button>`;
  if(isStaff()){
    h += `<button class="btn gold" onclick="download('${esc(code)}','doc')">📝 Word</button>`;
    h += `<button class="btn gold" onclick="download('${esc(code)}','pptx')">📊 PowerPoint</button>`;
  } else {
    h += `<span class="muted">Word و PowerPoint للمدربة والأكاديمي والإدارة فقط</span>`;
  }
  return h;
}
async function download(code, fmt){
  try{
    const r = await fetch(`/api/download/${code}/${fmt}`, {headers:{Authorization:'Bearer '+token}});
    if(!r.ok){ const e = await r.json().catch(()=>({})); toast(e.error || ('خطأ '+r.status)); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = code + '.' + (fmt==='doc' ? 'doc' : fmt);
    a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
    toast('تم تنزيل الكتاب ✅');
  }catch(e){ toast(e.message); }
}

/* ---------- home ---------- */
async function loadHome(){
  try{
    const [s,d] = await Promise.all([api('/api/stats'), api('/api/destinations')]);
    $('stats').innerHTML = s.slice(0,6).map(x=>`<div class="card stat-card"><div class="stat-num">${esc(x.value)} ${esc(x.unit)}</div><div>${esc(lang==='ar'?x.labelAr:x.labelEn)}</div></div>`).join('');
    $('destHome').innerHTML = d.map(x=>`<div class="card dest-card"><h3>📍 ${esc(lang==='ar'?x.nameAr:x.nameEn)}</h3><p class="muted">${esc(x.descAr)}</p><p>🗓️ موسم الزيارة: ${esc(x.season)}</p><button class="btn small" onclick="show('places')">عرض التفاصيل والفيديو</button></div>`).join('');
  }catch(e){ $('stats').innerHTML = '<p class="muted">تعذر تحميل الأرقام — أعيدي تحميل الصفحة.</p>'; }
}

/* ---------- courses ---------- */
async function loadCourses(){
  try{
    if(!allCourses.length) allCourses = await api('/api/courses');
    const lv = $('levelFilter').value;
    const q = ($('courseSearch').value || '').trim();
    const list = allCourses.filter(c => (!lv || c.level == lv) && (!q || (c.titleAr||'').includes(q) || (c.code||'').toLowerCase().includes(q.toLowerCase())));
    $('courseList').innerHTML = list.length ? list.map(c=>`
      <div class="card course-card">
        <div><span class="level-chip l${c.level}">${c.level}</span> <span class="badge">${esc(c.code)}</span> <span class="badge lvl">المستوى ${c.level}</span></div>
        <h3>${esc(c.titleAr)}</h3><p class="muted">${esc(c.descAr)}</p>
        <div><button class="btn" onclick="openCourse('${esc(c.code)}')">📖 فتح المقرر</button></div>
        <div>${dlBtns(c.code)}</div>
      </div>`).join('') : '<p class="muted">لا توجد مقررات مطابقة.</p>';
  }catch(e){ $('courseList').innerHTML = '<p class="muted">تعذر تحميل المقررات.</p>'; }
}
async function openCourse(code){
  const d = $('courseDetail'); d.classList.remove('hidden');
  d.innerHTML = '<p class="muted">جارٍ تحميل المقرر…</p>';
  try{
    const c = await api('/api/courses/'+code);
    const totalLessons = c.units.reduce((n,u)=>n+(u.lessons?u.lessons.length:0),0);
    d.innerHTML = `
      <h2 class="section-title">📖 ${esc(c.titleAr)} <span class="badge">${esc(c.code)} — المستوى ${c.level}</span></h2>
      <p class="lead">${esc(c.descAr)}</p>
      <p><span class="badge lvl">5 وحدات</span> <span class="badge lvl">${totalLessons} درساً</span> <span class="badge">بنك الأسئلة: ${c.questionCount} سؤالاً</span></p>
      <div>${dlBtns(code)} <a class="btn gold" href="/book/${code}/print" target="_blank">🖨️ عرض للطباعة / PDF من المتصفح</a>
      <button class="btn pink" onclick="startQuiz('${esc(c.code)}')">🧠 ابدئي الاختبار التفاعلي (10 أسئلة)</button></div>
      <div id="quizBox"></div>
      <h3 style="margin-top:18px">وحدات المقرر ودروسه</h3>
      ${c.units.map((u,i)=>`<div class="unit"><h4>الوحدة ${i+1}: ${esc(u.titleAr)}</h4>
        ${(u.lessons||[]).map(l=>`<div class="lesson"><b>📘 ${esc(l.titleAr)}</b><p>${esc(l.bodyAr)}</p>
          ${l.exampleAr?`<p><i>💡 مثال:</i> ${esc(l.exampleAr)}</p>`:''}
          ${l.activityAr?`<p><i>✏️ نشاط:</i> ${esc(l.activityAr)}</p>`:''}</div>`).join('')}
      </div>`).join('')}`;
    d.scrollIntoView({behavior:'smooth'});
  }catch(e){ d.innerHTML = '<p class="muted">تعذر فتح المقرر.</p>'; }
}
let quizScore = 0, quizTotal = 0, quizAnswered = 0;
async function startQuiz(code){
  const box = $('quizBox'); box.innerHTML = '<p class="muted">جارٍ تحميل الأسئلة…</p>';
  quizScore = 0; quizAnswered = 0;
  try{
    // Fetch up to 500 questions and sample 10 at random, so questions
    // uploaded later from the admin panel (higher ids) can appear in the
    // quiz instead of always the first 10 seeded ones.
    const all = await api(`/api/courses/${code}/questions?limit=500`);
    const qs = all.slice().sort(() => Math.random() - 0.5).slice(0, 10);
    quizTotal = qs.length;
    box.innerHTML = `<h3>🧠 الاختبار التفاعلي — ${qs.length} أسئلة</h3>` + qs.map((q,i)=>`
      <div class="quiz-q" data-answered="0"><p><b>${i+1}.</b> ${esc(q.question)}</p>
      ${q.options.map((o,j)=>`<button class="opt" onclick="answerQuiz(this, ${j}, ${q.correct}, '${esc(q.explanation||'')}')">${esc(o)}</button>`).join('')}
      <div class="q-exp muted"></div></div>`).join('') + `<div id="quizScore"></div>`;
  }catch(e){ box.innerHTML = '<p class="muted">سجّلي الدخول أولاً لبدء الاختبار.</p>'; }
}
function answerQuiz(btn, chosen, correct, explanation){
  const card = btn.closest('.quiz-q');
  if(card.dataset.answered === '1') return;
  card.dataset.answered = '1'; quizAnswered++;
  const opts = card.querySelectorAll('.opt');
  opts.forEach((o,j)=>{ o.disabled = true; if(j===correct) o.classList.add('correct'); });
  if(chosen === correct){ quizScore++; } else { btn.classList.add('wrong'); }
  card.querySelector('.q-exp').textContent = '💡 ' + explanation;
  if(quizAnswered === quizTotal){
    const s = $('quizScore');
    if(s) s.innerHTML = `<div class="quiz-score">🎉 نتيجتك: ${quizScore} من ${quizTotal} — ${quizScore===quizTotal?'ممتازة! 🌟':quizScore>=quizTotal/2?'جيدة جداً، واصلي! 💪':'أعيدي قراءة الوحدات وحاولي مجدداً 📚'}</div>`;
  }
}

/* ---------- library ---------- */
async function loadLibrary(){
  try{
    const [books, dests] = await Promise.all([api('/api/library'), api('/api/destinations')]);
    const courseBooks = books.filter(b=>b.kind==='course');
    const bookingBooks = books.filter(b=>b.kind==='booking');
    const uploadedBooks = books.filter(b=>b.kind==='uploaded');
    $('libraryList').innerHTML = courseBooks.map(b=>`
      <div class="card course-card"><span class="badge">📕 كتاب مقرر</span><h3>${esc(b.titleAr)}</h3>
      <p class="muted">${esc(b.descAr)}</p><div>${dlBtns(b.code)}</div></div>`).join('');
    $('bookingList').innerHTML = bookingBooks.map(b=>`
      <div class="card course-card"><span class="badge">💻 نظام حجوزات</span><h3>${esc(b.titleAr)}</h3>
      <p class="muted">${esc(b.descAr)}</p><div>${dlBtns(b.code)}</div></div>`).join('');
    $('uploadedList').innerHTML = uploadedBooks.length ? uploadedBooks.map(b=>`
      <div class="card course-card"><span class="badge">📤 كتاب مرفوع</span><h3>${esc(b.titleAr)}</h3>
      <p class="muted">${esc(b.descAr)}</p><div>${dlBtns(b.code)}</div></div>`).join('') : '<p class="muted">لا توجد كتب مرفوعة بعد — ارفعي كتاباً من لوحة التحكم.</p>';
    $('destBooks').innerHTML = dests.map(x=>`
      <div class="card course-card"><span class="badge">🗺️ كتاب وجهة</span><h3>كتاب ${esc(x.nameAr)}</h3>
      <p class="muted">${esc(x.descAr)}</p>
      <p>📍 ${esc(x.landmarks)}</p>
      <div><button class="btn" onclick="show('places')">📖 قراءة التفاصيل والفيديو</button></div></div>`).join('');
  }catch(e){ $('libraryList').innerHTML = '<p class="muted">تعذر تحميل المكتبة.</p>'; }
}

/* ---------- news / training ---------- */
async function loadNews(){
  try{
    const n = await api('/api/news');
    $('newsList').innerHTML = n.map(x=>`<div class="news-item"><h3>${esc(x.titleAr)}</h3><p>${esc(x.bodyAr)}</p><p class="muted">${esc((x.createdAt||'').slice(0,10))}</p></div>`).join('') || '<p class="muted">لا توجد أخبار بعد.</p>';
  }catch(e){ $('newsList').innerHTML = '<p class="muted">تعذر تحميل الأخبار.</p>'; }
}
async function loadTraining(){
  try{
    const t = await api('/api/training');
    $('trainingList').innerHTML = t.map(x=>`<div class="card course-card"><span class="badge">⏱️ ${x.hours} ساعة</span><h3>${esc(x.titleAr)}</h3><p class="muted">${esc(x.descAr)}</p><button class="btn small" onclick="show('contact')">سجّلي اهتمامك</button></div>`).join('');
  }catch(e){ $('trainingList').innerHTML = '<p class="muted">تعذر تحميل الدورات.</p>'; }
}

/* ---------- places & vision ---------- */
async function loadPlaces(){
  try{
    const [d,s] = await Promise.all([api('/api/destinations'), api('/api/stats')]);
    $('placesStats').innerHTML = s.map(x=>`<div class="card stat-card"><div class="stat-num">${esc(x.value)} ${esc(x.unit)}</div><div>${esc(x.labelAr)}</div></div>`).join('');
    $('placesList').innerHTML = d.map(x=>`
      <div class="card dest-card"><h3>📍 ${esc(x.nameAr)}</h3><p>${esc(x.descAr)}</p>
      <p><b>المعالم:</b> ${esc(x.landmarks)}</p>
      <p><b>🗓️ موسم الزيارة:</b> ${esc(x.season)}</p>
      <p><b>🎯 الأنشطة:</b> ${esc(x.activities)}</p>
      <a class="video-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(x.videoQuery)}" target="_blank" rel="noopener">🎬 فيديو ${esc(x.nameAr)} على يوتيوب ↗</a></div>`).join('');
  }catch(e){ $('placesList').innerHTML = '<p class="muted">تعذر تحميل الوجهات.</p>'; }
}
async function loadVision(){
  try{
    const s = await api('/api/stats');
    $('visionStats').innerHTML = s.slice(0,6).map(x=>`<div class="card stat-card vision-target"><div class="stat-num">${esc(x.value)} ${esc(x.unit)}</div><div>${esc(x.labelAr)}</div></div>`).join('');
  }catch(e){ /* stats optional here */ }
}

/* ---------- media ---------- */
async function loadMedia(){
  try{
    const [p,v] = await Promise.all([api('/api/photos'), api('/api/videos')]);
    allPhotos = p;
    const cats = [...new Set(p.map(x=>x.category))];
    $('photoCat').innerHTML = '<option value="">كل الفئات</option>' + cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('photoCount').textContent = p.length + ' صورة';
    renderPhotos();
    $('videoList').innerHTML = v.map((x,i)=>`
      <div class="card video-card"><div class="video-thumb">🎬</div><h3>${esc(x.titleAr)}</h3>
      <p class="muted">فيديو ${i+1} من ${v.length}</p>
      <a class="btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(x.query)}" target="_blank" rel="noopener">▶️ مشاهدة على يوتيوب</a></div>`).join('');
  }catch(e){ $('photoGrid').innerHTML = '<p class="muted">تعذر تحميل المكتبة المرئية.</p>'; }
}
function renderPhotos(){
  const cat = $('photoCat') ? $('photoCat').value : '';
  const list = cat ? allPhotos.filter(p=>p.category===cat) : allPhotos;
  $('photoGrid').innerHTML = list.map(x=>`<figure><img loading="lazy" src="${esc(x.url)}" alt="${esc(x.captionAr)}" onerror="this.src='https://picsum.photos/seed/taiba${x.id}/900/600'"><figcaption>${esc(x.captionAr)}</figcaption></figure>`).join('');
  if($('photoCount')) $('photoCount').textContent = list.length + ' صورة';
}

/* ---------- contact ---------- */
async function sendMsg(){
  if(!$('mName').value.trim() || !$('mMsg').value.trim()){ $('mOk').textContent = 'اكتبي الاسم والرسالة أولاً.'; return; }
  try{
    await api('/api/contact',{method:'POST',body:JSON.stringify({name:$('mName').value,email:$('mEmail').value,message:$('mMsg').value})});
    $('mOk').textContent = '✅ تم إرسال رسالتك بنجاح — ستصل إلى إدارة المعهد.';
    $('mName').value = ''; $('mEmail').value = ''; $('mMsg').value = '';
  }catch(e){ $('mOk').textContent = 'تعذر الإرسال: ' + e.message; }
}

/* ---------- auth ---------- */
async function login(){
  try{
    const d = await api('/api/login',{method:'POST',body:JSON.stringify({username:$('uName').value,password:$('uPass').value})});
    token = d.token; localStorage.setItem('taibaToken',token); me = d.user; afterAuth(); toast('مرحباً ' + me.name + ' ✅');
  }catch(e){ $('authMsg').textContent = 'بيانات الدخول غير صحيحة — تحققي من اسم المستخدم وكلمة المرور.'; }
}
async function register(){
  if(($('uPass').value||'').length < 6){ $('authMsg').textContent = 'كلمة المرور 6 أحرف فأكثر.'; return; }
  try{
    const d = await api('/api/register',{method:'POST',body:JSON.stringify({username:$('uName').value,password:$('uPass').value,name:$('uFull').value,level:$('uLevel').value})});
    token = d.token; localStorage.setItem('taibaToken',token); me = d.user; afterAuth(); toast('تم إنشاء حسابك بنجاح 🎉');
  }catch(e){ $('authMsg').textContent = e.message==='username-taken' ? 'اسم المستخدم محجوز، اختاري اسماً آخر.' : e.message; }
}
function logout(){
  token = ''; me = null; localStorage.removeItem('taibaToken');
  $('myBox').classList.add('hidden'); $('authBox').classList.remove('hidden');
  $('adminPanel').classList.add('hidden'); $('adminBar').classList.remove('show');
  $('userBox').classList.add('hidden'); $('userBox').textContent = '';
  toast('تم تسجيل الخروج');
}
async function changePw(){
  try{
    await api('/api/change-password',{method:'POST',body:JSON.stringify({current:$('cpCur').value,next:$('cpNew').value})});
    $('cpMsg').textContent = '✅ تم تغيير كلمة المرور.'; $('cpCur').value = ''; $('cpNew').value = '';
  }catch(e){ $('cpMsg').textContent = 'تعذر التغيير: ' + e.message; }
}
function afterAuth(){
  $('authBox').classList.add('hidden'); $('myBox').classList.remove('hidden');
  const roleName = {admin:'الإدارة',academic:'المدير الأكاديمي',trainer:'المدربة',trainee:'متدربة'}[me.role] || me.role;
  $('myInfo').textContent = `مرحباً ${me.name} — الدور: ${roleName}${me.level ? ' — المستوى ' + me.level : ''}`;
  $('userBox').textContent = '👤 ' + me.name; $('userBox').classList.remove('hidden');
  if(isStaff()){
    $('adminPanel').classList.remove('hidden');
    $('adminBar').classList.add('show');
    $('adminBarText').textContent = `لوحة التحكم متاحة لك — سجّلتِ كـ ${roleName} (${me.username})`;
  } else {
    $('adminPanel').classList.add('hidden'); $('adminBar').classList.remove('show');
  }
  loadCourses();
}
function openAdmin(){ $('adminPanel').scrollIntoView({behavior:'smooth'}); adminTab('users'); }

/* ---------- admin panel ---------- */
function adminTab(name){
  ['users','msgs','news','course','import','upload'].forEach(n=>{
    const pane = $('admin-'+n), btn = $('at-'+n);
    if(pane) pane.classList.toggle('hidden', n!==name);
    if(btn) btn.classList.toggle('active', n===name);
  });
  if(name==='users') loadUsers();
  if(name==='msgs') loadMsgs();
  if(name==='upload'){ fillQCourseSelect(); loadUploads(); }
}
async function loadUsers(){
  try{
    const u = await api('/api/admin/users');
    $('adminOut').innerHTML = '<h3>👥 حسابات الدخول (' + u.length + ')</h3>' + u.map(x=>`
      <div class="user-row"><div class="who"><b>${esc(x.username)}</b> — ${esc(x.name)} <span class="badge">${esc(x.role)}</span>${x.level ? ' <span class="badge lvl">المستوى '+x.level+'</span>' : ''}</div>
      <input id="rp-${esc(x.username)}" type="password" placeholder="كلمة مرور جديدة">
      <button class="btn small" onclick="resetPw('${esc(x.username)}')">🔑 تعيين كلمة مرور جديدة</button></div>`).join('');
  }catch(e){ $('adminOut').textContent = 'تعذر تحميل الحسابات: ' + e.message; }
}
async function resetPw(un){
  const next = document.getElementById('rp-'+un).value;
  if(!next || next.length < 6){ alert('كلمة المرور الجديدة 6 أحرف فأكثر.'); return; }
  try{
    await api('/api/admin/reset-password',{method:'POST',body:JSON.stringify({username:un,next})});
    toast('تم تعيين كلمة المرور الجديدة لـ ' + un + ' ✅');
  }catch(e){ alert('تعذر التعيين: ' + e.message); }
}
async function loadMsgs(){
  try{
    const m = await api('/api/admin/messages');
    $('adminMsgs').innerHTML = m.length ? m.map(x=>`<div class="msg-row"><b>${esc(x.name)}</b> (${esc(x.email||'—')}) <span class="muted">${esc((x.createdAt||'').slice(0,10))}</span><p>${esc(x.message)}</p></div>`).join('') : '<p class="muted">لا توجد رسائل بعد.</p>';
  }catch(e){ $('adminMsgs').textContent = 'تعذر تحميل الرسائل: ' + e.message; }
}
async function addNews(){
  if(!$('nTitle').value.trim()){ $('newsMsg').textContent = 'اكتبي عنوان الخبر.'; return; }
  try{
    await api('/api/admin/news',{method:'POST',body:JSON.stringify({titleAr:$('nTitle').value,titleEn:'',bodyAr:$('nBody').value})});
    $('newsMsg').textContent = '✅ تمت إضافة الخبر.'; $('nTitle').value = ''; $('nBody').value = ''; loadNews();
  }catch(e){ $('newsMsg').textContent = 'تعذر الإضافة: ' + e.message; }
}
async function addCourse(){
  if(!$('cCode').value.trim() || !$('cTitle').value.trim()){ $('courseMsg').textContent = 'اكتبي رمز المقرر وعنوانه.'; return; }
  try{
    await api('/api/admin/courses',{method:'POST',body:JSON.stringify({code:$('cCode').value.trim(),level:parseInt($('cLevel').value,10),titleAr:$('cTitle').value,titleEn:'',descAr:$('cDesc').value,descEn:''})});
    $('courseMsg').textContent = '✅ تمت إضافة / تحديث المقرر.'; allCourses = []; loadCourses();
  }catch(e){ $('courseMsg').textContent = 'تعذر الإضافة: ' + e.message; }
}
async function importQ(){
  let rows;
  try{ rows = JSON.parse($('impJson').value); }catch(e){ $('impMsg').textContent = 'صيغة JSON غير صحيحة.'; return; }
  try{
    const d = await api('/api/admin/questions/import',{method:'POST',body:JSON.stringify({questions:rows})});
    $('impMsg').textContent = '✅ تم استيراد ' + d.imported + ' سؤالاً.';
  }catch(e){ $('impMsg').textContent = 'تعذر الاستيراد: ' + e.message; }
}

/* ---------- admin file uploads ---------- */
function fillQCourseSelect(){
  const sel = $('upQCourse');
  if(!sel) return;
  if(!allCourses.length) { loadCourses().then(fillQCourseSelect); return; }
  sel.innerHTML = allCourses.map(c=>`<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.titleAr)}</option>`).join('');
}
async function uploadBook(){
  const f = $('upBookFile').files[0];
  if(!$('upBookTitle').value.trim()){ $('upBookMsg').textContent = 'اكتبي عنوان الكتاب.'; return; }
  if(!f){ $('upBookMsg').textContent = 'اختاري ملف PDF أولاً.'; return; }
  const fd = new FormData();
  fd.append('titleAr', $('upBookTitle').value.trim());
  fd.append('code', $('upBookCode').value.trim());
  fd.append('descAr', $('upBookDesc').value.trim());
  fd.append('file', f);
  $('upBookMsg').textContent = 'جارٍ الرفع…';
  try{
    const r = await fetch('/api/admin/upload-book', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    $('upBookMsg').textContent = '✅ تم رفع الكتاب «' + d.filename + '» — ظهر الآن في المكتبة (قسم الكتب المرفوعة).';
    $('upBookTitle').value = ''; $('upBookCode').value = ''; $('upBookDesc').value = ''; $('upBookFile').value = '';
    loadLibrary(); loadUploads();
  }catch(e){ $('upBookMsg').textContent = 'تعذر الرفع: ' + e.message + (e.message==='pdf-only' ? ' — الملف يجب أن يكون PDF.' : ''); }
}
async function uploadQuestions(){
  const f = $('upQFile').files[0];
  if(!f){ $('upQMsg').textContent = 'اختاري ملف الأسئلة أولاً (Excel / CSV / JSON).'; return; }
  const fd = new FormData();
  fd.append('courseCode', $('upQCourse').value || '');
  fd.append('file', f);
  $('upQMsg').textContent = 'جارٍ الرفع والتحليل…';
  try{
    const r = await fetch('/api/admin/upload-questions', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    $('upQMsg').textContent = '✅ تم استيراد ' + d.imported + ' سؤالاً إلى المقرر ' + d.courseCode + ' — تظهر فوراً في اختبار المقرر.';
    $('upQFile').value = '';
  }catch(e){ $('upQMsg').textContent = 'تعذر الرفع: ' + e.message; }
}
async function loadUploads(){
  try{
    const u = await api('/api/admin/uploads');
    $('upList').innerHTML = u.length ? u.map(x=>`<div class="msg-row"><b>${esc(x.filename)}</b> — الرمز <span dir="ltr">${esc(x.code)}</span> — ${(x.size/1024).toFixed(0)} ك.ب — رفعها ${esc(x.uploadedBy||'—')} <span class="muted">${esc((x.createdAt||'').slice(0,10))}</span></div>`).join('') : '<p class="muted">لا توجد ملفات مرفوعة بعد.</p>';
  }catch(e){ $('upList').textContent = 'تعذر تحميل القائمة: ' + e.message; }
}

/* ---------- boot ---------- */
(async()=>{
  renderTabs(); show('home');
  try{
    const s = await api('/api/settings');
    if(s.contactEmail){ $('cEmail').textContent = s.contactEmail; $('fEmail').textContent = s.contactEmail; }
    if(s.contactPhone){ $('cPhone').textContent = s.contactPhone; }
  }catch(e){ /* defaults in HTML */ }
  if(token){ try{ me = await api('/api/me'); afterAuth(); }catch(e){ token = ''; localStorage.removeItem('taibaToken'); } }
  loadHome();
})();
