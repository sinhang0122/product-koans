// ════════════════════════════════════════════════════════════════════
//  KoAus · 오프라인(Network Offline) 감지 토스트
//  - window.online / offline 이벤트 수신.
//  - 끊김 즉시 상단 중앙에 빨간 토스트 표시. 복구 시 초록 토스트(2초) 후 자동 제거.
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
        position: fixed; top: 14px; left: 50%; transform: translateX(-50%) translateY(-110%);
        z-index: 99999;
        display: flex; align-items: center; gap: 8px;
        max-width: calc(100vw - 32px);
        padding: 11px 18px; border-radius: 999px;
        font: 600 13.5px/1.3 'Noto Sans KR','Urbanist',system-ui,-apple-system,sans-serif;
        color: #fff;
        box-shadow: 0 10px 30px rgba(0,0,0,.18);
        opacity: 0;
        transition: opacity .25s ease, transform .35s cubic-bezier(.2,.7,.3,1);
        pointer-events: none;
        white-space: nowrap;
      }
      .koaus-net-toast.is-show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      .koaus-net-toast--offline {
        background: linear-gradient(135deg, #b91c1c 0%, #ef4444 100%);
      }
      .koaus-net-toast--online {
        background: linear-gradient(135deg, #047857 0%, #10b981 100%);
      }
      .koaus-net-toast .net-ico { font-size: 16px; line-height: 1; flex-shrink: 0; }
      @supports (padding: max(0px)) {
        .koaus-net-toast { top: max(14px, env(safe-area-inset-top)); }
      }
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
    el.innerHTML = '<span class="net-ico" aria-hidden="true">⚠</span><span class="net-msg"></span>';
    document.body.appendChild(el);
    return el;
  }

  let hideTimer = null;
  function show(kind, message, autoHideMs) {
    injectStyleOnce();
    const el = ensureToast();
    el.classList.remove('koaus-net-toast--offline', 'koaus-net-toast--online');
    el.classList.add(kind === 'online' ? 'koaus-net-toast--online' : 'koaus-net-toast--offline');
    el.querySelector('.net-ico').textContent = kind === 'online' ? '✓' : '⚠';
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
    show('offline', '네트워크 연결이 끊어졌습니다. 연결을 확인해 주세요.', 0);
  }
  function handleOnline() {
    show('online', '네트워크가 다시 연결되었습니다.', 2200);
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
