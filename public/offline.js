// ════════════════════════════════════════════════════════════════════
//  KoAus · 오프라인(Network Offline) 감지 토스트
//  - window.online / offline 이벤트 수신.
//  - 끊김 즉시 상단바 아래 가운데에 안내 카드. 복구 시 청록 점 안내(2초) 후 자동 제거.
//  - 11-17(사용자 선택 — 후보 B): 빨강·초록 그라데이션 알약 → 흰 카드(얇은 테두리 · 모서리 12px · 14px) + 왼쪽 점.
//    같은 모양: session-timeout.js(자동 로그아웃) · koaus-toast.js(공용 토스트). 모양을 바꿀 땐 세 곳을 같이.
//  - 모든 페이지에 <script src="offline.js" defer></script> 한 줄로 로드.
//  - 별도 의존성 없음 (Firebase·Swiper 등과 무관).
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausOfflineInited) return;
  window.__koausOfflineInited = true;

  function injectStyleOnce() {
    if (document.getElementById('koaus-offline-style')) return;
    const css = `
      .koaus-net-toast {
        /* 가운데 = 좌우 16px + auto 여백(left:50% 는 폭이 화면 절반으로 줄어 글이 꺾인다) */
        position: fixed; top: calc(66px + env(safe-area-inset-top, 0px)); left: 16px; right: 16px; margin: 0 auto; width: fit-content;
        transform: translateY(-12px);
        z-index: 99999;
        display: flex; align-items: center; gap: 9px;
        max-width: calc(100vw - 32px); box-sizing: border-box;
        padding: 10px 16px 10px 14px; border-radius: 12px;
        font: 600 14px/1.35 'Noto Sans KR','Urbanist',system-ui,-apple-system,sans-serif; letter-spacing: -.2px; word-break: keep-all;
        color: var(--text-primary, #111); background: var(--bg-base, #fff); border: 1px solid var(--border, #dcdcdc);
        box-shadow: 0 6px 20px rgba(0,0,0,.10);
        opacity: 0;
        transition: opacity .22s ease, transform .22s ease;
        pointer-events: none;
      }
      .koaus-net-toast.is-show {
        opacity: 1;
        transform: translateY(0);
      }
      .koaus-net-toast .net-ico { width: 8px; height: 8px; border-radius: 50%; background: #8e8e93; flex: 0 0 auto; }
      .koaus-net-toast--online .net-ico { background: #0b7a5c; }
      :root[data-theme="dark"] .koaus-net-toast { background: #111; border-color: #333; }
      :root[data-theme="dark"] .koaus-net-toast--online .net-ico { background: #5eead4; }
    `;
    const tag = document.createElement('style');
    tag.id = 'koaus-offline-style';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function ensureToast() {
    let el = document.getElementById('koausNetToast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'koausNetToast';
    el.className = 'koaus-net-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="net-ico" aria-hidden="true"></span><span class="net-msg"></span>';
    document.body.appendChild(el);
    return el;
  }

  let hideTimer = null;
  function show(kind, message, autoHideMs) {
    injectStyleOnce();
    const el = ensureToast();
    el.classList.remove('koaus-net-toast--offline', 'koaus-net-toast--online');
    el.classList.add(kind === 'online' ? 'koaus-net-toast--online' : 'koaus-net-toast--offline');
    el.querySelector('.net-ico').textContent = '';   // 11-17: 글자 대신 점(색은 --offline/--online 클래스)
    el.querySelector('.net-msg').textContent = message;
    // force reflow → transition 적용
    void el.offsetWidth;
    el.classList.add('is-show');
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (autoHideMs > 0) {
      hideTimer = setTimeout(() => {
        el.classList.remove('is-show');
      }, autoHideMs);
    }
  }
  function hide() {
    const el = document.getElementById('koausNetToast');
    if (el) el.classList.remove('is-show');
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function handleOffline() {
    show('offline', '인터넷 연결이 끊겼습니다.', 0);
  }
  function handleOnline() {
    show('online', '다시 연결되었습니다.', 2200);
  }

  function bind() {
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    // 진입 시점에 이미 오프라인이면 즉시 표시
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // body 가 아직 없을 수 있으니 DOMContentLoaded 후 시도
      if (document.body) handleOffline();
      else document.addEventListener('DOMContentLoaded', handleOffline, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
