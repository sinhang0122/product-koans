// ════════════════════════════════════════════════════════════════════
//  KoAus · 세션 영속(Persistence) 강제 + 하루(24시간) 미활동 자동 로그아웃
//  - 모든 페이지에 <script type="module" src="session-timeout.js"></script>
//    한 줄로 로드.
//  - Firebase Auth Persistence 를 LOCAL 로 강제 → 페이지 이동/탭 이동/
//    브라우저 재시작 후에도 명시적 로그아웃 전까지 세션 유지.
//  - 24 시간 동안(11-17 사용자 결정: 1시간 → 하루) click/touchstart/scroll/keydown 등
//    사용자 동작이 없으면 자동 signOut + 안내 카드 + 메인 이동.
//    · 켜 둔 탭 기준이다 — 탭을 닫았다 다시 오는 것은 로그아웃 대상이 아니다(영속 LOCAL).
//    · 마지막 동작 시각은 탭끼리 공유(LS koaus-last-active) — 다른 탭에서 쓰는 중이면 가만히 둔 탭이 로그아웃시키지 않는다.
//  - admin.html 은 별도 인증 가드(custom claim) 가 있으므로 이 모듈 영향 0.
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
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

    // 1) Persistence 폴백 체인 — 모바일 Safari ITP / Private mode 방어 (지시 6/10) ────
    //    iOS Safari 의 Intelligent Tracking Prevention 은 localStorage 를 7일 후 wipe,
    //    Private mode 는 localStorage 자체를 차단함. 단일 browserLocalPersistence 로는
    //    페이지 이동 간 세션이 풀리는 사례 발생. 우선순위:
    //      ① indexedDBLocalPersistence  — ITP 영향 적음, Firebase v9+ 권장
    //      ② browserLocalPersistence    — 데스크탑·기존 사용자 호환
    //      ③ inMemoryPersistence        — Private mode 최후 폴백 (탭 닫기 전까지 유지)
    //    awaits 보장 — onAuthStateChanged / signIn 호출 전 persistence 확정.
    (async () => {
      try {
        await setPersistence(auth, indexedDBLocalPersistence);
        console.debug('[session] persistence: indexedDB');
      } catch (e1) {
        console.warn('[session] indexedDB persistence 실패 → browserLocal 시도', e1?.code || e1);
        try {
          await setPersistence(auth, browserLocalPersistence);
          console.debug('[session] persistence: browserLocal');
        } catch (e2) {
          console.warn('[session] browserLocal persistence 실패 → inMemory 폴백', e2?.code || e2);
          try {
            await setPersistence(auth, inMemoryPersistence);
            console.debug('[session] persistence: inMemory (Private mode 추정)');
          } catch (e3) {
            console.error('[session] persistence 전체 실패 — 기본값으로 진행', e3);
          }
        }
      }
    })();

    // 1-1) 헤더 My 버튼 별명 표기 (A5) — 아이콘 옆 별명 span 주입/제거 ─────
    //   · 별명 출처: localStorage 'koaus-nickname' (로그아웃 시 app.js 가 wipe)
    //   · 모바일 말줄임은 style.css .topbar-my-nick 가 담당
    function setTopbarNick(nick) {
      const btn = document.getElementById('topbarMyBtn');
      if (!btn) return;
      let span = btn.querySelector('.topbar-my-nick');
      if (!nick) { if (span) span.remove(); return; }
      if (!span) {
        span = document.createElement('span');
        span.className = 'topbar-my-nick';
        btn.appendChild(span);
      }
      span.textContent = nick;
    }
    window.koausSetTopbarNick = setTopbarNick;

    // 1-2) 헤더 깜빡임 방어 — sessionStorage 캐시 fast-path (지시 2/4) ─────
    //   · 옛 user 가 있었던 페이지면 진입 즉시 html[data-koaus-auth="cached-in"] 부여
    //   · onAuthStateChanged 첫 발화 후 'in' / 'out' 으로 정정
    //   · 페이지별 헤더 코드는 그대로 두고 CSS 가 깜빡임만 봉쇄
    try {
      const cachedUid = sessionStorage.getItem('koaus-auth-uid');
      if (cachedUid) {
        document.documentElement.setAttribute('data-koaus-auth', 'cached-in');
        try { setTopbarNick(localStorage.getItem('koaus-nickname') || ''); } catch (_) {}
      } else {
        document.documentElement.setAttribute('data-koaus-auth', 'checking');
      }
    } catch (_) {
      document.documentElement.setAttribute('data-koaus-auth', 'checking');
    }

    // 2) 미활동 자동 로그아웃 ─────────────────────────────────────────
    const INACTIVITY_MS = 24 * 60 * 60 * 1000;  // 24 시간 (11-17: 1시간 → 하루)
    const ACTIVE_KEY = 'koaus-last-active';      // 탭끼리 공유하는 마지막 동작 시각(ms)
    let lastMark = 0;
    function markActive() {   // 1분에 한 번만 기록(스크롤·마우스 이동마다 쓰지 않게)
      const now = Date.now();
      if (now - lastMark < 60000) return;
      lastMark = now;
      try { localStorage.setItem(ACTIVE_KEY, String(now)); } catch (_) {}
    }
    function idleFor() {      // 어느 탭에서든 마지막 동작 뒤 흐른 시간(ms). 기록을 못 읽으면 이 탭의 타이머만 믿는다
      try { const t = parseInt(localStorage.getItem(ACTIVE_KEY) || '0', 10); return t > 0 ? Date.now() - t : Infinity; } catch (_) { return Infinity; }
    }
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
            /* 11-17(후보 B): offline.js · koaus-toast.js 와 같은 모양 — 흰 카드 · 얇은 테두리 · 모서리 12px · 14px. 긴 문구는 줄바꿈 */
            position: fixed; top: calc(66px + env(safe-area-inset-top, 0px));
            left: 16px; right: 16px; margin: 0 auto; width: fit-content; transform: translateY(-12px);
            z-index: 99999;
            background: var(--bg-base, #fff);
            color: var(--text-primary, #111);
            border: 1px solid var(--border, #dcdcdc);
            padding: 10px 16px 10px 14px; border-radius: 12px;
            font: 600 14px/1.35 'Noto Sans KR','Urbanist',system-ui,-apple-system,sans-serif; letter-spacing: -.2px; word-break: keep-all;
            box-shadow: 0 6px 20px rgba(0,0,0,.10);
            opacity: 0;
            transition: opacity .22s ease, transform .22s ease;
            pointer-events: none;
            display: flex; align-items: center; gap: 9px;
            max-width: calc(100vw - 32px); box-sizing: border-box;
          }
          #koausSessionToast .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-primary, #111); flex: 0 0 auto; }
          :root[data-theme="dark"] #koausSessionToast { background: #111; border-color: #333; }
          #koausSessionToast.is-show {
            opacity: 1; transform: translateY(0);
          }
        `;
        document.head.appendChild(style);
        host = document.createElement('div');
        host.id = 'koausSessionToast';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="msg"></span>';
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
        showToast('장시간 미활동으로 로그아웃 되었습니다.');
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
      // 2026-10 홈 임베드(iframe ?embed=1): iframe 안에서는 활동이 거의 없어 1시간 뒤 부모와 무관하게
      // 로그아웃·index 이동이 일어난다 → 임베드에서는 타이머를 켜지 않는다(부모 페이지가 담당)
      if (document.documentElement.classList.contains('koaus-embed')) return;
      markActive();
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(onIdleTimer, INACTIVITY_MS);
    }
    function onIdleTimer() {
      // 11-17: 다른 탭에서 쓰고 있었다면(공유 기록이 최근) 로그아웃하지 않고 남은 시간만큼 다시 잰다
      const idle = idleFor();
      if (idle < INACTIVITY_MS) { timerId = setTimeout(onIdleTimer, Math.max(60000, INACTIVITY_MS - idle)); return; }
      performAutoLogout();
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
        // 다음 페이지 진입 시 fast-path 용 sessionStorage 캐시 (지시 2/4)
        try { sessionStorage.setItem('koaus-auth-uid', String(user.uid || '')); } catch (_) {}
        document.documentElement.setAttribute('data-koaus-auth', 'in');
        let nick = '';
        try { nick = localStorage.getItem('koaus-nickname') || ''; } catch (_) {}
        setTopbarNick(nick || (user.displayName || '').split(' ')[0] || '');
      } else {
        stopTimer();
        try { sessionStorage.removeItem('koaus-auth-uid'); } catch (_) {}
        document.documentElement.setAttribute('data-koaus-auth', 'out');
        setTopbarNick('');
      }
    });
  } catch (e) {
    console.error('[session] 초기화 실패 — 기본 Firebase 세션으로 동작', e);
  }
}
