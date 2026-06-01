// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 관리자(Admin) 인증 + 퍼블릭 페이지 갓모드(God Mode) UI
//  -----------------------------------------------------------------
//  · 모든 페이지의 <head> 에 한 줄 로드: <script type="module" src="admin-mark.js">
//  · 이메일 화이트리스트 ∪ Custom Claim {admin:true} 둘 중 하나만 통과해도 admin.
//  · 인증 시 body 에 .is-admin 클래스 부여 → CSS .admin-only 규칙으로 자동 노출.
//  · services 컬렉션 카드(restaurants/trades/gp/salon/auto/accom)에 동적으로
//    [✅ 승인] [⏸ 보류] [🗑 즉시 삭제] 액션바 자동 주입 — 페이지 본체 수정 0.
//  · admin.html 의 자체 가드와 충돌 없음 (admin-mark.js 는 보조 인프라).
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import { getFirestore, doc, updateDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain: 'koaus-f564c.firebaseapp.com',
  projectId: 'koaus-f564c',
  storageBucket: 'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId: '1:663988594088:web:ef30c2fd557407b00b299d',
};

// admin.html 의 ADMIN_EMAILS 와 동기화 — Firestore rules 의 isAdmin() 과도 일치
const ADMIN_EMAILS = [
  'sinhang0122@gmail.com',
  'admin@thekoaus.com',
];

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
let db = null;
try { db = getFirestore(app); } catch (_) {}

// 페이지 → LocalStorage 키 매핑 (services doc id 룩업용)
const PAGE_STORE = {
  'restaurants.html': 'koaus-restaurants-posts',
  'trades.html':      'koaus-trades-posts',
  'gp.html':          'koaus-gp-posts',
  'salon.html':       'koaus-salon-posts',
  'auto.html':        'koaus-auto-posts',
  'accom.html':       'koaus-accom-posts',
};

function currentStoreKey() {
  const fname = (location.pathname.split('/').pop() || '').toLowerCase();
  return PAGE_STORE[fname] || null;
}

function setAdminFlag(flag) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('is-admin', !!flag);
  window.koausIsAdmin = !!flag;
}

function setAdminEmail(email) {
  window.koausAdminEmail = email || '';
}

// services doc id 룩업 — 카드 data-id (Date.now() 기반) → _fsDocId
function lookupFsDocId(localId) {
  const key = currentStoreKey();
  if (!key) return null;
  try {
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    const hit = arr.find(p => String(p.id) === String(localId));
    return hit && hit._fsDocId ? hit._fsDocId : null;
  } catch (_) { return null; }
}

// admin 전용 카드 액션 (퍼블릭 페이지에서 즉시 Firestore 제어)
async function approve(docId) {
  if (!db) { alert('Firestore 미초기화'); return; }
  try {
    await updateDoc(doc(db, 'services', docId), { status: 'approved', approvedAt: serverTimestamp() });
    showToast('✅ 승인 완료 — 퍼블릭 노출');
  } catch (e) { console.error('[admin-mark] approve 실패', e); alert('승인 실패: ' + (e.message || e)); }
}
async function hold(docId) {
  if (!db) { alert('Firestore 미초기화'); return; }
  try {
    await updateDoc(doc(db, 'services', docId), { status: 'pending', heldAt: serverTimestamp() });
    showToast('⏸ 보류 처리 — 퍼블릭 노출 중단');
  } catch (e) { console.error('[admin-mark] hold 실패', e); alert('보류 실패: ' + (e.message || e)); }
}
async function deleteHard(docId) {
  if (!db) { alert('Firestore 미초기화'); return; }
  if (!confirm('이 글을 영구 삭제하시겠습니까?')) return;
  try {
    await deleteDoc(doc(db, 'services', docId));
    showToast('🗑 영구 삭제 완료');
  } catch (e) { console.error('[admin-mark] delete 실패', e); alert('삭제 실패: ' + (e.message || e)); }
}

window.koausAdminQuickAction = function (action, docId) {
  if (!window.koausIsAdmin) { alert('관리자 권한이 필요합니다.'); return; }
  if (!docId) { alert('Firestore 문서 ID 를 찾을 수 없습니다 (관리자 직접 등록 글만 액션 가능).'); return; }
  if (action === 'approve') return approve(docId);
  if (action === 'hold')    return hold(docId);
  if (action === 'delete')  return deleteHard(docId);
};

// 인스턴스 토스트 (offline.js / session-timeout.js 와 별개 ID)
function showToast(message) {
  let host = document.getElementById('koausAdminToast');
  if (!host) {
    const style = document.createElement('style');
    style.textContent = `
      #koausAdminToast {
        position: fixed; top: max(60px, env(safe-area-inset-top, 14px));
        left: 50%; transform: translateX(-50%) translateY(-110%);
        z-index: 99998;
        background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%);
        color: #fff; padding: 11px 18px; border-radius: 999px;
        font: 700 13.5px/1.3 'Noto Sans KR','Urbanist',system-ui,sans-serif;
        box-shadow: 0 10px 30px rgba(185, 28, 28, .35);
        opacity: 0; transition: opacity .25s, transform .35s cubic-bezier(.2,.7,.3,1);
        pointer-events: none; max-width: calc(100vw - 32px); white-space: nowrap;
      }
      #koausAdminToast.is-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;
    document.head.appendChild(style);
    host = document.createElement('div');
    host.id = 'koausAdminToast';
    host.setAttribute('role', 'status');
    document.body.appendChild(host);
  }
  host.textContent = message;
  void host.offsetWidth;
  host.classList.add('is-show');
  setTimeout(() => host.classList.remove('is-show'), 2000);
}

// 카드 액션바 자동 주입 — 페이지 본체 수정 없이 services 카드에 [승인][보류][삭제] 추가
function injectCardActions() {
  if (!window.koausIsAdmin) return;
  const cards = document.querySelectorAll('.accom-card[data-id]');
  cards.forEach(card => {
    if (card.__koausAdminBar) return;
    const localId = card.getAttribute('data-id');
    const fsDocId = lookupFsDocId(localId);
    if (!fsDocId) return;  // services 컬렉션 글이 아닌 경우 skip
    const bar = document.createElement('div');
    bar.className = 'koaus-admin-toolbar admin-only';
    bar.innerHTML = `
      <button type="button" class="koaus-admin-btn koaus-admin-btn--approve" data-act="approve" data-fsid="${fsDocId}" title="승인">✅</button>
      <button type="button" class="koaus-admin-btn koaus-admin-btn--hold"    data-act="hold"    data-fsid="${fsDocId}" title="보류">⏸</button>
      <button type="button" class="koaus-admin-btn koaus-admin-btn--del"     data-act="delete"  data-fsid="${fsDocId}" title="삭제">🗑</button>
    `;
    card.appendChild(bar);
    card.__koausAdminBar = true;
  });
}

// 클릭 위임 — 모든 admin 액션 버튼 (카드 클릭(상세 이동) 차단)
document.addEventListener('click', e => {
  const btn = e.target.closest('.koaus-admin-btn[data-act][data-fsid]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  window.koausAdminQuickAction(btn.dataset.act, btn.dataset.fsid);
}, true);

// services 데이터 갱신 시 액션바 재주입
window.addEventListener('koaus-services-updated', () => setTimeout(injectCardActions, 100));
// 페이지 초기 렌더 직후 시도 (카드가 늦게 그려질 수 있어 여러 번 시도)
[300, 800, 1500, 3000].forEach(ms => setTimeout(injectCardActions, ms));

// ── 인증 상태 추적 ──
onAuthStateChanged(auth, async user => {
  try {
    if (!user) { setAdminFlag(false); setAdminEmail(''); return; }
    const email = (user.email || '').toLowerCase();
    setAdminEmail(email);
    const isAdminEmail = ADMIN_EMAILS.includes(email);
    let isAdminClaim = false;
    try {
      const t = await user.getIdTokenResult();
      isAdminClaim = !!(t.claims && t.claims.admin === true);
    } catch (_) {}
    setAdminFlag(isAdminEmail || isAdminClaim);
    if (window.koausIsAdmin) setTimeout(injectCardActions, 100);
  } catch (e) {
    console.warn('[admin-mark] custom claim 조회 실패', e);
    setAdminFlag(false);
  }
});
