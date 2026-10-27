/* 소리 탐정단 띵동이 — 학생·교사 앱 (GitHub Pages 정적 페이지 + 구글 앱스스크립트 저장)
 * 측정 방식은 기존 앱과 같아요: 2048 샘플 RMS → dBFS+100 → 0~100점, 5초 동안 0.1초마다 → 점수 = (평균+최대)/2
 * 녹음 파일은 만들지도 저장하지도 않아요. 숫자만 구글 시트(소리탐정단_1학년_연구데이터)에 저장돼요. */
(function () {
'use strict';
var API = 'https://script.google.com/macros/s/AKfycbwYzMwlgqLpFfhfEP8IauTBAF3FRrvf9375xlDjOD6pAYIiVfsjl2z_1YJTniCwCXNOiQ/exec';

var LESSONS = {
  1: { t: '귀로 느끼고, 기계로 재요', g: '네 가지 소리를 귀로 예상하고 기계로 재 봐요!', e: '🔍' },
  2: { t: '소리는 떨림이에요', g: '가까이·멀리, 북 소리를 재고 떨림을 봐요!', e: '🥁' },
  3: { t: '우리 학교 소리 지도', g: '학교 여러 곳을 재서 소리 지도를 만들어요!', e: '🗺️' },
  4: { t: '목소리 단계', g: '조용할 때·시끄러울 때, 목소리 단계를 재요!', e: '🗣️' },
  5: { t: '초록불 지키기', g: '모둠 활동 소리를 재고 초록불을 지켜요!', e: '🚦' },
  6: { t: '소리 탐정 발표회', g: '우리 교실 소리를 재고 자랑해요!', e: '🎉' }
};
var LV = { 1: { n: '조용해요', f: '😌', c: 'l1', img: 'assets/ding_quiet.png' },
           2: { n: '보통이에요', f: '🙂', c: 'l2', img: 'assets/ding_wave.png' },
           3: { n: '시끄러워요', f: '😣', c: 'l3', img: 'assets/ding_loud.png' } };
var ICON = [ // 소리 이름에 들어 있는 낱말 → 그림
  ['속삭', 'whisper'], ['조용할', 'whisper'], ['말소리', 'talk'], ['목소리', 'talk'], ['노래', 'talk'], ['발표', 'talk'],
  ['박수', 'clap'], ['의자', 'chair'], ['북', 'drum'], ['발뒤꿈치', 'steps'], ['문', 'door'], ['교실', 'school'], ['급식', 'school'],
  ['복도', 'steps'], ['운동장', 'school'], ['도서관', 'school'], ['교무실', 'door'], ['모둠', 'talk'], ['시끄러울', 'clap'], ['다른', 'ear']
];
var CLS_COLORS = ['#ff7a8a', '#ffad42', '#ffd23f', '#2fd6a6', '#4fb3ff', '#9b8cff', '#ff6fb1', '#40c4c4'];

var S = { data: null, cls: '', num: '', lesson: 1, step: 1, sound: '', place: '', predict: 0, result: null, tcode: '', t: null, screen: '' };
var A = { ctx: null, an: null, buf: null, stream: null, raf: 0, on: false, smooth: 0 };
var T = { on: false, iv: 0, n: 0, sum: 0, green: 0, t0: 0, cls: '', act: '', cover: false, lock: null };
var ICONS_READY = true;

/* ---------------- 작은 도구 ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function store(k, v) { try { if (v === undefined) { var x = localStorage.getItem(k); return x ? JSON.parse(x) : null; } localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
var toastT = 0;
function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600); }
function levelOf(v) { var g = (S.data && S.data.green) || 50, y = (S.data && S.data.yellow) || 65; return v < g ? 1 : (v < y ? 2 : 3); }
function iconFor(s) { if (!ICONS_READY) return ''; for (var i = 0; i < ICON.length; i++) if (String(s).indexOf(ICON[i][0]) >= 0) return 'assets/icon_' + ICON[i][1] + '.png'; return ''; }
function emojiOf(s) { var m = String(s).match(/^\S+/); return m ? m[0] : '🔔'; }
function nameOf(s) { return String(s).replace(/^\S+\s*/, ''); }
function confetti(n) {
  var cols = ['#ff5fa2', '#ffcf3f', '#2fd6a6', '#4fb3ff', '#9b8cff', '#ff9f43'];
  for (var i = 0; i < (n || 46); i++) {
    var c = document.createElement('i'); c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
    c.style.animationDelay = Math.random() * .5 + 's'; c.style.animationDuration = 1.4 + Math.random() * 1.2 + 's';
    document.body.appendChild(c); setTimeout(function (x) { x.remove(); }.bind(null, c), 3200);
  }
}
function ding(freq, dur) { // 짧은 효과음(측정 전후에만)
  try { var ac = A.ctx || new (window.AudioContext || window.webkitAudioContext)(); var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq || 880; g.gain.value = .0001; o.connect(g); g.connect(ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.18, ac.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + (dur || .35)); o.stop(ac.currentTime + (dur || .35) + .05);
  } catch (e) {}
}

/* ---------------- 서버(구글 시트) ---------------- */
function call(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  return fetch(API, { method: 'POST', body: JSON.stringify({ fn: fn, args: args }), redirect: 'follow' })
    .then(function (r) { return r.json(); })
    .then(function (j) { if (!j.ok) throw new Error(j.error || '서버 오류'); return j.result; });
}
// 저장 실패 대비 보관함: 인터넷이 끊겨도 기록이 사라지지 않게 크롬북에 모아 두었다가 다시 보내요.
function outbox() { return store('sd_outbox') || []; }
function sendMeasure(p) {
  return call('saveMeasure', p).catch(function () { var o = outbox(); o.push(p); store('sd_outbox', o); toast('인터넷이 약해요. 기록은 크롬북에 보관했다가 다시 보낼게요 📦'); return null; });
}
function flushOutbox() {
  var o = outbox(); if (!o.length) return;
  var p = o[0];
  call('saveMeasure', p).then(function () { var o2 = outbox(); o2.shift(); store('sd_outbox', o2); flushOutbox(); }).catch(function () {});
}
setInterval(flushOutbox, 20000);

/* ---------------- 내 탐정 수첩(크롬북 + 시트) ---------------- */
function bookKey() { return 'sd_book_' + S.cls + '_' + S.num; }
function book() { return store(bookKey()) || []; }
function addBook(r) { var b = book(); b.push(r); store(bookKey(), b); return b; }
var BADGES = [
  { k: 'first', e: '🔎', n: '첫 측정', d: '처음으로 소리를 쟀어요', ok: function (b) { return b.length >= 1; } },
  { k: 'ear', e: '👂', n: '귀 탐정', d: '귀와 기계가 3번 같았어요', ok: function (b) { return b.filter(function (x) { return x.match; }).length >= 3; } },
  { k: 'surprise', e: '💡', n: '깜짝 발견', d: '귀와 기계가 다른 걸 찾았어요', ok: function (b) { return b.some(function (x) { return !x.match; }); } },
  { k: 'quiet', e: '🤫', n: '조용 지킴이', d: '초록(조용) 소리를 3번 쟀어요', ok: function (b) { return b.filter(function (x) { return x.level === 1; }).length >= 3; } },
  { k: 'map', e: '🗺️', n: '지도 탐험가', d: '학교 장소를 3곳 쟀어요', ok: function (b) { var s = {}; b.forEach(function (x) { if (x.lesson === 3) s[x.sound] = 1; }); return Object.keys(s).length >= 3; } },
  { k: 'master', e: '🏅', n: '소리 박사', d: '소리를 10번 쟀어요', ok: function (b) { return b.length >= 10; } }
];
function badgesOf(b) { return BADGES.filter(function (x) { return x.ok(b); }).map(function (x) { return x.k; }); }

/* ---------------- 마이크 ---------------- */
function startMic() {
  if (A.an) { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); return Promise.resolve(true); }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('nomic'));
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false }).then(function (stream) {
    A.stream = stream; A.ctx = A.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (A.ctx.state === 'suspended') A.ctx.resume();
    var src = A.ctx.createMediaStreamSource(stream); A.an = A.ctx.createAnalyser(); A.an.fftSize = 2048; A.an.smoothingTimeConstant = 0; src.connect(A.an);
    A.buf = new Float32Array(A.an.fftSize); return true;
  });
}
function levelNow() {
  if (!A.an) return 0; A.an.getFloatTimeDomainData(A.buf); var s = 0;
  for (var i = 0; i < A.buf.length; i++) s += A.buf[i] * A.buf[i];
  var rms = Math.sqrt(s / A.buf.length), db = 20 * Math.log10(rms + 1e-7);
  return Math.max(0, Math.min(100, Math.round(db + 100)));
}
function liveStart() { if (A.on) return; A.on = true; loop(); }
function liveStop() { A.on = false; cancelAnimationFrame(A.raf); }
function loop() {
  if (!A.on) return;
  var v = levelNow(); A.smooth = A.smooth * 0.6 + v * 0.4; var val = Math.round(A.smooth);
  drawGauge(val); drawWave($('wave'));
  if (T.on) trafficDraw(val);
  A.raf = requestAnimationFrame(loop);
}
function drawWave(cv) {
  if (!cv || !A.an) return; var c = cv.getContext('2d'), w = cv.width = cv.clientWidth * (window.devicePixelRatio || 1), h = cv.height = cv.clientHeight * (window.devicePixelRatio || 1);
  c.clearRect(0, 0, w, h); var grd = c.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#59ecc1'); grd.addColorStop(.5, '#7cc8ff'); grd.addColorStop(1, '#ff8fc2');
  c.strokeStyle = grd; c.lineWidth = 4 * (window.devicePixelRatio || 1); c.lineCap = 'round'; c.beginPath();
  var step = Math.max(1, Math.floor(A.buf.length / 220));
  for (var i = 0, x = 0; i < A.buf.length; i += step, x++) { var px = x / (A.buf.length / step) * w, py = h / 2 + A.buf[i] * h * 1.6; if (!i) c.moveTo(px, py); else c.lineTo(px, py); }
  c.stroke();
}
// 반원 게이지(초록·노랑·빨강 구간)
function gaugeSVG() {
  var g = (S.data && S.data.green) || 50, y = (S.data && S.data.yellow) || 65;
  function arc(a0, a1, col) { var r = 150, cx = 180, cy = 180; function pt(a) { var t = Math.PI * (1 - a / 100); return [cx + r * Math.cos(t), cy - r * Math.sin(t)]; }
    var p0 = pt(a0), p1 = pt(a1); return '<path d="M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A150 150 0 0 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + '" stroke="' + col + '" stroke-width="34" fill="none" stroke-linecap="butt"/>'; }
  return '<svg viewBox="0 0 360 230" aria-hidden="true">' + arc(0, g, '#7fe0a8') + arc(g, y, '#ffe07a') + arc(y, 100, '#ff9aa4') +
    '<path id="garc" d="" stroke="#2b1d5c" stroke-width="10" fill="none" stroke-linecap="round" opacity=".18"/>' +
    '<g id="needle" style="transform-origin:180px 180px;transition:transform .12s"><line x1="180" y1="180" x2="180" y2="52" stroke="#2b1d5c" stroke-width="9" stroke-linecap="round"/><circle cx="180" cy="180" r="16" fill="#2b1d5c"/></g></svg>';
}
function drawGauge(v) {
  var n = $('needle'); if (n) n.style.transform = 'rotate(' + (-90 + v * 1.8) + 'deg)';
  var t = $('gval'); if (t) t.textContent = v;
  var l = $('glab'); if (l) { var L = levelOf(v); l.textContent = LV[L].f + ' ' + LV[L].n; l.style.color = L === 1 ? '#0f7a3c' : L === 2 ? '#9a6a00' : '#b3172b'; }
}
function micFail(e) {
  liveStop();
  var box = $('micbox'); var msg = '<div class="mic-help"><img src="assets/ding_curious.png" alt="" style="width:90px"><div><b>마이크를 켜 주세요!</b><br>' +
    '주소창 오른쪽의 🎤 표시를 누르고 <b>‘허용’</b>을 골라요. 그다음 아래 단추를 다시 눌러요.<br><small class="muted">(' + esc(e && e.message || e) + ')</small></div></div>';
  if (box) box.innerHTML = msg; else toast('마이크를 켜 주세요(허용).');
}

/* ---------------- 화면 그리기 ---------------- */
function go(screen) {
  S.screen = screen;
  document.body.classList.toggle('title-mode', screen === 'title');
  document.body.classList.remove('dark-mode');
  if (screen !== 'measure' && screen !== 'traffic' && !T.on) liveStop();
  $('app').innerHTML = (SCREENS[screen] || SCREENS.title)();
  window.scrollTo(0, 0);
  if (AFTER[screen]) AFTER[screen]();
}
function topbar(back) {
  return '<div class="topbar">' + (back ? '<button class="chip btn" data-go="' + back + '">◀ 뒤로</button>' : '') +
    '<button class="chip btn" data-go="title">🏠 처음</button><span class="sp"></span>' +
    (S.cls ? '<span class="chip">🕵️ ' + esc(S.cls) + '반 ' + esc(S.num) + '번 탐정 <span class="stars">⭐</span>' + book().length + '</span>' : '') + '</div>';
}
function talk(img, text) { return '<div class="talk"><img class="ding float" src="' + img + '" alt="띵동이"><div class="bubble">' + text + '</div></div>'; }

var SCREENS = {}, AFTER = {};

SCREENS.title = function () {
  return '<section class="title">' +
    '<div class="kicker">1학년 창의적 체험활동 · 소리와 우리 환경</div>' +
    '<h1>소리 탐정단<br><span class="gold">띵동이</span></h1>' +
    '<div class="eng">SOUND DETECTIVES</div>' +
    '<div class="lead">귀로 <b>느끼고</b>, 기계로 <b>재요!</b><br>보이지 않는 소리를 숫자와 색으로 찾아내는 탐정 놀이</div>' +
    '<button class="btn-big start float" data-act="start">🔍 탐정 출발!</button>' +
    (S.cls ? '<div class="me"><span class="chip">🕵️ ' + esc(S.cls) + '반 ' + esc(S.num) + '번 탐정</span> <button class="chip btn" data-act="relogin" style="background:rgba(25,14,62,.55);color:#fff">🔁 반·번호 바꾸기</button></div>' : '') +
    '<div class="menu">' +
    '<button class="chip btn" data-act="book">📒 내 탐정 수첩</button>' +
    '<button class="chip btn" data-act="map">🗺️ 소리 지도</button>' +
    '<button class="chip btn" data-act="letters">💌 띵동이 편지</button>' +
    '<button class="chip btn" data-act="stamps">⭐ 발소리 지킴이</button>' +
    '<button class="chip btn" data-go="tlogin">🔑 선생님</button></div></section>';
};

SCREENS.login = function () {
  var d = S.data || { classes: 6, size: 30 }, h = topbar('title') + '<div class="wrap">' +
    talk('assets/ding_wave.png', '안녕! 나는 종 요정 <b>띵동이</b>야. 너는 몇 반 몇 번 탐정이니?') + '<div class="panel mt"><h2 class="q-title">① 우리 반을 눌러요</h2><div class="pick-cls">';
  for (var c = 1; c <= (d.classes || 6); c++) h += '<button data-cls="' + c + '" class="' + (S.tmpCls == c ? 'on' : '') + '" style="background:' + CLS_COLORS[(c - 1) % CLS_COLORS.length] + '">' + c + '반</button>';
  h += '</div></div>';
  if (S.tmpCls) {
    h += '<div class="panel mt"><h2 class="q-title">② 내 번호를 눌러요</h2><div class="pick-num">';
    for (var n = 1; n <= (d.size || 30); n++) h += '<button data-num="' + n + '">' + n + '</button>';
    h += '</div></div>';
  }
  return h + '</div>';
};

SCREENS.home = function () {
  var L = LESSONS[S.lesson] || LESSONS[1], h = topbar('title') + '<div class="wrap">' +
    talk('assets/ding_wave.png', esc(S.cls) + '반 ' + esc(S.num) + '번 탐정님! 오늘은 어떤 소리를 재 볼까?') +
    '<div class="today mt"><div class="no">' + S.lesson + '</div><div><div class="k">' + (S.lesson === S.data.lesson ? '⭐ 오늘의 미션' : '미션') + ' · ' + S.lesson + '차시</div><div class="t">' + L.e + ' ' + L.t + '</div><div class="g">' + L.g + '</div></div>' +
    '<button class="btn-big go" data-act="measure">🎤 소리 재러 가기</button></div>' +
    '<div class="lessons mt">';
  for (var i = 1; i <= 6; i++) h += '<button data-lesson="' + i + '" class="' + (i === S.lesson ? 'on' : '') + '"><b>' + i + '</b>' + LESSONS[i].e + ' ' + (i === S.data.lesson ? '오늘' : '차시') + '</button>';
  h += '</div><div class="tiles mt2">' +
    '<button class="tile" data-act="book"><img src="assets/icon_medal.png" alt="">내 탐정 수첩</button>' +
    '<button class="tile" data-act="map"><img src="assets/icon_school.png" alt="">소리 지도</button>' +
    '<button class="tile" data-act="letters"><img src="assets/icon_letter.png" alt="">띵동이 편지</button>' +
    '<button class="tile" data-act="stamps"><img src="assets/icon_steps.png" alt="">발소리 지킴이</button></div></div>';
  return h;
};

function stepsBar() {
  var names = ['무슨 소리?', '귀로 예상', '기계로 재기', '결과'], h = '<div class="steps">';
  names.forEach(function (n, i) { var k = i + 1; h += '<span class="' + (k === S.step ? 'on' : (k < S.step ? 'done' : '')) + '">' + (k < S.step ? '✔' : k) + ' ' + n + '</span>'; });
  return h + '</div>';
}
SCREENS.measure = function () {
  var h = topbar('home') + '<div class="wrap">' + stepsBar(), sounds = (S.data.sounds && S.data.sounds[S.lesson]) || [];
  if (S.step === 1) {
    h += '<h2 class="q-title">' + (S.lesson === 3 ? '어디를 재 볼까요? 📍' : '어떤 소리를 재 볼까요? 🔔') + '</h2><div class="sounds">';
    sounds.forEach(function (s) { var ic = iconFor(s); h += '<button class="snd" data-sound="' + esc(s) + '">' + (ic ? '<img src="' + ic + '" alt="">' : '<span class="em">' + esc(emojiOf(s)) + '</span>') + esc(nameOf(s)) + '</button>'; });
    h += '</div>';
  } else if (S.step === 2) {
    h += '<div class="talk" style="justify-content:center"><img class="ding float" src="assets/kid_boy.png" alt="" style="width:110px"><div class="bubble"><b>' + esc(nameOf(S.sound)) + '</b> — 귀를 쫑긋! 내 귀에는 어떻게 들려요? 👂</div></div><div class="faces mt">' +
      [1, 2, 3].map(function (k) { return '<button class="face ' + LV[k].c + '" data-predict="' + k + '"><img src="' + LV[k].img + '" alt="">' + LV[k].f + ' ' + LV[k].n + '</button>'; }).join('') + '</div>' +
      '<p class="center muted mt">먼저 귀로 느끼고, 그다음 기계로 재요!</p>';
  } else if (S.step === 3) {
    h += '<h2 class="q-title">' + esc(nameOf(S.sound)) + ' — 기계로 재요! 🎤</h2>' +
      '<div class="panel"><div class="meter"><div><div class="gauge">' + gaugeSVG() + '<div class="val" id="gval">0</div><div class="lab" id="glab"></div></div></div>' +
      '<div><canvas class="wave" id="wave"></canvas><div class="mt" id="countbox" style="min-height:130px;display:grid;place-items:center"><div class="center muted">소리를 낼 준비가 되면 아래 단추를 눌러요.<br>5초 동안 재요!</div></div>' +
      '<div class="ring"><i id="ring"></i></div></div></div>' +
      '<div id="micbox" class="mt"></div><div class="center mt"><button class="btn-big pink" id="goBtn" data-act="measureNow">🎤 재기 시작!</button></div></div>';
  } else {
    var r = S.result, L = LV[r.level], P = LV[S.predict];
    h += '<div class="panel"><div class="result"><div class="center" style="position:relative"><img class="ding-big" src="' + L.img + '" alt="띵동이"><img src="assets/' + (r.match ? 'kid_girl' : 'kid_boy') + '.png" alt="" style="position:absolute;right:0;bottom:-10px;width:28%"></div><div>' +
      '<div class="muted" style="font-size:24px">' + esc(nameOf(S.sound)) + '</div><div class="row"><span class="big-num">' + r.score + '</span><span class="badge-lv ' + L.c + '">' + L.f + ' ' + L.n + '</span></div>' +
      '<div class="cmp"><div>내 귀 👂<b>' + P.f + '</b>' + P.n + '</div><div>기계 🎤<b><span class="dot ' + L.c + '" style="width:40px;height:40px"></span></b>' + L.n + '</div></div>' +
      (r.match ? '<div class="verdict same">⭐ 귀와 기계가 똑같아요! 멋진 귀 탐정!</div>' : '<div class="verdict diff">🔎 귀와 기계가 달랐어요! 탐정이 새로운 걸 발견했어요!</div>') +
      (r.newBadge ? '<div class="verdict same mt">🏅 새 배지: ' + r.newBadge + '</div>' : '') +
      '</div></div></div><div class="row mt" style="justify-content:center">' +
      '<button class="btn-big mint" data-act="again">🔁 한 번 더</button><button class="btn-big sky" data-act="other">🔔 다른 소리</button><button class="btn-soft" data-act="book">📒 내 수첩</button></div>';
  }
  return h + '</div>';
};
AFTER.measure = function () {
  if (S.step === 3) { drawGauge(0); startMic().then(function () { liveStart(); }).catch(micFail); }
  if (S.step === 4) { if (S.result.level === 3) { var im = document.querySelector('.ding-big'); if (im) im.classList.add('shake'); } else confetti(S.result.match ? 60 : 30); }
};
function measureNow() {
  var btn = $('goBtn'); if (btn) btn.disabled = true;
  startMic().then(function () {
    liveStart(); var box = $('countbox'), n = 3;
    (function tick() {
      if (n > 0) { box.innerHTML = '<div class="count">' + n + '</div>'; ding(660, .15); n--; setTimeout(tick, 800); return; }
      box.innerHTML = '<div class="count" style="color:#18b98c">지금!</div>'; ding(990, .25);
      setTimeout(record, 280);
    })();
  }).catch(function (e) { if (btn) btn.disabled = false; micFail(e); });
}
function record() {
  var samples = [], t0 = Date.now(), dur = 5000, box = $('countbox');
  var iv = setInterval(function () {
    samples.push(levelNow());
    var el = Date.now() - t0, left = Math.max(0, Math.ceil((dur - el) / 1000));
    var ring = $('ring'); if (ring) ring.style.width = Math.min(100, el / dur * 100) + '%';
    if (box) box.innerHTML = '<div class="center" style="font-size:30px">🎧 듣는 중… <b style="font-size:54px;color:#ff4f93">' + left + '</b>초</div>';
    if (el >= dur) { clearInterval(iv); finish(samples); }
  }, 100);
}
function finish(samples) {
  ding(1320, .3);
  if (!samples.length || !A.an) { toast('소리가 안 들어왔어요. 다시 해 봐요!'); go('measure'); return; }
  var avg = Math.round(samples.reduce(function (a, b) { return a + b; }, 0) / samples.length), mx = Math.max.apply(null, samples), score = Math.round((avg + mx) / 2);
  var level = levelOf(score), match = level === S.predict;
  var before = badgesOf(book());
  var b = addBook({ t: Date.now(), lesson: S.lesson, sound: S.sound, predict: S.predict, score: score, level: level, match: match });
  var after = badgesOf(b), nb = after.filter(function (k) { return before.indexOf(k) < 0; })[0];
  var badge = nb ? BADGES.filter(function (x) { return x.k === nb; })[0] : null;
  S.result = { score: score, avg: avg, max: mx, level: level, match: match, newBadge: badge ? badge.e + ' ' + badge.n : '' };
  sendMeasure({ cls: S.cls, num: S.num, lesson: S.lesson, sound: S.sound, place: S.place, predict: S.predict, score: score, avg: avg, max: mx,
    device: (navigator.userAgent.indexOf('CrOS') >= 0 ? 'Chromebook' : '기타') + '·새앱' });
  liveStop(); S.step = 4; go('measure');
}

SCREENS.book = function () {
  var b = book(), got = badgesOf(b), h = topbar('home') + '<div class="wrap">' +
    talk('assets/ding_quiet.png', esc(S.cls) + '반 ' + esc(S.num) + '번 탐정의 <b>탐정 수첩</b>이야! 지금까지 <b>' + b.length + '번</b> 쟀어. ⭐') +
    '<div class="panel mt"><h2 class="q-title">🏅 내 배지</h2><div class="badges">' +
    BADGES.map(function (x) { var on = got.indexOf(x.k) >= 0; return '<div class="bdg ' + (on ? 'on' : 'off') + '"><div class="e">' + x.e + '</div><b>' + x.n + '</b><div class="muted" style="font-size:16px">' + x.d + '</div></div>'; }).join('') +
    '</div></div><div class="panel mt"><h2 class="q-title">📒 내가 잰 소리</h2>';
  if (!b.length) h += '<p class="center muted">아직 기록이 없어요. 소리를 재러 가 볼까요?</p>';
  else {
    h += '<table class="log"><tbody>';
    b.slice().reverse().slice(0, 40).forEach(function (r) {
      var d = new Date(r.t); h += '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + '</td><td>' + r.lesson + '차시</td><td style="text-align:left">' + esc(r.sound) + '</td><td>' + (LV[r.predict] ? LV[r.predict].f : '') + ' → <span class="dot ' + LV[r.level].c + '"></span> ' + r.score + '</td><td>' + (r.match ? '⭐ 같았어요' : '🔎 달랐어요') + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  return h + '<p class="center muted" style="font-size:16px">수첩은 이 크롬북에도, 선생님 기록 시트에도 함께 저장돼요.</p></div></div>';
};

SCREENS.map = function () {
  return topbar('home') + '<div class="wrap">' + talk('assets/ding_curious.png', '<b>' + esc(S.cls || '') + (S.cls ? '반' : '') + ' 소리 지도</b>야! 장소마다 잰 소리의 평균이야. 어디가 제일 시끄러울까?') +
    '<div class="panel mt"><div id="mapbox" class="center muted">불러오는 중… 🔄</div></div><div class="panel mt"><h2 class="q-title">📋 우리 반 최근 기록</h2><div id="recentbox" class="center muted">불러오는 중…</div></div></div>';
};
AFTER.map = function () {
  call('getSoundMap', S.cls || '', 0).then(function (m) {
    var h = '<div class="map">';
    m.places.forEach(function (p) { var ic = iconFor(p.place); h += '<div class="place l' + p.level + '">' + (ic ? '<img src="' + ic + '" alt="" style="height:64px;margin:0 auto">' : '<div class="em">' + esc(emojiOf(p.place)) + '</div>') + esc(nameOf(p.place)) + '<div class="sc">' + (p.avg === null ? '–' : p.avg) + '</div><div style="font-size:18px">' + (p.level ? LV[p.level].f + ' ' + LV[p.level].n + ' · ' + p.n + '번' : '아직 안 쟀어요') + '</div></div>'; });
    $('mapbox').innerHTML = h + '</div>';
    var r = m.recent.slice(0, 20);
    $('recentbox').innerHTML = r.length ? '<table class="log"><tbody>' + r.map(function (x) { return '<tr' + (String(x.num) === String(S.num) ? ' style="outline:3px solid #ffcf3f"' : '') + '><td>' + esc(x.num) + '번</td><td style="text-align:left">' + esc(x.sound) + '</td><td>' + (LV[x.predict] ? LV[x.predict].f : '') + ' → <span class="dot l' + x.level + '"></span> ' + x.score + '</td><td>' + (x.match ? '⭐' : '🔎') + '</td></tr>'; }).join('') + '</tbody></table>' : '아직 기록이 없어요.';
  }).catch(function (e) { $('mapbox').textContent = '불러오지 못했어요: ' + e.message; });
};

SCREENS.letters = function () {
  return topbar('home') + '<div class="wrap">' + talk('assets/ding_wave.png', '띵동이가 쓴 편지야! 선생님이 읽어 줄 거야. 💌') + '<div id="letterbox" class="mt center muted">불러오는 중…</div></div>';
};
AFTER.letters = function () {
  call('getLetters', S.cls || '0').then(function (L) {
    $('letterbox').innerHTML = L.length ? L.map(function (x) { return '<div class="letter mt" style="text-align:left"><h3>💌 ' + esc(x.title || '띵동이 편지') + ' <small class="muted">(' + esc(x.lesson) + '차시)</small></h3>' + esc(x.body) + '</div>'; }).join('') : '<div class="panel">아직 도착한 편지가 없어요. 📭</div>';
  }).catch(function (e) { $('letterbox').textContent = '불러오지 못했어요: ' + e.message; });
};

SCREENS.stamps = function () {
  return topbar('home') + '<div class="wrap">' + talk('assets/ding_quiet.png', '집에서 아래층 이웃을 생각하며 한 일에 도장을 쾅! 🏠') + '<div id="stampbox" class="mt center muted">불러오는 중…</div></div>';
};
AFTER.stamps = function () {
  call('getStamps', S.cls, S.num).then(function (r) {
    S.stampDays = r.days; S.stampDate = S.stampDate || r.today; S.today = r.today; drawStamps();
  }).catch(function (e) { $('stampbox').textContent = '불러오지 못했어요: ' + e.message; });
};
function dayStr(base, off) { var p = base.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + off); var m = d.getMonth() + 1, dd = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd; }
function drawStamps() {
  var day = S.stampDays[S.stampDate] || { marks: {} }, h = '<div class="row" style="justify-content:center">';
  [['오늘', 0], ['어제', -1], ['그저께', -2]].forEach(function (x) { var ds = dayStr(S.today, x[1]); h += '<button class="btn-soft" data-day="' + ds + '" style="' + (ds === S.stampDate ? 'background:#ffcf3f' : '') + '">' + x[0] + ' (' + ds.slice(5) + ')</button>'; });
  h += '</div><div class="stamps mt">' + (S.data.stamps || []).map(function (s) { return '<button class="stamp ' + (day.marks[s.k] ? 'on' : '') + '" data-stamp="' + s.k + '"><span class="e">' + s.e + '</span>' + esc(s.t) + '</button>'; }).join('') + '</div>';
  var total = 0; Object.keys(S.stampDays).forEach(function (k) { total += S.stampDays[k].total || 0; });
  h += '<p class="center mt" style="font-size:24px">지금까지 모은 도장: <b style="font-size:34px;color:#ff4f93">' + total + '</b>개</p>';
  $('stampbox').innerHTML = h;
}
function toggleStamp(k) {
  var day = S.stampDays[S.stampDate] || { marks: {}, total: 0 }; day.marks[k] = !day.marks[k];
  day.total = Object.keys(day.marks).filter(function (x) { return day.marks[x]; }).length; S.stampDays[S.stampDate] = day; drawStamps();
  if (day.marks[k]) { ding(1046, .2); confetti(18); }
  call('saveStamp', { cls: S.cls, num: S.num, date: S.stampDate, marks: day.marks }).catch(function () { toast('저장이 안 됐어요. 다시 눌러 주세요.'); });
}

/* ---------------- 선생님 ---------------- */
SCREENS.tlogin = function () {
  return topbar('title') + '<div class="wrap"><div class="panel" style="max-width:560px;margin:0 auto"><h2 class="q-title">🔑 선생님 화면</h2>' +
    '<div class="row" style="justify-content:center"><input class="txt" id="tcode" type="password" placeholder="교사 코드" style="width:220px"><button class="btn-soft" data-act="tlogin">들어가기</button></div>' +
    '<p class="center muted" style="font-size:16px">교사 코드는 연구 데이터 시트 ‘설정’의 값과 같아요.</p></div></div>';
};
SCREENS.tdash = function () {
  var t = S.t, h = topbar('title') + '<div class="wrap"><div class="t-grid"><div class="panel"><h2 class="q-title">📚 오늘의 차시</h2><div class="lessons">';
  for (var i = 1; i <= 6; i++) h += '<button data-tlesson="' + i + '" class="' + (t.lesson === i ? 'on' : '') + '"><b>' + i + '</b>' + LESSONS[i].e + '</button>';
  h += '</div><p class="muted" style="font-size:16px">학생 화면의 ‘오늘의 미션’이 바뀌어요.</p>' +
    '<h3 class="mt">🎚️ 색 기준</h3><div class="row"><label>초록 &lt; <input class="txt" id="tg" type="number" value="' + t.green + '" style="width:90px"></label><label>노랑 &lt; <input class="txt" id="ty" type="number" value="' + t.yellow + '" style="width:90px"></label><button class="btn-soft" data-act="tsetlv">저장</button></div>' +
    '<p class="mt"><a href="' + esc(t.sheetUrl) + '" target="_blank" rel="noopener">📊 연구 데이터 시트 열기</a></p></div>' +
    '<div class="panel"><h2 class="q-title">🚦 교실 소리 신호등</h2><div class="row"><label>반 <select class="txt" id="tcls">';
  for (var c = 1; c <= (t.classes || 6); c++) h += '<option' + (String(c) === String(T.cls || S.cls) ? ' selected' : '') + '>' + c + '</option>';
  h += '</select></label><label>활동 <input class="txt" id="tact" value="모둠 학습지" style="width:200px"></label></div>' +
    '<div class="row mt"><button class="btn-big mint" data-act="trafficShow" style="font-size:24px">🚦 화면 보이며 기록</button><button class="btn-big sky" data-act="trafficCover" style="font-size:24px">🙈 기록만(화면 가림)</button></div>' +
    '<p class="muted" style="font-size:16px">30초마다 교실 소리를 ‘교실소리’ 시트에 기록해요. 1·6차시 비교 기록은 ‘기록만’으로, 정해진 자리에 두고 켜 두세요. 화면이 꺼지지 않게 해 둘게요.</p></div></div>' +
    '<div class="t-grid mt"><div class="panel"><h2 class="q-title">📈 반별 측정 현황</h2><table class="tbl"><tr><th>반·차시</th><th>측정</th><th>학생</th><th>예상 일치</th></tr>' +
    (t.stats || []).map(function (s) { return '<tr><td>' + esc(s.key) + '</td><td>' + s.n + '</td><td>' + s.students + '</td><td>' + s.matchRate + '%</td></tr>'; }).join('') + '</table></div>' +
    '<div class="panel"><h2 class="q-title">💌 띵동이 편지 올리기</h2><div class="row"><label>반(0=전체) <input class="txt" id="lcls" value="0" style="width:70px"></label><label>제목 <input class="txt" id="ltitle" value="띵동이가 보내는 편지" style="width:240px"></label></div>' +
    '<textarea class="txt mt" id="lbody" placeholder="편지 내용(교사용 편지 생성기 초안을 다듬어 붙여 넣기)"></textarea><div class="center mt"><button class="btn-soft" data-act="tletter">편지 올리기</button></div></div></div>' +
    '<div class="panel mt"><h2 class="q-title">🏫 교실 소리 기록 요약</h2><div id="roombox" class="center muted">불러오는 중…</div></div></div>';
  return h;
};
AFTER.tdash = function () {
  call('getClassroomSummary', S.tcode, '').then(function (r) {
    $('roombox').innerHTML = r.length ? '<table class="tbl"><tr><th>반·차시</th><th>기록 수</th><th>평균 점수</th><th>초록 비율</th></tr>' + r.map(function (x) { return '<tr><td>' + esc(x.key) + '</td><td>' + x.n + '</td><td>' + x.avg + '</td><td>' + x.greenRate + '%</td></tr>'; }).join('') + '</table>' : '아직 기록이 없어요.';
  }).catch(function (e) { $('roombox').textContent = e.message; });
};
SCREENS.traffic = function () {
  return '<div class="traffic ' + (T.cover ? 'cover' : '') + '" id="traffic"><div class="lamp l1" id="lamp"><img id="lampimg" src="assets/ding_quiet.png" alt=""></div><div class="tv" id="tv">0</div>' +
    '<div class="cover-msg">🙈 교실 소리를 기록하고 있어요<br><small>(' + esc(T.cls) + '반 · ' + esc(T.act) + ')</small></div>' +
    '<div id="tstat" style="font-size:20px;opacity:.85">기록 준비 중…</div><div class="tbar">' +
    '<button class="btn-soft" data-act="tcoverToggle">' + (T.cover ? '🚦 화면 보이기' : '🙈 화면 가리기') + '</button><button class="btn-soft" data-act="tstop">⏹ 기록 끝내기</button></div></div>';
};
function trafficStart(cover) {
  T.cls = $('tcls').value; T.act = $('tact').value || '활동'; T.cover = !!cover;
  startMic().then(function () {
    go('traffic'); document.body.classList.add('dark-mode'); liveStart();
    T.on = true; T.n = 0; T.sum = 0; T.green = 0; T.t0 = Date.now(); T.iv = setInterval(trafficTick, 30000); T.first = setTimeout(trafficTick, 5000); // 마이크가 안정된 뒤 첫 기록
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { T.lock = l; }).catch(function () {});
  }).catch(function (e) { toast('마이크를 허용해 주세요: ' + e.message); });
}
var lastL = 0;
function trafficDraw(v) {
  var L = levelOf(v), lamp = $('lamp'), tv = $('tv'); if (tv) tv.textContent = v;
  if (lamp && L !== lastL) { lamp.className = 'lamp l' + L; $('lampimg').src = LV[L].img; lastL = L; }
}
function trafficTick() {
  if (!T.on) return; var v = Math.round(A.smooth); T.n++; T.sum += v; if (levelOf(v) === 1) T.green++;
  var s = $('tstat'); if (s) s.textContent = '기록 ' + T.n + '번 · 평균 ' + Math.round(T.sum / T.n) + ' · 초록 ' + Math.round(T.green / T.n * 100) + '% · ' + Math.round((Date.now() - T.t0) / 60000) + '분';
  call('logClassroom', { code: S.tcode, cls: T.cls, lesson: S.t.lesson, activity: T.act, score: v }).catch(function () { toast('기록 전송이 안 됐어요(인터넷 확인)'); });
}
function trafficStop() {
  T.on = false; clearInterval(T.iv); clearTimeout(T.first); liveStop(); if (T.lock) { try { T.lock.release(); } catch (e) {} T.lock = null; }
  toast('기록을 끝냈어요: ' + T.n + '번'); go('tdash');
}

/* ---------------- 클릭 처리 ---------------- */
document.addEventListener('click', function (ev) {
  var el = ev.target.closest('button,[data-go]'); if (!el) return;
  var d = el.dataset;
  if (d.go) { if (d.go === 'home' && !S.cls) return go('login'); return go(d.go); }
  if (d.cls) { S.tmpCls = d.cls; go('login'); setTimeout(function () { var p = document.querySelector('.pick-num'); if (p) p.scrollIntoView({ behavior: 'smooth' }); }, 50); return; }
  if (d.num) { S.cls = S.tmpCls; S.num = d.num; store('sd_user', { cls: S.cls, num: S.num }); ding(880, .2); confetti(24); toast(S.cls + '반 ' + S.num + '번 탐정, 출동! 🕵️'); return go('home'); }
  if (d.lesson) { S.lesson = +d.lesson; return go('home'); }
  if (d.sound) { S.sound = d.sound; S.place = S.lesson === 3 ? d.sound : ''; S.step = 2; return go('measure'); }
  if (d.predict) { S.predict = +d.predict; S.step = 3; ding(784, .15); return go('measure'); }
  if (d.day) { S.stampDate = d.day; return drawStamps(); }
  if (d.stamp) return toggleStamp(d.stamp);
  if (d.tlesson) return call('teacherSet', S.tcode, { lesson: +d.tlesson }).then(function (t) { S.t = t; S.data.lesson = t.lesson; S.lesson = t.lesson; toast(t.lesson + '차시를 오늘의 미션으로 정했어요'); go('tdash'); });
  var a = d.act; if (!a) return;
  if (a === 'start') return S.cls ? go('home') : go('login');
  if (a === 'relogin') { S.tmpCls = ''; return go('login'); }
  if (a === 'book' || a === 'stamps') return S.cls ? go(a) : go('login');
  if (a === 'map' || a === 'letters') return go(a);
  if (a === 'measure') { S.step = 1; S.sound = ''; S.predict = 0; return go('measure'); }
  if (a === 'measureNow') return measureNow();
  if (a === 'again') { S.step = 3; return go('measure'); }
  if (a === 'other') { S.step = 1; return go('measure'); }
  if (a === 'tlogin') { var c = $('tcode').value; return call('teacherLogin', c).then(function (t) { if (!t.ok) return toast('코드가 달라요'); S.tcode = c; S.t = t; go('tdash'); }).catch(function (e) { toast(e.message); }); }
  if (a === 'tsetlv') return call('teacherSet', S.tcode, { green: +$('tg').value, yellow: +$('ty').value }).then(function (t) { S.t = t; S.data.green = t.green; S.data.yellow = t.yellow; toast('색 기준을 저장했어요'); });
  if (a === 'tletter') return call('saveLetter', { code: S.tcode, cls: $('lcls').value, lesson: S.t.lesson, title: $('ltitle').value, body: $('lbody').value }).then(function () { toast('편지를 올렸어요 💌'); $('lbody').value = ''; }).catch(function (e) { toast(e.message); });
  if (a === 'trafficShow') return trafficStart(false);
  if (a === 'trafficCover') return trafficStart(true);
  if (a === 'tcoverToggle') { T.cover = !T.cover; var tr = $('traffic'); tr.classList.toggle('cover', T.cover); el.textContent = T.cover ? '🚦 화면 보이기' : '🙈 화면 가리기'; lastL = 0; return; }
  if (a === 'tstop') return trafficStop();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'tcode') { var b = document.querySelector('[data-act="tlogin"]'); if (b) b.click(); } });

/* ---------------- 시작 ---------------- */
function boot() {
  var u = store('sd_user'); if (u && u.cls && u.num) { S.cls = u.cls; S.num = u.num; }
  S.data = { lesson: 1, classes: 6, size: 30, green: 50, yellow: 65, sounds: {}, stamps: [] };
  go('title');
  call('getAppData').then(function (d) { S.data = d; S.lesson = d.lesson || 1; if (S.screen === 'title') go('title'); flushOutbox(); })
    .catch(function () { toast('인터넷 연결을 확인해 주세요 🌐'); });
}
boot();
})();
