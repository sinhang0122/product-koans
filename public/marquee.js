// ════════════════════════════════════════════════════════════════════
//  KoAus · 전광판(Marquee) 글로벌 롤링 배너
//  - 각 페이지 기존 <section class="notice-section">을 hydrate (새 DOM 생성 ❌)
//  - 데이터 출처: Firestore global_ticker (admin.html ⑤ 글로벌 배너 관리)
//  - 우 → 좌 끊임없는 흐름 (CSS @keyframes koaus-marquee)
//  - 호버 시 일시정지(CSS :hover) · ‹/› 버튼: 즉시 다음/이전 항목으로 우측 재등장
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain: 'koaus-f564c.firebaseapp.com',
  projectId: 'koaus-f564c',
  storageBucket: 'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId: '1:663988594088:web:ef30c2fd557407b00b299d',
  measurementId: 'G-DERZ9MTKPL',
};

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

  const items = [];
  let idx = 0;

  function render() {
    const t = items[idx];
    if (!t) return;
    if ($sponsor) $sponsor.textContent = t.sponsor || 'KoAus';
    if ($content) $content.textContent = t.content || '';
    if ($arrow && $item) {
      if (t.linkUrl) {
        $item.setAttribute('href', t.linkUrl);
        $item.setAttribute('target', '_blank');
        $arrow.textContent = '↗';
      } else {
        $item.removeAttribute('href');
        $item.removeAttribute('target');
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

  // Firestore 구독 — 데이터 0건이면 페이지에 박힌 기본 문구 유지
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db  = getFirestore(app);
    onSnapshot(
      query(collection(db, 'global_ticker'), orderBy('createdAt', 'desc'), limit(20)),
      snap => {
        const next = snap.docs.map(d => d.data()).filter(t => t && t.content);
        items.length = 0;
        next.forEach(t => items.push(t));
        if (!items.length) return;
        if (idx >= items.length) idx = 0;
        render();
      },
      err => console.warn('[marquee] global_ticker 구독 실패 — 기본 문구 유지', err)
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
