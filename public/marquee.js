// ════════════════════════════════════════════════════════════════════
//  KoAus · 전광판(Marquee) 공지사항 롤링 배너
//  - 각 페이지 기존 <section class="notice-section">을 hydrate (새 DOM 생성 ❌)
//  - 데이터 출처: Firestore notices (admin.html ① 공지사항 등록)
//  - 필드 매핑: text → 본문, link → 클릭 시 이동 URL (있으면 새 탭, 없으면 클릭 비활성)
//  - 우 → 좌 끊임없는 흐름 (CSS @keyframes koaus-marquee)
//  - 호버 시 일시정지(CSS :hover) · ‹/› 버튼: 즉시 다음/이전 항목으로 우측 재등장
// ════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';   // App Check 공용 init — 자체 init 없는 페이지의 Enforce 차단 방지 (전 페이지 커버)
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

// 옛 24h 숨기기(X 버튼) localStorage 잔재 정리 — 닫기 기능 자체가 폐지됨 (2026-06)
try { localStorage.removeItem('koaus-dismissed-ads'); } catch (_) {}

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

  // ── X 닫기 버튼 — 전면 제거 (지시 2/3 · CLAUDE.md 상단 컴포넌트 배치 규격) ──
  //   · 옛 동적 inject 패턴 폐기 — 유저가 공지를 닫지 못하도록 원천 차단.
  //   · ‹/› 이전·다음 슬라이드 내비게이션만 유지.
  //   · 옛 .ticker-dismiss 마크업이 잔존하더라도 안전하게 제거 (사이드이펙트 0).
  const $navGroup = $row.querySelector('.ticker-nav-group');
  if ($navGroup) {
    $navGroup.querySelectorAll('.ticker-dismiss').forEach(b => b.remove());
  }
  const items = [];
  let idx = 0;

  function render() {
    const t = items[idx];
    if (!t) return;
    // 배지 고정 — 운영자 알림 전용 (광고주명 렌더 폐기, 회귀 방지)
    if ($sponsor) $sponsor.textContent = '📢 KoAus';
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
        // 닫기(X)/dismiss 기능 없음 — 텍스트 있는 공지는 무조건 노출 (정책)
        // 정렬: priority asc(낮을수록 앞 — admin 카드 2 ▲/▼ 순서) → 동률 시 createdAt desc(최신 우선)
        //   · priority 없는 옛 공지는 100(폼 기본값)으로 간주 — 마이그레이션 불필요
        const _pri = d => (typeof d.priority === 'number' ? d.priority : 100);
        const _ts  = d => (d.createdAt && typeof d.createdAt.toMillis === 'function') ? d.createdAt.toMillis() : 0;
        const next = snap.docs
          .map(d => ({ id: d.id, data: d.data() }))
          .filter(({ data }) => data && (data.text || '').trim())
          .sort((a, b) => (_pri(a.data) - _pri(b.data)) || (_ts(b.data) - _ts(a.data)))
          .map(({ id, data }) => ({
            id,
            // 마퀴 = 운영자 한 줄 알림 전용 (2026-06). sponsor/광고주명 렌더 폐기 —
            //   광고주 강조는 히어로 배너+타겟 광고로 일원화. 배지는 고정(render).
            content: data.text,
            linkUrl: (data.link || '').trim() || '',
          }));
        items.length = 0;
        next.forEach(t => items.push(t));
        if (!items.length) {
          // ─── A-1 재진단 (배치) ─ '메인 OK / 섹션 X' 원인 수정 ──────────
          //   옛: items 0 일 때 notice-section 자체를 display:none 처리
          //       → 섹션 페이지 App Check race condition 또는 빈 결과 도착 시
          //         기본 마크업 안내 텍스트("숙소·구인구직·차량 ...")까지 함께 사라짐.
          //       → 메인은 App Check 없어 데이터 즉시 도착 → render 정상,
          //         섹션은 빈 결과 가능성으로 hide 발동 → 영구 안 보임.
          //   해결: hide 호출 제거. items 0 이면 기본 마크업(line 445 ticker-content) 그대로 유지.
          //         사용자 진입 시 항상 최소한의 안내 텍스트 노출 보장.
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
