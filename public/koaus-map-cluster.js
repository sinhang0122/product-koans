// ════════════════════════════════════════════════════════════════════
//  KoAus · 지도 마커 클러스터링 헬퍼 — 동일 좌표 매물 그룹화 + +N 배지
//  · 8개 카테고리 페이지(accom/auto/gp/jobs/rent/restaurants/salon/trades) 공용
//  · Black & White 톤 SVG dataURL — 추가 색상 없음
//  · 사용:
//      const groups = koausMapCluster.groupByCoord(filteredPosts);
//      groups.forEach(arr => {
//        const isCluster = arr.length > 1;
//        const p0 = arr[0];
//        const mk = new google.maps.Marker({
//          position:{lat:p0.lat,lng:p0.lng}, map,
//          icon: isCluster ? koausMapCluster.clusterIconSvg(arr.length) : markerIcon(p0.id),
//        });
//        mk.addListener('click', () => {
//          infoWindow.setContent(isCluster
//            ? koausMapCluster.groupIwHtml(arr, buildCardHtml)
//            : buildCardHtml(p0));
//          infoWindow.open(map, mk);
//        });
//      });
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausMapCluster) return;

  // 같은 좌표(4자리 ≈ 11m) 매물들을 그룹화 — 반환: 그룹 배열의 배열
  // 단일 매물도 길이 1 배열로 일관 처리 (호출부 분기 단순화)
  function groupByCoord(posts) {
    const groups = new Map();
    (posts || []).forEach(p => {
      if (!p || !p.lat || !p.lng) return;
      const k = Number(p.lat).toFixed(4) + ',' + Number(p.lng).toFixed(4);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    return Array.from(groups.values());
  }

  // 클러스터 마커 아이콘 — 검정 원 + 흰 외곽 + "+N" 흰 텍스트
  //   count: 그룹 매물 총수(2↑). 배지 텍스트는 "+추가매물수" = +(count-1)
  function clusterIconSvg(count) {
    const size  = count >= 10 ? 36 : count >= 5 ? 32 : 28;
    const badge = '+' + (count - 1);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 40 40">' +
        '<circle cx="20" cy="20" r="18" fill="#000" stroke="#fff" stroke-width="3"/>' +
        '<text x="20" y="25" text-anchor="middle" fill="#fff" ' +
          'font-family="Urbanist,Noto Sans KR,sans-serif" font-size="14" font-weight="900">' + badge + '</text>' +
      '</svg>';
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor:     new google.maps.Point(size / 2, size / 2),
    };
  }

  // 그룹 InfoWindow HTML — 헤더 + 카드 N개 (수직 스크롤)
  //   postsAtSameSpot: 그룹 매물 배열 (2↑)
  //   buildCardHtml(p): 페이지별 단일 카드 마크업 빌더 (data-pid 포함 필수)
  //                    페이지의 기존 InfoWindow 위임 클릭(`.iw-card[data-pid]`) 이
  //                    그대로 작동하려면 카드 마크업이 동일 selector 가지면 됨.
  function groupIwHtml(postsAtSameSpot, buildCardHtml) {
    const head =
      '<div style="font:800 13px/1.3 \'Urbanist\',\'Noto Sans KR\',sans-serif;color:#000;' +
                  'border-bottom:1px solid #000;padding:0 0 6px;margin-bottom:6px;">' +
        '이 위치 ' + postsAtSameSpot.length + '개 매물' +
      '</div>';
    const cards = postsAtSameSpot.map(buildCardHtml).join(
      '<div style="height:1px;background:#e5e5e5;margin:8px 0;"></div>'
    );
    return '<div style="max-width:300px;max-height:380px;overflow-y:auto;padding:2px;">' +
             head + cards +
           '</div>';
  }

  // ── 마커 1세트 부착(공용 호출부) ──
  //   각 카테고리 페이지의 marker forEach 블록을 이 호출 1줄로 교체.
  //   opts:
  //     map           — google.maps.Map 인스턴스 (필수)
  //     posts         — 필터 후 표시할 매물 배열 (필수)
  //     infoWindow    — google.maps.InfoWindow 인스턴스 (필수, 페이지에서 1개 재사용)
  //     markerIcon    — (p) => google.maps.Icon | undefined  (단일 마커 아이콘, 옵션)
  //     buildCardHtml — (p) => '<div class="iw-card" data-pid="…">…</div>'  (필수)
  //                     단일/그룹 InfoWindow 공통. iw-card[data-pid] 위임 click 으로 상세 모달 오픈.
  //     onSingleClick — (p) => void  (단일 마커 클릭 시 부수 효과: markVisited 등, 옵션)
  //     markers       — Marker[] (마커 push 대상, 옵션)
  //     bounds        — google.maps.LatLngBounds (extend 대상, 옵션)
  //   반환: 그룹 수 (= 생성된 마커 수)
  function attachMarkers(opts) {
    const map = opts.map;
    const iw  = opts.infoWindow;
    if (!map || !iw || !opts.posts || !opts.buildCardHtml) return 0;
    const groups = groupByCoord(opts.posts);
    groups.forEach(arr => {
      const p0 = arr[0];
      const isCluster = arr.length > 1;
      const marker = new google.maps.Marker({
        position: { lat: p0.lat, lng: p0.lng },
        map: map,
        title: isCluster ? (p0.title + ' (외 ' + (arr.length - 1) + '건)') : p0.title,
        icon:  isCluster ? clusterIconSvg(arr.length)
                         : (typeof opts.markerIcon === 'function' ? opts.markerIcon(p0) : undefined),
      });
      marker.addListener('click', function () {
        if (isCluster) {
          iw.setContent(groupIwHtml(arr, opts.buildCardHtml));
        } else {
          iw.setContent(opts.buildCardHtml(p0));
          if (typeof opts.onSingleClick === 'function') opts.onSingleClick(p0);
          if (typeof opts.markerIcon === 'function') {
            try { marker.setIcon(opts.markerIcon(p0)); } catch (_) {}
          }
        }
        iw.open(map, marker);
      });
      if (Array.isArray(opts.markers)) opts.markers.push(marker);
      if (opts.bounds && typeof opts.bounds.extend === 'function') {
        opts.bounds.extend({ lat: p0.lat, lng: p0.lng });
      }
    });
    return groups.length;
  }

  window.koausMapCluster = { groupByCoord, clusterIconSvg, groupIwHtml, attachMarkers };
})();
