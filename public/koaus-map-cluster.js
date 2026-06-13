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
//  · 단일 마커 = 클릭한 그 1장만 (시안 a① — 주변 자동 펼침 폐기, 스와이프 무효).
//  · 클러스터(같은 4자리 좌표 N건) = 그 N건을 가로 스와이프 drawer 로 ("이 주소 매물들").
//  · 닫기 = drawer ✕ + 지도 빈 곳 탭 둘 다.
//  · 데스크탑 = 모바일과 동일 동선.
//  · 위치 = 지도 영역 바깥 — 지도 100% 유지하고 그 아래 normal-flow 별도 섹션(absolute 아님).
//  · 카드 콘텐츠 = 페이지의 통일 list view 카드 빌더(buildCard) 재사용. 카드 액션(공유·수정·
//    삭제·찜·상세)은 grid 와 동일 공용 와이어러를 onRender(track) 로 재바인딩 — drawer·grid 일관.
//  · 사용:
//      const drawer = koausMapDrawer.attach({
//        container: document.getElementById('mapView'),
//        map, markers, bounds, posts: filteredPosts,
//        markerIcon: p => markerIcon(p),
//        buildCard: buildAccomListCard,           // (p)=>'<div class="accom-card" data-id>…'
//        onRender: track => wireCardActions(track),   // grid 와 동일 액션 와이어러
//        onMarkerOpen: p => markVisited(p.id),    // 부수효과(읽음 처리). 핀 재색칠은 drawer 자동.
//      });
//      // drawer.openAt(id) / drawer.close() / drawer.destroy()
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausMapDrawer) return;

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
    function openCards(cards) {
      // 카드 = 통일 list view 카드(buildCard). 각 카드를 .accom-grid--compact 래퍼로 감싸
      //   내부 .accom-card 가 가로 row 레이아웃을 그대로 받게 함(목록과 동일 규격).
      track.innerHTML = cards.map(p =>
        '<div class="drawer-card accom-grid accom-grid--compact">' + opts.buildCard(p) + '</div>'
      ).join('');
      // 단일(1장) = 풀폭·스와이프 없음 / 클러스터(N장) = 가로 스와이프
      track.classList.toggle('single', cards.length <= 1);
      track.scrollLeft = 0;
      drawer.removeAttribute('hidden');
      requestAnimationFrame(() => drawer.classList.add('open'));
      // 카드 내 액션(공유·수정·삭제·찜·상세) 재바인딩 — grid 와 동일 공용 와이어러
      if (typeof opts.onRender === 'function') opts.onRender(track);
    }

    function openAt(postId) {
      const grp = groups.find(arr => String(arr[0].id) === String(postId));
      let cards;
      if (grp && grp.length > 1) {
        cards = grp.slice(0, limit);        // 클러스터(같은 4자리 좌표) = 그 N건 가로 스와이프
      } else {
        const p0 = (grp && grp[0]) || withCoord.find(p => String(p.id) === String(postId));
        if (!p0) return;
        cards = [p0];                        // 단일 마커 = 클릭한 1장만 (주변 자동 펼침 폐기 — 시안 a① )
      }
      if (typeof opts.onMarkerOpen === 'function') opts.onMarkerOpen(cards[0]);
      openCards(cards);
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
        // 카드 본문 탭 → 상세(페이지 wireCardActions 가 처리) + drawer 닫기.
        //   미니 액션 버튼(공유·수정·삭제·신고·숨김·찜)은 stopPropagation 이라 여기 안 옴 → drawer 유지.
        if (e.target.closest('.accom-card') && !e.target.closest('.mini-btn, .bookmark-btn')) close();
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
