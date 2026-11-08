/* ═══════════════════════════════════════════════════════════════════
   KoAus · 주(State) 고르기 공통 (11-08, 사용자 지시 2번)
   ─ [전체 ▾] / [QLD ▾] 드롭다운 자리: 데스크탑은 상단바 햄버거 옆, 모바일은 지도 풀스크린 헤더 햄버거 옆(koaus-map-header.js)
     + 목록 화면의 보기 토글(List View|Map View) 옆(상단바는 모바일에서 자리가 없어 숨김 — 로그인·가·달·햄버거로 꽉 참).
     고르면 기기에 저장(LS koaus-state-pref-v1)하고 같은 페이지를 ?state= 로 다시 연다.
   ─ 보드 페이지(accom/rent/jobs)는 주소에 ?state= 가 없으면 이 저장값을 currentState 로 쓴다
     (각 페이지 인라인 스크립트가 LS 를 직접 읽음 — 이 파일보다 먼저 실행되기 때문).
     '전체' = 저장값 없음 → 모든 주 글 + 지도 전국(Living·Job 동일).
   ─ 주소의 ?state= 가 있으면 그게 우선(공유 링크 의도 존중). 드롭다운도 그 값을 보여 준다.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausStatePick) return;
  var KEY = 'koaus-state-pref-v1';
  var STATES = [['', '전체'], ['qld', 'QLD'], ['nsw', 'NSW'], ['vic', 'VIC'], ['wa', 'WA'], ['sa', 'SA'], ['act', 'ACT'], ['tas', 'TAS'], ['nt', 'NT']];
  var PAGE_RE = /(^|_)(accom|rent|jobs)\.html$/;   // 상단바에 드롭다운을 두는 페이지(지도가 있는 보드)

  function valid(v) { return STATES.some(function (s) { return s[0] === v; }); }
  function fromUrl() { try { var v = (new URLSearchParams(location.search).get('state') || '').toLowerCase(); return valid(v) ? v : ''; } catch (_) { return ''; } }
  function pref() { try { var v = (localStorage.getItem(KEY) || '').toLowerCase(); return valid(v) ? v : ''; } catch (_) { return ''; } }
  function effective() { return fromUrl() || pref(); }
  function set(v) { v = valid(v) ? v : ''; try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (_) {} }
  // 고른 주로 같은 페이지 다시 열기 — 글 딥링크(id)·페이지 번호는 떼고, 나머지(mode·category 등)는 유지
  function go(v) {
    set(v);
    var q;
    try { q = new URLSearchParams(location.search); } catch (_) { q = new URLSearchParams(''); }
    q.delete('state'); q.delete('id'); q.delete('page');
    if (v) q.set('state', v);
    var s = q.toString();
    location.href = location.pathname + (s ? '?' + s : '');
  }
  function label(v) { var s = STATES.filter(function (x) { return x[0] === v; })[0]; return s ? s[1] : '전체'; }

  var css =
    '.koaus-state-sel{appearance:none;-webkit-appearance:none;height:38px;box-sizing:border-box;padding:0 22px 0 10px;' +
      'border:1px solid var(--border,#e0e0e0);border-radius:var(--r-sm,6px);color:var(--text-primary,#111);' +
      'background:var(--bg-base,#fff) url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23777\' stroke-width=\'2.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M6 9.5 12 15.5 18 9.5\'/></svg>") no-repeat right 7px center/11px 11px;' +
      'font:800 13px/1 var(--font),"Noto Sans KR",system-ui,sans-serif;letter-spacing:-.2px;cursor:pointer;' +
      'transition:background-color .15s,border-color .15s,color .15s;}' +
    '.koaus-state-sel:hover{border-color:var(--accent,#111);color:var(--accent,#111);}' +
    '.koaus-state-sel:focus{outline:none;border-color:var(--accent,#111);}' +
    '.koaus-state-sel.is-set{border-color:var(--text-primary,#111);}' +
    '.accom-controls .koaus-state-sel{height:34px;display:none;}' +
    '@media(max-width:768px){.topbar .koaus-state-sel{display:none;}.accom-controls .koaus-state-sel{display:inline-block;}}';

  function injectCss() {
    if (document.getElementById('koaus-state-pick-style')) return;
    var st = document.createElement('style'); st.id = 'koaus-state-pick-style'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  // 드롭다운 한 개 만들기(상단바·지도 헤더가 각자 호출). cls: 추가 클래스
  function makeSelect(cls) {
    injectCss();
    var sel = document.createElement('select');
    var cur = effective();
    sel.className = 'koaus-state-sel' + (cls ? ' ' + cls : '') + (cur ? ' is-set' : '');
    sel.setAttribute('aria-label', '주(State) 고르기');
    sel.title = '주(State) 고르기 — 목록과 지도가 이 주로 바뀝니다';
    sel.innerHTML = STATES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === cur ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
    sel.addEventListener('change', function () { go(sel.value); });
    return sel;
  }
  function currentFile() { var p = (location.pathname || '').split('/').pop().toLowerCase(); return p || 'index.html'; }
  // 상단바: 햄버거 바로 앞
  function mountTopbar() {
    if (!PAGE_RE.test(currentFile())) return;
    if (document.querySelector('.topbar .koaus-state-sel')) return;
    var ham = document.getElementById('hamburgerBtn');
    if (!ham || !ham.parentNode) return;
    ham.parentNode.insertBefore(makeSelect('topbar-state-sel'), ham);
  }
  // 목록 화면 보기 토글 옆(모바일에서만 보임)
  function mountControls() {
    if (!PAGE_RE.test(currentFile())) return;
    var vt = document.getElementById('viewToggle');
    if (!vt || !vt.parentNode || vt.parentNode.querySelector('.koaus-state-sel')) return;
    vt.parentNode.insertBefore(makeSelect('ctrl-state-sel'), vt.nextSibling);
  }
  function mountAll() { mountTopbar(); mountControls(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll); else mountAll();

  window.koausStatePick = { KEY: KEY, STATES: STATES, get: effective, pref: pref, fromUrl: fromUrl, set: set, go: go, label: label, makeSelect: makeSelect };
})();
