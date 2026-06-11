/*!
 * koaus-ads.js (v2) — KoAus 주(State)별 히어로 배너 광고 타게팅 + Firebase 연동
 * ============================================================================
 * 역할 분담
 *   • 방문자가 "어느 주를 자주 보는지" → 방문자 브라우저(localStorage)에 점수로 기록 (맞춤용)
 *   • 광고 목록·이미지 → Firebase(Firestore)에 저장 (관리자가 올리고 모든 방문자가 봄)
 *
 * 동작
 *   1) ?state=nsw|vic|qld|wa|sa|tas|act|nt 페이지를 열 때마다 그 주 점수 +1 (시간 지나면 반감)
 *   2) 홈 히어로 배너에서 점수가 가장 높은 주를 찾아 그 주 광고만 노출
 *   3) 광고 목록은 Firestore의 'ad_banners'(active=true)에서 불러옴 (10분 캐시)
 *   4) 기록이 부족한 신규 방문자는 state='default'(전국) 광고를 봄
 *
 * 개인정보: 이름·이메일 등은 저장하지 않음. 브라우저에 '주 코드+점수'만 보관.
 *
 * 설치(공개 페이지):
 *   ① 사이트가 이미 Firebase를 초기화한다면 그 다음에 이 파일을 불러오기만 하면 됨
 *      (firestore compat 스크립트가 로드돼 있어야 함)
 *   ② 모든 페이지의 </body> 직전:  <script src="/koaus-ads.js"></script>
 *   ③ 히어로에 끼워넣는 방법 → OPTIONS.renderMode 참고 (기본 'callback')
 *   광고 등록/수정은 관리자 페이지(admin-ads.html)에서 합니다. 이 파일은 보통 수정할 필요 없습니다.
 * ============================================================================
 */
(function (global) {
  'use strict';

  /* ===== 1) 설정 (CONFIG) ===== */
  var STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
  var STATE_LABELS = {
    nsw: 'NSW · 시드니', vic: 'VIC · 멜버른', qld: 'QLD · 브리즈번',
    wa: 'WA · 퍼스', sa: 'SA · 애들레이드', tas: 'TAS', act: 'ACT', nt: 'NT'
  };

  // Firestore에서 광고를 못 불러왔을 때 쓸 비상용 하드코딩 광고(보통 비워둠 — 관리는 admin 페이지에서)
  var AD_INVENTORY = { nsw: [], vic: [], qld: [], wa: [], sa: [], tas: [], act: [], nt: [] };
  var DEFAULT_ADS = [];

  var OPTIONS = {
    // 저장/점수
    storageKey:  'koaus_state_scores',
    overrideKey: 'koaus_state_override',
    statsKey:    'koaus_ad_stats',
    halfLifeDays: 21,     // 점수 반감기(일). 작을수록 최근 행동에 민감
    minScore:     1.5,    // 이 미만이면 우세 주 없음 → 기본(default) 광고

    // Firebase(Firestore)에서 광고 불러오기
    useFirebase: true,            // 끄면 위 하드코딩 인벤토리만 사용
    adsCollection: 'ad_banners',  // 관리자 페이지와 동일해야 함
    inventoryCacheKey: 'koaus_ads_cache',
    inventoryCacheMinutes: 10,    // Firestore 읽기 횟수 절약용 캐시

    // 렌더링
    renderMode: 'callback',       // 'callback'(기존 슬라이더에 직접) | 'inject'(자동 삽입)
    mountSelector: '#heroAd',
    injectMode: 'replace',        // 'replace' | 'prepend' | 'append'
    adClass: 'koaus-ad',
    onlyOnHome: true,             // 홈에서만 광고 렌더 (방문 집계는 local-analytics.js 가 전 페이지에서 수행)
    frequencyCapPerSession: 3,

    // 콜백(선택)
    onAd: null,         // function({state, ad, isFallback, label})
    onImpression: null, // function(ad, state)
    onClick: null,      // function(ad, state)
    beaconUrl: null,    // 설정 시 노출/클릭을 서버로 POST

    autoInit: true,
    debug: false
  };

  /* ===== 2) 내부 유틸 ===== */
  function log() {
    if (OPTIONS.debug && global.console && console.log)
      console.log.apply(console, ['[KoAusAds]'].concat([].slice.call(arguments)));
  }
  function lsAvailable() {
    try { var k = '__koaus_test__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  }
  var LS_OK = lsAvailable();
  var memStore = {};
  function read(key, fallback) {
    try {
      var raw = LS_OK ? localStorage.getItem(key) : memStore[key];
      return raw ? JSON.parse(raw) : (fallback === undefined ? null : fallback);
    } catch (e) { return fallback === undefined ? null : fallback; }
  }
  function write(key, val) {
    try { var raw = JSON.stringify(val); if (LS_OK) localStorage.setItem(key, raw); else memStore[key] = raw; }
    catch (e) {}
  }
  function getStateFromUrl() {
    try {
      var search = (global.location && global.location.search) || '';
      var m = search.match(/[?&]state=([a-z]{2,3})/i);
      var s = m ? m[1].toLowerCase() : null;
      return (s && STATES.indexOf(s) !== -1) ? s : null;
    } catch (e) { return null; }
  }
  function isHomePage() {
    try {
      var p = (global.location && global.location.pathname) || '';
      return p === '' || p === '/' || /\/index\.html?$/i.test(p);
    } catch (e) { return false; }
  }
  var HL_MS = OPTIONS.halfLifeDays * 86400000;
  function decay(score, last, now) {
    if (!last) return score || 0;
    return (score || 0) * Math.pow(0.5, Math.max(0, now - last) / HL_MS);
  }

  /* ===== 3) 방문 기록 & 우세 주 ===== */
  function recordStateVisit(state) {
    state = state || getStateFromUrl();
    if (!state) return null;
    var now = Date.now();
    var scores = read(OPTIONS.storageKey, {}) || {};
    var cur = scores[state] || { score: 0, last: now };
    scores[state] = { score: decay(cur.score, cur.last, now) + 1, last: now };
    write(OPTIONS.storageKey, scores);
    log('visit →', state, scores[state]);
    return state;
  }
  function getScores() {
    var now = Date.now();
    var scores = read(OPTIONS.storageKey, {}) || {};
    var out = {};
    STATES.forEach(function (s) { var e = scores[s]; out[s] = e ? decay(e.score, e.last, now) : 0; });
    return out;
  }
  function getDominantState() {
    var override = read(OPTIONS.overrideKey, null);
    if (override && STATES.indexOf(override) !== -1) return override;
    var scores = getScores(), best = null, bestVal = 0;
    STATES.forEach(function (s) { if (scores[s] > bestVal) { bestVal = scores[s]; best = s; } });
    return (best && bestVal >= OPTIONS.minScore) ? best : null;
  }

  /* ===== 4) 인벤토리: Firestore 로드 + 캐시 ===== */
  function applyInventory(map) {
    if (!map) return;
    STATES.forEach(function (s) { AD_INVENTORY[s] = map[s] || []; });
    DEFAULT_ADS.length = 0;
    [].push.apply(DEFAULT_ADS, (map['default'] || []));
  }
  function cacheGet() {
    var c = read(OPTIONS.inventoryCacheKey, null);
    if (!c || !c.t || !c.map) return null;
    return { stale: (Date.now() - c.t > OPTIONS.inventoryCacheMinutes * 60000), map: c.map };
  }
  function cacheSet(map) { write(OPTIONS.inventoryCacheKey, { t: Date.now(), map: map }); }

  function firebaseReady() {
    return !!(OPTIONS.useFirebase && global.firebase && firebase.apps && firebase.apps.length && firebase.firestore);
  }
  function fetchFromFirestore() {
    return new Promise(function (resolve) {
      if (!firebaseReady()) { resolve(null); return; }
      try {
        firebase.firestore().collection(OPTIONS.adsCollection)
          .where('active', '==', true).limit(20).get()   // rules limitedList(≤20) 정합
          .then(function (snap) {
            var map = {}; STATES.forEach(function (s) { map[s] = []; }); map['default'] = [];
            snap.forEach(function (doc) {
              var d = doc.data() || {};
              if (!d.img) return;
              var ad = { id: doc.id, img: d.img, href: d.href || '#', alt: d.alt || '',
                         weight: d.weight || 1, start: d.start || null, end: d.end || null, order: d.order || 0 };
              var st = d.state || 'default';
              if (st === 'default') map['default'].push(ad);
              else if (map[st]) map[st].push(ad);
            });
            Object.keys(map).forEach(function (k) { map[k].sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); });
            resolve(map);
          })
          .catch(function (e) { log('Firestore 로드 실패:', e && e.message); resolve(null); });
      } catch (e) { resolve(null); }
    });
  }
  // 캐시가 신선하면 즉시 적용(+백그라운드 갱신), 아니면 가져와서 적용. 실패 시 캐시/하드코딩 유지.
  function loadInventory() {
    return new Promise(function (resolve) {
      if (!OPTIONS.useFirebase) { resolve(false); return; }
      var c = cacheGet();
      if (c && !c.stale) {
        applyInventory(c.map);
        fetchFromFirestore().then(function (m) { if (m) { cacheSet(m); applyInventory(m); } });
        resolve(true); return;
      }
      fetchFromFirestore().then(function (m) {
        if (m) { cacheSet(m); applyInventory(m); }
        else if (c && c.map) { applyInventory(c.map); }
        resolve(true);
      });
    });
  }

  /* ===== 5) 광고 선택 ===== */
  function inWindow(ad, now) {
    if (ad.start && new Date(ad.start + 'T00:00:00').getTime() > now) return false;
    if (ad.end && new Date(ad.end + 'T23:59:59').getTime() < now) return false;
    return true;
  }
  function sessionCount(id) { try { return parseInt(sessionStorage.getItem('koaus_imp_' + id) || '0', 10) || 0; } catch (e) { return 0; } }
  function bumpSessionCount(id) { try { sessionStorage.setItem('koaus_imp_' + id, String(sessionCount(id) + 1)); } catch (e) {} }
  function pickFrom(list) {
    var now = Date.now();
    var pool = (list || []).filter(function (ad) {
      return ad && ad.img && inWindow(ad, now) && sessionCount(ad.id) < OPTIONS.frequencyCapPerSession;
    });
    if (!pool.length) pool = (list || []).filter(function (ad) { return ad && ad.img && inWindow(ad, now); });
    if (!pool.length) return null;
    var total = pool.reduce(function (a, ad) { return a + (ad.weight || 1); }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) { r -= (pool[i].weight || 1); if (r <= 0) return pool[i]; }
    return pool[0];
  }
  function pickAd(forcedState) {
    var state = forcedState || getDominantState();
    if (state && AD_INVENTORY[state] && AD_INVENTORY[state].length) {
      var ad = pickFrom(AD_INVENTORY[state]);
      if (ad) return { state: state, ad: ad, isFallback: false };
    }
    return { state: state || null, ad: pickFrom(DEFAULT_ADS), isFallback: true };
  }

  /* ===== 6) 노출/클릭 집계 ===== */
  function bumpStat(field, ad, state) {
    if (!ad || !ad.id) return;
    var stats = read(OPTIONS.statsKey, {}) || {};
    var row = stats[ad.id] || { imp: 0, clk: 0, state: state || null };
    row[field] = (row[field] || 0) + 1; if (state) row.state = state;
    stats[ad.id] = row; write(OPTIONS.statsKey, stats);
  }
  function beacon(type, ad, state) {
    if (!OPTIONS.beaconUrl || !ad) return;
    try {
      var body = JSON.stringify({ type: type, adId: ad.id, state: state, t: Date.now() });
      if (navigator.sendBeacon) navigator.sendBeacon(OPTIONS.beaconUrl, body);
      else fetch(OPTIONS.beaconUrl, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {}
  }
  function fireImpression(ad, state) {
    if (!ad) return;
    bumpSessionCount(ad.id); bumpStat('imp', ad, state); beacon('impression', ad, state);
    if (typeof OPTIONS.onImpression === 'function') OPTIONS.onImpression(ad, state);
  }
  function fireClick(ad, state) {
    if (!ad) return;
    bumpStat('clk', ad, state); beacon('click', ad, state);
    if (typeof OPTIONS.onClick === 'function') OPTIONS.onClick(ad, state);
  }
  function getStats() { return read(OPTIONS.statsKey, {}) || {}; }

  /* ===== 7) 렌더링 ===== */
  function buildAdElement(ad, state) {
    var a = document.createElement('a');
    a.className = OPTIONS.adClass; a.href = ad.href || '#';
    a.target = '_blank'; a.rel = 'noopener sponsored';
    a.setAttribute('data-koaus-ad', ad.id || ''); a.setAttribute('data-koaus-state', state || '');
    var img = document.createElement('img');
    img.src = ad.img; img.alt = ad.alt || ((STATE_LABELS[state] || '') + ' 광고');
    img.loading = 'lazy'; img.style.display = 'block'; img.style.width = '100%'; img.style.height = 'auto';
    a.appendChild(img);
    a.addEventListener('click', function () { fireClick(ad, state); });
    return a;
  }
  function renderHeroAd(forcedState) {
    var res = pickAd(forcedState);
    if (!res.ad) { log('표시할 광고가 없습니다. 관리자 페이지에서 광고를 등록하세요.'); return res; }
    if (OPTIONS.renderMode === 'callback') {
      fireImpression(res.ad, res.state);
      if (typeof OPTIONS.onAd === 'function')
        OPTIONS.onAd({ state: res.state, ad: res.ad, isFallback: res.isFallback, label: STATE_LABELS[res.state] || null });
      else log('renderMode=callback 인데 onAd 콜백이 없습니다. 선택된 광고:', res);
      return res;
    }
    var mount = document.querySelector(OPTIONS.mountSelector);
    if (!mount) { log('mountSelector 없음:', OPTIONS.mountSelector); return res; }
    var el = buildAdElement(res.ad, res.state);
    if (OPTIONS.injectMode === 'replace') { mount.innerHTML = ''; mount.appendChild(el); }
    else if (OPTIONS.injectMode === 'prepend') { mount.insertBefore(el, mount.firstChild); }
    else { mount.appendChild(el); }
    fireImpression(res.ad, res.state);
    return res;
  }

  /* ===== 8) 초기화 & 공개 API ===== */
  // 방문 점수 적립(koaus_state_scores 쓰기)은 local-analytics.js 가 전 페이지에서 전담 —
  // 이 모듈은 읽기 전용 (이중 집계 방지). recordStateVisit 은 수동 호출용 API 로만 유지.
  function shouldRenderHere() {
    if (OPTIONS.onlyOnHome && !isHomePage()) return false;
    if (OPTIONS.renderMode === 'inject') return !!document.querySelector(OPTIONS.mountSelector);
    return true;
  }
  function whenDomReady(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function init(userOptions) {
    if (userOptions) for (var k in userOptions) if (userOptions.hasOwnProperty(k)) OPTIONS[k] = userOptions[k];
    HL_MS = OPTIONS.halfLifeDays * 86400000;
    var doRender = function () { if (shouldRenderHere()) renderHeroAd(); };
    if (OPTIONS.useFirebase) loadInventory().then(function () { whenDomReady(doRender); });
    else whenDomReady(doRender);
  }

  var API = {
    init: init,
    recordStateVisit: recordStateVisit,
    getScores: getScores,
    getDominantState: getDominantState,
    pickAd: pickAd,
    renderHeroAd: renderHeroAd,
    getStats: getStats,
    // 인벤토리 수동 제어 (Firebase 미사용 시 등)
    setInventory: function (map) { applyInventory(map); },
    setDefaults: function (arr) { DEFAULT_ADS.length = 0; [].push.apply(DEFAULT_ADS, arr || []); },
    getInventory: function () { return { states: AD_INVENTORY, defaults: DEFAULT_ADS }; },
    reloadAds: function () { return fetchFromFirestore().then(function (m) { if (m) { cacheSet(m); applyInventory(m); if (shouldRenderHere()) renderHeroAd(); } return m; }); },
    setOverride: function (s) { if (STATES.indexOf(s) !== -1) write(OPTIONS.overrideKey, s); },
    clearOverride: function () { write(OPTIONS.overrideKey, null); },
    reset: function () { write(OPTIONS.storageKey, {}); write(OPTIONS.statsKey, {}); },
    clearAdsCache: function () { write(OPTIONS.inventoryCacheKey, null); },
    config: OPTIONS, states: STATES, labels: STATE_LABELS
  };

  global.KoAusAds = API;
  if (OPTIONS.autoInit && typeof document !== 'undefined') init();

})(typeof window !== 'undefined' ? window : this);
