// ════════════════════════════════════════════════════════════════════
//  KoAus · 집 구해요 프로필 (seeker_profiles) — 2단계 ① (2026-10)
//  - 마이페이지 '내 프로필' 탭 전용 ES module (mypage.html 이 로드). 작성·수정은 여기서만.
//  - 흐름: 탭 열림(koaus:mypage-profile) → seeker_profiles/{uid} 1회 getDoc → 카드 렌더
//          → '만들기/수정' → 6단계 모달(한 화면 한 질문, 단계마다 기기 로컬 임시저장; 11-04 소개글 단계 제외)
//          → 마지막 단계 '저장' 에서 setDoc 1회 (rules: 본인·hasOnly·길이캡·연락처 패턴 차단)
//  - 사진 없음(사용자 확정 — 얼굴이 선택에 영향 주면 안 됨). 실명 없음 — 사이트 닉네임 스냅샷(nick). 아바타(이니셜 원)도 없음(10-20).
//  - 내 프로필 화면(10-20, 인스타 편집 화면 식): 큰 닉네임(+닉네임 변경) → [프로필 편집][집주인이 보는 카드] → 활성화 스위치
//    → '프로필 완성하기' 퍼센트(필수 3단계=60%, 선택 4묶음 각 +10%, 가로 카드 → 해당 단계로) → 내 조건 행·본인만 행(각 '편집' = 그 단계에서 바로 저장)
//    → [구했습니다][프로필 삭제](두 문서 모두 삭제).
//  - 공개/비공개 분리(10-18): seeker_profiles/{uid} = 카드에 보이는 조건+닉네임·성별·연령대(집주인이 읽음),
//    seeker_private/{uid} = 소개글·체류·흡연·반려동물·알림 이메일(본인만). 저장은 writeBatch 로 두 문서 한 번에.
//    옛 단일 문서(firstName·intro·alerts 가 공개 문서에 있던 10-18 이전 저장분)는 본인이 탭을 열 때 자동으로 옮긴다.
//  - 짧은 등록(quick, ①-2 역할 선택 뒤): 동네(+반경)·예산·입주/기간 3단계 → 바로 프로필 생성(건너뛰기 없음, 10-19 확정).
//    끝 화면 = 집주인이 보는 카드 미리보기 + 활성화 스위치 + '프로필 더 채우기'(전체 모달 4단계부터). 닉네임은 계정 닉네임 자동.
//  - 동네 입력: Google Geocoding REST(동네 단위, 호주 한정) — Maps JS 미로드(마이페이지 경량 유지).
//    저장은 동네 중심 좌표만(정확 주소 없음). 최대 3곳.
//  - 공개 토글 / 상태(구하는 중·구했습니다) / 30일 일시정지 '다시 켜기' 는 카드에서 바로 updateDoc.
//  - lastActiveAt 은 모든 본인 쓰기에 serverTimestamp (rules 강제) — 탭 진입 시 하루 1회 갱신.
//  - 값 목록(주·방 종류·나이대 등)은 koaus-enums.js(window.koausEnums) 단일 출처.
// ════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

(function () {
  'use strict';
  if (window.koausSeekerProfile) return;

  const firebaseConfig = {
    apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
    authDomain: 'koaus-f564c.firebaseapp.com',
    projectId: 'koaus-f564c',
    storageBucket: 'koaus-f564c.firebasestorage.app',
    messagingSenderId: '663988594088',
    appId: '1:663988594088:web:ef30c2fd557407b00b299d',
    measurementId: 'G-DERZ9MTKPL',
  };
  const GEOCODE_KEY = 'AIzaSyDwogQ55V0-JqZ-ZYRTpYgNZWOdp_-5vOQ';   // accom/rent/jobs 와 동일 공개 키(리퍼러 제한)
  const DRAFT_KEY = 'koaus-seeker-draft-v1';
  const HAS_KEY = 'koaus-seeker-has-v1';     // {uid, has} — accom/rent 진입 때 koaus-role.js 가 '프로필 없음' 판단에 먼저 씀(읽기 절약)
  const MAX_SUBURBS = 5;   // 10-19: 3 → 5 — 여러 동네(예: 선샤인코스트 + 골드코스트) 집주인에게 동시에 보이게. 8은 rules 표현식 한도 초과
  const TOTAL_STEPS = 6;                 // 11-04: 7→6 — 소개글 단계 제외(소개글은 환경설정 '문의 자기소개'로만, 저장된 값은 숨김 유지)
  const QUICK_STEPS = 3;                 // 짧은 등록: 동네 · 예산 · 입주/기간 → 바로 등록(끝 화면에 미리보기·활성화·더 채우기)
  const RADII = [3, 5, 10, 20];          // 구하는 사람 쪽 반경(동네 기준 km) — 집주인 쪽 반경과 합쳐서(둘 중 큰 쪽) 매칭
  const LEGACY_KEYS = ['firstName', 'residency', 'smoker', 'pet', 'intro', 'alerts'];   // 10-18 이전 공개 문서에 있던 비공개 칸

  let db = null, me = null;
  let profile = null;        // seeker_profiles/{uid} 데이터 (null = 없음) — 공개 칸
  let priv = null;           // seeker_private/{uid} 데이터 (null = 없음) — 본인만
  let loadedFor = null;      // profile 을 읽어온 uid
  let panelEl = null;

  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    onAuthStateChanged(getAuth(app), u => {
      me = u;
      if (!u) { profile = null; priv = null; loadedFor = null; }
      if (panelEl && isPanelVisible()) refreshPanel();
      try { applyEntryRow(); } catch (_) {}
    });
  } catch (e) { try { console.warn('[seeker-profile] init 실패:', e); } catch (_) {} }

  const E = () => window.koausEnums;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = (m) => { try { if (window.koausToast) window.koausToast.show(m); else alert(m); } catch (_) { alert(m); } };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const todayStr = () => { const d = new Date(); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  const isPanelVisible = () => !!(panelEl && panelEl.style.display !== 'none' && panelEl.offsetParent !== null);

  // ── 스타일(자체 주입 — 사이트 변수 사용, 다크 테마 자동) ──
  function injectCss() {
    // 11-04: 스타일은 koaus-profile.css 공통(일 구해요 모듈과 공유) — 없으면 <link> 한 번만
    if (document.getElementById('kspStyle')) return;
    const ln = document.createElement('link');
    ln.id = 'kspStyle'; ln.rel = 'stylesheet'; ln.href = 'koaus-profile.css';
    document.head.appendChild(ln);
  }

  // ── 데이터 읽기 ──
  // 닉네임 스냅샷 — LS(koaus-nickname, app.js 가 로그인 시 users.nickname 과 동기화) → users/{uid}.nickname → displayName
  async function getNick() {
    let n = '';
    try { n = (localStorage.getItem('koaus-nickname') || '').trim(); } catch (_) {}
    if (!n && me && db) {
      try { const u = await getDoc(doc(db, 'users', me.uid)); n = ((u.exists() && u.data().nickname) || '').trim(); } catch (_) {}
    }
    if (!n && me) n = (me.displayName || (me.email || '').split('@')[0] || '').trim();
    return n.slice(0, 30);
  }

  async function loadProfile(force) {
    if (!me || !db) { profile = null; priv = null; loadedFor = null; return null; }
    if (!force && loadedFor === me.uid) return profile;
    try {
      const [snap, psnap] = await Promise.all([getDoc(doc(db, 'seeker_profiles', me.uid)), getDoc(doc(db, 'seeker_private', me.uid))]);
      profile = snap.exists() ? snap.data() : null;
      priv = psnap.exists() ? psnap.data() : null;
      loadedFor = me.uid;
      await migrateLegacy();
      try { localStorage.setItem(HAS_KEY, JSON.stringify({ uid: me.uid, has: !!profile })); } catch (_) {}
      try { if (profile && profile.suburbs && profile.suburbs[0] && window.koausGeo) window.koausGeo.saveProfileCenter(profile.suburbs[0]); } catch (_) {}
    } catch (e) {
      console.warn('[seeker-profile] 조회 실패', e);
      profile = null; priv = null; loadedFor = null;
    }
    return profile;
  }

  // 10-18 이전 단일 문서 → 공개/비공개 두 문서로 옮기기 (본인이 '내 프로필'을 열 때 1회, 조용히)
  //   순서: 비공개 문서 먼저 쓰고(유실 방지) → 공개 문서에서 옛 칸 제거 + nick 추가. 실패해도 다음 방문에 재시도.
  async function migrateLegacy() {
    if (!profile || !me || !db) return;
    const hasLegacy = LEGACY_KEYS.some(k => k in profile) || !profile.nick;
    if (!hasLegacy) return;
    try {
      const nick = await getNick();
      const pv = {};
      if (profile.residency) pv.residency = profile.residency;
      if (typeof profile.smoker === 'boolean') pv.smoker = profile.smoker;
      if (typeof profile.pet === 'boolean') pv.pet = profile.pet;
      if (profile.intro) pv.intro = String(profile.intro).slice(0, 300);
      if (profile.alerts && typeof profile.alerts === 'object') pv.alerts = profile.alerts;
      else if (!priv || !priv.alerts) pv.alerts = { enabled: true, mode: 'threshold5', email: (me.email || '').slice(0, 120) };
      if (Object.keys(pv).length) {
        pv.updatedAt = serverTimestamp();
        await setDoc(doc(db, 'seeker_private', me.uid), pv, { merge: true });
      }
      const pub = { nick: nick || '회원', lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() };
      LEGACY_KEYS.forEach(k => { if (k in profile) pub[k] = deleteField(); });
      await updateDoc(doc(db, 'seeker_profiles', me.uid), pub);
      const [snap, psnap] = await Promise.all([getDoc(doc(db, 'seeker_profiles', me.uid)), getDoc(doc(db, 'seeker_private', me.uid))]);
      profile = snap.exists() ? snap.data() : null;
      priv = psnap.exists() ? psnap.data() : null;
    } catch (e) { console.warn('[seeker-profile] 공개/비공개 분리 이전 실패(다음에 재시도)', e); }
  }

  // 탭 진입 시 하루 1회 lastActiveAt 갱신(30일 일시정지 기준) — 조용히, 실패해도 무시
  async function touchActive() {
    if (!me || !db || !profile) return;
    try {
      const last = profile.lastActiveAt && typeof profile.lastActiveAt.toMillis === 'function' ? profile.lastActiveAt.toMillis() : 0;
      if (Date.now() - last < 86400000) return;
      await updateDoc(doc(db, 'seeker_profiles', me.uid), { lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } catch (_) {}
  }

  // ── 카드 렌더 ──
  const tsLabel = ts => {
    try {
      const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
      if (!ms) return '';
      const d = Math.floor((Date.now() - ms) / 86400000);
      return d <= 0 ? '오늘' : d + '일 전';
    } catch (_) { return ''; }
  };
  const regionKo = name => { try { const r = (window.koausGeo && window.koausGeo.REGIONS || []).find(z => z.name === name); return r ? r.ko : name; } catch (_) { return name; } };
  const suburbLabel = s => (s && (s.km || s.all)) ? (esc(s.name) + ' 전체' + (s.km ? ' <span class="ksp-dim">' + esc(s.km) + 'km</span>' : '')) : (esc(s.name) + ' ' + esc(String(s.state || '').toUpperCase()));

  async function refreshPanel() {
    if (!panelEl) return;
    injectCss();
    if (!me) { panelEl.innerHTML = '<div class="post-empty">로그인 후 이용할 수 있습니다.</div>'; return; }
    if (!E()) { panelEl.innerHTML = '<div class="post-empty">불러오는 중…</div>'; return; }
    if (loadedFor !== me.uid) panelEl.innerHTML = '<div class="post-empty">불러오는 중…</div>';
    await loadProfile(false);
    if (!panelEl) return;
    // 11-08g(사용자): Living · Job 카드를 아래로 쌓지 않고 [Living | Job] 토글로 하나씩(환경설정 시트와 같은 모양). 마지막 선택 기억.
    //   순서: 토글 → 고른 쪽 카드 → '내 역할'(둘 다에 해당, 자주 안 바꾸니 맨 아래)
    const pane = currentPane();
    panelEl.innerHTML = '<div class="ksp-seg" role="tablist" aria-label="Living 또는 Job"><button type="button" role="tab" data-ksp-pane="living" aria-selected="' + (pane !== 'job') + '">Living</button><button type="button" role="tab" data-ksp-pane="job" aria-selected="' + (pane === 'job') + '">Job</button></div>'
      + '<div id="kspLivingPane"' + (pane === 'job' ? ' hidden' : '') + '>' + renderSeekerCard(profile) + '</div>'
      + '<div id="kjpHost"' + (pane === 'job' ? '' : ' hidden') + '></div>'   // kjpHost: 일 구해요 카드 자리(koaus-job-profile.js)
      + '<div id="kspRoles"></div>';
    try { if (window.koausRole && window.koausRole.renderSwitcher) window.koausRole.renderSwitcher(document.getElementById('kspRoles')); } catch (_) {}
    panelEl.querySelectorAll('[data-ksp-pane]').forEach(b => b.addEventListener('click', () => showPane(b.dataset.kspPane)));
    wireCard();
    touchActive();
    try { document.dispatchEvent(new CustomEvent('koaus:seeker-panel-rendered', { detail: { panel: panelEl, host: document.getElementById('kjpHost') } })); } catch (_) {}
  }

  // ── [Living | Job] 토글(11-08g) — LS 기억 + ?pane=job 딥링크. Job 모듈이 모달을 열 때도 showPane('job') ──
  const PANE_KEY = 'koaus-mypage-pane-v1';
  function currentPane() {
    try { const u = new URLSearchParams(location.search).get('pane'); if (u === 'job' || u === 'living') return u; } catch (_) {}
    try { return localStorage.getItem(PANE_KEY) === 'job' ? 'job' : 'living'; } catch (_) { return 'living'; }
  }
  function showPane(which) {
    which = which === 'job' ? 'job' : 'living';
    try { localStorage.setItem(PANE_KEY, which); } catch (_) {}
    if (!panelEl) return;
    const lp = document.getElementById('kspLivingPane'), jh = document.getElementById('kjpHost');
    if (lp) lp.hidden = which === 'job';
    if (jh) jh.hidden = which !== 'job';
    panelEl.querySelectorAll('[data-ksp-pane]').forEach(b => b.setAttribute('aria-selected', b.dataset.kspPane === which ? 'true' : 'false'));
  }

  // ── 프로필 완성도(10-20, 틴더 식) — 필수 3단계(동네·예산·입주)=70%, 선택 3묶음 각 +10%(11-04: 소개글 제외) ──
  const TODO = [
    { label: '방 종류 · 욕실',        step: 4, done: (p) => !!((p.roomTypes && p.roomTypes.length) || p.bathroom === 'private') },
    { label: '나이대 · 성별',         step: 5, done: (p) => !!(p.ageBand && p.gender) },
    { label: '신분 · 흡연 · 반려동물', step: 5, done: (p, q) => !!(q && (q.residency || typeof q.smoker === 'boolean' || typeof q.pet === 'boolean')) },
  ];
  function completeness(p, q) {
    const todo = TODO.filter(t => !t.done(p, q));
    return { pct: 100 - todo.length * 10, todo };
  }
  const moveInLabel = s => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00'), today = new Date(); today.setHours(0, 0, 0, 0);
    return (isNaN(d) || d <= today) ? '최대한 빨리' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일부터';
  };
  const budgetLabel = (min, max) => {
    const a = min != null && min !== '' ? Number(min) : null, b = max != null && max !== '' ? Number(max) : null;
    if (b == null && a == null) return '';
    if (b == null) return '주 $' + a + ' 이상';
    return a ? '주 $' + a + ' ~ $' + b : '주 $' + b + '까지';
  };
  // 집주인이 보는 한 문장(koaus-seekers-nearby.js conditionSentence 와 같은 형태)
  function sentenceOf(d, en) {
    const subs = (d.suburbs || []).map(x => (x.km || x.all) ? x.name + ' 전체' : x.name).filter(Boolean).slice(0, 3).join(' · ');
    const when = moveInLabel(d.moveIn);
    const stay = d.stay === 'tbd' ? '기간은 상의 후 결정' : (en.label('stays', d.stay) || '');
    const budget = budgetLabel(d.budgetMin, d.budgetMax);
    const parts = [];
    if (subs) parts.push(subs + '에서');
    if (when) parts.push(when);
    if (stay) parts.push(stay);
    if (budget) parts.push(budget);
    return parts.length ? parts.join(', ').replace(/에서, /, '에서 ') + ' 방을 찾습니다.' : '조건을 등록한 분입니다.';
  }

  function renderSeekerCard(p) {
    if (!p) {
      return `
        <div class="ksp-card" data-ksp-card="seeker">
          <div class="ksp-title" style="font-size:17px;">프로필을 활성화해 더욱 편리하게 구해 보십시오.</div>
          <div class="ksp-sub">내 조건을 활성화하세요.</div>
          <div class="ksp-prof-btns" style="grid-template-columns:1fr;">
            <button type="button" class="ksp-btn primary" data-ksp="create">Living 프로필 만들기</button>
            <button type="button" class="ksp-btn" data-ksp="job">Job 프로필 만들기</button>
          </div>
        </div>`;
    }
    const paused = !!p.pausedAt;
    const found = p.status === 'found';
    const vis = p.visible === true;
    const en = E();
    const q = priv || {};
    const subs = (p.suburbs || []).map(suburbLabel).join(' · ');
    const budget = budgetLabel(p.budgetMin, p.budgetMax);
    const stayL = p.stay === 'tbd' ? '상의 후 결정' : (en.label('stays', p.stay) || '');
    const rooms = (p.roomTypes || []).map(c => en.label('roomTypes', c)).filter(Boolean).join(', ');
    const al = q.alerts || null;
    const alertMode = (al && al.mode) || 'off';
    const alertL = { instant: '새 매물마다', threshold5: '5건 이상 모이면', daily: '하루 한 번', off: '받지 않음' }[alertMode] || '받지 않음';
    const meta = [p.gender ? en.label('genders', p.gender) : '', p.ageBand ? en.label('ageBands', p.ageBand) : ''].filter(Boolean).join(' · ');
    const stateChip = found ? '구했습니다' : (paused ? '일시정지' : (vis ? '공개 중' : '비공개'));
    const c = completeness(p, q);
    const privL = [
      q.residency ? en.label('statuses', q.residency) : '',
      typeof q.smoker === 'boolean' ? (q.smoker ? '흡연' : '비흡연') : '',
      typeof q.pet === 'boolean' ? (q.pet ? '반려동물 있음' : '반려동물 없음') : '',
    ].filter(Boolean).join(' · ');
    const row = (k, v, step, own) => `
          <div class="ksp-prow">
            <div class="ksp-prow-main"><div class="ksp-prow-k">${k}${own ? '<span class="ksp-own">본인만</span>' : ''}</div><div class="ksp-prow-v${v ? '' : ' empty'}">${v || '미등록'}</div></div>
            <button type="button" class="ksp-link" data-ksp="step" data-step="${step}">편집</button>
          </div>`;
    return `
      <div class="ksp-card ksp-prof" data-ksp-card="seeker">
        <div class="ksp-prof-head">
          <div class="ksp-prof-nick"><span>${esc(p.nick || '회원')}</span><a class="ksp-link" href="settings.html">닉네임 변경</a></div>
          <div class="ksp-prof-meta">${meta ? esc(meta) : '나이대·성별 미등록'}</div>
          <div class="ksp-row" style="margin-top:4px;">
            <span class="ksp-chip ${(!found && !paused && vis) ? 'on' : ''}">${stateChip}</span>
            <span class="ksp-chip">${esc(tsLabel(p.updatedAt) || '')} 수정</span>
          </div>
        </div>
        <div class="ksp-prof-btns">
          <button type="button" class="ksp-btn" data-ksp="edit">프로필 편집</button>
          <button type="button" class="ksp-btn" data-ksp="preview">집주인이 보는 카드</button>
        </div>
        ${paused ? `<div class="ksp-banner"><span>30일 동안 활동이 없어 일시정지되었습니다. 계속 구하고 계시면 다시 켜 주십시오.</span><button type="button" class="ksp-btn small primary" data-ksp="resume">다시 켜기</button></div>` : ''}
        <label class="ksp-switch ksp-prof-switch"><span class="ksp-switch-txt"><span>${(vis && !paused && !found) ? '조건 활성화 · 알림 활성화' : '조건 비활성화 · 알림 비활성화'}</span>${found ? '<small>구했습니다 상태에서는 공개되지 않습니다</small>' : ''}</span><input type="checkbox" data-ksp="visible" ${vis && !paused ? 'checked' : ''} ${found ? 'disabled' : ''}></label>
        ${c.todo.length ? `
        <div class="ksp-complete">
          <div class="ksp-complete-head"><b>프로필 완성하기</b><span>${c.pct}%</span></div>
          <div class="ksp-bar"><i style="width:${c.pct}%"></i></div>
          <div class="ksp-todo">${c.todo.map(t => `<button type="button" class="ksp-todo-card" data-ksp="step" data-step="${t.step}"><span class="ksp-todo-pct">+10%</span><span class="ksp-todo-label">${esc(t.label)}</span><span class="ksp-todo-add">추가하기</span></button>`).join('')}</div>
        </div>` : `
        <div class="ksp-complete"><div class="ksp-complete-head"><b>프로필 100% 완성</b><span>100%</span></div><div class="ksp-bar"><i style="width:100%"></i></div></div>`}
        <div class="ksp-sec">
          <div class="ksp-sec-title"><span>내 조건</span><span>집주인에게 보입니다</span></div>
          ${row('동네 · 반경', subs ? subs + (p.radiusKm && (p.suburbs || []).some(x => !(x.km || x.all)) ? ' · 반경 ' + esc(p.radiusKm) + 'km' : '') : '', 1)}
          ${row('주당 예산', esc(budget), 2)}
          ${row('입주 · 거주 기간', [esc(moveInLabel(p.moveIn)), esc(stayL)].filter(Boolean).join(' · '), 3)}
          ${row('방 종류 · 욕실', [esc(rooms), p.bathroom === 'private' ? '개인 욕실' : ''].filter(Boolean).join(' · '), 4)}
          ${row('나이대 · 성별', esc(meta), 5)}
        </div>
        <div class="ksp-sec">
          <div class="ksp-sec-title"><span>본인만 보는 정보</span><span>집주인에게 보이지 않습니다</span></div>
          ${row('신분 · 흡연 · 반려동물', esc(privL), 5, true)}
          ${row('새 매물 알림', esc(alertL) + (al && al.email ? ' · ' + esc(al.email) : ''), 6, true)}
        </div>
        <div class="ksp-prof-foot">
          <button type="button" class="ksp-btn" data-ksp="status">${found ? '다시 구합니다' : '구했습니다'}</button>
          <button type="button" class="ksp-btn danger" data-ksp="delete">프로필 삭제</button>
        </div>
      </div>`;
  }

  function rerenderCard() {
    if (!panelEl) return;
    const old = $('[data-ksp-card="seeker"]', panelEl);
    if (old) { old.outerHTML = renderSeekerCard(profile); }
    else { (document.getElementById('kspLivingPane') || panelEl).insertAdjacentHTML('beforeend', renderSeekerCard(profile)); }
    wireCard();
  }
  function wireCard() {
    const card = $('[data-ksp-card="seeker"]', panelEl);
    if (!card) return;
    card.addEventListener('click', async e => {
      const b = e.target.closest('[data-ksp]');
      if (!b) return;
      const act = b.dataset.ksp;
      if (act === 'create') { openModal(null); return; }
      // 11-08g(사용자): 짧은 등록 1~3단계는 이미 했으니 '프로필 편집'은 4단계부터 — '뒤로'로 1~3단계도 고칠 수 있다
      if (act === 'edit') { openModal(profile, { startStep: QUICK_STEPS + 1, flow: true }); return; }
      if (act === 'step') { openModal(profile, { startStep: Number(b.dataset.step) || 1 }); return; }
      if (act === 'job') { showPane('job'); if (window.koausJobProfile && window.koausJobProfile.openQuick) window.koausJobProfile.openQuick(); else toast('Job 프로필은 곧 열립니다.'); return; }
      if (act === 'preview') { openPreview(); return; }
      if (act === 'delete') { await deleteProfile(); return; }
      if (act === 'resume') { await patch({ visible: true, pausedAt: deleteField() }, '다시 켰습니다. 근처 집주인에게 다시 보입니다.'); return; }
      if (act === 'status') {
        const found = profile && profile.status === 'found';
        if (found) await patch({ status: 'looking', visible: true }, '다시 구하는 중으로 바꿨습니다.');
        else await patch({ status: 'found', visible: false }, '축하드립니다. 프로필은 비공개로 바뀝니다.');
      }
    });
    const sw = $('[data-ksp="visible"]', card);
    if (sw) sw.addEventListener('change', async () => {
      const on = sw.checked;
      const ok = await patch(on ? { visible: true, pausedAt: deleteField() } : { visible: false }, on ? '활성화했습니다.' : '비활성화했습니다. 켜기 전까지 알림도 오지 않습니다.');
      if (!ok) sw.checked = !on;
    });
  }

  async function patch(fields, okMsg) {
    if (!me || !db) return false;
    try {
      await updateDoc(doc(db, 'seeker_profiles', me.uid), Object.assign({ lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() }, fields));
      await loadProfile(true);
      rerenderCard();
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      console.warn('[seeker-profile] 변경 실패', e);
      toast('변경하지 못했습니다. 잠시 후 다시 시도해 주십시오.');
      return false;
    }
  }

  // 프로필 삭제 — 공개·비공개 두 문서 모두(rules: 본인 delete 허용). 되돌릴 수 없으므로 확인 1회.
  async function deleteProfile() {
    if (!me || !db || !profile) return;
    if (!confirm('프로필을 삭제하시겠습니까? 조건·소개글·알림 설정이 모두 지워지고 되돌릴 수 없습니다.')) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'seeker_profiles', me.uid));
      batch.delete(doc(db, 'seeker_private', me.uid));
      await batch.commit();
      clearDraft();
      profile = null; priv = null;
      try { localStorage.setItem(HAS_KEY, JSON.stringify({ uid: me.uid, has: false })); } catch (_) {}
      rerenderCard();
      toast('프로필을 삭제했습니다.');
    } catch (e) {
      console.warn('[seeker-profile] 삭제 실패', e);
      toast('삭제하지 못했습니다. 잠시 후 다시 시도해 주십시오.');
    }
  }

  // ── 작성 모달 ──
  let ovl = null, draft = null, step = 1, editing = false, quick = false, single = false;
  let openedDay = '';   // 11-04: 모달을 연 날(YYYY-MM-DD) — 입주 희망일 최소값. 열어 둔 채 자정이 지나도 그대로, 닫았다 다시 열면 새 날짜   // single: 항목 행 '편집'/완성하기 카드로 연 수정(그 단계에서 바로 저장)
  const totalSteps = () => (quick ? QUICK_STEPS : TOTAL_STEPS);

  function blankDraft() {
    return {
      suburbs: [], radiusKm: 5, budgetMin: '0', budgetMax: '', moveIn: todayStr(), stay: '',
      roomTypes: [], bathroom: 'any',
      nick: '', ageBand: '', gender: '', residency: '', smoker: null, pet: null,
      intro: '', visible: true, alertMode: 'threshold5', alertEmail: (me && me.email) || '',
    };
  }
  function fromProfile(p) {
    const d = blankDraft();
    d.suburbs = (p.suburbs || []).slice(0, MAX_SUBURBS).map(s => ({ name: s.name, state: s.state, postcode: s.postcode || '', lat: s.lat, lng: s.lng, km: s.km || 0, all: !!s.all }));
    d.radiusKm = RADII.includes(Number(p.radiusKm)) ? Number(p.radiusKm) : 5;
    d.budgetMin = p.budgetMin != null ? String(p.budgetMin) : '0';
    d.budgetMax = p.budgetMax != null ? String(p.budgetMax) : '';
    d.moveIn = p.moveIn || todayStr(); d.stay = p.stay || '';
    d.roomTypes = (p.roomTypes || []).slice(); d.bathroom = p.bathroom || 'any';
    const q = priv || {};
    d.nick = p.nick || ''; d.ageBand = p.ageBand || ''; d.gender = p.gender || ''; d.residency = q.residency || '';
    d.smoker = typeof q.smoker === 'boolean' ? q.smoker : null; d.pet = typeof q.pet === 'boolean' ? q.pet : null;
    d.intro = q.intro || ''; d.visible = p.visible !== false;
    d.alertMode = (q.alerts && q.alerts.mode) || 'threshold5';
    d.alertEmail = (q.alerts && q.alerts.email) || (me && me.email) || '';
    return d;
  }
  function loadDraft() {
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (raw && raw.uid === (me && me.uid) && raw.draft) return { draft: Object.assign(blankDraft(), raw.draft), step: Math.min(Math.max(1, raw.step || 1), totalSteps()) };
    } catch (_) {}
    return null;
  }
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ uid: me && me.uid, draft, step })); } catch (_) {} }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

  function mountModal() {
    injectCss();   // accom/rent(패널 없이 모달만 여는 페이지)에서도 스타일 보장 — 10-19 버그 수정('내 조건 등록' 눌러도 안 보이던 원인)
    if (ovl) return;
    ovl = document.createElement('div');
    ovl.className = 'ksp-ovl';
    ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true');
    ovl.innerHTML = `
      <div class="ksp-modal">
        <div class="ksp-mhead">
          <button type="button" class="ksp-btn small" data-ksp-nav="back">뒤로</button>
          <span class="ksp-step" id="kspStepLabel"></span>
          <button type="button" class="ksp-btn small" data-ksp-nav="close">닫기</button>
        </div>
        <div class="ksp-prog"><i id="kspProg" style="width:0"></i></div>
        <div class="ksp-mbody" id="kspBody"></div>
        <div class="ksp-mfoot" id="kspFoot"></div>
      </div>`;
    document.body.appendChild(ovl);
    ovl.addEventListener('click', e => {
      const nav = e.target.closest('[data-ksp-nav]');
      if (!nav) { if (e.target === ovl && !locked()) closeModal(); return; }
      if (nav.dataset.kspNav === 'close') { if (!locked()) closeModal(); }
      if (nav.dataset.kspNav === 'more') { const p = profile; closeModal(); setTimeout(() => openModal(p, { startStep: 4, flow: true }), 60); }
      if (nav.dataset.kspNav === 'back') { if (step > 1) { collect(); step--; renderStep(); } else if (!locked()) closeModal(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovl.classList.contains('open') && !locked()) closeModal(); });
  }
  // 짧은 등록(11-04b): 끝 화면 전까지는 닫을 수 없다 — 역할 고르면 무조건 하고 넘어가게(사용자 결정). 새로고침해도 임시저장(draft)으로 이어진다.
  let unlocked = false;   // 저장 실패로 잠금을 푼 상태
  function locked() { return quick && !unlocked && step <= totalSteps(); }

  function openModal(existing, opts) {
    if (!me) { if (window.koausAuth && window.koausAuth.openAuthModal) window.koausAuth.openAuthModal(); return; }
    // 글쓰기와 같은 본인 확인 게이트(휴대폰 인증) — 통과 못 하면 인증 모달이 뜨고, 인증 후 다시 열림
    if (window.koausRequireCanPost && !window.koausRequireCanPost(me, window.koausAuth && window.koausAuth.openAuthModal, () => openModal(existing, opts))) return;
    if (!E()) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    mountModal();
    editing = !!existing;
    quick = !!(opts && opts.quick) && !existing; unlocked = false;
    single = !!(existing && opts && opts.startStep && !opts.flow);   // flow: 4단계부터 끝까지 이어서(상세 조건 추가)
    if (existing) { draft = fromProfile(existing); step = (opts && opts.startStep) ? Math.min(Math.max(1, opts.startStep), TOTAL_STEPS) : 1; }
    else {
      const saved = loadDraft();
      draft = saved ? saved.draft : blankDraft();
      step = saved ? Math.min(saved.step, totalSteps()) : 1;
    }
    openedDay = todayStr();
    if (!draft.moveIn || draft.moveIn < openedDay) draft.moveIn = openedDay;   // 임시저장에 남은 지난 날짜는 오늘로
    ovl.classList.toggle('quick', quick);
    ovl.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderStep();
    if (!draft.nick) getNick().then(n => { if (draft) draft.nick = n; });
  }
  function closeModal() {
    if (!ovl) return;
    if (step <= totalSteps() && !editing) { try { collect(); } catch (_) {} saveDraft(); }
    ovl.classList.remove('open');
    document.body.style.overflow = '';
  }
  // 집주인이 보는 카드 그대로(공개 칸만) — 내 프로필 '집주인이 보는 카드' 버튼
  function openPreview() {
    if (!profile || !E()) return;
    mountModal();
    draft = fromProfile(profile); editing = true; quick = false; single = false; step = TOTAL_STEPS + 1;   // 끝 화면 취급(닫을 때 임시저장 안 함)
    ovl.classList.remove('quick'); ovl.classList.add('open', 'done');
    document.body.style.overflow = 'hidden';
    $('#kspStepLabel', ovl).textContent = '집주인이 보는 카드';
    $('#kspProg', ovl).style.width = '100%';
    $('[data-ksp-nav="back"]', ovl).style.visibility = 'hidden'; $('[data-ksp-nav="close"]', ovl).style.visibility = 'visible';
    $('#kspBody', ovl).innerHTML = '<div class="ksp-help">근처에 집을 올리시는 분께 내 조건이 이렇게 보입니다. 닉네임·성별·나이대와 조건만 보이고 이메일·소개글·신분은 보이지 않습니다. 연락은 채팅으로만 옵니다.</div>' + previewCardHtml();
    $('#kspFoot', ovl).innerHTML = '';
  }

  // 현재 화면의 입력값을 draft 에 반영
  function collect() {
    const body = $('#kspBody', ovl);
    if (!body) return;
    const v = id => { const el = $('#' + id, body); return el ? el.value : undefined; };
    switch (step) {
      case 2: draft.budgetMin = v('kspBudgetMin') || ''; draft.budgetMax = v('kspBudgetMax') || ''; break;
      case 3: draft.moveIn = v('kspMoveIn') || draft.moveIn; break;
      case 6: draft.alertEmail = (v('kspAlertEmail') || '').trim(); break;
    }
  }

  const chipsHtml = (name, items, selected, multi) => `<div class="ksp-chips" data-chips="${name}" data-multi="${multi ? 1 : 0}">` +
    items.map(it => `<button type="button" class="ksp-opt" data-val="${esc(it.code)}" aria-pressed="${(multi ? selected.indexOf(it.code) !== -1 : selected === it.code) ? 'true' : 'false'}">${esc(it.label)}</button>`).join('') + '</div>';
  const boolChips = (name, val) => chipsHtml(name, [{ code: 'no', label: '아니오' }, { code: 'yes', label: '예' }], val === true ? 'yes' : (val === false ? 'no' : ''), false);

  // 집주인에게 보이는 그대로의 미리보기(공개 칸만) — 짧은 등록 마지막 단계·전체 등록 7단계 상단
  function previewCardHtml() {
    const en = E();
    const nick = draft.nick || '닉네임';
    const tags = [];
    if (draft.gender) tags.push(en.label('genders', draft.gender));
    if (draft.ageBand) tags.push(en.label('ageBands', draft.ageBand));
    const subs = draft.suburbs.map(suburbLabel).join(' · ');
    const budget = budgetLabel(draft.budgetMin, draft.budgetMax);
    const stayL = draft.stay === 'tbd' ? '상의 후 결정' : (en.label('stays', draft.stay) || '');
    const rooms = (draft.roomTypes || []).map(c => en.label('roomTypes', c)).filter(Boolean).join(', ');
    return `
      <div class="ksp-preview">
        <div class="ksp-preview-top"><div><div class="ksp-preview-name">${esc(nick)}</div><div class="ksp-preview-meta">${tags.length ? esc(tags.join(' · ')) : '오늘 활동'}</div></div></div>
        <div class="ksp-preview-sent">${esc(sentenceOf(draft, en))}</div>
        <dl class="ksp-summary">
          <dt>동네</dt><dd>${subs || '—'}${draft.radiusKm && draft.suburbs.some(x => !(x.km || x.all)) ? ' · 반경 ' + esc(draft.radiusKm) + 'km' : ''}</dd>
          <dt>예산</dt><dd>${esc(budget || '—')}</dd>
          <dt>입주</dt><dd>${esc(moveInLabel(draft.moveIn) || '—')}${stayL ? ' · ' + esc(stayL) : ''}</dd>
          <dt>방</dt><dd>${esc(rooms || '상관없음')}${draft.bathroom === 'private' ? ' · 개인 욕실' : ''}</dd>
        </dl>
      </div>`;
  }

  function renderStep() {
    const en = E();
    const body = $('#kspBody', ovl), foot = $('#kspFoot', ovl);
    const TS = totalSteps();
    $('#kspStepLabel', ovl).textContent = step <= TS ? (single ? '프로필 수정' : (step + ' / ' + TS + (quick ? ' · 짧은 등록' : ''))) : '';
    $('#kspProg', ovl).style.width = Math.min(100, Math.round((step - 1) / TS * 100)) + '%';
    ovl.classList.toggle('done', step > TS);   // 끝 화면: 진행 막대·아래 닫기 버튼 없음(머리의 닫기만)
    $('[data-ksp-nav="back"]', ovl).style.visibility = step > 1 && step <= TS ? 'visible' : 'hidden';
    $('[data-ksp-nav="close"]', ovl).style.visibility = (quick && !unlocked && step <= TS) ? 'hidden' : 'visible';   // 짧은 등록은 끝까지(11-04b)
    let html = '', next = '다음';
    // 끝 화면은 step = TS+1 — 짧은 등록(TS=3)은 4가 '방 종류' 단계와 겹치므로 0으로 보내 default(끝 화면)로 (10-20 버그 수정)
    switch (step > TS ? 0 : step) {
      case 1:
        html = `
          <div class="ksp-q">찾으시는 동네 <span class="req">(필수, 최대 ${MAX_SUBURBS}곳)</span></div>
          <input class="ksp-input" id="kspSuburbQ" type="text" placeholder="동네 이름이나 우편번호 — 예: Sunnybank, 4109" autocomplete="off" inputmode="search">
          <ul class="ksp-sug" id="kspSuburbSug"></ul>
          <div class="ksp-sel" id="kspSuburbSel"></div>
          <div class="ksp-label">크게 고르기</div>
          ${regionChipsHtml()}
          <div class="ksp-label">동네 기준 반경 <span class="req">(필수)</span></div>
          <div class="ksp-help">고른 동네에서 이 거리 안에 방을 올린 집주인에게 보입니다.</div>
          ${chipsHtml('radiusKm', RADII.map(r => ({ code: String(r), label: r + 'km' })), String(draft.radiusKm || 5), false)}
          <div class="ksp-err" id="kspErr1"></div>`;
        break;
      case 2:
        html = `
          <div class="ksp-q">주당 예산 설정</div>
          <div class="ksp-help">빌 포함 기준으로 적어 주십시오. 집주인 방 가격이 이 범위에 들어오면 추천됩니다.</div>
          <div class="ksp-label">주당 예산(AUD) <span class="req">(필수)</span></div>
          <div class="ksp-budget">
            <input class="ksp-input" id="kspBudgetMin" type="number" inputmode="numeric" min="0" max="3000" step="10" placeholder="최소" value="${esc(draft.budgetMin)}">
            <span>~</span>
            <input class="ksp-input" id="kspBudgetMax" type="number" inputmode="numeric" min="0" max="3000" step="10" placeholder="최대" value="${esc(draft.budgetMax)}">
          </div>
          <div class="ksp-err" id="kspErr2"></div>`;
        break;
      case 3:
        html = `
          <div class="ksp-q">입주 희망일과 거주 기간</div>
          <div class="ksp-label">입주 희망일 <span class="req">(필수)</span></div>
          <input class="ksp-input" id="kspMoveIn" type="date" value="${esc(draft.moveIn < openedDay ? openedDay : draft.moveIn)}" min="${openedDay}">
          <div class="ksp-chips"><button type="button" class="ksp-opt" data-asap>최대한 빨리</button></div>
          <div class="ksp-label">거주 기간 <span class="req">(필수)</span></div>
          ${chipsHtml('stay', en.stays, draft.stay, false)}
          ${quick ? '<div class="ksp-help">등록하면 바로 프로필이 만들어집니다. 나이대·방 종류 같은 나머지는 추후 프로필 설정에서 변경·추가할 수 있습니다.</div>' : ''}
          <div class="ksp-err" id="kspErr3"></div>`;
        if (quick) next = '등록';
        break;
      case 4:
        html = `
          <div class="ksp-q">어떤 방을 찾으십니까?</div>
          <div class="ksp-help">고르지 않으면 상관없음으로 저장됩니다.</div>
          <div class="ksp-label">방 종류 <span class="req">(선택, 여러 개)</span></div>
          ${chipsHtml('roomTypes', [{ code: 'any', label: '상관없음' }].concat(en.roomTypes), draft.roomTypes.length ? draft.roomTypes : ['any'], true)}
          <div class="ksp-label">욕실 <span class="req">(선택)</span></div>
          ${chipsHtml('bathroom', [{ code: 'any', label: '상관없음' }, { code: 'private', label: '개인 욕실' }], draft.bathroom, false)}`;
        break;
      case 5:
        html = `
          <div class="ksp-q">본인에 대해 알려 주십시오.</div>
          <div class="ksp-label">나이대 <span class="req">(선택)</span></div>
          ${chipsHtml('ageBand', en.ageBands, draft.ageBand, false)}
          <div class="ksp-label">성별 <span class="req">(선택)</span></div>
          ${chipsHtml('gender', en.genders, draft.gender, false)}
          <div class="ksp-label">신분 <span class="req">(선택 · 본인만)</span></div>
          ${chipsHtml('residency', en.statuses, draft.residency, false)}
          <div class="ksp-label">흡연 <span class="req">(선택 · 본인만)</span></div>
          ${boolChips('smoker', draft.smoker)}
          <div class="ksp-label">반려동물 <span class="req">(선택 · 본인만)</span></div>
          ${boolChips('pet', draft.pet)}
          <div class="ksp-err" id="kspErr5"></div>`;
        break;
      case 6:
        html = `
          <div class="ksp-q">공개와 알림을 정해 주십시오.</div>
          <div class="ksp-help">근처에 집을 올리시는 분께 간단한 내 조건이 이렇게 보입니다.</div>
          ${previewCardHtml()}
          <label class="ksp-switch"><input type="checkbox" id="kspVisible" ${draft.visible ? 'checked' : ''}> 내 조건 활성화 (근처 집주인에게 공개)</label>
          <div class="ksp-help">비활성화 시 알림도 비활성화됩니다.</div>
          <div class="ksp-label">새 매물 알림 <span class="req">(필수)</span></div>
          ${chipsHtml('alertMode', [{ code: 'instant', label: '새 매물마다' }, { code: 'threshold5', label: '5건 이상 모이면' }, { code: 'daily', label: '하루 한 번' }, { code: 'off', label: '받지 않음' }], draft.alertMode, false)}
          <div class="ksp-label">알림 받을 이메일 <span class="req">(필수)</span></div>
          <input class="ksp-input" id="kspAlertEmail" type="email" maxlength="120" value="${esc(draft.alertEmail)}" placeholder="로그인 이메일">
          <div class="ksp-help">로그인 이메일이 기본입니다. 자주 쓰는 다른 주소로 바꿀 수 있습니다. 이메일은 집주인에게 보이지 않습니다.</div>
          <div class="ksp-err" id="kspErr6"></div>`;
        next = editing ? '저장' : '완료';
        break;
      default: {
        const st = draft.suburbs[0] && draft.suburbs[0].state;
        if (quick && !editing) {
          const on = !!(profile && profile.visible !== false);
          html = `
          <div class="ksp-done">
            <div class="ksp-q">프로필이 만들어졌습니다.</div>
            <div class="ksp-help">근처에 집을 올리시는 분께 내 조건이 이렇게 보입니다. 닉네임과 조건만 보이고 이메일·소개글은 보이지 않습니다. 연락은 채팅으로만 옵니다.</div>
            ${previewCardHtml()}
            <label class="ksp-switch ksp-prof-switch"><span class="ksp-switch-txt"><span>${on ? '조건 활성화 · 알림 활성화' : '조건 비활성화 · 알림 비활성화'}</span></span><input type="checkbox" id="kspVisibleDone" ${on ? 'checked' : ''}></label>
            <div class="ksp-help">추후 프로필 설정에서 변경 가능합니다. 새 매물 알림은 프로필이 켜져 있을 때만 로그인 이메일로, 5건 이상 모이면 보냅니다.</div>
            <div class="ksp-done-actions">
              <a class="ksp-btn primary" href="accom.html${st ? '?state=' + esc(st) : ''}">조건에 맞는 방 보러 가기</a>
              <button type="button" class="ksp-btn" data-ksp-nav="more">프로필 더 채우기</button>
            </div>
          </div>`;
          next = '';
          break;
        }
        const on = !!(profile && profile.visible !== false);
        html = `
          <div class="ksp-done">
            <div class="ksp-q">${editing ? '저장했습니다.' : '프로필을 만들었습니다.'}</div>
            <div class="ksp-help">${on ? '희망 동네 근처에 방을 올린 집주인에게 내 조건이 이렇게 보입니다.' : '지금은 꺼져 있어 집주인에게 보이지 않고 알림도 오지 않습니다.'} 연락이 오면 채팅 탭에 표시됩니다.</div>
            ${previewCardHtml()}
            <label class="ksp-switch ksp-prof-switch"><span class="ksp-switch-txt"><span>${on ? '조건 활성화 · 알림 활성화' : '조건 비활성화 · 알림 비활성화'}</span></span><input type="checkbox" id="kspVisibleDone" ${on ? 'checked' : ''}></label>
            <div class="ksp-done-actions">
              <a class="ksp-btn primary" href="accom.html${st ? '?state=' + esc(st) : ''}">조건에 맞는 방 보러 가기</a>
            </div>
          </div>`;
        next = '';
      }
    }
    if (single && step <= TS) next = '저장';
    body.innerHTML = html;
    const doneSw = $('#kspVisibleDone', body);
    if (doneSw) doneSw.addEventListener('change', async () => {
      const on = doneSw.checked;
      try {
        await updateDoc(doc(db, 'seeker_profiles', me.uid), { visible: on, lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await loadProfile(true); if (panelEl) rerenderCard();
        try { const sm = doneSw.closest('.ksp-switch').querySelector('.ksp-switch-txt > span'); if (sm) sm.textContent = on ? '조건 활성화 · 알림 활성화' : '조건 비활성화 · 알림 비활성화'; } catch (_) {}
        toast(on ? '활성화했습니다. 근처 집주인에게 보입니다.' : '비활성화했습니다. 켜기 전까지 알림도 오지 않습니다.');
      } catch (e) { doneSw.checked = !on; toast('변경하지 못했습니다. 잠시 후 다시 시도해 주십시오.'); }
    });
    foot.innerHTML = next ? `<button type="button" class="ksp-btn primary" id="kspNext">${next}</button>` : '';
    wireStep();
    const first = step === 2 ? body.querySelector('#kspBudgetMax') : body.querySelector('input:not([type=checkbox]),textarea');   // 11-04: 예산은 최대 칸부터(최소는 0 기본)
    if (first && step !== 3) { try { first.focus({ preventScroll: true }); } catch (_) {} }
  }

  function wireStep() {
    const body = $('#kspBody', ovl);
    // 칩 공통
    body.querySelectorAll('[data-chips]').forEach(group => {
      group.addEventListener('click', e => {
        const b = e.target.closest('.ksp-opt'); if (!b) return;
        const name = group.dataset.chips, multi = group.dataset.multi === '1', val = b.dataset.val;
        if (multi) {
          const arr = Array.isArray(draft[name]) ? draft[name] : [];
          if (val === 'any') {   // 11-04: '상관없음' = 전부 해제
            draft[name] = [];
            group.querySelectorAll('.ksp-opt').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
            return;
          }
          const i = arr.indexOf(val);
          if (i === -1) arr.push(val); else arr.splice(i, 1);
          draft[name] = arr;
          b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
          const anyBtn = group.querySelector('.ksp-opt[data-val="any"]'); if (anyBtn) anyBtn.setAttribute('aria-pressed', arr.length ? 'false' : 'true');
        } else {
          if (name === 'smoker' || name === 'pet') draft[name] = (val === 'yes');
          else if (name === 'radiusKm') draft.radiusKm = Number(val);
          else draft[name] = (draft[name] === val && name !== 'alertMode' && name !== 'bathroom' && name !== 'stay') ? '' : val;
          group.querySelectorAll('.ksp-opt').forEach(x => x.setAttribute('aria-pressed', x === b && (draft[name] !== '' && draft[name] !== null) ? 'true' : 'false'));
          if (draft[name] === '' || draft[name] === null) b.setAttribute('aria-pressed', 'false');
        }
      });
    });
    const next = $('#kspNext', ovl);
    if (next) next.addEventListener('click', onNext);
    if (step === 1) { wireSuburb(body); wireRegionChips(body); try { if (window.koausGeo) window.koausGeo.ready(); } catch (_) {} }
    if (step === 3) {
      const asap = $('[data-asap]', body);
      if (asap) asap.addEventListener('click', () => { $('#kspMoveIn', body).value = openedDay || todayStr(); });
    }
  }

  // ── 동네 검색(Geocoding REST, 동네 단위) ──
  let sugTimer = null, sugSeq = 0;
  function wireSuburb(body) {
    const q = $('#kspSuburbQ', body), sug = $('#kspSuburbSug', body);
    renderSuburbSel();
    const hide = () => { sug.classList.remove('show'); sug.innerHTML = ''; };
    q.addEventListener('input', () => {
      clearTimeout(sugTimer);
      const text = q.value.trim();
      if (text.length < 2) { hide(); return; }
      sugTimer = setTimeout(async () => {
        const seq = ++sugSeq;
        const hits = await geocodeSuburb(text);
        if (seq !== sugSeq) return;
        if (!hits.length) { const gs = (window.koausGeo && window.koausGeo.lastStatus) || ''; sug.innerHTML = '<li data-none>동네를 찾지 못했습니다. 동네 이름이나 우편번호로 다시 검색해 주십시오.' + (gs && !/^(OK|ZERO_RESULTS)$/.test(gs) ? ' (지도 서비스: ' + esc(gs) + ')' : '') + '</li>'; sug.classList.add('show'); return; }
        sug.innerHTML = hits.map((h, i) => `<li data-i="${i}">${suburbLabel(h)}${h.postcode ? ' ' + esc(h.postcode) : ''}</li>`).join('');
        sug.__hits = hits; sug.classList.add('show');
      }, 350);
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const li = sug.querySelector('li[data-i]'); if (li) li.click(); } if (e.key === 'Escape') hide(); });
    sug.addEventListener('click', async e => {
      const li = e.target.closest('li[data-i]'); if (!li) return;
      let h = sug.__hits && sug.__hits[Number(li.dataset.i)]; if (!h) return;
      if (draft.suburbs.length >= MAX_SUBURBS) { $('#kspErr1', body).textContent = '동네는 ' + MAX_SUBURBS + '곳까지 넣을 수 있습니다.'; hide(); return; }
      q.value = ''; hide(); $('#kspErr1', body).textContent = '';
      if (h.approx && window.koausGeo) { try { h = await window.koausGeo.refine(h); } catch (_) {} }   // 우편번호로 고른 동네 → 동네 좌표
      const item = { name: h.name, state: h.state, postcode: h.postcode || '', lat: Number(h.lat), lng: Number(h.lng) };
      if (!draft.suburbs.some(s => s.name === item.name && s.state === item.state)) draft.suburbs.push(item);
      renderSuburbSel();
    });
    document.addEventListener('click', e => { if (!e.target.closest('#kspSuburbSug') && e.target !== q) hide(); });
  }
  // 큰 지역(도시권) 칩 — koaus-geo.js REGIONS. 고르면 suburbs 에 {name,state,lat,lng,km} 로 들어가 그 지역 반경으로 매칭
  function regionChipsHtml() {
    const list = (window.koausGeo && window.koausGeo.REGIONS) || [];
    const st = (draft.suburbs[0] && draft.suburbs[0].state) || '';
    const ordered = st ? list.filter(r => r.state === st).concat(list.filter(r => r.state !== st)) : list;
    const states = (window.koausGeo && window.koausGeo.STATE_REGIONS) || [];
    const sOrdered = st ? states.filter(r => r.state === st).concat(states.filter(r => r.state !== st)) : states;
    return `<div class="ksp-chips" id="kspRegionChips">${ordered.map(r => `<button type="button" class="ksp-opt" data-region="${esc(r.code)}" aria-pressed="${draft.suburbs.some(x => x.km && x.name === r.name) ? 'true' : 'false'}">${esc(r.name)}</button>`).join('')}</div>
          <div class="ksp-label">주 전체 고르기</div>
          <select class="ksp-input ksp-select" id="kspStateSel"><option value="">고르기…</option>${sOrdered.map(r => `<option value="${esc(r.code)}">${esc(r.name)} 전체</option>`).join('')}</select>`;
  }
  function wireRegionChips(body) {
    const stSel = $('#kspStateSel', body);   // 11-08b: 주 전체는 드롭다운 — 고르면 칩으로 들어가고 드롭다운은 비운다
    if (stSel) stSel.addEventListener('change', () => {
      const it = window.koausGeo && window.koausGeo.regionItem(stSel.value); stSel.value = ''; if (!it) return;
      if (draft.suburbs.some(x => x.all && x.state === it.state)) return;
      if (draft.suburbs.length >= MAX_SUBURBS) { $('#kspErr1', body).textContent = '동네·지역은 ' + MAX_SUBURBS + '곳까지 넣을 수 있습니다.'; return; }
      draft.suburbs.push(it); $('#kspErr1', body).textContent = ''; renderSuburbSel();
    });
    body.querySelectorAll('#kspRegionChips, #kspStateChips').forEach(box => box.addEventListener('click', e => {
      const b = e.target.closest('[data-region]'); if (!b) return;
      const it = window.koausGeo && window.koausGeo.regionItem(b.dataset.region); if (!it) return;
      const i = draft.suburbs.findIndex(x => (x.km || x.all) && x.name === it.name && x.state === it.state);
      if (i !== -1) { draft.suburbs.splice(i, 1); b.setAttribute('aria-pressed', 'false'); }
      else {
        if (draft.suburbs.length >= MAX_SUBURBS) { $('#kspErr1', body).textContent = '동네·지역은 ' + MAX_SUBURBS + '곳까지 넣을 수 있습니다.'; return; }
        draft.suburbs.push(it); b.setAttribute('aria-pressed', 'true'); $('#kspErr1', body).textContent = '';
      }
      renderSuburbSel();
    }));
  }
  function renderSuburbSel() {
    const sel = $('#kspSuburbSel', ovl); if (!sel) return;
    // 11-08b(사용자 결정): 지도 첫 화면 기준 = 프로필 만들 때 첫 번째로 넣은 동네(suburbs[0], koaus-geo saveProfileCenter). 눌러서 바꾸는 기능은 뺌.
    sel.innerHTML = draft.suburbs.map((s, i) => `<span class="ksp-chip on">${suburbLabel(s)} <button type="button" data-rm="${i}" aria-label="빼기">×</button></span>`).join('');
    sel.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { draft.suburbs.splice(Number(b.dataset.rm), 1); renderSuburbSel(); try { ovl.querySelectorAll('#kspRegionChips [data-region], #kspStateChips [data-region]').forEach(c => { const it = window.koausGeo.regionItem(c.dataset.region); c.setAttribute('aria-pressed', it && draft.suburbs.some(x => (x.km || x.all) && x.name === it.name && x.state === it.state) ? 'true' : 'false'); }); } catch (_) {} }));
  }
  // 동네 검색 — koaus-geo.js(window.koausGeo) 공통: Maps JS Geocoder, 한글·영문, 우편번호(4자리)는 속한 동네 전부(11-04)
  async function geocodeSuburb(text) {
    if (!window.koausGeo) { console.warn('[seeker-profile] koaus-geo.js 가 없습니다'); return []; }
    try { return await window.koausGeo.suburbs(text); } catch (e) { console.warn('[seeker-profile] geocode 실패', e); return []; }
  }

  // ── 검증·다음 ──
  const CONTACT_RE = /([0-9][ .-]?){6,}|https?:\/\/|www\.|\.com|\.au|\.kr|카톡|카카오|kakao|인스타|insta/i;
  function validate() {
    const body = $('#kspBody', ovl);
    const err = $('#kspErr' + step, body);
    const set = m => { if (err) err.textContent = m; return !m; };
    switch (step) {
      case 1: return set(draft.suburbs.length ? '' : '동네를 한 곳 이상 골라 주십시오.');
      case 2: {
        const a = Number(draft.budgetMin), b = Number(draft.budgetMax);
        if (draft.budgetMin === '' || draft.budgetMax === '' || !Number.isFinite(a) || !Number.isFinite(b)) return set('최소·최대 예산을 둘 다 적어 주십시오.');
        if (a < 0 || b > 3000 || a > b) return set('예산 범위를 확인해 주십시오. (최소 ≤ 최대, 주 $3,000 이하)');
        return set('');
      }
      case 3:
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.moveIn)) return set('입주 희망일을 골라 주십시오.');
        if (openedDay && draft.moveIn < openedDay) return set('입주 희망일은 오늘 이후로 골라 주십시오.');
        if (!draft.stay) return set('거주 기간을 골라 주십시오.');
        return set('');
      case 5: return set('');
      case 6:
        if (!draft.alertMode) return set('알림 방식을 골라 주십시오.');
        if (draft.alertMode !== 'off' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.alertEmail)) return set('알림 받을 이메일을 확인해 주십시오.');
        if (draft.alertEmail.length > 120) return set('이메일이 너무 깁니다.');
        return set('');
    }
    return true;
  }
  async function onNext() {
    collect();
    if (step === totalSteps()) { const vis = $('#kspVisible', ovl); if (vis) draft.visible = !!vis.checked; }
    if (!validate()) return;
    if (single) { await save(); return; }
    if (step < totalSteps()) { step++; if (!editing) saveDraft(); renderStep(); return; }
    await save();
  }

  function buildDocs(nick) {
    const d = {
      suburbs: draft.suburbs.slice(0, MAX_SUBURBS).map(s => {
        const o = { name: s.name, state: s.state, lat: Number(s.lat), lng: Number(s.lng) };
        if (s.postcode) o.postcode = String(s.postcode).slice(0, 4);
        if (s.km) o.km = Math.min(60, Math.max(1, Math.round(Number(s.km))));   // 큰 지역(도시권) 반경
        if (s.all) o.all = true;   // 주 전체(11-04b)
        return o;
      }),
      states: Array.from(new Set(draft.suburbs.map(s => s.state))).slice(0, 5),
      radiusKm: RADII.includes(Number(draft.radiusKm)) ? Number(draft.radiusKm) : 5,
      budgetMin: Math.round(Number(draft.budgetMin)), budgetMax: Math.round(Number(draft.budgetMax)),
      moveIn: draft.moveIn, stay: draft.stay,
      nick: nick,
      visible: !!draft.visible,
      status: (profile && profile.status === 'found' && editing) ? 'found' : 'looking',
      step: quick ? QUICK_STEPS : TOTAL_STEPS,
      lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp(),
      createdAt: (editing && profile && profile.createdAt) ? profile.createdAt : serverTimestamp(),
    };
    if (draft.roomTypes.length) d.roomTypes = draft.roomTypes.slice(0, 5);
    if (draft.bathroom === 'private') d.bathroom = 'private';
    if (draft.ageBand) d.ageBand = draft.ageBand;
    if (draft.gender) d.gender = draft.gender;
    // 비공개 문서(본인만) — 짧은 등록은 알림 기본값(5건 모이면 · 로그인 이메일)만
    const p = {
      alerts: quick
        ? { enabled: true, mode: 'threshold5', email: String((me && me.email) || '').slice(0, 120) }
        : { enabled: draft.alertMode !== 'off', mode: draft.alertMode, email: draft.alertEmail.slice(0, 120) },
      updatedAt: serverTimestamp(),
    };
    if (!quick) {
      if (draft.residency) p.residency = draft.residency;
      if (typeof draft.smoker === 'boolean') p.smoker = draft.smoker;
      if (typeof draft.pet === 'boolean') p.pet = draft.pet;
      if (priv && priv.intro) p.intro = String(priv.intro).slice(0, 300);   // 11-04: 소개글 입력 단계 없음 — 저장된 값만 그대로 유지(숨김)
    }
    return { pub: d, priv: p };
  }
  async function save() {
    const btn = $('#kspNext', ovl); if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    try {
      let nick = draft.nick || (await getNick()) || '회원';
      if (/([0-9][ .-]?){6,}|https?:|www[.]/i.test(nick)) nick = '회원';   // 규칙이 막는 닉(숫자 6자리 이상·링크)은 '회원'으로 — 짧은 등록이 영영 막히지 않게(11-04b)
      const docs = buildDocs(nick);
      const batch = writeBatch(db);
      batch.set(doc(db, 'seeker_profiles', me.uid), docs.pub);                      // 전체 교체 — pausedAt 은 빠지므로 수정 = 다시 켜기
      batch.set(doc(db, 'seeker_private', me.uid), docs.priv, { merge: !!quick });  // 짧은 등록은 기존 비공개 칸 보존
      await batch.commit();
      clearDraft();
      try { if (window.koausGeo && docs.pub.suburbs[0]) window.koausGeo.saveProfileCenter(docs.pub.suburbs[0]); } catch (_) {}   // 지도 첫 화면 기준
      await loadProfile(true);
      if (panelEl) rerenderCard();
      step = totalSteps() + 1; renderStep();
    } catch (e) {
      console.warn('[seeker-profile] 저장 실패', e);
      const denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      const errEl = $('#kspErr' + step, ovl) || $('#kspErr6', ovl);
      if (errEl) errEl.textContent = denied ? (quick ? '저장할 수 없는 내용이 있습니다. 휴대폰 인증이 되어 있는지 확인해 주십시오. 계속 안 되면 닫고 마이페이지에서 다시 시도해 주십시오.' : '저장할 수 없는 내용이 있습니다. 자기소개에 연락처·링크가 없는지, 휴대폰 인증이 되어 있는지 확인해 주십시오.') : '저장하지 못했습니다. 잠시 후 다시 시도해 주십시오.';
      if (quick) { unlocked = true; try { $('[data-ksp-nav="close"]', ovl).style.visibility = 'visible'; } catch (_) {} }   // 짧은 등록 잠금은 저장 실패 시 풀어 준다(갇히지 않게, 11-04b)
      if (btn) { btn.disabled = false; btn.textContent = (editing || single) ? '저장' : (quick ? '등록' : '완료'); }
    }
  }

  // ── 페이지 연결 ──
  document.addEventListener('koaus:mypage-profile', e => {
    panelEl = (e.detail && e.detail.panel) || document.getElementById('mpProfilePanel');
    refreshPanel();
  });
  // ?profile=new 딥링크(accom 등 "내 조건 등록" 버튼) — 로그인 확정 후 탭이 열리면 한 번만 작성 모달
  //   (첫 이벤트는 로그인 전에 올 수 있어 once 대신 플래그로 1회 보장)
  document.addEventListener('koaus:mypage-profile', () => {
    try {
      const q = new URLSearchParams(location.search);
      const want = q.get('profile');
      if ((want === 'new' || want === 'quick') && me && !window.__kspAutoOpened) {
        window.__kspAutoOpened = true;
        loadProfile(false).then(p => openModal(p || null, { quick: want === 'quick' }));
      }
    } catch (_) {}
  });

  // accom/rent '내 조건 등록' 줄(10-20): 프로필이 이미 있으면 '상세 조건 추가'(방 종류·나이대·소개글·알림, 4단계~)로 바꿔 보인다.
  function applyEntryRow() {
    try {
      const row = document.querySelector('[data-seeker-entry]');
      if (!row || row.dataset.seekerEntry === 'owner') return;
      let hasP = !!profile;
      if (!hasP && !loadedFor) { const c = JSON.parse(localStorage.getItem(HAS_KEY) || 'null'); hasP = !!(c && me && c.uid === me.uid && c.has === true); }
      const t = row.querySelector('.kse-text'), c = row.querySelector('.kse-cta');
      if (hasP) {
        if (t) t.innerHTML = '<strong>내 조건이 등록되어 있습니다.</strong> 방 종류·나이대·소개글 같은 상세 조건을 더 채우시면 집주인에게 더 잘 보입니다.';
        if (c) c.textContent = '상세 조건 추가 ›';
        row.dataset.seekerEntry = 'more';
      } else if (row.dataset.seekerEntry === 'more') {
        if (t) t.innerHTML = '<strong>더욱 편리하게 집을 찾으세요.</strong> 프로필 설정하시면 원하시는 지역에 글이 올라올 때 이에 맞게 이메일로 알려드립니다.';
        if (c) c.textContent = '내 조건 등록 ›';
        row.dataset.seekerEntry = '';
      }
    } catch (_) {}
  }
  document.addEventListener('koaus:roles-changed', applyEntryRow);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyEntryRow); else applyEntryRow();

  window.koausSeekerProfile = {
    refresh: refreshPanel,
    open: () => openModal(profile),
    // 짧은 등록(①-2 역할 선택 뒤·accom/rent 진입 줄): 프로필이 없으면 3단계 → 바로 생성, 이미 있으면 상세 조건(4단계~끝) 흐름(10-20)
    openQuick: () => loadProfile(false).then(p => (p ? openModal(p, { startStep: QUICK_STEPS + 1, flow: true }) : openModal(null, { quick: true }))),
    openMore: () => loadProfile(false).then(p => (p ? openModal(p, { startStep: QUICK_STEPS + 1, flow: true }) : openModal(null, { quick: true }))),
    has: () => loadProfile(false).then(p => { applyEntryRow(); return !!p; }),
    showPane,   // 11-08g: 마이페이지 [Living | Job] 토글
  };
})();
