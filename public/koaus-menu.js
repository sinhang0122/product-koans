/* ═══════════════════════════════════════════════════════════════════
   KoAus 햄버거 메뉴 2차 (2026-10 홈 개편 1단계) — 전 페이지 공통
   ─ 기존 주(State)별 아코디언(NSW…NT × Living/Work/Auto/Others)과 하단 직접 링크
     (.accord-foot-group)는 "삭제하지 않고 숨김". MENU_FLAT_ENABLED=false 로 되돌리면
     이 파일은 아무것도 하지 않고 옛 메뉴가 그대로 보인다(마크업 무손실).
   ─ 새 메뉴 5개: 집 구하기 · 구인구직 · 케어 · 문의 · 파워볼 당첨번호
     · 주(State) 선택 단계 없음 — accom.html / jobs.html 은 ?state 없이 전체 주 노출
       (각 페이지의 지역 검색·필터가 주 선택을 대신한다)
   ─ 페이지에는 <script src="koaus-menu.js" defer> 한 줄만 추가 (id="sidebar" 가 있는 31곳).
     사이드바 헤더(브랜드·내 계정·닫기)·설정·계정 영역은 그대로 둔다.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MENU_FLAT_ENABLED = true;          // false → 옛 주별 아코디언 메뉴로 즉시 복귀
  if (!MENU_FLAT_ENABLED || window.__koausMenu) return;
  window.__koausMenu = true;

  var ITEMS = [
    { key: 'living',    href: 'accom.html',     label: '집 구하기',       sub: '쉐어 · 렌트',
      match: ['accom.html', 'rent.html'],
      icon: '<path d="M3 11 12 3.8 21 11"/><path d="M5.4 9.7V20h13.2V9.7"/><path d="M10 20v-5.6h4V20"/>' },
    { key: 'jobs',      href: 'jobs.html',      label: '구인구직',        sub: '일자리 · 사람',
      match: ['jobs.html', 'jobs-info.html'],
      icon: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.2"/><path d="M8.5 7.5V5.6A1.6 1.6 0 0 1 10.1 4h3.8a1.6 1.6 0 0 1 1.6 1.6v1.9"/><path d="M3 12.5h18"/>' },
    { key: 'care',      href: 'care.html',      label: '케어',            sub: '긴급 연락처 · 무료 통역 · 상비약',
      match: ['care.html', 'emergency.html', 'gp.html'],
      icon: '<path d="M12 20.6s-7.4-4.6-7.4-10.2A4.1 4.1 0 0 1 12 8.1a4.1 4.1 0 0 1 7.4 2.3c0 5.6-7.4 10.2-7.4 10.2z"/><path d="M12 10.6v4.2M9.9 12.7h4.2"/>' },
    { key: 'contact',   href: 'contact.html',   label: '문의',            sub: 'Inquiry',
      match: ['contact.html'],
      icon: '<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="m3.6 7 8.4 6 8.4-6"/>' },
    { key: 'powerball', href: 'powerball.html', label: '파워볼 당첨번호', sub: 'Powerball',
      match: ['powerball.html'],
      icon: '<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.3c.3-1.1 1.2-1.7 2.4-1.7 1.4 0 2.4.9 2.4 2.1 0 1.9-2.6 2-2.6 3.9"/><circle cx="12" cy="16.6" r=".7" fill="currentColor" stroke="none"/>' }
  ];

  var css =
    '.sidebar.koaus-menu-flat .sidebar-nav > .accord-item,' +
    '.sidebar.koaus-menu-flat .sidebar-nav > .accord-foot-group{display:none !important;}' +
    '.koaus-menu-list{display:flex;flex-direction:column;padding:6px 0 10px;}' +
    '.koaus-menu-list .km-link{display:flex;align-items:center;gap:14px;padding:15px 20px;' +
      'color:#fff;text-decoration:none;border-bottom:1px solid #111;font-family:var(--font);' +
      'transition:background .12s;-webkit-tap-highlight-color:transparent;}' +
    '.koaus-menu-list .km-link:hover{background:#0a0a0a;}' +
    '.koaus-menu-list .km-ico{flex:0 0 auto;width:38px;height:38px;border-radius:11px;background:#111;' +
      'border:1px solid #222;display:flex;align-items:center;justify-content:center;color:#fff;}' +
    '.koaus-menu-list .km-ico svg{width:21px;height:21px;display:block;}' +
    '.koaus-menu-list .km-text{display:flex;flex-direction:column;gap:3px;min-width:0;}' +
    '.koaus-menu-list .km-label{font-size:19px;font-weight:800;line-height:1.15;letter-spacing:-.01em;}' +
    '.koaus-menu-list .km-sub{font-size:12px;font-weight:500;color:#9a9a9a;line-height:1.3;}' +
    '.koaus-menu-list .km-arrow{margin-left:auto;color:#555;flex:0 0 auto;}' +
    '.koaus-menu-list .km-link.km-active{background:#0d0d0d;}' +
    '.koaus-menu-list .km-link.km-active .km-ico{background:#fff;color:#000;border-color:#fff;}' +
    '.koaus-menu-list .km-link.km-active .km-arrow{color:#fff;}';

  function ico(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"' +
           ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  function currentFile() {
    var p = (location.pathname || '').split('/').pop().toLowerCase();
    return p || 'index.html';
  }

  function build() {
    var sidebar = document.getElementById('sidebar');
    var nav = sidebar && sidebar.querySelector('.sidebar-nav');
    if (!nav || nav.querySelector('.koaus-menu-list')) return;

    var st = document.createElement('style');
    st.id = 'koaus-menu-style';
    st.textContent = css;
    document.head.appendChild(st);

    var here = currentFile();
    var list = document.createElement('div');
    list.className = 'koaus-menu-list';
    list.setAttribute('role', 'list');
    list.innerHTML = ITEMS.map(function (it) {
      var active = it.match.indexOf(here) !== -1;
      return '<a class="km-link' + (active ? ' km-active' : '') + '" href="' + it.href + '" role="listitem"' +
             (active ? ' aria-current="page"' : '') + '>' +
               '<span class="km-ico">' + ico(it.icon) + '</span>' +
               '<span class="km-text"><span class="km-label">' + it.label + '</span>' +
               '<span class="km-sub">' + it.sub + '</span></span>' +
               '<svg class="km-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' +
             '</a>';
    }).join('');

    nav.insertBefore(list, nav.firstChild);
    sidebar.classList.add('koaus-menu-flat');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
