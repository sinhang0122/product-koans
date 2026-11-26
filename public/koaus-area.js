/* ══════════════════════════════════════════════════════════════════
   KoAus · 지도에서 정한 지역 — 기억 · 목록 표시 · 이어 보기 (11-26c, 사용자 지시)
   ─ 지도에서 [이 지역 매물 검색하기]를 누르거나 상세 필터에서 지역을 검색하면 그 범위의 글만 보인다(목록 · 지도 공통 — 전부터 그랬다).
     이 파일이 더하는 것:
       ① 기억 — 정한 범위를 이 기기에 적어 둔다(LS koaus-area-v1:<게시판>, 14일). 화면을 나갔다 와도 다시 불러올 수 있다.
       ② 표시 — 목록과 지도에 "○○ 근처만 보는 중 · 전체 보기" 칩(게시판 화면이 그린다 — chipText()).
       ③ 이어 보기 — 게시판에 다시 들어오면 "지난번에 보던 ○○ 근처 … [지도로 보기] [목록으로 보기]" 카드(목록 위 · 지도 위).
          홈에서는 가장 최근에 본 게시판 하나를 같은 카드로 보여 주고, 누르면 그 게시판으로 간다(?state=…&area=map|list).
   ─ 게시판 화면(accom · rent · jobs)과의 약속 — 화면의 인라인 스크립트가 먼저 돌고 이 파일(defer)이 뒤에 돈다:
       window.__koausAreaHost = {
         board: 'accom', state: 'qld',
         active: () => 지역으로 좁혀 보는 중인가,
         apply: (saved, view) => 그 범위를 켜고 view('map' | 'list')로 보여 준다,
       };
       화면은 범위를 켤 때 koausArea.remember(board, state, bounds, { label, center, zoom }),
       [전체 보기]로 풀 때 koausArea.forget(board) 를 부른다. 목록은 koausArea.shim(saved.o).contains({lat,lng}) 로 거른다
       (구글 지도를 불러오지 않아도 목록을 좁힐 수 있다 — 지도 객체의 getBounds() 와 같은 contains 만 흉내 낸다).
   ─ 적어 두는 것: { o: {s,w,n,e}, c: {lat,lng}, z, label, state, t }. 위치 정보(기기의 현재 위치)는 쓰지 않는다 — 지도에서 본 범위뿐이다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausArea) return;
  var KEY = 'koaus-area-v1:', TTL = 14 * 24 * 60 * 60 * 1000, SKIP = 'koaus-area-skip:';
  var BOARDS = ['accom', 'rent', 'jobs'];
  var NAME = { accom: '쉐어', rent: '렌트', jobs: '구인구직' };
  var PAGE = { accom: 'accom.html', rent: 'rent.html', jobs: 'jobs.html' };
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
  function remember(board, state, bounds, opts) {
    var o = plain(bounds); if (!o || BOARDS.indexOf(board) < 0) return null;
    opts = opts || {};
    var rec = { o: o, label: clean(opts.label), state: STATE_RE.test(String(state || '')) ? state : '', t: Date.now() };
    var c = opts.center, z = opts.zoom;
    try { if (c && typeof c.lat === 'function') c = { lat: c.lat(), lng: c.lng() }; } catch (_) { c = null; }
    if (c && num(c.lat) && num(c.lng)) rec.c = { lat: c.lat, lng: c.lng };
    if (num(z)) rec.z = z;
    try { localStorage.setItem(KEY + board, JSON.stringify(rec)); } catch (_) {}
    hideCards();
    return rec;
  }
  function forget(board) { try { localStorage.removeItem(KEY + board); } catch (_) {} hideCards(); }

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
  function where(label) { return label ? label + ' 근처' : '지도에서 정한 지역'; }
  function chipText(label) { return where(clean(label)) + '만 보는 중 · 전체 보기'; }

  // ── 모양 — 공용 안내(후보 B: 흰 카드 · 얇은 테두리 · 왼쪽 점)와 같은 결 ──
  var css =
    '.koaus-area-chip{display:none;align-items:center;max-width:100%;margin-left:8px;padding:5px 10px;border:1px solid var(--text-primary,#111);border-radius:var(--r-btn-sm,8px);' +
      'background:var(--bg-base,#fff);color:var(--text-primary,#111);font:700 12px/1.25 var(--font,"Noto Sans KR",system-ui,sans-serif);letter-spacing:-.2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.koaus-area-chip:hover{background:var(--text-primary,#111);color:var(--bg-base,#fff);}' +
    '.koaus-area-chip.on-map{position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:5;margin:0;max-width:calc(100% - 24px);box-shadow:0 2px 10px rgba(0,0,0,.18);}' +
    '@media(max-width:768px){.koaus-area-chip.on-map{top:48px;}}' +
    '.koaus-resume{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;box-sizing:border-box;padding:10px 12px 10px 14px;margin:0 0 12px;' +
      'background:var(--bg-base,#fff);color:var(--text-primary,#111);border:1px solid var(--border,#dcdcdc);border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.08);' +
      'font:600 14px/1.35 var(--font,"Noto Sans KR",system-ui,sans-serif);letter-spacing:-.2px;word-break:keep-all;}' +
    '.koaus-resume[hidden]{display:none;}' +
    '.koaus-resume .kr-dot{width:8px;height:8px;border-radius:50%;background:var(--text-primary,#111);flex:0 0 auto;}' +
    '.koaus-resume .kr-text{flex:1 1 180px;min-width:0;}' +
    '.koaus-resume .kr-text b{font-weight:800;}' +
    '.koaus-resume .kr-acts{display:flex;gap:6px;flex:0 0 auto;}' +
    '.koaus-resume .kr-btn{height:34px;padding:0 12px;border:1px solid var(--text-primary,#111);border-radius:var(--r-btn,10px);background:var(--text-primary,#111);color:var(--bg-base,#fff);' +
      'font:700 13px/1 var(--font,"Noto Sans KR",system-ui,sans-serif);letter-spacing:-.2px;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;}' +
    '.koaus-resume .kr-btn.sec{background:transparent;color:var(--text-primary,#111);}' +
    '.koaus-resume .kr-x{flex:0 0 auto;width:34px;height:34px;border:0;background:none;color:var(--text-muted,#777);font-size:15px;cursor:pointer;border-radius:var(--r-btn,10px);}' +
    '.koaus-resume.on-map{position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:6;width:min(440px,calc(100% - 24px));margin:0;box-shadow:0 6px 24px rgba(0,0,0,.22);}' +
    '@media(max-width:768px){.koaus-resume.on-map{top:48px;}}' +
    '.koaus-resume.on-home{margin:12px 0 0;}' +
    ':root[data-theme="dark"] .koaus-resume{background:#111;border-color:#333;}';
  function injectCss() {
    if (document.getElementById('koaus-area-style')) return;
    var st = document.createElement('style'); st.id = 'koaus-area-style'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  var cards = [];
  function hideCards() { cards.forEach(function (c) { c.hidden = true; }); }
  function skipped(board, rec) { try { return sessionStorage.getItem(SKIP + board) === String(rec.t); } catch (_) { return false; } }
  function skip(board, rec) { try { sessionStorage.setItem(SKIP + board, String(rec.t)); } catch (_) {} hideCards(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // 카드 하나 — onPick(view) · onClose()
  function card(cls, html, onPick, onClose) {
    var el = document.createElement('div');
    el.className = 'koaus-resume' + (cls ? ' ' + cls : '');
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', '지난번에 보던 지역');
    el.innerHTML = '<span class="kr-dot" aria-hidden="true"></span><span class="kr-text">' + html + '</span>' +
      '<span class="kr-acts"><button type="button" class="kr-btn" data-v="map">지도로 보기</button><button type="button" class="kr-btn sec" data-v="list">목록으로 보기</button></span>' +
      '<button type="button" class="kr-x" aria-label="닫기">✕</button>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (b) { onPick(b.getAttribute('data-v')); return; }
      if (e.target.closest('.kr-x')) onClose();
    });
    cards.push(el);
    return el;
  }

  // ── 게시판 화면 ──
  function initBoard(host) {
    var board = host.board; if (BOARDS.indexOf(board) < 0) return;
    injectCss();
    var rec = saved(board);
    // 홈의 카드나 공유한 주소로 들어온 경우(?area=map|list) — 묻지 않고 바로 켠다. 주소의 area 는 지운다(새로 고쳐도 다시 켜지지 않게)
    var q; try { q = new URLSearchParams(location.search); } catch (_) { q = null; }
    var want = q ? (q.get('area') || '') : '';
    if (want === 'map' || want === 'list') {
      try { q.delete('area'); var qs = q.toString(); history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (_) {}
      if (rec && (!rec.state || rec.state === host.state)) { try { host.apply(rec, want); } catch (e) { try { console.warn('[koaus-area] 적용 실패', e); } catch (_) {} } return; }
    }
    if (!rec || (rec.state && rec.state !== host.state)) return;   // 다른 주를 보고 있으면 묻지 않는다
    if (skipped(board, rec)) return;
    try { if (host.active && host.active()) return; } catch (_) {}
    try { if (q && q.get('id')) return; } catch (_) {}              // 글 하나를 바로 여는 주소면 방해하지 않는다
    var html = '지난번에 보던 <b>' + esc(where(rec.label)) + '</b>, 이어서 보시겠습니까?';
    var pick = function (v) { hideCards(); try { host.apply(rec, v); } catch (e) { try { console.warn('[koaus-area] 적용 실패', e); } catch (_) {} } };
    var close = function () { skip(board, rec); };
    var lv = document.getElementById('listView'), mv = document.getElementById('mapView');
    if (lv) lv.insertBefore(card('', html, pick, close), lv.firstChild);
    if (mv) mv.appendChild(card('on-map', html, pick, close));
  }

  // ── 홈 — 가장 최근에 본 게시판 하나 ──
  function initHome() {
    var root = document.getElementById('homeEntry'); if (!root) return;
    var best = null, bb = '';
    BOARDS.forEach(function (b) { var r = saved(b); if (r && r.state && (!best || r.t > best.t)) { best = r; bb = b; } });
    if (!best || skipped(bb, best)) return;
    injectCss();
    var html = '지난번에 보던 <b>' + esc(NAME[bb] + ' · ' + where(best.label)) + '</b>, 이어서 보시겠습니까?';
    var go = function (v) { location.href = PAGE[bb] + '?state=' + encodeURIComponent(best.state) + '&area=' + v; };
    var el = card('on-home', html, go, function () { skip(bb, best); });
    var tiles = root.querySelector('.home-entry-tiles');
    if (tiles && tiles.parentNode) tiles.parentNode.insertBefore(el, tiles.nextSibling); else root.insertBefore(el, root.firstChild);
  }

  function boot() {
    try {
      if (window.__koausAreaHost) initBoard(window.__koausAreaHost);
      else if (document.getElementById('homeEntry')) initHome();
    } catch (e) { try { console.warn('[koaus-area] 시작 실패', e); } catch (_) {} }
  }

  window.koausArea = { plain: plain, shim: shim, saved: saved, remember: remember, forget: forget, labelFrom: labelFrom, chipText: chipText, where: where, hideCards: hideCards, TTL: TTL };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
