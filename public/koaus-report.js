// ════════════════════════════════════════════════════════════════════
//  KoAus · 공용 신고 모달 (지시 6/7)
//  -----------------------------------------------------------------
//  · 모든 페이지(23) 글로벌 로드 — koaus-url-guard.js 옆 표준 위치.
//  · 4 카테고리 select + 상세 textarea → Firestore reports 컬렉션.
//  · firestore.rules: reports.create — isSignedIn + reqStr('reason') + reporterUid==auth.uid
//
//  사용:
//    window.koausReport.open({ postId, board, postTitle });
//    또는 카드/상세 신고 버튼 click 핸들러에서 한 줄로 호출.
//
//  Payload (Firestore reports/{postId}_{reporterUid}):
//    {
//      postId, board, postTitle,
//      category, reason (= category + detail 결합 — rules reqStr 호환),
//      detail,
//      reporterUid, reporterEmail,
//      postAuthorUid, postBodyExcerpt,   ← 신고 시점 스냅샷 (원글 삭제 후에도 검토 가능)
//      status: 'pending',
//      createdAt: serverTimestamp(),
//    }
//  · 문서 ID = {postId}_{reporterUid} (setDoc) — 같은 글 재신고는 rules 가 거부
//    (기존 doc 에 대한 create=update 취급 → admin 전용) → '이미 신고' 안내.
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausReport) return;

  const CATEGORIES = [
    { value: 'spam',         label: '🚫 스팸 · 홍보성 콘텐츠' },
    { value: 'fraud',        label: '⚠️ 사기 의심 (보증금/대금/허위)' },
    { value: 'inappropriate',label: '🚨 부적절한 콘텐츠 (욕설/혐오/타인 비방)' },
    { value: 'other',        label: '✏️ 기타 (직접 입력)' },
  ];
  const STYLE_ID  = 'koaus-report-style';
  const HOST_ID   = 'koaus-report-host';
  const CSS = `
    .koaus-report-overlay { position: fixed; inset: 0; z-index: 4000; background: rgba(0,0,0,0.55); display: none; align-items: center; justify-content: center; padding: 20px; }
    .koaus-report-overlay.open { display: flex; }
    .koaus-report-modal { background: var(--bg-surface, #fff); color: var(--text-primary, #111); border-radius: 14px; max-width: 480px; width: 100%; padding: 24px 20px; box-shadow: 0 16px 48px rgba(0,0,0,0.35); display: flex; flex-direction: column; gap: 14px; font-family: 'Urbanist','Noto Sans KR',sans-serif; }
    .koaus-report-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .koaus-report-title { font-size: 17px; font-weight: 900; letter-spacing: -0.01em; }
    .koaus-report-close { background: transparent; border: none; font-size: 22px; cursor: pointer; color: var(--text-muted, #777); padding: 0; line-height: 1; }
    .koaus-report-desc  { font-size: 12.5px; color: var(--text-secondary, #555); line-height: 1.5; margin: 0; }
    .koaus-report-field { display: flex; flex-direction: column; gap: 6px; }
    .koaus-report-label { font-size: 12px; font-weight: 700; color: var(--text-primary, #111); }
    .koaus-report-select, .koaus-report-textarea { padding: 10px 12px; border: 1px solid var(--border, #d4d4d4); border-radius: 8px; font-family: inherit; font-size: 13.5px; background: var(--bg-card, #fafafa); color: inherit; }
    .koaus-report-textarea { min-height: 90px; resize: vertical; }
    .koaus-report-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
    .koaus-report-btn { padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 800; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
    .koaus-report-btn--cancel { background: var(--bg-card, #fafafa); color: var(--text-primary, #111); border-color: var(--border, #d4d4d4); }
    .koaus-report-btn--submit { background: #dc2626; color: #fff; }
    .koaus-report-btn--submit:disabled { opacity: 0.6; cursor: not-allowed; }
    .koaus-report-note { font-size: 12px; min-height: 16px; }
    .koaus-report-note.is-ok    { color: #16a34a; }
    .koaus-report-note.is-error { color: #dc2626; }
  `;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement('div'); host.id = HOST_ID;
    host.className = 'koaus-report-overlay';
    host.innerHTML =
      '<div class="koaus-report-modal" role="dialog" aria-modal="true" aria-labelledby="koausReportTitle">' +
        '<div class="koaus-report-header">' +
          '<span class="koaus-report-title" id="koausReportTitle">🚨 게시글 신고</span>' +
          '<button class="koaus-report-close" type="button" aria-label="닫기">✕</button>' +
        '</div>' +
        '<p class="koaus-report-desc">신고 사유를 선택해 주세요. 접수된 내용은 운영팀이 검토 후 조치합니다.</p>' +
        '<div class="koaus-report-field">' +
          '<label class="koaus-report-label" for="koausReportCategory">신고 사유</label>' +
          '<select id="koausReportCategory" class="koaus-report-select">' +
            CATEGORIES.map(c => '<option value="' + c.value + '">' + c.label + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="koaus-report-field">' +
          '<label class="koaus-report-label" for="koausReportDetail">상세 내용 <em style="font-style:normal;color:var(--text-muted);font-weight:500;">(선택 · 기타 사유는 필수)</em></label>' +
          '<textarea id="koausReportDetail" class="koaus-report-textarea" maxlength="1000" placeholder="구체적인 상황·근거·문제 내용 등 (최대 1000자)"></textarea>' +
        '</div>' +
        '<p class="koaus-report-note" id="koausReportNote" role="status" aria-live="polite"></p>' +
        '<div class="koaus-report-actions">' +
          '<button type="button" class="koaus-report-btn koaus-report-btn--cancel" id="koausReportCancel">취소</button>' +
          '<button type="button" class="koaus-report-btn koaus-report-btn--submit" id="koausReportSubmit">신고 접수</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(host);
    return host;
  }

  let _ctx = null;
  function close() {
    const host = document.getElementById(HOST_ID);
    if (host) host.classList.remove('open');
    _ctx = null;
  }
  function open(ctx) {
    ensureStyle();
    const host = ensureHost();
    _ctx = ctx || {};
    // 초기화
    const cat = host.querySelector('#koausReportCategory');
    const det = host.querySelector('#koausReportDetail');
    const note = host.querySelector('#koausReportNote');
    if (cat) cat.value = 'spam';
    if (det) det.value = '';
    if (note) { note.textContent = ''; note.className = 'koaus-report-note'; }
    host.classList.add('open');
    // 핸들러 — 중복 바인딩 방지
    if (!host.__koausWired) {
      host.__koausWired = true;
      host.querySelector('.koaus-report-close').addEventListener('click', close);
      host.querySelector('#koausReportCancel').addEventListener('click', close);
      host.addEventListener('click', e => { if (e.target === host) close(); });
      host.querySelector('#koausReportSubmit').addEventListener('click', submit);
    }
  }

  async function submit() {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    const cat  = host.querySelector('#koausReportCategory').value || 'other';
    const det  = (host.querySelector('#koausReportDetail').value || '').trim();
    const note = host.querySelector('#koausReportNote');
    const btn  = host.querySelector('#koausReportSubmit');
    if (cat === 'other' && !det) {
      note.textContent = '기타 사유는 상세 내용을 입력해 주세요.';
      note.className = 'koaus-report-note is-error'; return;
    }
    const user = (window.koausAuth && window.koausAuth.user) || null;
    if (!user || !user.uid) {
      note.textContent = '로그인이 필요합니다.';
      note.className = 'koaus-report-note is-error';
      if (window.koausAuth && window.koausAuth.openAuthModal) setTimeout(() => window.koausAuth.openAuthModal(), 600);
      return;
    }
    if (!window.koausDb || !window.koausFs) {
      note.textContent = 'Firestore 미초기화 — 잠시 후 다시 시도해 주세요.';
      note.className = 'koaus-report-note is-error'; return;
    }
    const postId = String((_ctx && _ctx.postId) || '').trim();
    if (!postId) {
      note.textContent = '신고 대상 글을 식별하지 못했습니다 — 새로고침 후 다시 시도해 주세요.';
      note.className = 'koaus-report-note is-error'; return;
    }
    btn.disabled = true; btn.textContent = '접수 중…';
    try {
      const { setDoc, doc, serverTimestamp } = window.koausFs;
      const catLabel = (CATEGORIES.find(c => c.value === cat) || {}).label || cat;
      const reason   = catLabel + (det ? ' — ' + det : '');
      // 문서 ID = {postId}_{reporterUid} — firestore.rules 의 ID 패턴 강제와 한 쌍 (중복 신고 차단)
      await setDoc(doc(window.koausDb, 'reports', postId + '_' + user.uid), {
        postId:          postId,
        board:           String((_ctx && _ctx.board)  || 'unknown'),
        postTitle:       String((_ctx && _ctx.postTitle) || '').slice(0, 200),
        category:        cat,
        reason:          reason,        // firestore.rules reqStr('reason', 1, 1000) 호환
        detail:          det,
        reporterUid:     user.uid,
        reporterEmail:   user.email || '',
        postAuthorUid:   String((_ctx && _ctx.postAuthorUid) || '').slice(0, 128),
        postBodyExcerpt: String((_ctx && _ctx.postBodyExcerpt) || '').slice(0, 300),
        status:          'pending',
        createdAt:       serverTimestamp(),
      });
      note.textContent = '✅ 신고가 접수되었습니다. 운영팀 검토 후 조치합니다.';
      note.className = 'koaus-report-note is-ok';
      setTimeout(close, 1200);
    } catch (err) {
      console.error('[koausReport] 접수 실패', err);
      // 동일 글 재신고 = 기존 doc 의 create→update 취급 → rules 거부(permission-denied).
      // 로그인 유저의 permission-denied 는 사실상 중복 신고 케이스.
      const isDup = err && (err.code === 'permission-denied' || /permission/i.test(err.message || ''));
      note.textContent = isDup
        ? 'ℹ️ 이미 신고하신 게시글입니다. 운영팀이 검토 중입니다.'
        : '❌ 접수 실패: ' + (err && err.message ? err.message : err);
      note.className = isDup ? 'koaus-report-note is-ok' : 'koaus-report-note is-error';
      btn.disabled = false; btn.textContent = '신고 접수';
    }
  }

  window.koausReport = { open, close, CATEGORIES };

  // ── 글로벌 위임 click 핸들러 (지시 2/3) ─────────────────────────────────
  //   · 모든 페이지의 신고 트리거(.mini-report / .rea-report / #detailReportBtn) 통합.
  //   · 옛 페이지별 자체 모달이 currentDetailPost 등 누락 변수 의존으로 silent return
  //     되던 버그 일괄 해소 — capture phase + stopPropagation 으로 자체 핸들러 차단.
  //   · postId 추출 우선순위: 1) 버튼 data-id  2) 활성 상세 카드 [data-id]  3) 페이지 글로벌
  function _resolveCtx(btn) {
    var postId = (btn.dataset && btn.dataset.id) || btn.getAttribute('data-id') || '';
    if (!postId) {
      var activeCard = document.querySelector('.post-detail-overlay.open [data-id], .rea-detail [data-id]');
      if (activeCard) postId = activeCard.getAttribute('data-id') || '';
    }
    if (!postId) {
      postId = String(
        window.__koausDetailPostId ||
        window.__jobsDetailPostId  ||
        (window.currentDetailPost && window.currentDetailPost.id) ||
        ''
      );
    }
    if (!postId) {
      // 직접 링크(?id=) 진입 폴백 — 각 페이지가 pushState 로 상세 열림/닫힘과 ?id= 를
      // 동기화하므로(카드 클릭→'?id='+id, 닫기→id 제거) 상세가 열린 시점엔 신뢰 가능.
      try { postId = new URLSearchParams(location.search).get('id') || ''; } catch (_) {}
    }
    var fname = (location.pathname.split('/').pop() || '').toLowerCase().replace(/\.html$/, '');
    var board = fname || 'unknown';
    var titleEl = document.querySelector('.post-detail-overlay.open #detailNavTitle, .post-detail-overlay.open .rea-nav-title');
    var postTitle = titleEl ? (titleEl.textContent || '').trim() : '';
    // ── 신고 시점 스냅샷 (best-effort) — 원글 삭제 후에도 admin 큐에서 검토 가능 ──
    //   · 각 페이지 openDetail 이 window.currentDetailPost = p 로 노출 (2026-06 동기화).
    //   · ⚠️ stale 방어: 노출된 post 의 id 가 '신고 대상 postId 와 일치할 때만' 사용 —
    //     상세를 닫고 리스트의 다른 글 카드를 신고하면 직전 상세의 작성자가
    //     스냅샷에 박혀 admin 이 엉뚱한 계정을 정지할 수 있다. 불일치 시 공백('').
    var post = (window.currentDetailPost
                && String(window.currentDetailPost.id) === String(postId))
      ? window.currentDetailPost : null;
    var postAuthorUid = String((post && (post.uid || post.authorUid)) || '');
    if (!postAuthorUid) {
      // 카드 경유 신고 폴백 — 카드 mini-report 버튼의 data-uid (렌더 시점 작성자 uid 스냅샷)
      postAuthorUid = String((btn.dataset && btn.dataset.uid) || btn.getAttribute('data-uid') || '');
    }
    var postBodyExcerpt = (post && post.body) ? String(post.body) : '';
    if (!postBodyExcerpt && post) {
      var bodyEl = document.querySelector('.post-detail-overlay.open #detailBody');
      if (bodyEl) postBodyExcerpt = (bodyEl.textContent || '').trim();
    }
    return {
      postId: String(postId), board: board, postTitle: postTitle,
      postAuthorUid: postAuthorUid, postBodyExcerpt: postBodyExcerpt.slice(0, 300),
    };
  }
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.mini-report, .rea-report, #detailReportBtn');
    if (!btn) return;
    // 페이지 자체 핸들러 차단 — capture phase + stop
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    open(_resolveCtx(btn));
  }, true);  // capture phase — 자체 onclick/addEventListener('click') 전 가로채기
})();
