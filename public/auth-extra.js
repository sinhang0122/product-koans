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

// 공식 보안 질문 15개 — 계정 복구의 핵심 수단
const SECURITY_QUESTIONS = [
  '어머니의 성함은 무엇입니까?',
  '아버지의 성함은 무엇입니까?',
  '졸업한 초등학교의 이름은?',
  '졸업한 중학교의 이름은?',
  '졸업한 고등학교의 이름은?',
  '처음 키운 반려동물의 이름은?',
  '가장 친한 친구의 별명은?',
  '태어난 도시는?',
  '본인이 좋아하는 음식은?',
  '가장 기억에 남는 여행지는?',
  '결혼기념일(또는 부모님 결혼기념일)은? (예: 0915)',
  '첫 직장(또는 인턴)의 이름은?',
  '인생 첫 자동차의 모델명은?',
  '가장 좋아하는 영화 제목은?',
  '본인 휴대폰 마지막 4자리 (가입 시점 기준)는?',
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
  // 이름(실명) 필드 폐기 — 별명(닉네임) + 보안 Q/A 만 유지
  // 닉네임 옆 [중복확인] 버튼 — Firestore users 컬렉션 중복 비동기 체크
  const html = `
    <div class="auth-field">
      <label class="auth-label" for="authSignupNick">별명 (Nickname) <span style="color:var(--red,#dc2626);font-weight:800;">[필수]</span></label>
      <div style="display:flex;gap:8px;align-items:stretch;">
        <input class="auth-input" id="authSignupNick" type="text" autocomplete="nickname"
               placeholder="3~12자 한글·영문·숫자" maxlength="30" style="flex:1;min-width:0;" />
        <button type="button" id="authSignupNickCheck"
                style="flex-shrink:0;padding:0 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm);font:700 13px var(--font);color:var(--text-primary);cursor:pointer;white-space:nowrap;">중복확인</button>
      </div>
      <p class="koaus-extra-msg" id="authSignupNickMsg" style="font-size:12px;color:var(--text-muted);margin:6px 0 0;min-height:16px;"></p>
    </div>
    <div class="auth-field">
      <label class="auth-label" for="authSignupSecQ">보안 질문 (Security Question) <span style="color:var(--red,#dc2626);font-weight:800;">[필수]</span></label>
      <select class="auth-input" id="authSignupSecQ">
        ${SECURITY_QUESTIONS.map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join('')}
      </select>
    </div>
    <div class="auth-field">
      <label class="auth-label" for="authSignupSecA">보안 답변 (Answer) <span style="color:var(--red,#dc2626);font-weight:800;">[필수]</span></label>
      <input class="auth-input" id="authSignupSecA" type="text" autocomplete="off" placeholder="아이디·비밀번호 찾기에 사용됩니다" maxlength="100" />
    </div>`;
  wrap.insertAdjacentHTML('afterend', html);
  // 보안 질문 랜덤 1개 선택
  const sel = document.getElementById('authSignupSecQ');
  if (sel) sel.selectedIndex = Math.floor(Math.random() * SECURITY_QUESTIONS.length);
  form.__koausExtraMounted = true;

  // ── 별명 [중복확인] 핸들러 — Firestore users 컬렉션 nickname 필드 매칭 ──
  let _nickConfirmed = '';   // 확인 완료된 닉네임 (회원가입 시점에 매칭 확인)
  const setNickMsg = (text, kind) => {
    const el = document.getElementById('authSignupNickMsg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = kind === 'err' ? 'var(--red, #dc2626)' : kind === 'ok' ? '#16a34a' : 'var(--text-muted)';
  };
  const nickInput = document.getElementById('authSignupNick');
  const nickCheckBtn = document.getElementById('authSignupNickCheck');
  if (nickInput) nickInput.addEventListener('input', () => {
    if (_nickConfirmed && _nickConfirmed !== nickInput.value.trim()) {
      _nickConfirmed = '';
      setNickMsg('닉네임이 변경되었습니다. 다시 [중복확인]을 눌러 주세요.', 'err');
    }
  });
  if (nickCheckBtn) nickCheckBtn.addEventListener('click', async () => {
    const nick = (nickInput?.value || '').trim();
    if (!/^[a-zA-Z0-9가-힣]{3,12}$/.test(nick)) {
      setNickMsg('3~12자 한글·영문·숫자만 사용 가능합니다.', 'err');
      _nickConfirmed = ''; return;
    }
    nickCheckBtn.disabled = true; nickCheckBtn.textContent = '확인 중…';
    try {
      const q1 = query(collection(db, 'users'), where('nickname', '==', nick), limit(1));
      const snap = await getDocs(q1);
      if (snap.empty) {
        setNickMsg('✅ 사용 가능한 닉네임입니다.', 'ok');
        _nickConfirmed = nick;
      } else {
        setNickMsg('이미 사용 중인 닉네임입니다. 다른 별명을 입력해 주세요.', 'err');
        _nickConfirmed = '';
      }
    } catch (e) {
      console.warn('[auth-extra] nick 중복확인 실패', e);
      setNickMsg('확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'err');
      _nickConfirmed = '';
    } finally {
      nickCheckBtn.disabled = false; nickCheckBtn.textContent = '중복확인';
    }
  });

  // 회원가입 직전 신규 필드 검증 + 임시 저장 (capture phase — 페이지 본체 listener 전 실행)
  const btn = document.getElementById('authSignupSubmit');
  if (btn && !btn.__koausExtraHook) {
    btn.addEventListener('click', e => {
      const nick = document.getElementById('authSignupNick')?.value.trim() || '';
      const secQ = document.getElementById('authSignupSecQ')?.value || '';
      const secA = document.getElementById('authSignupSecA')?.value.trim() || '';
      const errEl = document.getElementById('authSignupError');
      if (!nick || !secA) {
        if (errEl) errEl.textContent = '별명과 보안 답변을 모두 입력해 주세요.';
        e.stopImmediatePropagation(); e.preventDefault(); return;
      }
      if (!/^[a-zA-Z0-9가-힣]{3,12}$/.test(nick)) {
        if (errEl) errEl.textContent = '별명은 3~12자 한글·영문·숫자만 가능합니다.';
        e.stopImmediatePropagation(); e.preventDefault(); return;
      }
      if (_nickConfirmed !== nick) {
        if (errEl) errEl.textContent = '별명 [중복확인]을 먼저 진행해 주세요.';
        e.stopImmediatePropagation(); e.preventDefault();
        try { nickCheckBtn.click(); } catch (_) {}
        return;
      }
      // 페이지 본체 핸들러가 createUserWithEmailAndPassword 성공 시 사용하도록 임시 저장
      // name 필드 폐기 — nickname 만 저장 (보안질문/답변 함께)
      window.__koausPendingSignup = {
        email: (document.getElementById('authSignupEmail')?.value || '').trim().toLowerCase(),
        nickname: nick, securityQ: secQ, securityA: norm(secA),
        nameVisible: false,  // 이름 미수집 → 닉네임만 노출
      };
    }, true);  // capture phase
    btn.__koausExtraHook = true;
  }
}

// ── 로그인 모달 하단: '아이디 찾기 · 비밀번호 찾기' 두 진입점 inject ──
// 두 링크는 같은 통합 탭 모달을 열며 초기 active 탭만 다름 (findId / resetPw).
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
      <div class="report-modal report-card">
        <div class="koaus-extra-tabs" role="tablist" aria-label="계정 찾기">
          <button type="button" class="koaus-extra-tab is-active" role="tab" data-tab="findId" aria-selected="true">아이디 찾기</button>
          <span class="koaus-extra-tab-sep" aria-hidden="true"></span>
          <button type="button" class="koaus-extra-tab" role="tab" data-tab="resetPw" aria-selected="false">비밀번호 찾기</button>
          <button type="button" class="report-close" id="koausExtraClose" aria-label="닫기">✕</button>
        </div>
        <div class="report-body" id="koausExtraBody">
          <!-- 아이디 찾기 폼 — 닉네임 + 보안 답변 매칭 → 이메일 마스킹 노출 -->
          <div class="koaus-extra-pane" data-pane="findId">
            <div class="auth-field"><label class="auth-label">별명 (Nickname)</label>
              <input class="auth-input" id="koausFindIdNick" type="text" maxlength="30" placeholder="가입 시 입력한 별명" />
            </div>
            <div class="auth-field"><label class="auth-label">보안 답변</label>
              <input class="auth-input" id="koausFindIdSecA" type="text" maxlength="100" placeholder="가입 시 설정한 보안 답변" />
            </div>
            <p class="koaus-extra-msg" id="koausFindIdMsg" style="font-size:12.5px;color:var(--text-muted);margin-top:8px;min-height:18px;"></p>
            <button class="auth-submit" id="koausFindIdSubmit" style="margin-top:4px;">아이디 찾기</button>
          </div>
          <!-- 비밀번호 찾기 폼 — 이메일 + 보안 답변 매칭 → 재설정 메일 자동 발송 -->
          <div class="koaus-extra-pane" data-pane="resetPw" hidden>
            <div class="auth-field"><label class="auth-label">가입한 이메일</label>
              <input class="auth-input" id="koausResetPwEmail" type="email" autocomplete="email" placeholder="email@example.com" />
            </div>
            <div class="auth-field"><label class="auth-label">보안 답변</label>
              <input class="auth-input" id="koausResetPwSecA" type="text" maxlength="100" placeholder="가입 시 설정한 보안 답변" />
            </div>
            <p class="koaus-extra-msg" id="koausResetPwMsg" style="font-size:12.5px;color:var(--text-muted);margin-top:8px;min-height:18px;">이메일 + 보안 답변이 일치하면 재설정 링크를 보내드립니다.</p>
            <button class="auth-submit" id="koausResetPwSubmit" style="margin-top:4px;">확인 후 재설정 메일 받기</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  // 찾기 모달은 로그인 모달(.auth-overlay z-index:3000) 위에 무조건 표시
  //  · display 는 CSS .report-overlay.open { display: flex } 에 위임 — 인라인 X
  //  · 그래야 닫기 후 재오픈 시 클래스 토글만으로 정상 노출됨
  const modal = document.getElementById('koausExtraModal');
  modal.style.zIndex = '4100';
  document.getElementById('koausExtraClose').addEventListener('click', closeExtraModal);
  modal.addEventListener('click', e => {
    if (e.target.id === 'koausExtraModal') closeExtraModal();
  });
  // 탭 클릭 → pane 즉시 전환 (active 상태 동기화)
  modal.querySelectorAll('.koaus-extra-tab').forEach(btn => {
    btn.addEventListener('click', () => switchExtraPane(btn.dataset.tab));
  });
  document.getElementById('koausResetPwSubmit').addEventListener('click', onResetPw);
  document.getElementById('koausFindIdSubmit').addEventListener('click', onFindId);
}

// 탭/pane 동기화 — 진입점 + 탭 클릭 공통 경로
function switchExtraPane(pane) {
  const isReset = pane === 'resetPw';
  document.querySelectorAll('#koausExtraModal .koaus-extra-pane').forEach(el => {
    el.hidden = el.dataset.pane !== pane;
  });
  document.querySelectorAll('#koausExtraModal .koaus-extra-tab').forEach(btn => {
    const on = btn.dataset.tab === pane;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  // pane 메시지 초기화 (이전 결과/잔재 제거)
  const fim = document.getElementById('koausFindIdMsg');
  const rpm = document.getElementById('koausResetPwMsg');
  if (fim) fim.innerHTML = '';
  if (rpm) rpm.innerHTML = '이메일 + 보안 답변이 일치하면 재설정 링크를 보내드립니다.';
  void isReset; // 라벨 동기화는 탭이 담당 — 별도 title 미사용
}
function openExtraModal(pane) {
  mountExtraModals();
  const modal = document.getElementById('koausExtraModal');
  // 로그인 모달이 떠 있으면 .open 클래스만 제거 — 인라인 style.display 절대 X
  //  · 이전 PR 에서 style.display='none' 인라인을 남겨두는 바람에 다음 openAuthModal 시
  //    .open 의 display:flex 가 인라인에 가려져서 로그인 창 먹통 버그 발생 → 픽스
  document.querySelectorAll('.auth-overlay.open').forEach(o => {
    o.classList.remove('open');
    o.style.removeProperty('display');   // 인라인 style 완전 제거 (남기지 않음)
  });
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
  // 진입점별 초기 active 탭 + pane 동기화 (탭 클릭 경로와 단일화)
  switchExtraPane(pane === 'resetPw' ? 'resetPw' : 'findId');
  modal.classList.add('open');
}
function closeExtraModal() {
  const modal = document.getElementById('koausExtraModal');
  if (!modal) return;
  modal.classList.remove('open');
  // 인라인 style 완전 정리 — 다음 open 시 .open 클래스가 정상 작동하도록
  modal.style.removeProperty('display');
  try { document.body.style.overflow = ''; } catch (_) {}
}

// ── 비번 재설정 — 이메일 + 보안 답변 매칭 후 sendPasswordResetEmail 자동 발송 ──
// 클라이언트만으로 비밀번호를 직접 변경하는 것은 Firebase 보안상 불가능 (signed-in user 만 updatePassword).
// → 보안질문 통과 시 Firebase 공식 reset 메일을 자동 발송 → 유저는 메일 링크 클릭 → 새 비번 설정.
async function onResetPw() {
  const email = (document.getElementById('koausResetPwEmail').value || '').trim().toLowerCase();
  const secA  = norm(document.getElementById('koausResetPwSecA')?.value || '');
  const msg   = document.getElementById('koausResetPwMsg');
  if (!email || !/^.+@.+\..+$/.test(email)) {
    msg.textContent = '올바른 이메일 형식이 아닙니다.';
    msg.style.color = 'var(--red, #dc2626)'; return;
  }
  if (!secA) {
    msg.textContent = '보안 답변을 입력해 주세요.';
    msg.style.color = 'var(--red, #dc2626)'; return;
  }
  msg.textContent = '확인 중…';
  msg.style.color = 'var(--text-muted)';
  try {
    // Firestore users 컬렉션에서 이메일+보안답변 일치 검증 (보안 1차 게이트)
    const q1 = query(collection(db, 'users'),
      where('email', '==', email), where('securityA', '==', secA), limit(1));
    const snap = await getDocs(q1);
    if (snap.empty) {
      msg.textContent = '이메일 또는 보안 답변이 일치하지 않습니다.';
      msg.style.color = 'var(--red, #dc2626)'; return;
    }
    // 검증 통과 → Firebase 공식 비밀번호 재설정 메일 자동 발송
    msg.textContent = '재설정 메일 전송 중…';
    await sendPasswordResetEmail(auth, email);
    msg.innerHTML = '✅ 보안 답변이 일치합니다.<br>가입한 이메일로 <strong>비밀번호 재설정 링크</strong>를 발송했습니다.<br><span style="font-size:11.5px;">메일함(스팸함 포함)을 확인하고 링크를 눌러 새 비밀번호를 설정해 주세요.</span>';
    msg.style.color = 'var(--green, #16a34a)';
  } catch (e) {
    const code = e && e.code || '';
    msg.textContent = code === 'auth/user-not-found' ? '가입된 이메일이 아닙니다.'
                    : code === 'auth/invalid-email' ? '이메일 형식이 올바르지 않습니다.'
                    : code === 'auth/too-many-requests' ? '잠시 후 다시 시도해 주세요.'
                    : ('재설정 처리 실패: ' + (code || e.message || e));
    msg.style.color = 'var(--red, #dc2626)';
  }
}

// ── 아이디 찾기 — 별명(nickname) + 보안 답변 일치 시 이메일 마스킹 노출 ──
async function onFindId() {
  const nick = (document.getElementById('koausFindIdNick').value || '').trim();
  const secA = norm(document.getElementById('koausFindIdSecA').value || '');
  const msg = document.getElementById('koausFindIdMsg');
  if (!nick || !secA) {
    msg.textContent = '별명과 보안 답변을 모두 입력해 주세요.';
    msg.style.color = 'var(--red, #dc2626)'; return;
  }
  msg.textContent = '조회 중…';
  msg.style.color = 'var(--text-muted)';
  try {
    const q1 = query(collection(db, 'users'),
      where('nickname', '==', nick), where('securityA', '==', secA), limit(1));
    const snap = await getDocs(q1);
    if (snap.empty) {
      msg.textContent = '일치하는 정보가 없습니다. 별명·보안 답변을 다시 확인해 주세요.';
      msg.style.color = 'var(--red, #dc2626)'; return;
    }
    const data = snap.docs[0].data();
    const email = data.email || '';
    msg.innerHTML =
      '✅ 가입된 이메일: <strong>' + esc(maskEmail(email)) + '</strong>' +
      '<button type="button" class="auth-submit koaus-find-id-to-reset" ' +
        'style="margin-top:10px;width:100%;font-size:13.5px;padding:10px 14px;">' +
        '🔑 바로 비밀번호 찾기' +
      '</button>';
    msg.style.color = 'var(--green, #16a34a)';
    const btn = msg.querySelector('.koaus-find-id-to-reset');
    if (btn) btn.addEventListener('click', () => {
      // 발견한 이메일 + 보안답변 prefill (재타이핑 없이 즉시 비번 찾기 가능)
      const prefillEmail = document.getElementById('koausResetPwEmail');
      const prefillSecA  = document.getElementById('koausResetPwSecA');
      if (prefillEmail) prefillEmail.value = email;
      if (prefillSecA)  prefillSecA.value  = document.getElementById('koausFindIdSecA').value;
      switchExtraPane('resetPw');
      const rm = document.getElementById('koausResetPwMsg');
      if (rm) { rm.innerHTML = '확인되었습니다. [확인 후 재설정 메일 받기] 버튼을 눌러 주세요.'; rm.style.color = 'var(--text-muted)'; }
    });
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
  if (!pending || !pending.nickname) return;
  if (pending.email && pending.email !== (user.email || '').toLowerCase()) return;
  try {
    await setDoc(doc(db, 'users', user.uid), {
      email: (user.email || '').toLowerCase(),
      nickname: pending.nickname,
      securityQ: pending.securityQ,
      securityA: pending.securityA,
      nameVisible: false,  // 이름 필드 폐기 — 항상 false
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
