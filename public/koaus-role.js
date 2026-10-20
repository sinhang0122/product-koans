// ═══════════════════════════════════════════════════════════════════
//  KoAus · Living / Job 역할 선택 (2026-10 ①-2)
//  - 입구에서 막지 않는다(비로그인은 그냥 둘러봄). 로그인한 회원이 Living(accom/rent) 또는 Job(jobs)에
//    들어왔을 때 그 앱의 역할이 아직 없으면 한 번 묻는다: Living = 집 구해요 / 방 올려요, Job = 일 구해요 / 사람 구해요.
//    데스크탑은 작은 창, 모바일(≤768px)은 화면 전체. **반드시 하나를 고른다(10-20 사용자 확정): '나중에' 없음, 바깥·Esc 로 못 닫음.**
//  - 저장: users/{uid}.roles = { living: 'seeker'|'owner'|'both', job: 'seeker'|'employer'|'both' } (rules validUserRoles).
//    묻는 창은 하나만 고르고, 마이페이지 '내 역할' 박스에서는 둘 다 켤 수 있다('both') — 단 하나는 남겨야 함(둘 다 끄기 불가).
//    글쓰기 버튼은 '올리기'(owner/employer/both)에게만 보인다 — 비로그인·역할 없음·'찾기'만이면 숨김(UI 게이트, 10-20). 문구는 사용자 확정분 그대로(임의 수정 금지).
//    LS 'koaus-roles-v1' = { uid, living, job } 캐시 → koaus-tabbar.js 가 '프로필' 탭 노출 판단에 즉시 사용.
//    바뀌면 document 에 'koaus:roles-changed' 이벤트.
//  - Living '집 구해요' 선택 직후 → 짧은 조건 등록(koaus-seeker-profile.js openQuick: 동네·예산·입주 3단계, 건너뛰기 없음).
//    (10-20) 이미 '찾기' 역할인데 조건 프로필이 없으면 accom/rent 에 들어올 때마다 짧은 등록을 다시 띄움(닫기는 가능, LS koaus-seeker-has-v1 로 읽기 절약).
//    '방 올려요' → 탭바에 '프로필' 탭(근처에서 집 구하는 사람). Job 쪽 프로필은 ②에서 — 지금은 역할만 저장.
//  - 마이페이지 '내 프로필' 탭 위에 역할 바꾸기(renderSwitcher) — 나중에 쉐어생 → 쉐어 구하는 사람이 되는 경우.
//  - 페이지: <script type="module" src="koaus-role.js"></script> (accom · rent · jobs · mypage)
// ═══════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

(function () {
  'use strict';
  if (window.koausRole) return;

  const firebaseConfig = {
    apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
    authDomain: 'koaus-f564c.firebaseapp.com',
    projectId: 'koaus-f564c',
    storageBucket: 'koaus-f564c.firebasestorage.app',
    messagingSenderId: '663988594088',
    appId: '1:663988594088:web:ef30c2fd557407b00b299d',
    measurementId: 'G-DERZ9MTKPL',
  };
  const LS_KEY = 'koaus-roles-v1';
  // 문구는 사용자 확정(10-19, 크몽식 해요체 — 이 창만 예외)
  const APPS = {
    living: {
      title: 'Living에서\n무엇을 시작해 보고 싶으세요?',
      note: '계정 하나로 모두 활동할 수 있어요.',
      options: [
        { code: 'seeker', label: '집·방을 찾고 있어요',   desc: '내게 필요한 곳을 찾아보세요.', art: 'seek' },
        { code: 'owner',  label: '집·방을 올리고 있어요', desc: '가지고 있는 곳이나 렌트 중인 곳을 올려 주세요.', art: 'host' },
      ],
    },
    job: {
      title: 'Job에서\n무엇을 시작해 보고 싶으세요?',
      note: '계정 하나로 모두 활동할 수 있어요.',
      options: [
        { code: 'seeker',   label: '일자리를 찾고 있어요',   desc: '내게 필요한 일자리를 찾아 보세요.', art: 'work' },
        { code: 'employer', label: '일자리를 올리고 있어요', desc: '일을 맡길 사람을 구해보세요.', art: 'hire' },
      ],
    },
  };
  // 그림 — 이모지 없이 inline SVG(선 아이콘). 크몽식 큰 카드의 일러스트 자리.
  const ART = {
    seek: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="60" r="50" fill="var(--kr-art,#f1f3f5)" stroke="none"/><path d="M30 60 60 34l30 26"/><path d="M38 54v30h44V54"/><path d="M54 84V66h12v18"/><circle cx="86" cy="42" r="10"/><path d="m93 49 9 9"/></svg>',
    host: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="60" r="50" fill="var(--kr-art,#f1f3f5)" stroke="none"/><path d="M28 62 58 36l30 26"/><path d="M36 56v30h44V56"/><circle cx="84" cy="80" r="9"/><path d="M84 71v-6M84 95v-6M75 80h-6M99 80h-6"/><path d="M58 86V70h-8"/></svg>',
    work: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="60" r="50" fill="var(--kr-art,#f1f3f5)" stroke="none"/><rect x="32" y="48" width="56" height="38" rx="6"/><path d="M48 48v-6a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v6"/><path d="M32 64h56"/><path d="M60 60v10"/></svg>',
    hire: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="60" r="50" fill="var(--kr-art,#f1f3f5)" stroke="none"/><circle cx="48" cy="48" r="10"/><path d="M28 84c3-11 10-17 20-17s17 6 20 17"/><circle cx="76" cy="52" r="8"/><path d="M70 72c3-6 8-9 14-9 7 0 12 4 14 11"/><path d="M90 36v10M85 41h10"/></svg>',
  };
  const LABEL = { living: { seeker: '집·방 찾기', owner: '집·방 올리기' }, job: { seeker: '일자리 찾기', employer: '일자리 올리기' } };
  const POST_ROLE = { living: 'owner', job: 'employer' };   // 글을 올릴 수 있는 역할
  // 역할 보유 여부 — 'both' 는 둘 다
  const has = (r, app, code) => !!(r && r[app] && (r[app] === code || r[app] === 'both'));

  let db = null, me = null, roles = null, loadedFor = null, ovl = null;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = m => { try { if (window.koausToast) window.koausToast.show(m); else alert(m); } catch (_) { alert(m); } };

  function pageApp() {
    const p = (location.pathname.split('/').pop() || '').toLowerCase();
    if (p === 'accom.html' || p === 'rent.html') return 'living';
    if (p === 'jobs.html') return 'job';
    return '';
  }
  function readCache() {
    try { const c = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return c && me && c.uid === me.uid ? c : null; } catch (_) { return null; }
  }
  function writeCache() {
    try {
      if (!me) { localStorage.removeItem(LS_KEY); return; }
      localStorage.setItem(LS_KEY, JSON.stringify({ uid: me.uid, living: (roles && roles.living) || '', job: (roles && roles.job) || '' }));
    } catch (_) {}
    try { document.dispatchEvent(new CustomEvent('koaus:roles-changed', { detail: { roles: Object.assign({}, roles || {}) } })); } catch (_) {}
    applyUi();
  }
  // 역할에 따라 페이지 요소 토글 — 마이페이지 '구하는 사람' 탭, accom/rent 상단 안내 줄
  function applyUi() {
    const owner = !!(me && has(roles, 'living', 'owner'));           // 올리기(둘 다 포함) → 구하는 사람 탭
    const ownerOnly = !!(me && roles && roles.living === 'owner');     // 올리기만 → accom/rent 상단 줄을 '구하는 사람 보기'로
    try { const t = document.getElementById('mpPeopleTab'); if (t) t.hidden = !owner; } catch (_) {}
    try { const h = document.getElementById('kspRoles'); if (h && me) renderSwitcher(h); } catch (_) {}
    try { applyPrompt(); } catch (_) {}
    try { applyWriteGate(); } catch (_) {}
    try {
      const row = document.querySelector('[data-seeker-entry]');
      if (row) {
        if (ownerOnly) {
          row.setAttribute('href', 'mypage.html?tab=people'); row.removeAttribute('onclick'); row.onclick = null;
          const t = row.querySelector('.kse-text'), c = row.querySelector('.kse-cta');
          if (t) t.innerHTML = '<strong>방을 올리셨습니까?</strong> 이 근처에서 집을 구하는 분들의 조건 카드를 보고 먼저 채팅할 수 있습니다.';
          if (c) c.textContent = '구하는 사람 보기 ›';
          row.dataset.seekerEntry = 'owner';
        } else if (row.dataset.seekerEntry === 'owner') {
          row.setAttribute('href', 'mypage.html?tab=profile&profile=quick');
          row.onclick = e => { if (window.koausSeekerProfile && window.koausSeekerProfile.openQuick) { e.preventDefault(); window.koausSeekerProfile.openQuick(); } };
          const t = row.querySelector('.kse-text'), c = row.querySelector('.kse-cta');
          if (t) t.innerHTML = '<strong>더욱 편리하게 집을 찾으세요.</strong> 프로필 설정하시면 원하시는 지역에 글이 올라올 때 이에 맞게 이메일로 알려드립니다.';
          if (c) c.textContent = '내 조건 등록 ›';
          row.dataset.seekerEntry = '';
        }
      }
    } catch (_) {}
  }
  async function load(force) {
    if (!me || !db) { roles = null; loadedFor = null; return null; }
    if (!force && loadedFor === me.uid) return roles;
    try {
      const snap = await getDoc(doc(db, 'users', me.uid));
      roles = (snap.exists() && snap.data().roles && typeof snap.data().roles === 'object') ? snap.data().roles : {};
      loadedFor = me.uid;
      writeCache();
    } catch (e) { console.warn('[role] 조회 실패', e); roles = roles || {}; }
    return roles;
  }
  async function set(app, code) {
    if (!me || !db) return false;
    try {
      const next = Object.assign({}, roles || {}); next[app] = code;
      await setDoc(doc(db, 'users', me.uid), { roles: next, rolesAskedAt: serverTimestamp() }, { merge: true });
      roles = next; loadedFor = me.uid; writeCache();
      return true;
    } catch (e) { console.warn('[role] 저장 실패', e); toast('저장하지 못했습니다. 잠시 후 다시 시도해 주십시오.'); return false; }
  }

  // ── 스타일 ──
  function injectCss() {
    if ($('#koaus-role-style')) return;
    const st = document.createElement('style'); st.id = 'koaus-role-style';
    st.textContent = `
      .kr-ovl{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9100;display:none;align-items:center;justify-content:center;padding:16px;--kr-art:#eef1f4}
      :root[data-theme=dark] .kr-ovl{--kr-art:#1c1c1c}
      .kr-ovl.open{display:flex}
      .kr-box{width:100%;max-width:820px;background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border);border-radius:22px;padding:40px 36px 28px;box-shadow:0 24px 64px rgba(0,0,0,.2);font-family:var(--font);text-align:center}
      .kr-title{font-size:30px;font-weight:900;letter-spacing:-.02em;line-height:1.3;white-space:pre-line}
      .kr-opts{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:30px 0 16px;text-align:left}
      .kr-opt{appearance:none;display:flex;flex-direction:column;align-items:flex-start;text-align:left;border:1.5px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:18px;padding:30px 26px 26px;cursor:pointer;font-family:inherit;transition:border-color .12s,background .12s,transform .12s}
      .kr-opt:hover,.kr-opt:focus-visible{border-color:var(--text-primary);background:var(--bg-base);transform:translateY(-2px);outline:none}
      .kr-opt.on{border-color:var(--text-primary);background:var(--bg-base);box-shadow:0 0 0 1.5px var(--text-primary)}
      .kr-art{width:132px;height:132px;align-self:center;margin-bottom:22px;opacity:.95}
      .kr-art svg{width:100%;height:100%;display:block}
      .kr-opt b{display:block;font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.25}
      .kr-opt span{display:block;font-size:15px;opacity:.72;margin-top:10px;line-height:1.55;white-space:pre-line}
      .kr-note{font-size:14px;font-weight:600;padding:14px 16px;border-radius:12px;background:var(--bg-card);line-height:1.6}
      .kr-foot{display:flex;justify-content:center;margin-top:10px}
      .kr-later{appearance:none;background:none;border:0;color:var(--text-primary);opacity:.55;font-size:13.5px;cursor:pointer;font-family:inherit;padding:8px 10px;text-decoration:underline}
      @media(max-width:768px){.kr-ovl{padding:0;align-items:stretch}.kr-box{max-width:none;border-radius:0;border:0;display:flex;flex-direction:column;justify-content:center;padding:28px 20px calc(24px + env(safe-area-inset-bottom,0px));overflow:auto}.kr-title{font-size:24px}.kr-opts{grid-template-columns:1fr;gap:12px;margin:22px 0 12px}.kr-opt{display:grid;grid-template-columns:72px 1fr;column-gap:14px;row-gap:2px;align-items:center;padding:16px 16px}.kr-art{grid-row:1 / 3;width:72px;height:72px;margin:0}.kr-opt b{font-size:19px}.kr-opt span{font-size:13.5px;margin-top:4px}.kr-note{font-size:13px}}
      /* 마이페이지 역할 바꾸기 */
      .kr-switch{display:flex;flex-direction:column;gap:8px;margin:0 0 12px;padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:var(--bg-base)}
      .kr-switch-title{font-size:14px;font-weight:800;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
      .kr-switch-title span{font-size:12px;font-weight:400;opacity:.65}
      .kr-switch-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .kr-switch-row b{font-size:13.5px;min-width:52px}
      .kr-seg{display:inline-flex;border:1px solid var(--border);border-radius:999px;overflow:hidden}
      .kr-seg button{appearance:none;border:0;background:none;color:var(--text-primary);padding:7px 13px;font-size:13px;font-family:inherit;cursor:pointer}
      .kr-seg button.on{background:var(--text-primary);color:var(--bg-base)}
      .kr-switch-help{font-size:12px;opacity:.65;line-height:1.45}
      /* 창이 뜨기 전 잠깐(0.5초) 돌아가는 원 */
      .kr-wait{display:flex;flex-direction:column;align-items:center;gap:12px;color:#fff;font-family:var(--font);font-size:14px;font-weight:600}
      .kr-spin{width:38px;height:38px;border-radius:50%;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;animation:kr-rot .8s linear infinite}
      @keyframes kr-rot{to{transform:rotate(360deg)}}`;
    document.head.appendChild(st);
  }

  // ── 묻는 창 ──
  function mount() {
    if (ovl) return;
    injectCss();
    ovl = document.createElement('div'); ovl.className = 'kr-ovl'; ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true');
    document.body.appendChild(ovl);
  }
  function close() { if (ovl) { ovl.classList.remove('open'); document.body.style.overflow = ''; } }
  // (10-20) '나중에 정하기' 폐지 — 아래 snooze 는 고른 기록용으로만 남김. 바꾸는 곳은 마이페이지 → 내 프로필의 '내 역할' 박스.
  function snooze(app) { try { localStorage.setItem('koaus-role-asked-' + app + '-' + (me ? me.uid : ''), '1'); } catch (_) {} }
  function snoozed(app) { try { return localStorage.getItem('koaus-role-asked-' + app + '-' + (me ? me.uid : '')) === '1'; } catch (_) { return false; } }

  function ask(app, onDone) {
    const cfg = APPS[app]; if (!cfg) return;
    mount();
    ovl.innerHTML = `
      <div class="kr-box">
        <div class="kr-title">${esc(cfg.title)}</div>
        <div class="kr-opts">${cfg.options.map(o => `<button type="button" class="kr-opt" data-code="${esc(o.code)}"><span class="kr-art" aria-hidden="true">${ART[o.art] || ''}</span><b>${esc(o.label)}</b><span>${esc(o.desc)}</span></button>`).join('')}</div>
        <div class="kr-note">${esc(cfg.note)}</div>
      </div>`;
    ovl.onclick = async e => {
      const opt = e.target.closest('.kr-opt'); if (!opt) return;
      ovl.querySelectorAll('.kr-opt').forEach(b => { b.classList.toggle('on', b === opt); b.disabled = true; });
      const ok = await set(app, opt.dataset.code);
      close();
      if (ok) {
        snooze(app);
        try { onDone && onDone(opt.dataset.code); } catch (_) {}
      }
    };
    ovl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function afterChoice(app, code) {
    if (app === 'living' && code === 'seeker') {
      if (window.koausSeekerProfile && window.koausSeekerProfile.openQuick) { window.koausSeekerProfile.openQuick(); return; }
      location.href = 'mypage.html?tab=profile&profile=quick';
      return;
    }
    if (app === 'living' && code === 'owner') { toast('저장했습니다. 방을 올리면 근처에서 집 구하는 분들을 아래 "프로필" 탭에서 볼 수 있습니다.'); return; }
    if (app === 'job') toast('저장했습니다. ' + (code === 'seeker' ? '일 구해요 프로필은 다음 업데이트에서 열립니다.' : '일 구하는 분들 보기는 다음 업데이트에서 열립니다.'));
  }

  // 0.5초 돌아가는 원 → fn. 로그인 창·휴대폰 인증 창이 닫히는 애니메이션과 겹치지 않을 만큼만.
  function withSpinner(fn) {
    mount();
    ovl.innerHTML = '<div class="kr-wait"><div class="kr-spin" aria-hidden="true"></div><div>불러오는 중…</div></div>';
    ovl.onclick = null;
    ovl.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      close();
      if (me && !$('.ksp-ovl.open') && !$('.auth-overlay.open')) fn();
    }, 500);
  }
  // 조건 프로필 보유 여부 LS 캐시(koaus-seeker-profile.js 가 읽을 때마다 기록) — true 면 서버 확인 생략
  function seekerHasCached() {
    try { const c = JSON.parse(localStorage.getItem('koaus-seeker-has-v1') || 'null'); return !!(c && me && c.uid === me.uid && c.has === true); } catch (_) { return false; }
  }

  // 페이지 진입 시 — 로그인·인증 확정 뒤:
  //   ① 역할 없음 → 역할 창(필수 선택)
  //   ② (10-20) Living 에서 '집·방 찾기'(둘 다 포함)인데 조건 프로필이 없으면 → 짧은 등록 3단계를 바로 띄움.
  //      닫을 수는 있고(둘러보기 가능), 등록될 때까지 들어올 때마다 다시 뜸. 중간에 닫은 입력은 기기에 임시저장돼 이어짐.
  async function maybeAsk() {
    const app = pageApp(); if (!app || !me) return;
    if (window.koausCanPost && !window.koausCanPost(me)) return;   // 휴대폰 인증 모달이 먼저 — 겹치지 않게
    const r = await load(false);   // 예전 '나중에' 기록(snoozed)은 무시 — 역할이 없으면 반드시 묻는다
    if (!me || $('.ksp-ovl.open') || $('.auth-overlay.open')) return;
    if (!r || !r[app]) { withSpinner(() => ask(app, code => afterChoice(app, code))); return; }
    if (app === 'living' && has(r, 'living', 'seeker') && window.koausSeekerProfile && window.koausSeekerProfile.has) {
      if (seekerHasCached()) return;
      let h = true;
      try { h = await window.koausSeekerProfile.has(); } catch (_) { return; }
      if (h || !me || $('.ksp-ovl.open') || $('.auth-overlay.open')) return;
      withSpinner(() => window.koausSeekerProfile.openQuick());
    }
  }

  // 10-20 사용자 확정: 글쓰기 버튼은 '올리기'(집·방 올리기 / 일자리 올리기, 둘 다 포함)에게만. 역할 없음·'찾기'만이면 숨김(UI 게이트).
  //   숨김만(삭제 아님) — 역할을 바꾸면 즉시 복귀. rules 는 그대로(글 create 는 휴대폰 인증 게이트).
  function applyWriteGate() {
    const app = pageApp(); if (!app) return;
    const btn = document.getElementById('writeBtnOpen'); if (!btn) return;
    // 10-20: '올리기'(owner/employer/both)에게만 보임. 비로그인·역할 아직 안 읽음·없음·'찾기'만 → 숨김(비로그인은 둘러보기만, 사용자 확정).
    const r = (me && loadedFor === me.uid && roles) ? roles : null;
    const hide = !has(r, app, POST_ROLE[app]);
    btn.style.display = hide ? 'none' : '';   // hidden 속성은 .board-write-btn 의 display 에 밀리므로 inline display 로
    btn.setAttribute('aria-hidden', hide ? 'true' : 'false');
  }
  // '나중에 정하기' 뒤에는 자동으로 다시 묻지 않고, 역할은 마이페이지 → 내 프로필에서만 바꾼다(10-19 사용자 확정).
  function applyPrompt() {
    const old = document.querySelector('.accom-ctrl-actions .kr-prompt'); if (old) old.remove();
  }

  // ── 마이페이지: 역할 바꾸기 ──
  function renderSwitcher(host) {
    if (!host) return;
    injectCss();
    const r = roles || {};
    const seg = (app, codes) => `<span class="kr-seg" data-app="${app}">${codes.map(c => `<button type="button" data-code="${c}" class="${has(r, app, c) ? 'on' : ''}" aria-pressed="${has(r, app, c) ? 'true' : 'false'}">${esc(LABEL[app][c])}</button>`).join('')}</span>`;
    host.innerHTML = `
      <div class="kr-switch">
        <div class="kr-switch-title">내 역할 <span>둘 다 켤 수 있고 언제든 바꿀 수 있습니다. 하나는 남겨야 합니다.</span></div>
        <div class="kr-switch-row"><b>Living</b>${seg('living', ['seeker', 'owner'])}</div>
        <div class="kr-switch-row"><b>Job</b>${seg('job', ['seeker', 'employer'])}</div>
        <div class="kr-switch-help">"집·방 올리기"·"일자리 올리기"를 켜면 글쓰기 버튼이 생깁니다(집·방 올리기는 탭바 "프로필" 탭도). "집·방 찾기"는 아래 내 조건이 근처 집주인에게 보입니다.</div>
      </div>`;
    host.onclick = async e => {
      const b = e.target.closest('.kr-seg button'); if (!b) return;
      const app = b.closest('.kr-seg').dataset.app, code = b.dataset.code;
      const codes = app === 'living' ? ['seeker', 'owner'] : ['seeker', 'employer'];
      const cur = roles || {};
      const on = codes.filter(c => has(cur, app, c));
      let next;
      if (on.indexOf(code) !== -1) {
        if (on.length === 1) { toast('역할은 하나 이상 켜 두어야 합니다.'); return; }
        next = on.filter(c => c !== code)[0];
      } else {
        next = on.length ? 'both' : code;
      }
      if (cur[app] === next) return;
      b.closest('.kr-seg').querySelectorAll('button').forEach(x => x.disabled = true);
      const ok = await set(app, next);
      renderSwitcher(host);
      if (ok) { toast('저장했습니다.'); if (app === 'living' && code === 'seeker' && next !== 'owner' && window.koausSeekerProfile) window.koausSeekerProfile.has().then(h => { if (!h) window.koausSeekerProfile.openQuick(); }); }
    };
  }

  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    onAuthStateChanged(getAuth(app), u => {
      me = u;
      if (!u) { roles = null; loadedFor = null; writeCache(); return; }
      load(true).then(maybeAsk);
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyUi); else applyUi();
  } catch (e) { try { console.warn('[role] init 실패:', e); } catch (_) {} }

  window.koausRole = {
    get: () => Object.assign({}, roles || readCache() || {}),
    ready: () => !!(me && loadedFor === me.uid),
    set: set,
    ask: app => ask(app, code => afterChoice(app, code)),
    renderSwitcher: renderSwitcher,
    label: (app, code) => (LABEL[app] && LABEL[app][code]) || '',
    has: (app, code) => has(roles || readCache() || {}, app, code),
  };
})();
