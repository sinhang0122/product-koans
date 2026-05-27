import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain:        'koaus-f564c.firebaseapp.com',
  projectId:         'koaus-f564c',
  storageBucket:     'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId:             '1:663988594088:web:ef30c2fd557407b00b299d',
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const provider    = new GoogleAuthProvider();

// ── Sidebar toggle ──
const hBtn = document.getElementById('hamburgerBtn');
const cBtn = document.getElementById('sidebarCloseBtn');
const sb   = document.getElementById('sidebar');
const ov   = document.getElementById('sidebarOverlay');

const openSb  = () => { sb.classList.add('open'); ov.classList.add('open'); document.body.style.overflow = 'hidden'; hBtn.setAttribute('aria-expanded', 'true'); };
const closeSb = () => { sb.classList.remove('open'); ov.classList.remove('open'); document.body.style.overflow = ''; hBtn.setAttribute('aria-expanded', 'false'); };

hBtn.addEventListener('click', openSb);
cBtn.addEventListener('click', closeSb);
ov.addEventListener('click', closeSb);
document.addEventListener('keydown', e => e.key === 'Escape' && closeSb());

// ── Accordion ──
document.querySelectorAll('.accord-header').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.accord-item').classList.toggle('open'));
});

// ── Theme ──
function applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('koaus-theme', t);
  document.querySelectorAll('.setting-btn').forEach(b => b.classList.toggle('active', b.dataset.themeSet === t));
}

document.querySelectorAll('.setting-btn').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.themeSet));
});

applyTheme(
  localStorage.getItem('koaus-theme') ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
);

// ── Auth ──
const loginBtn = document.getElementById('loginBtn');

onAuthStateChanged(auth, user => {
  if (user) {
    loginBtn.textContent = user.displayName?.split(' ')[0] || '계정';
    loginBtn.title = user.email;
    loginBtn.onclick = () => signOut(auth);
  } else {
    loginBtn.textContent = '로그인';
    loginBtn.title = 'Google 로그인';
    loginBtn.onclick = () => signInWithPopup(auth, provider).catch(() => {});
  }
});

// ── Exchange rate calculator ──
const CURRENCY_API = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies';
const ratesCache   = {};

async function fetchRates(base) {
  try {
    const res  = await fetch(`${CURRENCY_API}/${base}.json`);
    const data = await res.json();
    return data[base];
  } catch {
    return null;
  }
}

async function updateCalc() {
  const amountEl  = document.getElementById('calcAmount');
  const fromEl    = document.getElementById('calcFrom');
  const toEl      = document.getElementById('calcTo');
  const resultEl  = document.getElementById('calcResult');
  const curEl     = document.getElementById('calcResultCurrency');
  const rateEl    = document.getElementById('calcRateInfo');
  const updatedEl = document.getElementById('calcUpdated');

  if (!amountEl) return;

  const from   = fromEl.value;
  const to     = toEl.value;
  const amount = parseFloat(amountEl.value) || 0;

  if (!ratesCache[from]) {
    ratesCache[from] = await fetchRates(from);
  }

  const r = ratesCache[from];
  if (!r || r[to] == null) {
    resultEl.textContent    = '오류';
    updatedEl.textContent   = 'API 오류 — 잠시 후 다시 시도해 주세요';
    return;
  }

  const converted = amount * r[to];
  const isKrw     = to === 'krw';
  const fmt        = isKrw
    ? new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
    : new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  resultEl.textContent  = fmt.format(converted);
  curEl.textContent     = to.toUpperCase();

  const rate1Fmt = isKrw
    ? new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(r[to])
    : new Intl.NumberFormat('en-AU', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(r[to]);

  rateEl.textContent    = `1 ${from.toUpperCase()} = ${rate1Fmt} ${to.toUpperCase()}`;
  updatedEl.textContent = '실시간 기준';
}

function setupCalc() {
  const amountEl = document.getElementById('calcAmount');
  if (!amountEl) return;

  amountEl.addEventListener('input', updateCalc);
  document.getElementById('calcFrom').addEventListener('change', updateCalc);
  document.getElementById('calcTo').addEventListener('change', updateCalc);
  document.getElementById('calcSwap').addEventListener('click', () => {
    const from = document.getElementById('calcFrom');
    const to   = document.getElementById('calcTo');
    const tmp  = from.value;
    from.value = to.value;
    to.value   = tmp;
    updateCalc();
  });

  updateCalc();
}

setupCalc();

// ── Footer stats ──
function updateFooterStats() {
  const KEY   = 'koaus-visit-count';
  const count = (parseInt(localStorage.getItem(KEY) || '0', 10)) + 1;
  localStorage.setItem(KEY, String(count));

  const visitEl = document.getElementById('visitCount');
  if (visitEl) visitEl.textContent = new Intl.NumberFormat().format(count);

  const BOARDS = [
    'koaus-jobs-posts',
    'koaus-accom-posts',
    'koaus-rent-posts',
    'koaus-car-sale-posts',
    'koaus-car-rent-posts',
  ];
  let total = 0;
  BOARDS.forEach(k => {
    try { total += JSON.parse(localStorage.getItem(k) || '[]').length; } catch {}
  });

  const postEl = document.getElementById('postCount');
  if (postEl) postEl.textContent = new Intl.NumberFormat().format(total);
}

updateFooterStats();
