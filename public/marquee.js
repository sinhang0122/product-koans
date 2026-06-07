// ════════════════════════════════════════════════════════════════════
//  KoAus · 전광판(Marquee) 공지사항 롤링 배너
//  - 각 페이지 기존 <section class="notice-section">을 hydrate (새 DOM 생성 ❌)
//  - 데이터 출처: Firestore notices (admin.html ① 공지사항 등록)
//  - 필드 매핑: text → 본문, link → 클릭 시 이동 URL (있으면 새 탭, 없으면 클릭 비활성)
//  - 우 → 좌 끊임없는 흐름 (CSS @keyframes koaus-marquee)
//  - 호버 시 일시정지(CSS :hover) · ‹/› 버튼: 즉시 다음/이전 항목으로 우측 재등장
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain: 'koaus-f564c.firebaseapp.com',
  projectId: 'koaus-f564c',
  storageBucket: 'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId: '1:663988594088:web:ef30c2fd557407b00b299d',
  measurementId: 'G-DERZ9MTKPL',
};

// ── 유저 닫기 상태 저장 — localStorage 'koaus-dismissed-ads' (hero-banner.js 와 동일 키) ──
//   · 키 형식: "{type}:{docId}" = timestamp, TTL 24h
//   · 자가 청소: 만료 항목은 다음 조회 시 즉시 삭제
const DISMISS_KEY = 'koaus-dismissed-ads';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
function readDismissMap() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    let dirty = false;
    for (const k in obj) {
      const ts = +obj[k] || 0;
      if (!ts || (now - ts) >= DISMISS_TTL_MS) { delete obj[k]; dirty = true; }
    }
    if (dirty) { try { localStorage.setItem(DISMISS_KEY, JSON.stringify(obj)); } catch (_) {} }
    return obj;
  } catch (_) { return {}; }
}
function isDismissed(type, id) {
  if (!id) return false;
  const map = readDismissMap();
  const ts = +map[type + ':' + id] || 0;
  return ts > 0 && (Date.now() - ts) < DISMISS_TTL_MS;
}
function markDismissed(type, id) {
  if (!id) return;
  try {
    const map = readDismissMap();
    map[type + ':' + id] = Date.now();
    localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch (_) {}
}

function start() {
  const $row     = document.getElementById('tickerRow');
  const $track   = document.getElementById('tickerTrack');
  const $item    = document.getElementById('tickerItem');
  const $sponsor = document.getElementById('tickerSponsor');
  const $content = document.getElementById('tickerContent');
  const $arrow   = document.getElementById('tickerArrow');
  const $prev    = document.getElementById('tickerPrev');
  const $next    = document.getElementById('tickerNext');
  if (!$row || !$track || !$item) return;  // notice-section 없는 페이지면 조용히 종료

  // ── X 닫기 버튼 동적 inject — 모든 페이지 HTML 수정 없이 ‹/› 버튼 옆에 추가 ──
  const $navGroup = $row.querySelector('.ticker-nav-group');
  let $dismiss = null;
  if ($navGroup && !$navGroup.querySelector('.ticker-dismiss')) {
    $dismiss = document.createElement('button');
    $dismiss.type = 'button';
    $dismiss.className = 'ticker-nav ticker-dismiss';
    $dismiss.setAttribute('aria-label', '이 공지 24시간 동안 숨기기');
    $dismiss.setAttribute('title', '24시간 동안 숨기기');
    $dismiss.textContent = '×';
    $navGroup.appendChild($dismiss);
  } else if ($navGroup) {
    $dismiss = $navGroup.querySelector('.ticker-dismiss');
  }

  const items = [];
  let idx = 0;

  function render() {
    const t = items[idx];
    if (!t) return;
    // sponsor 라벨은 공지 전용으로 '📢 공지' 고정 (notices 컬렉션엔 광고주 필드 없음)
    if ($sponsor) $sponsor.textContent = t.sponsor || '📢 공지';
    if ($content) $content.textContent = t.content || '';
    if ($arrow && $item) {
      if (t.linkUrl) {
        $item.setAttribute('href', t.linkUrl);
        $item.setAttribute('target', '_blank');
        $item.setAttribute('rel', 'noopener noreferrer');
        $arrow.textContent = '↗';
      } else {
        $item.removeAttribute('href');
        $item.removeAttribute('target');
        $item.removeAttribute('rel');
        $arrow.textContent = '';
      }
    }
  }
  // 현재 흐르는 배너를 즉시 화면 밖으로 치우고 우측 끝에서 다시 등장시킴
  function restart() {
    $track.style.animation = 'none';
    void $track.offsetWidth;  // reflow 강제
    $track.style.animation = '';
  }
  function jump(delta) {
    if (!items.length) return;
    idx = (idx + delta + items.length) % items.length;
    render();
    restart();
  }

  // 한 사이클(우→좌 한 번)이 끝날 때마다 다음 항목으로 자동 전환
  $track.addEventListener('animationiteration', () => {
    if (items.length <= 1) return;
    idx = (idx + 1) % items.length;
    render();
  });
  if ($prev) $prev.addEventListener('click', () => jump(-1));
  if ($next) $next.addEventListener('click', () => jump(+1));

  // ── X 닫기 버튼 — 현재 노출 중인 notice 차단 + 다음 항목 즉시 회전 ──
  //   · localStorage 저장 → 24h 동안 다음 페이지 로드에서도 자동 제외
  //   · items 가 비면 notice-section 자체를 hide (불필요한 노출 차단)
  if ($dismiss) $dismiss.addEventListener('click', () => {
    if (!items.length) { $row.parentElement && ($row.parentElement.style.display = 'none'); return; }
    const cur = items[idx];
    if (cur && cur.id) markDismissed('notice', cur.id);
    items.splice(idx, 1);
    if (!items.length) {
      const section = $row.closest('.notice-section');
      if (section) section.style.display = 'none';
      return;
    }
    if (idx >= items.length) idx = 0;
    render();
    restart();
  });

  // Firestore notices 구독 — text → content, link → linkUrl 매핑
  //   · 데이터 0건이면 페이지에 박힌 기본 문구 유지
  //   · limit 20 — firestore.rules limitedList() 와 일치
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db  = getFirestore(app);
    // 마퀴 흐름 시간 — admin (지시 7/7) 이 app_settings/timings 에서 설정. 기본 10s.
    //   · best-effort fetch — 실패 시 CSS 기본 (animation: 10s) 유지
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'app_settings', 'timings'));
        if (snap.exists()) {
          const v = snap.data();
          const sec = Number(v && v.marqueeDurationSec);
          if (Number.isFinite(sec) && sec >= 5 && sec <= 300) {
            $track.style.animationDuration = sec + 's';
          }
        }
      } catch (_) {}
    })();
    onSnapshot(
      query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(20)),
      snap => {
        const next = snap.docs
          .map(d => ({ id: d.id, data: d.data() }))
          .filter(({ id, data }) => data && (data.text || '').trim() && !isDismissed('notice', id))
          .map(({ id, data }) => ({
            id,
            sponsor: '📢 공지',
            content: data.text,
            linkUrl: (data.link || '').trim() || '',
          }));
        items.length = 0;
        next.forEach(t => items.push(t));
        if (!items.length) {
          // 모든 항목 차단되었으면 notice-section 자체 hide
          const section = $row.closest('.notice-section');
          if (section) section.style.display = 'none';
          return;
        }
        if (idx >= items.length) idx = 0;
        render();
      },
      err => console.warn('[marquee] notices 구독 실패 — 기본 문구 유지', err)
    );
  } catch (e) {
    console.warn('[marquee] Firestore 초기화 실패', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
