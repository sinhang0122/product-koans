// ════════════════════════════════════════════════════════════════════
//  KoAus · 오프라인(Network Offline) 감지 토스트
//  - window.online / offline 이벤트 수신.
//  - 끊김 즉시 상단바 아래 가운데에 안내 카드. 복구 시 청록 점 안내(2초) 후 자동 제거.
//  - 11-17(사용자 선택 — 후보 B): 빨강·초록 그라데이션 알약 → 흰 카드(얇은 테두리 · 모서리 12px · 14px) + 왼쪽 점.
//    같은 모양: session-timeout.js(자동 로그아웃) · koaus-toast.js(공용 토스트). 모양을 바꿀 땐 세 곳을 같이.
//  - 모든 페이지에 <script src="offline.js" defer></script> 한 줄로 로드.
//  - 별도 의존성 없음 (Firebase·Swiper 등과 무관).
//  - 11-26a(사용자 결정): 새 버전 안내 — 배포 뒤에도 열어 둔 화면에 같은 모양의 카드를 띄우고, 누르면 새로 고친다(아래 '새 버전 안내').
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
      /* 새 버전 안내(11-26a) — 같은 카드, 누를 수 있다. 안 보일 때는 눌리지도 초점이 가지도 않게 visibility 까지 내린다 */
      .koaus-net-toast--update { visibility: hidden; transition: opacity .22s ease, transform .22s ease, visibility 0s linear .22s; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
      .koaus-net-toast--update.is-show { visibility: visible; pointer-events: auto; cursor: pointer; transition-delay: 0s; }
      .koaus-net-toast--update .net-ico { background: #0b7a5c; }
      .koaus-net-toast--update.is-busy { opacity: .55; pointer-events: none; cursor: default; }
      :root[data-theme="dark"] .koaus-net-toast--update .net-ico { background: #5eead4; }
      /* 끊김 · 복구 안내가 보이는 동안에는 가린다(같은 자리) — 그 안내가 사라지면 다시 보인다 */
      #koausNetToast.is-show ~ #koausVerToast { opacity: 0; visibility: hidden; pointer-events: none; }
      /* 모바일 지도 화면: 지도 머리줄(96px)과 [이 지역 검색] 아래에 둔다 — 머리줄의 필터 · 보기 전환을 가리지 않게 */
      @media (max-width: 768px) { body.koaus-map-active .koaus-net-toast--update { top: calc(148px + env(safe-area-inset-top, 0px)); } }
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

  // ── 새 버전 안내 (11-26a, 사용자 결정) ───────────────────────────────────
  //  왜: 배포해도 열어 둔 화면은 그때 받은 파일을 계속 쓴다 — 홈 화면에 추가한 앱이나 며칠 둔 탭에서 예전 문구 · 동작이 그대로 보였다.
  //  어떻게: 처음 읽은 /version.json 의 v 를 기억해 두고, 화면으로 돌아올 때(1분에 한 번) 다시 읽어 달라졌으면 카드를 띄운다.
  //   · 모양은 위 안내 카드와 같다(후보 B). 저절로 새로 고치지 않는다 — 눌러야 한다(쓰던 글이 날아가지 않게).
  //   · 10초 뒤 사라지고, 다음에 화면으로 돌아오면 다시 뜬다. 끊김 · 복구 안내가 떠 있는 동안에는 CSS 가 가린다.
  //   · 누르면 이 화면이 쓰는 우리 JS · CSS 를 먼저 새로 받아 둔다 — 브라우저가 1시간 보관하므로 그냥 새로 고치면 예전 파일이 남을 수 있다.
  //   · public/version.json 의 v 는 배포할 때마다 바꾼다(CLAUDE.md). 안 바꾸면 그 배포는 안내가 안 뜰 뿐이다. 파일이 없거나 못 읽으면 조용히 넘어간다.
  const VER_URL = '/version.json';
  const VER_GAP_MS = 60 * 1000;    // 다시 확인하고 다시 띄우는 최소 간격
  const VER_SHOW_MS = 10 * 1000;   // 카드가 떠 있는 시간
  const VER_TEXT = '새 버전이 있습니다. 누르면 새로 고칩니다.';
  let verBase = null;              // 이 화면을 열었을 때의 v
  let verStale = false;            // 그 뒤로 v 가 달라졌다
  let verFetchedAt = 0, verShownAt = 0, verTimer = null, verBusy = false;

  function verCard() {
    let el = document.getElementById('koausVerToast');
    if (el) return el;
    injectStyleOnce();
    const net = ensureToast();     // 끊김 안내 바로 뒤에 둔다 — CSS(#koausNetToast.is-show ~ #koausVerToast)가 겹칠 때 이 카드를 가린다
    el = document.createElement('div');
    el.id = 'koausVerToast';
    el.className = 'koaus-net-toast koaus-net-toast--update';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.innerHTML = '<span class="net-ico" aria-hidden="true"></span><span class="net-msg"></span>';
    el.querySelector('.net-msg').textContent = VER_TEXT;
    el.addEventListener('click', verReload);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); verReload(); }
    });
    net.insertAdjacentElement('afterend', el);
    return el;
  }
  function verArmHide(el) {
    if (verTimer) clearTimeout(verTimer);
    verTimer = setTimeout(() => { verTimer = null; el.classList.remove('is-show'); }, VER_SHOW_MS);
  }
  function verShow() {
    if (!verStale || verBusy) return;
    if (document.visibilityState === 'hidden') return;   // 안 보일 때 띄우면 10초가 그냥 지나간다 — 돌아왔을 때 띄운다
    const now = Date.now();
    if (now - verShownAt < VER_GAP_MS) return;
    verShownAt = now;
    const el = verCard();
    void el.offsetWidth;
    el.classList.add('is-show');
    verArmHide(el);
  }
  function verFetch() {
    if (verStale || typeof fetch !== 'function') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;   // 끊겨 있으면 다음 기회에(online 이 다시 부른다)
    const now = Date.now();
    if (now - verFetchedAt < VER_GAP_MS) return;
    verFetchedAt = now;
    fetch(VER_URL + '?t=' + now, { cache: 'no-store', credentials: 'omit' })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((j) => {
        const v = j && j.v ? String(j.v) : '';
        if (!v) return;
        if (verBase === null) { verBase = v; return; }
        if (v !== verBase) { verStale = true; verShow(); }
      })
      .catch(() => {});
  }
  function verTick() { if (verStale) verShow(); else verFetch(); }
  // 이 화면이 쓰는 우리 JS · CSS 주소(태그에 적힌 것 + 실제로 받은 것). 다른 곳(gstatic 등) 것은 건드리지 않는다
  function verAssets() {
    const list = [], seen = {}, base = location.origin + '/';
    const add = (u) => {
      if (typeof u !== 'string' || u.indexOf(base) !== 0 || seen[u]) return;
      if (!/\.(js|css)(\?|$)/.test(u)) return;
      seen[u] = 1; list.push(u);
    };
    try { document.querySelectorAll('script[src], link[rel~="stylesheet"][href]').forEach((n) => add(n.src || n.href)); } catch (_) {}
    try { performance.getEntriesByType('resource').forEach((e) => add(e.name)); } catch (_) {}
    return list.slice(0, 80);
  }
  function verReload() {
    if (verBusy) return;
    if (Date.now() - verShownAt < 500) return;   // 막 뜬 카드를 다른 것을 누르려다 건드린 경우는 무시
    verBusy = true;
    if (verTimer) { clearTimeout(verTimer); verTimer = null; }
    const el = document.getElementById('koausVerToast');
    if (el) el.classList.add('is-busy');
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      try { location.reload(); } catch (_) {}
      // 새로 고침이 막혔을 때(드문 경우)만 여기까지 온다 — 카드를 다시 누를 수 있게 되돌린다
      setTimeout(() => { verBusy = false; if (el) { el.classList.remove('is-busy'); verArmHide(el); } }, 5000);
    };
    const urls = verAssets();
    let left = urls.length;
    if (!left || typeof fetch !== 'function') { go(); return; }
    setTimeout(go, 2500);   // 느린 연결이어도 2.5초 뒤에는 넘어간다
    urls.forEach((u) => {
      let p;
      try { p = fetch(u, { cache: 'reload' }).then((r) => r.arrayBuffer()); } catch (_) { p = Promise.resolve(); }
      p.catch(() => {}).then(() => { left -= 1; if (left === 0) go(); });
    });
  }
  function bindVersion() {
    // 다른 화면 안에 끼워진 화면(홈의 케어 · 계산기 iframe)은 바깥 화면이 맡는다
    let framed = false;
    try { framed = window.self !== window.top; } catch (_) { framed = true; }
    if (framed) return;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verTick(); });
    window.addEventListener('pageshow', (e) => {
      if (e && e.persisted) {   // 뒤로 가기로 되살아난 화면 — 누름 처리 중이던 표시를 푼다
        verBusy = false;
        const el = document.getElementById('koausVerToast');
        if (el) el.classList.remove('is-busy');
      }
      verTick();
    });
    window.addEventListener('focus', verTick);
    window.addEventListener('online', verTick);
    setTimeout(verFetch, 3000);   // 처음 값 기억(pageshow 가 이미 지나간 경우 대비)
  }

  function bind() {
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    try { bindVersion(); } catch (_) {}   // 새 버전 안내 — 실패해도 끊김 안내에는 영향이 없게
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
