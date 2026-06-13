// ════════════════════════════════════════════════════════════════════
//  KoAus · 상세 지도 "확대" 버튼 → 외부 구글맵 직행 (전 보드 공용)
//  · 확대 클릭 시 구글 지도 앱/웹으로 이동 — 주변 카페·교통편 함께 보는 "둘러보기" 동선.
//  · capture-phase 위임 — 보드마다 제각각이던 옛 바인딩(requestFullscreen·인페이지 모달)을
//    가로채(stopPropagation) 동작 통일. 개별 보드 옛 핸들러 제거 불필요.
//  · 공개 글: 정확 좌표(lat,lng)로 / 위치 비공개 글: suburb(동네) 검색으로 — 정확 주소·
//    랜덤 오프셋 좌표는 절대 노출 안 함(둘러보기는 동네 수준이라 유효). 길찾기·스트릿뷰는
//    비공개에서 숨김 유지(정확 위치 필요 기능이라 별개).
//  · 대상 보드(확대 버튼 보유): accom/rent/jobs/auto/gp/restaurants/salon/trades.
//    데이터: window.currentDetailPost (상세 열 때 보드가 설정).
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausMapExpand) return;
  window.__koausMapExpand = true;

  // suburb 수준 질의 — 쉼표 분할 마지막 세그먼트(동네+주+우편번호), 도로명·번지 제외.
  //   "12 Smith St, Strathfield NSW 2135" → "Strathfield NSW 2135"
  //   "Strathfield NSW"(이미 마스킹) → 그대로
  function suburbQuery(addr) {
    if (!addr) return '';
    const parts = String(addr).split(',').map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  }

  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest &&
      e.target.closest('#detailMapFullscreenBtn, #detailMapExpand, .fullscreen-btn, .rea-map-expand');
    if (!btn) return;
    // 옛 바인딩(requestFullscreen·인페이지 모달)보다 먼저 가로채 통일
    e.preventDefault();
    e.stopPropagation();
    const p = window.currentDetailPost;
    if (!p) return;
    let q = '';
    if (p.locationPrivate) {
      // 비공개 — 동네(suburb)만. 오프셋 좌표(p.lat/lng)·정확주소 사용 금지.
      q = suburbQuery(p.address || p.region || '');
    } else if (p.lat && p.lng) {
      q = p.lat + ',' + p.lng;             // 공개 — 정확 좌표
    } else {
      q = p.address || p.region || '';     // 좌표 미확보 시 주소 폴백
    }
    if (!q) { alert('지도 위치 정보가 없습니다.'); return; }
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q),
                '_blank', 'noopener');
  }, true);  // ← capture
})();
