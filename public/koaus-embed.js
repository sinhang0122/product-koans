/* ═══════════════════════════════════════════════════════════════════
   KoAus 임베드 모드 (2026-10 홈 개편) — care.html · calculator.html 전용
   ─ 홈(index.html)의 Care / 환율 드롭다운이 이 두 페이지를 같은 출처 iframe 으로
     `care.html?embed=1` 처럼 불러온다. 페이지 자체는 그대로 두고(삭제 0) 임베드일 때만
     상단바·사이드바·히어로·전광판·페이지 헤더·푸터·탭바를 CSS 로 숨긴다
     (style.css `html.koaus-embed …`).
   ─ 조건: ?embed=1 이고 "실제로 iframe 안"일 때만. 주소창에 직접 열면 평소 페이지 그대로.
   ─ 하는 일: ① <html class="koaus-embed"> (본문 파싱 전, 깜빡임 방지 — head 에서 동기 로드)
             ② 링크 클릭 → 부모 창(_top)에서 열기 (새 탭 링크·#앵커·tel:·mailto: 는 그대로)
             ③ 콘텐츠 높이를 부모에 postMessage → 부모가 iframe 높이를 맞춘다(내부 스크롤 없음)
   ─ 다른 스크립트의 임베드 가드: hero-banner.js · marquee.js (배너/전광판 fetch 생략),
     session-timeout.js (iframe 쪽 1시간 자동 로그아웃 타이머 생략),
     koaus-phone-auth.js (휴대폰 인증 강제 모달은 부모 페이지가 담당).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  if (q.get('embed') !== '1') return;
  var inFrame = false;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  if (!inFrame) return;

  var html = document.documentElement;
  html.classList.add('koaus-embed');
  window.__koausEmbed = true;

  var lastH = 0;
  function post(force) {
    var h = 0;
    try {
      var b = document.body;
      h = Math.max(b.scrollHeight, b.offsetHeight, Math.ceil(b.getBoundingClientRect().height));
    } catch (e) { return; }
    if (!h || (!force && h === lastH)) return;
    lastH = h;
    try {
      window.parent.postMessage({ type: 'koaus-embed-height', height: h, path: location.pathname }, location.origin);
    } catch (e) {}
  }

  function ready() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      var a = t && t.closest ? t.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(javascript|tel|sms|mailto):/i.test(href)) return;
      if (!a.target || a.target === '_self') a.target = '_top';
    }, true);

    post(true);
    if (window.ResizeObserver) {
      try { new ResizeObserver(function () { post(false); }).observe(document.body); } catch (e) {}
    }
    // 폰트 로드·이미지·details 펼침 등 ResizeObserver 가 놓치는 경우 보강
    window.addEventListener('load', function () { post(true); setTimeout(function () { post(true); }, 400); });
    document.addEventListener('toggle', function () { setTimeout(function () { post(false); }, 50); }, true);
    setInterval(function () { post(false); }, 1500);
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin) return;
      if (e.data && e.data.type === 'koaus-embed-ping') post(true);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
