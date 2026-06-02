// ════════════════════════════════════════════════════════════════════
//  KoAus · 인증 확장 — 아이디/비번 찾기 + 회원가입 확장 (글로벌 자동 mount)
//  · 모든 페이지 <head> 에 한 줄 로드: <script type="module" src="auth-extra.js"></script>
//  · 페이지 본체 마크업 0 건드림 — 로그인 모달/회원가입 폼이 있으면 자동으로 보강
//  · 보안 질문 답변은 trim+lowercase 평문 저장 (필요시 후속 해시화)
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, limit, getDocs } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain: 'koaus-f564c.firebaseapp.com',
  projectId: 'koaus-f564c',
  storageBucket: 'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId: '1:663988594088:web:ef30c2fd557407b00b299d',
};
const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const SECURITY_QUESTIONS = [
  '어머니 성함은 무엇입니까?',
  '처음 키운 반려동물의 이름은?',
  '졸업한 초등학교의 이름은?',
  '가장 친한 친구의 별명은?',
];
const norm = s => String(s || '').trim().toLowerCase();
const esc  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function maskEmail(email) {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 2) return email[0] + '***' + email.slice(at);
  return email.slice(0, 2) + '***' + email.slice(at);
}

// ── 회원가입 폼 확장 (이름·별명·보안 Q/A inject) ──
function mountSignupExtra() {
  const form = document.getElementById('authSignupForm');
  if (!form || form.__koausExtraMounted) return;
  const pwConfirm = document.getElementById('authSignupPwConfirm');
  if (!pwConfirm) return;
  const wrap = pwConfirm.closest('.auth-field') || pwConfirm.parentElement;
  if (!wrap) return;
  const html = `
    <div class="auth-field">
      <label class="auth-label" for="authSignupName">이름 (Name)</label>
      <input class="auth-input" id="authSignupName" type="text" autocomplete="name" placeholder="홍길동" maxlength="50" />
    </div>
    <div class="auth-field">
      <label class="auth-label" for="authSignupNick">별명 (Nickname)</label>
      <input class="auth-input" id="authSignupNick" type="text" autocomplete="nickname" placeholder="화면에 표시될 이름" maxlength="30" />
    </div>
    <div class="auth-field">
      <label class="auth-label" for="authSignupSecQ">보안 질문</label>
      <select class="auth-input" id="authSignupSecQ">
        ${SECURITY_QUESTIONS.map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join('')}
      </select>
    </div>
    <div class="auth-field">
      <label class="auth-label" for="authSignupSecA">보안 답변</label>
      <input class="auth-input" id="authSignupSecA" type="text" autocomplete="off" placeholder="아이디 찾기 시 사용됩니다" maxlength="100" />
    </div>`;
  wrap.insertAdjacentHTML('afterend', html);
  // 보안 질문 랜덤 1개 선택
  const sel = document.getElementById('authSignupSecQ');
  if (sel) sel.selectedIndex = Math.floor(Math.random() * SECURITY_QUESTIONS.length);
  form.__koausExtraMounted = true;

  // 회원가입 직전 신규 필드 검증 + 임시 저장 (capture phase — 페이지 본체 listener 전 실행)
  const btn = document.getElementById('authSignupSubmit');
  if (btn && !btn.__koausExtraHook) {
    btn.addEventListener('click', e => {
      const name = document.getElementById('authSignupName')?.value.trim() || '';
      const nick = document.getElementById('authSignupNick')?.value.trim() || '';
      const secQ = document.getElementById('authSignupSecQ')?.value || '';
      const secA = document.getElementById('authSignupSecA')?.value.trim() || '';
      const errEl = document.getElementById('authSignupError');
      if (!name || !nick || !secA) {
        if (errEl) errEl.textContent = '이름, 별명, 보안 답변을 모두 입력해 주세요.';
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      // 페이지 본체 핸들러가 createUserWithEmailAndPassword 성공 시 사용하도록 임시 저장
      window.__koausPendingSignup = {
        email: (document.getElementById('authSignupEmail')?.value || '').trim().toLowerCase(),
        name, nickname: nick, securityQ: secQ, securityA: norm(secA), nameVisible: true,
      };
    }, true);  // capture phase
    btn.__koausExtraHook = true;
  }
}

// ── 로그인 모달 하단: '아이디 찾기 · 비밀번호 찾기' 링크 inject ──
function mountAuthExtras() {
  const loginForm = document.getElementById('authLoginForm');
  if (!loginForm || loginForm.__koausExtraMounted) return;
  const submit = document.getElementById('authLoginSubmit');
  if (!submit) return;
  const html = `
    <div class="auth-extras-row" style="display:flex; justify-content:center; gap:14px; margin-top:12px; font-size:13px;">
      <button type="button" class="auth-extra-link" data-koaus-open="findId"
        style="background:none;border:none;cursor:pointer;color:var(--text-secondary);text-decoration:underline;font:inherit;padding:4px 6px;">아이디 찾기</button>
      <span style="color:var(--border);align-self:center;">·</span>
      <button type="button" class="auth-extra-link" data-koaus-open="resetPw"
        style="background:none;border:none;cursor:pointer;color:var(--text-secondary);text-decoration:underline;font:inherit;padding:4px 6px;">비밀번호 찾기</button>
    </div>`;
  submit.insertAdjacentHTML('afterend', html);
  loginForm.__koausExtraMounted = true;
  loginForm.addEventListener('click', e => {
    const t = e.target.closest('[data-koaus-open]');
    if (!t) return;
    e.preventDefault();
    openExtraModal(t.dataset.koausOpen);
  });
}

// ── 아이디/비번 찾기 모달 mount (body 끝에 1회 inject) ──
function mountExtraModals() {
  if (document.getElementById('koausExtraModal')) return;
  const html = `
    <div id="koausExtraModal" class="report-overlay" role="dialog" aria-modal="true">
      <div class="report-card" style="max-width: 420px;">
        <div class="report-header">
          <span class="report-title" id="koausExtraTitle">아이디 찾기</span>
          <button type="button" class="report-close" id="koausExtraClose" aria-label="닫기">✕</button>
        </div>
        <div class="report-body" id="koausExtraBody">
          <!-- 아이디 찾기 폼 -->
          <div class="koaus-extra-pane" data-pane="findId">
            <div class="auth-field"><label class="auth-label">이름 (Name)</label>
              <input class="auth-input" id="koausFindIdName" type="text" maxlength="50" placeholder="가입 시 입력한 이름" />
            </div>
            <div class="auth-field"><label class="auth-label">보안 답변</label>
              <input class="auth-input" id="koausFindIdSecA" type="text" maxlength="100" placeholder="가입 시 설정한 보안 답변" />
            </div>
            <p class="koaus-extra-msg" id="koausFindIdMsg" style="font-size:12.5px;color:var(--text-muted);margin-top:8px;min-height:18px;"></p>
            <button class="auth-submit" id="koausFindIdSubmit" style="margin-top:4px;">아이디 찾기</button>
          </div>
          <!-- 비밀번호 찾기 폼 -->
          <div class="koaus-extra-pane" data-pane="resetPw" hidden>
            <div class="auth-field"><label class="auth-label">가입한 이메일</label>
              <input class="auth-input" id="koausResetPwEmail" type="email" autocomplete="email" placeholder="email@example.com" />
            </div>
            <p class="koaus-extra-msg" id="koausResetPwMsg" style="font-size:12.5px;color:var(--text-muted);margin-top:8px;min-height:18px;">가입한 이메일로 재설정 링크를 보내드립니다.</p>
            <button class="auth-submit" id="koausResetPwSubmit" style="margin-top:4px;">재설정 링크 보내기</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  // 찾기 모달은 로그인 모달(.auth-overlay z-index:3000) 위에 무조건 표시
  const modal = document.getElementById('koausExtraModal');
  modal.style.zIndex = '4100';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.background = 'rgba(0,0,0,0.65)';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.padding = '20px';
  document.getElementById('koausExtraClose').addEventListener('click', closeExtraModal);
  modal.addEventListener('click', e => {
    if (e.target.id === 'koausExtraModal') closeExtraModal();
  });
  document.getElementById('koausResetPwSubmit').addEventListener('click', onResetPw);
  document.getElementById('koausFindIdSubmit').addEventListener('click', onFindId);
}
function openExtraModal(pane) {
  mountExtraModals();
  const modal = document.getElementById('koausExtraModal');
  // 로그인 모달이 떠 있으면 자동으로 닫음 — 화면에 모달 1개만 노출
  document.querySelectorAll('.auth-overlay.open').forEach(o => {
    o.classList.remove('open');
    o.style.display = 'none';
  });
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
  document.querySelectorAll('#koausExtraModal .koaus-extra-pane').forEach(el => {
    el.hidden = el.dataset.pane !== pane;
  });
  document.getElementById('koausExtraTitle').textContent = pane === 'resetPw' ? '비밀번호 찾기' : '아이디 찾기';
  modal.classList.add('open');
  modal.style.display = 'flex';
}
function closeExtraModal() {
  const modal = document.getElementById('koausExtraModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.style.display = '';
}

// ── 비번 재설정 — sendPasswordResetEmail ──
async function onResetPw() {
  const email = (document.getElementById('koausResetPwEmail').value || '').trim();
  const msg = document.getElementById('koausResetPwMsg');
  if (!email || !/^.+@.+\..+$/.test(email)) {
    msg.textContent = '올바른 이메일 형식이 아닙니다.';
    msg.style.color = 'var(--red, #dc2626)';
    return;
  }
  msg.textContent = '전송 중…';
  msg.style.color = 'var(--text-muted)';
  try {
    await sendPasswordResetEmail(auth, email);
    msg.textContent = '✅ 재설정 링크를 발송했습니다. 메일함을 확인하세요.';
    msg.style.color = 'var(--green, #16a34a)';
  } catch (e) {
    const code = e && e.code || '';
    msg.textContent = code === 'auth/user-not-found' ? '가입된 이메일이 아닙니다.'
                    : code === 'auth/invalid-email' ? '이메일 형식이 올바르지 않습니다.'
                    : ('재설정 메일 전송 실패: ' + (code || e.message || e));
    msg.style.color = 'var(--red, #dc2626)';
  }
}

// ── 아이디 찾기 — users 컬렉션 query (name + securityA 일치) ──
async function onFindId() {
  const name = (document.getElementById('koausFindIdName').value || '').trim();
  const secA = norm(document.getElementById('koausFindIdSecA').value || '');
  const msg = document.getElementById('koausFindIdMsg');
  if (!name || !secA) {
    msg.textContent = '이름과 보안 답변을 모두 입력해 주세요.';
    msg.style.color = 'var(--red, #dc2626)';
    return;
  }
  msg.textContent = '조회 중…';
  msg.style.color = 'var(--text-muted)';
  try {
    const q = query(collection(db, 'users'), where('name', '==', name), where('securityA', '==', secA), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      msg.textContent = '일치하는 정보가 없습니다.';
      msg.style.color = 'var(--red, #dc2626)';
      return;
    }
    const data = snap.docs[0].data();
    const email = data.email || '';
    msg.innerHTML = '✅ 가입된 이메일: <strong>' + esc(maskEmail(email)) + '</strong>';
    msg.style.color = 'var(--green, #16a34a)';
  } catch (e) {
    msg.textContent = '조회 중 오류: ' + (e && (e.code || e.message) || e);
    msg.style.color = 'var(--red, #dc2626)';
  }
}

// ── 회원가입 성공 시 users 컬렉션 저장 (createUserWithEmailAndPassword 직후 user 도착) ──
let _firstUid = '';  // 같은 세션에서 회원가입 → 곧장 첫 user 도착인 경우만 처리
onAuthStateChanged(auth, async user => {
  if (!user) { _firstUid = ''; return; }
  if (user.uid === _firstUid) return;
  _firstUid = user.uid;
  const pending = window.__koausPendingSignup;
  if (!pending || !pending.name) return;
  if (pending.email && pending.email !== (user.email || '').toLowerCase()) return;
  try {
    await setDoc(doc(db, 'users', user.uid), {
      email: (user.email || '').toLowerCase(),
      name: pending.name,
      nickname: pending.nickname,
      securityQ: pending.securityQ,
      securityA: pending.securityA,
      nameVisible: pending.nameVisible !== false,
      createdAt: Date.now(),
    }, { merge: true });
    // 마이페이지/게시글 작성 시 별명 사용
    try { localStorage.setItem('koaus-nickname', pending.nickname); } catch (_) {}
  } catch (e) {
    console.warn('[auth-extra] 회원가입 추가 정보 저장 실패', e);
  } finally {
    window.__koausPendingSignup = null;
  }
});

// ── 자동 mount (DOM 준비 후) ──
function bootstrap() {
  mountSignupExtra();
  mountAuthExtras();
  mountExtraModals();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else { bootstrap(); }
[400, 1500].forEach(ms => setTimeout(bootstrap, ms));

// ── 외부 접근용 (마이페이지 등에서 호출 가능) ──
window.koausAuthExtra = { openExtraModal, closeExtraModal, maskEmail };
