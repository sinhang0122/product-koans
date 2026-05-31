// ════════════════════════════════════════════════════════════════════
//  KoAus · 비밀번호 입력란 '보기/숨기기' 토글
//  - 페이지 내 모든 input[type="password"] 를 wrapper 로 감싸고 우측에 eye 버튼 부착
//  - 클릭 시 input.type 을 password ↔ text 토글 + 아이콘 모양 교체
//  - 기존 회원가입/로그인 로직은 무변경 — DOM 만 살짝 보강
// ════════════════════════════════════════════════════════════════════

(function () {
  const EYE_OPEN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.6 19.6 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.55 19.55 0 0 1-3.17 4.19"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function wireOne(input) {
    if (!input || input.dataset.pwWired === '1') return;
    if (input.type !== 'password') return;
    input.dataset.pwWired = '1';

    // 부모가 이미 wrapper 인지 확인 — 아니면 새로 감쌈
    let wrap;
    if (input.parentElement && input.parentElement.classList.contains('pw-wrap')) {
      wrap = input.parentElement;
    } else {
      wrap = document.createElement('span');
      wrap.className = 'pw-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    // 입력창 우측 여백 확보 (CSS 가 처리하지만 inline 으로도 강제)
    if (!input.style.paddingRight) input.style.paddingRight = '42px';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', '비밀번호 보기');
    btn.setAttribute('tabindex', '-1');  // 탭 이동 시 건너뛰기 (UX)
    btn.innerHTML = EYE_OFF;
    btn.addEventListener('click', () => {
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      btn.innerHTML = shown ? EYE_OFF : EYE_OPEN;
      btn.setAttribute('aria-label', shown ? '비밀번호 보기' : '비밀번호 숨기기');
      // 포커스 유지 (사용자가 계속 타이핑 가능)
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    });
    wrap.appendChild(btn);
  }

  function scan() {
    document.querySelectorAll('input[type="password"]').forEach(wireOne);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  // 동적으로 추가되는 password 인풋도 처리 — 안전을 위해 한 번 더 100ms 후 스캔
  setTimeout(scan, 200);
  setTimeout(scan, 1200);
})();
