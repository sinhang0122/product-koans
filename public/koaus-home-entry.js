/* ═══════════════════════════════════════════════════════════════════
   KoAus 홈 진입부 (2026-10 홈 개편) — index.html #homeEntry 전용
   ─ 타일 2개(Living · 구인구직)는 순수 링크. 이 파일은 아래 드롭다운만 다룬다.
   ─ Care+무료 통역 / 환율 계산기 드롭다운:
       · 하나만 열림(하나를 펼치면 다른 하나는 접힘)
       · 처음 펼칠 때 iframe src 세팅(care.html?embed=1 · calculator.html?embed=1 — 같은 출처,
         CSP frame-src 'self'). 접어도 다시 로드하지 않는다.
       · 자식(koaus-embed.js)이 postMessage({type:'koaus-embed-height'}) 로 보낸 높이에 맞춰
         iframe 높이를 조절 → 안쪽 스크롤 없이 홈 페이지가 자연스럽게 길어진다.
       · #care / #fx 해시(또는 ?open=care|fx) 로 들어오면 해당 칸을 자동으로 펼친다.
   ─ 환율 칸 헤더: open.er-api.com(AUD 기준, calculator.html 과 같은 API) 로 1 AUD 원화 표시.
     LS 'koaus_fx_aud_krw_v1' 에 60분 캐시, 실패 시 조용히 기본 문구 유지.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__koausHomeEntry) return;
  window.__koausHomeEntry = true;

  var root = document.getElementById('homeEntry');
  if (!root) return;

  var items = Array.prototype.slice.call(root.querySelectorAll('.home-acc-item'));
  function headOf(item)  { return item.querySelector('.home-acc-head'); }
  function bodyOf(item)  { return item.querySelector('.home-acc-body'); }
  function frameOf(item) { return item.querySelector('iframe.home-acc-frame'); }

  function ping(frame) {
    try { frame.contentWindow && frame.contentWindow.postMessage({ type: 'koaus-embed-ping' }, location.origin); } catch (e) {}
  }
  function show(item) {
    if (item.classList.contains('open')) return;
    item.classList.add('open');
    bodyOf(item).hidden = false;
    headOf(item).setAttribute('aria-expanded', 'true');
    var f = frameOf(item);
    if (f) {
      if (!f.getAttribute('src')) f.setAttribute('src', f.getAttribute('data-src'));
      else ping(f);
    }
  }
  function hide(item) {
    if (!item.classList.contains('open')) return;
    item.classList.remove('open');
    bodyOf(item).hidden = true;
    headOf(item).setAttribute('aria-expanded', 'false');
  }
  function open(item, scroll) {
    items.forEach(function (i) { if (i !== item) hide(i); });
    show(item);
    if (scroll) {
      try { item.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {}
    }
  }

  items.forEach(function (item) {
    headOf(item).addEventListener('click', function () {
      if (item.classList.contains('open')) hide(item);
      else open(item, false);
    });
  });

  /* 자식 iframe → 높이 */
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin) return;
    var d = e.data;
    if (!d || d.type !== 'koaus-embed-height' || !(d.height > 0)) return;
    items.forEach(function (item) {
      var f = frameOf(item);
      if (f && f.contentWindow === e.source) {
        var h = Math.max(240, Math.ceil(d.height) + 4);
        f.style.height = h + 'px';
      }
    });
  });

  /* 딥링크: index.html#care / #fx / ?open=care */
  function deepLink() {
    var key = '';
    try {
      var h = (location.hash || '').replace('#', '').toLowerCase();
      var q = new URLSearchParams(location.search).get('open');
      key = (q || h || '').toLowerCase();
    } catch (e) {}
    if (key === 'calculator' || key === 'exchange') key = 'fx';
    if (key !== 'care' && key !== 'fx') return;
    var item = root.querySelector('.home-acc-item[data-acc="' + key + '"]');
    if (item) setTimeout(function () { open(item, true); }, 60);
  }
  deepLink();
  window.addEventListener('hashchange', deepLink);

  /* 환율 헤더 */
  var fxEl = document.getElementById('homeFxRate');
  if (fxEl) {
    var KEY = 'koaus_fx_aud_krw_v1', TTL = 60 * 60 * 1000;
    function paint(rate, at) {
      var r = Number(rate);
      if (!(r > 0)) return;
      var txt = '1 AUD ≈ ' + r.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '원';
      var ageMin = at ? Math.round((Date.now() - at) / 60000) : 0;
      fxEl.textContent = txt + (ageMin >= 2 ? ' · ' + ageMin + '분 전 기준' : ' · 실시간 매매기준율');
      fxEl.classList.add('is-live');
    }
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (cached && cached.rate > 0 && cached.at) paint(cached.rate, cached.at);
    if (!cached || !cached.at || Date.now() - cached.at > TTL) {
      fetch('https://open.er-api.com/v6/latest/AUD', { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (j) {
          var rate = j && j.rates && j.rates.KRW;
          if (!(rate > 0)) return;
          var at = Date.now();
          paint(rate, at);
          try { localStorage.setItem(KEY, JSON.stringify({ rate: rate, at: at })); } catch (e) {}
        })
        .catch(function () {
          if (!cached) fxEl.textContent = 'AUD ↔ KRW · 송금 앱 수수료 비교';
        });
    }
  }
})();
