import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js';
import {
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain:        'koaus-f564c.firebaseapp.com',
  projectId:         'koaus-f564c',
  storageBucket:     'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId:             '1:663988594088:web:ef30c2fd557407b00b299d',
  measurementId:     'G-DERZ9MTKPL',
};

const firebaseApp = initializeApp(firebaseConfig);
const analytics   = getAnalytics(firebaseApp);
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
  signInWithPopup(auth, new GoogleAuthProvider())
    .then(closeAuthModal)
    .catch(error => { console.error('로그인 에러:', error); });
});

// ── My Account Modal ──
const myAccountModal = document.getElementById('myAccountModal');

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  const show = local.slice(0, Math.min(4, local.length));
  return `${show}***@${domain}`;
}

function openMyAccountModal() {
  const user = auth.currentUser;
  if (!user) return;
  const nick = localStorage.getItem('koaus-nickname') || user.displayName || user.email?.split('@')[0] || '사용자';
  document.getElementById('myAcctAvatar').textContent = (nick[0] || '?').toUpperCase();
  document.getElementById('myAcctName').textContent   = nick;
  document.getElementById('myAcctEmail').textContent  = maskEmail(user.email || '');
  myAccountModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMyAccountModal() {
  myAccountModal.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('myAccountClose').addEventListener('click', closeMyAccountModal);
myAccountModal.addEventListener('click', e => { if (e.target === myAccountModal) closeMyAccountModal(); });

// Nickname edit with 90-day restriction
document.getElementById('myAcctEditBtn').addEventListener('click', () => {
  const NICK_KEY = 'koaus-nick-changed-at';
  const last     = parseInt(localStorage.getItem(NICK_KEY) || '0', 10);
  const daysSince = last ? (Date.now() - last) / (1000 * 60 * 60 * 24) : Infinity;
  if (daysSince < 90) {
    const daysLeft = Math.ceil(90 - daysSince);
    alert(`닉네임은 3개월에 한 번만 변경 가능합니다.\n(${daysLeft}일 후 변경 가능)`);
    return;
  }
  const current = document.getElementById('myAcctName').textContent;
  const newNick = prompt('새 닉네임을 입력하세요:', current);
  if (!newNick || !newNick.trim() || newNick.trim() === current) return;
  const trimmed = newNick.trim();
  localStorage.setItem('koaus-nickname', trimmed);
  localStorage.setItem(NICK_KEY, String(Date.now()));
  document.getElementById('myAcctName').textContent   = trimmed;
  document.getElementById('myAcctAvatar').textContent = trimmed[0].toUpperCase();
  updateProfile(auth.currentUser, { displayName: trimmed }).catch(() => {});
});

// Section accordions
document.querySelectorAll('.myacct-section-hdr').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.myacct-section').classList.toggle('open'));
});

// Logout button inside modal
document.getElementById('myAccountLogout').addEventListener('click', () => {
  closeMyAccountModal();
  signOut(auth);
});

// ── Auth ──
const loginBtn = document.getElementById('loginBtn');

onAuthStateChanged(auth, user => {
  if (user) {
    const nick = localStorage.getItem('koaus-nickname') || user.displayName?.split(' ')[0] || user.email?.split('@')[0] || '계정';
    loginBtn.textContent = nick;
    loginBtn.title = '내 계정';
    loginBtn.onclick = openMyAccountModal;
  } else {
    loginBtn.textContent = '로그인';
    loginBtn.title = '로그인 / 회원가입';
    loginBtn.onclick = openAuthModal;
  }
});

// ── Exchange rate calculator ──
const FALLBACK_RATES = {
  aud: { aud: 1,          krw: 900,       usd: 0.63   },
  krw: { krw: 1,          aud: 0.00111,   usd: 0.00073 },
  usd: { usd: 1,          aud: 1.58,      krw: 1370   },
};
const ratesCache  = {};
let   usingFallback = false;

async function fetchRates(base) {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base.toUpperCase()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.result !== 'success') throw new Error('API error');
    const rates = {};
    for (const [k, v] of Object.entries(data.rates)) rates[k.toLowerCase()] = v;
    rates[base.toLowerCase()] = 1;
    usingFallback = false;
    return rates;
  } catch (err) {
    console.error('환율 API 오류:', err);
    usingFallback = true;
    return { ...(FALLBACK_RATES[base.toLowerCase()] || {}) };
  }
}

function renderCalc() {
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
  const r      = ratesCache[from];

  if (!r || r[to] == null) {
    resultEl.textContent  = '—';
    updatedEl.textContent = '환율 데이터를 불러오는 중입니다…';
    return;
  }

  const rate      = r[to];
  const converted = amount * rate;

  resultEl.textContent  = converted.toFixed(2);
  curEl.textContent     = to.toUpperCase();
  rateEl.textContent    = `1 ${from.toUpperCase()} = ${rate.toFixed(2)} ${to.toUpperCase()}`;
  updatedEl.textContent = usingFallback
    ? '현재 실시간 환율을 불러올 수 없어 기본 환율이 적용되었습니다'
    : '실시간 기준 (open.er-api.com)';

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

async function loadRatesFor(base) {
  if (!ratesCache[base]) {
    document.getElementById('calcUpdated').textContent = '불러오는 중…';
    ratesCache[base] = await fetchRates(base);
  }
}

async function setupCalc() {
  const amountEl = document.getElementById('calcAmount');
  if (!amountEl) return;

  const fromEl = document.getElementById('calcFrom');
  const toEl   = document.getElementById('calcTo');

  // 페이지 로드 시 최초 1회만 fetch
  await loadRatesFor(fromEl.value);
  renderCalc();

  // 금액 입력: fetch 없이 계산만
  amountEl.addEventListener('input', renderCalc);
  toEl.addEventListener('change', renderCalc);

  // 기준 통화 변경: 해당 통화 rates가 없을 때만 fetch
  fromEl.addEventListener('change', async () => {
    await loadRatesFor(fromEl.value);
    renderCalc();
  });

  document.getElementById('calcSwap').addEventListener('click', async () => {
    const tmp    = fromEl.value;
    fromEl.value = toEl.value;
    toEl.value   = tmp;
    await loadRatesFor(fromEl.value);
    renderCalc();
  });
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
    const nick = user
      ? (localStorage.getItem('koaus-nickname') || user.displayName?.split(' ')[0] || '계정') + ' (My Account)'
      : '내 계정 (My Account)';
    acctBtn.textContent = nick;
    acctBtn.onclick = user ? openMyAccountModal : openAuthModal;
  });
}
