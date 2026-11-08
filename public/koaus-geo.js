// ═══════════════════════════════════════════════════════════════════
//  KoAus · 동네 찾기 공통(11-04) — 프로필(집·일)·사람 목록 필터가 같이 쓴다.
//  - Maps JS Geocoder 만 쓴다(사이트 공개 키는 HTTP 리퍼러 제한이라 REST Geocoding 은 REQUEST_DENIED).
//    페이지가 이미 Maps 스크립트를 로드 중이면(accom/rent 지도) 그것을 기다리고, 없으면 지오코더만 가볍게 불러온다.
//  - 한글·영문 둘 다 됨("스프링우드" / "springwood"), 결과 이름은 영문(language:'en')으로 통일해 저장.
//  - 우편번호(4자리)는 그 우편번호에 속한 동네 전부를 보여 준다(postcode_localities) — 4127 → Springwood·Daisy Hill… .
//    우편번호로 고른 동네는 좌표가 우편번호 중심이라 refine() 으로 동네 좌표를 한 번 더 받는다.
//  - 공개 API: window.koausGeo = { suburbs(text) → Promise<[{name,state,postcode,lat,lng,approx?}]>, refine(s) → Promise<s>, ready() }
//  - 큰 지역: REGIONS(도시권, km 반경) · STATE_REGIONS(주 전체, all:true — 같은 주면 거리 무관). regionItem(code) 로 suburbs 항목을 만든다(11-04).
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.koausGeo) return;
  var KEY = 'AIzaSyDwogQ55V0-JqZ-ZYRTpYgNZWOdp_-5vOQ';   // accom/rent/jobs 와 같은 공개 키(리퍼러 제한)
  var STATES = ['qld', 'nsw', 'vic', 'wa', 'sa', 'tas', 'act', 'nt'];
  var readyP = null;
  var lastStatus = '';   // 11-08: 마지막 지오코더 응답 상태(OK·ZERO_RESULTS·REQUEST_DENIED…) — 동네를 못 찾을 때 화면에 같이 보여 준다

  function hasGeocoder() { return !!(window.google && window.google.maps && window.google.maps.Geocoder); }
  function ready() {
    if (hasGeocoder()) return Promise.resolve(true);
    if (readyP) return readyP;
    readyP = new Promise(function (resolve) {
      var t0 = Date.now();
      var poll = function () { if (hasGeocoder()) return resolve(true); if (Date.now() - t0 > 12000) return resolve(false); setTimeout(poll, 150); };
      if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) { poll(); return; }
      window.__koausGeoReady = function () { resolve(true); };
      var sc = document.createElement('script');
      sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + KEY + '&libraries=places&loading=async&callback=__koausGeoReady';   // 11-04b: places 포함(accom/rent/jobs 지도가 뒤에 열려도 두 번 안 불러오게), 언어는 요청마다 en
      sc.async = true;
      sc.onerror = function () { resolve(false); };
      document.head.appendChild(sc);
      setTimeout(function () { resolve(hasGeocoder()); }, 12000);
    });
    return readyP;
  }
  function geocode(req) {
    return new Promise(function (resolve) {
      try {
        req.language = 'en';
        new window.google.maps.Geocoder().geocode(req, function (res, status) { lastStatus = String(status || ''); resolve(status === 'OK' && Array.isArray(res) ? res : []); });
      } catch (e) { lastStatus = 'GEOCODER_ERROR'; resolve([]); }
    });
  }
  function comp(r, type) { return (r.address_components || []).find(function (c) { return (c.types || []).indexOf(type) !== -1; }) || null; }
  function pick(results, wantPostcode) {
    var out = [], seen = {};
    (results || []).forEach(function (r) {
      var loc = comp(r, 'locality') || comp(r, 'sublocality') || comp(r, 'postal_town');
      var st = comp(r, 'administrative_area_level_1');
      var pc = comp(r, 'postal_code');
      var geo = r.geometry && r.geometry.location;
      if (!st || !geo) return;
      var state = String(st.short_name || '').toLowerCase();
      if (STATES.indexOf(state) === -1) return;
      var lat = typeof geo.lat === 'function' ? geo.lat() : Number(geo.lat);
      var lng = typeof geo.lng === 'function' ? geo.lng() : Number(geo.lng);
      var push = function (name, approx) {
        var k = (name + '|' + state).toLowerCase(); if (seen[k]) return; seen[k] = 1;
        out.push({ name: String(name).slice(0, 60), state: state, postcode: pc ? String(pc.long_name).slice(0, 4) : (wantPostcode || ''), lat: lat, lng: lng, approx: !!approx });
      };
      if (loc) push(loc.long_name, false);
      else if (Array.isArray(r.postcode_localities) && r.postcode_localities.length) r.postcode_localities.slice(0, 15).forEach(function (n) { push(n, true); });
    });
    return out.slice(0, 15);
  }
  // 동네 이름·우편번호 → 후보 목록
  async function suburbs(text) {
    var t = String(text || '').trim();
    if (!t) return [];
    if (!(await ready())) { lastStatus = 'MAPS_NOT_LOADED'; console.warn('[koaus-geo] Maps JS 를 불러오지 못했습니다'); return []; }
    var isPc = /^\d{4}$/.test(t);
    var results = await geocode(isPc ? { componentRestrictions: { country: 'AU', postalCode: t } } : { address: t, componentRestrictions: { country: 'AU' }, region: 'au' });
    var out = pick(results, isPc ? t : '');
    // 우편번호인데 동네 목록이 안 왔으면 "4127 Australia" 주소 검색으로 한 번 더
    if (isPc && !out.length) out = pick(await geocode({ address: t + ' Australia', componentRestrictions: { country: 'AU' }, region: 'au' }), t);
    return out;
  }
  // 우편번호로 고른 동네(좌표가 우편번호 중심) → 동네 자체 좌표로
  async function refine(s) {
    if (!s || !s.approx) return s;
    if (!(await ready())) return s;
    var res = await geocode({ address: s.name + ' ' + String(s.state).toUpperCase() + (s.postcode ? ' ' + s.postcode : '') + ' Australia', componentRestrictions: { country: 'AU' }, region: 'au' });
    var hit = pick(res).find(function (x) { return x.name.toLowerCase() === s.name.toLowerCase() && x.state === s.state && !x.approx; });
    return hit ? { name: hit.name, state: hit.state, postcode: hit.postcode || s.postcode || '', lat: hit.lat, lng: hit.lng, approx: false } : s;
  }
  // 큰 지역(도시권) 한 번에 고르기(11-04) — 동네 대신 "브리즈번 전체"처럼. km 은 그 지역의 반경(프로필 radiusKm 대신 이 값으로 매칭)
  var REGIONS = [
    { code: 'brisbane',       name: 'Brisbane',       ko: '브리즈번',     state: 'qld', lat: -27.4698, lng: 153.0251, km: 25 },
    { code: 'gold_coast',     name: 'Gold Coast',     ko: '골드코스트',   state: 'qld', lat: -28.0167, lng: 153.4000, km: 20 },
    { code: 'sunshine_coast', name: 'Sunshine Coast', ko: '선샤인코스트', state: 'qld', lat: -26.6500, lng: 153.0667, km: 25 },
    { code: 'toowoomba',      name: 'Toowoomba',      ko: '투움바',       state: 'qld', lat: -27.5598, lng: 151.9507, km: 15 },
    { code: 'cairns',         name: 'Cairns',         ko: '케언즈',       state: 'qld', lat: -16.9186, lng: 145.7781, km: 20 },
    { code: 'townsville',     name: 'Townsville',     ko: '타운즈빌',     state: 'qld', lat: -19.2590, lng: 146.8169, km: 20 },
    { code: 'sydney',         name: 'Sydney',         ko: '시드니',       state: 'nsw', lat: -33.8688, lng: 151.2093, km: 30 },
    { code: 'newcastle',      name: 'Newcastle',      ko: '뉴캐슬',       state: 'nsw', lat: -32.9283, lng: 151.7817, km: 20 },
    { code: 'wollongong',     name: 'Wollongong',     ko: '울런공',       state: 'nsw', lat: -34.4278, lng: 150.8931, km: 20 },
    { code: 'melbourne',      name: 'Melbourne',      ko: '멜번',         state: 'vic', lat: -37.8136, lng: 144.9631, km: 30 },
    { code: 'perth',          name: 'Perth',          ko: '퍼스',         state: 'wa',  lat: -31.9523, lng: 115.8613, km: 30 },
    { code: 'adelaide',       name: 'Adelaide',       ko: '애들레이드',   state: 'sa',  lat: -34.9285, lng: 138.6007, km: 25 },
    { code: 'canberra',       name: 'Canberra',       ko: '캔버라',       state: 'act', lat: -35.2809, lng: 149.1300, km: 20 },
    { code: 'hobart',         name: 'Hobart',         ko: '호바트',       state: 'tas', lat: -42.8821, lng: 147.3272, km: 20 },
    { code: 'darwin',         name: 'Darwin',         ko: '다윈',         state: 'nt',  lat: -12.4634, lng: 130.8456, km: 20 }
  ];
  // 주 전체(11-04b) — "QLD 전체"처럼 주 단위로 고르기. 거리 대신 '같은 주'면 매칭(all: true). lat/lng 는 주도 좌표(정렬·지도 첫 화면용).
  var STATE_REGIONS = [
    { code: 'qld_all', name: 'QLD', ko: 'QLD 전체', state: 'qld', lat: -27.4698, lng: 153.0251, all: true },
    { code: 'nsw_all', name: 'NSW', ko: 'NSW 전체', state: 'nsw', lat: -33.8688, lng: 151.2093, all: true },
    { code: 'vic_all', name: 'VIC', ko: 'VIC 전체', state: 'vic', lat: -37.8136, lng: 144.9631, all: true },
    { code: 'wa_all',  name: 'WA',  ko: 'WA 전체',  state: 'wa',  lat: -31.9523, lng: 115.8613, all: true },
    { code: 'sa_all',  name: 'SA',  ko: 'SA 전체',  state: 'sa',  lat: -34.9285, lng: 138.6007, all: true },
    { code: 'act_all', name: 'ACT', ko: 'ACT 전체', state: 'act', lat: -35.2809, lng: 149.1300, all: true },
    { code: 'tas_all', name: 'TAS', ko: 'TAS 전체', state: 'tas', lat: -42.8821, lng: 147.3272, all: true },
    { code: 'nt_all',  name: 'NT',  ko: 'NT 전체',  state: 'nt',  lat: -12.4634, lng: 130.8456, all: true }
  ];
  function regions(state) { return state ? REGIONS.filter(function (r) { return r.state === state; }) : REGIONS.slice(); }
  function stateRegions() { return STATE_REGIONS.slice(); }
  function regionItem(code) {
    var r = REGIONS.find(function (x) { return x.code === code; });
    if (r) return { name: r.name, state: r.state, postcode: '', lat: r.lat, lng: r.lng, km: r.km };
    var s = STATE_REGIONS.find(function (x) { return x.code === code; });
    return s ? { name: s.name, state: s.state, postcode: '', lat: s.lat, lng: s.lng, all: true } : null;
  }
  // 큰 지역(도시권 km 또는 주 전체 all)인지
  function isRegion(s) { return !!(s && (s.km || s.all)); }
  // 프로필의 기준 위치(첫 동네) — 지도 첫 화면용. 프로필 모듈이 저장, accom/rent/jobs 지도가 읽음(주 지정 없을 때만)
  var CENTER_KEY = 'koaus-profile-center-v1';
  function saveProfileCenter(s) { try { if (s && typeof s.lat === 'number' && s.state) localStorage.setItem(CENTER_KEY, JSON.stringify({ state: s.state, lat: s.lat, lng: s.lng, name: s.name || '', km: s.km || 0, all: !!s.all })); } catch (_) {} }
  function profileCenter() { try { var c = JSON.parse(localStorage.getItem(CENTER_KEY) || 'null'); return c && typeof c.lat === 'number' ? c : null; } catch (_) { return null; } }
  window.koausGeo = { suburbs: suburbs, refine: refine, ready: ready, regions: regions, stateRegions: stateRegions, regionItem: regionItem, isRegion: isRegion, REGIONS: REGIONS, STATE_REGIONS: STATE_REGIONS, saveProfileCenter: saveProfileCenter, profileCenter: profileCenter, get lastStatus() { return lastStatus; } };
})();
