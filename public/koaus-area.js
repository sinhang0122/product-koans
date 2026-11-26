/* ══════════════════════════════════════════════════════════════════
   KoAus · 지도에서 정한 지역 — 기억 · 목록 표시 · 이어 보기 (11-26c, 11-26d 에 사용자 지시로 다듬음)
   ─ 지도에서 [이 지역 매물 검색하기]를 누르거나 상세 필터에서 지역을 검색하면 그 범위의 글만 보인다(목록 · 지도 공통 — 전부터 그랬다).
     11-26d: 지역을 정해 보는 동안은 주(QLD · NSW …)로 나누지 않는다 — 그 범위 안의 글이면 어느 주든 나온다
             (게시판 화면의 거르기가 주 조건을 건너뛴다. "맵뷰에서 이 지역만 했어 그럼 그거만 나와야지").
     이 파일이 더하는 것:
       ① 기억 — 정한 범위를 이 기기에 적어 둔다(LS koaus-area-v1:<게시판>, 14일). 화면을 나갔다 와도 다시 불러올 수 있다.
       ② 표시 — 목록과 지도에 칩 [전체 보기](게시판 화면이 그린다 — chipText() · 풍선말 chipHint()).
          제목은 "○○ 근처 쉐어"(where()), 지역을 보는 동안 주 고르기([QLD ▾])와 카드의 작은 주 표기(가격 아래 'QLD')는 숨긴다
          (html.koaus-area-on — 게시판 화면이 붙인다. [전체 보기]로 풀면 다시 보인다).
       ③ 이어 보기 — 게시판에 다시 들어오면 카드:  지난번에 보던 ○○ 근처, / 이어서 보시겠습니까? / [지도로 보기] [목록으로 보기]
          · 목록 보기: 목록 맨 위.
          · 지도 보기: 아래쪽(11-26d, "웨이즈처럼"). 모바일은 집 카드가 뜨는 칸(지도 아래 칸 — 지도를 덮지 않는다. 집 카드가 열려 있는 동안은 비켜 준다),
            PC 는 지도 아래쪽 가운데에 작게 얹는다(PC 의 집 카드 칸은 지도 밑이라 화면 밖일 때가 많다). 지도의 아래쪽이 화면 밖이면
            화면 아래에 붙어 따라온다(position: sticky) — 스크롤하지 않아도 보인다.
          · 홈에는 두지 않는다(11-26d "홈에서는 제외해줘").
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
     state 는 적어만 둔다(11-26d 부터 이어 보기는 지금 보는 주와 상관없이 묻는다 — 지역은 주로 나누지 않는다).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausArea) return;
  var KEY = 'koaus-area-v1:', TTL = 14 * 24 * 60 * 60 * 1000, SKIP = 'koaus-area-skip:';
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
  function where(label) { label = clean(label); return label ? label + ' 근처' : '지도에서 정한 지역'; }
  // 칩 — 글자는 [전체 보기]뿐(11-26d). 무엇을 보는 중인지는 제목("○○ 근처 쉐어")과 풍선말에 있다
  function chipText() { return '전체 보기'; }
  function chipHint(label) { return where(label) + '만 보는 중 — 전체 보기'; }

  // ── 모양 — 공용 안내(후보 B: 흰 카드 · 얇은 테두리 · 왼쪽 점)와 같은 결 ──
  var css =
    '.koaus-area-chip{display:none;align-items:center;max-width:100%;margin-left:8px;padding:5px 10px;border:1px solid var(--text-primary,#111);border-radius:var(--r-btn-sm,8px);' +
      'background:var(--bg-base,#fff);color:var(--text-primary,#111);font:700 12px/1.25 var(--font,"Noto Sans KR",system-ui,sans-serif);letter-spacing:-.2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.koaus-area-chip:hover{background:var(--text-primary,#111);color:var(--bg-base,#fff);}' +
    '.koaus-area-chip.on-map{position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:5;margin:0;max-width:calc(100% - 24px);box-shadow:0 2px 10px rgba(0,0,0,.18);}' +
    '@media(max-width:768px){.koaus-area-chip.on-map{top:48px;}}' +
    /* 지역을 보는 동안은 주 고르기와 카드의 작은 주 표기를 숨긴다 — 주로 나눈 것처럼 보이지 않게(11-26d) */
    'html.koaus-area-on .koaus-state-sel,html.koaus-area-on .accom-card-state{display:none !important;}' +
    /* 이어 보기 카드 — 두 줄 글 + 그 아래 버튼 둘(11-26d) */
    '.koaus-resume{display:flex;align-items:flex-start;gap:10px;box-sizing:border-box;max-width:460px;padding:12px 6px 12px 14px;margin:0 0 12px;' +
      'background:var(--bg-base,#fff);color:var(--text-primary,#111);border:1px solid var(--border,#dcdcdc);border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.08);' +
      'font:600 14px/1.4 var(--font,"Noto Sans KR",system-ui,sans-serif);letter-spacing:-.2px;word-break:keep-all;}' +
    '.koaus-resume[hidden]{display:none;}' +
    '.koaus-resume .kr-dot{width:8px;height:8px;border-radius:50%;background:var(--text-primary,#111);flex:0 0 auto;margin-top:6px;}' +
    '.koaus-resume .kr-main{flex:1 1 auto;min-width:0;}' +
    '.koaus-resume .kr-text b{font-weight:800;}' +
    '.koaus-resume .kr-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;}' +
    '.koaus-resume .kr-btn{height:34px;padding:0 12px;border:1px solid var(--text-primary,#111);border-radius:var(--r-btn,10px);background:var(--text-primary,#111);color:var(--bg-base,#fff);' +
      'font:700 13px/1 var(--font,"Noto Sans KR",system-ui,sans-serif);letter-spacing:-.2px;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;}' +
    '.koaus-resume .kr-btn.sec{background:transparent;color:var(--text-primary,#111);}' +
    '.koaus-resume .kr-x{flex:0 0 auto;width:34px;height:34px;margin-top:-6px;border:0;background:none;color:var(--text-muted,#777);font-size:15px;cursor:pointer;border-radius:var(--r-btn,10px);}' +
    '@media(max-width:768px){.koaus-resume .kr-btn{height:38px;padding:0 14px;}}' +
    /* 지도 보기 — 지도 바로 뒤의 칸(.koaus-resume-slot). PC: 높이 0 인 칸에서 지도와 같은 크기의 틀(.kr-over, 누름은 통과)을 위로 펼치고,
       카드는 그 틀의 맨 아래 가운데 — sticky 라서 지도의 아래쪽이 화면 밖이면 화면 아래(24px 위)에 붙어 따라온다 */
    '.koaus-resume-slot{position:relative;height:0;}' +
    '.koaus-resume-slot .kr-over{position:absolute;left:0;right:0;bottom:0;height:var(--kr-map-h,560px);display:flex;flex-direction:column;justify-content:flex-end;align-items:center;pointer-events:none;z-index:6;}' +
    '.koaus-resume-slot .koaus-resume{position:sticky;bottom:24px;width:min(400px,calc(100% - 24px));max-width:none;margin:0 0 24px;pointer-events:auto;box-shadow:0 6px 24px rgba(0,0,0,.22);}' +
    /* 모바일(지도가 화면을 채우는 보기): 집 카드가 뜨는 칸 — 지도 아래에 자리를 차지하고 지도는 그만큼만 줄어든다. 집 카드가 열리면 비켜 준다 */
    '@media(max-width:768px){.koaus-resume-slot{height:auto;flex:0 0 auto;}' +
      '.koaus-resume-slot .kr-over{position:static;height:auto;display:block;pointer-events:auto;}' +
      '.koaus-resume-slot .koaus-resume{position:static;width:auto;margin:8px;box-shadow:none;}' +
      '.koaus-resume-slot[data-drawer="1"]{display:none;}}' +
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
  function card(html, onPick, onClose) {
    var el = document.createElement('div');
    el.className = 'koaus-resume';
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', '지난번에 보던 지역');
    el.innerHTML = '<span class="kr-dot" aria-hidden="true"></span>' +
      '<div class="kr-main"><div class="kr-text">' + html + '</div>' +
      '<div class="kr-acts"><button type="button" class="kr-btn" data-v="map">지도로 보기</button><button type="button" class="kr-btn sec" data-v="list">목록으로 보기</button></div></div>' +
      '<button type="button" class="kr-x" aria-label="닫기">✕</button>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (b) { onPick(b.getAttribute('data-v')); return; }
      if (e.target.closest('.kr-x')) onClose();
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
    var rec = saved(board);
    if (!rec || skipped(board, rec)) return;
    try { if (host.active && host.active()) return; } catch (_) {}
    try { if (new URLSearchParams(location.search).get('id')) return; } catch (_) {}   // 글 하나를 바로 여는 주소면 방해하지 않는다
    var html = '지난번에 보던 <b>' + esc(where(rec.label)) + '</b>,<br>이어서 보시겠습니까?';
    var pick = function (v) { hideCards(); try { host.apply(rec, v); } catch (e) { try { console.warn('[koaus-area] 적용 실패', e); } catch (_) {} } };
    var close = function () { skip(board, rec); };
    var lv = document.getElementById('listView'), mv = document.getElementById('mapView');
    if (lv) lv.insertBefore(card(html, pick, close), lv.firstChild);
    if (mv) mountOnMap(mv, card(html, pick, close));
  }

  function boot() {
    try { if (window.__koausAreaHost) initBoard(window.__koausAreaHost); }
    catch (e) { try { console.warn('[koaus-area] 시작 실패', e); } catch (_) {} }
  }

  window.koausArea = { plain: plain, shim: shim, saved: saved, remember: remember, forget: forget, labelFrom: labelFrom, chipText: chipText, chipHint: chipHint, where: where, hideCards: hideCards, TTL: TTL };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
