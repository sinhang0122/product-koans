/* ═══════════════════════════════════════════════════════════════════
   KoAus 모바일 하단 탭바 (전 페이지 공통 · ≤768px 전용)
   ─ 탭: 홈 / 저장 / 최근 본 / 영상 / 채팅 / 마이
   ─ 영상 = settings.html?video=1 (환경설정 영상 섹션 딥링크 — koaus-video-reg.js 가
     ?video=1 감지 시 등록 모달 자동 오픈 + "내 등록 영상" 관리. 등록 진입 발견성 개선)
   ─ 단일 파일: 스타일 주입 + 렌더 + 활성 탭 감지 + 키보드 대응.
     페이지에는 <script src="koaus-tabbar.js" defer> 한 줄만 추가.
   ─ 저장/최근 본 = mypage.html?tab=saved|recent (마이페이지 기존 목록 재사용)
   ─ 채팅 = chat.html (1:1 인앱 채팅, 2026-07 출시) + 안읽음 배지 점(.kt-chat-dot)
     · 배지: LS koaus-chat-unread({n,at}) 즉시 반영 + 페이지 모듈이 브리지한
       koausDb/koausFs 있을 때만 60s 스로틀 쿼리(unreadFor array-contains, limit 1
       = 최대 1 read)로 갱신. 브리지·로그인 없으면 LS 값만, 실패 전부 silent.
       chat.html 자체는 onSnapshot 실시간이라 이 폴링과 무관.
   ─ 프로필 탭(2026-10 ①-3): LS koaus-roles-v1(koaus-role.js) 의 living==='owner'|'both'(집·방 올리기)일 때만
     '최근 본'과 '채팅' 사이에 '프로필'(mypage.html?tab=people — 근처에서 집 구하는 사람 카드) 노출.
     'koaus:roles-changed' 이벤트로 즉시 다시 그림. 집 구하는 사람·비로그인은 5탭 그대로.
   ─ 데스크탑(>768px) 미노출 · admin* 페이지에는 스크립트 미포함
   ─ z-index 900: 모달 오버레이(1000~)보다 아래 — 모달이 탭바를 덮는다.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__koausTabbar) return;
  window.__koausTabbar = true;

  /* ── 스타일 주입 (style.css 이후 로드되므로 동일 특이도에서 우선) ── */
  var css =
    '.koaus-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:900;display:none;' +
      'background:var(--bg-base,#fff);border-top:1px solid var(--border,#e0e0e0);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);}' +
    '.koaus-tabbar .kt-item{position:relative;flex:1 1 0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:3px;height:60px;min-width:0;background:none;border:0;margin:0;padding:0;' +
      'font-family:inherit;font-size:10.5px;font-weight:600;letter-spacing:-.2px;color:#8e8e93;' +
      'text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;' +
      'touch-action:manipulation;user-select:none;-webkit-user-select:none;}' +
    '.koaus-tabbar .kt-item svg{width:23px;height:23px;display:block;}' +
    '.koaus-tabbar .kt-item.kt-active{color:var(--text-primary,#000);}' +
    '.koaus-tabbar .kt-item.kt-active svg *{stroke-width:2.25;}' +
    /* 채팅 안읽음 배지 점 — chat.html(실시간)·아래 refreshUnread(폴링)가 display 토글 */
    '.koaus-tabbar .kt-chat-dot{position:absolute;top:8px;left:calc(50% + 9px);width:8px;height:8px;' +
      'border-radius:50%;background:var(--red,#ef4444);display:none;pointer-events:none;}' +
    '.koaus-tabbar.kt-kb-hidden{display:none !important;}' +
    '@media(max-width:768px){' +
      '.koaus-tabbar{display:flex;}' +
      /* 본문이 탭바에 가리지 않게 + 사이트 토스트(.koaus-toast bottom:32px)를 탭바 위로 */
      'body.koaus-has-tabbar{padding-bottom:calc(60px + env(safe-area-inset-bottom,0px));}' +
      'body.koaus-has-tabbar .koaus-toast{bottom:calc(80px + env(safe-area-inset-bottom,0px));}' +
    '}';

  /* ── 아이콘 (stroke=currentColor — 활성 시 색·굵기만 변경) ── */
  function ico(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"' +
           ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICONS = {
    home:   ico('<path d="M3 10.8 12 3.4l9 7.4"/><path d="M5.4 9.6V20a.8.8 0 0 0 .8.8h11.6a.8.8 0 0 0 .8-.8V9.6"/>'),
    star:   ico('<path d="M12 3.7l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.72l-5.1 2.68.98-5.68-4.13-4.02 5.7-.83L12 3.7z"/>'),
    chat:   ico('<path d="M21 11.4c0 3.98-4.03 7.2-9 7.2-1.02 0-2-.13-2.9-.38L4.3 19.7l1.02-3.1C4.07 15.3 3 13.44 3 11.4 3 7.42 7.03 4.2 12 4.2s9 3.22 9 7.2z"/>'),
    clock:  ico('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6v4.7l3.1 1.85"/>'),
    video:  ico('<rect x="2.6" y="6.6" width="12.2" height="10.8" rx="2.4"/><path d="M14.8 10.2l5-2.6v8.8l-5-2.6z"/>'),
    person: ico('<circle cx="12" cy="8.1" r="3.5"/><path d="M5.3 19.6c.9-3.2 3.5-4.9 6.7-4.9s5.8 1.7 6.7 4.9"/>')
  };

  /* ── 현재 위치 → 활성 탭 판정 ── */
  var qs  = new URLSearchParams(location.search);
  var st  = qs.get('state') || '';
  var tab = (qs.get('tab') || '').toLowerCase();
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase() || 'index.html';
  var isMy = page === 'mypage.html';

  ICONS.people = ico('<circle cx="9" cy="8.3" r="3.1"/><path d="M3.4 19.2c.8-2.9 3-4.4 5.6-4.4s4.8 1.5 5.6 4.4"/><circle cx="16.6" cy="9.4" r="2.5"/><path d="M15.2 14.3c2.6-.3 4.6 1 5.4 3.6"/>');
  function rolesLS() {
    try { var r = JSON.parse(localStorage.getItem('koaus-roles-v1') || 'null'); return r && typeof r === 'object' ? r : {}; } catch (_) { return {}; }
  }
  function buildTabs() {
    var r = rolesLS();
    var tabs = TABS.slice();
    if (r.living === 'owner' || r.living === 'both') {   // 10-20: 둘 다('both')도 올리기
      tabs.splice(3, 0, { key: 'people', label: '프로필', icon: ICONS.people,
        href: 'accom.html?people=1' + (st ? '&state=' + encodeURIComponent(st) : ''),   // 10-20: 마이페이지 탭 대신 쉐어 페이지 위 오버레이
        active: page === 'accom.html' && qs.get('people') === '1' });
    }
    return tabs;
  }
  var TABS = [
    { key: 'home',   label: '홈',      icon: ICONS.home,
      href: 'index.html' + (st ? '?state=' + encodeURIComponent(st) : ''),
      active: page === 'index.html' },
    { key: 'saved',  label: '저장',    icon: ICONS.star,
      href: 'mypage.html?tab=saved',
      active: isMy && tab === 'saved' },
    { key: 'recent', label: '최근 본', icon: ICONS.clock,
      href: 'mypage.html?tab=recent',
      active: isMy && tab === 'recent' },
    /* 2026-10: '영상' 탭 제거(사용자 결정) — 홈 영상 레일과 환경설정의 영상 등록은 그대로.
       복구하려면 { key:'video', label:'영상', icon:ICONS.video, href:'settings.html?video=1', active: page==='settings.html' } 를 되살리면 됨. */
    { key: 'chat',   label: '채팅',    icon: ICONS.chat,
      href: 'chat.html',   /* 1:1 인앱 채팅 (2026-07 출시) */
      active: page === 'chat.html' },
    { key: 'my',     label: '마이',    icon: ICONS.person,
      href: 'mypage.html',
      active: isMy && tab !== 'saved' && tab !== 'recent' && tab !== 'people' }
  ];

  /* ── 미니 토스트 (자급자족 — style.css 의존 없음) ── */
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

  /* ── 채팅 안읽음 배지 (.kt-chat-dot) ──
     · LS koaus-chat-unread = {n, at} — chat.html(실시간 onSnapshot)과 여기(폴링)가 기록.
     · 쿼리는 페이지 모듈이 브리지한 koausDb/koausFs 로만 실행 (App Check init 기초 위) —
       브리지·로그인 없는 페이지(정적 페이지 등)는 LS 값만 표시. 실패 전부 silent.
     · 60s LS 스로틀 — 페이지 이동마다 재쿼리 방지. limit(1) = 호출당 최대 1 read.
       rules 의 chats list `uid in unreadFor` disjunct 가 이 쿼리의 provability 근거. */
  var LS_UNREAD = 'koaus-chat-unread';
  function readUnreadLS() {
    try {
      var v = JSON.parse(localStorage.getItem(LS_UNREAD) || 'null');
      return (v && typeof v.n === 'number') ? v : null;
    } catch (_) { return null; }
  }
  function paintDot(on) {
    var d = document.querySelector('.koaus-tabbar .kt-chat-dot');
    if (d) d.style.display = on ? 'block' : 'none';
  }
  function refreshUnread() {
    var cached = readUnreadLS();
    paintDot(!!(cached && cached.n > 0));
    if (cached && Date.now() - (cached.at || 0) < 60 * 1000) return;   // 60s 스로틀
    var user = window.koausAuth && window.koausAuth.user;
    var db = window.koausDb, fs = window.koausFs;
    if (!user || !user.uid || !db || !fs ||
        !fs.collection || !fs.query || !fs.where || !fs.limit || !fs.getDocs) return;
    try {
      fs.getDocs(fs.query(fs.collection(db, 'chats'),
                          fs.where('unreadFor', 'array-contains', user.uid), fs.limit(1)))
        .then(function (snap) {
          var n = (snap && snap.size) ? 1 : 0;
          try { localStorage.setItem(LS_UNREAD, JSON.stringify({ n: n, at: Date.now() })); } catch (_) {}
          paintDot(n > 0);
        })
        .catch(function () {});
    } catch (_) {}
  }

  function init() {
    if (!document.body || document.querySelector('.koaus-tabbar')) return;

    var style = document.createElement('style');
    style.id = 'koaus-tabbar-style';
    style.textContent = css;
    document.head.appendChild(style);

    var bar = document.createElement('nav');
    bar.className = 'koaus-tabbar';
    bar.setAttribute('aria-label', '하단 메뉴');

    function paintItems() {
    bar.innerHTML = '';
    buildTabs().forEach(function (t) {
      var el;
      if (t.href) {
        el = document.createElement('a');
        el.href = t.href;
        if (t.active) {
          el.setAttribute('aria-current', 'page');
          /* 활성 탭 재탭 = 최상단 스크롤 (앱 관례) */
          el.addEventListener('click', function (e) {
            e.preventDefault();
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
          });
        }
      } else {
        el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', function () {
          toast('1:1 채팅 기능을 준비 중이에요');
          /* 출시 전 수요 측정 */
          try { if (typeof gtag === 'function') gtag('event', 'tabbar_chat_tap'); } catch (_) {}
        });
      }
      el.className = 'kt-item' + (t.active ? ' kt-active' : '');
      el.innerHTML = t.icon + '<span>' + t.label + '</span>';
      if (t.key === 'chat') {
        var dot = document.createElement('span');
        dot.className = 'kt-chat-dot';
        el.appendChild(dot);
      }
      bar.appendChild(el);
    });
    }
    paintItems();
    document.addEventListener('koaus:roles-changed', function () { paintItems(); refreshUnread(); });

    document.body.appendChild(bar);
    document.body.classList.add('koaus-has-tabbar');

    /* 채팅 배지 — LS 즉시 반영 + auth/브리지 초기화가 늦으므로 3s 재시도 + 90s 폴링 */
    refreshUnread();
    setTimeout(refreshUnread, 3000);
    setInterval(function () {
      if (document.visibilityState === 'visible') refreshUnread();
    }, 90 * 1000);

    /* ── 모바일 Map View 풀스크린 동기화 ──
       8개 보드의 switchView() 가 #mapView 의 style.display 를 토글하므로
       그 속성 변화를 관찰해 body.koaus-map-active 를 중앙에서 켜고 끈다.
       (style.css 의 풀스크린 블록이 이 클래스로 발동 — 페이지별 코드 무수정) */
    var mv = document.getElementById('mapView');
    if (mv) {
      var syncMap = function () {
        document.body.classList.toggle('koaus-map-active', mv.style.display !== 'none');
      };
      syncMap();
      new MutationObserver(syncMap).observe(mv, { attributes: true, attributeFilter: ['style'] });
    }

    /* ── 모바일 키보드가 올라오면 탭바 숨김 (입력 폼 가림 방지) ── */
    var FOCUSABLE = 'input, textarea, select, [contenteditable]';
    document.addEventListener('focusin', function (e) {
      if (e.target && e.target.closest && e.target.closest(FOCUSABLE)) bar.classList.add('kt-kb-hidden');
    });
    document.addEventListener('focusout', function () {
      setTimeout(function () {
        var a = document.activeElement;
        if (!a || !a.closest || !a.closest(FOCUSABLE)) bar.classList.remove('kt-kb-hidden');
      }, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
