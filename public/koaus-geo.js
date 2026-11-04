// ═══════════════════════════════════════════════════════════════════
//  KoAus · 동네 찾기 공통(11-04) — 프로필(집·일)·사람 목록 필터가 같이 쓴다.
//  - Maps JS Geocoder 만 쓴다(사이트 공개 키는 HTTP 리퍼러 제한이라 REST Geocoding 은 REQUEST_DENIED).
//    페이지가 이미 Maps 스크립트를 로드 중이면(accom/rent 지도) 그것을 기다리고, 없으면 지오코더만 가볍게 불러온다.
//  - 한글·영문 둘 다 됨("스프링우드" / "springwood"), 결과 이름은 영문(language:'en')으로 통일해 저장.
//  - 우편번호(4자리)는 그 우편번호에 속한 동네 전부를 보여 준다(postcode_localities) — 4127 → Springwood·Daisy Hill… .
//    우편번호로 고른 동네는 좌표가 우편번호 중심이라 refine() 으로 동네 좌표를 한 번 더 받는다.
//  - 공개 API: window.koausGeo = { suburbs(text) → Promise<[{name,state,postcode,lat,lng,approx?}]>, refine(s) → Promise<s>, ready() }
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.koausGeo) return;
  var KEY = 'AIzaSyDwogQ55V0-JqZ-ZYRTpYgNZWOdp_-5vOQ';   // accom/rent/jobs 와 같은 공개 키(리퍼러 제한)
  var STATES = ['qld', 'nsw', 'vic', 'wa', 'sa', 'tas', 'act', 'nt'];
  var readyP = null;

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
      sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + KEY + '&loading=async&language=en&callback=__koausGeoReady';
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
        new window.google.maps.Geocoder().geocode(req, function (res, status) { resolve(status === 'OK' && Array.isArray(res) ? res : []); });
      } catch (_) { resolve([]); }
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
    if (!(await ready())) { console.warn('[koaus-geo] Maps JS 를 불러오지 못했습니다'); return []; }
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
  window.koausGeo = { suburbs: suburbs, refine: refine, ready: ready };
})();
