/* ════════════════════════════════════════════════════════════════════════
   CORES — app.js
   섹션 구조:
     0. Firebase 초기화 & Google 인증
     1. 전역 유틸
     2. 링크 요약 & 체크박스 & 저장 (내 코어스)
     3. 환전 수수료 비교 (다국어 화폐)
     4. 호주 파워볼 (내비게이션 + 상세 패널)
════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════
   0. Firebase 초기화 & Google 인증
   - Firebase SDK v9+ ESM 모듈 방식 (CDN에서 직접 import)
   - 이 파일이 <script type="module">로 로드되어야 import 구문이 동작합니다.
════════════════════════════════════════════════════════════════════════ */

/* ── Firebase SDK ES Module 임포트 ── */
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider,
         signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

/* ── Firebase 프로젝트 설정값 ── */
const firebaseConfig = {
  apiKey:            'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain:        'koaus-f564c.firebaseapp.com',
  projectId:         'koaus-f564c',
  storageBucket:     'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId:             '1:663988594088:web:ef30c2fd557407b00b299d',
  measurementId:     'G-DERZ9MTKPL',
};

/* ── Firebase 앱 & 인증 인스턴스 초기화 ── */
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const provider    = new GoogleAuthProvider();

/* 추가 스코프: 프로필 사진과 이메일 명시적 요청 */
provider.addScope('profile');
provider.addScope('email');

/* ── 인증 상태 변화 감지 (페이지 로드 시 자동 실행) ── */
onAuthStateChanged(auth, (user) => {
  const elLoggedOut = document.getElementById('authLoggedOut');
  const elLoggedIn  = document.getElementById('authLoggedIn');
  const elAvatar    = document.getElementById('authAvatar');
  const elUsername  = document.getElementById('authUsername');

  if (user) {
    /* ─ 로그인 상태 ─ */
    elLoggedOut.hidden = true;
    elLoggedIn.hidden  = false;
    elUsername.textContent = user.displayName || user.email || '사용자';
    if (user.photoURL) {
      elAvatar.src    = user.photoURL;
      elAvatar.hidden = false;
    } else {
      /* 프로필 사진 없을 때 이니셜 표시는 CSS로 처리 */
      elAvatar.src    = '';
      elAvatar.hidden = true;
    }
  } else {
    /* ─ 로그아웃 상태 ─ */
    elLoggedOut.hidden = false;
    elLoggedIn.hidden  = true;
  }
});

/* ── Google 로그인 버튼 클릭 ── */
document.getElementById('loginBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = '연결 중…';

  try {
    await signInWithPopup(auth, provider);
    /* onAuthStateChanged 가 UI를 자동으로 업데이트하므로 별도 처리 불필요 */
  } catch (err) {
    /* 사용자가 팝업을 닫은 경우(popup-closed-by-user)는 무시 */
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      console.error('[Cores] 로그인 오류:', err.code, err.message);
    }
  } finally {
    /* 로그인 실패 시에도 버튼 복구 */
    btn.disabled = false;
    btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>구글로 시작하기`;
  }
});

/* ── 로그아웃 버튼 클릭 ── */
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('[Cores] 로그아웃 오류:', err.message);
  }
});

/* ════════════════════════════════════════════════════════════════════════
   1. 전역 유틸
════════════════════════════════════════════════════════════════════════ */

/** 오늘 기준 한국어 날짜 문자열 */
const todayStr = () => new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' });

/** 숫자를 세 자리마다 콤마 포맷 */
const comma = n => Math.round(n).toLocaleString();


/* ════════════════════════════════════════════════════════════════════════
   2. 링크 요약 & 체크박스 & 내 코어스 저장
════════════════════════════════════════════════════════════════════════ */

/* ── DOM 참조 ── */
const urlInput     = document.getElementById('urlInput');
const clearBtn     = document.getElementById('clearBtn');
const summarizeBtn = document.getElementById('summarizeBtn');
const btnText      = summarizeBtn.querySelector('.btn-text');
const btnLoader    = summarizeBtn.querySelector('.btn-loader');

const resultEmpty   = document.getElementById('resultEmpty');
const resultContent = document.getElementById('resultContent');
const metaSource    = document.getElementById('metaSource');
const metaTitle     = document.getElementById('metaTitle');
const metaUrl       = document.getElementById('metaUrl');
const summaryText   = document.getElementById('summaryText');
const timestampCard = document.getElementById('timestampCard');
const keywordsCard  = document.getElementById('keywordsCard');
const keywordsList  = document.getElementById('keywordsList');
const saveArea      = document.getElementById('saveArea');
const saveBtn       = document.getElementById('saveBtn');
const saveBtnText   = document.getElementById('saveBtnText');
const saveFeedback  = document.getElementById('saveFeedback');
const categorySelect= document.getElementById('categorySelect');

/** 카테고리 메타 정보 (아이콘 + 한국어 레이블) */
const CATEGORIES = {
  economy: { icon: '💰', label: '경제' },
  health:  { icon: '💪', label: '건강' },
  beauty:  { icon: '✨', label: '미용' },
  game:    { icon: '🎮', label: '게임' },
  tech:    { icon: '⚙️', label: '기술' },
  life:    { icon: '🌿', label: '라이프' },
  travel:  { icon: '✈️', label: '여행' },
  etc:     { icon: '📌', label: '기타' },
};

/** 저장된 코어스 인메모리 저장소 { categoryKey: [{id, source, title, url, items, savedAt}] } */
const coresStore = {};
let activeCoresTab = null; // 현재 활성 탭 키

/* ── 입력창 X 버튼 ── */
urlInput.addEventListener('input', () => {
  clearBtn.classList.toggle('visible', urlInput.value.length > 0);
});
clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.classList.remove('visible');
  urlInput.focus();
  showEmptyResult();
});

/** 결과창 초기화 */
function showEmptyResult() {
  resultEmpty.hidden   = false;
  resultContent.hidden = true;
  saveArea.hidden      = true;
}

/** URL 소스 감지 */
function detectSource(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/instagram\.com/.test(url))         return 'instagram';
  return 'unknown';
}

/**
 * 요약 텍스트를 체크박스 리스트로 렌더링
 * @param {string[]} items - 요약 불릿 텍스트 배열
 */
function renderSummaryWithCheckboxes(items) {
  summaryText.innerHTML = `<ul>${
    items.map((text, i) => `
      <li>
        <label class="summary-check-label">
          <input type="checkbox" class="summary-checkbox" data-index="${i}" checked />
          <span class="check-icon"></span>
          <span class="check-text">${text}</span>
        </label>
      </li>`).join('')
  }</ul>`;
}

/** 목업 요약 결과 표시 */
function showMockResult(url, source) {
  resultEmpty.hidden   = true;
  resultContent.hidden = false;
  metaUrl.textContent  = url;
  saveArea.hidden      = false;

  if (source === 'youtube') {
    metaSource.textContent = 'YouTube 영상';
    metaTitle.textContent  = '(영상 제목이 이곳에 표시됩니다)';
    renderSummaryWithCheckboxes([
      '영상의 핵심 메시지 — 첫 번째 포인트가 여기에 출력됩니다.',
      '두 번째 핵심 내용 — 주요 근거나 데이터를 포함합니다.',
      '세 번째 포인트 — 결론 또는 시청자에게 전달하는 행동 지침입니다.',
    ]);
    timestampCard.hidden = false;
    keywordsCard.hidden  = false;
    keywordsList.innerHTML = ['AI', '생산성', '튜토리얼', '요약', '기술']
      .map(k => `<span class="keyword-tag">${k}</span>`).join('');

  } else if (source === 'instagram') {
    metaSource.textContent = 'Instagram 피드';
    metaTitle.textContent  = '(게시물 캡션 또는 제목이 이곳에 표시됩니다)';
    renderSummaryWithCheckboxes([
      '인스타그램 게시물의 주요 내용 — 첫 번째 요점입니다.',
      '이미지 또는 캡션에서 추출한 핵심 정보입니다.',
      '관련 컨텍스트 및 배경 정보가 여기에 요약됩니다.',
    ]);
    timestampCard.hidden = true;
    keywordsCard.hidden  = false;
    keywordsList.innerHTML = ['인스타', '트렌드', '라이프스타일']
      .map(k => `<span class="keyword-tag">${k}</span>`).join('');

  } else {
    metaSource.textContent = '알 수 없는 링크';
    metaTitle.textContent  = '';
    summaryText.innerHTML  = '<p style="padding:18px;color:var(--text-muted)">YouTube 또는 Instagram 링크만 지원합니다.</p>';
    timestampCard.hidden = true;
    keywordsCard.hidden  = true;
    saveArea.hidden      = true;
  }
}

/* ── 요약하기 버튼 ── */
summarizeBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    urlInput.style.borderColor = '#f87171';
    setTimeout(() => { urlInput.style.borderColor = ''; }, 1200);
    return;
  }
  summarizeBtn.disabled = true;
  btnText.hidden = true; btnLoader.hidden = false;

  await new Promise(r => setTimeout(r, 1500)); // 목업 딜레이

  showMockResult(url, detectSource(url));

  summarizeBtn.disabled = false;
  btnText.hidden = false; btnLoader.hidden = true;
});
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') summarizeBtn.click(); });

/* ── 저장하기 버튼 ── */
saveBtn.addEventListener('click', () => {
  // 체크된 항목 수집
  const checked = [...document.querySelectorAll('.summary-checkbox:checked')];
  if (checked.length === 0) {
    showSaveFeedback('저장할 항목을 하나 이상 선택해주세요.', 'error');
    return;
  }

  const items    = checked.map(cb => cb.closest('.summary-check-label').querySelector('.check-text').textContent);
  const catKey   = categorySelect.value;

  // 저장소에 추가
  if (!coresStore[catKey]) coresStore[catKey] = [];
  coresStore[catKey].push({
    id:       Date.now(),
    source:   metaSource.textContent,
    title:    metaTitle.textContent || '제목 없음',
    url:      metaUrl.textContent,
    items,
    catKey,
    savedAt:  todayStr(),
  });

  // 활성 탭을 방금 저장한 카테고리로 이동
  activeCoresTab = catKey;
  renderMyCores();

  // 버튼 피드백
  showSaveFeedback(`${CATEGORIES[catKey].icon} ${CATEGORIES[catKey].label} 카테고리에 ${items.length}개 항목 저장됨`, 'success');
  saveBtn.classList.add('success');
  setTimeout(() => saveBtn.classList.remove('success'), 1600);
});

/** 저장 피드백 메시지 */
function showSaveFeedback(msg, type) {
  saveFeedback.textContent = msg;
  saveFeedback.className   = `save-feedback ${type}`;
  setTimeout(() => { saveFeedback.textContent = ''; saveFeedback.className = 'save-feedback'; }, 3000);
}

/* ── 내 코어스 렌더링 ── */
function renderMyCores() {
  const section    = document.getElementById('myCoresSection');
  const tabsEl     = document.getElementById('coresTabs');
  const contentEl  = document.getElementById('coresContent');
  const totalBadge = document.getElementById('coresTotalBadge');

  const categories = Object.keys(coresStore);
  const totalCount = categories.reduce((s, k) => s + coresStore[k].length, 0);

  // 저장된 항목이 없으면 섹션 숨김
  if (categories.length === 0) { section.hidden = true; return; }
  section.hidden = false;

  totalBadge.textContent = `${totalCount}개 저장됨`;

  // 활성 탭이 없거나 카테고리가 사라진 경우 첫 번째로 폴백
  if (!activeCoresTab || !coresStore[activeCoresTab]) {
    activeCoresTab = categories[0];
  }

  /* 탭 렌더 */
  tabsEl.innerHTML = categories.map(cat => `
    <button
      class="cores-tab ${cat === activeCoresTab ? 'cores-tab--active' : ''}"
      data-cat="${cat}"
    >
      ${CATEGORIES[cat].icon} ${CATEGORIES[cat].label}
      <span class="cores-tab-count">${coresStore[cat].length}</span>
    </button>
  `).join('');

  tabsEl.querySelectorAll('.cores-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCoresTab = btn.dataset.cat;
      renderMyCores();
    });
  });

  /* 탭 내용 렌더 */
  const entries = coresStore[activeCoresTab] || [];
  if (entries.length === 0) {
    contentEl.innerHTML = '<div class="cores-empty">이 카테고리에 저장된 항목이 없습니다.</div>';
    return;
  }

  contentEl.innerHTML = [...entries].reverse().map(entry => `
    <div class="cores-entry">
      <div class="cores-entry-header">
        <span class="cores-entry-source">${entry.source}</span>
        <span class="cores-entry-date">${entry.savedAt}</span>
        <button class="cores-entry-delete" data-id="${entry.id}" data-cat="${entry.catKey}" title="삭제">×</button>
      </div>
      <div class="cores-entry-title">${entry.title}</div>
      <ul class="cores-entry-items">
        ${entry.items.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  // 삭제 버튼 이벤트
  contentEl.querySelectorAll('.cores-entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, cat } = btn.dataset;
      coresStore[cat] = coresStore[cat].filter(e => e.id !== Number(id));
      if (coresStore[cat].length === 0) delete coresStore[cat];
      renderMyCores();
    });
  });
}


/* ════════════════════════════════════════════════════════════════════════
   3. 환전 수수료 비교 — 다국어 화폐 지원
════════════════════════════════════════════════════════════════════════ */

/**
 * 10개 수취 화폐 메타 정보
 * marketRate: AUD 1 기준 수취 금액 (Mock 기준)
 * decimals: 소수점 자릿수
 */
const CURRENCIES = {
  KRW: { symbol: '₩',   name: '한국 원화',       decimals: 0, marketRate: 896.00  },
  USD: { symbol: '$',   name: '미국 달러',        decimals: 2, marketRate: 0.6350  },
  CNY: { symbol: '¥',   name: '중국 위안화',      decimals: 2, marketRate: 4.6120  },
  EUR: { symbol: '€',   name: '유로',             decimals: 2, marketRate: 0.5901  },
  VND: { symbol: '₫',   name: '베트남 동',        decimals: 0, marketRate: 16280   },
  JPY: { symbol: '¥',   name: '일본 엔',          decimals: 0, marketRate: 97.85   },
  GBP: { symbol: '£',   name: '영국 파운드',      decimals: 2, marketRate: 0.5102  },
  CAD: { symbol: 'C$',  name: '캐나다 달러',      decimals: 2, marketRate: 0.8721  },
  NZD: { symbol: 'NZ$', name: '뉴질랜드 달러',    decimals: 2, marketRate: 1.0851  },
  SGD: { symbol: 'S$',  name: '싱가포르 달러',    decimals: 2, marketRate: 0.8642  },
};

/**
 * 앱별 환율 스프레드 계수 (시장 환율 대비 실제 적용 환율 비율)
 * 각 화폐마다 경쟁력이 다름 (송금 앱의 실제 구조 반영)
 */
const APP_RATE_FACTORS = {
  wirebarley: {
    KRW: 0.9972, USD: 0.9968, CNY: 0.9965, EUR: 0.9970,
    VND: 0.9955, JPY: 0.9968, GBP: 0.9965, CAD: 0.9972, NZD: 0.9975, SGD: 0.9970,
  },
  wise: {
    KRW: 0.9991, USD: 0.9994, CNY: 0.9988, EUR: 0.9992,
    VND: 0.9980, JPY: 0.9993, GBP: 0.9991, CAD: 0.9994, NZD: 0.9993, SGD: 0.9994,
  },
  sentbe: {
    KRW: 0.9960, USD: 0.9955, CNY: 0.9950, EUR: 0.9958,
    VND: 0.9940, JPY: 0.9955, GBP: 0.9952, CAD: 0.9960, NZD: 0.9963, SGD: 0.9958,
  },
};

/** 3개 송금 앱 정의 */
const REMIT_APPS = [
  {
    id:      'wirebarley',
    name:    'WireBarley',
    nameKo:  '와이어발리',
    color:   '#3b82f6',
    feeType: 'tiered_flat',
    feeDesc: '구간별 정액 수수료',
    feeTiers: [
      { maxAud: 999,      fee: 1.49 },
      { maxAud: 2999,     fee: 1.29 },
      { maxAud: 6200,     fee: 0.99 },
      { maxAud: Infinity, fee: 0.99 },
    ],
  },
  {
    id:         'wise',
    name:       'Wise',
    nameKo:     '와이즈',
    color:      '#10b981',
    feeType:    'base_plus_percent',
    feeDesc:    '기본 A$0.50 + 0.45%',
    baseFee:    0.50,
    feePercent: 0.0045,
  },
  {
    id:      'sentbe',
    name:    'SentBe',
    nameKo:  '센트비',
    color:   '#f97316',
    feeType: 'tiered_flat',
    feeDesc: '구간별 정액 수수료',
    feeTiers: [
      { maxAud: 499,      fee: 2.50 },
      { maxAud: 1999,     fee: 1.99 },
      { maxAud: Infinity, fee: 1.50 },
    ],
  },
];

/** 수수료 계산 (AUD 단위 반환) */
function calcFee(app, aud) {
  if (app.feeType === 'tiered_flat') {
    const tier = app.feeTiers.find(t => aud <= t.maxAud);
    return tier ? tier.fee : app.feeTiers.at(-1).fee;
  }
  if (app.feeType === 'base_plus_percent') {
    return app.baseFee + aud * app.feePercent;
  }
  return 0;
}

/** 앱 적용 환율 계산 */
function appRate(app, currency) {
  const market  = CURRENCIES[currency].marketRate;
  const factor  = APP_RATE_FACTORS[app.id][currency] ?? 0.9970;
  return market * factor;
}

/** 수령 금액 포맷 */
function fmtAmount(amount, currency) {
  const cur  = CURRENCIES[currency];
  const val  = cur.decimals === 0 ? Math.round(amount) : amount;
  const num  = val.toLocaleString('en', { minimumFractionDigits: cur.decimals, maximumFractionDigits: cur.decimals });
  return cur.symbol + num;
}

/** 비교 카드 렌더링 */
function renderRemitCards() {
  const container  = document.getElementById('remitCards');
  const aud        = parseFloat(document.getElementById('audInput').value) || 0;
  const currency   = document.getElementById('currencySelect').value;
  const cur        = CURRENCIES[currency];

  // 기준 환율 표시 업데이트
  document.getElementById('marketRateDisplay').textContent =
    `1 AUD = ${cur.marketRate.toLocaleString('en', { minimumFractionDigits: cur.decimals, maximumFractionDigits: cur.decimals })} ${currency}`;

  // 배지 레이블 업데이트
  document.getElementById('remitBadgeLabel').textContent = `AUD → ${currency}`;

  if (!aud || aud <= 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0">금액을 입력하면 비교 결과가 표시됩니다.</p>';
    return;
  }

  // 각 앱 계산
  const results = REMIT_APPS.map(app => {
    const fee       = calcFee(app, aud);
    const netAud    = Math.max(0, aud - fee);
    const rate      = appRate(app, currency);
    const received  = netAud * rate;
    const marketAmt = aud * cur.marketRate;
    const diff      = received - marketAmt;
    return { app, fee, netAud, rate, received, marketAmt, diff };
  });

  // 최고 수령액 앱 판정
  const bestReceived = Math.max(...results.map(r => r.received));

  container.innerHTML = results.map(({ app, fee, rate, received, diff }) => {
    const isBest     = Math.abs(received - bestReceived) < 0.5;
    const diffSign   = diff >= 0 ? '+' : '';
    const diffClass  = diff >= 0 ? 'positive' : 'negative';
    const feeDisplay = app.feeType === 'base_plus_percent'
      ? `A$${fee.toFixed(2)} (기본+비율)` : `A$${fee.toFixed(2)}`;

    return `
      <div class="remit-card${isBest ? ' remit-card--best' : ''}" style="--app-color:${app.color}">
        ${isBest ? `<div class="remit-best-badge">Best Deal</div>` : ''}
        <div class="remit-card-body">
          <div class="remit-app-name">
            <div class="remit-app-dot"></div>
            <div>
              <div class="remit-app-label">${app.name}</div>
              <div class="remit-app-sublabel">${app.nameKo}</div>
            </div>
          </div>
          <div class="remit-detail-row">
            <div class="remit-detail-item">
              <span class="detail-label">적용 환율</span>
              <span class="detail-value">${rate.toLocaleString('en',{minimumFractionDigits:cur.decimals,maximumFractionDigits:cur.decimals})} ${currency}</span>
            </div>
            <div class="remit-detail-item">
              <span class="detail-label">수수료</span>
              <span class="detail-value detail-value--fee">${feeDisplay}</span>
            </div>
          </div>
          <div class="remit-divider"></div>
          <div class="remit-total-row">
            <span class="remit-total-label">최종 수령액</span>
            <span class="remit-total-amount">${fmtAmount(received, currency)}</span>
            <span class="remit-vs-market ${diffClass}">
              시장 기준 ${diffSign}${fmtAmount(diff, currency)}
            </span>
          </div>
          <div class="remit-fee-type">${app.feeDesc}</div>
        </div>
      </div>`;
  }).join('');
}

/* ── 이벤트: AUD 입력 & 화폐 선택 변경 시 즉시 재계산 ── */
document.getElementById('audInput').addEventListener('input', renderRemitCards);
document.getElementById('currencySelect').addEventListener('change', renderRemitCards);

/* 초기 렌더 */
renderRemitCards();


/* ════════════════════════════════════════════════════════════════════════
   4. 호주 파워볼 — 내비게이션 + 잭팟 토글 + 상세 패널
════════════════════════════════════════════════════════════════════════ */

/* ── 파워볼 목업 데이터 생성 함수 ── */

/**
 * 중복 없는 랜덤 정수 배열 생성
 * @param {number} count - 뽑을 개수
 * @param {number} min   - 최솟값(포함)
 * @param {number} max   - 최댓값(포함)
 */
function pickUnique(count, min, max) {
  const set = new Set();
  while (set.size < count) set.add(Math.floor(Math.random() * (max - min + 1)) + min);
  return [...set].sort((a, b) => a - b);
}

/**
 * 2년치(약 104주) 파워볼 역사 데이터를 랜덤 생성
 * 각 회차마다 번호·잭팟·당첨자 수를 그때그때 생성하되,
 * 동일 인덱스 접근 시 항상 같은 데이터를 반환하도록 시드값 고정
 */
function generatePowerballHistory(count = 104) {
  const history = [];
  const base    = new Date('2026-05-21T20:30:00'); // 기준 날짜 (최신 회차)

  for (let i = 0; i < count; i++) {
    // 날짜 계산 (i주 전)
    const d = new Date(base);
    d.setDate(base.getDate() - i * 7);

    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const day  = days[d.getDay()];

    // 잭팟 (500만~6000만 달러 구간, 연속 미당첨 시 증가 패턴 모사)
    const jackpot = (Math.floor(Math.random() * 55) + 5) * 1_000_000;

    // 1등 당첨자 (30% 확률로 1~3명, 나머지는 0명 = 이월)
    const div1Winners = Math.random() < 0.35 ? Math.floor(Math.random() * 3) + 1 : 0;

    history.push({
      draw:     1472 - i,
      date:     `${yyyy}년 ${mm}월 ${dd}일`,
      dateShort:`${yyyy}.${mm}.${dd}`,
      dayName:  day,
      main:     pickUnique(7, 1, 35),
      powerball:Math.floor(Math.random() * 20) + 1,
      jackpot,
      prizes: [
        {
          div: 1, label: '1등', match: '7개 + 파워볼',
          winners: div1Winners,
          prize: div1Winners > 0 ? Math.floor(jackpot / div1Winners) : null, // null = 이월
        },
        {
          div: 2, label: '2등', match: '7개',
          winners: Math.floor(Math.random() * 12) + 1,
          prize: Math.floor(Math.random() * 200_000) + 50_000,
        },
        {
          div: 3, label: '3등', match: '6개 + 파워볼',
          winners: Math.floor(Math.random() * 80) + 10,
          prize: Math.floor(Math.random() * 8_000) + 2_000,
        },
        {
          div: 4, label: '4등', match: '6개',
          winners: Math.floor(Math.random() * 800) + 100,
          prize: Math.floor(Math.random() * 400) + 80,
        },
        {
          div: 5, label: '5등', match: '5개 + 파워볼',
          winners: Math.floor(Math.random() * 40_000) + 8_000,
          prize: Math.floor(Math.random() * 40) + 8,
        },
      ],
    });
  }
  return history;
}

/* ── 파워볼 히스토리 (한 번만 생성) ── */
const PB_HISTORY = generatePowerballHistory(104);
let pbIndex      = 0; // 현재 표시 중인 회차 인덱스 (0 = 최신)

/* ── 잭팟 화폐 전환 토글 ── */
// 표시 순서: AUD → KRW → USD → EUR → JPY → (반복)
const JACKPOT_CURRENCIES = [
  { key: 'AUD', symbol: 'A$', rate: 1,      decimals: 0, label: '' },
  { key: 'KRW', symbol: '₩',  rate: 896.00, decimals: 0, label: '≈ ' },
  { key: 'USD', symbol: '$',  rate: 0.6350, decimals: 2, label: '≈ ' },
  { key: 'EUR', symbol: '€',  rate: 0.5901, decimals: 2, label: '≈ ' },
  { key: 'JPY', symbol: '¥',  rate: 97.85,  decimals: 0, label: '≈ ' },
];
let jackpotCurrIdx = 0;

/** 잭팟 금액 표시 업데이트 */
function updateJackpotDisplay(jackpotAUD) {
  const cur    = JACKPOT_CURRENCIES[jackpotCurrIdx];
  const amount = jackpotAUD * cur.rate;
  const fmt    = amount.toLocaleString('en', {
    minimumFractionDigits: cur.decimals, maximumFractionDigits: cur.decimals,
  });

  document.getElementById('pbJackpotAmount').textContent = `${cur.label}${cur.symbol}${fmt}`;

  // 서브라인: 다음 화폐 미리보기
  const next = JACKPOT_CURRENCIES[(jackpotCurrIdx + 1) % JACKPOT_CURRENCIES.length];
  const nextAmt = (jackpotAUD * next.rate).toLocaleString('en', {
    minimumFractionDigits: next.decimals, maximumFractionDigits: next.decimals,
  });
  document.getElementById('pbJackpotSub').textContent = `탭 → ${next.key}: ${next.label}${next.symbol}${nextAmt}`;
}

/* 잭팟 클릭 이벤트 */
document.getElementById('pbJackpotBox').addEventListener('click', () => {
  jackpotCurrIdx = (jackpotCurrIdx + 1) % JACKPOT_CURRENCIES.length;
  updateJackpotDisplay(PB_HISTORY[pbIndex].jackpot);
});

/* ── 파워볼 화면 렌더링 ── */
function renderPowerball(index) {
  const draw = PB_HISTORY[index];
  if (!draw) return;

  /* 부제목 업데이트 */
  document.getElementById('pbDrawSubtitle').textContent =
    `Draw #${draw.draw} · ${draw.date} (${draw.dayName})`;

  /* 잭팟 표시 */
  updateJackpotDisplay(draw.jackpot);

  /* 내비게이션 콘텐츠: 날짜 + 공 */
  const navContent = document.getElementById('pbNavContent');
  navContent.innerHTML = `
    <div class="pb-draw-info-row">
      <span class="pb-draw-number">Draw #${draw.draw}</span>
      <span class="pb-draw-date">${draw.date}</span>
      <span class="pb-draw-day">(${draw.dayName})</span>
    </div>
    <div class="pb-balls-row">
      ${draw.main.map(n => `<div class="pb-ball pb-ball--regular">${n}</div>`).join('')}
      <span class="pb-plus-sign">+</span>
      <div class="pb-ball pb-ball--power">${draw.powerball}</div>
    </div>`;

  /* 내비게이션 버튼 활성/비활성 */
  document.getElementById('pbPrevBtn').disabled = (index >= PB_HISTORY.length - 1);
  document.getElementById('pbNextBtn').disabled = (index <= 0);

  /* 당첨 내역 테이블 렌더 */
  renderPrizesTable(draw);

  /* 왼쪽 화살표(이전 회차) 클릭 시 자동으로 패널 펼치기 */
  if (index > 0) openPrizePanel();
}

/** 당첨 내역 테이블 렌더 */
function renderPrizesTable(draw) {
  const table = document.getElementById('pbPrizeTable');
  table.innerHTML = `
    <div class="pb-prize-row header">
      <div></div>
      <div>조건</div>
      <div>당첨자 수</div>
      <div>1인당 당첨금</div>
    </div>
    ${draw.prizes.map(p => `
      <div class="pb-prize-row">
        <div><span class="pb-div-badge pb-div-${p.div}">${p.label}</span></div>
        <div class="pb-div-match">${p.match}</div>
        <div class="pb-div-winners">${p.winners > 0 ? `${comma(p.winners)}명` : '—'}</div>
        <div class="pb-div-prize">
          ${p.prize != null
            ? `A$${comma(p.prize)}`
            : '<span style="color:var(--gold-light)">이월</span>'}
        </div>
      </div>`).join('')}`;
}

/** 당첨 내역 패널 펼치기 */
function openPrizePanel() {
  const wrap   = document.getElementById('pbPrizeTableWrap');
  const arrow  = document.getElementById('pbPrizeArrow');
  const toggle = document.getElementById('pbPrizeToggle');
  const text   = document.getElementById('pbPrizeToggleText');
  wrap.classList.add('open');
  arrow.classList.add('open');
  toggle.classList.add('open');
  text.textContent = '당첨 내역 접기';
}

/** 당첨 내역 패널 토글 */
document.getElementById('pbPrizeToggle').addEventListener('click', () => {
  const wrap   = document.getElementById('pbPrizeTableWrap');
  const arrow  = document.getElementById('pbPrizeArrow');
  const toggle = document.getElementById('pbPrizeToggle');
  const text   = document.getElementById('pbPrizeToggleText');
  const isOpen = wrap.classList.contains('open');

  wrap.classList.toggle('open', !isOpen);
  arrow.classList.toggle('open', !isOpen);
  toggle.classList.toggle('open', !isOpen);
  text.textContent = isOpen ? '당첨 내역 보기' : '당첨 내역 접기';
});

/* ── 내비게이션 버튼 이벤트 ── */
document.getElementById('pbPrevBtn').addEventListener('click', () => {
  if (pbIndex < PB_HISTORY.length - 1) {
    pbIndex++;
    renderPowerball(pbIndex);
  }
});
document.getElementById('pbNextBtn').addEventListener('click', () => {
  if (pbIndex > 0) {
    pbIndex--;
    renderPowerball(pbIndex);
  }
});

/* ── 파워볼 초기 렌더 ── */
renderPowerball(0);
