// ── KoAus Phone Auth — Firebase Phone Authentication 공통 모듈 ──
//
// 흐름:
//   1) 로그인 유저(이메일+비번)가 글쓰기 등 권한 행동 시도 → koausCanPost(u) 검사
//      · u.emailVerified === true → 통과 (기존 이메일 인증 호환)
//      · !!u.phoneNumber === true → 통과
//      · 둘 다 false → koausPhoneVerify() 호출 → SMS 인증 후 linkWithCredential
//   2) 비로그인 유저는 우선 로그인 모달 (페이지별 openAuthModal)
//
// 의존: Firebase Auth (이미 각 페이지 모듈에서 초기화됨, window.koausAuthApp 또는 getApps()[0])
// 활성화: Firebase Console > Authentication > Sign-in method > Phone provider 켜야 동작
//        (console 미활성 상태에서는 sendCode 시 'auth/operation-not-allowed' 에러)

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getAuth, RecaptchaVerifier, PhoneAuthProvider, onAuthStateChanged, signOut,
  linkWithCredential,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

// Firebase 앱은 페이지별 모듈에서 이미 초기화됐을 가능성 — getApps() 재사용
const firebaseConfig = {
  apiKey:'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU', authDomain:'koaus-f564c.firebaseapp.com',
  projectId:'koaus-f564c', storageBucket:'koaus-f564c.firebasestorage.app',
  messagingSenderId:'663988594088', appId:'1:663988594088:web:ef30c2fd557407b00b299d',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// ── canPost: 글쓰기 자격 검증 ──
// 이메일 인증 OR 휴대폰 인증 둘 중 하나만 통과해도 OK (Option B 정책)
window.koausCanPost = function (user) {
  if (!user) return false;
  return !!user.emailVerified || !!user.phoneNumber;
};

// ── Phone Auth 모달 (body 끝 1회 inject) ──
function mountPhoneModal() {
  if (document.getElementById('koausPhoneOverlay')) return;
  const html = `
    <div id="koausPhoneOverlay" class="report-overlay" role="dialog" aria-modal="true" style="z-index:9999;">
      <div class="report-modal report-card" style="max-width:380px;">
        <div class="koaus-extra-tabs" role="tablist" aria-label="휴대폰 인증">
          <span class="koaus-extra-tab is-active" role="tab">📱 휴대폰 인증</span>
          <button type="button" class="report-close" id="koausPhoneClose" aria-label="닫기">✕</button>
        </div>
        <div class="report-body" id="koausPhoneBody">
          <!-- Step 1: 번호 입력 -->
          <div data-step="phone">
            <p style="font-size:12.5px;color:var(--text-muted);margin:6px 0 12px;line-height:1.55;">
              호주 휴대폰 번호로 SMS 인증코드를 보내드립니다.<br>
              <span style="color:var(--text-secondary);">예: 0412 345 678 또는 +61 412 345 678</span>
            </p>
            <div class="auth-field">
              <label class="auth-label" for="koausPhoneInput">휴대폰 번호 (AU)</label>
              <input class="auth-input" id="koausPhoneInput" type="tel" autocomplete="tel" inputmode="tel" placeholder="04XX XXX XXX 또는 +61..." maxlength="20" />
            </div>
            <p class="koaus-extra-msg" id="koausPhoneMsg" style="font-size:12.5px;color:var(--text-muted);margin:8px 0 4px;min-height:18px;"></p>
            <div id="koausRecaptchaSlot" style="margin:8px 0;"></div>
            <button class="auth-submit" id="koausPhoneSendBtn" style="margin-top:4px;">인증번호 받기</button>
            <!-- 폰② 정책 안내 (차분한 톤 · 정적 텍스트) -->
            <div style="margin-top:14px;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm);font-size:11.5px;color:var(--text-muted);line-height:1.6;">
              <p style="margin:0 0 5px;"><b style="color:var(--text-secondary);">휴대폰 번호는 본인 확인용 보조 인증</b>입니다. 로그인은 항상 이메일·구글 계정으로 이루어집니다.</p>
              <p style="margin:0 0 5px;">번호를 변경하시면 새 번호로 다시 인증이 필요합니다. (번호 재인증 기능은 준비 중이며, 그 전에는 카카오톡·문의하기로 도와드립니다.)</p>
              <p style="margin:0;">오래 사용하지 않거나 타인에게 재발급된 번호는 연결이 해제될 수 있습니다. 이 경우에도 <b style="color:var(--text-secondary);">계정은 안전</b>하며, 이메일·구글로 정상 로그인되니 걱정하지 않으셔도 됩니다.</p>
            </div>
          </div>
          <!-- Step 2: 코드 입력 -->
          <div data-step="code" hidden>
            <p style="font-size:12.5px;color:var(--text-muted);margin:6px 0 8px;line-height:1.55;">
              <b id="koausPhoneEcho">—</b> 로 6자리 인증코드를 보냈습니다.
            </p>
            <!-- 메인 타이머 — 3분 (180s) 유효시간 -->
            <div id="koausPhoneTimerRow" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm);margin:0 0 10px;">
              <span style="font-size:12px;color:var(--text-muted);">유효시간</span>
              <span id="koausPhoneTimer" style="font:800 14px var(--font);color:var(--text-primary);letter-spacing:0.04em;font-variant-numeric:tabular-nums;">03:00</span>
            </div>
            <div class="auth-field">
              <label class="auth-label" for="koausPhoneCode">인증코드 (6자리)</label>
              <input class="auth-input" id="koausPhoneCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="------" />
            </div>
            <p class="koaus-extra-msg" id="koausPhoneCodeMsg" style="font-size:12.5px;color:var(--text-muted);margin:8px 0 4px;min-height:18px;"></p>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button class="auth-submit" id="koausPhoneVerifyBtn" style="flex:2;">확인</button>
              <button type="button" id="koausPhoneResendBtn" disabled style="flex:1;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm);font:700 13px var(--font);color:var(--text-secondary);cursor:pointer;opacity:0.5;">재전송 <span id="koausPhoneResendCd" style="font-size:11px;color:var(--text-muted);"></span></button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('koausPhoneClose').addEventListener('click', closePhoneModal);
  document.getElementById('koausPhoneOverlay').addEventListener('click', e => {
    if (e.target.id === 'koausPhoneOverlay') closePhoneModal();
  });
  document.getElementById('koausPhoneSendBtn').addEventListener('click', sendCode);
  document.getElementById('koausPhoneVerifyBtn').addEventListener('click', verifyCode);
  document.getElementById('koausPhoneResendBtn').addEventListener('click', resendCode);
}

// ── 이중 타이머 상태 ──
const MAIN_TIMER_MS  = 180_000;   // 3분 유효시간
const RESEND_COOLDOWN_MS = 10_000; // 재전송 10초 쿨다운
let mainTimerHandle = null;
let resendCdHandle  = null;
let mainTimerStartedAt = 0;
let resendStartedAt = 0;

function fmtMSS(ms) {
  if (ms < 0) ms = 0;
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startMainTimer() {
  clearMainTimer();
  mainTimerStartedAt = Date.now();
  const tick = () => {
    const remain = MAIN_TIMER_MS - (Date.now() - mainTimerStartedAt);
    const el = document.getElementById('koausPhoneTimer');
    if (el) {
      el.textContent = fmtMSS(remain);
      el.style.color = remain <= 30_000 ? 'var(--red, #dc2626)' : 'var(--text-primary)';
    }
    if (remain <= 0) {
      clearMainTimer();
      // 세션 강제 파기 + 입력/확인 버튼 비활성화
      pendingConfirmation = null;
      const inp = document.getElementById('koausPhoneCode');
      const vbtn = document.getElementById('koausPhoneVerifyBtn');
      if (inp)  { inp.disabled = true; inp.style.opacity = '0.5'; }
      if (vbtn) { vbtn.disabled = true; vbtn.style.opacity = '0.5'; }
      setCodeMsg('⏰ 유효시간이 만료됐습니다. [재전송] 버튼으로 새 인증번호를 받아 주세요.', 'err');
    }
  };
  tick();
  mainTimerHandle = setInterval(tick, 1000);
}
function clearMainTimer() {
  if (mainTimerHandle) { clearInterval(mainTimerHandle); mainTimerHandle = null; }
}

function startResendCooldown() {
  clearResendCooldown();
  resendStartedAt = Date.now();
  const btn = document.getElementById('koausPhoneResendBtn');
  const cd  = document.getElementById('koausPhoneResendCd');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
  const tick = () => {
    const remain = RESEND_COOLDOWN_MS - (Date.now() - resendStartedAt);
    if (remain <= 0) {
      clearResendCooldown();
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
      if (cd) cd.textContent = '';
      return;
    }
    if (cd) cd.textContent = '(' + Math.ceil(remain / 1000) + 's)';
  };
  tick();
  resendCdHandle = setInterval(tick, 250);
}
function clearResendCooldown() {
  if (resendCdHandle) { clearInterval(resendCdHandle); resendCdHandle = null; }
  const cd = document.getElementById('koausPhoneResendCd');
  if (cd) cd.textContent = '';
}

// ── 재전송 — link 전용(PhoneAuthProvider.verifyPhoneNumber 재호출) + 타이머 리셋 ──
async function resendCode() {
  // 쿨다운 확인 (UI에서 disable 처리되지만 안전망)
  if (Date.now() - resendStartedAt < RESEND_COOLDOWN_MS) return;
  const e164 = document.getElementById('koausPhoneEcho')?.textContent || '';
  if (!/^\+61[0-9]{8,10}$/.test(e164)) {
    setCodeMsg('번호 정보가 사라졌습니다. 처음부터 다시 시도해 주세요.', 'err');
    showStep('phone'); return;
  }
  setCodeMsg('재전송 중…', 'info');
  try {
    // reCAPTCHA 재사용 시 stale token 위험 → 새로 만들기
    try { if (recaptchaVerifier) await recaptchaVerifier.clear(); } catch (_) {}
    recaptchaVerifier = new RecaptchaVerifier(auth, 'koausRecaptchaSlot', { size: 'invisible' });
    await recaptchaVerifier.render();
    const u = auth.currentUser;
    // 폰① 보안: 재전송도 link 전용 — 비로그인 차단(번호 단독 로그인 금지).
    if (!u) { setCodeMsg('이메일/구글 로그인 후 가능합니다.', 'err'); return; }
    pendingMode = 'link';
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(e164, recaptchaVerifier);
    pendingConfirmation = { verificationId };
    lastSentAt = Date.now();
    // 입력 + 확인 버튼 재활성화 (세션 새로 시작)
    const inp = document.getElementById('koausPhoneCode');
    const vbtn = document.getElementById('koausPhoneVerifyBtn');
    if (inp)  { inp.disabled = false; inp.style.opacity = '1'; inp.value = ''; }
    if (vbtn) { vbtn.disabled = false; vbtn.style.opacity = '1'; }
    setCodeMsg('✅ 인증번호를 재전송했습니다. SMS 도착까지 30초~1분 소요됩니다.', 'ok');
    // 메인 타이머 + 재전송 쿨다운 모두 리셋
    startMainTimer();
    startResendCooldown();
  } catch (err) {
    console.warn('[phone-auth] resend 실패', err);
    if (err && err.code === 'auth/too-many-requests') {
      setCodeMsg('잠시 후 다시 시도해 주세요. (요청 과다)', 'err');
    } else if (err && err.code === 'auth/operation-not-allowed') {
      setCodeMsg('서버에서 휴대폰 인증이 아직 활성화되지 않았습니다.', 'err');
    } else {
      setCodeMsg('재전송 실패: ' + ((err && err.message) || err), 'err');
    }
  }
}

let recaptchaVerifier = null;
let pendingConfirmation = null;  // PhoneAuthProvider.verifyPhoneNumber 결과 { verificationId } (link 흐름 전용)
let pendingPhoneCred = null;     // linkWithCredential 용 PhoneAuthProvider credential
let pendingMode = 'link';        // 'link' (로그인 유저 phone 연결) | 'signin' (Phone 단독 가입/로그인)
let lastSentAt = 0;
let afterVerifiedCb = null;
let afterCancelCb = null;
let _verified = false;

function setMsg(text, kind) {
  const el = document.getElementById('koausPhoneMsg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = kind === 'err' ? 'var(--red, #dc2626)' : kind === 'ok' ? 'var(--green, #16a34a)' : kind === 'warn' ? '#b45309' : 'var(--text-muted)';
}
function setCodeMsg(text, kind) {
  const el = document.getElementById('koausPhoneCodeMsg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = kind === 'err' ? 'var(--red, #dc2626)' : kind === 'ok' ? 'var(--green, #16a34a)' : kind === 'warn' ? '#b45309' : 'var(--text-muted)';
}
function showStep(step) {
  document.querySelectorAll('#koausPhoneBody [data-step]').forEach(el => {
    el.hidden = el.dataset.step !== step;
  });
}

// AU 휴대폰 번호 정규화 — 0XXX → +61 XXX, 공백 제거
function normalizeAU(raw) {
  const v = String(raw || '').replace(/[\s\-()]/g, '');
  if (!v) return null;
  if (v.startsWith('+61')) return v;
  if (v.startsWith('0')) return '+61' + v.slice(1);
  if (v.startsWith('61')) return '+' + v;
  return null;
}

async function sendCode() {
  const raw = document.getElementById('koausPhoneInput').value;
  const e164 = normalizeAU(raw);
  if (!e164 || !/^\+61[0-9]{8,10}$/.test(e164)) {
    setMsg('AU 휴대폰 번호 형식이 올바르지 않습니다. (예: 0412345678)', 'err');
    return;
  }
  if (Date.now() - lastSentAt < 60_000) {
    const wait = Math.ceil((60_000 - (Date.now() - lastSentAt)) / 1000);
    setMsg(`재전송은 ${wait}초 후 가능합니다.`, 'warn');
    return;
  }
  setMsg('인증번호 전송 중…', 'info');
  try {
    if (!recaptchaVerifier) {
      // invisible reCAPTCHA — 사용자 마찰 최소화
      recaptchaVerifier = new RecaptchaVerifier(auth, 'koausRecaptchaSlot', { size: 'invisible' });
      await recaptchaVerifier.render();
    }
    const u = auth.currentUser;
    // 폰① 보안: 번호 단독 로그인/가입 금지 — 휴대폰은 이메일/구글 계정에 link 만. 비로그인은 로그인 먼저.
    if (!u) {
      setMsg('휴대폰 인증은 이메일/구글 로그인 후 가능합니다.', 'err');
      closePhoneModal();
      try { window.koausAuth && window.koausAuth.openAuthModal && window.koausAuth.openAuthModal(); } catch (_) {}
      return;
    }
    pendingMode = 'link';
    // 로그인된 유저에게 phone 연결 — PhoneAuthProvider (link 전용)
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(e164, recaptchaVerifier);
    pendingConfirmation = { verificationId };
    lastSentAt = Date.now();
    document.getElementById('koausPhoneEcho').textContent = e164;
    showStep('code');
    setCodeMsg('SMS 도착까지 30초~1분 소요될 수 있습니다.', 'info');
    // 이중 타이머 시작 — 메인 3분 + 재전송 10초 쿨다운
    startMainTimer();
    startResendCooldown();
  } catch (err) {
    console.warn('[phone-auth] sendCode 실패', err);
    if (err && err.code === 'auth/operation-not-allowed') {
      setMsg('서버에서 휴대폰 인증이 아직 활성화되지 않았습니다. 잠시 후 다시 시도해 주세요.', 'err');
    } else if (err && err.code === 'auth/too-many-requests') {
      setMsg('잠시 후 다시 시도해 주세요. (요청 과다)', 'err');
    } else {
      setMsg('전송 실패: ' + ((err && err.message) || err), 'err');
    }
    // reCAPTCHA 재사용 가능하도록 리셋
    try { if (recaptchaVerifier) await recaptchaVerifier.clear(); } catch (_) {}
    recaptchaVerifier = null;
  }
}

async function verifyCode() {
  const code = (document.getElementById('koausPhoneCode').value || '').trim();
  if (!/^[0-9]{6}$/.test(code)) { setCodeMsg('6자리 숫자를 입력해 주세요.', 'err'); return; }
  if (!pendingConfirmation) { setCodeMsg('인증 세션 만료. 다시 시도해 주세요.', 'err'); showStep('phone'); return; }
  setCodeMsg('인증 중…', 'info');
  try {
    // 폰① 보안: link 전용 — 번호 단독 로그인/가입(confirm) 경로 제거. 항상 로그인 유저에 phone credential 연결.
    const cred = PhoneAuthProvider.credential(pendingConfirmation.verificationId, code);
    const u = auth.currentUser;
    if (!u) { setCodeMsg('이메일/구글 로그인 후 다시 시도해 주세요.', 'err'); return; }
    await linkWithCredential(u, cred);
    setCodeMsg('✅ 인증 완료', 'ok');
    _verified = true;
    setTimeout(() => {
      closePhoneModal();
      if (typeof afterVerifiedCb === 'function') { try { afterVerifiedCb(); } catch (_) {} }
    }, 400);
  } catch (err) {
    console.warn('[phone-auth] verifyCode 실패', err);
    if (err && err.code === 'auth/invalid-verification-code') setCodeMsg('인증코드가 일치하지 않습니다.', 'err');
    else if (err && err.code === 'auth/code-expired') setCodeMsg('인증코드가 만료됐습니다. 재전송 해주세요.', 'err');
    else if (err && err.code === 'auth/credential-already-in-use') setCodeMsg('이미 다른 계정과 연결된 번호입니다.', 'err');
    else setCodeMsg('인증 실패: ' + ((err && err.message) || err), 'err');
  }
}

function openPhoneModal(opts) {
  // 폰① 보안 방어: 비로그인 상태에서 폰 모달 진입 차단 — 로그인(이메일/구글) 먼저.
  if (!auth.currentUser) {
    try { window.koausAuth && window.koausAuth.openAuthModal && window.koausAuth.openAuthModal(); } catch (_) {}
    return;
  }
  mountPhoneModal();
  afterVerifiedCb = (opts && typeof opts.onVerified === 'function') ? opts.onVerified : null;
  afterCancelCb   = (opts && typeof opts.onCancel   === 'function') ? opts.onCancel   : null;
  _verified = false;
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
  // 로그인 모달 등 다른 overlay 가 떠 있으면 시각 충돌 최소화 — 인라인 display 제거
  document.querySelectorAll('.auth-overlay.open').forEach(o => {
    o.classList.remove('open');
    o.style.removeProperty('display');
  });
  // 입력 + disable 상태 초기화 (이전 만료 세션의 흔적 제거)
  const pi = document.getElementById('koausPhoneInput'); if (pi) pi.value = '';
  const pc = document.getElementById('koausPhoneCode');
  if (pc) { pc.value = ''; pc.disabled = false; pc.style.opacity = '1'; }
  const vb = document.getElementById('koausPhoneVerifyBtn');
  if (vb) { vb.disabled = false; vb.style.opacity = '1'; }
  const tm = document.getElementById('koausPhoneTimer');
  if (tm) { tm.textContent = '03:00'; tm.style.color = 'var(--text-primary)'; }
  // 모달 재오픈 시 이전 인터벌 정리
  clearMainTimer(); clearResendCooldown();
  setMsg(''); setCodeMsg('');
  showStep('phone');
  document.getElementById('koausPhoneOverlay').classList.add('open');
}
function closePhoneModal() {
  const ov = document.getElementById('koausPhoneOverlay');
  if (ov) ov.classList.remove('open');
  try { document.body.style.overflow = ''; } catch (_) {}
  // 타이머 모두 정지 (열려있을 동안만 작동해야 함)
  clearMainTimer();
  clearResendCooldown();
  // 미인증 상태로 닫힘 → onCancel 콜백 호출 (글로벌 인터셉터가 signOut 처리)
  if (!_verified && typeof afterCancelCb === 'function') {
    const cb = afterCancelCb; afterCancelCb = null;
    try { cb(); } catch (_) {}
  }
}

// ── 글로벌 노출 ──
window.koausPhoneVerify = openPhoneModal;
window.koausClosePhoneModal = closePhoneModal;

// ── 글로벌 인증 강제 인터셉터 (가입/로그인 시점 정책) ──
// onAuthStateChanged 발화 시:
//   · canPost(u) === true (이메일 인증 또는 phone 연결) → 통과
//   · canPost(u) === false → 즉시 휴대폰 인증 모달 강제
//     · 모달 X/취소 닫기 → signOut + 안내 → 비로그인 상태로 복귀
//     · 인증 성공 → 모달 자동 닫기 + 세션 유지
//
// 이로써 글쓰기·연락하기 등 액션 시점에는 추가 인증 불필요.
let _phoneEnforced = '';   // 이미 강제 처리한 uid (중복 모달 방지)
let _phoneEnforcing = false;
let _signedOutBypass = false;  // 강제 signOut 시 onAuthStateChanged 재발화 무시

onAuthStateChanged(auth, async (user) => {
  if (!user) { _phoneEnforced = ''; _phoneEnforcing = false; return; }
  if (window.koausCanPost(user)) { _phoneEnforced = user.uid; return; }
  if (_phoneEnforced === user.uid || _phoneEnforcing) return;
  _phoneEnforcing = true;
  // 살짝 지연 — 페이지별 로그인 모달 close 애니메이션 끝나기를 기다림
  setTimeout(() => {
    openPhoneModal({
      onVerified: () => {
        _phoneEnforced = user.uid;
        _phoneEnforcing = false;
        // 페이지에 따라 캐시된 닉네임 동기화 필요 — 최소 reload 로 안전 적용
        try { /* hot reload 없이 세션 유지 — 다른 모듈 들이 알아서 반영 */ } catch (_) {}
      },
      onCancel: async () => {
        _phoneEnforcing = false;
        _signedOutBypass = true;
        try { await signOut(auth); } catch (_) {}
        alert('휴대폰 SMS 인증을 완료해야 KoAus 를 이용하실 수 있습니다.\n다음에 다시 시도해 주세요.');
      },
    });
  }, 350);
});

// ── 글쓰기 가드 헬퍼 (legacy) — 새 정책에서는 단순 로그인 체크만 필요 ──
// 그러나 미인증 유저가 어떤 우회 경로로 통과했을 경우의 안전망으로 유지
window.koausRequireCanPost = function (user, openAuthModalFn, retryCb) {
  if (!user) {
    alert('로그인 후 이용할 수 있습니다.');
    if (typeof openAuthModalFn === 'function') openAuthModalFn();
    return false;
  }
  if (window.koausCanPost(user)) return true;
  // 안전망 — 이론상 글로벌 인터셉터가 미리 처리하지만, 만약 도달 시 모달 호출
  openPhoneModal({ onVerified: retryCb });
  return false;
};
