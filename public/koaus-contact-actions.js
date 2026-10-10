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
//    · post.phone      → [전화] (tel:)  + [문자] (sms:)
//    · post.kakaoLink  → [카톡 오픈채팅] (target="_blank")
//    · post.uid|authorUid + post._fsDocId|fsDocId|id
//                      → [채팅 문의] (KoAus 인앱 1:1 채팅 — order:0 풀폭 상단 행.
//                        본인 글·작성자 uid 없는 글엔 미노출. ensure-create 후 chat.html 이동)
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

  // 주소 단축 — 끝의 주(state)·우편번호만 제거 (도로명/동네는 보존).
  //   이 함수 자체는 공개/비공개를 구분하지 않는다. 비공개 분기는 inquiryBody() 가 담당
  //      (비공개는 redactAddress 로 도로명을 먼저 제거한 뒤 이 함수로 동네만 남김).
  function shortAddr(raw) {
    var a = String(raw == null ? '' : raw).trim();
    if (!a) return '';
    // 한글 현지화 주소(퀸즐랜드 주/오스트레일리아) → 영문 정규화 (공개 매물 문자도 깔끔하게)
    if (window.koausListingPrivacy && window.koausListingPrivacy.normalizeAddress) {
      a = window.koausListingPrivacy.normalizeAddress(a) || a;
    }
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
  //   · 공개 매물: 도로명+동네 (shortAddr)
  //   · 비공개 매물(locationPrivate): 도로명 절대 금지 — redactAddress(동네+주[+우편]) 후 동네만.
  //     헬퍼 없거나 redact 실패('위치 비공개') 시 주소를 통째로 생략(문자/메일 도로명 누수 0).
  function inquiryBody(post, intro) {
    var raw  = post && post.address;
    var addr;
    if (post && post.locationPrivate) {
      var red = (window.koausListingPrivacy && window.koausListingPrivacy.redactAddress)
        ? window.koausListingPrivacy.redactAddress(raw) : '';
      addr = (red && red !== '위치 비공개') ? shortAddr(red) : '';
    } else {
      addr = shortAddr(raw);
    }
    var link = listingLink(post);
    var lines = ['[KoAus]' + (addr ? ' ' + addr : '')];
    if (link) lines.push(link);
    lines.push('');
    // 자기소개서 있으면 안내문구 대신 소개글 삽입 (문자/메일/복사 공통)
    var intro_ = (typeof intro === 'string' ? intro.trim() : '');
    lines.push(intro_ ? intro_ : '(성함과 문의 내용을 입력해 주세요)');
    return lines.join('\n');
  }

  // 내 소개글 — 보드별 매핑 (2026-07 Living/Work 분리, LS 캐시는 app.js/settings 가 동기화).
  //   · accom/rent → Living ('koaus-my-intro-living', 옛 introText 시절 'koaus-my-intro' 읽기 폴백)
  //   · jobs → Work ('koaus-my-intro-work', 폴백 없음 — Living 소개글이 구인구직 문의에 새지 않게)
  //   · 그 외 전 보드(auto/points/gp/salon/restaurants/trades/car-sale/chat 등) → 빈 문자열 고정(미삽입)
  //     → inquiryBody 가 기존 "(성함과 문의 내용을 입력해 주세요)" 안내 문구로 자리를 채운다.
  //   inquiryBody 소비처(문자/메일 프리필·오픈채팅 복사) 전부 이 단일 진입점을 탄다.
  function getMyIntro() {
    var page = '';
    try { page = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '').toLowerCase(); } catch (_) { return ''; }
    try {
      if (page === 'accom' || page === 'rent') {
        return (localStorage.getItem('koaus-my-intro-living') || localStorage.getItem('koaus-my-intro') || '').trim();
      }
      if (page === 'jobs') {
        return (localStorage.getItem('koaus-my-intro-work') || '').trim();
      }
    } catch (_) {}
    return '';
  }

  // 클립보드 복사 — Promise<boolean>. secure context 우선, 실패/구형 브라우저는 execCommand 폴백.
  function _legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) { return false; }
  }
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        return navigator.clipboard.writeText(text)
          .then(function () { return true; }, function () { return _legacyCopy(text); });
      }
    } catch (_) {}
    return Promise.resolve(_legacyCopy(text));
  }

  // 토스트 — 짧은 안내 (복사됨/마이페이지 작성). alert 폴백.
  function toast(msg) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);' +
        'background:rgba(17,24,39,.94);color:#fff;padding:11px 18px;border-radius:22px;' +
        'font-size:14px;font-weight:700;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.25);' +
        'max-width:86vw;text-align:center;pointer-events:none;opacity:0;transition:opacity .18s;';
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = '1'; });
      setTimeout(function () {
        t.style.opacity = '0';
        setTimeout(function () { try { document.body.removeChild(t); } catch (_) {} }, 240);
      }, 1700);
    } catch (_) { try { alert(msg); } catch (__) {} }
  }

  var _lastPost = null;   // 가장 최근 render 된 매물 — 연락 버튼이 참조

  // ④ '연락처 보기' 중복 숨김 스타일 — 레거시 contact 가 ②/③로 승격됐을 때만 부착.
  //   페이지 코드가 render() 이후 cbtn.style.display='' 로 되살리므로(계약: text/onclick 은
  //   페이지 소유), 페이지 무수정으로 이기려면 !important 클래스가 필요.
  function _ensureDupHideStyle() {
    if (document.getElementById('koausCaDupStyle')) return;
    try {
      var st = document.createElement('style');
      st.id = 'koausCaDupStyle';
      st.textContent = '#detailContactBtn.koaus-ca-dup{display:none!important}';
      document.head.appendChild(st);
    } catch (_) {}
  }

  // ── 메인 렌더 함수 ──────────────────────────────────────────────
  //  레이아웃(사용자 확정 2026-07 — '내 소개글 복사' 버튼 폐기):
  //    그리드(존재하는 것만, 고정 순서) ② 문자 ③ 오픈채팅 ④ 연락처 보기 ⑤ 메일
  //      · order 인라인(1/2/3/4)으로 시각 순서 고정 — DOM 삽입 순서와 무관.
  //      · 개수 N → .ca-nN 클래스로 셀 폭 결정: 1=풀폭 / 2=반반 / 3=3개 / 4=2×2.
  //    '연락처 보기'(④)는 페이지별 레거시 #detailContactBtn(액션바 상단 별도 버튼)을
  //    그리드 ④ 위치로 끌어와 통합 — text/onclick(링크 열기 vs 복사)은 페이지가 그대로 소유.
  //    레거시 버튼 없는 보드(rent/car-sale/points)는 자동 skip → 무영향.
  //  레거시 contact 폴백(2026-07): 분리 필드(phone/kakaoLink)가 둘 다 없고 통합 contact 만
  //    있는 옛 글(jobs 옛 글·points·car-sale 등)은 contact 를 ②문자/③오픈채팅으로 승격 —
  //    브랜드 문의 양식([KoAus]+?id= 고유링크+안내 문구)이 레거시 글에도 적용된다.
  //    · 전화번호 형태(숫자/+/-/공백/괄호, 숫자 ≥8자리) → post.phone 취급 (sms: 프리필)
  //    · https URL + isSafeUrl → post.kakaoLink 취급 (클릭 시 양식 클립보드 복사 핸들러 그대로)
  //    · 원본 post 비변조 — 로컬 변수 매핑만 (LS 캐시 오염 금지). 분리 필드 있으면 미적용.
  //    · 승격 시 ④'연락처 보기'는 같은 값 중복이라 숨김(koaus-ca-dup).
  function render(post) {
    const container = document.getElementById('contact-action-container');
    if (!container) return;

    _lastPost = post;                          // 복사/연락처 버튼이 참조할 현재 매물
    const inqBody = inquiryBody(post, getMyIntro());   // 문자·메일 자동 채움 — 소개글 있으면 포함

    // 레거시 '연락처 보기'(#detailContactBtn) 회수 — 재렌더 innerHTML 리셋이 이전에
    // 옮긴 노드를 파괴하지 않도록, 그리드에 있던 경우 먼저 액션바로 되돌림.
    const legacy = document.getElementById('detailContactBtn');
    if (legacy && container.contains(legacy) && container.parentElement) container.parentElement.appendChild(legacy);

    // ── 레거시 통합 contact → ②/③ 승격 (로컬 매핑만 — post 원본 비변조) ──
    var phoneSrc = String((post && post.phone) || '').trim();
    var kakaoSrc = String((post && post.kakaoLink) || '').trim();
    var legacyPromoted = false;
    var contactRaw = String((post && post.contact) || '').trim();
    if (!phoneSrc && !kakaoSrc && contactRaw) {
      if (/^[0-9+\s\-().]+$/.test(contactRaw) && contactRaw.replace(/\D/g, '').length >= 8) {
        phoneSrc = contactRaw; legacyPromoted = true;          // 전화번호 형태 → ②문자
      } else if (/^https:\/\//i.test(contactRaw) && isSafeUrl(contactRaw)) {
        kakaoSrc = contactRaw; legacyPromoted = true;          // https 링크 → ③오픈채팅
      }
    }
    // 승격 시 ④ 는 같은 값 중복 → 숨김. 아니면 페이지 규칙 그대로(p.contact 있을 때만 표시).
    if (legacy) {
      _ensureDupHideStyle();
      legacy.classList.toggle('koaus-ca-dup', legacyPromoted);
    }
    const contactShown = !!(post && post.contact) && !legacyPromoted;

    // ── 그리드 버튼 — 고정 순서: [채팅(풀폭)] → 문자 → 오픈채팅 → [연락처] → 메일 ──
    let smsHTML = '', kakaoHTML = '', mailHTML = '', chatHTML = '';

    // ① KoAus 인앱 채팅 (order:0, flex-basis:100% — 풀폭 상단 행이라 N 계산 제외)
    //    · 조건: chatAllowed === true (글쓰기 옵트인) + 게시글 식별자 + 작성자 uid.
    //      chatAllowed 필드 없는 글(채팅 기능 이전 글·업체·레거시) = 전부 자동 미노출.
    //    · 본인 글 미노출 (rules 도 ownerUid != auth.uid 로 자기 채팅 차단).
    //    · 비로그인에게도 노출 — 클릭 시 아래 capture 로그인 게이트가 모달 유도.
    var chatOwner  = String((post && (post.uid || post.authorUid || post.authorId)) || '');
    var chatPostId = String((post && (post._fsDocId || post.fsDocId || post.id)) || '');
    var chatMe     = (window.koausAuth && window.koausAuth.user) || null;
    if (post && post.chatAllowed === true &&
        chatOwner.length >= 6 && chatOwner.length <= 128 &&
        chatPostId && chatPostId.length <= 100 && chatPostId.indexOf('/') === -1 &&
        !(chatMe && chatMe.uid === chatOwner)) {
      chatHTML =
        '<button type="button" class="contact-action-btn contact-action-btn--chat" style="order:0;flex-basis:100%"' +
        ' aria-label="KoAus 채팅으로 문의">' +
          '<span class="ca-ico" aria-hidden="true"></span>' +
          '<span class="ca-label">채팅 문의</span>' +
        '</button>';
    }

    // ② 문자 (post.phone → sms: · 레거시 contact 승격분 포함)  order:1
    const phone = normalizePhone(phoneSrc);
    if (phone) {
      smsHTML =
        '<a class="contact-action-btn contact-action-btn--sms" style="order:1"' +
        ' href="' + esc('sms:' + phone + '?&body=' + encodeURIComponent(inqBody)) + '"' +
        ' aria-label="문자로 문의">' +
          '<span class="ca-ico" aria-hidden="true"></span>' +
          '<span class="ca-label">문자</span>' +
        '</a>';
    }

    // ③ 오픈채팅 (post.kakaoLink · 레거시 contact 승격분 포함)  order:2
    //    승격분도 클릭 시 kakao 핸들러(inquiryBody 클립보드 복사 → 확인창 → 열기)를 그대로 탄다 —
    //    핸들러의 URL 은 _lastPost.kakaoLink(승격분엔 없음) || href 폴백이라 별도 처리 불필요.
    const kakao = kakaoSrc;
    if (kakao && isSafeUrl(kakao)) {
      kakaoHTML =
        '<a class="contact-action-btn contact-action-btn--kakao" style="order:2"' +
        ' href="' + esc(kakao) + '"' +
        ' target="_blank" rel="noopener noreferrer"' +
        ' aria-label="카카오톡 오픈채팅">' +
          '<span class="ca-ico" aria-hidden="true"></span>' +
          '<span class="ca-label">오픈채팅</span>' +
        '</a>';
    }

    // ⑤ 메일 (post.contactEmail → mailto)  order:4  (④ 연락처 보기는 레거시 노드 order:3)
    const cmail = (post && post.contactEmail ? String(post.contactEmail).trim() : '');
    if (cmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cmail)) {
      mailHTML =
        '<a class="contact-action-btn contact-action-btn--mail" style="order:4"' +
        ' href="' + esc('mailto:' + cmail + '?subject=' + encodeURIComponent('[KoAus] 매물 문의') + '&body=' + encodeURIComponent(inqBody)) + '"' +
        ' aria-label="이메일로 문의">' +
          '<span class="ca-ico" aria-hidden="true"></span>' +
          '<span class="ca-label">메일</span>' +
        '</a>';
    }

    // 아무 연락 수단도 없으면 컨테이너 자체 hide (레거시는 액션바에 남아 CSS 가 숨김)
    const hasAny = !!(chatHTML || smsHTML || kakaoHTML || mailHTML || contactShown);
    if (!hasAny) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    // 그리드 버튼 개수 N → 셀 폭 클래스 (채팅은 풀폭 별도 행이라 제외 — N=0 이면 ca-n0 무해)
    const N = (smsHTML ? 1 : 0) + (kakaoHTML ? 1 : 0) + (contactShown ? 1 : 0) + (mailHTML ? 1 : 0);

    // '내 소개글 복사' 버튼 폐기(2026-07) — 오픈채팅 클릭 시 링크·소개글 자동 복사되므로 불필요.
    //   문자·메일은 href body 로 이미 자동 채움. 앱 내 채팅은 ①(--chat)로 실현(2026-07).
    container.innerHTML =
      '<div class="contact-action-grid ca-n' + N + '">' + chatHTML + smsHTML + kakaoHTML + mailHTML + '</div>';
    container.style.display = '';  // CSS 기본 flex 복원

    // ④ 레거시 '연락처 보기' 를 그리드 order:3 위치로 이식 (text/onclick 은 페이지가 이어서 설정)
    if (legacy && contactShown) {
      const grid = container.querySelector('.contact-action-grid');
      if (grid) {
        legacy.classList.add('ca-in-grid');
        legacy.style.order = '3';
        legacy.style.display = '';
        grid.appendChild(legacy);
      }
    }
  }

  // 외부 노출 — 각 페이지의 상세 렌더 시점에 호출
  window.koausContactActions = { render: render };

  // ── 문의 클릭 로깅 — GA 이벤트 + Firestore inquiry_logs (로그인 사용자, best-effort) ──
  //   · 목적: 운영자가 admin '문의 로그' 카드에서 "문의하기를 눌렀는지" 확인 (GA 보조).
  //   · 기록 = 버튼 탭 순간만. 실제 메시지 발송/계약 성사 여부는 알 수 없음(한계).
  //   · 문서 ID = {board}_{listingId}_{uid}_{method} → 같은 사람 같은 버튼 반복은 update 로
  //     합쳐져 read/write 폭탄 방어(dedup). 실패는 전부 silent — 연락 동선 절대 방해 금지.
  function _methodOf(trigger) {
    try {
      if (trigger.id === 'detailContactBtn') return 'contact';
      var c = ' ' + (trigger.className || '') + ' ';
      if (c.indexOf('contact-action-btn--chat')  >= 0) return 'chat';
      if (c.indexOf('contact-action-btn--sms')   >= 0) return 'sms';
      if (c.indexOf('contact-action-btn--kakao') >= 0) return 'kakao';
      if (c.indexOf('contact-action-btn--mail')  >= 0) return 'mail';
    } catch (_) {}
    return 'contact';
  }
  function _boardOf() {
    try {
      var f = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
      return f || 'unknown';
    } catch (_) { return 'unknown'; }
  }
  function _docSafe(s) {
    return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
  }
  function logInquiryClick(trigger) {
    var post   = _lastPost;
    var method = _methodOf(trigger);
    var board  = _boardOf();
    var idRaw  = post && (post._fsDocId || post.fsDocId || post.id);
    var listingId = idRaw ? String(idRaw) : '';
    var title  = post && post.title ? String(post.title).slice(0, 300) : '';
    var state  = post && post.state ? String(post.state).slice(0, 12) : '';
    // 1) GA 이벤트 (gtag 있으면) — 매물 식별 안 돼도 board/method 만으로 의미 있음
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'contact_click', {
          method: method, board: board,
          listing_id: listingId, listing_title: title
        });
      }
    } catch (_) {}
    // 2) Firestore inquiry_logs — 로그인 + 핸들 + listingId 있을 때만 (rules: uid 일치·필드 필수)
    try {
      var user = (window.koausAuth && window.koausAuth.user) || null;
      var db = window.koausDb, fs = window.koausFs;
      if (!user || !user.uid || !db || !fs || !fs.doc || !fs.setDoc || !fs.serverTimestamp || !listingId) return;
      var docId = [_docSafe(board), _docSafe(listingId), _docSafe(user.uid), _docSafe(method)].join('_');
      var payload = { board: board, listingId: listingId, method: method, uid: user.uid, at: fs.serverTimestamp() };
      if (title) payload.listingTitle = title;
      if (state) payload.state = state;
      var nick = '';
      try { nick = (localStorage.getItem('koaus-nickname') || '').trim(); } catch (_) {}
      if (nick) payload.nickname = nick.slice(0, 100);
      var p = fs.setDoc(fs.doc(db, 'inquiry_logs', docId), payload, { merge: true });
      if (p && p.catch) p.catch(function () {});
    } catch (_) {}
  }

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
    if (user && user.uid) { try { logInquiryClick(trigger); } catch (_) {} return; }  // 로그인 OK — 로깅 후 통과
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

  // ── 오픈채팅: 링크·소개글 자동 복사 → 가벼운 확인창 → 열기 (2026-07) ─────────
  //   · 옛 바텀시트(문의문 미리보기)는 렌더가 느려 폐기 — "탭 → 자동 복사 →
  //     깔끔한 확인창 → 열기" 경량 동선으로 교체.
  //   · 소개글 있음: [주소 + 링크 + 소개글] 복사 / 없음: [주소 + 링크] 복사 + 작성 유도 안내.
  //   · 비로그인은 위 capture 게이트가 먼저 차단 → 여기 도달 안 함.
  //   · 복사 실패해도 확인창·열기는 진행 (연락 동선 절대 차단 금지).
  //   · JS 오류 시 <a href> 기본 동작(직행)이 폴백.
  function _openExternal(url) {
    var w = null;
    try { w = window.open(url, '_blank', 'noopener'); } catch (_) {}
    if (!w) { try { location.href = url; } catch (_) {} }
  }
  function _gaKakao(action) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'openchat_copy', { action: action, board: _boardOf() });
      }
    } catch (_) {}
  }
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.contact-action-btn--kakao');
    if (!btn) return;
    var user = (window.koausAuth && window.koausAuth.user) || null;
    if (!user || !user.uid) return;  // 비로그인 — capture 게이트가 처리
    var url = (_lastPost && _lastPost.kakaoLink ? String(_lastPost.kakaoLink).trim() : '') ||
              btn.getAttribute('href') || '';
    if (!isSafeUrl(url)) return;     // 이상 링크 — 기본 동작에 맡김 (렌더가 이미 검증)
    e.preventDefault();
    var intro = getMyIntro();
    copyText(inquiryBody(_lastPost, intro)).then(function (ok) {
      _gaKakao(ok ? 'copied' : 'copyfail');
      var msg;
      if (!ok) {
        // 복사 실패 — 성공 문구 노출 금지 (신뢰 훼손)
        msg = '복사에 실패했습니다. 오픈채팅을 열까요?';
      } else if (intro) {
        msg = '소개글이 복사됐습니다.\n오픈채팅을 열까요?';
      } else {
        msg = '매물 링크가 복사됐습니다.\n오픈채팅을 열까요?';
      }
      var go = true;
      try { go = window.confirm(msg); } catch (_) { go = true; }
      if (go) _openExternal(url);
    });
  });

  // ── KoAus 인앱 채팅: ensure-create → chat.html 이동 (2026-07) ────────────
  //   · chatId = {postId}_{문의자uid} 고정 (rules 가 강제) — 같은 글 재문의는 기존 방 재사용.
  //   · create-first 전략: setDoc 성공 → 이동. 거부(permission-denied) 는
  //     ① 방이 이미 존재(setDoc 이 update 취급 → affectedKeys 화이트리스트 밖이라 거부)
  //     ② 미인증(SMS)/정지 — getDoc 으로 구분 (존재+참여자면 get 허용 → 이동).
  //     get-first 로 바꾸지 말 것 — 미존재 doc get 은 rules 가 거부해
  //        '없음'과 '권한없음'을 클라가 구분 못 한다 (denied 확인 후 create 불가).
  //   · 비로그인은 위 capture 게이트가 먼저 차단 → 여기 도달 안 함.
  //   · inquiry_logs(method:'chat') 기록도 capture 게이트의 logInquiryClick 이 담당.
  var _chatBusy = false;
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.contact-action-btn--chat');
    if (!btn) return;
    var user = (window.koausAuth && window.koausAuth.user) || null;
    if (!user || !user.uid) return;              // 비로그인 — capture 게이트가 처리
    e.preventDefault();
    if (_chatBusy) return;                       // 더블탭 방지
    var post     = _lastPost;
    var ownerUid = String((post && (post.uid || post.authorUid || post.authorId)) || '');
    var postId   = String((post && (post._fsDocId || post.fsDocId || post.id)) || '');
    if (!ownerUid || !postId) return;
    if (ownerUid === user.uid) { toast('본인이 작성한 글입니다.'); return; }
    var db = window.koausDb, fs = window.koausFs;
    if (!db || !fs || !fs.doc || !fs.setDoc || !fs.serverTimestamp) {
      toast('채팅을 열 수 없습니다. 새로고침 후 다시 시도해 주세요.'); return;
    }
    var chatId = postId + '_' + user.uid;
    var goRoom = function () { location.href = 'chat.html?id=' + encodeURIComponent(chatId); };
    // rules hasOnly 14필드 — optStr 필드는 빈 값이면 아예 생략 (스냅샷 닉/제목)
    var payload = {
      postId: postId,
      board: _boardOf(),
      ownerUid: ownerUid,
      inquirerUid: user.uid,
      participants: [ownerUid, user.uid],       // [0]=글쓴이 [1]=문의자 — rules 순서 강제
      unreadFor: [],
      blockedBy: [],
      createdAt: fs.serverTimestamp()
    };
    var pTitle = (post && post.title ? String(post.title).trim().slice(0, 200) : '');
    if (pTitle) payload.postTitle = pTitle;
    var oNick = String((post && (post.author || post.nickname)) || '').trim().slice(0, 60);
    if (oNick) payload.ownerNick = oNick;
    var iNick = '';
    try { iNick = (localStorage.getItem('koaus-nickname') || '').trim().slice(0, 60); } catch (_) {}
    if (iNick) payload.inquirerNick = iNick;
    _chatBusy = true;
    btn.disabled = true;
    var done = function () { _chatBusy = false; try { btn.disabled = false; } catch (_) {} };
    var denyMsg = '채팅을 시작할 수 없습니다.\n휴대폰(SMS) 본인 인증을 완료했는지 확인해 주세요.';
    fs.setDoc(fs.doc(db, 'chats', chatId), payload)
      .then(function () { done(); goRoom(); })
      .catch(function () {
        if (!fs.getDoc) { done(); goRoom(); return; }   // getDoc 미브리지 — 이동 후 chat.html 이 판별
        fs.getDoc(fs.doc(db, 'chats', chatId))
          .then(function (snap) {
            done();
            if (snap && snap.exists()) { goRoom(); }     // v9+ modular — exists 는 메서드
            else { try { alert(denyMsg); } catch (_) {} }
          })
          .catch(function () { done(); try { alert(denyMsg); } catch (_) {} });
      });
  });
})();
