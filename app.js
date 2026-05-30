import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js';
import {
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendEmailVerification,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app-check.js';

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

// ── App Check (reCAPTCHA v3) — 봇·외부 스크립트의 백엔드(인증/DB) 접근 차단 ──
// 사이트 키 발급: Firebase 콘솔 > App Check > 앱 등록(reCAPTCHA v3 공급자)
// 키를 채우면 자동 활성화됨. (placeholder 상태에서는 운영 사이트를 깨뜨리지 않도록 건너뜀)
const APP_CHECK_SITE_KEY = 'TODO: 키 입력';
if (APP_CHECK_SITE_KEY && !APP_CHECK_SITE_KEY.startsWith('TODO')) {
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

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
// 초기 상태: 모든 아코디언 강제 닫힘 (펼침 방지)
document.querySelectorAll('.accord-item, .accord-subgroup').forEach(it => it.classList.remove('open'));
// Depth 2 (대분류) 토글 — 클릭 시 해당 소분류 컨테이너만 열고/닫음 (소분류 링크는 그대로 라우팅)
document.querySelectorAll('.sub-toggle').forEach(t => t.addEventListener('click', () => t.closest('.accord-subgroup').classList.toggle('open')));
document.querySelectorAll('.accord-header').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.accord-item');
    const willOpen = !item.classList.contains('open');
    // 한 번에 하나만 — 열려있는 다른 카테고리는 닫기
    document.querySelectorAll('.accord-item.open').forEach(o => { if (o !== item) o.classList.remove('open'); });
    item.classList.toggle('open', willOpen);
  });
});

// ── Theme ──
function applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('koaus-theme', t);
}

const themeToggleBtn = document.getElementById('themeToggleBtn');
if (themeToggleBtn) themeToggleBtn.addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

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
// 가입 버튼 활성화: 이용약관 동의 + reCAPTCHA 통과
const authAgree = document.getElementById('authAgree');
const authSignupBtn = document.getElementById('authSignupSubmit');
let recaptchaOK = false;
function updateSignupBtn() { authSignupBtn.disabled = !(authAgree.checked && recaptchaOK); }
if (authAgree) authAgree.addEventListener('change', updateSignupBtn);
window.onKoausRecaptcha = () => { recaptchaOK = true; updateSignupBtn(); };
window.onKoausRecaptchaExpired = () => { recaptchaOK = false; updateSignupBtn(); };
const tosOverlay = document.getElementById('tosOverlay');
const privacyOverlay = document.getElementById('privacyOverlay');
function closeTermsModal(ov) { if (ov) { ov.classList.remove('open'); } else { tosOverlay.classList.remove('open'); privacyOverlay.classList.remove('open'); } }
function openTermsModal(ov) { ov.classList.add('open'); history.pushState({ koausTerms: true }, ''); }
function userCloseTerms(ov) { closeTermsModal(ov); if (history.state && history.state.koausTerms) history.back(); }
document.getElementById('authTosLink').addEventListener('click', () => openTermsModal(tosOverlay));
document.getElementById('authPrivacyLink').addEventListener('click', () => openTermsModal(privacyOverlay));
// 푸터 이용약관 → 가입 모달의 약관 팝업 재사용 (개인정보처리방침은 privacy.html 독립 페이지로 라우팅)
const footerTosLink = document.getElementById('footerTosLink');
if (footerTosLink) footerTosLink.addEventListener('click', e => { e.preventDefault(); openTermsModal(tosOverlay); });
document.getElementById('tosClose').addEventListener('click', () => userCloseTerms(tosOverlay));
document.getElementById('tosConfirm').addEventListener('click', () => userCloseTerms(tosOverlay));
document.getElementById('privacyClose').addEventListener('click', () => userCloseTerms(privacyOverlay));
document.getElementById('privacyConfirm').addEventListener('click', () => userCloseTerms(privacyOverlay));
tosOverlay.addEventListener('click', e => { if (e.target === tosOverlay) userCloseTerms(tosOverlay); });
privacyOverlay.addEventListener('click', e => { if (e.target === privacyOverlay) userCloseTerms(privacyOverlay); });
window.addEventListener('popstate', () => closeTermsModal());

document.getElementById('authSignupSubmit').addEventListener('click', async () => {
  const email = document.getElementById('authSignupEmail').value.trim();
  const pw    = document.getElementById('authSignupPw').value;
  const pw2   = document.getElementById('authSignupPwConfirm').value;
  const errEl = document.getElementById('authSignupError');
  if (!authAgree.checked) { errEl.textContent = '이용약관에 동의해 주세요.'; return; }
  if (!email || !pw) { errEl.textContent = '이메일과 비밀번호를 입력해 주세요.'; return; }
  if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(pw)) { errEl.textContent = '비밀번호는 8자 이상이며 영문·숫자·특수문자를 각각 1개 이상 포함해야 합니다.'; return; }
  if (pw !== pw2)    { errEl.textContent = '비밀번호가 일치하지 않습니다.'; return; }
  if (typeof grecaptcha !== 'undefined' && !grecaptcha.getResponse()) { errEl.textContent = "'로봇이 아닙니다' 인증을 완료해 주세요."; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    try { await sendEmailVerification(cred.user); } catch (e) {}
    closeAuthModal();
    alert('가입이 완료되었습니다. 인증 메일을 보냈으니 메일함을 확인해 주세요.');
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
    .catch(error => {
      console.error('Google 로그인 에러:', error);
      const msg = error.code === 'auth/unauthorized-domain'
        ? '현재 도메인이 Firebase에 등록되지 않았습니다. (콘솔 승인 도메인 확인)'
        : (error.code === 'auth/popup-blocked' ? '팝업이 차단되었습니다. 팝업을 허용해 주세요.'
        : authErrMsg(error.code));
      document.getElementById('authLoginError').textContent = msg;
    });
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
  aud: { aud: 1, krw: 905, usd: 0.66, eur: 0.61, jpy: 99,  gbp: 0.52, cad: 0.90, nzd: 1.09, cny: 4.74, sgd: 0.88 },
  krw: { krw: 1, aud: 0.00110, usd: 0.00073, eur: 0.00067, jpy: 0.109, gbp: 0.00057, cad: 0.00099, nzd: 0.00120, cny: 0.00524, sgd: 0.00097 },
  usd: { usd: 1, aud: 1.52, krw: 1370, eur: 0.92, jpy: 150, gbp: 0.79, cad: 1.36, nzd: 1.65, cny: 7.2, sgd: 1.34 },
};
const ratesCache    = {};
let   usingFallback = false;
let   lastUpdateUnix = null;

async function fetchRates(base) {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base.toUpperCase()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.result !== 'success') throw new Error('API error');
    const rates = {};
    for (const [k, v] of Object.entries(data.rates)) rates[k.toLowerCase()] = v;
    rates[base.toLowerCase()] = 1;
    lastUpdateUnix = data.time_last_update_unix || null;
    usingFallback = false;
    return rates;
  } catch (err) {
    console.error('환율 API 오류:', err);
    usingFallback = true;
    return { ...(FALLBACK_RATES[base.toLowerCase()] || {}) };
  }
}

// "5월 28일 오후 10시 기준 (open.er-api.com)" 형식 (오전/오후 + 12시간제)
function formatUpdateTime() {
  if (usingFallback || !lastUpdateUnix) return '기본 환율 적용 중 (실시간 환율 불러오기 실패)';
  const d = new Date(lastUpdateUnix * 1000);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = (h % 12) || 12;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${ampm} ${h12}시 기준 (open.er-api.com)`;
}

// 환율 표시용: 큰 값은 소수 2자리, 작은 값은 정밀하게
function fmtRate(r) {
  if (r >= 100)  return r.toFixed(2);
  if (r >= 1)    return r.toFixed(2);
  if (r >= 0.01) return r.toFixed(4);
  return r.toFixed(6);
}

let rateManual = false;  // 사용자가 기준 환율을 직접 입력했는지

// API 환율을 [기준 환율 입력 칸]에 채우고 라벨/단위 동기화
function syncRateInput() {
  const fromEl = document.getElementById('calcFrom');
  const toEl   = document.getElementById('calcTo');
  const rateEl = document.getElementById('calcRate');
  if (!rateEl) return;
  const from = fromEl.value, to = toEl.value;
  const labelEl = document.getElementById('calcRateLabel');
  const unitEl  = document.getElementById('calcRateUnit');
  if (labelEl) labelEl.textContent = `기준 환율 (1 ${from.toUpperCase()})`;
  if (unitEl)  unitEl.textContent  = to.toUpperCase();
  const r = ratesCache[from];
  if (r && r[to] != null) rateEl.value = r[to] >= 100 ? r[to].toFixed(2) : r[to].toFixed(6);
}

function renderCalc() {
  const amountEl  = document.getElementById('calcAmount');
  const fromEl    = document.getElementById('calcFrom');
  const toEl      = document.getElementById('calcTo');
  const rateInEl  = document.getElementById('calcRate');
  const resultEl  = document.getElementById('calcResult');
  const curEl     = document.getElementById('calcResultCurrency');
  const rateInfoEl= document.getElementById('calcRateInfo');
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

  const apiRate = r[to];
  // 사용자가 직접 입력한 기준 환율이 있으면 그 값을, 없으면 API 값을 사용
  let rate = parseFloat(rateInEl && rateInEl.value);
  if (!isFinite(rate) || rate <= 0) rate = apiRate;

  resultEl.textContent  = (amount * rate).toLocaleString(undefined, { maximumFractionDigits: 2 });
  curEl.textContent     = to.toUpperCase();
  rateInfoEl.textContent = `1 ${from.toUpperCase()} = ${fmtRate(rate)} ${to.toUpperCase()}` + (rateManual ? ' (수동 입력)' : '');
  updatedEl.textContent = formatUpdateTime();

  renderCompare(from, to, amount, rate);
}

// 송금 앱별 구간 수수료·한도 비교 (AUD → KRW 전용)
function renderCompare(from, to, amount, rate) {
  const compareEl = document.getElementById('calcCompare');
  if (!compareEl) return;
  if (from !== 'aud' || to !== 'krw' || amount <= 0) { compareEl.style.display = 'none'; return; }

  const fmt0 = n => Math.round(n).toLocaleString();
  const wbFee = a => (a < 1000 ? 1.49 : a < 3000 ? 1.29 : 0.99);  // WireBarley 구간 고정 수수료
  const rows = [];

  // WireBarley — 한도 $6,200, 구간 고정 수수료를 원금에서 차감 후 환율 적용
  if (amount > 6200) rows.push({ name: 'WireBarley', blocked: '송금 한도 초과 ($6,200까지 가능)' });
  else { const f = wbFee(amount); rows.push({ name: 'WireBarley', feeText: `수수료 $${f.toFixed(2)}`, recv: (amount - f) * rate }); }

  // Wise — 한도 없음, 0.45% 비율 수수료
  rows.push({ name: 'Wise', feeText: '수수료 0.45%', recv: amount * (1 - 0.0045) * rate });

  // Sentbe — 한도 $5,000, 고정 수수료 $2.50
  if (amount > 5000) rows.push({ name: 'Sentbe', blocked: '송금 한도 초과 ($5,000까지 가능)' });
  else rows.push({ name: 'Sentbe', feeText: '수수료 $2.50', recv: (amount - 2.50) * rate });

  // Remitly — 한도 없음, $1,000 미만 $3.99 / 이상 무료
  { const f = amount < 1000 ? 3.99 : 0; rows.push({ name: 'Remitly', feeText: f ? `수수료 $${f.toFixed(2)}` : '수수료 무료', recv: (amount - f) * rate }); }

  const valid = rows.filter(x => !x.blocked && x.recv > 0);
  const best  = valid.length ? valid.reduce((a, b) => (b.recv > a.recv ? b : a)) : null;

  compareEl.innerHTML =
    `<div class="calc-compare-head"><span>송금 앱</span><span>예상 수취액</span></div>` +
    rows.map(x => {
      if (x.blocked) {
        return `<div class="calc-compare-row calc-compare-row--blocked">
          <span class="calc-compare-label">${x.name}</span>
          <span class="calc-compare-value calc-compare-blocked">${x.blocked}</span></div>`;
      }
      const isBest = best && x.name === best.name;
      return `<div class="calc-compare-row${isBest ? ' calc-compare-row--best' : ''}">
        <span class="calc-compare-label">${x.name} <em>${x.feeText}</em></span>
        <span class="calc-compare-value">${fmt0(x.recv)} KRW</span></div>`;
    }).join('') +
    (best ? `<div class="calc-compare-tip">💡 입력 금액 기준 <strong>${best.name}</strong>가 가장 많이 보냅니다</div>` : '');
  compareEl.style.display = 'flex';
}

// 항상 최신 환율을 가져온다 (새로고침/주기 갱신 시 최신 동기화)
async function loadRatesFor(base) {
  document.getElementById('calcUpdated').textContent = '불러오는 중…';
  ratesCache[base] = await fetchRates(base);
}

async function setupCalc() {
  const amountEl = document.getElementById('calcAmount');
  if (!amountEl) return;

  const fromEl = document.getElementById('calcFrom');
  const toEl   = document.getElementById('calcTo');
  const rateEl = document.getElementById('calcRate');

  await loadRatesFor(fromEl.value);
  syncRateInput();
  renderCalc();

  amountEl.addEventListener('input', renderCalc);
  // 기준 환율 직접 입력 → 수동 모드, 즉시 재계산
  rateEl.addEventListener('input', () => { rateManual = true; renderCalc(); });
  toEl.addEventListener('change', () => { rateManual = false; syncRateInput(); renderCalc(); });
  fromEl.addEventListener('change', async () => {
    await loadRatesFor(fromEl.value);
    rateManual = false; syncRateInput(); renderCalc();
  });
  document.getElementById('calcSwap').addEventListener('click', async () => {
    const tmp = fromEl.value; fromEl.value = toEl.value; toEl.value = tmp;
    await loadRatesFor(fromEl.value);
    rateManual = false; syncRateInput(); renderCalc();
  });

  // 10분마다 자동 갱신 (수동 입력 중이면 기준값은 보존)
  setInterval(async () => {
    ratesCache[fromEl.value] = await fetchRates(fromEl.value);
    if (!rateManual) syncRateInput();
    renderCalc();
  }, 600000);
}

setupCalc();

// ── Sidebar Account Button ──
const acctBtn = document.getElementById('sidebarAccountBtn');
if (acctBtn) {
  onAuthStateChanged(auth, user => {
    const nick = user
      ? (localStorage.getItem('koaus-nickname') || user.displayName?.split(' ')[0] || '계정') + ' (My Account)'
      : '내 계정 (My Account)';
    acctBtn.textContent = nick;
    acctBtn.onclick = user ? (() => { window.location.href = 'mypage.html'; }) : openAuthModal;
  });
}
