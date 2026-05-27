import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

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

// ── Auth Modal ──
const authOverlay  = document.getElementById('authOverlay');
const authClose    = document.getElementById('authClose');

let _authOpenedAt = 0;
const openAuthModal  = () => {
  _authOpenedAt = Date.now();
  authOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
};
const closeAuthModal = () => {
  if (Date.now() - _authOpenedAt < 300) return;
  authOverlay.classList.remove('open');
  document.body.style.overflow = '';
  clearAuthErrors();
};

authClose.addEventListener('click', () => {
  authOverlay.classList.remove('open');
  document.body.style.overflow = '';
  clearAuthErrors();
});
authOverlay.addEventListener('click', e => { if (e.target === authOverlay) closeAuthModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuthModal(); });

// Tabs
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.authTab;
    document.getElementById('authLoginForm').style.display  = target === 'login'  ? '' : 'none';
    document.getElementById('authSignupForm').style.display = target === 'signup' ? '' : 'none';
    clearAuthErrors();
  });
});

function clearAuthErrors() {
  document.getElementById('authLoginError').textContent  = '';
  document.getElementById('authSignupError').textContent = '';
}

function authErrMsg(code) {
  const map = {
    'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
    'auth/invalid-email':        '유효하지 않은 이메일입니다.',
    'auth/weak-password':        '비밀번호는 6자 이상이어야 합니다.',
    'auth/wrong-password':       '비밀번호가 틀렸습니다.',
    'auth/user-not-found':       '등록되지 않은 이메일입니다.',
    'auth/invalid-credential':   '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/too-many-requests':    '잠시 후 다시 시도해 주세요.',
  };
  return map[code] || '오류가 발생했습니다. 다시 시도해 주세요.';
}

// Email sign-up
document.getElementById('authSignupSubmit').addEventListener('click', async () => {
  const email = document.getElementById('authSignupEmail').value.trim();
  const pw    = document.getElementById('authSignupPw').value;
  const pw2   = document.getElementById('authSignupPwConfirm').value;
  const errEl = document.getElementById('authSignupError');
  if (!email || !pw) { errEl.textContent = '이메일과 비밀번호를 입력해 주세요.'; return; }
  if (pw !== pw2)    { errEl.textContent = '비밀번호가 일치하지 않습니다.'; return; }
  try {
    await createUserWithEmailAndPassword(auth, email, pw);
    closeAuthModal();
  } catch (e) { errEl.textContent = authErrMsg(e.code); }
});

// Email sign-in
document.getElementById('authLoginSubmit').addEventListener('click', async () => {
  const email = document.getElementById('authLoginEmail').value.trim();
  const pw    = document.getElementById('authLoginPw').value;
  const errEl = document.getElementById('authLoginError');
  if (!email || !pw) { errEl.textContent = '이메일과 비밀번호를 입력해 주세요.'; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    closeAuthModal();
  } catch (e) { errEl.textContent = authErrMsg(e.code); }
});

// Google sign-in (modal button)
document.getElementById('authGoogle').addEventListener('click', () => {
  signInWithPopup(auth, provider).then(closeAuthModal).catch(() => {});
});

// ── Auth ──
const loginBtn = document.getElementById('loginBtn');

onAuthStateChanged(auth, user => {
  if (user) {
    loginBtn.textContent = user.displayName?.split(' ')[0] || user.email?.split('@')[0] || '계정';
    loginBtn.title = user.email;
    loginBtn.onclick = () => signOut(auth);
  } else {
    loginBtn.textContent = '로그인';
    loginBtn.title = '로그인 / 회원가입';
    loginBtn.onclick = openAuthModal;
  }
});

// ── Exchange rate calculator ──
const ratesCache = {};

async function fetchRates(base) {
  try {
    const res  = await fetch(`https://api.frankfurter.app/latest?from=${base.toUpperCase()}`);
    const data = await res.json();
    const rates = {};
    for (const [k, v] of Object.entries(data.rates)) {
      rates[k.toLowerCase()] = v;
    }
    rates[base.toLowerCase()] = 1;
    return rates;
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

  updatedEl.textContent = '불러오는 중…';

  if (!ratesCache[from]) {
    ratesCache[from] = await fetchRates(from);
  }

  const r = ratesCache[from];
  if (!r || r[to] == null) {
    resultEl.textContent  = '오류';
    updatedEl.textContent = 'API 오류 — 잠시 후 다시 시도해 주세요';
    return;
  }

  const rate      = r[to];
  const converted = amount * rate;

  resultEl.textContent = converted.toFixed(2);
  curEl.textContent    = to.toUpperCase();
  rateEl.textContent   = `1 ${from.toUpperCase()} = ${rate.toFixed(2)} ${to.toUpperCase()}`;
  updatedEl.textContent = '실시간 기준 (Frankfurter API)';

  const compareEl = document.getElementById('calcCompare');
  if (compareEl) {
    if (from === 'aud' && to === 'krw' && amount > 0) {
      const wireReceived = amount * (rate - 11);
      const wiseReceived = amount * (1 - 0.006) * rate;
      const fmt2 = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const diff = Math.abs(wireReceived - wiseReceived).toFixed(2);
      const tip  = wireReceived >= wiseReceived
        ? `현재 환율 기준 WireBarley가 유리합니다 (약 ${diff}원 차이)`
        : `현재 환율 기준 Wise가 유리합니다 (약 ${diff}원 차이)`;
      compareEl.innerHTML = `
        <div class="calc-compare-row">
          <span class="calc-compare-label">WireBarley (기준가 −11원 스프레드)</span>
          <span class="calc-compare-value">${fmt2(wireReceived)} KRW</span>
        </div>
        <div class="calc-compare-row">
          <span class="calc-compare-label">Wise (수수료 0.6% 차감 후)</span>
          <span class="calc-compare-value">${fmt2(wiseReceived)} KRW</span>
        </div>
        <div class="calc-compare-tip">💡 ${tip}</div>`;
      compareEl.style.display = 'flex';
    } else {
      compareEl.style.display = 'none';
    }
  }
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

// ── Sidebar Account Button ──
const acctBtn = document.getElementById('sidebarAccountBtn');
if (acctBtn) {
  onAuthStateChanged(auth, user => {
    acctBtn.textContent = user
      ? (user.displayName?.split(' ')[0] || '계정') + ' (My Account)'
      : '내 계정 (My Account)';
    acctBtn.onclick = user
      ? () => signOut(auth)
      : () => signInWithPopup(auth, provider).catch(() => {});
  });
}
