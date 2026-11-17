/* ═══════════════════════════════════════════════════════════════════
   KoAus 모달 배경 스크롤 잠금 (2026-10-19) — 전 페이지 공통
   ─ 증상: 상세 필터·글쓰기·상세·사이드바 등 모달이 떠 있는데 뒤 목록이 휠/터치로 같이 움직임.
     각 모달은 `document.body.style.overflow='hidden'` 만 거는데, 실제 문서 스크롤러는 html(documentElement)이라
     body 만으로는 안 잠긴다(2026-06 `:has()` CSS 잠금은 일반 스크롤까지 죽여 41c89bc 에서 전부 되돌림).
   ─ 방식: 페이지 코드 수정 없이 body 의 inline style 변화를 지켜보다가
       · overflow:hidden 이 걸리면 → html 에도 overflow:hidden + 스크롤바 폭만큼 body padding-right(가로 흔들림 방지),
         터치 기기에선 body position:fixed(top:-scrollY) 로 iOS 배경 스크롤까지 차단
       · 풀리면(''/visible) → 전부 원복 + 원래 위치로 scrollTo
     모달 자체(.filter-modal 등 overflow:auto 컨테이너)는 그대로 스크롤된다.
   ─ body.koaus-map-active(지도 풀스크린, 클래스 기반)는 건드리지 않음. 되돌리려면 이 스크립트 한 줄만 빼면 됨.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__koausScrollLock) return;
  window.__koausScrollLock = true;

  var locked = false, savedY = 0, savedPad = '', touch = false;
  try { touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}

  function lock() {
    if (locked) return;
    locked = true;
    var html = document.documentElement, body = document.body;
    savedY = window.scrollY || html.scrollTop || 0;
    var sbw = window.innerWidth - html.clientWidth;   // 세로 스크롤바 폭(모바일 0)
    savedPad = body.style.paddingRight;
    html.style.overflow = 'hidden';
    if (sbw > 0) body.style.paddingRight = sbw + 'px';
    if (touch) {
      body.style.position = 'fixed';
      var z = parseFloat(html.style.zoom) || 1;
      body.style.top = (-savedY / z) + 'px';   // 11-15: 글자 크게(zoom) 배율 보정
      html.classList.add('koaus-sl-touch');
      body.style.left = '0'; body.style.right = '0'; body.style.width = '100%';
    }
    html.classList.add('koaus-scroll-locked');
  }
  function unlock() {
    if (!locked) return;
    locked = false;
    var html = document.documentElement, body = document.body;
    html.style.overflow = '';
    body.style.paddingRight = savedPad;
    if (touch) {
      body.style.position = ''; body.style.top = ''; body.style.left = ''; body.style.right = ''; body.style.width = '';
      // 11-15: 'instant' — html{scroll-behavior:smooth} 때문에 닫을 때마다 맨 위에서 훑어 내려가던 것
      try { window.scrollTo({ top: savedY, left: 0, behavior: 'instant' }); } catch (e) { try { window.scrollTo(0, savedY); } catch (e2) {} }
      html.classList.remove('koaus-sl-touch');
    }
    html.classList.remove('koaus-scroll-locked');
  }
  // 11-15(모바일 점검): body 에 overflow:hidden 을 걸지 않는 창도 떠 있으면 잠근다 —
  //   구인구직(jobs.html) 글쓰기·상세 필터·글 상세, 영상 등록 창이 뒤 목록과 같이 움직였다.
  //   창 클래스는 전 페이지 공통(.write-overlay/.filter-overlay/.post-detail-overlay + .open). 영상 등록 창은 열릴 때만 문서에 있다.
  var OVERLAYS = '.write-overlay.open, .filter-overlay.open, .post-detail-overlay.open, .kv-reg-overlay';
  function overlayOpen() { try { return !!document.querySelector(OVERLAYS); } catch (e) { return false; } }
  function sync() {
    var v = (document.body && document.body.style.overflow) || '';
    if (v === 'hidden' || overlayOpen()) lock(); else unlock();
  }
  var pending = false;
  function syncSoon() {
    if (pending) return; pending = true;
    (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () { pending = false; sync(); });
  }

  function init() {
    if (!document.body) return;
    try {   // 11-15: 터치 잠금 중 구글 주소 자동완성 목록 위치 보정
      var st = document.createElement('style'); st.id = 'koaus-scroll-lock-style';
      st.textContent = 'html.koaus-sl-touch .pac-container{position:fixed!important;}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
    try {
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['style'] });
      // 창이 열리고 닫힐 때(class 변화 · 영상 등록 창 추가/삭제)
      new MutationObserver(syncSoon).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
