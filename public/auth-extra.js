// ════════════════════════════════════════════════════════════════════
//  KoAus · 인증 확장 — 아이디/비번 찾기 + 회원가입 확장 (글로벌 자동 mount)
//  · 모든 페이지 <head> 에 한 줄 로드: <script type="module" src="auth-extra.js"></script>
//  · 페이지 본체 마크업 0 건드림 — 로그인 모달/회원가입 폼이 있으면 자동으로 보강
//  · 보안 질문 답변은 PBKDF2-SHA256 해시 저장 (per-user salt) — 평문 저장 금지 (H3, 2026-06)
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, runTransaction } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

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

// 공식 보안 질문 풀 — 회원가입/비번재설정 동일 옵션 (글로벌 표준)
//   · 4번째는 "직접 입력" 마커값('__custom__') — 선택 시 사용자 정의 질문 input 활성화
//   · 옛 13개 풀로 가입한 사용자는 "직접 질문 입력"으로 자기 질문 그대로 타이핑해 검증 가능
const SECURITY_QUESTIONS = [
  '어릴 적 살던 동네 이름은?',
  '가장 기억에 남는 선생님 성함은?',
  '첫 반려동물의 이름은?',
];
const SEC_Q_CUSTOM = '__custom__';   // select value sentinel — 절대 사용자 질문과 충돌하지 않음
const norm = s => String(s || '').trim().toLowerCase();

// ── 보안답변 해싱 (H3) — PBKDF2-SHA256 + per-user salt ──────────────
//   · emails/{email} 은 get: if true (비번찾기 흐름) 라 doc 내용이 비로그인 노출됨
//     → 단순 SHA-256 이 아닌 고반복 PBKDF2 로 저엔트로피 답변의 오프라인 대입 비용 상승
//   · 마이그레이션 스크립트(Node crypto.pbkdf2)와 파라미터 반드시 동일 유지: iter/keyLen/digest
const SECA_ITER = 150000;
const _bytesToHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const _hexToBytes = h => new Uint8Array((h.match(/.{2}/g) || []).map(x => parseInt(x, 16)));
function newSaltHex() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return _bytesToHex(b);
}
async function hashSecA(normAnswer, saltHex, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(normAnswer), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: _hexToBytes(saltHex), iterations: iterations || SECA_ITER },
    key, 256);
  return _bytesToHex(new Uint8Array(bits));
}
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
        <option value="${SEC_Q_CUSTOM}">직접 질문 입력하기</option>
      </select>
      <input class="auth-input" id="authSignupSecQCustom" type="text" maxlength="100"
             placeholder="직접 입력할 질문을 적어 주세요" hidden style="margin-top:8px;" />
    </div>
    <div class="auth-field">
      <label class="auth-label" for="authSignupSecA">보안 답변 (Answer) <span style="color:var(--red,#dc2626);font-weight:800;">[필수]</span></label>
      <input class="auth-input" id="authSignupSecA" type="text" autocomplete="off" placeholder="비밀번호 재설정에 사용됩니다" maxlength="100" />
    </div>`;
  wrap.insertAdjacentHTML('afterend', html);
  // 보안 질문 select: 첫 옵션 기본 고정 (사용자가 능동 선택). "직접 입력" 선택 시만 input 표시
  const sel       = document.getElementById('authSignupSecQ');
  const customInp = document.getElementById('authSignupSecQCustom');
  const toggleCustomQ = () => {
    const on = sel.value === SEC_Q_CUSTOM;
    customInp.hidden = !on;
    if (on) { try { customInp.focus(); } catch (_) {} } else { customInp.value = ''; }
  };
  if (sel) {
    sel.selectedIndex = 0;
    sel.addEventListener('change', toggleCustomQ);
  }
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
      // nicknames/{nick.toLowerCase()} 단일 doc get — 비로그인 유저도 id 1건 조회로 중복 판별
      // (case-insensitive 유일성 — 'Alice'/'alice' 동시 점유 차단, mypage 동일 정책)
      const snap = await getDoc(doc(db, 'nicknames', nick.toLowerCase()));
      if (!snap.exists()) {
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
      const nick    = document.getElementById('authSignupNick')?.value.trim() || '';
      const secQRaw = document.getElementById('authSignupSecQ')?.value || '';
      const secQCustom = document.getElementById('authSignupSecQCustom')?.value.trim() || '';
      const secA    = document.getElementById('authSignupSecA')?.value.trim() || '';
      const errEl   = document.getElementById('authSignupError');
      // "직접 입력" 선택 시 customQ 필수 — 그 외엔 select값 그대로 질문 텍스트로 사용
      const secQ = (secQRaw === SEC_Q_CUSTOM) ? secQCustom : secQRaw;
      if (!nick || !secA) {
        if (errEl) errEl.textContent = '별명과 보안 답변을 모두 입력해 주세요.';
        e.stopImmediatePropagation(); e.preventDefault(); return;
      }
      if (secQRaw === SEC_Q_CUSTOM && (!secQCustom || secQCustom.length < 2)) {
        if (errEl) errEl.textContent = '직접 입력할 보안 질문을 2자 이상 입력해 주세요.';
        e.stopImmediatePropagation(); e.preventDefault();
        try { document.getElementById('authSignupSecQCustom').focus(); } catch (_) {}
        return;
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
      // securityQ: 항상 질문 텍스트 자체 (custom 선택 시 customQ 값) — DB 단일 표준
      window.__koausPendingSignup = {
        email: (document.getElementById('authSignupEmail')?.value || '').trim().toLowerCase(),
        nickname: nick, securityQ: secQ, securityA: norm(secA),
      };
    }, true);  // capture phase
    btn.__koausExtraHook = true;
  }
}

// ── 로그인 모달 하단: '비밀번호 찾기' 단일 진입점 inject ──
//   글로벌 인증 표준(이메일=아이디)에 따라 옛 [아이디 찾기 · 비밀번호 찾기] 2버튼 폐기.
//   비밀번호 찾기는 ID/PW 모달의 resetPw pane 으로 직접 진입.
function mountAuthExtras() {
  const loginForm = document.getElementById('authLoginForm');
  if (!loginForm || loginForm.__koausExtraMounted) return;
  const submit = document.getElementById('authLoginSubmit');
  if (!submit) return;
  const html = `
    <div class="auth-extras-row" style="display:flex; justify-content:center; margin-top:12px; font-size:13px;">
      <button type="button" class="auth-extra-link" data-koaus-open="resetPw"
        style="background:none;border:none;cursor:pointer;color:var(--text-secondary);text-decoration:underline;font:inherit;padding:4px 10px;">비밀번호 찾기</button>
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
        <div class="koaus-extra-tabs" role="tablist" aria-label="비밀번호 찾기">
          <span class="koaus-extra-tab is-active" role="tab" data-tab="resetPw" aria-selected="true">비밀번호 찾기</span>
          <button type="button" class="report-close" id="koausExtraClose" aria-label="닫기">✕</button>
        </div>
        <div class="report-body" id="koausExtraBody">
          <!-- 비밀번호 찾기 폼 — 이메일 + 보안질문 + 보안답변 3종 매칭 → 재설정 메일 자동 발송 -->
          <div class="koaus-extra-pane" data-pane="resetPw">
            <div class="auth-field"><label class="auth-label">가입한 이메일</label>
              <input class="auth-input" id="koausResetPwEmail" type="email" autocomplete="email" placeholder="email@example.com" />
            </div>
            <div class="auth-field"><label class="auth-label">보안 질문</label>
              <select class="auth-input" id="koausResetPwSecQ">
                ${SECURITY_QUESTIONS.map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join('')}
                <option value="${SEC_Q_CUSTOM}">직접 질문 입력하기</option>
              </select>
              <input class="auth-input" id="koausResetPwSecQCustom" type="text" maxlength="100"
                     placeholder="가입 시 직접 입력한 질문을 그대로 입력" hidden style="margin-top:8px;" />
            </div>
            <div class="auth-field"><label class="auth-label">보안 답변</label>
              <input class="auth-input" id="koausResetPwSecA" type="text" maxlength="100" placeholder="가입 시 설정한 보안 답변" />
            </div>
            <p class="koaus-extra-msg" id="koausResetPwMsg" style="font-size:12.5px;color:var(--text-muted);margin-top:8px;min-height:18px;">이메일 + 보안 질문 + 답변이 모두 일치하면 재설정 링크를 보내드립니다.</p>
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
  // 비번찾기 select change → "직접 입력" 시에만 customQ input 표시 (가입 폼과 동일 UX)
  const rpSel = document.getElementById('koausResetPwSecQ');
  const rpCustom = document.getElementById('koausResetPwSecQCustom');
  if (rpSel && rpCustom) {
    rpSel.addEventListener('change', () => {
      const on = rpSel.value === SEC_Q_CUSTOM;
      rpCustom.hidden = !on;
      if (on) { try { rpCustom.focus(); } catch (_) {} } else { rpCustom.value = ''; }
    });
  }
  document.getElementById('koausResetPwSubmit').addEventListener('click', onResetPw);
}

// 단일 pane(resetPw) 메시지 초기화만 담당 — 옛 findId 탭 폐기로 탭 전환 로직 불필요
function switchExtraPane(_pane) {
  const rpm = document.getElementById('koausResetPwMsg');
  if (rpm) rpm.innerHTML = '이메일 + 보안 답변이 일치하면 재설정 링크를 보내드립니다.';
}
function openExtraModal(_pane) {
  mountExtraModals();
  const modal = document.getElementById('koausExtraModal');
  // 로그인 모달이 떠 있으면 .open 클래스만 제거 — 인라인 style.display 절대 X
  //  · 이전 PR 에서 style.display='none' 인라인을 남겨두는 바람에 다음 openAuthModal 시
  //    .open 의 display:flex 가 인라인에 가려져서 로그인 창 먹통 버그 발생 → 픽스
  document.querySelectorAll('.auth-overlay.open').forEach(o => {
    o.classList.remove('open');
    o.style.removeProperty('display');
  });
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
  switchExtraPane('resetPw');
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

// ── 비번 재설정 — 이메일 + 보안질문 + 보안답변 3종 매칭 후 sendPasswordResetEmail 자동 발송 ──
// 클라이언트만으로 비밀번호를 직접 변경하는 것은 Firebase 보안상 불가능 (signed-in user 만 updatePassword).
// → 보안질문 + 답변 통과 시 Firebase 공식 reset 메일을 자동 발송 → 유저는 메일 링크 클릭 → 새 비번 설정.
// 질문도 검증함으로써, 답변만 추측해서는 재설정을 발송시킬 수 없도록 보안 강화.
async function onResetPw() {
  const email      = (document.getElementById('koausResetPwEmail').value || '').trim().toLowerCase();
  const secQRaw    = document.getElementById('koausResetPwSecQ')?.value || '';
  const secQCustom = (document.getElementById('koausResetPwSecQCustom')?.value || '').trim();
  const secQ       = (secQRaw === SEC_Q_CUSTOM) ? secQCustom : secQRaw;
  const secA       = norm(document.getElementById('koausResetPwSecA')?.value || '');
  const msg        = document.getElementById('koausResetPwMsg');
  if (!email || !/^.+@.+\..+$/.test(email)) {
    msg.textContent = '올바른 이메일 형식이 아닙니다.';
    msg.style.color = 'var(--red, #dc2626)'; return;
  }
  if (!secQ) {
    msg.textContent = '보안 질문을 선택(또는 직접 입력)해 주세요.';
    msg.style.color = 'var(--red, #dc2626)'; return;
  }
  if (!secA) {
    msg.textContent = '보안 답변을 입력해 주세요.';
    msg.style.color = 'var(--red, #dc2626)'; return;
  }
  msg.textContent = '확인 중…';
  msg.style.color = 'var(--text-muted)';
  try {
    // emails/{email} 단일 doc get — 비로그인 유저도 id 1건 조회로 가입 여부 + 질문/답변 매칭
    // (users 컬렉션 list 폐기 — 보안답변 평문이 임의 필드 조합 쿼리로 새지 않도록 차단)
    // 응답 메시지는 'doc 없음' / 'secQ 불일치' / 'secA 불일치' 모두 동일 — enumeration 차단
    const snap = await getDoc(doc(db, 'emails', email));
    if (!snap.exists()) {
      msg.textContent = '질문 또는 답변이 일치하지 않습니다.';
      msg.style.color = 'var(--red, #dc2626)'; return;
    }
    const data = snap.data();
    // secQ 매칭: trim 만 적용 (대소문자 구분 — 한글 질문이므로 그대로 비교)
    const savedQ = String(data.securityQ || '').trim();
    if (savedQ && savedQ !== secQ.trim()) {
      msg.textContent = '질문 또는 답변이 일치하지 않습니다.';
      msg.style.color = 'var(--red, #dc2626)'; return;
    }
    // secA 매칭 — PBKDF2 동일 유도 후 비교 (H3). 평문 폴백 제거됨 (2026-06-10 마이그레이션 + 잔존 0건 검증 완료)
    //   해시 필드 없는 doc 은 무조건 불일치 처리 — 응답 메시지는 동일 유지 (enumeration 차단)
    const inputHash = (data.securityAHash && data.securityASalt)
      ? await hashSecA(secA, data.securityASalt, Number(data.securityAIter) || SECA_ITER)
      : null;
    if (!inputHash || inputHash !== data.securityAHash) {
      msg.textContent = '질문 또는 답변이 일치하지 않습니다.';
      msg.style.color = 'var(--red, #dc2626)'; return;
    }
    // 옛 가입자(securityQ 미저장) 호환: savedQ 가 비어 있으면 secQ 검증을 건너뛰고 secA 만으로 통과
    // → 옛 13개 풀 유저는 답변만 일치해도 진입 가능 (마이페이지에서 securityQ 갱신 유도 별도)
    // 검증 통과 → Firebase 공식 비밀번호 재설정 메일 자동 발송
    msg.textContent = '재설정 메일 전송 중…';
    await sendPasswordResetEmail(auth, email);
    msg.innerHTML = '✅ 보안 질문/답변이 일치합니다.<br>가입한 이메일로 <strong>비밀번호 재설정 링크</strong>를 발송했습니다.<br><span style="font-size:11.5px;">메일함(스팸함 포함)을 확인하고 링크를 눌러 새 비밀번호를 설정해 주세요.</span>';
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

// ── 회원가입 성공 시 users 컬렉션 저장 (createUserWithEmailAndPassword 직후 user 도착) ──
let _firstUid = '';  // 같은 세션에서 회원가입 → 곧장 첫 user 도착인 경우만 처리
onAuthStateChanged(auth, async user => {
  if (!user) { _firstUid = ''; return; }
  if (user.uid === _firstUid) return;
  _firstUid = user.uid;
  const pending = window.__koausPendingSignup;
  if (!pending || !pending.nickname) return;
  if (pending.email && pending.email !== (user.email || '').toLowerCase()) return;
  const lowEmail = (user.email || '').toLowerCase();
  const lowNick  = String(pending.nickname || '').toLowerCase();
  const now      = Date.now();
  try {
    // 보안답변 해시 — 평문은 트랜잭션에 절대 넣지 않음 (H3)
    const secASalt = newSaltHex();
    const secAHash = await hashSecA(pending.securityA, secASalt, SECA_ITER);
    // users + nicknames + emails 3개 doc 을 트랜잭션 1세트로 원자적 작성
    // (race 차단: 동시 가입자가 같은 닉/이메일 선점 시 한쪽이 NICK_TAKEN/EMAIL_TAKEN 으로 롤백)
    await runTransaction(db, async tx => {
      const userRef  = doc(db, 'users', user.uid);
      const nickRef  = doc(db, 'nicknames', lowNick);
      const emailRef = doc(db, 'emails', lowEmail);
      // ── Reads (모든 read 가 write 보다 앞서야 함) ──
      const nickSnap  = await tx.get(nickRef);
      const emailSnap = await tx.get(emailRef);
      if (nickSnap.exists() && nickSnap.data().uid !== user.uid)   throw new Error('NICK_TAKEN');
      if (emailSnap.exists() && emailSnap.data().uid !== user.uid) throw new Error('EMAIL_TAKEN');
      // ── Writes ──
      tx.set(userRef, {
        email: lowEmail,
        nickname: pending.nickname,
        securityQ: pending.securityQ,
        securityAHash: secAHash,
        securityASalt: secASalt,
        securityAIter: SECA_ITER,
        createdAt: now,
      }, { merge: true });
      // nicknames 측 securityA 미러 — 아이디 찾기 폐기로 미사용, 평문 사본 자체를 제거 (H3)
      tx.set(nickRef, {
        uid: user.uid,
        nickname: pending.nickname,
        email: lowEmail,
        createdAt: now,
      });
      tx.set(emailRef, {
        uid: user.uid,
        securityQ: pending.securityQ,   // 비번 재설정 시 secQ 매칭용 (질문 텍스트 자체)
        securityAHash: secAHash,        // 비번 재설정 시 secA 매칭용 (PBKDF2 해시)
        securityASalt: secASalt,
        securityAIter: SECA_ITER,
        createdAt: now,
      });
    });
    // 마이페이지/게시글 작성 시 별명 사용
    try { localStorage.setItem('koaus-nickname', pending.nickname); } catch (_) {}
  } catch (e) {
    console.warn('[auth-extra] 회원가입 추가 정보 저장 실패', e && e.message || e);
    // 가입 자체(Auth)는 성공한 상태 — 트랜잭션 실패 시 마이페이지에서 별명 재설정 가능
    if (e && (e.message === 'NICK_TAKEN' || e.message === 'EMAIL_TAKEN')) {
      try { alert('가입 직후 부가 정보 저장에 실패했습니다.\n마이페이지에서 별명을 다시 설정해 주세요.'); } catch (_) {}
    }
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
