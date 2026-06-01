// ════════════════════════════════════════════════════════════════════
//  KoAus · 세션 영속(Persistence) 강제 + 1 시간 미활동 자동 로그아웃
//  - 모든 페이지에 <script type="module" src="session-timeout.js"></script>
//    한 줄로 로드.
//  - Firebase Auth Persistence 를 LOCAL 로 강제 → 페이지 이동/탭 이동/
//    브라우저 재시작 후에도 명시적 로그아웃 전까지 세션 유지.
//  - 1 시간(3,600,000ms) 동안 click/touchstart/scroll/keydown 등
//    사용자 동작이 없으면 자동 signOut + 안내 토스트 + 메인 이동.
//  - admin.html 은 별도 인증 가드(custom claim) 가 있으므로 이 모듈 영향 0.
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

const cfg = {
  apiKey:'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain:'koaus-f564c.firebaseapp.com',
  projectId:'koaus-f564c',
  storageBucket:'koaus-f564c.firebasestorage.app',
  messagingSenderId:'663988594088',
  appId:'1:663988594088:web:ef30c2fd557407b00b299d',
};

// 중복 실행 가드 (페이지에서 두 번 로드돼도 안전)
if (!window.__koausSessionInited) {
  window.__koausSessionInited = true;

  try {
    const app  = getApps().length ? getApp() : initializeApp(cfg);
    const auth = getAuth(app);

    // 1) Persistence 를 LOCAL 로 강제 — 페이지 이동·새로고침 후에도 세션 유지.
    //    (Firebase v9+ 기본값도 LOCAL 이지만 모바일 일부 환경에서 SESSION 으로
    //    초기화되는 사례 방지 차원에서 명시적으로 호출.)
    setPersistence(auth, browserLocalPersistence)
      .catch(err => console.warn('[session] setPersistence 실패 — 기본값으로 진행', err));

    // 2) 미활동 자동 로그아웃 ─────────────────────────────────────────
    const INACTIVITY_MS = 60 * 60 * 1000;  // 1 시간
    let timerId = null;
    let isLoggedIn = false;
    let isLoggingOut = false;

    function showToast(message) {
      // CSS 는 offline.js 와 충돌하지 않는 별도 ID 사용
      let host = document.getElementById('koausSessionToast');
      if (!host) {
        const style = document.createElement('style');
        style.textContent = `
          #koausSessionToast {
            position: fixed; top: max(14px, env(safe-area-inset-top, 14px));
            left: 50%; transform: translateX(-50%) translateY(-110%);
            z-index: 99999;
            background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
            color: #fff;
            padding: 11px 18px; border-radius: 999px;
            font: 600 13.5px/1.3 'Noto Sans KR','Urbanist',system-ui,-apple-system,sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,.25);
            opacity: 0;
            transition: opacity .25s ease, transform .35s cubic-bezier(.2,.7,.3,1);
            pointer-events: none;
            display: flex; align-items: center; gap: 8px;
            max-width: calc(100vw - 32px); white-space: nowrap;
          }
          #koausSessionToast.is-show {
            opacity: 1; transform: translateX(-50%) translateY(0);
          }
        `;
        document.head.appendChild(style);
        host = document.createElement('div');
        host.id = 'koausSessionToast';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.innerHTML = '<span aria-hidden="true">🔒</span><span class="msg"></span>';
        document.body.appendChild(host);
      }
      host.querySelector('.msg').textContent = message;
      // reflow
      void host.offsetWidth;
      host.classList.add('is-show');
    }

    async function performAutoLogout() {
      if (isLoggingOut) return;
      isLoggingOut = true;
      try {
        showToast('보안을 위해 1시간 동안 활동이 없어 자동 로그아웃 되었습니다.');
      } catch (_) {}
      try { await signOut(auth); } catch (e) { console.warn('[session] signOut 실패', e); }
      // 토스트가 잠시 보이도록 1.6 초 후 메인으로 이동
      setTimeout(() => {
        try {
          const path = (window.location.pathname || '').toLowerCase();
          // 이미 index 에 있으면 새로고침만, 아니면 메인으로 이동
          if (path === '/' || path.endsWith('/index.html') || path.endsWith('/index')) {
            window.location.reload();
          } else {
            window.location.href = 'index.html';
          }
        } catch (_) { try { window.location.href = 'index.html'; } catch (_) {} }
      }, 1600);
    }

    function resetTimer() {
      if (!isLoggedIn || isLoggingOut) return;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(performAutoLogout, INACTIVITY_MS);
    }
    function stopTimer() {
      if (timerId) { clearTimeout(timerId); timerId = null; }
    }

    // 사용자 활동 이벤트 — passive 로 성능 영향 최소화
    const ACTIVITY_EVENTS = ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'];
    ACTIVITY_EVENTS.forEach(ev => {
      window.addEventListener(ev, resetTimer, { passive: true });
    });
    // 페이지 가시성 복귀 시 타이머 즉시 리셋 (백그라운드 탭 복귀)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resetTimer();
    });

    // 인증 상태 추적 — 로그인된 동안만 타이머 작동
    onAuthStateChanged(auth, user => {
      isLoggedIn = !!user;
      isLoggingOut = false;
      if (user) {
        resetTimer();
      } else {
        stopTimer();
      }
    });
  } catch (e) {
    console.error('[session] 초기화 실패 — 기본 Firebase 세션으로 동작', e);
  }
}
