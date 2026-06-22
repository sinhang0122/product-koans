// ════════════════════════════════════════════════════════════════════
//  KoAus · 동적 연락 버튼 렌더러
//  -----------------------------------------------------------------
//  · 게시글 상세 모달의 #contact-action-container 에 작성자 연락처에 따라
//    1~3개 버튼을 동적 inject. 데이터 없는 항목은 자동 제외.
//
//  사용법 (각 페이지의 상세 모달 렌더 함수 안에 1줄 추가):
//      window.koausContactActions && window.koausContactActions.render(post);
//
//  지원 필드 (post 데이터):
//    · post.phone      → [📞 전화] (tel:)  + [💬 문자] (sms:)
//    · post.kakaoLink  → [💛 카톡 오픈채팅] (target="_blank")
//
//  주의:
//    · 모든 사용자 입력은 escape 처리 (XSS 방어).
//    · phone: 숫자/+/공백/-/( ) 만 추출 → tel: / sms: URI 정규화.
//    · kakaoLink: http(s) 만 허용 (javascript:, data: 등 차단).
//    · 모든 필드 비어있으면 컨테이너 자체 display:none (CSS :empty 와 함께 이중 안전망).
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausContactActionsInited) return;
  window.__koausContactActionsInited = true;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 전화번호 정규화 — tel:/sms: URI 용
  //   · 한국·호주 번호 혼재 대응: 숫자, +, 공백·하이픈 보존 후 URI 인코딩
  function normalizePhone(raw) {
    if (raw == null) return '';
    const s = String(raw).trim();
    if (!s) return '';
    // 유효 문자만 — 숫자, +, 공백, -, ( ), .
    const clean = s.replace(/[^0-9+\s\-().]/g, '').trim();
    // 숫자 5자리 미만이면 유효 번호 아님
    const digits = clean.replace(/\D/g, '');
    if (digits.length < 5) return '';
    return clean;
  }

  // 외부 URL 검증 — http/https 만 허용 (javascript: 등 차단)
  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  // 주소 단축 — 주(state)·우편번호 제거 (비공개: 동네만 / 공개: 도로명+동네)
  function shortAddr(raw) {
    var a = String(raw == null ? '' : raw).trim();
    if (!a) return '';
    a = a.replace(/[,\s]+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b\s*\d{0,4}\s*$/i, '').trim();
    a = a.replace(/[,\s]+\d{4}\s*$/, '').trim();
    return a.replace(/,\s*$/, '').trim();
  }
  // 현재 보고 있는 매물의 고유 딥링크 (?id=)
  function listingLink(post) {
    var id = post && (post._fsDocId || post.fsDocId || post.id);
    if (!id) return '';
    try { return location.origin + location.pathname + '?id=' + encodeURIComponent(String(id)); }
    catch (_) { return ''; }
  }
  // KoAus 브랜드 문의 양식 본문 — 문자/메일에 자동 채움 ([KoAus] 주소 + 링크 + 입력 안내)
  function inquiryBody(post) {
    var addr = shortAddr(post && post.address);
    var link = listingLink(post);
    var lines = ['[KoAus]' + (addr ? ' ' + addr : '')];
    if (link) lines.push(link);
    lines.push('');
    lines.push('(성함과 문의 내용을 입력해 주세요)');
    return lines.join('\n');
  }

  // ── 메인 렌더 함수 ──────────────────────────────────────────────
  function render(post) {
    const container = document.getElementById('contact-action-container');
    if (!container) return;

    // ── A) contactHTML 초기화 ──
    let contactHTML = '';
    const inqBody = inquiryBody(post);   // 문자·메일 자동 채움용 KoAus 문의 양식

    // ── B) post.phone → 전화 + SMS ──
    const phone = normalizePhone(post && post.phone);
    if (phone) {
      contactHTML +=
        '<a class="contact-action-btn contact-action-btn--sms"' +
        ' href="' + esc('sms:' + phone + '?&body=' + encodeURIComponent(inqBody)) + '"' +
        ' aria-label="문자로 문의">' +
          '<span class="ca-ico" aria-hidden="true">💬</span>' +
          '<span class="ca-label">문자</span>' +
        '</a>';
    }

    // ── C) post.kakaoLink → 오픈채팅 ──
    const kakao = (post && post.kakaoLink ? String(post.kakaoLink).trim() : '');
    if (kakao && isSafeUrl(kakao)) {
      contactHTML +=
        '<a class="contact-action-btn contact-action-btn--kakao"' +
        ' href="' + esc(kakao) + '"' +
        ' target="_blank" rel="noopener noreferrer"' +
        ' aria-label="카카오톡 오픈채팅">' +
          '<span class="ca-ico" aria-hidden="true">💛</span>' +
          '<span class="ca-label">카톡</span>' +
        '</a>';
    }

    // ── D) post.contactEmail → 메일 (mailto) ── 글쓴이 연락용 이메일(선택). 형식 검증 통과 시에만 노출.
    const cmail = (post && post.contactEmail ? String(post.contactEmail).trim() : '');
    if (cmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cmail)) {
      contactHTML +=
        '<a class="contact-action-btn contact-action-btn--mail"' +
        ' href="' + esc('mailto:' + cmail + '?subject=' + encodeURIComponent('[KoAus] 매물 문의') + '&body=' + encodeURIComponent(inqBody)) + '"' +
        ' aria-label="이메일로 문의">' +
          '<span class="ca-ico" aria-hidden="true">✉️</span>' +
          '<span class="ca-label">메일</span>' +
        '</a>';
    }

    // ── E) 아무 연락처도 없으면 컨테이너 자체 hide ──
    if (!contactHTML) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.innerHTML = contactHTML;
    container.style.display = '';  // CSS 기본 flex 복원
  }

  // 외부 노출 — 각 페이지의 상세 렌더 시점에 호출
  window.koausContactActions = { render: render };

  // ── 글로벌 위임: 연락처 액세스 로그인 게이트 (지시 1/2) ─────────────────────
  //   · 셀렉터: koaus-contact-actions.js 동적 버튼(.contact-action-btn — 전화/문자/카톡)
  //             + 각 페이지 sticky 연락처 버튼(#detailContactBtn)
  //   · 비로그인 클릭 → preventDefault + alert + openAuthModal
  //   · 로그인 사용자는 그대로 통과 (자체 href / onclick 정상 작동)
  //   · capture phase + stopImmediatePropagation 으로 페이지별 cbtn.onclick / a.href 모두 차단
  document.addEventListener('click', function (e) {
    var trigger = e.target && e.target.closest && e.target.closest('.contact-action-btn, #detailContactBtn');
    if (!trigger) return;
    var user = (window.koausAuth && window.koausAuth.user) || null;
    if (user && user.uid) return;  // 로그인 OK — 통과
    // 비로그인 — 차단 + 안내 + 로그인 모달
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    try { alert('연락처 확인 및 문의를 위해서는 로그인이 필요합니다.'); } catch (_) {}
    try {
      if (window.koausAuth && window.koausAuth.openAuthModal) {
        window.koausAuth.openAuthModal();
      } else {
        // openAuthModal 미정의 페이지 — 홈으로 리다이렉트 후 로그인 유도
        location.href = 'index.html';
      }
    } catch (_) {}
  }, true);  // capture phase — 페이지별 자체 핸들러보다 먼저 가로채기
})();
