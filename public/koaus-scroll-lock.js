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
      body.style.top = (-savedY) + 'px';
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
      try { window.scrollTo(0, savedY); } catch (e) {}
    }
    html.classList.remove('koaus-scroll-locked');
  }
  function sync() {
    var v = (document.body && document.body.style.overflow) || '';
    if (v === 'hidden') lock(); else unlock();
  }

  function init() {
    if (!document.body) return;
    try {
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['style'] });
    } catch (e) {}
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
