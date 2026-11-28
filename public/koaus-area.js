/* ══════════════════════════════════════════════════════════════════
   KoAus · 지도에서 정한 지역 — 기억 · 목록 표시 · 이어 보기 (11-26c, 11-26d · 11-27a · 11-27b 에 사용자 지시로 다듬음)
   ─ 지도에서 [이 지역 매물 검색하기]를 누르거나 상세 필터에서 지역을 검색하면 그 범위의 글만 보인다(목록 · 지도 공통 — 전부터 그랬다).
     11-26d: 지역을 정해 보는 동안은 주(QLD · NSW …)로 나누지 않는다 — 그 범위 안의 글이면 어느 주든 나온다
             (게시판 화면의 거르기가 주 조건을 건너뛴다. "맵뷰에서 이 지역만 했어 그럼 그거만 나와야지").
     이 파일이 더하는 것:
       ① 기억 — 정한 범위를 이 기기에 적어 둔다(LS koaus-area-v1:<게시판>, 14일). 화면을 나갔다 와도 다시 불러올 수 있다.
       ② 표시 — [전체 보기]는 상세 필터 창 안에 있다(11-27b, 사용자 결정 "전체보기는 저거 상세필터에 넣어야"):
          창 맨 위에 "○○ 근처만 보는 중  [전체 보기]" 한 줄(.koaus-area-now — 게시판 화면의 #areaNowRow · #areaNowText · #areaAllBtn, 좁혀 보는 중일 때만 보인다).
          목록 도구줄과 지도 위에 따로 뜨던 칩은 없앴다. 대신 좁혀 보는 동안 [상세 필터] 버튼에 점(●)이 붙는다
          (html.koaus-area-on #filterModalBtn::after — 모바일 지도 머리줄의 상세 필터(.kmh-filter)에도). 그래서 [상세 필터]는 역할과 상관없이 누구에게나 보인다(koaus-role.js).
          게시판 제목은 언제나 "쉐어"처럼 게시판 이름뿐이다(11-27a — 주 · 지역 이름을 넣지 않는다).
          지역을 보는 동안 주 고르기([QLD ▾])와 카드의 작은 주 표기(가격 아래 'QLD')는 숨긴다
          (html.koaus-area-on — 게시판 화면이 붙인다. [전체 보기]로 풀면 다시 보인다).
       ③ 이어 보기 — 게시판에 다시 들어오면 묻는 카드(11-27a, 사용자 지시 — 길 안내 앱의 "직장으로 주행하고 있나요?" 카드처럼):
              (핀)  Sunnybank 근처로 이어 보시겠어요?
                    새 글 3건                      ← 지난번에 본 뒤 그 범위에 새로 올라온 글. 없으면 이 줄은 없다
              [ 아니요 ]  [      이어 보기      ]
          · [이어 보기]: 지금 보는 보기 그대로 잇는다 — 목록의 카드는 목록으로, 지도의 카드는 지도로.
          · [아니요]: 이번 방문 동안 다시 묻지 않는다(적어 둔 범위는 14일 동안 남는다 — 다음에 들어오면 다시 묻는다).
          · 자리(11-26d 그대로) — 목록 보기: 목록 맨 위. 지도 보기: 아래쪽 — 모바일은 집 카드가 뜨는 칸(지도 아래 칸 — 지도를 덮지 않는다.
            집 카드가 열려 있는 동안은 비켜 준다), PC 는 지도 아래쪽 가운데에 얹는다(지도의 아래쪽이 화면 밖이면 화면 아래에 붙어 따라온다 — position: sticky).
          · 홈에는 두지 않는다(11-26d "홈에서는 제외해줘").
   ─ 게시판 화면(accom · rent · jobs)과의 약속 — 화면의 인라인 스크립트가 먼저 돌고 이 파일(defer)이 뒤에 돈다:
       window.__koausAreaHost = {
         board: 'accom', state: 'qld',
         active: () => 지역으로 좁혀 보는 중인가,
         apply: (saved, view) => 그 범위를 켜고 view('map' | 'list')로 보여 준다,
         countNew: (saved) => 그 범위에서 saved.t 뒤에 올라온 글 수(11-27a — [이어 보기]를 누르면 보일 목록과 같은 조건으로 센다. 내 글은 뺀다),
       };
       화면은 범위를 켤 때 koausArea.remember(board, state, bounds, { label, center, zoom }),
       [전체 보기](상세 필터 창 안) · [초기화]로 풀 때 koausArea.forget(board) 를 부른다. 창 안의 줄에 적는 말은 koausArea.nowText(label). 목록은 koausArea.shim(saved.o).contains({lat,lng}) 로 거른다
       (구글 지도를 불러오지 않아도 목록을 좁힐 수 있다 — 지도 객체의 getBounds() 와 같은 contains 만 흉내 낸다).
       11-27a: 화면이 목록을 다시 그릴 때마다 — 지역을 보는 중이면 koausArea.touch(board)(마지막으로 본 때를 지금으로),
               아니면 koausArea.refresh()(카드의 "새 글 N건"을 다시 센다 — 글은 화면이 뜬 뒤에 서버에서 들어온다).
   ─ 적어 두는 것: { o: {s,w,n,e}, c: {lat,lng}, z, label, state, t }. 위치 정보(기기의 현재 위치)는 쓰지 않는다 — 지도에서 본 범위뿐이다.
     state 는 적어만 둔다(11-26d 부터 이어 보기는 지금 보는 주와 상관없이 묻는다 — 지역은 주로 나누지 않는다).
     t = 그 범위를 마지막으로 본 때(이 기기의 시계). 14일 보관과 "새 글 N건"의 기준이다 — 글의 시각(서버)과 견주므로 기기 시계가 틀리면 건수가 조금 어긋날 수 있다(안내용 숫자).
   ─ 싣는 주소(11-27b): accom · rent · jobs 가 koaus-area.js?v=1127b 로 싣는다. js 는 한 시간 캐시라 예전 파일과 새 화면이 섞일 수 있다
     (예: 11-27a 의 CSS 는 .koaus-area-chip 을 숨긴다 → 새 화면의 창 안 [전체 보기]가 보이지 않는다).
     이 파일의 모양(CSS)이나 화면이 부르는 함수를 바꾸면 세 화면의 script 주소에 붙은 v 도 함께 바꾼다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausArea) return;
  var KEY = 'koaus-area-v1:', TTL = 14 * 24 * 60 * 60 * 1000, SKIP = 'koaus-area-skip:', TOUCH_MS = 60 * 1000;
  var BOARDS = ['accom', 'rent', 'jobs'];
  var STATE_RE = /^(nsw|vic|qld|wa|sa|tas|act|nt)$/;

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function okPlain(o) { return !!o && num(o.s) && num(o.w) && num(o.n) && num(o.e) && o.s < o.n && o.s >= -90 && o.n <= 90 && o.w >= -180 && o.e <= 180; }
  // 지도 객체의 범위(LatLngBounds) 또는 우리 흉내(shim) → { s, w, n, e }
  function plain(b) {
    try {
      if (!b) return null;
      if (b._koausPlain) return b._koausPlain;
      if (okPlain(b)) return { s: b.s, w: b.w, n: b.n, e: b.e };
      if (typeof b.toJSON === 'function') { var j = b.toJSON(); var o = { s: j.south, w: j.west, n: j.north, e: j.east }; return okPlain(o) ? o : null; }
      if (typeof b.getSouthWest === 'function') { var sw = b.getSouthWest(), ne = b.getNorthEast(); var p = { s: sw.lat(), w: sw.lng(), n: ne.lat(), e: ne.lng() }; return okPlain(p) ? p : null; }
    } catch (_) {}
    return null;
  }
  // 목록 거르기용 — 지도 객체처럼 contains({lat,lng}) 만 있다(호주 안에서는 날짜 변경선을 넘지 않는다)
  function shim(o) {
    if (!okPlain(o)) return null;
    return {
      _koausPlain: { s: o.s, w: o.w, n: o.n, e: o.e },
      contains: function (p) {
        var lat = p && (typeof p.lat === 'function' ? p.lat() : p.lat), lng = p && (typeof p.lng === 'function' ? p.lng() : p.lng);
        return num(lat) && num(lng) && lat >= o.s && lat <= o.n && (o.w <= o.e ? (lng >= o.w && lng <= o.e) : (lng >= o.w || lng <= o.e));
      },
      toJSON: function () { return { south: o.s, west: o.w, north: o.n, east: o.e }; },
    };
  }
  function clean(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); }

  function saved(board) {
    try {
      var v = JSON.parse(localStorage.getItem(KEY + board) || 'null');
      if (!v || !okPlain(v.o) || !num(v.t)) return null;
      if (Date.now() - v.t > TTL || v.t - Date.now() > 60000) { localStorage.removeItem(KEY + board); return null; }
      var out = { o: { s: v.o.s, w: v.o.w, n: v.o.n, e: v.o.e }, label: clean(v.label), state: STATE_RE.test(String(v.state || '')) ? v.state : '', t: v.t };
      if (v.c && num(v.c.lat) && num(v.c.lng)) out.c = { lat: v.c.lat, lng: v.c.lng };
      if (num(v.z) && v.z >= 3 && v.z <= 21) out.z = v.z;
      return out;
    } catch (_) { return null; }
  }
  var touched = {};   // 게시판마다 t 를 마지막으로 적은 때(이 화면에서)
  function remember(board, state, bounds, opts) {
    var o = plain(bounds); if (!o || BOARDS.indexOf(board) < 0) return null;
    opts = opts || {};
    var rec = { o: o, label: clean(opts.label), state: STATE_RE.test(String(state || '')) ? state : '', t: Date.now() };
    var c = opts.center, z = opts.zoom;
    try { if (c && typeof c.lat === 'function') c = { lat: c.lat(), lng: c.lng() }; } catch (_) { c = null; }
    if (c && num(c.lat) && num(c.lng)) rec.c = { lat: c.lat, lng: c.lng };
    if (num(z)) rec.z = z;
    try { localStorage.setItem(KEY + board, JSON.stringify(rec)); touched[board] = rec.t; } catch (_) {}
    hideCards();
    return rec;
  }
  function forget(board) { try { localStorage.removeItem(KEY + board); } catch (_) {} hideCards(); }
  // 지역을 보는 동안 '마지막으로 본 때'(t)를 지금으로 옮긴다(11-27a) — "새 글 N건"은 이 뒤에 올라온 글만 센다.
  //   목록을 그릴 때마다 불리므로 1분에 한 번만 적는다(force = 화면을 떠날 때: 바로 적는다). 적어 둔 것이 없으면 아무것도 하지 않는다.
  function touch(board, force) {
    try {
      if (BOARDS.indexOf(board) < 0) return;
      var now = Date.now();
      if (!force && touched[board] && now - touched[board] >= 0 && now - touched[board] < TOUCH_MS) return;
      var v = JSON.parse(localStorage.getItem(KEY + board) || 'null');
      if (!v || !okPlain(v.o) || !num(v.t)) return;
      touched[board] = now;
      if (v.t === now) return;
      v.t = now;
      localStorage.setItem(KEY + board, JSON.stringify(v));
    } catch (_) {}
  }

  // 범위 안 글들의 동네 이름 가운데 가장 많은 것 — "Sunnybank QLD 4109" 꼴 주소(또는 외부 글의 suburbEn)에서 동네만
  function labelFrom(posts) {
    var cnt = {}, best = '', max = 0;
    (posts || []).forEach(function (p) {
      if (!p) return;
      var s = p.suburbEn || '';
      if (!s) { var m = /([A-Za-z][A-Za-z .'-]*?)\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/.exec(String(p.address || '')); s = m ? m[1].split(',').pop().trim() : ''; }
      s = clean(s); if (!s || /\d/.test(s)) return;
      cnt[s] = (cnt[s] || 0) + 1;
      if (cnt[s] > max) { max = cnt[s]; best = s; }
    });
    return best;
  }
  function where(label) { label = clean(label); return label ? label + ' 근처' : '지도에서 정한 지역'; }
  // 상세 필터 창 맨 위 줄에 적는 말(11-27b) — "Sunnybank 근처만 보는 중" · 이름이 없으면 "지도에서 정한 지역만 보는 중". 그 옆에 [전체 보기]
  function nowText(label) { return where(label) + '만 보는 중'; }
  // 이어 보기 카드의 물음(11-27a) — "Sunnybank 근처로 이어 보시겠어요?" · 이름이 없으면 "지도에서 정한 지역으로 이어 보시겠어요?"
  function ask(label) { label = clean(label); return (label ? label + ' 근처로' : '지도에서 정한 지역으로') + ' 이어 보시겠어요?'; }

  // ── 모양 — 공용 안내(후보 B: 흰 카드 · 얇은 테두리)와 같은 결. 검정 · 흰색만 쓴다 ──
  var FONT = 'var(--font,"Noto Sans KR",system-ui,sans-serif)';
  var css =
    /* 상세 필터 창 맨 위 줄(11-27b) — "○○ 근처만 보는 중  [전체 보기]". 좁혀 보는 중일 때만(hidden 을 게시판 화면이 뗀다) */
    '.koaus-area-now{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;padding:14px 24px;' +
      'border-bottom:1px solid var(--border-subtle,#ebebeb);background:var(--bg-card,#f4f4f4);}' +
    '.koaus-area-now[hidden]{display:none;}' +
    '.koaus-area-now .kan-text{flex:1 1 auto;min-width:0;font:700 14px/1.4 ' + FONT + ';letter-spacing:-.2px;color:var(--text-primary,#111);word-break:keep-all;overflow-wrap:anywhere;}' +
    '.koaus-area-chip{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:40px;margin:0;padding:0 16px;border:1px solid var(--text-primary,#111);border-radius:var(--r-btn-sm,8px);' +
      'background:var(--bg-base,#fff);color:var(--text-primary,#111);font:700 13.5px/1 ' + FONT + ';letter-spacing:-.2px;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent;}' +
    '.koaus-area-chip:hover{background:var(--text-primary,#111);color:var(--bg-base,#fff);}' +
    /* 좁혀 보는 동안 [상세 필터] 버튼에 점 — 목록 도구줄(#filterModalBtn)과 모바일 지도 머리줄(.kmh-filter). 두 버튼 모두 flex 라 gap 만큼 떨어져 붙는다 */
    'html.koaus-area-on #filterModalBtn::after,html.koaus-area-on .kmh-filter::after{content:"";flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:currentColor;}' +
    /* 지역을 보는 동안은 주 고르기와 카드의 작은 주 표기를 숨긴다 — 주로 나눈 것처럼 보이지 않게(11-26d) */
    'html.koaus-area-on .koaus-state-sel,html.koaus-area-on .accom-card-state{display:none !important;}' +
    /* 이어 보기 카드(11-27a) — 위: (핀) 물음 + "새 글 N건" / 아래: [아니요] [이어 보기] */
    '.koaus-resume{box-sizing:border-box;max-width:460px;padding:14px;margin:0 0 12px;' +
      'background:var(--bg-base,#fff);color:var(--text-primary,#111);border:1px solid var(--border,#dcdcdc);border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.08);' +
      'font:600 14px/1.4 ' + FONT + ';letter-spacing:-.2px;word-break:keep-all;text-align:left;}' +
    '.koaus-resume[hidden]{display:none;}' +
    '.koaus-resume .kr-head{display:flex;align-items:center;gap:12px;}' +
    '.koaus-resume .kr-ico{flex:0 0 auto;width:40px;height:40px;border-radius:50%;background:var(--bg-card,#f4f4f4);color:var(--text-primary,#111);display:flex;align-items:center;justify-content:center;}' +
    '.koaus-resume .kr-ico svg{display:block;}' +
    '.koaus-resume .kr-body{flex:1 1 auto;min-width:0;}' +
    '.koaus-resume .kr-title{font-weight:800;font-size:15.5px;line-height:1.35;overflow-wrap:anywhere;}' +
    '.koaus-resume .kr-sub{margin-top:2px;font-weight:600;font-size:13px;line-height:1.35;opacity:.72;}' +
    '.koaus-resume .kr-sub[hidden]{display:none;}' +
    '.koaus-resume .kr-acts{display:flex;gap:8px;margin-top:12px;}' +
    '.koaus-resume .kr-btn{flex:2.2 1 0;min-width:0;height:44px;margin:0;padding:0 10px;border:1px solid var(--text-primary,#111);border-radius:var(--r-btn,10px);background:var(--text-primary,#111);color:var(--bg-base,#fff);' +
      'font:700 14.5px/1 ' + FONT + ';letter-spacing:-.2px;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent;}' +
    '.koaus-resume .kr-btn.sec{flex:1 1 0;background:transparent;color:var(--text-primary,#111);border-color:var(--border,#cfcfcf);}' +
    '.koaus-resume .kr-btn.sec:hover{border-color:var(--text-primary,#111);}' +
    /* 지도 보기 — 지도 바로 뒤의 칸(.koaus-resume-slot). PC: 높이 0 인 칸에서 지도와 같은 크기의 틀(.kr-over, 누름은 통과)을 위로 펼치고,
       카드는 그 틀의 맨 아래 가운데 — sticky 라서 지도의 아래쪽이 화면 밖이면 화면 아래(24px 위)에 붙어 따라온다 */
    '.koaus-resume-slot{position:relative;height:0;}' +
    '.koaus-resume-slot .kr-over{position:absolute;left:0;right:0;bottom:0;height:var(--kr-map-h,560px);display:flex;flex-direction:column;justify-content:flex-end;align-items:center;pointer-events:none;z-index:6;}' +
    '.koaus-resume-slot .koaus-resume{position:sticky;bottom:24px;width:min(360px,calc(100% - 24px));max-width:none;margin:0 0 24px;pointer-events:auto;box-shadow:0 6px 24px rgba(0,0,0,.22);}' +
    /* 모바일(지도가 화면을 채우는 보기): 집 카드가 뜨는 칸 — 지도 아래에 자리를 차지하고 지도는 그만큼만 줄어든다. 집 카드가 열리면 비켜 준다 */
    '@media(max-width:768px){.koaus-resume-slot{height:auto;flex:0 0 auto;}' +
      '.koaus-resume-slot .kr-over{position:static;height:auto;display:block;pointer-events:auto;}' +
      '.koaus-resume-slot .koaus-resume{position:static;width:auto;margin:8px;padding:12px;box-shadow:none;}' +
      '.koaus-resume-slot .koaus-resume .kr-acts{margin-top:10px;}' +
      '.koaus-resume-slot[data-drawer="1"]{display:none;}}' +
    ':root[data-theme="dark"] .koaus-area-now{background:#111;border-bottom-color:#2a2a2a;}' +
    ':root[data-theme="dark"] .koaus-resume{background:#111;border-color:#333;}' +
    ':root[data-theme="dark"] .koaus-resume .kr-ico{background:#242424;}' +
    ':root[data-theme="dark"] .koaus-resume .kr-btn.sec{border-color:#444;}';
  function injectCss() {
    if (document.getElementById('koaus-area-style')) return;
    var st = document.createElement('style'); st.id = 'koaus-area-style'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  var cards = [], cur = null;   // cur = { host, rec } — 카드가 떠 있는 동안만
  function hideCards() { cards.forEach(function (c) { c.hidden = true; }); cur = null; }
  function skipped(board, rec) { try { return sessionStorage.getItem(SKIP + board) === String(rec.t); } catch (_) { return false; } }
  function skip(board, rec) { try { sessionStorage.setItem(SKIP + board, String(rec.t)); } catch (_) {} hideCards(); }

  // "새 글 N건"(11-27a) — 지난번에 본 뒤 그 범위에 새로 올라온 글 수를 게시판 화면에 물어(host.countNew) 카드에 적는다. 없으면 그 줄을 숨긴다
  function refresh() {
    if (!cur) return;
    var n = 0;
    try { n = (typeof cur.host.countNew === 'function') ? Number(cur.host.countNew(cur.rec)) : 0; } catch (_) { n = 0; }
    n = (isFinite(n) && n > 0) ? Math.floor(n) : 0;
    cards.forEach(function (c) {
      var sub = c.querySelector('.kr-sub'); if (!sub) return;
      if (n > 0) { sub.textContent = '새 글 ' + n + '건'; sub.hidden = false; }
      else { sub.textContent = ''; sub.hidden = true; }
    });
  }

  // 카드 하나 — 물음(title) + "새 글 N건"(refresh 가 채운다) + [아니요] [이어 보기](view = 'list' | 'map' — 그 보기 그대로 잇는다)
  //   title 은 글자로만 넣는다(textContent — 적어 둔 이름에 태그가 섞여 있어도 풀리지 않는다)
  var PIN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 21.2s-6.6-5.7-6.6-10.8a6.6 6.6 0 1 1 13.2 0c0 5.1-6.6 10.8-6.6 10.8z"/><circle cx="12" cy="10.3" r="2.4"/></svg>';
  function card(view, title, onPick, onNo) {
    var el = document.createElement('div');
    el.className = 'koaus-resume';
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', '지난번에 보던 지역');
    el.innerHTML = '<div class="kr-head"><span class="kr-ico" aria-hidden="true">' + PIN + '</span>' +
      '<div class="kr-body"><div class="kr-title"></div><div class="kr-sub" hidden></div></div></div>' +
      '<div class="kr-acts"><button type="button" class="kr-btn sec kr-no">아니요</button>' +
      '<button type="button" class="kr-btn kr-go" data-v="' + (view === 'map' ? 'map' : 'list') + '">이어 보기</button></div>';
    el.querySelector('.kr-title').textContent = title;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.kr-go');
      if (b) { onPick(b.getAttribute('data-v')); return; }
      if (e.target.closest('.kr-no')) onNo();
    });
    cards.push(el);
    return el;
  }

  // 지도 보기의 칸 — 지도 바로 뒤에 둔다. 집 카드(#mapCardDrawer, koaus-map-cluster.js 가 #mapView 끝에 만든다)가 열려 있으면 data-drawer="1"
  function mountOnMap(mv, el) {
    var slot = document.createElement('div'), over = document.createElement('div');
    slot.className = 'koaus-resume-slot'; over.className = 'kr-over';
    over.appendChild(el); slot.appendChild(over);
    var mapEl = mv.querySelector('#accomMap, #jobsMap');
    if (mapEl && mapEl.parentNode === mv) mv.insertBefore(slot, mapEl.nextSibling); else mv.appendChild(slot);
    // PC 의 틀 높이 = 지도 높이(쉐어 · 렌트 560px, 구인 480px — 지도 보기가 열릴 때 · 창 크기가 바뀔 때 다시 잰다)
    var fit = function () { try { var h = mapEl ? mapEl.offsetHeight : 0; if (h > 0) slot.style.setProperty('--kr-map-h', h + 'px'); } catch (_) {} };
    fit();
    try { if (mapEl && typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(mapEl); else window.addEventListener('resize', fit); } catch (_) {}
    if (typeof MutationObserver !== 'function') return;
    var seen = null;
    var sync = function () {
      var d = mv.querySelector('#mapCardDrawer');
      if (d && d !== seen) { seen = d; try { new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ['hidden'] }); } catch (_) {} }
      if (d && !d.hasAttribute('hidden')) slot.setAttribute('data-drawer', '1'); else slot.removeAttribute('data-drawer');
    };
    try { new MutationObserver(sync).observe(mv, { childList: true }); } catch (_) {}
    sync();
  }

  // ── 게시판 화면 ──
  function initBoard(host) {
    var board = host.board; if (BOARDS.indexOf(board) < 0) return;
    injectCss();
    // 지역을 보다가 화면을 떠날 때 — 마지막으로 본 때를 적어 둔다(다음에 "새 글 N건"을 여기서부터 센다)
    var leave = function () { try { if (host.active && host.active()) touch(board, true); } catch (_) {} };
    try {
      window.addEventListener('pagehide', leave);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); });
    } catch (_) {}
    var rec = saved(board);
    if (!rec || skipped(board, rec)) return;
    try { if (host.active && host.active()) return; } catch (_) {}
    try { if (new URLSearchParams(location.search).get('id')) return; } catch (_) {}   // 글 하나를 바로 여는 주소면 방해하지 않는다
    var title = ask(rec.label);
    var pick = function (v) { hideCards(); try { host.apply(rec, v); } catch (e) { try { console.warn('[koaus-area] 적용 실패', e); } catch (_) {} } };
    var no = function () { skip(board, rec); };
    var lv = document.getElementById('listView'), mv = document.getElementById('mapView');
    if (lv) lv.insertBefore(card('list', title, pick, no), lv.firstChild);
    if (mv) mountOnMap(mv, card('map', title, pick, no));
    cur = { host: host, rec: rec };
    refresh();
  }

  function boot() {
    try { if (window.__koausAreaHost) initBoard(window.__koausAreaHost); }
    catch (e) { try { console.warn('[koaus-area] 시작 실패', e); } catch (_) {} }
  }

  window.koausArea = { plain: plain, shim: shim, saved: saved, remember: remember, forget: forget, touch: touch, refresh: refresh, labelFrom: labelFrom,
    nowText: nowText, where: where, ask: ask, hideCards: hideCards, TTL: TTL };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
