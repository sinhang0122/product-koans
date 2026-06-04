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
  getAuth, RecaptchaVerifier, PhoneAuthProvider,
  signInWithPhoneNumber, linkWithCredential,
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
          </div>
          <!-- Step 2: 코드 입력 -->
          <div data-step="code" hidden>
            <p style="font-size:12.5px;color:var(--text-muted);margin:6px 0 12px;line-height:1.55;">
              <b id="koausPhoneEcho">—</b> 로 6자리 인증코드를 보냈습니다.
            </p>
            <div class="auth-field">
              <label class="auth-label" for="koausPhoneCode">인증코드 (6자리)</label>
              <input class="auth-input" id="koausPhoneCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="------" />
            </div>
            <p class="koaus-extra-msg" id="koausPhoneCodeMsg" style="font-size:12.5px;color:var(--text-muted);margin:8px 0 4px;min-height:18px;"></p>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button class="auth-submit" id="koausPhoneVerifyBtn" style="flex:2;">확인</button>
              <button type="button" id="koausPhoneResendBtn" style="flex:1;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm);font:700 13px var(--font);color:var(--text-secondary);cursor:pointer;">재전송</button>
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
  document.getElementById('koausPhoneResendBtn').addEventListener('click', () => {
    if (Date.now() - lastSentAt < 60_000) {
      setCodeMsg(`재전송은 ${Math.ceil((60_000 - (Date.now() - lastSentAt)) / 1000)}초 후 가능합니다.`, 'warn');
      return;
    }
    showStep('phone');
  });
}

let recaptchaVerifier = null;
let pendingConfirmation = null;  // signInWithPhoneNumber 결과 (회원가입 흐름)
let pendingPhoneCred = null;     // linkWithCredential 용 PhoneAuthProvider credential
let pendingMode = 'link';        // 'link' (로그인 유저 phone 연결) | 'signin' (Phone 단독 가입/로그인)
let lastSentAt = 0;
let afterVerifiedCb = null;

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
    pendingMode = u ? 'link' : 'signin';
    if (pendingMode === 'link') {
      // 이미 로그인된 유저에게 phone 연결 — PhoneAuthProvider 로 진행
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(e164, recaptchaVerifier);
      pendingConfirmation = { verificationId };
    } else {
      // 비로그인 — signInWithPhoneNumber (Phone 단독)
      pendingConfirmation = await signInWithPhoneNumber(auth, e164, recaptchaVerifier);
    }
    lastSentAt = Date.now();
    document.getElementById('koausPhoneEcho').textContent = e164;
    showStep('code');
    setCodeMsg('SMS 도착까지 30초~1분 소요될 수 있습니다.', 'info');
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
    if (pendingMode === 'link') {
      // 기존 로그인 유저에게 phone credential 연결
      const cred = PhoneAuthProvider.credential(pendingConfirmation.verificationId, code);
      const u = auth.currentUser;
      if (!u) throw new Error('no_current_user');
      await linkWithCredential(u, cred);
    } else {
      // Phone 단독 가입/로그인 (비로그인 → 신규 계정 생성)
      await pendingConfirmation.confirm(code);
    }
    setCodeMsg('✅ 인증 완료', 'ok');
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
  mountPhoneModal();
  afterVerifiedCb = (opts && typeof opts.onVerified === 'function') ? opts.onVerified : null;
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
  // 로그인 모달 등 다른 overlay 가 떠 있으면 시각 충돌 최소화 — 인라인 display 제거
  document.querySelectorAll('.auth-overlay.open').forEach(o => {
    o.classList.remove('open');
    o.style.removeProperty('display');
  });
  // 입력 초기화
  const pi = document.getElementById('koausPhoneInput'); if (pi) pi.value = '';
  const pc = document.getElementById('koausPhoneCode');  if (pc) pc.value = '';
  setMsg(''); setCodeMsg('');
  showStep('phone');
  document.getElementById('koausPhoneOverlay').classList.add('open');
}
function closePhoneModal() {
  const ov = document.getElementById('koausPhoneOverlay');
  if (ov) ov.classList.remove('open');
  try { document.body.style.overflow = ''; } catch (_) {}
}

// ── 글로벌 노출 ──
// koausPhoneVerify(opts) — 호출 시 휴대폰 인증 모달 열림
//   opts.onVerified: 인증 성공 시 콜백
window.koausPhoneVerify = openPhoneModal;
window.koausClosePhoneModal = closePhoneModal;

// ── 글쓰기 가드 헬퍼 ──
// requireCanPost(user, openAuthModalFn?) — true 면 통과, false 면 인증 흐름 자동 시작
// 페이지에서 if (!koausRequireCanPost(u, openAuthModal, retry)) return; 패턴으로 사용
window.koausRequireCanPost = function (user, openAuthModalFn, retryCb) {
  if (!user) {
    alert('로그인 후 이용할 수 있습니다.');
    if (typeof openAuthModalFn === 'function') openAuthModalFn();
    return false;
  }
  if (window.koausCanPost(user)) return true;
  // 미인증 → 휴대폰 인증 모달
  alert('글을 작성하려면 휴대폰 인증이 필요합니다.\n안전한 거래를 위해 SMS 인증을 진행해 주세요.');
  openPhoneModal({ onVerified: retryCb });
  return false;
};
