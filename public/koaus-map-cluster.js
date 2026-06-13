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
  //     buildPreviewHtml — (p) => html  (옵션, D 지시) 단일 마커 InfoWindow 전용 미리보기 빌더.
  //                     미지정 시 buildCardHtml 그대로 사용 (하위 호환 — 기존 호출자 무영향).
  //                     클러스터 그룹 InfoWindow 는 항상 buildCardHtml (제목 포함, 선택용).
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
        // B-2 (배치) — opts.skipInfoWindowOnSingle=true 인 호출자(auto/jobs)는
        //   단일 마커 클릭 시 InfoWindow 미리보기 카드 X → onSingleClick(보통 openDetail)만.
        //   (히스토리: accom/rent 도 B-2 로 직행이었으나 D 지시로 미리보기 복원 — rent 는
        //    buildPreviewHtml 옵션, accom 은 자체 마커 루프에서 처리)
        //   클러스터(같은 좌표 다중)는 사용자 선택 필요 → InfoWindow 유지.
        if (isCluster) {
          iw.setContent(groupIwHtml(arr, opts.buildCardHtml));
          iw.open(map, marker);
        } else if (opts.skipInfoWindowOnSingle) {
          if (typeof opts.onSingleClick === 'function') opts.onSingleClick(p0);
          if (typeof opts.markerIcon === 'function') {
            try { marker.setIcon(opts.markerIcon(p0)); } catch (_) {}
          }
        } else {
          iw.setContent((typeof opts.buildPreviewHtml === 'function' ? opts.buildPreviewHtml : opts.buildCardHtml)(p0));
          if (typeof opts.onSingleClick === 'function') opts.onSingleClick(p0);
          if (typeof opts.markerIcon === 'function') {
            try { marker.setIcon(opts.markerIcon(p0)); } catch (_) {}
          }
          iw.open(map, marker);
        }
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

// ════════════════════════════════════════════════════════════════════
//  KoAus · 지도 하단 슬라이드업 가로 카드 Drawer (#5 Map 동선 — 2026-06 규격 락)
//  · 마커 클릭 → 지도 하단 가로 카드 drawer (InfoWindow 폐기). Airbnb/네이버 부동산 패턴.
//  · 단일 마커 = 클릭 글 + 주변(haversine 최근거리) 9장 = 최대 10장 펼침 (비교 UX).
//  · 클러스터(같은 4자리 좌표 N건) = 그 N건을 drawer 로 (옛 groupIwHtml 폐기).
//  · 닫기 = drawer ✕ + 지도 빈 곳 탭 둘 다.
//  · 데스크탑 = 모바일과 동일 동선, 카드 폭만 320px 고정 (코드 단일).
//  · 카드 콘텐츠는 페이지 buildCard(p) 재사용 (.iw-card[data-pid] 유지 → 기존 document
//    위임 click 이 markVisited+openDetail 처리). drawer 는 컨테이너 역할만 — 정보 손실 0.
//  · 사용:
//      const drawer = koausMapDrawer.attach({
//        container: document.getElementById('mapView'),  // position:relative 조상
//        map, markers, bounds, posts: filteredPosts,
//        markerIcon: p => markerIcon(p),
//        buildCard: buildAccomPreview,            // (p)=>'<div class="iw-card" data-pid>…'
//        neighborhoodLimit: 10,
//        onMarkerOpen: p => markVisited(p.id),    // 부수효과(읽음 처리). 핀 재색칠은 drawer 자동.
//      });
//      // drawer.openAt(id) / drawer.close() / drawer.destroy()
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausMapDrawer) return;

  function haversine(a, b) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function attach(opts) {
    const map = opts.map;
    const container = opts.container;
    const cluster = window.koausMapCluster;
    if (!map || !container || !opts.posts || typeof opts.buildCard !== 'function' || !cluster) return null;

    const limit = opts.neighborhoodLimit || 10;
    const withCoord = opts.posts.filter(p => p.lat && p.lng);
    const groups = cluster.groupByCoord(opts.posts);
    const markerByFirstId = new Map();  // p0.id → marker (openAt 용)

    // drawer DOM (컨테이너당 1개 재사용)
    let drawer = container.querySelector('#mapCardDrawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'mapCardDrawer';
      drawer.setAttribute('hidden', '');
      drawer.innerHTML =
        '<button class="drawer-close" type="button" aria-label="닫기">✕</button>' +
        '<div class="drawer-track"></div>';
      container.appendChild(drawer);
    }
    const track = drawer.querySelector('.drawer-track');
    const closeBtn = drawer.querySelector('.drawer-close');

    function close() {
      drawer.setAttribute('hidden', '');
      drawer.classList.remove('open');
      track.innerHTML = '';
    }
    function openCards(cards, activeId) {
      track.innerHTML = cards.map(p =>
        '<div class="drawer-card" data-pid="' + String(p.id) + '">' + opts.buildCard(p) + '</div>'
      ).join('');
      drawer.removeAttribute('hidden');
      // reflow 후 open 클래스 → 슬라이드업 transition
      requestAnimationFrame(() => drawer.classList.add('open'));
      // 활성 카드로 스크롤 (단일 클릭 시 클릭 글이 0번이라 좌측 정렬)
      const idx = Math.max(0, cards.findIndex(p => String(p.id) === String(activeId)));
      const el = track.children[idx];
      if (el) track.scrollLeft = el.offsetLeft - track.offsetLeft;
    }

    function openAt(postId) {
      const p0 = withCoord.find(p => String(p.id) === String(postId));
      if (!p0) return;
      // 같은 좌표 그룹이면 그 그룹 전체, 단일이면 최근거리 이웃 채움
      const grp = groups.find(arr => String(arr[0].id) === String(postId));
      let cards;
      if (grp && grp.length > 1) {
        cards = grp.slice(0, limit);
      } else {
        const neighbors = withCoord
          .filter(p => String(p.id) !== String(p0.id))
          .map(p => ({ p, d: haversine(p0, p) }))
          .sort((x, y) => x.d - y.d)
          .slice(0, limit - 1)
          .map(x => x.p);
        cards = [p0, ...neighbors];
      }
      if (typeof opts.onMarkerOpen === 'function') opts.onMarkerOpen(p0);
      openCards(cards, p0.id);
    }

    // 마커 생성 (attachMarkers 와 동일 — InfoWindow 대신 drawer 오픈)
    groups.forEach(arr => {
      const p0 = arr[0];
      const isCluster = arr.length > 1;
      const marker = new google.maps.Marker({
        position: { lat: p0.lat, lng: p0.lng },
        map: map,
        title: isCluster ? (p0.title + ' (외 ' + (arr.length - 1) + '건)') : p0.title,
        icon: isCluster ? cluster.clusterIconSvg(arr.length)
                        : (typeof opts.markerIcon === 'function' ? opts.markerIcon(p0) : undefined),
      });
      marker.addListener('click', function () {
        openAt(p0.id);
        if (!isCluster && typeof opts.markerIcon === 'function') {
          try { marker.setIcon(opts.markerIcon(p0)); } catch (_) {}
        }
      });
      markerByFirstId.set(String(p0.id), marker);
      if (Array.isArray(opts.markers)) opts.markers.push(marker);
      if (opts.bounds && typeof opts.bounds.extend === 'function') {
        opts.bounds.extend({ lat: p0.lat, lng: p0.lng });
      }
    });

    // 닫기 ① drawer ✕ ② 카드 탭(상세는 document 위임 처리, drawer 는 닫기만)
    //   — DOM 영속(재렌더 시 재사용)이라 1회만 바인딩 (재호출 누수 방지). 핸들러는 영속 노드 기준.
    if (!drawer._koausBound) {
      drawer._koausBound = true;
      closeBtn.addEventListener('click', e => { e.stopPropagation(); close(); });
      track.addEventListener('click', e => {
        if (e.target.closest('.iw-card[data-pid]')) close();
      });
    }
    // 닫기 ③ 지도 빈 곳 탭 — attach 마다 새로 등록되므로 destroy() 에서 반드시 해제(누수 방지)
    const mapClickListener = map.addListener('click', () => close());

    return {
      openAt,
      close,
      destroy() {
        try { google.maps.event.removeListener(mapClickListener); } catch (_) {}
        close();
      },
    };
  }

  window.koausMapDrawer = { attach };
})();
