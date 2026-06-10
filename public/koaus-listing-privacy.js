// ════════════════════════════════════════════════════════════════════
//  KoAus · 매물 위치 프라이버시 헬퍼 (지시 3/5)
//  -----------------------------------------------------------------
//  대상: accom (쉐어), rent (렌트), auto-used (중고차 개인 판매)
//  목적: 매물 글의 정확한 주소/좌표가 모든 사용자에게 노출되는 위험 차단.
//        '비공개' 매물은 지도에 300~500m 오프셋된 대략 좌표 + 흐릿한 원만 노출,
//        정확 주소·좌표는 본인 + admin 만 접근 가능 (firestore.rules 지시 2/5).
//  공개 API: window.koausListingPrivacy = {
//    offsetCoords(lat, lng)              → { lat, lng }   (300~500m 랜덤 오프셋)
//    redactAddress(address)              → 'Suburb State Postcode'
//    drawPrivacyCircle(map, lat, lng, opts?) → google.maps.Circle | null
//    savePrivateLocation(db, fs, collection, postId, exact, ownerUid) → Promise<void>
//    fetchPrivateLocation(db, fs, collection, postId) → Promise<{exactAddress,exactLat,exactLng}|null>
//  }
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausListingPrivacy) return;

  // ── (0) 정확 위치 필드 상수 — Firestore 누수 방어 검문소 ────────────────
  //   클라이언트(다른 사용자) 단으로 절대 내려가서는 안 되는 필드 목록.
  //   이 필드들은 본인 기기 localStorage 부모 doc 또는 private_data 서브컬렉션
  //   (firestore.rules 가 본인+admin 만 read 허용) 에만 존재해야 한다.
  //   필드 추가 시 이 한 곳만 갱신하면 stripPrivateFields() 가 자동 차단.
  const PRIVATE_FIELDS = Object.freeze(['exactAddress', 'exactLat', 'exactLng']);

  // ── stripPrivateFields(payload) — 불변 복사본 반환 ─────────────────────
  //   · 원본 객체 변형 X (mutate 금지) — localStorage 부모 doc / 본인 기기 데이터는 보존
  //   · 얕은 복사 후 PRIVATE_FIELDS 키만 delete
  //   · 공개 필드(lat / lng / address / title / price / locationPrivate 등) 그대로 유지
  //     · lat/lng 는 이미 offsetCoords() 거친 오프셋 좌표 (300~500m 랜덤)
  //     · address 는 이미 redactAddress() 거친 "Suburb State Postcode" 마스킹
  //   · null / undefined / non-object 입력 시 그대로 반환 (방어적)
  //   · 사용처: Firestore addDoc/setDoc/updateDoc 호출 직전 (공개 부모 doc 페이로드)
  //   · private_data 서브컬렉션 저장(savePrivateLocation)에는 절대 적용 금지 — 그곳엔 exact* 필요.
  function stripPrivateFields(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    const clone = Object.assign({}, payload);
    PRIVATE_FIELDS.forEach(function (k) { delete clone[k]; });
    return clone;
  }

  // ── (a) 좌표 오프셋 — 300~500m 랜덤 (Airbnb 패턴) ──────────────────
  //   · 매번 호출마다 다른 무작위 방향(0~360°) + 거리(300~500m).
  //   · 위경도 1도 ≈ 111km — 호주 위도(-12~-43)에서 거의 동일.
  //   · 경도는 cos(lat) 보정 — 위도가 낮을수록(적도 가까울수록) 경도 1도가 길어짐.
  //   · 호주 위도 -25 기준 경도 1도 ≈ 100km, -35 기준 91km.
  //   · 결과: 매번 다른 좌표 → 역지오코딩 / 삼각측량 / 다중 요청 평균화 공격 차단.
  function offsetCoords(lat, lng) {
    const baseLat = Number(lat);
    const baseLng = Number(lng);
    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) return { lat: baseLat, lng: baseLng };
    const distanceM = 300 + Math.random() * 200;            // 300~500m
    const bearing   = Math.random() * 2 * Math.PI;          // 0~360°
    const dLat = (distanceM * Math.cos(bearing)) / 111000;
    const dLng = (distanceM * Math.sin(bearing)) / (111000 * Math.cos(baseLat * Math.PI / 180));
    return {
      lat: baseLat + dLat,
      lng: baseLng + dLng,
    };
  }

  // ── (b) 주소 redact — 'Suburb State Postcode' 형태 ──────────────────
  //   호주 주소 패턴 우선 매칭:
  //     · "<번지> <도로명>, <Suburb> <State> <Postcode>, Australia"
  //     · State: NSW|VIC|QLD|WA|SA|ACT|NT|TAS (대소문자 무관)
  //     · Postcode: 4자리 숫자
  //   매칭 실패 시 안전 fallback (입력 그대로 또는 도로명/번지 제거 시도).
  //   결과 예: "Strathfield NSW 2135" / "Sydney NSW 2000"
  function redactAddress(address) {
    if (!address || typeof address !== 'string') return '';
    const text = address.trim();
    if (!text) return '';

    // 1순위: "Suburb State Postcode" 패턴 매칭
    //   문자열 어느 위치에서도 추출 가능. Suburb 는 영문/공백/하이픈/아포스트로피 허용.
    const m = text.match(/([A-Za-z][A-Za-z\s\-']*?)\s+(NSW|VIC|QLD|WA|SA|ACT|NT|TAS)\s+(\d{4})/i);
    if (m) {
      const suburb   = m[1].trim().replace(/\s+/g, ' ');
      const state    = m[2].toUpperCase();
      const postcode = m[3];
      return `${suburb} ${state} ${postcode}`;
    }

    // 2순위: 마지막 콤마 뒤 부분 (Australia 같은 국가명 제거)
    const parts = text.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const tail = parts.slice(-2).join(', ');
      if (/(NSW|VIC|QLD|WA|SA|ACT|NT|TAS)\s+\d{4}/i.test(tail)) return tail;
    }

    // 3순위: 도로명·번지 패턴 제거 (앞쪽 "<숫자> <단어> St/Rd/Ave/...")
    //   안전한 fallback — 실패하면 원본 반환.
    const stripped = text.replace(
      /^\d+[A-Za-z]?\/?\d*\s+[A-Za-z][\w\s\-']*?\s+(St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Ln|Lane|Pl|Place|Ct|Court|Cres|Crescent|Hwy|Highway|Blvd|Boulevard|Pde|Parade|Tce|Terrace|Way),?\s*/i,
      ''
    ).trim();
    return stripped || text;
  }

  // ── (c) 지도 원 그리기 — 400m 반경 흐릿한 원 ─────────────────────────
  //   · opts: { radius, fillColor, fillOpacity, strokeColor, strokeOpacity, strokeWeight }
  //   · 반환: google.maps.Circle 인스턴스 (호출자가 setMap(null) 가능)
  //   · 클릭 비활성 (clickable: false) — 마커 클릭 방해 X
  function drawPrivacyCircle(map, lat, lng, opts) {
    if (!map || !window.google || !window.google.maps) return null;
    const o = opts || {};
    const cLat = Number(lat), cLng = Number(lng);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) return null;
    return new google.maps.Circle({
      map: map,
      center: { lat: cLat, lng: cLng },
      radius:        o.radius        || 400,
      fillColor:     o.fillColor     || '#000',
      fillOpacity:   o.fillOpacity   || 0.12,
      strokeColor:   o.strokeColor   || '#000',
      strokeOpacity: o.strokeOpacity || 0.5,
      strokeWeight:  o.strokeWeight  || 1,
      clickable: false,
      zIndex:    0,
    });
  }

  // ── (d) 정확 위치 저장 — private_data/location 서브컬렉션 ─────────────
  //   · firestore.rules 의 create 룰 정합 (필드 검증 + 부모 doc uid 일치)
  //   · doc id 고정 'location' — 매물 1개당 1개 정확 위치 (단순화)
  //   · 호출 전제: 부모 doc 이 이미 Firestore 에 저장되어 있어야 함 (룰의 get(...) 검증)
  //   · accom_posts / rent_posts / auto_posts 컬렉션 동일 패턴
  async function savePrivateLocation(db, fs, collectionName, postId, exact, ownerUid) {
    if (!db || !fs || !fs.doc || !fs.setDoc) return;
    if (!collectionName || !postId) return;
    if (!exact || !exact.exactAddress) return;
    if (exact.exactLat == null || exact.exactLng == null) return;
    if (!ownerUid) return;
    const payload = {
      exactAddress: String(exact.exactAddress).slice(0, 500),
      exactLat:     Number(exact.exactLat),
      exactLng:     Number(exact.exactLng),
      ownerUid:     String(ownerUid),
      createdAt:    fs.serverTimestamp ? fs.serverTimestamp() : new Date(),
    };
    return fs.setDoc(
      fs.doc(db, collectionName, postId, 'private_data', 'location'),
      payload
    );
  }

  // ── (e) 정확 위치 fetch — 본인 + admin 만 read 가능 (룰 강제) ─────────
  //   · 다른 사용자가 호출 시 permission-denied → null 반환 (안전한 catch)
  //   · 반환: { exactAddress, exactLat, exactLng } | null
  async function fetchPrivateLocation(db, fs, collectionName, postId) {
    if (!db || !fs || !fs.doc || !fs.getDoc) return null;
    if (!collectionName || !postId) return null;
    try {
      const snap = await fs.getDoc(fs.doc(db, collectionName, postId, 'private_data', 'location'));
      if (!snap.exists()) return null;
      const d = snap.data() || {};
      return {
        exactAddress: d.exactAddress || '',
        exactLat:     Number(d.exactLat),
        exactLng:     Number(d.exactLng),
      };
    } catch (_) {
      // permission-denied (본인/admin 아님) 또는 네트워크 오류 — null 반환
      return null;
    }
  }

  // ── (f) 가격 핀 SVG — 텍스트 가격 마커 (지시 4/5) ──────────────────────
  //   · 안읽음: 검정 배경 + 흰 글자 (강조)
  //   · 읽음:   흰 배경 + 검정 글자 + 검정 외곽선(두께 ↑) + 그림자 (지도 배경에 안 묻힘)
  //   · 자동 폭 가변 — 가격 텍스트 길이에 맞춰 너비 조절
  //   · 핀 꼭지(삼각형) — 마커가 좌표를 정확히 가리킴
  //   · 반환: google.maps.Icon (url + scaledSize + anchor + labelOrigin)
  function pricePinSvg(text, isVisited) {
    if (!window.google || !window.google.maps) return null;
    const t = String(text == null ? '' : text).slice(0, 20);
    const safe = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const bg     = isVisited ? '#ffffff' : '#000000';
    const fg     = isVisited ? '#000000' : '#ffffff';
    const stroke = '#000000';
    const sw     = isVisited ? 2 : 1.5;        // 읽음 더 두꺼운 외곽 (가시성 ↑)
    const fontSize = 12;
    const charW    = 7;                        // 글자 1자 폭 근사
    const padX     = 12;
    const w  = Math.max(56, Math.min(160, t.length * charW + padX * 2));
    const h  = 26;
    const ptH = 7;                             // 핀 꼭지 높이
    const filterId = isVisited ? 'koaus-pp-sh-v' : 'koaus-pp-sh';   // 두 필터 분리 (DOM 캐시 충돌 회피)
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (h + ptH) + '" viewBox="0 0 ' + w + ' ' + (h + ptH) + '">' +
        '<defs><filter id="' + filterId + '" x="-20%" y="-20%" width="140%" height="160%">' +
          '<feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity="0.28"/>' +
        '</filter></defs>' +
        // 핀 꼭지 (rect 보다 먼저 그려 rect 아래에 깔리도록)
        '<polygon points="' + (w/2 - 5) + ',' + (h - 1) + ' ' + (w/2 + 5) + ',' + (h - 1) + ' ' + (w/2) + ',' + (h + ptH - 1) + '" ' +
          'fill="' + bg + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
        // 본체 (둥근 캡슐)
        '<rect x="' + (sw/2) + '" y="' + (sw/2) + '" width="' + (w - sw) + '" height="' + (h - sw) + '" rx="' + (h/2 - sw/2) + '" ' +
          'fill="' + bg + '" stroke="' + stroke + '" stroke-width="' + sw + '" filter="url(#' + filterId + ')"/>' +
        // 텍스트
        '<text x="' + (w/2) + '" y="' + (h/2 + 4) + '" text-anchor="middle" ' +
          'fill="' + fg + '" font-family="Urbanist,Noto Sans KR,sans-serif" font-size="' + fontSize + '" font-weight="800">' + safe + '</text>' +
      '</svg>';
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize:  new google.maps.Size(w, h + ptH),
      anchor:      new google.maps.Point(w / 2, h + ptH - 1),   // 꼭지 끝점이 좌표 위치
      labelOrigin: new google.maps.Point(w / 2, h / 2),
    };
  }

  // ── (g) 가격 텍스트 포맷 헬퍼 ────────────────────────────────────────
  //   · accom/rent: "$240 p/w" 형식
  //   · auto-used: "$8,500" (천단위 콤마)
  //   · price 없으면 '협의'
  function formatPriceText(price, type) {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return '협의';
    if (type === 'wk' || type === 'weekly') return '$' + Math.round(n) + ' p/w';
    if (type === 'car' || type === 'auto') return '$' + n.toLocaleString();
    return '$' + n.toLocaleString();
  }

  window.koausListingPrivacy = {
    PRIVATE_FIELDS,        // 외부에서 같은 상수 참조 가능 (필드 추가 시 단일 진입점)
    stripPrivateFields,    // Firestore 저장 직전 검문소 (불변 복사본 반환)
    offsetCoords,
    redactAddress,
    drawPrivacyCircle,
    savePrivateLocation,
    fetchPrivateLocation,
    pricePinSvg,
    formatPriceText,
  };
})();
