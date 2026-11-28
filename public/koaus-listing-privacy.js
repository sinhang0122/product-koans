// ════════════════════════════════════════════════════════════════════
//  KoAus · 매물 위치 프라이버시 헬퍼 (지시 3/5)
//  -----------------------------------------------------------------
//  대상: accom (쉐어), rent (렌트), auto-used (중고차 개인 판매)
//  목적: 매물 글의 정확한 주소/좌표가 모든 사용자에게 노출되는 위험 차단.
//  11-28b: redactAddress — 동네 이름에 '길 낱말'이 든 곳(St Lucia · Kelvin Grove · Lane Cove …)이 잘려 저장되던 것을 고쳤다(아래 _suburbOf).
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
  //   도로명 누출 방지가 최우선 — 실패하더라도 절대 도로명을 반환하지 않는다.
  //      (구버전은 번지 없는 도로명 "Pitt Street, Sydney NSW" 나 콤마 없는 주소에서
  //       전체 문자열을 그대로 반환 → 비공개 매물 상세에 도로명 노출 회귀. 2026-06 수정.)
  //   최악의 경우(주(state) 토큰도 못 찾고 도로타입만 남음)엔 '위치 비공개' 반환.
  const _STATE    = '(NSW|VIC|QLD|WA|SA|ACT|NT|TAS)';
  const _ROADTYPE = '(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Ln|Lane|Pl|Place|Ct|Court|Cres|Crescent|Hwy|Highway|Blvd|Boulevard|Pde|Parade|Tce|Terrace|Way|Cct|Circuit|Esp|Esplanade|Gr|Grove|Cl|Close|Row|Mall|Sq|Square)';
  const _ROAD_RE  = new RegExp('\\b' + _ROADTYPE + '\\b', 'i');

  // ── (b-0) 한글 현지화 주소 정규화 — Google 지도 한국어 로캘 대응 ───────────
  //   Google Places 가 한국어 UI 로 반환하는 주소는 주(state)·국가(country)가 한글:
  //     "Winchester Court, Springwood 퀸즐랜드 주 오스트레일리아"
  //   → 영문 약어로 환원해 영문 주소 파이프라인(redactAddress/shortAddr)에 그대로 태운다.
  //   · 국가명(Australia/오스트레일리아/호주) 꼬리 제거
  //   · 한글 주(state) → 영문 약어. 긴 이름(ACT/NT 준주) 먼저 등록 — 부분일치 방지.
  //   · "<주> 주" / "<주>주" / "<주>" (뒤가 공백·콤마·끝) 모두 매칭.
  const _KO_STATE = [
    ['오스트레일리아 수도 준주', 'ACT'], ['오스트레일리아 캐피털 준주', 'ACT'], ['수도 준주', 'ACT'],
    ['노던 준주', 'NT'], ['노던 테리토리', 'NT'], ['노던준주', 'NT'],
    ['뉴사우스웨일스', 'NSW'], ['뉴사우스웨일즈', 'NSW'], ['뉴 사우스 웨일스', 'NSW'],
    ['웨스턴오스트레일리아', 'WA'], ['웨스턴 오스트레일리아', 'WA'], ['서호주', 'WA'],
    ['사우스오스트레일리아', 'SA'], ['사우스 오스트레일리아', 'SA'], ['남호주', 'SA'],
    ['태즈메이니아', 'TAS'], ['태즈매니아', 'TAS'], ['타스마니아', 'TAS'],
    ['퀸즐랜드', 'QLD'], ['퀸스랜드', 'QLD'],
    ['빅토리아', 'VIC'],
  ];
  function normalizeAddress(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    s = s.replace(/,?\s*(Australia|오스트레일리아|호주)\s*$/i, '').trim();   // 국가명 꼬리 제거
    s = s.replace(/\bSt\.\s*/gi, 'St ');   // 11-28b: "St. Lucia" · "Smith St. Sydney" 의 마침표 — 마침표가 있으면 그 앞 낱말이 통째로 빠졌다("St. Lucia" → "Lucia")
    for (var i = 0; i < _KO_STATE.length; i++) {
      var re = new RegExp(_KO_STATE[i][0] + '(?:\\s*주)?(?=\\s|,|$)', 'g');
      s = s.replace(re, _KO_STATE[i][1]);
    }
    return s.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*$/, '').trim();
  }

  // ── (b-1) 주(state) 앞의 글자 덩어리에서 동네 이름만 — 길 이름은 버린다 ──────────────
  //   덩어리 = "Coronation Dr Green Valley"(쉼표 없이 적은 주소) 또는 "Green Valley"(쉼표로 나뉜 주소의 끝 조각). 번지는 이미 빠져 있다.
  //   길 낱말(St · Rd · Dr …) 뒤에 글자가 더 있으면 그 뒤만 남긴다(되풀이한다). 그래도 길 낱말이 남으면(끝 낱말) 마지막 낱말만 남긴다
  //   — 모르면 자른다: 길 이름을 내보내지 않는 쪽이 먼저다.
  //   11-28b: 동네 이름에 길 낱말이 든 곳이 잘려 저장되던 것을 고쳤다 — St Lucia → "Lucia", Kelvin Grove → "Grove", Lane Cove → "Cove".
  //   (위치 비공개가 기본값이라 그 동네의 글은 거의 다 그렇게 저장됐다. 이미 저장된 글은 글쓴이가 수정에서 다시 저장해야 바뀐다.)
  //     ① 덩어리의 끝이 아래 목록(_SUBURB_KEEP)의 이름이면 그 이름이 동네다(쉼표 없이 적은 "5 Smith St St Lucia" 도 여기서 잡힌다).
  //        돌려주는 것이 목록의 동네 이름뿐이라 길 이름이 샐 수 없다. 길 낱말이 든 동네를 더 알게 되면 여기에 소문자로 더한다.
  //     ② 덩어리가 St 로 시작하고 그 뒤에 길 낱말이 하나도 없으면 Saint 로 시작하는 동네다(목록에 없는 St Huberts Island 같은 곳).
  //        길 이름 뒤에 붙는 St(Street)는 앞에 이름이 있어야 하므로 덩어리의 맨 앞에 올 수 없다. 길 낱말에서 자른 뒤에 남은 St 는 여기에 들지 않는다
  //        ("12 Court St Sunnybank" 의 St 는 길 이름의 꼬리다).
  const _SUBURB_KEEP = ['st lucia', 'st leonards', 'st ives', 'st ives chase', 'st peters', 'st marys', 'st clair', 'st johns park', 'st kilda', 'st kilda east', 'st kilda west',
    'st albans', 'st albans park', 'st helena', 'st james', 'st morris', 'st georges', 'st agnes', 'st helens', 'st helens park', 'st george',
    'kelvin grove', 'ferny grove', 'cedar grove', 'petrie terrace', 'lane cove', 'lane cove north', 'lane cove west', 'liberty grove', 'hurstville grove',
    'wattle grove', 'raymond terrace', 'crescent head', 'ocean grove', 'golden grove', 'golden square', 'orange grove', 'aubin grove', 'banksia grove'];
  const _CUT_RE = new RegExp('\\b' + _ROADTYPE + '\\s+(.+)$', 'i');
  function _suburbOf(group) {
    var s = String(group == null ? '' : group).trim().replace(/\s+/g, ' ');
    var low = s.toLowerCase();
    for (var i = 0; i < _SUBURB_KEEP.length; i++) {                                   // ①
      var n = _SUBURB_KEEP[i];
      if (low === n || low.slice(-(n.length + 1)) === ' ' + n) return s.slice(s.length - n.length);
    }
    var saint = s.match(/^st\s+(\S.*)$/i);                                             // ②
    if (saint && !_ROAD_RE.test(saint[1])) return s;
    for (var g = 0; g < 8; g++) {                                                     // "Coronation Dr Green Valley" → "Green Valley" · "Lane Cove Rd Macquarie Park" → "Macquarie Park"
      var c = s.match(_CUT_RE);
      if (!c) break;
      s = c[1].trim();
    }
    if (_ROAD_RE.test(s)) { var w = s.split(/\s+/); s = w[w.length - 1]; }             // 끝 낱말이 길 낱말("Pitt Street") → 마지막 낱말만
    return s;
  }

  function redactAddress(address) {
    if (!address || typeof address !== 'string') return '';
    let text = normalizeAddress(address);   // 한글 현지화(주/국가) → 영문 정규화 + 국가명 꼬리 제거
    if (!text) return '';

    // (1) 콤마 분리 — 도로명/번지는 주(state) 조각 '이전' 콤마 조각에 있으므로,
    //     주 토큰을 가진 조각만 취하면 도로명이 자연 제거된다.
    //     예: "12 Coronation Dr, Green Valley NSW 2168" → "Green Valley NSW 2168"
    //         "George Street, Sydney NSW"               → "Sydney NSW"
    //     콤마 없는 변형("123 George St Sydney NSW 2000")도 한 조각 안에서 처리.
    const parts  = text.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const partRe = new RegExp('([A-Za-z][A-Za-z\\s\\-\']*?)\\s+' + _STATE + '(?:\\s+(\\d{4}))?\\s*$', 'i');
    for (var i = parts.length - 1; i >= 0; i--) {
      var m = parts[i].match(partRe);
      if (!m) continue;
      var suburb = _suburbOf(m[1]);   // 11-28b: 길 이름은 버리고 동네 이름만(St Lucia · Kelvin Grove 처럼 길 낱말이 든 동네는 그대로)
      var pc = m[3] ? ' ' + m[3] : '';
      return (suburb ? suburb + ' ' : '') + m[2].toUpperCase() + pc;
    }

    // (2) 주(state) 토큰조차 없음 — 도로타입 기준 절단. 그래도 도로명이 남으면 '위치 비공개'.
    var stripped = text.replace(new RegExp('^.*?\\b' + _ROADTYPE + '\\b,?\\s*', 'i'), '').trim();
    if (_ROAD_RE.test(stripped)) return '위치 비공개';
    return stripped || '위치 비공개';
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
    normalizeAddress,      // 한글 현지화 주소(주/국가) → 영문 정규화 (공개/비공개 공통 전처리)
    redactAddress,
    drawPrivacyCircle,
    savePrivateLocation,
    fetchPrivateLocation,
    pricePinSvg,
    formatPriceText,
  };
})();
