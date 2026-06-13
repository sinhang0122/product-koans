// ════════════════════════════════════════════════════════════════════
//  KoAus · 찜(★/저장) 로그인 게이트 — 전역 capture-phase 가드 (사이트 공통)
//  · 문제: 찜은 기기-로컬(localStorage) 저장이라 비로그인도 그냥 체크됨 →
//    "저장했다"고 믿게 만드는 가짜 체크(신뢰 훼손). koaus-report.js 와 동일한
//    capture-phase 위임으로 비로그인 클릭을 페이지 토글 핸들러 도달 전에 차단.
//  · 대상: 목록 grid·지도 drawer 의 .bookmark-btn + 상세 모달 #detailSaveBtn / #detailSaveBtn2
//  · 로그인 상태면 통과(기존 토글 정상). 비로그인이면 차단 + 로그인 모달.
//  · ⚠️ 찜/저장류 신규 UI 는 반드시 이 게이트를 거치게 둘 것 (페이지별 자체 우회 금지).
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausSaveGuard) return;
  window.__koausSaveGuard = true;

  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest &&
      e.target.closest('.bookmark-btn, #detailSaveBtn, #detailSaveBtn2');
    if (!btn) return;
    const user = window.koausAuth && window.koausAuth.user;
    if (user) return;  // 로그인 상태 → 페이지 토글 핸들러로 정상 통과

    // 비로그인 — 페이지 핸들러 도달 전 차단 (capture + stopPropagation)
    e.preventDefault();
    e.stopPropagation();
    try {
      if (window.koausAuth && typeof window.koausAuth.openAuthModal === 'function') {
        window.koausAuth.openAuthModal();
      } else {
        alert('저장하려면 로그인이 필요합니다.');
      }
    } catch (_) {
      alert('저장하려면 로그인이 필요합니다.');
    }
  }, true);  // ← capture phase (target 의 onclick/bubble 핸들러보다 먼저)
})();
