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
  'koaus.official@gmail.com',
];

// ── 페이지 진입 즉시 sessionStorage 1차 체크 (Firebase 로딩 전 튕김 방지) ──
//  · admin.html 로그인 성공 시 sessionStorage 'koaus-admin' = email 저장.
//  · 다른 페이지 진입 시 이 값을 즉시 읽어 body.is-admin 부여 → CSS 의 admin 전용
//    버튼이 깜빡임 없이 노출. onAuthStateChanged 결과로 최종 확정 (불일치 시 해제).
(function applyAdminFastPath() {
  try {
    const cached = (sessionStorage.getItem('koaus-admin') || '').toLowerCase();
    if (cached && ADMIN_EMAILS.includes(cached)) {
      window.koausIsAdmin = true;
      window.koausAdminEmail = cached;
      if (document.body) document.body.classList.add('is-admin');
      else document.addEventListener('DOMContentLoaded', () => document.body.classList.add('is-admin'), { once: true });
    }
  } catch (_) {}
})();

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

// ── 7일 영업시간 그리드 빌더 (전역) ──
//  · admin / 사장님 글쓰기 모달 등 어디서든 호출 가능.
//  · 호출: window.__koausBuildBizHours(prefix);  // 'rs','gp','sl','rq' 등
//  · 결과: data-biz-hours="<prefix>" 그리드 안에 월~일 행 자동 생성
//  · sync: hidden #{prefix}Hours (텍스트) + #{prefix}HoursJson 자동 동기화
(function setupGlobalBizHours() {
  const DAYS = [['mon','월'],['tue','화'],['wed','수'],['thu','목'],['fri','금'],['sat','토'],['sun','일']];
  const TIMES = Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0') + ':00');
  function buildGrid(prefix) {
    const grid = document.querySelector('.biz-hours-grid[data-biz-hours="' + prefix + '"]');
    if (!grid || grid.__built) return;
    const options = TIMES.map(t => '<option value="' + t + '">' + t + '</option>').join('');
    grid.innerHTML = DAYS.map(([k, label]) =>
      '<div class="biz-hours-row">' +
        '<span class="biz-hours-day">' + label + '</span>' +
        '<select class="biz-hours-sel" data-day="' + k + '" data-role="open">' +
          '<option value="">오픈 ▽</option>' + options +
          '<option value="closed">휴무</option>' +
        '</select>' +
        '<span class="biz-hours-sep">~</span>' +
        '<select class="biz-hours-sel" data-day="' + k + '" data-role="close">' +
          '<option value="">마감 ▽</option>' + options +
        '</select>' +
      '</div>'
    ).join('');
    grid.__built = true;
    grid.querySelectorAll('select').forEach(s => s.addEventListener('change', () => syncGrid(prefix)));
  }
  function syncGrid(prefix) {
    const grid = document.querySelector('.biz-hours-grid[data-biz-hours="' + prefix + '"]');
    if (!grid) return;
    const obj = {};
    const text = [];
    DAYS.forEach(([k, label]) => {
      const op = (grid.querySelector('select[data-day="' + k + '"][data-role="open"]')  || {}).value || '';
      const cl = (grid.querySelector('select[data-day="' + k + '"][data-role="close"]') || {}).value || '';
      if (op === 'closed')   { obj[k] = 'closed'; text.push(label + ' 휴무'); }
      else if (op && cl)     { obj[k] = op + '~' + cl; text.push(label + ' ' + op + '~' + cl); }
    });
    const hidden = document.getElementById(prefix + 'Hours');
    const json   = document.getElementById(prefix + 'HoursJson');
    if (hidden) hidden.value = text.join(', ');
    if (json)   json.value   = JSON.stringify(obj);
  }
  function resetGrid(prefix) {
    const grid = document.querySelector('.biz-hours-grid[data-biz-hours="' + prefix + '"]');
    if (!grid) return;
    grid.querySelectorAll('select').forEach(s => s.value = '');
    const hidden = document.getElementById(prefix + 'Hours');     if (hidden) hidden.value = '';
    const json   = document.getElementById(prefix + 'HoursJson'); if (json)   json.value   = '';
  }
  window.__koausBuildBizHours = buildGrid;
  window.__koausResetBizHours = resetGrid;
  // 페이지 진입 시 [data-biz-hours] 자동 빌드 (페이지 본체에서 prefix 명시 안 해도 작동)
  function autoBuildAll() {
    document.querySelectorAll('.biz-hours-grid[data-biz-hours]').forEach(g => {
      buildGrid(g.getAttribute('data-biz-hours'));
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBuildAll, { once: true });
  } else { setTimeout(autoBuildAll, 0); }
  // 등록 요청 모달이 늦게 visible 되어도 안전 (지연 재시도)
  [500, 1500].forEach(ms => setTimeout(autoBuildAll, ms));
})();

// ── 7일 영업시간 표 렌더링 헬퍼 (상세 뷰용) ──
//  · window.__koausRenderBizHoursTable(hoursJson) — Firestore 의 hoursJson 객체 입력
//  · 반환: HTML 문자열 (<table class="biz-hours-table">...</table>)
window.__koausRenderBizHoursTable = function (hoursJson) {
  const DAY_LABEL = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
  if (!hoursJson || typeof hoursJson !== 'object') return '';
  const rows = ['mon','tue','wed','thu','fri','sat','sun'].map(k => {
    const v = hoursJson[k];
    const isWeekend = (k === 'sat' || k === 'sun');
    const dayCls = isWeekend ? ' biz-hours-table-day--weekend' : '';
    if (!v) return '<tr><td class="biz-hours-table-day' + dayCls + '">' + DAY_LABEL[k] + '</td><td class="biz-hours-table-val biz-hours-table-val--empty">—</td></tr>';
    if (v === 'closed') return '<tr><td class="biz-hours-table-day' + dayCls + '">' + DAY_LABEL[k] + '</td><td class="biz-hours-table-val biz-hours-table-val--closed">휴무</td></tr>';
    return '<tr><td class="biz-hours-table-day' + dayCls + '">' + DAY_LABEL[k] + '</td><td class="biz-hours-table-val">' + String(v) + '</td></tr>';
  }).join('');
  return '<table class="biz-hours-table">' + rows + '</table>';
};

// ── 인증 상태 추적 ──
onAuthStateChanged(auth, async user => {
  try {
    if (!user) {
      setAdminFlag(false); setAdminEmail('');
      // 명시적 로그아웃 시 sessionStorage 캐시 제거 (다른 탭과 동기화)
      try { sessionStorage.removeItem('koaus-admin'); } catch (_) {}
      return;
    }
    const email = (user.email || '').toLowerCase();
    setAdminEmail(email);
    const isAdminEmail = ADMIN_EMAILS.includes(email);
    let isAdminClaim = false;
    try {
      const t = await user.getIdTokenResult();
      isAdminClaim = !!(t.claims && t.claims.admin === true);
    } catch (_) {}
    const isAdmin = isAdminEmail || isAdminClaim;
    setAdminFlag(isAdmin);
    // sessionStorage 캐시 갱신/제거 — 다음 페이지 fastPath 용
    try {
      if (isAdmin) sessionStorage.setItem('koaus-admin', email);
      else sessionStorage.removeItem('koaus-admin');
    } catch (_) {}
    if (window.koausIsAdmin) setTimeout(injectCardActions, 100);
  } catch (e) {
    console.warn('[admin-mark] custom claim 조회 실패', e);
    setAdminFlag(false);
  }
});
