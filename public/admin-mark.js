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
import {
  getAuth, onAuthStateChanged,
  setPersistence, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
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
// 사용자 명시: sinhang0122 단독 운영자 (koaus.official 권한 제거 — mailto 연락처는 별개)
const ADMIN_EMAILS = [
  'sinhang0122@gmail.com',
];

// ── 페이지 진입 즉시 sessionStorage 1차 체크 (Firebase 로딩 전 튕김 방지) ──
//  · admin.html 로그인 성공 시 3개 키 동시 저장 — 1순위 부트 패스포트
//    · 'isAdmin'           = 'true' (표준 보조 플래그 — 가장 짧고 보편적)
//    · 'isAdminLoggedIn'   = 'true' (레거시 보조 플래그 — 하위 호환)
//    · 'koaus-admin'       = email (이메일 화이트리스트 검증용)
//  · 다른 페이지 진입 시 셋 중 하나만 살아있어도 즉시 body.is-admin 부여 → 깜빡임 없음.
//  · onAuthStateChanged 결과로 최종 확정 (단, 첫 user=null 발화는 grace — 캐시 살아있으면 보류).
function readAdminCache() {
  let email = '';
  let flag  = false;
  try { email = (sessionStorage.getItem('koaus-admin') || '').toLowerCase(); } catch (_) {}
  try {
    flag = sessionStorage.getItem('isAdmin') === 'true'
        || sessionStorage.getItem('isAdminLoggedIn') === 'true';
  } catch (_) {}
  return { email, flag, isCachedAdmin: flag || (!!email && ADMIN_EMAILS.includes(email)) };
}
function clearAdminCache() {
  try { sessionStorage.removeItem('koaus-admin'); } catch (_) {}
  try { sessionStorage.removeItem('isAdminLoggedIn'); } catch (_) {}
  try { sessionStorage.removeItem('isAdmin'); } catch (_) {}
}
function writeAdminCache(email) {
  try { sessionStorage.setItem('koaus-admin', email); } catch (_) {}
  try { sessionStorage.setItem('isAdminLoggedIn', 'true'); } catch (_) {}
  try { sessionStorage.setItem('isAdmin', 'true'); } catch (_) {}
}
(function applyAdminFastPath() {
  const c = readAdminCache();
  if (c.isCachedAdmin) {
    window.koausIsAdmin = true;
    window.koausAdminEmail = c.email || '';
    if (document.body) document.body.classList.add('is-admin');
    else document.addEventListener('DOMContentLoaded', () => document.body.classList.add('is-admin'), { once: true });
  }
})();

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
// 지시 6/10 — 모바일 Safari ITP / Private mode 방어: persistence 폴백 체인.
//  · ① indexedDBLocalPersistence (ITP 영향 적음, Firebase v9+ 권장)
//  · ② browserLocalPersistence  (데스크탑·기존 사용자 호환)
//  · ③ inMemoryPersistence      (Private mode 최후 폴백)
//  · session-timeout.js 와 동일 체인 — 두 모듈 중 먼저 실행되는 쪽이 확정.
(async () => {
  try { await setPersistence(auth, indexedDBLocalPersistence); }
  catch (_) {
    try { await setPersistence(auth, browserLocalPersistence); }
    catch (_) {
      try { await setPersistence(auth, inMemoryPersistence); }
      catch (e) { console.warn('[admin-mark] persistence 전체 실패', e); }
    }
  }
})();
let db = null;
try { db = getFirestore(app); } catch (_) {}

// 페이지 → LocalStorage 키 매핑 (services doc id 룩업용)
//  · services 컬렉션 doc 이 있는 카드만 admin 액션바 자동 주입 (없으면 lookupFsDocId 가 null → skip).
//  · 새 보드 추가 시 여기 한 줄만 추가하면 모든 admin 액션이 자동 작동.
const PAGE_STORE = {
  'restaurants.html': 'koaus-restaurants-posts',
  'trades.html':      'koaus-trades-posts',
  'gp.html':          'koaus-gp-posts',
  'salon.html':       'koaus-salon-posts',
  'auto.html':        'koaus-auto-posts',
  'accom.html':       'koaus-accom-posts',
  'jobs.html':        'koaus-jobs-posts',
  'rent.html':        'koaus-rent-posts',
  'car-sale.html':    'koaus-car-sale-posts',
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

// ── 페이지별 액션 매핑 (컬렉션 / status / 라벨·툴팁 / 토스트) ──
//   · jobs(work) 는 jobs_posts 컬렉션 + 구인 전용 status('closed'/'paused')
//   · accom·rent 는 *_posts (현재 localStorage 만 사용 — Firestore 미마이그레이션 상태)
//   · 그 외 services 컬렉션 (restaurants/trades/salon/gp/auto)
// ── 통합 정책 (지시 5/7) ──
//   · 옛 hold(pending)/hide(hidden) 2개 액션 → 'hold' (일시 숨김) 하나로 통합.
//   · DB: { isHidden:true, status:'hidden', hiddenAt:serverTimestamp() } 일관 적용.
//   · 메인 리스트 fetch: where('status','==','approved') + 클라이언트 `!p.isHidden` 이중 안전망으로 즉시 제외.
//   · 작성자가 마이페이지에서 ⏸️/▶️ 토글 가능 (firestore.rules statusAllowedForOwner 허용).
const DEFAULT_CONFIG = {
  collection: 'services',
  actions: {
    approve: { status: 'approved', icon: '✅', title: '다시 노출 (일시 숨김 해제)', toast: '✅ 다시 노출 — 퍼블릭 표시', tsField: 'approvedAt', extra: { isHidden: false } },
    hold:    { status: 'hidden',   icon: '⏸', title: '일시 숨김 (퍼블릭 제외)',  toast: '⏸ 일시 숨김 — 일반 리스트 제외', tsField: 'hiddenAt', extra: { isHidden: true } },
    delete:  { hard: true,         icon: '🗑', title: '영구 삭제',             toast: '🗑 영구 삭제 완료' },
  },
};
const PAGE_CONFIG = {
  'jobs.html': {
    collection: 'jobs_posts',
    actions: {
      approve: { status: 'closed', icon: '✅', title: '구인 마감하기',     toast: '✅ 구인 마감 처리 완료',    tsField: 'closedAt' },
      hold:    { status: 'hidden', icon: '⏸', title: '일시 숨김 (퍼블릭 제외)', toast: '⏸ 공고 일시 숨김 처리', tsField: 'hiddenAt', extra: { isHidden: true } },
      delete:  { hard: true,       icon: '🗑', title: '공고 영구 삭제',   toast: '🗑 공고 영구 삭제 완료' },
    },
  },
  'accom.html': { collection: 'accom_posts', actions: DEFAULT_CONFIG.actions },
  'rent.html':  { collection: 'rent_posts',  actions: DEFAULT_CONFIG.actions },
};
function currentPageConfig() {
  const fname = (location.pathname.split('/').pop() || '').toLowerCase();
  return PAGE_CONFIG[fname] || DEFAULT_CONFIG;
}

// admin 전용 카드 액션 (퍼블릭 페이지에서 즉시 Firestore 제어 — 컬렉션/status 페이지별 동적)
async function runAction(actKey, docId) {
  if (!db) { alert('Firestore 미초기화'); return; }
  const cfg = currentPageConfig();
  const act = cfg && cfg.actions && cfg.actions[actKey];
  if (!act) { alert('알 수 없는 액션: ' + actKey); return; }
  try {
    if (act.hard) {
      if (!confirm('이 글을 영구 삭제하시겠습니까?')) return;
      await deleteDoc(doc(db, cfg.collection, docId));
    } else {
      const update = { status: act.status };
      if (act.tsField) update[act.tsField] = serverTimestamp();
      if (act.extra && typeof act.extra === 'object') Object.assign(update, act.extra);
      await updateDoc(doc(db, cfg.collection, docId), update);
    }
    showToast(act.toast);
  } catch (e) {
    console.error('[admin-mark] ' + actKey + ' 실패 (' + cfg.collection + '/' + docId + ')', e);
    alert((act.title || actKey) + ' 실패: ' + (e.message || e));
  }
}

window.koausAdminQuickAction = function (action, docId) {
  if (!window.koausIsAdmin) { alert('관리자 권한이 필요합니다.'); return; }
  if (!docId) { alert('Firestore 문서 ID 를 찾을 수 없습니다 (관리자 직접 등록 글만 액션 가능).'); return; }
  if (['approve', 'hold', 'delete'].indexOf(action) >= 0) return runAction(action, docId);
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

// 카드 액션바 자동 주입 — 비활성화 (지시: 카드 내 일시정지·완료·휴지통 아이콘 제거)
//   · 옛 .koaus-admin-toolbar (admin 카드 우측 상단 아이콘 3개) → 텍스트 mini-btn 5종으로 통합됨.
//   · admin 권한 작성자 액션은 페이지별 .post-mini-actions 의 [공유][신고][수정][숨김][삭제] 로 일원화.
//   · runAction(approve/hold/delete) 핸들러는 유지 — 다른 경로(상세 모달 등)에서 호출 가능.
function injectCardActions() {
  // no-op (마크업 통합 — mini-btn 으로 대체)
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

// ── 카드 DOM 재구성 자동 감지 (MutationObserver) — '광역 액션바 증발' 버그 차단 ──
//   배경: 페이지의 onSnapshot/renderAll 이 innerHTML 재할당으로 카드를 재구성하면
//         새 카드에 __koausAdminBar 플래그가 없어 액션바가 사라진 채로 보이는 버그.
//         (특히 jobs.html — koaus-services-updated 이벤트 발화 안 함)
//   해결: .accom-card[data-id] 추가/대체 감지 → debounce 50ms → injectCardActions 자동 호출.
//         페이지 본체 수정 없이 모든 페이지(7개 카테고리) 동일하게 적용.
(function setupCardMutationObserver() {
  if (typeof MutationObserver !== 'function') return;
  let scheduled = false;
  function scheduleReinject() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; try { injectCardActions(); } catch (_) {} }, 50);
  }
  function hasCardChange(mutations) {
    for (const m of mutations) {
      // 1) 새로 추가된 노드 안에 .accom-card[data-id] 존재
      if (m.addedNodes && m.addedNodes.length) {
        for (let i = 0; i < m.addedNodes.length; i++) {
          const n = m.addedNodes[i];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('.accom-card[data-id]')) return true;
          if (n.querySelector && n.querySelector('.accom-card[data-id]')) return true;
        }
      }
      // 2) 제거된 노드 안에 카드 있음 — 새 카드로 교체된 케이스
      if (m.removedNodes && m.removedNodes.length) {
        for (let i = 0; i < m.removedNodes.length; i++) {
          const n = m.removedNodes[i];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('.accom-card[data-id]')) return true;
          if (n.querySelector && n.querySelector('.accom-card[data-id]')) return true;
        }
      }
    }
    return false;
  }
  function startObserve() {
    if (!document.body) return;
    const observer = new MutationObserver(mutations => {
      if (!window.koausIsAdmin) return;   // admin 아닐 때 비용 0
      if (hasCardChange(mutations)) scheduleReinject();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) startObserve();
  else document.addEventListener('DOMContentLoaded', startObserve, { once: true });
})();

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

// ── .pinned-notice 조건부 노출 — 비어 있으면 화면에서 완전히 제거 ──
//  · 평소 등록된 고정 공지가 없으면 공간을 전혀 차지하지 않음 (Conditional Rendering)
//  · JS 가 내용을 채우면 자동 노출, 비우면 자동 hidden
(function setupPinnedNoticeGate() {
  function check(el) {
    const txt = (el.textContent || '').trim();
    if (!txt) { el.setAttribute('hidden', ''); el.classList.add('is-empty'); }
    else      { el.removeAttribute('hidden'); el.classList.remove('is-empty'); }
  }
  function wire() {
    document.querySelectorAll('.pinned-notice').forEach(el => {
      if (el.__koausPinnedWired) return;
      el.__koausPinnedWired = true;
      check(el);
      try {
        new MutationObserver(() => check(el)).observe(el, { childList: true, subtree: true, characterData: true });
      } catch (_) {}
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
  else wire();
  [400, 1500].forEach(ms => setTimeout(wire, ms));
})();

// ── State(주) 바로가기 카드 — 전역 자동 빌드 ──
//  · 사용법: 페이지 본문 어디든 `<section data-koaus-state-quick></section>` 한 줄만 추가.
//  · 8개 주 카드 그리드(state.html?id=xxx) 가 자동 주입된다. 페이지 본체 JS 수정 불필요.
//  · 이미 빌드된 그리드는 재실행 시 스킵 (idempotent).
(function setupGlobalStateQuick() {
  // 지시 2/2: 대도시 한글 병기 — 신규 방문자 가독성 (호주 지리 미숙 사용자 친절 안내)
  const STATES = [
    ['nsw','NSW','New South Wales','🦘','시드니'],
    ['vic','VIC','Victoria','🌆','멜버른'],
    ['qld','QLD','Queensland','🏖','브리즈번'],
    ['wa', 'WA', 'Western Australia','🏜','퍼스'],
    ['sa', 'SA', 'South Australia','🍇','애들레이드'],
    ['tas','TAS','Tasmania','🍃','호바트'],
    ['act','ACT','Australian Capital','🏛','캔버라'],
    ['nt', 'NT', 'Northern Territory','🌵','다윈'],
  ];
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function buildOne(host) {
    if (!host || host.__koausStateBuilt) return;
    const cards = STATES.map(([id,code,name,flag,city]) =>
      '<a class="state-card" href="state.html?id=' + id + '">' +
        '<span class="state-card-arrow" aria-hidden="true">→</span>' +
        '<span class="state-card-code">' + code +
          ' <em class="state-card-city">(' + esc(city) + ')</em>' +
        '</span>' +
        '<span class="state-card-name">' + flag + ' ' + esc(name) + '</span>' +
      '</a>'
    ).join('');
    host.innerHTML =
      '<section class="state-section" aria-label="주 바로가기">' +
        '<div class="state-section-head">' +
          '<span class="state-section-title">📍 주(State) 바로가기 ' +
            '<em style="font-style:normal;font-weight:600;color:var(--text-muted);">· State Hub</em></span>' +
          '<span class="state-section-hint">8개 주 · 카테고리 통합</span>' +
        '</div>' +
        '<div class="state-grid">' + cards + '</div>' +
      '</section>';
    host.__koausStateBuilt = true;
  }
  function buildAll() { document.querySelectorAll('[data-koaus-state-quick]').forEach(buildOne); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildAll, { once: true });
  } else { setTimeout(buildAll, 0); }
  // 동적 마운트 대비 지연 재시도
  [400, 1500].forEach(ms => setTimeout(buildAll, ms));
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

// ── 인증 상태 추적 (튕김 방지: 첫 user=null 발화 grace) ──
//  · Firebase persistence 복원 도중에는 onAuthStateChanged 가 일시적으로 user=null 로 발화할 수 있다.
//    이 때 sessionStorage 캐시가 살아있다면 admin UI 를 해제하지 말고 다음 발화(실제 user 도착)를 기다린다.
//  · 명시적 로그아웃은 admin.html / mypage 등에서 sessionStorage 캐시를 먼저 제거한 뒤 signOut 하므로
//    여기 user=null 발화 시 캐시가 비어 있다 → 정상 해제.
let _authFiredOnce = false;
onAuthStateChanged(auth, async user => {
  const isFirstFire = !_authFiredOnce;
  _authFiredOnce = true;
  try {
    if (!user) {
      const c = readAdminCache();
      if (c.isCachedAdmin) {
        // 캐시 살아있음 — persistence 복원 중일 수 있어 해제 보류.
        //  · 단, 첫 발화 후 8초 안에 user 도착하지 않으면 fallback 으로 해제 (만성 미인증 방지).
        if (isFirstFire) {
          setTimeout(() => {
            try {
              if (!auth.currentUser && readAdminCache().isCachedAdmin) {
                console.info('[admin-mark] 8s grace 만료 — Firebase 복원 실패, 캐시 해제');
                clearAdminCache();
                setAdminFlag(false); setAdminEmail('');
              }
            } catch (_) {}
          }, 8000);
        }
        return;
      }
      setAdminFlag(false); setAdminEmail('');
      clearAdminCache();
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
    if (isAdmin) writeAdminCache(email);
    else clearAdminCache();
    if (window.koausIsAdmin) setTimeout(injectCardActions, 100);
  } catch (e) {
    console.warn('[admin-mark] custom claim 조회 실패', e);
    // 캐시 살아있으면 일단 admin 유지, 아니면 해제
    if (!readAdminCache().isCachedAdmin) setAdminFlag(false);
  }
});
