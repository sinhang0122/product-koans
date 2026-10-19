// ════════════════════════════════════════════════════════════════════
//  KoAus · 집 구해요 프로필 (seeker_profiles) — 2단계 ① (2026-10)
//  - 마이페이지 '내 프로필' 탭 전용 ES module (mypage.html 이 로드). 작성·수정은 여기서만.
//  - 흐름: 탭 열림(koaus:mypage-profile) → seeker_profiles/{uid} 1회 getDoc → 카드 렌더
//          → '만들기/수정' → 7단계 모달(한 화면 한 질문, 단계마다 기기 로컬 임시저장)
//          → 마지막 단계 '저장' 에서 setDoc 1회 (rules: 본인·hasOnly·길이캡·연락처 패턴 차단)
//  - 사진 없음(사용자 확정 — 얼굴이 선택에 영향 주면 안 됨). 실명 없음 — 사이트 닉네임 스냅샷(nick). 카드 아바타 = 닉네임 첫 글자.
//  - 공개/비공개 분리(10-18): seeker_profiles/{uid} = 카드에 보이는 조건+닉네임·성별·연령대(집주인이 읽음),
//    seeker_private/{uid} = 소개글·체류·흡연·반려동물·알림 이메일(본인만). 저장은 writeBatch 로 두 문서 한 번에.
//    옛 단일 문서(firstName·intro·alerts 가 공개 문서에 있던 10-18 이전 저장분)는 본인이 탭을 열 때 자동으로 옮긴다.
//  - 짧은 등록(quick, ①-2 역할 선택 뒤): 동네·예산·입주/기간 3단계만 묻고 저장, 단계마다 '건너뛰기'(나중에 마이페이지에서).
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
  const MAX_SUBURBS = 5;   // 10-19: 3 → 5 — 여러 동네(예: 선샤인코스트 + 골드코스트) 집주인에게 동시에 보이게. 8은 rules 표현식 한도 초과
  const TOTAL_STEPS = 7;
  const QUICK_STEPS = 4;                 // 짧은 등록: 동네 · 예산 · 입주/기간 · 미리보기+공개(활성화)
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
    if (document.getElementById('kspStyle')) return;
    const st = document.createElement('style');
    st.id = 'kspStyle';
    st.textContent = `
      .ksp-card{border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-card);padding:16px;display:flex;flex-direction:column;gap:10px}
      .ksp-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .ksp-title{font-weight:700;font-size:15px}
      .ksp-sub{font-size:13px;color:var(--text-muted);line-height:1.55}
      .ksp-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--border);background:var(--bg-surface)}
      .ksp-chip.on{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
      .ksp-chip.warn{border-color:var(--gold-border);background:var(--gold-bg);color:var(--gold-light)}
      .ksp-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .ksp-summary{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13.5px}
      .ksp-summary dt{color:var(--text-muted)}
      .ksp-summary dd{margin:0}
      .ksp-avatar{width:40px;height:40px;border-radius:50%;background:var(--accent);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex:0 0 auto}
      .ksp-btn{appearance:none;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);border-radius:var(--r-md);padding:9px 14px;font-size:14px;cursor:pointer;font-family:inherit}
      .ksp-btn.primary{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
      .ksp-btn.small{padding:6px 10px;font-size:12.5px}
      .ksp-btn:disabled{opacity:.5;cursor:default}
      .ksp-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .ksp-banner{border:1px solid var(--gold-border);background:var(--gold-bg);border-radius:var(--r-md);padding:10px 12px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .ksp-switch{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer}
      .ksp-switch input{width:38px;height:22px;appearance:none;background:var(--border);border-radius:999px;position:relative;cursor:pointer;transition:background .15s}
      .ksp-switch input:checked{background:var(--green)}
      .ksp-switch input::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
      .ksp-switch input:checked::after{left:19px}
      /* 모달 */
      .ksp-ovl{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:none;align-items:flex-end;justify-content:center}
      .ksp-ovl.open{display:flex}
      .ksp-modal{width:100%;max-width:520px;background:var(--bg-base);border-radius:var(--r-xl) var(--r-xl) 0 0;max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
      @media(min-width:640px){.ksp-ovl{align-items:center}.ksp-modal{border-radius:var(--r-xl)}}
      .ksp-mhead{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border)}
      .ksp-mhead .ksp-step{font-size:12.5px;color:var(--text-muted);flex:1}
      .ksp-prog{height:3px;background:var(--border)}
      .ksp-prog > i{display:block;height:100%;background:var(--accent);transition:width .2s}
      .ksp-mbody{padding:18px 16px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:14px}
      .ksp-q{font-size:18px;font-weight:700;line-height:1.35}
      .ksp-help{font-size:12.5px;color:var(--text-muted);line-height:1.5}
      .ksp-label{font-size:13px;color:var(--text-secondary);display:flex;gap:6px;align-items:baseline}
      .ksp-label .req{font-size:12px;color:var(--text-muted)}
      .ksp-input,.ksp-textarea{width:100%;box-sizing:border-box;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);border-radius:var(--r-md);padding:11px 12px;font-size:15px;font-family:inherit}
      .ksp-input:focus,.ksp-textarea:focus{outline:none;border-color:var(--border-focus)}
      .ksp-textarea{min-height:120px;resize:vertical}
      .ksp-chips{display:flex;flex-wrap:wrap;gap:8px}
      .ksp-opt{appearance:none;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);border-radius:999px;padding:8px 14px;font-size:14px;cursor:pointer;font-family:inherit}
      .ksp-opt[aria-pressed="true"]{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
      .ksp-mfoot{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border)}.ksp-mfoot .ksp-btn{flex:1 1 0}.ksp-mfoot .ksp-btn[data-ksp-nav=skip]{flex:0 0 auto}
      .ksp-mfoot .ksp-btn{flex:1}
      .ksp-sug{list-style:none;margin:0;padding:0;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;display:none}
      .ksp-sug.show{display:block}
      .ksp-sug li{padding:10px 12px;font-size:14px;cursor:pointer;border-top:1px solid var(--border-subtle)}
      .ksp-sug li:first-child{border-top:0}
      .ksp-sug li:hover{background:var(--bg-elevated)}
      .ksp-sel{display:flex;flex-wrap:wrap;gap:6px}
      .ksp-sel .ksp-chip button{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 0 0 2px}
      .ksp-budget{display:flex;align-items:center;gap:8px}
      .ksp-budget .ksp-input{text-align:center}
      .ksp-err{font-size:12.5px;color:var(--red)}
      .ksp-done{text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;padding:12px 0}
      .ksp-done .ksp-q{font-size:20px}
      .ksp-preview{border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-card);padding:14px;display:flex;flex-direction:column;gap:10px}
      .ksp-preview-top{display:flex;align-items:center;gap:10px}
      .ksp-preview-name{font-weight:700;font-size:15px}
      .ksp-preview-meta{font-size:12.5px;color:var(--text-muted)}
    `;
    document.head.appendChild(st);
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
  const suburbLabel = s => esc(s.name) + ' ' + esc(String(s.state || '').toUpperCase());

  async function refreshPanel() {
    if (!panelEl) return;
    injectCss();
    if (!me) { panelEl.innerHTML = '<div class="post-empty">로그인 후 이용할 수 있습니다.</div>'; return; }
    if (!E()) { panelEl.innerHTML = '<div class="post-empty">불러오는 중…</div>'; return; }
    if (loadedFor !== me.uid) panelEl.innerHTML = '<div class="post-empty">불러오는 중…</div>';
    await loadProfile(false);
    if (!panelEl) return;
    panelEl.innerHTML = '<div id="kspRoles"></div>' + renderSeekerCard(profile);
    try { if (window.koausRole && window.koausRole.renderSwitcher) window.koausRole.renderSwitcher(document.getElementById('kspRoles')); } catch (_) {}
    wireCard();
    touchActive();
  }

  function renderSeekerCard(p) {
    if (!p) {
      return `
        <div class="ksp-card" data-ksp-card="seeker">
          <div class="ksp-card-head"><div class="ksp-title">집 구해요 프로필</div></div>
          <div class="ksp-sub">원하는 동네·예산·입주일을 등록하면 그 근처에 방을 올린 집주인에게 내 조건이 보이고, 조건에 맞는 방이 올라오면 이메일로 알려드립니다. 연락은 채팅으로만 옵니다. 사진은 받지 않습니다.</div>
          <div class="ksp-actions"><button type="button" class="ksp-btn primary" data-ksp="create">프로필 만들기</button></div>
        </div>`;
    }
    const paused = !!p.pausedAt;
    const found = p.status === 'found';
    const vis = p.visible === true;
    const en = E();
    const initial = (String(p.nick || '?').trim()[0] || '?').toUpperCase();
    const subs = (p.suburbs || []).map(suburbLabel).join(' · ');
    const budget = (p.budgetMin != null || p.budgetMax != null) ? ('주 $' + (p.budgetMin != null ? p.budgetMin : '') + (p.budgetMax != null ? ' ~ $' + p.budgetMax : '')) : '—';
    const stayL = en.label('stays', p.stay);
    const rooms = (p.roomTypes || []).map(c => en.label('roomTypes', c)).filter(Boolean).join(', ');
    const al = (priv && priv.alerts) || null;
    const alertMode = (al && al.mode) || 'off';
    const alertL = { instant: '새 매물마다', threshold5: '5건 이상 모이면', daily: '하루 한 번', off: '받지 않음' }[alertMode] || '받지 않음';
    const who = [esc(p.nick || ''), p.gender ? esc(en.label('genders', p.gender)) : '', p.ageBand ? esc(en.label('ageBands', p.ageBand)) : ''].filter(Boolean).join(' · ');
    return `
      <div class="ksp-card" data-ksp-card="seeker">
        <div class="ksp-card-head">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="ksp-avatar">${esc(initial)}</div>
            <div>
              <div class="ksp-title">집 구해요 프로필</div>
              <div class="ksp-sub" style="margin:2px 0 0;">${who}</div>
              <div class="ksp-row" style="margin-top:4px;">
                <span class="ksp-chip ${found ? '' : 'on'}">${found ? '구했습니다' : '구하는 중'}</span>
                <span class="ksp-chip ${vis && !paused ? 'on' : ''}">${paused ? '일시정지' : (vis ? '공개 중' : '비공개')}</span>
                <span class="ksp-chip">${esc(tsLabel(p.updatedAt) || '')} 수정</span>
              </div>
            </div>
          </div>
        </div>
        ${paused ? `<div class="ksp-banner"><span>30일 동안 활동이 없어 일시정지되었습니다. 계속 구하고 계시면 다시 켜 주십시오.</span><button type="button" class="ksp-btn small primary" data-ksp="resume">다시 켜기</button></div>` : ''}
        <dl class="ksp-summary">
          <dt>동네</dt><dd>${subs || '—'}</dd>
          <dt>예산</dt><dd>${esc(budget)}</dd>
          <dt>입주</dt><dd>${esc(p.moveIn || '—')}${stayL ? ' · ' + esc(stayL) : ''}</dd>
          <dt>방</dt><dd>${esc(rooms || '상관없음')}${p.bathroom === 'private' ? ' · 개인 욕실' : ''}</dd>
          <dt>알림</dt><dd>${esc(alertL)}${al && al.email ? ' · ' + esc(al.email) : ''}</dd>
        </dl>
        <div class="ksp-help" style="margin-top:-4px;">집주인에게는 닉네임·성별·나이대와 위 조건만 보입니다. 소개글·신분·흡연·반려동물·이메일은 본인만 봅니다.</div>
        <div class="ksp-row" style="justify-content:space-between;">
          <label class="ksp-switch"><input type="checkbox" data-ksp="visible" ${vis && !paused ? 'checked' : ''} ${found ? 'disabled' : ''}> 근처 집주인에게 공개</label>
          <div class="ksp-actions">
            <button type="button" class="ksp-btn small" data-ksp="status">${found ? '다시 구합니다' : '구했습니다'}</button>
            <button type="button" class="ksp-btn small primary" data-ksp="edit">수정</button>
          </div>
        </div>
      </div>`;
  }

  function rerenderCard() {
    if (!panelEl) return;
    const old = $('[data-ksp-card="seeker"]', panelEl);
    if (old) { old.outerHTML = renderSeekerCard(profile); }
    else { panelEl.insertAdjacentHTML('beforeend', renderSeekerCard(profile)); }
    wireCard();
  }
  function wireCard() {
    const card = $('[data-ksp-card="seeker"]', panelEl);
    if (!card) return;
    card.addEventListener('click', async e => {
      const b = e.target.closest('[data-ksp]');
      if (!b) return;
      const act = b.dataset.ksp;
      if (act === 'create' || act === 'edit') { openModal(act === 'edit' ? profile : null); return; }
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
      const ok = await patch(on ? { visible: true, pausedAt: deleteField() } : { visible: false }, on ? '공개로 바꿨습니다.' : '비공개로 바꿨습니다. 알림 메일은 계속 받습니다.');
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

  // ── 작성 모달 ──
  let ovl = null, draft = null, step = 1, editing = false, quick = false;
  const totalSteps = () => (quick ? QUICK_STEPS : TOTAL_STEPS);

  function blankDraft() {
    return {
      suburbs: [], budgetMin: '0', budgetMax: '', moveIn: todayStr(), stay: '',
      roomTypes: [], bathroom: 'any',
      nick: '', ageBand: '', gender: '', residency: '', smoker: null, pet: null,
      intro: '', visible: true, alertMode: 'threshold5', alertEmail: (me && me.email) || '',
    };
  }
  function fromProfile(p) {
    const d = blankDraft();
    d.suburbs = (p.suburbs || []).slice(0, MAX_SUBURBS).map(s => ({ name: s.name, state: s.state, postcode: s.postcode || '', lat: s.lat, lng: s.lng }));
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
      if (!nav) { if (e.target === ovl) closeModal(); return; }
      if (nav.dataset.kspNav === 'close') closeModal();
      if (nav.dataset.kspNav === 'skip') { closeModal(); toast('나중에 마이페이지 → 내 프로필에서 이어서 등록할 수 있습니다.'); }
      if (nav.dataset.kspNav === 'back') { if (step > 1) { collect(); step--; renderStep(); } else closeModal(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovl.classList.contains('open')) closeModal(); });
  }

  function openModal(existing, opts) {
    if (!me) { if (window.koausAuth && window.koausAuth.openAuthModal) window.koausAuth.openAuthModal(); return; }
    // 글쓰기와 같은 본인 확인 게이트(휴대폰 인증) — 통과 못 하면 인증 모달이 뜨고, 인증 후 다시 열림
    if (window.koausRequireCanPost && !window.koausRequireCanPost(me, window.koausAuth && window.koausAuth.openAuthModal, () => openModal(existing, opts))) return;
    if (!E()) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    mountModal();
    editing = !!existing;
    quick = !!(opts && opts.quick) && !existing;
    if (existing) { draft = fromProfile(existing); step = 1; }
    else {
      const saved = loadDraft();
      draft = saved ? saved.draft : blankDraft();
      step = saved ? Math.min(saved.step, totalSteps()) : 1;
    }
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

  // 현재 화면의 입력값을 draft 에 반영
  function collect() {
    const body = $('#kspBody', ovl);
    if (!body) return;
    const v = id => { const el = $('#' + id, body); return el ? el.value : undefined; };
    switch (step) {
      case 2: draft.budgetMin = v('kspBudgetMin') || ''; draft.budgetMax = v('kspBudgetMax') || ''; break;
      case 3: draft.moveIn = v('kspMoveIn') || draft.moveIn; break;
      case 6: draft.intro = (v('kspIntro') || '').trim(); break;
      case 7: draft.alertEmail = (v('kspAlertEmail') || '').trim(); break;
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
    const subs = draft.suburbs.map(x => esc(x.name) + ' ' + esc(String(x.state || '').toUpperCase())).join(' · ');
    const budget = (draft.budgetMin !== '' || draft.budgetMax !== '') ? ('주 $' + esc(draft.budgetMin || 0) + (draft.budgetMax !== '' ? ' ~ $' + esc(draft.budgetMax) : '')) : '—';
    const stayL = en.label('stays', draft.stay);
    const rooms = (draft.roomTypes || []).map(c => en.label('roomTypes', c)).filter(Boolean).join(', ');
    return `
      <div class="ksp-preview">
        <div class="ksp-preview-top"><div class="ksp-avatar">${esc((nick[0] || '?').toUpperCase())}</div>
          <div><div class="ksp-preview-name">${esc(nick)}</div><div class="ksp-preview-meta">${tags.length ? esc(tags.join(' · ')) : '오늘 활동'}</div></div></div>
        <dl class="ksp-summary">
          <dt>동네</dt><dd>${subs || '—'}</dd>
          <dt>예산</dt><dd>${budget}</dd>
          <dt>입주</dt><dd>${esc(draft.moveIn || '—')}${stayL ? ' · ' + esc(stayL) : ''}</dd>
          <dt>방</dt><dd>${esc(rooms || '상관없음')}${draft.bathroom === 'private' ? ' · 개인 욕실' : ''}</dd>
        </dl>
      </div>`;
  }

  function renderStep() {
    const en = E();
    const body = $('#kspBody', ovl), foot = $('#kspFoot', ovl);
    const TS = totalSteps();
    $('#kspStepLabel', ovl).textContent = step <= TS ? (step + ' / ' + TS + (quick ? ' · 짧은 등록' : '')) : '';
    $('#kspProg', ovl).style.width = Math.min(100, Math.round((step - 1) / TS * 100)) + '%';
    $('[data-ksp-nav="back"]', ovl).style.visibility = step > 1 && step <= TS ? 'visible' : 'hidden';
    let html = '', next = '다음';
    if (quick && step === QUICK_STEPS) {
      // 짧은 등록 마지막: 근처 집주인에게 보이는 모습 + 활성화
      html = `
          <div class="ksp-q">근처에 집을 올리시는 분께 간단한 내 조건이 보입니다.</div>
          <div class="ksp-help">아래가 집주인이 보는 카드입니다. 닉네임과 조건만 보이고, 이메일·소개글은 보이지 않습니다. 연락은 채팅으로만 옵니다.</div>
          ${previewCardHtml()}
          <label class="ksp-switch"><input type="checkbox" id="kspVisible" ${draft.visible ? 'checked' : ''}> 내 조건 활성화 (근처 집주인에게 공개)</label>
          <div class="ksp-help">끄면 카드는 숨기고 새 매물 알림만 받습니다. 마이페이지 → 내 프로필에서 언제든 바꿀 수 있습니다.</div>
          <div class="ksp-err" id="kspErr${QUICK_STEPS}"></div>`;
      next = '등록';
    } else switch (step) {
      case 1:
        html = `
          <div class="ksp-q">찾으시는 동네</div>
          <div class="ksp-help">동네 이름이나 우편번호로 찾아 추가하십시오. 여러 곳을 넣으면 그 동네마다 방을 올린 집주인에게 보입니다(${MAX_SUBURBS}곳까지).</div>
          <div class="ksp-label">찾으시는 동네 <span class="req">(필수, 1곳 이상)</span></div>
          <input class="ksp-input" id="kspSuburbQ" type="text" placeholder="예: Sunnybank, 4109" autocomplete="off" inputmode="search">
          <ul class="ksp-sug" id="kspSuburbSug"></ul>
          <div class="ksp-sel" id="kspSuburbSel"></div>
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
          <input class="ksp-input" id="kspMoveIn" type="date" value="${esc(draft.moveIn)}" min="${todayStr()}">
          <div class="ksp-chips"><button type="button" class="ksp-opt" data-asap>최대한 빨리</button></div>
          <div class="ksp-label">거주 기간 <span class="req">(필수)</span></div>
          ${chipsHtml('stay', en.stays, draft.stay, false)}
          <div class="ksp-err" id="kspErr3"></div>`;
        break;
      case 4:
        html = `
          <div class="ksp-q">어떤 방을 찾으십니까?</div>
          <div class="ksp-help">고르지 않으면 상관없음으로 저장됩니다.</div>
          <div class="ksp-label">방 종류 <span class="req">(선택, 여러 개)</span></div>
          ${chipsHtml('roomTypes', en.roomTypes, draft.roomTypes, true)}
          <div class="ksp-label">욕실 <span class="req">(선택)</span></div>
          ${chipsHtml('bathroom', [{ code: 'any', label: '상관없음' }, { code: 'private', label: '개인 욕실' }], draft.bathroom, false)}`;
        break;
      case 5:
        html = `
          <div class="ksp-q">본인에 대해 알려 주십시오.</div>
          <div class="ksp-help">집주인에게는 닉네임 <b>${esc(draft.nick || '')}</b>과 나이대·성별만 보입니다(실명·사진 없음). 아래 신분·흡연·반려동물은 본인만 보는 칸이라 적어 두면 나중에 채팅에서 보낼 때 씁니다.</div>
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
          <div class="ksp-q">나를 소개하는 글을 적어 두시겠습니까?</div>
          <div class="ksp-help">카드에는 보이지 않고 본인만 봅니다. 집주인과 채팅이 시작되면 이 글을 보낼 수 있습니다. 생활 습관, 일하는 시간, 왜 이 동네인지 같은 내용이 도움이 됩니다. 전화번호·카톡 아이디·링크는 넣을 수 없습니다. 연락은 채팅으로 옵니다.</div>
          <div class="ksp-label">자기소개 <span class="req">(선택, 300자)</span></div>
          <textarea class="ksp-textarea" id="kspIntro" maxlength="300" placeholder="예: 평일 낮에 일하고 집에서는 조용히 지냅니다. 요리는 가끔 합니다.">${esc(draft.intro)}</textarea>
          <div class="ksp-err" id="kspErr6"></div>`;
        break;
      case 7:
        html = `
          <div class="ksp-q">공개와 알림을 정해 주십시오.</div>
          <div class="ksp-help">근처에 집을 올리시는 분께 간단한 내 조건이 이렇게 보입니다.</div>
          ${previewCardHtml()}
          <label class="ksp-switch"><input type="checkbox" id="kspVisible" ${draft.visible ? 'checked' : ''}> 내 조건 활성화 (근처 집주인에게 공개)</label>
          <div class="ksp-help">공개하면 희망 동네 근처에 방을 올린 집주인이 내 카드를 보고 채팅으로 연락할 수 있습니다. 끄면 알림만 받습니다. 30일 동안 활동이 없으면 자동으로 일시정지됩니다.</div>
          <div class="ksp-label">새 매물 알림 <span class="req">(필수)</span></div>
          ${chipsHtml('alertMode', [{ code: 'instant', label: '새 매물마다' }, { code: 'threshold5', label: '5건 이상 모이면' }, { code: 'daily', label: '하루 한 번' }, { code: 'off', label: '받지 않음' }], draft.alertMode, false)}
          <div class="ksp-label">알림 받을 이메일 <span class="req">(필수)</span></div>
          <input class="ksp-input" id="kspAlertEmail" type="email" maxlength="120" value="${esc(draft.alertEmail)}" placeholder="로그인 이메일">
          <div class="ksp-help">로그인 이메일이 기본입니다. 자주 쓰는 다른 주소로 바꿀 수 있습니다. 이메일은 집주인에게 보이지 않습니다.</div>
          <div class="ksp-err" id="kspErr7"></div>`;
        next = editing ? '저장' : '완료';
        break;
      default: {
        const st = draft.suburbs[0] && draft.suburbs[0].state;
        html = `
          <div class="ksp-done">
            <div class="ksp-q">${editing ? '저장했습니다.' : (quick ? '조건을 등록했습니다.' : '프로필을 만들었습니다.')}</div>
            ${quick ? '<div class="ksp-help">방 종류·나이대·성별·알림 설정은 마이페이지 → 내 프로필에서 언제든 채울 수 있습니다. 새 매물 알림은 로그인 이메일로, 5건 이상 모이면 보냅니다.</div>' : ''}
            <div class="ksp-help">${draft.visible ? '희망 동네 근처에 방을 올린 집주인에게 지금부터 내 조건이 보입니다.' : '비공개로 저장했습니다. 알림 메일만 받습니다.'} 연락이 오면 채팅 탭에 표시됩니다.</div>
            <a class="ksp-btn primary" href="accom.html${st ? '?state=' + esc(st) : ''}">조건에 맞는 방 보러 가기</a>
          </div>`;
        next = '';
      }
    }
    body.innerHTML = html;
    foot.innerHTML = next
      ? ((quick && !editing ? '<button type="button" class="ksp-btn" data-ksp-nav="skip">건너뛰기</button>' : '') + `<button type="button" class="ksp-btn primary" id="kspNext">${next}</button>`)
      : `<button type="button" class="ksp-btn" data-ksp-nav="close">닫기</button>`;
    wireStep();
    const first = body.querySelector('input:not([type=checkbox]),textarea');
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
          const i = arr.indexOf(val);
          if (i === -1) arr.push(val); else arr.splice(i, 1);
          draft[name] = arr;
          b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
        } else {
          if (name === 'smoker' || name === 'pet') draft[name] = (val === 'yes');
          else draft[name] = (draft[name] === val && name !== 'alertMode' && name !== 'bathroom' && name !== 'stay') ? '' : val;
          group.querySelectorAll('.ksp-opt').forEach(x => x.setAttribute('aria-pressed', x === b && (draft[name] !== '' && draft[name] !== null) ? 'true' : 'false'));
          if (draft[name] === '' || draft[name] === null) b.setAttribute('aria-pressed', 'false');
        }
      });
    });
    const next = $('#kspNext', ovl);
    if (next) next.addEventListener('click', onNext);
    if (step === 1) wireSuburb(body);
    if (step === 3) {
      const asap = $('[data-asap]', body);
      if (asap) asap.addEventListener('click', () => { $('#kspMoveIn', body).value = todayStr(); });
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
        if (!hits.length) { sug.innerHTML = '<li data-none>동네를 찾지 못했습니다. 동네 이름이나 우편번호로 다시 검색해 주십시오.</li>'; sug.classList.add('show'); return; }
        sug.innerHTML = hits.map((h, i) => `<li data-i="${i}">${suburbLabel(h)}${h.postcode ? ' ' + esc(h.postcode) : ''}</li>`).join('');
        sug.__hits = hits; sug.classList.add('show');
      }, 350);
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const li = sug.querySelector('li[data-i]'); if (li) li.click(); } if (e.key === 'Escape') hide(); });
    sug.addEventListener('click', e => {
      const li = e.target.closest('li[data-i]'); if (!li) return;
      const h = sug.__hits && sug.__hits[Number(li.dataset.i)]; if (!h) return;
      if (draft.suburbs.length >= MAX_SUBURBS) { $('#kspErr1', body).textContent = '동네는 ' + MAX_SUBURBS + '곳까지 넣을 수 있습니다.'; hide(); return; }
      if (!draft.suburbs.some(s => s.name === h.name && s.state === h.state)) draft.suburbs.push(h);
      q.value = ''; hide(); $('#kspErr1', body).textContent = ''; renderSuburbSel();
    });
    document.addEventListener('click', e => { if (!e.target.closest('#kspSuburbSug') && e.target !== q) hide(); });
  }
  function renderSuburbSel() {
    const sel = $('#kspSuburbSel', ovl); if (!sel) return;
    sel.innerHTML = draft.suburbs.map((s, i) => `<span class="ksp-chip on">${suburbLabel(s)} <button type="button" data-rm="${i}" aria-label="빼기">×</button></span>`).join('');
    sel.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { draft.suburbs.splice(Number(b.dataset.rm), 1); renderSuburbSel(); }));
  }
  async function geocodeSuburb(text) {
    try {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(text) + '&components=country:AU&language=en&key=' + GEOCODE_KEY;
      const res = await fetch(url);
      const j = await res.json();
      if (!j || !Array.isArray(j.results)) return [];
      const out = [], seen = new Set();
      j.results.forEach(r => {
        const comps = r.address_components || [];
        const find = t => comps.find(c => (c.types || []).indexOf(t) !== -1);
        const loc = find('locality') || find('sublocality') || find('postal_town');
        const st = find('administrative_area_level_1');
        const pc = find('postal_code');
        const geo = r.geometry && r.geometry.location;
        if (!loc || !st || !geo) return;
        const state = String(st.short_name || '').toLowerCase();
        if (!E().state(state)) return;
        const key = loc.long_name + '|' + state;
        if (seen.has(key)) return; seen.add(key);
        out.push({ name: String(loc.long_name).slice(0, 60), state, postcode: pc ? String(pc.long_name).slice(0, 4) : '', lat: Number(geo.lat), lng: Number(geo.lng) });
      });
      return out.slice(0, 5);
    } catch (e) { console.warn('[seeker-profile] geocode 실패', e); return []; }
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
        if (!draft.stay) return set('거주 기간을 골라 주십시오.');
        return set('');
      case 5: return set('');
      case 6:
        if (draft.intro.length > 300) return set('300자 이내로 적어 주십시오.');
        if (CONTACT_RE.test(draft.intro)) return set('전화번호·카톡 아이디·링크는 넣을 수 없습니다. 연락은 채팅으로 옵니다.');
        return set('');
      case 7:
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
    if (step < totalSteps()) { step++; if (!editing) saveDraft(); renderStep(); return; }
    await save();
  }

  function buildDocs(nick) {
    const d = {
      suburbs: draft.suburbs.slice(0, MAX_SUBURBS).map(s => {
        const o = { name: s.name, state: s.state, lat: Number(s.lat), lng: Number(s.lng) };
        if (s.postcode) o.postcode = String(s.postcode).slice(0, 4);
        return o;
      }),
      states: Array.from(new Set(draft.suburbs.map(s => s.state))).slice(0, 5),
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
      if (draft.intro) p.intro = draft.intro.slice(0, 300);
    }
    return { pub: d, priv: p };
  }
  async function save() {
    const btn = $('#kspNext', ovl); if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    try {
      const nick = draft.nick || (await getNick()) || '회원';
      const docs = buildDocs(nick);
      const batch = writeBatch(db);
      batch.set(doc(db, 'seeker_profiles', me.uid), docs.pub);                      // 전체 교체 — pausedAt 은 빠지므로 수정 = 다시 켜기
      batch.set(doc(db, 'seeker_private', me.uid), docs.priv, { merge: !!quick });  // 짧은 등록은 기존 비공개 칸 보존
      await batch.commit();
      clearDraft();
      await loadProfile(true);
      if (panelEl) rerenderCard();
      step = totalSteps() + 1; renderStep();
    } catch (e) {
      console.warn('[seeker-profile] 저장 실패', e);
      const denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      const errEl = $('#kspErr' + step, ovl) || $('#kspErr7', ovl);
      if (errEl) errEl.textContent = denied ? '저장할 수 없는 내용이 있습니다. 자기소개에 연락처·링크가 없는지, 휴대폰 인증이 되어 있는지 확인해 주십시오.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주십시오.';
      if (btn) { btn.disabled = false; btn.textContent = editing ? '저장' : (quick ? '등록' : '완료'); }
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

  window.koausSeekerProfile = {
    refresh: refreshPanel,
    open: () => openModal(profile),
    // 짧은 등록(①-2 역할 선택 뒤): 기존 프로필이 있으면 수정 모달, 없으면 3단계 + 건너뛰기
    openQuick: () => loadProfile(false).then(p => openModal(p || null, { quick: true })),
    has: () => loadProfile(false).then(p => !!p),
  };
})();
