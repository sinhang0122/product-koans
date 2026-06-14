// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 공용 공유 (koausShare)
//  · 상세 모달의 공유 버튼(#detailShareBtn / #detailShareBtn2) 클릭을
//    capture-phase 로 가로채 → 현재 상세 글의 ?id= 딥링크를 클립보드 복사 +
//    "링크가 복사되었습니다" 토스트(koausToast). 보드별 드롭다운/네이티브
//    공유 분기는 단일 "링크 복사"로 통일.
//  · 글 식별자: window.currentDetailPost(_fsDocId || id) → __jobsDetailPostId 폴백.
//    딥링크 ?id= 로 받는 쪽이 자동 오픈하는 건 각 보드의 deep-link init 담당.
//  · 충돌 없음: koaus-save-guard(.bookmark-btn/#detailSaveBtn*),
//    koaus-report(.mini-report/.rea-report/#detailReportBtn) 와 셀렉터 비교차.
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausShare) return;

  function currentPostId() {
    const p = window.currentDetailPost;
    if (p) return String(p._fsDocId || p.fsDocId || p.id || '');
    return String(window.__jobsDetailPostId || '');
  }

  function shareUrl() {
    // 1순위: 이미 URL 에 ?id 가 있으면 그대로(딥링크로 열린 경우)
    const fromUrl = new URLSearchParams(location.search).get('id');
    const id = fromUrl || currentPostId();
    const base = location.origin + location.pathname;
    return id ? `${base}?id=${encodeURIComponent(id)}` : base;
  }

  function _legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) { return false; }
  }

  function _toast(msg) { if (window.koausToast) window.koausToast.show(msg, 2000); }

  function copyShareLink() {
    const url = shareUrl();
    const ok = () => _toast('🔗 링크가 복사되었습니다');
    const no = () => _toast('복사 실패 — 주소창 링크를 길게 눌러 복사해 주세요');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(ok, () => { _legacyCopy(url) ? ok() : no(); });
      } else { _legacyCopy(url) ? ok() : no(); }
    } catch (_) { _legacyCopy(url) ? ok() : no(); }
  }

  // capture-phase — 보드별 인라인 공유 핸들러(메뉴 토글/네이티브)보다 먼저 가로채 통일
  document.addEventListener('click', e => {
    const btn = e.target.closest('#detailShareBtn, #detailShareBtn2, [data-koaus-share]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    // 혹시 열려 있던 옛 공유 드롭다운 닫기
    const menu = document.getElementById('detailShareMenu');
    if (menu) { menu.classList.remove('open'); menu.classList.remove('show'); }
    copyShareLink();
  }, true);

  window.koausShare = { copyShareLink, shareUrl, currentPostId };
})();
