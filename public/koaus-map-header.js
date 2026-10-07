/* ═══════════════════════════════════════════════════════════════════
   KoAus 지도 풀스크린 상단 헤더 (8개 보드 공통 · ≤768px 전용)
   ─ 노출 조건: body.koaus-map-active (koaus-tabbar.js 의 #mapView
     감시자가 토글) — 목록 뷰·데스크탑에서는 완전 미노출.
   ─ 구조(스케치 2):
       1행  [← 뒤로가기] [섹션 이동 아코디언 ▾] [☰ 햄버거(topbar 동일 38px)]
       2행  [상세 필터 50%] [목록 | 지도 토글 50%]
     그 아래 지도 꽉 참(style.css: #mapView top = env+96px) —
     '이 지역 검색'은 페이지 JS 기존 동작(지도 이동 시 .show) 그대로.
   ─ 전부 프록시: 필터→#filterModalBtn, 목록→#viewListBtn,
     햄버거→#hamburgerBtn — 보드 페이지 코드 무수정.
   ─ 아코디언 이동 시 대상 보드 view pref('koaus-view-<board>')를
     'map' 으로 선세팅 → 지도 상태 그대로 섹션 점프.
   ─ z-index: 헤더 925 (지도 920 위 · 사이드바 1000+/모달 1000+ 아래),
     아코디언 백드롭 924.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__koausMapHeader) return;
  window.__koausMapHeader = true;

  /* ── 현재 보드 타이틀 (헤더 1행 표기 — Map View 보유 8개 전부) ── */
  var PAGE_META = {
    accom:       ['🏠', '쉐어'],
    rent:        ['🔑', '렌트'],
    jobs:        ['💼', '구인구직'],
    auto:        ['🚗', '중고차판매'],
    restaurants: ['🍽️', '맛집'],
    salon:       ['💈', '뷰티'],
    gp:          ['🏥', '병원'],
    trades:      ['🔧', '기술자']
  };
  /* ── 아코디언 항목 (섹션 이동) — Life = 맛집·뷰티·병원·기술자 통합 섹션(예정),
        출시 전 잠금: 진입 차단 + 준비 중 토스트 ── */
  var ITEMS = [
    { id: 'accom', ico: '🏠', label: '쉐어' },
    { id: 'rent',  ico: '🔑', label: '렌트' },
    { id: 'jobs',  ico: '💼', label: '구인구직' },
    { id: 'auto',  ico: '🚗', label: '중고차판매', extra: 'category=used' },
    { id: null,    ico: '🌱', label: 'Life', sub: '맛집·뷰티·병원·기술자', locked: true }
  ];

  var page = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '').toLowerCase();
  var st = new URLSearchParams(location.search).get('state') || '';
  var cur = PAGE_META[page] || null;

  /* ── 스타일 주입 ── */
  var css =
    '.koaus-maphead{position:fixed;top:0;left:0;right:0;z-index:925;display:none;' +
      'background:var(--bg-base,#fff);border-bottom:1px solid var(--border,#e0e0e0);' +
      'padding-top:env(safe-area-inset-top,0px);font-family:inherit;}' +
    '.kmh-row1{display:flex;align-items:center;gap:6px;height:50px;padding:0 8px;}' +
    '.kmh-icon-btn{flex:0 0 38px;width:38px;height:38px;display:flex;align-items:center;' +
      'justify-content:center;background:none;border:1px solid var(--border,#e0e0e0);' +
      'border-radius:var(--r-sm,6px);color:var(--text-primary,#111);cursor:pointer;padding:0;' +
      '-webkit-tap-highlight-color:transparent;touch-action:manipulation;}' +
    '.kmh-icon-btn svg{width:21px;height:21px;display:block;}' +
    '.kmh-back{border:0;}' +
    '.kmh-section{flex:1 1 auto;min-width:0;display:flex;align-items:center;justify-content:center;' +
      'gap:6px;height:38px;background:none;border:0;cursor:pointer;padding:0;' +
      'font-family:inherit;font-size:16.5px;font-weight:800;letter-spacing:-.3px;' +
      'color:var(--text-primary,#111);-webkit-tap-highlight-color:transparent;}' +
    '.kmh-section .kmh-ico{font-size:17px;filter:grayscale(1) contrast(1.05);}' +
    '.kmh-chev{width:16px;height:16px;transition:transform .18s;}' +
    '.kmh-section[aria-expanded="true"] .kmh-chev{transform:rotate(180deg);}' +
    '.kmh-row2{display:flex;align-items:stretch;height:46px;border-top:1px solid var(--border,#e0e0e0);}' +
    '.kmh-filter{flex:1 1 50%;min-width:0;display:flex;align-items:center;justify-content:center;gap:7px;' +
      'background:none;border:0;border-right:1px solid var(--border,#e0e0e0);cursor:pointer;' +
      'font-family:inherit;font-size:13.5px;font-weight:700;letter-spacing:-.2px;' +
      'color:var(--text-primary,#111);-webkit-tap-highlight-color:transparent;}' +
    '.kmh-filter svg{width:16px;height:16px;}' +
    '.kmh-toggle{flex:1 1 50%;min-width:0;display:flex;gap:5px;padding:6px 8px;}' +
    '.kmh-tab{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;' +
      'background:none;border:1px solid var(--border,#e0e0e0);border-radius:8px;cursor:pointer;' +
      'font-family:inherit;font-size:13px;font-weight:700;letter-spacing:-.2px;' +
      'color:var(--text-secondary,#555);-webkit-tap-highlight-color:transparent;}' +
    '.kmh-tab.kmh-active{background:var(--accent,#000);border-color:var(--accent,#000);' +
      'color:var(--accent-text,#fff);}' +
    '.kmh-drop{position:absolute;top:100%;left:0;right:0;background:var(--bg-base,#fff);' +
      'border-bottom:1px solid var(--border,#e0e0e0);box-shadow:0 14px 30px rgba(0,0,0,.18);' +
      'max-height:min(62vh,430px);overflow-y:auto;}' +
    '.kmh-drop-item{display:flex;align-items:center;gap:11px;width:100%;height:46px;padding:0 16px;' +
      'background:none;border:0;border-top:1px solid var(--border,#eee);cursor:pointer;' +
      'text-decoration:none;color:var(--text-primary,#111);font-family:inherit;font-size:14.5px;' +
      'font-weight:600;letter-spacing:-.2px;text-align:left;' +
      '-webkit-tap-highlight-color:transparent;}' +
    '.kmh-drop-item:first-child{border-top:0;}' +
    '.kmh-drop-item .kmh-ico{font-size:17px;filter:grayscale(1) contrast(1.05);}' +
    '.kmh-drop-item.kmh-cur{font-weight:800;}' +
    '.kmh-drop-item .kmh-check{margin-left:auto;font-weight:800;}' +
    '.kmh-drop-item.kmh-locked{color:var(--text-muted,#8e8e93);}' +
    '.kmh-sub{font-size:11px;font-weight:600;color:var(--text-muted,#8e8e93);margin-left:5px;letter-spacing:-.2px;}' +
    '.kmh-soon{margin-left:auto;font-size:11px;font-weight:700;color:var(--text-muted,#8e8e93);' +
      'border:1px solid var(--border,#e0e0e0);border-radius:999px;padding:2.5px 9px;}' +
    '.kmh-backdrop{position:fixed;inset:0;z-index:924;background:rgba(0,0,0,.35);}' +
    '@media(min-width:769px){.koaus-maphead,.kmh-backdrop{display:none !important;}}' +
    '@media(max-width:768px){body.koaus-map-active .koaus-maphead{display:block;}}';

  /* ── 아이콘 ── */
  function ico(paths, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '"' +
           ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var I_BACK = ico('<path d="M15.5 4.5 8 12l7.5 7.5"/>', 2.2);
  var I_MENU = ico('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>', 2);
  var I_CHEV = '<svg class="kmh-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5 12 15.5 18 9.5"/></svg>';
  var I_FILT = ico('<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.1" fill="var(--bg-base,#fff)"/><line x1="4" y1="15.5" x2="20" y2="15.5"/><circle cx="15" cy="15.5" r="2.1" fill="var(--bg-base,#fff)"/>', 2);

  function withState(href) { return href + (st ? '?state=' + encodeURIComponent(st) : ''); }

  /* ── 미니 토스트 (자급자족 — koaus-tabbar.js 와 동일 스타일) ── */
  function toast(msg) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText =
        'position:fixed;left:50%;transform:translateX(-50%);' +
        'bottom:calc(80px + env(safe-area-inset-bottom,0px));' +
        'background:rgba(17,24,39,.94);color:#fff;padding:11px 18px;border-radius:22px;' +
        'font-size:14px;font-weight:700;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.25);' +
        'max-width:86vw;text-align:center;pointer-events:none;opacity:0;transition:opacity .18s;';
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = '1'; });
      setTimeout(function () {
        t.style.opacity = '0';
        setTimeout(function () { try { document.body.removeChild(t); } catch (_) {} }, 240);
      }, 1700);
    } catch (_) {}
  }

  function init() {
    if (!document.body || !document.getElementById('mapView') || document.querySelector('.koaus-maphead')) return;

    var style = document.createElement('style');
    style.id = 'koaus-maphead-style';
    style.textContent = css;
    document.head.appendChild(style);

    var head = document.createElement('div');
    head.className = 'koaus-maphead';

    /* 1행 */
    var row1 = document.createElement('div');
    row1.className = 'kmh-row1';

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'kmh-icon-btn kmh-back';
    back.setAttribute('aria-label', '뒤로가기');
    back.innerHTML = I_BACK;
    back.addEventListener('click', function () {
      if (history.length > 1) history.back();
      else location.href = withState('index.html');
    });

    var sect = document.createElement('button');
    sect.type = 'button';
    sect.className = 'kmh-section';
    sect.setAttribute('aria-expanded', 'false');
    sect.setAttribute('aria-haspopup', 'true');
    /* PAGE_META 는 [아이콘, 라벨] 2칸 — 옛 cur[1]/cur[2] 참조는 아이콘 자리에 라벨,
       타이틀 자리에 "undefined" 가 찍히던 버그 (2026-07 수정) */
    sect.innerHTML =
      (cur ? '<span class="kmh-ico" aria-hidden="true">' + cur[0] + '</span>' : '') +
      '<span class="kmh-title">' + (cur ? cur[1] : '섹션') + '</span>' + I_CHEV;

    var menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'kmh-icon-btn kmh-menu';
    menu.setAttribute('aria-label', '메뉴 열기');
    menu.innerHTML = I_MENU;
    menu.addEventListener('click', function () {
      var hb = document.getElementById('hamburgerBtn');
      if (hb) hb.click();
    });

    row1.appendChild(back); row1.appendChild(sect); row1.appendChild(menu);

    /* 2행 — 상세 필터 | 목록/지도 */
    var row2 = document.createElement('div');
    row2.className = 'kmh-row2';

    var filt = document.createElement('button');
    filt.type = 'button';
    filt.className = 'kmh-filter';
    filt.innerHTML = I_FILT + '<span>상세 필터</span>';
    filt.addEventListener('click', function () {
      closeDrop();
      var fb = document.getElementById('filterModalBtn');
      if (fb) fb.click();
    });

    var tog = document.createElement('div');
    tog.className = 'kmh-toggle';
    tog.setAttribute('role', 'group');
    tog.setAttribute('aria-label', '보기 전환');

    var tList = document.createElement('button');
    tList.type = 'button';
    tList.className = 'kmh-tab';
    tList.textContent = '목록';
    tList.addEventListener('click', function () {
      closeDrop();
      var lb = document.getElementById('viewListBtn');
      if (lb) lb.click();   /* switchView('list') → 감시자가 헤더 자동 숨김 */
    });

    var tMap = document.createElement('button');
    tMap.type = 'button';
    tMap.className = 'kmh-tab kmh-active';
    tMap.textContent = '지도';
    tMap.setAttribute('aria-current', 'true');

    tog.appendChild(tList); tog.appendChild(tMap);
    row2.appendChild(filt); row2.appendChild(tog);

    /* 섹션 아코디언 드롭다운 */
    var drop = document.createElement('div');
    drop.className = 'kmh-drop';
    drop.hidden = true;
    ITEMS.forEach(function (b) {
      var el, isCur = b.id && b.id === page;
      if (b.locked) {
        /* Life(맛집·뷰티·병원·기술자 통합 섹션) — 출시 전 진입 차단: 준비 중 토스트 + GA 수요 측정 */
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'kmh-drop-item kmh-locked';
        el.innerHTML = '<span class="kmh-ico" aria-hidden="true">' + b.ico + '</span>' +
                       '<span>' + b.label +
                         (b.sub ? '<span class="kmh-sub">' + b.sub + '</span>' : '') + '</span>' +
                       '<span class="kmh-soon">준비 중</span>';
        el.addEventListener('click', function () {
          toast('Life(맛집·뷰티·병원·기술자) 통합 섹션을 준비 중이에요');
          try { if (typeof gtag === 'function') gtag('event', 'maphead_life_tap'); } catch (_) {}
        });
      } else {
        el = document.createElement('a');
        el.className = 'kmh-drop-item' + (isCur ? ' kmh-cur' : '');
        var q = [];
        if (st) q.push('state=' + encodeURIComponent(st));
        if (b.extra) q.push(b.extra);
        el.href = b.id + '.html' + (q.length ? '?' + q.join('&') : '');
        el.innerHTML = '<span class="kmh-ico" aria-hidden="true">' + b.ico + '</span>' +
                       '<span>' + b.label + '</span>' +
                       (isCur ? '<span class="kmh-check" aria-hidden="true">✓</span>' : '');
        el.addEventListener('click', function () {
          /* 지도 상태 그대로 섹션 점프 — 대상 보드 view pref 선세팅 */
          try { localStorage.setItem('koaus-view-' + b.id, 'map'); } catch (_) {}
        });
      }
      drop.appendChild(el);
    });

    var backdrop = document.createElement('div');
    backdrop.className = 'kmh-backdrop';
    backdrop.hidden = true;

    function openDrop() {
      drop.hidden = false; backdrop.hidden = false;
      sect.setAttribute('aria-expanded', 'true');
    }
    function closeDrop() {
      drop.hidden = true; backdrop.hidden = true;
      sect.setAttribute('aria-expanded', 'false');
    }
    sect.addEventListener('click', function () { drop.hidden ? openDrop() : closeDrop(); });
    backdrop.addEventListener('click', closeDrop);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrop(); });

    head.appendChild(row1); head.appendChild(row2); head.appendChild(drop);
    document.body.appendChild(backdrop);
    document.body.appendChild(head);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
