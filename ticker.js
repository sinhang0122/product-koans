// KoAus 전역 실시간 롤링 배너 (Global Ticker)
//   · Firestore `global_ticker` 컬렉션 onSnapshot 실시간 구독
//   · 자동 로테이션 (기본 표준 ~6초의 3배 속도 = 2초 간격)
//   · hover 시 일시정지 / 좌우 화살표 수동 네비게이션 / 빈 상태 폴백
//   · 100% Pure Black & White 테마
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain:        'koaus-f564c.firebaseapp.com',
  projectId:         'koaus-f564c',
  storageBucket:     'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId:             '1:663988594088:web:ef30c2fd557407b00b299d',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
let db; try { db = getFirestore(app); } catch (e) { console.warn('[ticker] Firestore 미초기화', e); }

const ROTATE_MS = 2000;  // 3x faster than typical 6s
let items  = [];
let idx    = 0;
let timer  = null;
let paused = false;

const STYLE_CSS = `
.koaus-ticker {
  position: sticky; top: 0; z-index: 9000;
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 6px 12px; min-height: 36px;
  background: var(--text-primary, #000); color: var(--bg-card, #fff);
  font-family: var(--font, 'Urbanist','Noto Sans KR',sans-serif);
  font-size: 12.5px; line-height: 1.35;
  border-bottom: 1px solid var(--border, #222);
}
.koaus-ticker-badge {
  flex-shrink: 0; font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
  padding: 2px 8px; background: var(--bg-card, #fff); color: var(--text-primary, #000);
  border-radius: 3px; text-transform: uppercase;
}
.koaus-ticker-link {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
  color: inherit; text-decoration: none;
  transition: opacity 0.15s;
  overflow: hidden;
}
.koaus-ticker-link:hover { opacity: 0.85; }
.koaus-ticker-link.empty { pointer-events: none; }
.koaus-ticker-sponsor { font-weight: 800; flex-shrink: 0; white-space: nowrap; }
.koaus-ticker-sep     { opacity: 0.55; flex-shrink: 0; }
.koaus-ticker-content {
  font-weight: 500; min-width: 0; flex: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.koaus-ticker-nav {
  flex-shrink: 0; padding: 0 8px; background: transparent; border: none;
  color: inherit; font-size: 18px; font-weight: 700; cursor: pointer;
  line-height: 1; opacity: 0.7; transition: opacity 0.15s;
}
.koaus-ticker-nav:hover:not(:disabled) { opacity: 1; }
.koaus-ticker-nav:disabled { opacity: 0.25; cursor: not-allowed; }
.koaus-ticker-fade { transition: opacity 0.18s ease; }
.koaus-ticker-fade.is-fading { opacity: 0; }
@media (max-width: 640px) {
  .koaus-ticker { font-size: 11.5px; padding: 5px 8px; gap: 6px; min-height: 32px; }
  .koaus-ticker-badge { font-size: 9px; padding: 2px 6px; }
  .koaus-ticker-nav { font-size: 16px; padding: 0 6px; }
}
`;

function injectStyle() {
  if (document.getElementById('koaus-ticker-style')) return;
  const s = document.createElement('style');
  s.id = 'koaus-ticker-style';
  s.textContent = STYLE_CSS;
  document.head.appendChild(s);
}

function buildTicker() {
  if (document.getElementById('koaus-ticker')) return;
  const bar = document.createElement('div');
  bar.id = 'koaus-ticker';
  bar.className = 'koaus-ticker';
  bar.innerHTML = `
    <button class="koaus-ticker-nav" id="koausTickerPrev" type="button" aria-label="이전 공지">&lsaquo;</button>
    <span class="koaus-ticker-badge">Notice</span>
    <a class="koaus-ticker-link koaus-ticker-fade empty" id="koausTickerLink" target="_blank" rel="noopener">
      <span class="koaus-ticker-sponsor" id="koausTickerSponsor">KoAus</span>
      <span class="koaus-ticker-sep">|</span>
      <span class="koaus-ticker-content" id="koausTickerContent">실시간 공지/광고를 불러오는 중…</span>
    </a>
    <button class="koaus-ticker-nav" id="koausTickerNext" type="button" aria-label="다음 공지">&rsaquo;</button>
  `;
  document.body.insertBefore(bar, document.body.firstChild);
}

function show(i) {
  const link       = document.getElementById('koausTickerLink');
  const sponsorEl  = document.getElementById('koausTickerSponsor');
  const contentEl  = document.getElementById('koausTickerContent');
  const prev       = document.getElementById('koausTickerPrev');
  const next       = document.getElementById('koausTickerNext');
  if (!link || !sponsorEl || !contentEl) return;

  if (!items.length) {
    link.classList.add('empty');
    link.removeAttribute('href');
    sponsorEl.textContent = 'KoAus';
    contentEl.textContent = '등록된 공지/광고가 아직 없습니다.';
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }
  if (prev) prev.disabled = false;
  if (next) next.disabled = false;
  idx = ((i % items.length) + items.length) % items.length;
  const it = items[idx];

  // 페이드 전환
  link.classList.add('is-fading');
  setTimeout(() => {
    sponsorEl.textContent = it.sponsor || 'KoAus';
    contentEl.textContent = it.content || '';
    if (it.linkUrl) { link.href = it.linkUrl; link.classList.remove('empty'); }
    else            { link.removeAttribute('href'); link.classList.add('empty'); }
    link.classList.remove('is-fading');
  }, 180);
}

function startRotation() {
  if (timer) { clearInterval(timer); timer = null; }
  if (items.length <= 1) return;
  timer = setInterval(() => { if (!paused) show(idx + 1); }, ROTATE_MS);
}

function bindControls() {
  const prev = document.getElementById('koausTickerPrev');
  const next = document.getElementById('koausTickerNext');
  const bar  = document.getElementById('koaus-ticker');
  if (prev) prev.addEventListener('click', () => show(idx - 1));
  if (next) next.addEventListener('click', () => show(idx + 1));
  if (bar) {
    bar.addEventListener('mouseenter', () => { paused = true; });
    bar.addEventListener('mouseleave', () => { paused = false; });
    bar.addEventListener('focusin',    () => { paused = true; });
    bar.addEventListener('focusout',   () => { paused = false; });
  }
}

function init() {
  injectStyle();
  buildTicker();
  bindControls();
  show(0);  // 초기 로딩/빈 상태 안내
  if (!db) return;
  try {
    const q = query(collection(db, 'global_ticker'), orderBy('createdAt', 'desc'), limit(20));
    onSnapshot(q, snap => {
      items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t && (t.content || t.sponsor));
      if (idx >= items.length) idx = 0;
      show(idx);
      startRotation();
    }, err => {
      console.warn('[ticker] global_ticker 구독 실패', err);
    });
  } catch (e) { console.warn('[ticker] subscribe 초기화 실패', e); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
