// ════════════════════════════════════════════════════════════════════
//  KoAus · 글로벌 검색 컴포넌트 (조건별 텍스트 검색)
//  - 사용법: 페이지에 한 줄만 추가
//      <div data-koaus-search="boardKey"></div>
//    페이지 본체는 핸들러를 등록:
//      window.koausSearch_boardKey = (keyword, scope) => { ... };
//    · scope: 'title' | 'body' | 'both'
//    · 핸들러는 검색 결과를 그리는 책임만 가짐 (페이지마다 데이터 구조 다르므로)
//  - 블랙 앤 화이트 톤 — 기존 .auth-input / .filter-pill 등 디자인 변수 100% 재사용
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausSearchInited) return;
  window.__koausSearchInited = true;

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function build(container) {
    if (container.__koausSearchBuilt) return;
    container.__koausSearchBuilt = true;
    const boardKey = container.getAttribute('data-koaus-search') || '';
    container.classList.add('koaus-search-bar');
    container.innerHTML =
      '<div class="koaus-search-row">' +
        '<select class="koaus-search-scope" aria-label="검색 범위">' +
          '<option value="both">제목 + 내용</option>' +
          '<option value="title">제목</option>' +
          '<option value="body">내용</option>' +
        '</select>' +
        '<input type="search" class="koaus-search-input" placeholder="키워드를 입력하세요" aria-label="검색어" />' +
        '<button type="button" class="koaus-search-btn">🔍 검색</button>' +
        '<button type="button" class="koaus-search-clear" hidden aria-label="검색 해제">✕</button>' +
      '</div>';
    const sel = container.querySelector('.koaus-search-scope');
    const inp = container.querySelector('.koaus-search-input');
    const btn = container.querySelector('.koaus-search-btn');
    const clr = container.querySelector('.koaus-search-clear');
    function fire() {
      const kw = (inp.value || '').trim();
      const sc = sel.value || 'both';
      const fn = window['koausSearch_' + boardKey];
      if (typeof fn === 'function') fn(kw, sc);
      clr.hidden = !kw;
    }
    btn.addEventListener('click', fire);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') fire(); });
    clr.addEventListener('click', () => { inp.value = ''; fire(); });
  }

  function run() {
    document.querySelectorAll('[data-koaus-search]').forEach(build);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else { run(); }
  [400, 1500].forEach(ms => setTimeout(run, ms));
})();
