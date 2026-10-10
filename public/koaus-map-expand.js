// ════════════════════════════════════════════════════════════════════
//  KoAus · 상세 지도 "확대" 버튼 → 인사이트(in-site) 확대 오버레이 (전 보드 공용)
//  · 확대 클릭 시 풀스크린 오버레이에 Google Maps(JS API)를 직접 렌더 — 외부 구글맵 이동 폐기.
//    (옛 동작: 새 창으로 google.com/maps 이동 → 프라이버시 원이 사라지는 회귀였음. 2026-06 수정.)
//  · 위치 비공개 글: 프라이버시 원(400m)만 표시 — 마커/스트릿뷰 숨김, 정확좌표 비노출
//    (길찾기는 동네(suburb) 수준 목적지로만 제공). 공개 글: 정확 마커 + 길찾기·스트릿뷰.
//  · FAB 는 ✕(우상단) 바로 아래 세로 스택, 글귀 없이 아이콘 1개씩(원형 44px) —
//    길찾기 = 화살표(near_me SVG) / 스트릿뷰 = . 좌하단 텍스트 필 배치는 폐기(2026-07 사용자 확정).
//  · gestureHandling:'greedy' — 원(또는 마커)은 그대로 둔 채 다른 지역으로 패닝/줌 가능
//    (realestate.com.au 식 "원 유지 + 둘러보기").
//  · 오버레이 DOM/CSS 는 helper 가 1회 주입 — 보드 HTML 수정 불필요.
//  · capture-phase 위임 — 보드마다 제각각이던 옛 바인딩(requestFullscreen·인페이지 모달)을
//    가로채(stopPropagation) 동작 통일. 개별 보드 옛 핸들러 제거 불필요.
//  · 대상 보드(확대 버튼 보유): accom/rent/jobs/auto/gp/restaurants/salon/trades.
//    데이터: window.currentDetailPost (상세 열 때 보드가 설정).
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausMapExpand) return;
  window.__koausMapExpand = true;

  var overlay, canvasEl, hintEl, dirBtn, svBtn, mapObj, marker, circle;

  function ensureOverlay() {
    if (overlay) return;
    var st = document.createElement('style');
    st.textContent = [
      '.koaus-mx-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;}',
      '.koaus-mx-overlay.open{display:block;}',
      '.koaus-mx-canvas{position:absolute;inset:0;width:100%;height:100%;}',
      '.koaus-mx-close{position:absolute;top:14px;right:14px;z-index:3;width:44px;height:44px;border:none;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:20px;line-height:44px;cursor:pointer;color:#222;}',
      /* FAB — ✕ 바로 아래 세로 스택, 글귀 없이 아이콘 1개(원형) (2026-07 사용자 확정 — 좌하단 텍스트 필 폐기) */
      '.koaus-mx-fabs{position:absolute;top:68px;right:14px;z-index:3;display:flex;flex-direction:column;gap:10px;}',
      '.koaus-mx-fab{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:19px;color:#1a73e8;text-decoration:none;}',
      '.koaus-mx-fab svg{display:block;width:22px;height:22px;fill:currentColor;}',
      '.koaus-mx-hint{position:absolute;left:50%;top:16px;transform:translateX(-50%);z-index:2;background:rgba(0,0,0,.62);color:#fff;padding:6px 14px;border-radius:16px;font-size:13px;max-width:64%;text-align:center;pointer-events:none;}'
    ].join('');
    document.head.appendChild(st);

    overlay = document.createElement('div');
    overlay.className = 'koaus-mx-overlay';
    overlay.innerHTML =
      '<div class="koaus-mx-canvas"></div>' +
      '<div class="koaus-mx-hint"></div>' +
      '<button class="koaus-mx-close" type="button" aria-label="닫기">✕</button>' +
      '<div class="koaus-mx-fabs">' +
        '<a class="koaus-mx-fab koaus-mx-dir" target="_blank" rel="noopener" aria-label="길찾기" title="길찾기">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/></svg>' +
        '</a>' +
        '<a class="koaus-mx-fab koaus-mx-sv" target="_blank" rel="noopener" aria-label="스트릿뷰" title="스트릿뷰"></a>' +
      '</div>';
    document.body.appendChild(overlay);
    canvasEl = overlay.querySelector('.koaus-mx-canvas');
    hintEl   = overlay.querySelector('.koaus-mx-hint');
    dirBtn   = overlay.querySelector('.koaus-mx-dir');
    svBtn    = overlay.querySelector('.koaus-mx-sv');
    overlay.querySelector('.koaus-mx-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // suburb 수준 질의 — 쉼표 분할 마지막 세그먼트(동네+주+우편번호), 도로명·번지 제외.
  function suburbQuery(addr) {
    if (!addr) return '';
    var parts = String(addr).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  }

  // 좌표 미확보(지오코딩 안 된 옛 글 등) 시에만 옛 외부맵 폴백 — 비공개는 동네 수준 검색.
  function externalFallback(p) {
    var q = '';
    if (p.locationPrivate) q = suburbQuery(p.address || p.region || '');
    else if (p.lat && p.lng) q = p.lat + ',' + p.lng;
    else q = p.address || p.region || '';
    if (!q) { alert('지도 위치 정보가 없습니다.'); return; }
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q),
                '_blank', 'noopener');
  }

  function render(p) {
    var priv = !!p.locationPrivate;
    var lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || !isFinite(lng)) { externalFallback(p); return; }  // 좌표 없으면 옛 동작
    ensureOverlay();
    var center = { lat: lat, lng: lng };
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    hintEl.textContent = priv ? '위치 비공개 — 대략적 범위(원)만 표시됩니다' : '지도를 드래그해 주변을 둘러보세요';

    // 길찾기 FAB — 공개=정확주소 / 비공개=동네(suburb)까지만 (realestate.com.au 식).
    //   스트릿뷰는 정확 지점 노출이라 비공개 정책상 계속 숨김.
    if (priv) {
      // 비공개: 정확 좌표/주소 절대 미사용 — redactAddress 로 "Suburb STATE [Postcode]" 목적지.
      //   redact 실패('위치 비공개'/빈값) 시 suburbQuery 폴백. 어떤 경우도 도로명·좌표 미노출.
      var lp  = window.koausListingPrivacy;
      var sub = (lp && lp.redactAddress) ? (lp.redactAddress(p.address || '') || '') : '';
      if (!sub || sub === '위치 비공개') sub = suburbQuery(p.address || p.region || '');
      if (sub) {
        dirBtn.style.display = '';
        dirBtn.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(sub) + '&travelmode=transit';
      } else {
        dirBtn.style.display = 'none';   // 동네조차 못 구하면 숨김 (좌표 폴백 안 함 — 누출 방지)
      }
      svBtn.style.display = 'none';       // 스트릿뷰 비공개 미제공
    } else {
      var dest = p.address || (lat + ',' + lng);
      dirBtn.style.display = '';
      dirBtn.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + '&travelmode=transit';
      svBtn.style.display = '';
      svBtn.href = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng;
    }

    if (!mapObj) {
      mapObj = new google.maps.Map(canvasEl, {
        center: center, zoom: priv ? 14 : 16,
        gestureHandling: 'greedy', mapTypeControl: false,
        streetViewControl: false, fullscreenControl: false, clickableIcons: false,
      });
    }
    // 오버레이 표시 후 컨테이너 크기가 잡히면 리사이즈 + 중심 재설정 + 오버레이(원/마커) 재생성
    setTimeout(function () {
      google.maps.event.trigger(mapObj, 'resize');
      mapObj.setCenter(center); mapObj.setZoom(priv ? 14 : 16);
      if (marker) { try { marker.setMap(null); } catch (_) {} marker = null; }
      if (circle) { try { circle.setMap(null); } catch (_) {} circle = null; }
      if (priv) {
        // 비공개 — 프라이버시 원(400m)만 (마커 X). 중심은 오프셋 좌표라 정확 위치 비노출.
        if (window.koausListingPrivacy && window.koausListingPrivacy.drawPrivacyCircle) {
          circle = window.koausListingPrivacy.drawPrivacyCircle(mapObj, lat, lng, { radius: 400 });
        }
      } else {
        // 공개 — 정확 마커
        marker = new google.maps.Marker({ position: center, map: mapObj });
      }
    }, 120);
  }

  // google.maps 준비 대기 (상세 mini-map 로 이미 로드됐을 것 — 안전망). 6초 초과 시 외부맵 폴백.
  function waitMapsThen(p) {
    if (window.google && window.google.maps && window.google.maps.Map) { render(p); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.google && window.google.maps && window.google.maps.Map) { clearInterval(iv); render(p); }
      else if (tries > 40) { clearInterval(iv); externalFallback(p); }
    }, 150);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest &&
      e.target.closest('#detailMapFullscreenBtn, #detailMapExpand, .fullscreen-btn, .rea-map-expand');
    if (!btn) return;
    // 옛 바인딩(requestFullscreen·인페이지 모달)보다 먼저 가로채 통일
    e.preventDefault();
    e.stopPropagation();
    var p = window.currentDetailPost;
    if (!p) return;
    waitMapsThen(p);
  }, true);  // ← capture
})();
