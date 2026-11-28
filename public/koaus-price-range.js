/* ══════════════════════════════════════════════════════════════════
   KoAus · 가격 범위(쉐어 · 렌트 상세 필터) — 이중 슬라이더 + 가격대 막대그래프 (11-28b)
   ─ 사용자 지시(11-28): "가격 설정할 때 내가 예를 들어 시드니 cbd쪽에 했어 그럼 다른 어플처럼 글 개수에 따라서 막대그래프 같이 뜨는 거" ·
     "가격슬라이더 쉐어도 9999로 둘다 9999". 물어서 받은 결정: 눈금은 '지금 보는 글들의 가격대에 맞춤', 오른쪽 끝은 $9999(위쪽 제한 없음).
   ─ 값: lo ~ hi(달러 / 주). 처음 값 $0 ~ $9999. hi 가 9999 면 위쪽 제한이 없다(그보다 비싼 글도 빠지지 않는다).
     숫자 칸에는 0 ~ 9999 를 직접 넣을 수 있다(10 단위로 맞춘다).
   ─ 눈금: 슬라이더와 막대그래프는 $0 ~ $T 를 넓게 보여 준다. T 는 지금 목록과 같은 조건(주 · 지도에서 정한 지역 · 방 형태 …)에서
     '가격 조건만 뺀' 글들의 가격으로 정한다 — 아주 비싼 글 몇 건이 눈금을 늘이지 않게 90% 지점의 1.5배까지만 보고, 보기 좋은 수로 올린다.
     슬라이더의 맨 오른쪽 끝이 $9999 다(그래프 오른쪽 끝의 "$T+"). $T 자리와 맨 오른쪽 사이에는 빈 자리를 조금 둔다(폭의 6% 쯤) —
     맨 오른쪽에 있는 손잡이가 막대를 가리지 않게. 그 빈 자리에서는 값이 $9999 로 붙는다. T 보다 큰 값을 숫자 칸에 넣으면 눈금이 그 값까지 늘어난다.
   ─ 막대: $0 ~ $T 를 24칸으로 나눠 칸마다 글 수(T 보다 비싼 글은 마지막 칸). 고른 범위 안의 막대는 진하게, 밖은 옅게.
     가격이 없는 글('가격 협의')은 막대에 들어가지 않는다(목록에서는 전처럼 가격 조건과 상관없이 보인다).
   ─ 게시판 화면과의 약속 — 화면의 인라인 스크립트가 먼저 돌고 이 파일(defer)이 뒤에 돈다:
       window.__koausPriceHost = { board: 'accom' | 'rent', prices: () => [가격 조건만 뺀 글들의 가격(숫자)] };
       화면은 거를 때 koausPriceRange.get() → { lo, hi } 를 쓴다(이 파일이 없으면 조건 없음으로 본다).
       초기화는 koausPriceRange.reset(), 조건이 걸려 있는지는 koausPriceRange.active().
     상세 필터 창이 열릴 때 · 창 안의 다른 조건을 바꿀 때 · 화면이 koausPriceRange.touch() 를 부를 때(목록을 다시 그릴 때) 그래프를 다시 센다.
   ─ 싣는 주소: accom · rent 가 koaus-price-range.js?v=1128b 로 싣는다(js 는 한 시간 캐시 — 이 파일을 고치면 두 화면의 v 도 함께 바꾼다).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausPriceRange) return;
  var MAX = 9999, STEP = 10, BARS = 24, THUMB = 26;
  var LO_MAX = 9980;   // 아래쪽 값의 한계(위쪽 값과 10 이상 벌어져야 한다)
  // 화면마다의 칸 이름 · 글이 없을 때의 눈금(top) · 눈금의 아래 한계(floor)
  var CFG = {
    accom: { root: 'filterSharePriceRange', min: 'fbPriceMin', max: 'fbPriceMax', minTxt: 'fbPriceMinInput', maxTxt: 'fbPriceMaxInput', fill: 'filterSharePriceFill', label: 'filterSharePriceLabel', hidden: 'fbPrice', top: 600, floor: 300 },
    rent: { root: 'filterPriceRange', min: 'filterPriceMin', max: 'filterPriceMax', minTxt: 'filterPriceMinInput', maxTxt: 'filterPriceMaxInput', fill: 'filterPriceFill', label: 'filterPriceLabel', hidden: null, top: 1500, floor: 600 },
  };
  var $ = function (id) { return id ? document.getElementById(id) : null; };

  // ── 셈(화면 없이도 돈다 — 시험에서 따로 부른다) ──
  // 보기 좋은 수로 올림: ~300 은 50 단위, ~1000 은 100 단위, ~3000 은 250 단위, 그 위는 500 단위
  function nice(v) {
    v = Math.max(0, Number(v) || 0);
    var u = v <= 300 ? 50 : v <= 1000 ? 100 : v <= 3000 ? 250 : 500;
    return Math.ceil(v / u - 1e-9) * u;
  }
  // 값을 0 ~ 9999 로, 10 단위로(9990 을 넘으면 9999)
  function norm(v) {
    v = Math.round((Number(v) || 0) / STEP) * STEP;
    if (v > MAX - STEP) return MAX;
    return Math.max(0, v);
  }
  function clean(prices) {
    return (Array.isArray(prices) ? prices : []).map(Number).filter(function (v) { return isFinite(v) && v > 0; }).sort(function (a, b) { return a - b; });
  }
  // 눈금의 위쪽 끝 T — 글의 가격으로 정하고, 고른 범위(lo · hi)가 눈금 안에 들어오게 넓힌다
  function fitTop(prices, cfg, lo, hi) {
    var a = clean(prices), t = cfg.top;
    if (a.length) {
      var p90 = a[Math.min(a.length - 1, Math.round(0.9 * (a.length - 1)))], max = a[a.length - 1];
      t = Math.max(cfg.floor, nice(Math.min(max, p90 * 1.5) * 1.05));
    }
    if (hi < MAX) t = Math.max(t, nice(hi));
    if (lo > 0) t = Math.max(t, nice(lo + STEP));
    return Math.min(MAX - 9, Math.max(STEP * 2, t));   // 9990 까지(맨 오른쪽 한 칸은 9999 의 자리)
  }
  // 막대: $0 ~ $T 를 BARS 칸으로 — T 보다 비싼 글은 마지막 칸
  function buckets(prices, T) {
    var c = new Array(BARS).fill(0), w = T / BARS;
    clean(prices).forEach(function (v) { c[Math.min(BARS - 1, Math.floor(v / w))]++; });
    return c;
  }
  // i 번째 막대가 고른 범위 안인가 — 칸 [i·w, (i+1)·w) 가 lo ~ hi 와 겹치면(마지막 칸은 T 이상 전부)
  function barOn(i, T, lo, hi) {
    var w = T / BARS, a = i * w, b = (i === BARS - 1) ? Infinity : (i + 1) * w;
    return b > lo && a <= (hi >= MAX ? Infinity : hi);
  }

  var board = null, cfg = null, el = {}, lo = 0, hi = MAX, T = 0, counts = [], total = 0, mounted = false, timer = 0;
  var K = function () { return Math.round(T / STEP); };                       // $0 ~ $T 의 칸 수(슬라이더 자리 0 ~ K)
  var G = function () { return Math.max(1, Math.round(K() * 0.06)); };        // $T 자리와 맨 오른쪽($9999) 사이의 빈 자리(칸 수) — 맨 오른쪽 손잡이가 막대를 가리지 않게
  var END = function () { return K() + G(); };                                // 슬라이더의 맨 오른쪽 자리 = $9999
  var posLo = function () { return Math.min(K(), Math.round(lo / STEP)); };
  var posHi = function () { return hi >= MAX ? END() : Math.min(K(), Math.max(1, Math.round(hi / STEP))); };
  var priceAt = function (pos) { return pos > K() ? MAX : pos * STEP; };      // $T 자리를 넘으면(빈 자리) $9999

  function injectCss() {
    if (document.getElementById('koaus-price-range-style')) return;
    var st = document.createElement('style'); st.id = 'koaus-price-range-style';
    st.textContent =
      /* 막대그래프 — 슬라이더 줄 바로 위에 붙는다(아래쪽이 줄의 윗선). 손잡이 중심이 움직이는 폭(양쪽 13px 안쪽)에 맞춘다 */
      '.kpr-hist{display:flex;align-items:flex-end;gap:2px;height:48px;margin:8px 0 -29px;padding:0 13px;box-sizing:border-box;pointer-events:none;}' +
      '.kpr-hist[hidden]{display:none;}' +
      '.kpr-hist i{display:block;flex:1 1 0;min-width:0;height:0;border-radius:2px 2px 0 0;background:var(--border,#d9d9d9);}' +
      '.kpr-hist i.on{background:var(--text-primary,#111);}' +
      '.kpr-axis{display:flex;justify-content:space-between;margin:-2px 0 0;padding:0 2px;font:700 11px/1.3 "Urbanist","Noto Sans KR",sans-serif;letter-spacing:.01em;color:var(--text-muted,#777);pointer-events:none;}' +
      ':root[data-theme="dark"] .kpr-hist i{background:#3a3a3a;}' +
      ':root[data-theme="dark"] .kpr-hist i.on{background:#fff;}';
    document.head.appendChild(st);
  }

  // 화면에 그린다 — 손잡이 자리 · 숫자 칸 · 채운 줄 · 글자 · 막대의 진하기
  function paint() {
    if (!mounted) return;
    var k = K(), end = END(), a = posLo(), b = posHi();
    el.min.min = '0'; el.min.max = String(end); el.min.step = '1';
    el.max.min = '0'; el.max.max = String(end); el.max.step = '1';
    el.min.value = String(a); el.max.value = String(b);
    el.min.setAttribute('aria-valuetext', '$' + lo); el.max.setAttribute('aria-valuetext', '$' + hi);
    if (el.minTxt && document.activeElement !== el.minTxt) el.minTxt.value = String(lo);
    if (el.maxTxt && document.activeElement !== el.maxTxt) el.maxTxt.value = String(hi);
    if (el.fill) {   // 손잡이 중심 = 13px + (폭 − 26px) × 자리 / 맨 오른쪽 자리
      el.fill.style.left = 'calc(' + (THUMB / 2) + 'px + (100% - ' + THUMB + 'px) * ' + (a / end).toFixed(5) + ')';
      el.fill.style.right = 'calc(' + (THUMB / 2) + 'px + (100% - ' + THUMB + 'px) * ' + (1 - b / end).toFixed(5) + ')';
    }
    if (el.label) el.label.textContent = '$' + lo + ' to $' + hi;
    if (el.hidden) el.hidden.value = hi < MAX ? String(hi) : '';   // 쉐어의 옛 칸(#fbPrice — 최근 검색 기록이 읽는다): 위쪽 제한이 없으면 비운다
    if (el.hist) {
      var bars = el.hist.children;
      for (var i = 0; i < bars.length; i++) bars[i].classList.toggle('on', barOn(i, T, lo, hi));
      // 막대 영역은 $0 ~ $T 까지만(그 오른쪽은 빈 자리 — 맨 오른쪽 손잡이의 자리)
      el.hist.style.paddingRight = 'calc(' + (THUMB / 2) + 'px + (100% - ' + THUMB + 'px) * ' + ((end - k) / end).toFixed(5) + ')';
    }
    if (el.axis) { var s = el.axis.children; s[0].textContent = '$0'; s[1].textContent = '$' + Math.round(T / 2); s[2].textContent = '$' + T + '+'; }
  }
  // 글의 가격을 다시 세어 눈금 · 막대를 맞춘다
  function refresh() {
    if (!mounted) return;
    var prices = [];
    try { var h = window.__koausPriceHost; if (h && typeof h.prices === 'function') prices = h.prices() || []; } catch (_) { prices = []; }
    T = fitTop(prices, cfg, lo, hi);
    counts = buckets(prices, T); total = clean(prices).length;
    var top = Math.max.apply(null, counts.concat([1]));
    if (el.hist) {
      if (el.hist.children.length !== BARS) { el.hist.innerHTML = new Array(BARS + 1).join('<i></i>'); }
      for (var i = 0; i < BARS; i++) el.hist.children[i].style.height = counts[i] ? Math.max(4, Math.round(48 * counts[i] / top)) + 'px' : '0';
      el.hist.hidden = total === 0;
    }
    paint();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 30); }

  function set(v) {
    v = v || {};
    var nlo = ('lo' in v) ? norm(v.lo) : lo, nhi = ('hi' in v) ? norm(v.hi) : hi;
    if (nlo > LO_MAX) nlo = LO_MAX;
    // 아래쪽 값은 위쪽 값보다 10 이상 작아야 한다 — 방금 바꾼 쪽은 두고 다른 쪽을 민다(keep 이 가리키는 쪽이 '두는 쪽')
    if (nlo > nhi - STEP) { if (v.keep === 'lo') nhi = norm(nlo + STEP); else nlo = Math.max(0, Math.min(LO_MAX, (nhi >= MAX ? LO_MAX + STEP : nhi) - STEP)); }
    lo = nlo; hi = nhi;
    // 숫자 칸으로 넣은 값이 눈금 밖이면 눈금을 다시 맞춘다(손잡이를 끄는 동안에는 눈금을 바꾸지 않는다)
    if (!v.drag && ((hi < MAX && hi > T) || lo >= T)) refresh(); else paint();
  }

  function mount() {
    if (mounted) return true;
    board = (window.__koausPriceHost && window.__koausPriceHost.board) || (document.getElementById(CFG.accom.root) ? 'accom' : document.getElementById(CFG.rent.root) ? 'rent' : null);
    cfg = board && CFG[board]; if (!cfg) return false;
    el = { root: $(cfg.root), min: $(cfg.min), max: $(cfg.max), minTxt: $(cfg.minTxt), maxTxt: $(cfg.maxTxt), fill: $(cfg.fill), label: $(cfg.label), hidden: $(cfg.hidden) };
    if (!el.root || !el.min || !el.max) return false;
    injectCss();
    el.hist = document.createElement('div'); el.hist.className = 'kpr-hist'; el.hist.setAttribute('aria-hidden', 'true'); el.hist.hidden = true;
    el.root.parentNode.insertBefore(el.hist, el.root);
    el.axis = document.createElement('div'); el.axis.className = 'kpr-axis'; el.axis.setAttribute('aria-hidden', 'true'); el.axis.innerHTML = '<span></span><span></span><span></span>';
    el.root.parentNode.insertBefore(el.axis, el.root.nextSibling);
    [el.minTxt, el.maxTxt].forEach(function (t) { if (t) { t.min = '0'; t.max = String(MAX); t.step = String(STEP); } });
    el.min.setAttribute('aria-label', '최소 가격'); el.max.setAttribute('aria-label', '최대 가격');
    T = cfg.top; mounted = true;
    // 손잡이를 끌 때 — 끈 쪽만 그 자리의 값으로(다른 쪽이 숫자 칸으로 넣은 '눈금 밖의 값'이어도 그대로 둔다)
    //   아래쪽 손잡이는 $T−10 까지(자리 K−1). 위쪽 손잡이는 $T(자리 K)를 넘으면 맨 오른쪽($9999)에 붙는다
    el.min.addEventListener('input', function () { set({ lo: priceAt(Math.max(0, Math.min(K() - 1, Number(el.min.value)))), keep: 'hi', drag: true }); });
    el.max.addEventListener('input', function () { set({ hi: priceAt(Math.max(1, Number(el.max.value))), keep: 'lo', drag: true }); });
    // 자판으로 — 맨 오른쪽($9999)에서 왼쪽 화살표를 누르면 $T 로(빈 자리에서는 값이 $9999 로 붙으므로 한 칸씩으로는 빠져나오지 못한다)
    el.max.addEventListener('keydown', function (e) {
      if (hi >= MAX && (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown')) { e.preventDefault(); set({ hi: T, keep: 'lo', drag: true }); }
    });
    // 숫자 칸에 넣을 때
    var typed = function (e) { if (e.target === el.minTxt) set({ lo: e.target.value, keep: 'hi' }); else set({ hi: e.target.value === '' ? MAX : e.target.value, keep: 'lo' }); };
    [el.minTxt, el.maxTxt].forEach(function (t) { if (t) { t.addEventListener('input', typed); t.addEventListener('change', typed); t.addEventListener('blur', paint); } });
    // 상세 필터 창이 열릴 때 · 창 안의 다른 조건이 바뀔 때 다시 센다
    var ovl = document.getElementById('filterOverlay');
    if (ovl) {
      try { new MutationObserver(function () { if (ovl.classList.contains('open')) schedule(); }).observe(ovl, { attributes: true, attributeFilter: ['class'] }); } catch (_) {}
      var other = function (e) { if (!ovl.classList.contains('open')) return; var t = e.target; if (t === el.min || t === el.max || t === el.minTxt || t === el.maxTxt) return; schedule(); };
      ovl.addEventListener('change', other); ovl.addEventListener('click', other);
    }
    refresh();
    return true;
  }

  window.koausPriceRange = {
    MAX: MAX, STEP: STEP, BARS: BARS,
    get: function () { return { lo: lo, hi: hi }; },
    active: function () { return lo > 0 || hi < MAX; },
    set: function (v) { set(v); },
    reset: function () { lo = 0; hi = MAX; refresh(); },
    refresh: refresh,
    // 화면이 목록을 다시 그릴 때 부른다 — 창이 열려 있을 때만 다시 센다(글은 화면이 뜬 뒤에 서버에서 들어온다)
    touch: function () { var o = document.getElementById('filterOverlay'); if (mounted && o && o.classList.contains('open')) schedule(); },
    state: function () { return { board: board, lo: lo, hi: hi, T: T, counts: counts.slice(), total: total, mounted: mounted }; },
    _calc: { nice: nice, norm: norm, fitTop: fitTop, buckets: buckets, barOn: barOn, CFG: CFG },   // 시험용
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
