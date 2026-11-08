// ════════════════════════════════════════════════════════════════════
//  KoAus · 일 구해요 프로필 (job_profiles) — 2단계 ② (2026-11-04)
//  - 집 구해요(koaus-seeker-profile.js)와 같은 틀: 공개/비공개 두 문서, 짧은 등록 3단계 → 바로 생성, 인스타식 카드(완성도·행별 편집).
//    공개 job_profiles/{uid} = 사장님이 보는 칸: 닉네임·성별·나이대·업종·동네(+반경)·근무 형태·시작 가능일·희망 시급·비자·자격증·차·경력·사는 곳
//    비공개 job_private/{uid} = 알림 이메일(본인만). 소개글 없음(문의 자기소개는 환경설정).
//  - 짧은 등록(11-08): ① 업종 + 일하고 싶은 동네(반경)/큰 지역 ② 경력 + 차 유무 + 시작 가능일 → 등록(근무 형태·나이대·비자는 받지 않음). 전체 등록 ③ 나이대·성별·비자 ④ 자격증·희망 시급 ⑤ 공개·알림.
//  - 사장님 쪽(11-08): jobs.html 도구줄 [워커 구하기] → openPage() — 상세 필터 시트(동네 혹은 주 최대 3곳·반경·업종·정렬·성별) → 카드 넘겨 보기(koaus-people-deck.js) → 카드 아래 칸에서 메시지(board 'jobseeker', chatId 'job_{uid}_{나}').
//  - 스타일은 koaus-profile.css(.ksp-*) 공통. 동네 검색은 koaus-geo.js(window.koausGeo). 값 목록은 koaus-enums.js.
//  - 페이지: jobs.html · mypage.html · settings.html — <script type="module" src="koaus-job-profile.js">
// ════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteField, serverTimestamp, writeBatch, collection, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

(function () {
  'use strict';
  if (window.koausJobProfile) return;

  const firebaseConfig = {
    apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
    authDomain: 'koaus-f564c.firebaseapp.com',
    projectId: 'koaus-f564c',
    storageBucket: 'koaus-f564c.firebasestorage.app',
    messagingSenderId: '663988594088',
    appId: '1:663988594088:web:ef30c2fd557407b00b299d',
    measurementId: 'G-DERZ9MTKPL',
  };
  const DRAFT_KEY = 'koaus-job-draft-v1';
  const HAS_KEY = 'koaus-job-has-v1';        // {uid, has} — jobs 진입 때 koaus-role.js 가 '프로필 없음' 판단에 먼저 씀
  const MAX_SUBURBS = 4, MAX_INDUSTRIES = 5;   // 11-05: 동네 5 → 4 (규칙 표현식 한도 — 사는 곳·경력 검사가 더 있음)
  const TOTAL_STEPS = 5, QUICK_STEPS = 2;   // 11-08: 짧은 등록 2단계(①업종·동네 ②경력·차·시작일, 근무 형태 없음). 전체 ③나이대·성별·비자(선택) ④자격증·시급 ⑤공개·알림
  const RADII = [3, 5, 10, 20];
  const WORK_TYPES = [{ code: 'casual', label: '캐주얼' }, { code: 'part', label: '파트타임' }, { code: 'full', label: '풀타임' }];
  const LICENSES = [
    { code: 'rsa', label: 'RSA' }, { code: 'whitecard', label: '화이트카드' }, { code: 'forklift', label: '포크리프트' },
    { code: 'barista', label: '바리스타' }, { code: 'foodsafety', label: '푸드 세이프티' }, { code: 'driver', label: '운전면허' },
    { code: 'firstaid', label: '응급처치' }, { code: 'other', label: '기타' },
  ];
  const CONTACT_RE = /([0-9][ .-]?){6,}|https?:\/\/|www\.|\.com|\.au|\.kr|카톡|카카오|kakao|인스타|insta/i;

  let db = null, me = null;
  let profile = null, priv = null, loadedFor = null;
  let hostEl = null;

  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    onAuthStateChanged(getAuth(app), u => {
      me = u;
      if (!u) { profile = null; priv = null; loadedFor = null; }
      if (hostEl && hostEl.offsetParent !== null) refreshHost();
    });
  } catch (e) { try { console.warn('[job-profile] init 실패:', e); } catch (_) {} }

  const E = () => window.koausEnums;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = (m) => { try { if (window.koausToast) window.koausToast.show(m); else alert(m); } catch (_) { alert(m); } };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const todayStr = () => { const d = new Date(); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  const regionKo = name => { try { const r = (window.koausGeo && window.koausGeo.REGIONS || []).find(z => z.name === name); return r ? r.ko : name; } catch (_) { return name; } };
  const suburbLabel = s => (s && (s.km || s.all)) ? (esc(s.name) + ' 전체' + (s.km ? ' <span class="ksp-dim">' + esc(s.km) + 'km</span>' : '')) : (esc(s.name) + ' ' + esc(String(s.state || '').toUpperCase()));
  const tsLabel = ts => { try { const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0; if (!ms) return ''; const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? '오늘' : d + '일 전'; } catch (_) { return ''; } };
  const kmBetween = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  function injectCss() {
    if (document.getElementById('kspStyle')) return;
    const ln = document.createElement('link'); ln.id = 'kspStyle'; ln.rel = 'stylesheet'; ln.href = 'koaus-profile.css';
    document.head.appendChild(ln);
  }

  // ── 데이터 ──
  async function getNick() {
    let n = '';
    try { n = (localStorage.getItem('koaus-nickname') || '').trim(); } catch (_) {}
    if (!n && me && db) { try { const u = await getDoc(doc(db, 'users', me.uid)); n = ((u.exists() && u.data().nickname) || '').trim(); } catch (_) {} }
    if (!n && me) n = (me.displayName || (me.email || '').split('@')[0] || '').trim();
    return n.slice(0, 30);
  }
  async function loadProfile(force) {
    if (!me || !db) { profile = null; priv = null; loadedFor = null; return null; }
    if (!force && loadedFor === me.uid) return profile;
    try {
      const [a, b] = await Promise.all([getDoc(doc(db, 'job_profiles', me.uid)), getDoc(doc(db, 'job_private', me.uid))]);
      profile = a.exists() ? a.data() : null;
      priv = b.exists() ? b.data() : null;
      loadedFor = me.uid;
      try { localStorage.setItem(HAS_KEY, JSON.stringify({ uid: me.uid, has: !!profile })); } catch (_) {}
    } catch (e) { console.warn('[job-profile] 조회 실패', e); profile = null; priv = null; loadedFor = null; }
    return profile;
  }
  async function touchActive() {
    if (!me || !db || !profile) return;
    try {
      const last = profile.lastActiveAt && typeof profile.lastActiveAt.toMillis === 'function' ? profile.lastActiveAt.toMillis() : 0;
      if (Date.now() - last < 86400000) return;
      await updateDoc(doc(db, 'job_profiles', me.uid), { lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } catch (_) {}
  }

  // ── 라벨 ──
  const startLabel = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0); return (isNaN(d) || d <= t) ? '바로 가능' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일부터'; };
  const indL = (codes, en) => (codes || []).map(c => en.label('industries', c)).filter(Boolean).join(', ');
  const wtL = codes => (codes || []).map(c => (WORK_TYPES.find(w => w.code === c) || {}).label).filter(Boolean).join(' · ');
  const licL = codes => (codes || []).map(c => (LICENSES.find(w => w.code === c) || {}).label).filter(Boolean).join(', ');
  // 사장님이 보는 한 문장
  function sentenceOf(d, en) {
    const subs = (d.suburbs || []).map(x => (x.km || x.all) ? x.name + ' 전체' : x.name).filter(Boolean).slice(0, 3).join(' · ');
    const parts = [];
    if (subs) parts.push(subs + ' 근처');
    const ind = indL(d.industries, en); if (ind) parts.push(ind);
    const wt = wtL(d.workTypes); if (wt) parts.push(wt);
    const st = startLabel(d.startDate); if (st) parts.push(st);
    if (d.payMin) parts.push('시급 $' + d.payMin + ' 이상');
    return parts.length ? parts.join(', ') + ' 일을 찾습니다.' : '조건을 등록한 분입니다.';
  }

  // ── 완성도 ──
  const TODO = [
    { label: '나이대 · 성별 · 비자', step: 3, done: p => !!(p.ageBand && p.gender && p.visa) },
    { label: '자격증 · 희망 시급',   step: 4, done: p => !!((p.licenses && p.licenses.length) || p.payMin) },
  ];
  const completeness = p => { const todo = TODO.filter(t => !t.done(p)); return { pct: 100 - todo.length * 10, todo }; };

  // ── 카드 ──
  async function refreshHost() {
    if (!hostEl) return;
    injectCss();
    if (!me) { hostEl.innerHTML = ''; return; }
    if (!E()) { hostEl.innerHTML = '<div class="post-empty">불러오는 중…</div>'; return; }
    await loadProfile(false);
    if (!hostEl) return;
    // Living 카드도 비어 있으면(그 카드에 'Job 프로필 만들기' 버튼이 있음) 빈 Job 카드는 겹치지 않게 생략
    if (!profile && hostEl.parentNode && hostEl.parentNode.querySelector('[data-ksp="job"]')) { hostEl.innerHTML = ''; return; }
    hostEl.innerHTML = renderCard(profile);
    wireCard();
    touchActive();
  }
  function renderCard(p) {
    if (!p) {
      return `
        <div class="ksp-card" data-kjp-card style="margin-top:12px;">
          <div class="ksp-title" style="font-size:15px;">Job 프로필</div>
          <div class="ksp-sub">업종·동네·근무 형태·시작 가능일·비자를 등록하면 근처에 일자리를 올리는 사장님에게 내 조건이 보이고, 조건에 맞는 일자리가 올라오면 이메일로 알려드립니다. 연락은 채팅으로만 옵니다.</div>
          <div class="ksp-prof-btns" style="grid-template-columns:1fr;"><button type="button" class="ksp-btn" data-kjp="create">Job 프로필 만들기</button></div>
        </div>`;
    }
    const en = E(), q = priv || {};
    const paused = !!p.pausedAt, found = p.status === 'found', vis = p.visible === true;
    const subs = (p.suburbs || []).map(suburbLabel).join(' · ');
    const meta = [p.visa ? en.label('visas', p.visa) : '', p.gender ? en.label('genders', p.gender) : '', p.ageBand ? en.label('ageBands', p.ageBand) : ''].filter(Boolean).join(' · ');
    const stateChip = found ? '구했습니다' : (paused ? '일시정지' : (vis ? '공개 중' : '비공개'));
    const c = completeness(p);
    const al = q.alerts || null; const alertL = { instant: '새 일자리마다', threshold5: '5건 이상 모이면', daily: '하루 한 번', off: '받지 않음' }[(al && al.mode) || 'off'] || '받지 않음';
    const row = (k, v, step, own) => `
          <div class="ksp-prow">
            <div class="ksp-prow-main"><div class="ksp-prow-k">${k}${own ? '<span class="ksp-own">본인만</span>' : ''}</div><div class="ksp-prow-v${v ? '' : ' empty'}">${v || '미등록'}</div></div>
            <button type="button" class="ksp-link" data-kjp="step" data-step="${step}">편집</button>
          </div>`;
    const extra = [licL(p.licenses), p.payMin ? '시급 $' + esc(p.payMin) + ' 이상' : ''].filter(Boolean).join(' · ');
    const who = [p.ageBand ? en.label('ageBands', p.ageBand) : '', p.gender ? en.label('genders', p.gender) : '', p.visa ? en.label('visas', p.visa) : ''].filter(Boolean).join(' · ');
    return `
      <div class="ksp-card ksp-prof" data-kjp-card style="margin-top:12px;">
        <div class="ksp-prof-head">
          <div class="ksp-prof-nick"><span>${esc(p.nick || '회원')}</span><span class="ksp-chip" style="font-size:11px;">Job</span></div>
          <div class="ksp-prof-meta">${meta ? esc(meta) : '비자·나이대 미등록'}</div>
          <div class="ksp-row" style="margin-top:4px;"><span class="ksp-chip ${(!found && !paused && vis) ? 'on' : ''}">${stateChip}</span><span class="ksp-chip">${esc(tsLabel(p.updatedAt) || '')} 수정</span></div>
        </div>
        <div class="ksp-prof-btns">
          <button type="button" class="ksp-btn" data-kjp="edit">프로필 편집</button>
          <button type="button" class="ksp-btn" data-kjp="preview">사장님이 보는 카드</button>
        </div>
        ${paused ? `<div class="ksp-banner"><span>30일 동안 활동이 없어 일시정지되었습니다. 계속 구하고 계시면 다시 켜 주십시오.</span><button type="button" class="ksp-btn small primary" data-kjp="resume">다시 켜기</button></div>` : ''}
        <label class="ksp-switch ksp-prof-switch"><span class="ksp-switch-txt"><span>${(vis && !paused && !found) ? '조건 활성화 · 알림 활성화' : '조건 비활성화 · 알림 비활성화'}</span>${found ? '<small>구했습니다 상태에서는 공개되지 않습니다</small>' : ''}</span><input type="checkbox" data-kjp="visible" ${vis && !paused ? 'checked' : ''} ${found ? 'disabled' : ''}></label>
        ${c.todo.length ? `
        <div class="ksp-complete">
          <div class="ksp-complete-head"><b>프로필 완성하기</b><span>${c.pct}%</span></div>
          <div class="ksp-bar"><i style="width:${c.pct}%"></i></div>
          <div class="ksp-todo">${c.todo.map(t => `<button type="button" class="ksp-todo-card" data-kjp="step" data-step="${t.step}"><span class="ksp-todo-pct">+10%</span><span class="ksp-todo-label">${esc(t.label)}</span><span class="ksp-todo-add">추가하기</span></button>`).join('')}</div>
        </div>` : `
        <div class="ksp-complete"><div class="ksp-complete-head"><b>프로필 100% 완성</b><span>100%</span></div><div class="ksp-bar"><i style="width:100%"></i></div></div>`}
        <div class="ksp-sec">
          <div class="ksp-sec-title"><span>내 조건</span><span>사장님에게 보입니다</span></div>
          ${row('업종 · 동네', [esc(indL(p.industries, en)), subs ? subs + (p.radiusKm && (p.suburbs || []).some(x => !(x.km || x.all)) ? ' (반경 ' + esc(p.radiusKm) + 'km)' : '') : ''].filter(Boolean).join('<br>'), 1)}
          ${row('경력 · 차 · 근무 형태', [p.experience ? esc(p.experience) : '', typeof p.hasCar === 'boolean' ? (p.hasCar ? '차 있음' : '차 없음') : '', esc(wtL(p.workTypes)), esc(startLabel(p.startDate))].filter(Boolean).join(' · '), 2)}
          ${row('나이대 · 성별 · 비자', who, 3)}
          ${row('자격증 · 희망 시급', extra, 4)}
        </div>
        <div class="ksp-sec">
          <div class="ksp-sec-title"><span>본인만 보는 정보</span><span>사장님에게 보이지 않습니다</span></div>
          ${row('새 일자리 알림', esc(alertL) + (al && al.email ? ' · ' + esc(al.email) : ''), 5, true)}
        </div>
        <div class="ksp-prof-foot">
          <button type="button" class="ksp-btn" data-kjp="status">${found ? '다시 구합니다' : '구했습니다'}</button>
          <button type="button" class="ksp-btn danger" data-kjp="delete">프로필 삭제</button>
        </div>
      </div>`;
  }
  function rerenderCard() {
    if (!hostEl) return;
    const old = $('[data-kjp-card]', hostEl);
    if (old) old.outerHTML = renderCard(profile); else hostEl.insertAdjacentHTML('beforeend', renderCard(profile));
    wireCard();
  }
  function wireCard() {
    const card = $('[data-kjp-card]', hostEl); if (!card) return;
    card.addEventListener('click', async e => {
      const b = e.target.closest('[data-kjp]'); if (!b) return;
      const act = b.dataset.kjp;
      if (act === 'create') { openModal(null, { quick: true }); return; }
      if (act === 'edit') { openModal(profile); return; }
      if (act === 'step') { openModal(profile, { startStep: Number(b.dataset.step) || 1 }); return; }
      if (act === 'preview') { openPreview(); return; }
      if (act === 'delete') { await deleteProfile(); return; }
      if (act === 'resume') { await patch({ visible: true, pausedAt: deleteField() }, '다시 켰습니다.'); return; }
      if (act === 'status') {
        const found = profile && profile.status === 'found';
        if (found) await patch({ status: 'looking', visible: true }, '다시 구하는 중으로 바꿨습니다.');
        else await patch({ status: 'found', visible: false }, '축하드립니다. 프로필은 비공개로 바뀝니다.');
      }
    });
    const sw = $('[data-kjp="visible"]', card);
    if (sw) sw.addEventListener('change', async () => {
      const on = sw.checked;
      const ok = await patch(on ? { visible: true, pausedAt: deleteField() } : { visible: false }, on ? '활성화했습니다.' : '비활성화했습니다. 켜기 전까지 알림도 오지 않습니다.');
      if (!ok) sw.checked = !on;
    });
  }
  async function patch(fields, okMsg) {
    if (!me || !db) return false;
    try {
      await updateDoc(doc(db, 'job_profiles', me.uid), Object.assign({ lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() }, fields));
      await loadProfile(true); rerenderCard(); if (okMsg) toast(okMsg); return true;
    } catch (e) { console.warn('[job-profile] 변경 실패', e); toast('변경하지 못했습니다. 잠시 후 다시 시도해 주십시오.'); return false; }
  }
  async function deleteProfile() {
    if (!me || !db || !profile) return;
    if (!confirm('Job 프로필을 삭제하시겠습니까? 조건·알림 설정이 모두 지워지고 되돌릴 수 없습니다.')) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'job_profiles', me.uid)); batch.delete(doc(db, 'job_private', me.uid));
      await batch.commit();
      clearDraft(); profile = null; priv = null;
      try { localStorage.setItem(HAS_KEY, JSON.stringify({ uid: me.uid, has: false })); } catch (_) {}
      rerenderCard(); toast('Job 프로필을 삭제했습니다.');
    } catch (e) { console.warn('[job-profile] 삭제 실패', e); toast('삭제하지 못했습니다. 잠시 후 다시 시도해 주십시오.'); }
  }

  // ── 작성 모달 ──
  let ovl = null, draft = null, step = 1, editing = false, quick = false, single = false, openedDay = '';
  const totalSteps = () => (quick ? QUICK_STEPS : TOTAL_STEPS);
  function blankDraft() {
    return { industries: [], suburbs: [], radiusKm: 5, workTypes: [], startDate: todayStr(), payMin: '', visa: '',
             licenses: [], hasCar: null, experience: '', ageBand: '', gender: '', homeSuburb: null,
             nick: '', visible: true, alertMode: 'threshold5', alertEmail: (me && me.email) || '' };
  }
  function fromProfile(p) {
    const d = blankDraft(), q = priv || {};
    d.industries = (p.industries || []).slice(0, MAX_INDUSTRIES);
    d.suburbs = (p.suburbs || []).slice(0, MAX_SUBURBS).map(s => ({ name: s.name, state: s.state, postcode: s.postcode || '', lat: s.lat, lng: s.lng, km: s.km || 0, all: !!s.all }));
    d.radiusKm = RADII.includes(Number(p.radiusKm)) ? Number(p.radiusKm) : 5;
    d.workTypes = (p.workTypes || []).slice(); d.startDate = p.startDate || todayStr(); d.payMin = p.payMin != null ? String(p.payMin) : '';
    d.visa = p.visa || ''; d.licenses = (p.licenses || []).slice(); d.hasCar = typeof p.hasCar === 'boolean' ? p.hasCar : null; d.experience = p.experience || '';
    d.ageBand = p.ageBand || ''; d.gender = p.gender || ''; d.homeSuburb = p.homeSuburb ? Object.assign({}, p.homeSuburb) : null;
    d.nick = p.nick || ''; d.visible = p.visible !== false;
    d.alertMode = (q.alerts && q.alerts.mode) || 'threshold5'; d.alertEmail = (q.alerts && q.alerts.email) || (me && me.email) || '';
    return d;
  }
  function loadDraft() { try { const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (raw && raw.uid === (me && me.uid) && raw.draft) return { draft: Object.assign(blankDraft(), raw.draft), step: Math.min(Math.max(1, raw.step || 1), totalSteps()) }; } catch (_) {} return null; }
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ uid: me && me.uid, draft, step })); } catch (_) {} }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

  function mountModal() {
    injectCss();
    if (ovl) return;
    ovl = document.createElement('div'); ovl.className = 'ksp-ovl'; ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true');
    ovl.innerHTML = `
      <div class="ksp-modal">
        <div class="ksp-mhead"><button type="button" class="ksp-btn small" data-kjp-nav="back">뒤로</button><span class="ksp-step" id="kjpStepLabel"></span><button type="button" class="ksp-btn small" data-kjp-nav="close">닫기</button></div>
        <div class="ksp-prog"><i id="kjpProg" style="width:0"></i></div>
        <div class="ksp-mbody" id="kjpBody"></div>
        <div class="ksp-mfoot" id="kjpFoot"></div>
      </div>`;
    document.body.appendChild(ovl);
    ovl.addEventListener('click', e => {
      const nav = e.target.closest('[data-kjp-nav]');
      if (!nav) { if (e.target === ovl && !locked()) closeModal(); return; }
      if (nav.dataset.kjpNav === 'close') { if (!locked()) closeModal(); }
      if (nav.dataset.kjpNav === 'more') { const p = profile; closeModal(); setTimeout(() => openModal(p, { startStep: 4, flow: true }), 60); }
      if (nav.dataset.kjpNav === 'back') { if (step > 1) { collect(); step--; renderStep(); } else if (!locked()) closeModal(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovl.classList.contains('open') && !locked()) closeModal(); });
  }
  // 짧은 등록(11-04b): 끝 화면 전까지는 닫을 수 없다 — 역할 고르면 무조건 하고 넘어가게(사용자 결정). 새로고침해도 임시저장(draft)으로 이어진다.
  let unlocked = false;   // 저장 실패로 잠금을 푼 상태
  function locked() { return quick && !unlocked && step <= totalSteps(); }
  function openModal(existing, opts) {
    if (!me) { if (window.koausAuth && window.koausAuth.openAuthModal) window.koausAuth.openAuthModal(); return; }
    if (window.koausRequireCanPost && !window.koausRequireCanPost(me, window.koausAuth && window.koausAuth.openAuthModal, () => openModal(existing, opts))) return;
    if (!E()) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    mountModal();
    editing = !!existing;
    quick = !!(opts && opts.quick) && !existing; unlocked = false;
    single = !!(existing && opts && opts.startStep && !opts.flow);
    if (existing) { draft = fromProfile(existing); step = (opts && opts.startStep) ? Math.min(Math.max(1, opts.startStep), TOTAL_STEPS) : 1; }
    else { const saved = loadDraft(); draft = saved ? saved.draft : blankDraft(); step = saved ? Math.min(saved.step, totalSteps()) : 1; }
    openedDay = todayStr();
    if (!draft.startDate || draft.startDate < openedDay) draft.startDate = openedDay;
    ovl.classList.toggle('quick', quick); ovl.classList.remove('done'); ovl.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderStep();
    if (!draft.nick) getNick().then(n => { if (draft) draft.nick = n; });
  }
  function closeModal() {
    if (!ovl) return;
    if (step <= totalSteps() && !editing) { try { collect(); } catch (_) {} saveDraft(); }
    ovl.classList.remove('open'); document.body.style.overflow = '';
  }
  function openPreview() {
    if (!profile || !E()) return;
    mountModal();
    draft = fromProfile(profile); editing = true; quick = false; single = false; step = TOTAL_STEPS + 1;
    ovl.classList.remove('quick'); ovl.classList.add('open', 'done'); document.body.style.overflow = 'hidden';
    $('#kjpStepLabel', ovl).textContent = '사장님이 보는 카드';
    $('#kjpProg', ovl).style.width = '100%';
    $('[data-kjp-nav="back"]', ovl).style.visibility = 'hidden'; $('[data-kjp-nav="close"]', ovl).style.visibility = 'visible';
    $('#kjpBody', ovl).innerHTML = '<div class="ksp-help">근처에 일자리를 올리시는 분께 내 조건이 이렇게 보입니다. 닉네임과 조건만 보이고 이메일은 보이지 않습니다. 연락은 채팅으로만 옵니다.</div>' + previewCardHtml();
    $('#kjpFoot', ovl).innerHTML = '';
  }
  function collect() {
    const body = $('#kjpBody', ovl); if (!body) return;
    const v = id => { const el = $('#' + id, body); return el ? el.value : undefined; };
    switch (step) {
      case 2: draft.startDate = v('kjpStart') || draft.startDate; draft.experience = (v('kjpExp') || '').trim(); break;
      case 4: draft.payMin = (v('kjpPay') || '').trim(); break;
      case 5: draft.alertEmail = (v('kjpAlertEmail') || '').trim(); break;
    }
  }
  const chipsHtml = (name, items, selected, multi) => `<div class="ksp-chips" data-chips="${name}" data-multi="${multi ? 1 : 0}">` +
    items.map(it => `<button type="button" class="ksp-opt" data-val="${esc(it.code)}" aria-pressed="${(multi ? selected.indexOf(it.code) !== -1 : selected === it.code) ? 'true' : 'false'}">${esc(it.label)}</button>`).join('') + '</div>';
  const boolChips = (name, val) => chipsHtml(name, [{ code: 'no', label: '아니오' }, { code: 'yes', label: '예' }], val === true ? 'yes' : (val === false ? 'no' : ''), false);

  function previewCardHtml() {
    const en = E();
    const tags = [draft.visa ? en.label('visas', draft.visa) : '', draft.gender ? en.label('genders', draft.gender) : '', draft.ageBand ? en.label('ageBands', draft.ageBand) : ''].filter(Boolean);
    const subs = draft.suburbs.map(x => suburbLabel(x)).join(' · ');
    const extra = [licL(draft.licenses), typeof draft.hasCar === 'boolean' ? (draft.hasCar ? '차 있음' : '차 없음') : ''].filter(Boolean).join(' · ');
    return `
      <div class="ksp-preview">
        <div class="ksp-preview-top"><div><div class="ksp-preview-name">${esc(draft.nick || '닉네임')}</div><div class="ksp-preview-meta">${tags.length ? esc(tags.join(' · ')) : '오늘 활동'}</div></div></div>
        <div class="ksp-preview-sent">${esc(sentenceOf(draft, en))}</div>
        <dl class="ksp-summary">
          <dt>업종</dt><dd>${esc(indL(draft.industries, en) || '—')}</dd>
          <dt>동네</dt><dd>${subs || '—'}${draft.radiusKm && draft.suburbs.some(x => !(x.km || x.all)) ? ' · 반경 ' + esc(draft.radiusKm) + 'km' : ''}</dd>
          <dt>근무</dt><dd>${[esc(wtL(draft.workTypes)), draft.startDate ? esc(startLabel(draft.startDate)) : '', draft.payMin ? '시급 $' + esc(draft.payMin) + '~' : ''].filter(Boolean).join(' · ') || '—'}</dd>
          ${extra ? `<dt>기타</dt><dd>${esc(extra)}</dd>` : ''}
          ${draft.experience ? `<dt>경력</dt><dd>${esc(draft.experience)}</dd>` : ''}
        </dl>
      </div>`;
  }

  function renderStep() {
    const en = E();
    const body = $('#kjpBody', ovl), foot = $('#kjpFoot', ovl);
    const TS = totalSteps();
    $('#kjpStepLabel', ovl).textContent = step <= TS ? (single ? 'Job 프로필 수정' : (step + ' / ' + TS + (quick ? ' · 짧은 등록' : ''))) : '';
    $('#kjpProg', ovl).style.width = Math.min(100, Math.round((step - 1) / TS * 100)) + '%';
    ovl.classList.toggle('done', step > TS);
    $('[data-kjp-nav="back"]', ovl).style.visibility = step > 1 && step <= TS ? 'visible' : 'hidden';
    $('[data-kjp-nav="close"]', ovl).style.visibility = (quick && !unlocked && step <= TS) ? 'hidden' : 'visible';   // 짧은 등록은 끝까지(11-04b)
    let html = '', next = '다음';
    switch (step > TS ? 0 : step) {
      case 1:
        html = `
          <div class="ksp-q">어떤 일을, 어디에서 찾으십니까?</div>
          <div class="ksp-label">업종 <span class="req">(필수, 최대 ${MAX_INDUSTRIES}개)</span></div>
          ${chipsHtml('industries', en.industries, draft.industries, true)}
          <div class="ksp-label">일하고 싶은 동네 <span class="req">(필수, 최대 ${MAX_SUBURBS}곳)</span></div>
          <input class="ksp-input" id="kjpSuburbQ" type="text" placeholder="동네 이름이나 우편번호 — 예: Sunnybank, 4109" autocomplete="off" inputmode="search">
          <ul class="ksp-sug" id="kjpSuburbSug"></ul>
          <div class="ksp-sel" id="kjpSuburbSel"></div>
          <div class="ksp-label">크게 고르기</div>
          ${regionChipsHtml()}
          <div class="ksp-label">동네 기준 반경 <span class="req">(필수)</span></div>
          ${chipsHtml('radiusKm', RADII.map(r => ({ code: String(r), label: r + 'km' })), String(draft.radiusKm || 5), false)}
          <div class="ksp-err" id="kjpErr1"></div>`;
        break;
      case 2:
        html = `
          <div class="ksp-q">${quick ? '경력과 차, 시작 가능일' : '경력과 차, 근무 형태'}</div>
          <div class="ksp-label">경력 한 줄 <span class="req">(필수, 120자)</span></div>
          <input class="ksp-input" id="kjpExp" type="text" maxlength="120" placeholder="예: 식당 주방 1년, 농장 패킹 6개월 (없으면 '경력 없음')" value="${esc(draft.experience)}">
          <div class="ksp-help">사장님이 가장 먼저 보는 칸입니다. 전화번호·카톡 아이디·링크는 넣을 수 없습니다(연락은 채팅으로).</div>
          <div class="ksp-label">차 있음 <span class="req">(필수)</span></div>
          ${boolChips('hasCar', draft.hasCar)}
          ${quick ? '' : `<div class="ksp-label">근무 형태 <span class="req">(선택, 여러 개)</span></div>${chipsHtml('workTypes', WORK_TYPES, draft.workTypes, true)}`}
          <div class="ksp-label">시작 가능일 <span class="req">(필수)</span></div>
          <input class="ksp-input" id="kjpStart" type="date" value="${esc(draft.startDate < openedDay ? openedDay : draft.startDate)}" min="${openedDay}">
          <div class="ksp-chips"><button type="button" class="ksp-opt" data-asap>바로 가능</button></div>
          ${quick ? '<div class="ksp-help">등록하면 바로 프로필이 만들어집니다. 나머지는 프로필 설정에서 추가할 수 있습니다.</div>' : ''}
          <div class="ksp-err" id="kjpErr2"></div>`;
        if (quick) next = '등록';   // 11-08: 짧은 등록은 2단계에서 끝
        break;
      case 3:
        html = `
          <div class="ksp-q">본인에 대해 알려 주십시오. <span class="ksp-dim">(선택)</span></div>
          <div class="ksp-help">사장님에게는 닉네임 <b>${esc(draft.nick || '')}</b>과 아래 항목만 보입니다(실명·사진 없음). 비워 두어도 됩니다.</div>
          <div class="ksp-label">나이대 <span class="req">(선택)</span></div>
          ${chipsHtml('ageBand', en.ageBands, draft.ageBand, false)}
          <div class="ksp-label">성별 <span class="req">(선택)</span></div>
          ${chipsHtml('gender', en.genders, draft.gender, false)}
          <div class="ksp-label">비자 <span class="req">(선택)</span></div>
          <div class="ksp-help">만료일은 받지 않습니다.</div>
          ${chipsHtml('visa', en.visas, draft.visa, false)}
          <div class="ksp-err" id="kjpErr3"></div>`;
        break;
      case 4:
        html = `
          <div class="ksp-q">자격증 · 희망 시급</div>
          <div class="ksp-help">고르지 않으면 "없음"으로 저장됩니다.</div>
          <div class="ksp-label">자격증 <span class="req">(선택, 여러 개)</span></div>
          ${chipsHtml('licenses', LICENSES, draft.licenses, true)}
          <div class="ksp-label">희망 시급(AUD) <span class="req">(선택, 최소)</span></div>
          <input class="ksp-input" id="kjpPay" type="number" inputmode="numeric" min="0" max="200" step="1" placeholder="예: 28" value="${esc(draft.payMin)}">
          <div class="ksp-help">비워 두면 "상관없음"으로 저장됩니다.</div>
          <div class="ksp-err" id="kjpErr4"></div>`;
        break;
      case 5:
        html = `
          <div class="ksp-q">공개와 알림을 정해 주십시오.</div>
          <div class="ksp-help">근처에 일자리를 올리시는 분께 내 조건이 이렇게 보입니다.</div>
          ${previewCardHtml()}
          <label class="ksp-switch"><input type="checkbox" id="kjpVisible" ${draft.visible ? 'checked' : ''}> 내 조건 활성화 (근처 사장님에게 공개)</label>
          <div class="ksp-label">새 일자리 알림 <span class="req">(필수)</span></div>
          ${chipsHtml('alertMode', [{ code: 'instant', label: '새 일자리마다' }, { code: 'threshold5', label: '5건 이상 모이면' }, { code: 'daily', label: '하루 한 번' }, { code: 'off', label: '받지 않음' }], draft.alertMode, false)}
          <div class="ksp-label">알림 받을 이메일 <span class="req">(필수)</span></div>
          <input class="ksp-input" id="kjpAlertEmail" type="email" maxlength="120" value="${esc(draft.alertEmail)}" placeholder="로그인 이메일">
          <div class="ksp-err" id="kjpErr5"></div>`;
        next = editing ? '저장' : '완료';
        break;
      default: {
        const on = !!(profile && profile.visible !== false);
        html = `
          <div class="ksp-done">
            <div class="ksp-q">${editing ? '저장했습니다.' : 'Job 프로필이 만들어졌습니다.'}</div>
            <div class="ksp-help">${on ? '근처에 일자리를 올리시는 분께 내 조건이 이렇게 보입니다.' : '지금은 꺼져 있어 사장님에게 보이지 않고 알림도 오지 않습니다.'} 닉네임과 조건만 보이고 이메일은 보이지 않습니다. 연락은 채팅으로만 옵니다.</div>
            ${previewCardHtml()}
            <label class="ksp-switch ksp-prof-switch"><span class="ksp-switch-txt"><span>${on ? '조건 활성화 · 알림 활성화' : '조건 비활성화 · 알림 비활성화'}</span></span><input type="checkbox" id="kjpVisibleDone" ${on ? 'checked' : ''}></label>
            ${quick && !editing ? '<div class="ksp-help">추후 프로필 설정에서 변경 가능합니다. 새 일자리 알림은 프로필이 켜져 있을 때만 로그인 이메일로, 5건 이상 모이면 보냅니다.</div>' : ''}
            <div class="ksp-done-actions">
              <a class="ksp-btn primary" href="jobs.html">조건에 맞는 일자리 보러 가기</a>
              ${quick && !editing ? '<button type="button" class="ksp-btn" data-kjp-nav="more">프로필 더 채우기</button>' : ''}
            </div>
          </div>`;
        next = '';
      }
    }
    if (single && step <= TS) next = '저장';
    body.innerHTML = html;
    const doneSw = $('#kjpVisibleDone', body);
    if (doneSw) doneSw.addEventListener('change', async () => {
      const on = doneSw.checked;
      try {
        await updateDoc(doc(db, 'job_profiles', me.uid), { visible: on, lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await loadProfile(true); if (hostEl) rerenderCard();
        try { const sm = doneSw.closest('.ksp-switch').querySelector('.ksp-switch-txt > span'); if (sm) sm.textContent = on ? '조건 활성화 · 알림 활성화' : '조건 비활성화 · 알림 비활성화'; } catch (_) {}
        toast(on ? '활성화했습니다.' : '비활성화했습니다. 켜기 전까지 알림도 오지 않습니다.');
      } catch (e) { doneSw.checked = !on; toast('변경하지 못했습니다. 잠시 후 다시 시도해 주십시오.'); }
    });
    foot.innerHTML = next ? `<button type="button" class="ksp-btn primary" id="kjpNext">${next}</button>` : '';
    wireStep();
    if (step === 1 || step === 5) { const q = body.querySelector('input[type=text]'); if (q) { try { q.focus({ preventScroll: true }); } catch (_) {} } }
  }
  function wireStep() {
    const body = $('#kjpBody', ovl);
    body.querySelectorAll('[data-chips]').forEach(group => {
      group.addEventListener('click', e => {
        const b = e.target.closest('.ksp-opt'); if (!b) return;
        const name = group.dataset.chips, multi = group.dataset.multi === '1', val = b.dataset.val;
        if (multi) {
          const arr = Array.isArray(draft[name]) ? draft[name] : [];
          const i = arr.indexOf(val);
          if (i === -1) { if (name === 'industries' && arr.length >= MAX_INDUSTRIES) { toast('업종은 ' + MAX_INDUSTRIES + '개까지 고를 수 있습니다.'); return; } arr.push(val); } else arr.splice(i, 1);
          draft[name] = arr; b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
        } else {
          if (name === 'hasCar') draft.hasCar = (val === 'yes');
          else if (name === 'radiusKm') draft.radiusKm = Number(val);
          else draft[name] = (draft[name] === val && name !== 'alertMode') ? '' : val;   // 11-05: 비자도 선택이라 다시 누르면 해제
          group.querySelectorAll('.ksp-opt').forEach(x => x.setAttribute('aria-pressed', x === b && (draft[name] !== '' && draft[name] !== null) ? 'true' : 'false'));
        }
      });
    });
    const next = $('#kjpNext', ovl); if (next) next.addEventListener('click', onNext);
    if (step === 1) { wireSuburb(body); wireRegionChips(body); try { if (window.koausGeo) window.koausGeo.ready(); } catch (_) {} }
    if (step === 2) { const asap = $('[data-asap]', body); if (asap) asap.addEventListener('click', () => { $('#kjpStart', body).value = openedDay || todayStr(); }); }
  }

  // ── 동네 검색(koaus-geo.js) ──
  async function geocodeSuburb(text) {
    if (!window.koausGeo) { console.warn('[job-profile] koaus-geo.js 가 없습니다'); return []; }
    try { return await window.koausGeo.suburbs(text); } catch (e) { return []; }
  }
  let sugTimer = null, sugSeq = 0;
  function bindSuggest(q, sug, onPick) {
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
      hide();
      if (h.approx && window.koausGeo) { try { h = await window.koausGeo.refine(h); } catch (_) {} }
      onPick({ name: h.name, state: h.state, postcode: h.postcode || '', lat: Number(h.lat), lng: Number(h.lng) });
    });
    document.addEventListener('click', e => { if (!sug.contains(e.target) && e.target !== q) hide(); });
  }
  function wireSuburb(body) {
    const q = $('#kjpSuburbQ', body), sug = $('#kjpSuburbSug', body);
    renderSuburbSel();
    bindSuggest(q, sug, item => {
      if (draft.suburbs.length >= MAX_SUBURBS) { $('#kjpErr1', body).textContent = '동네는 ' + MAX_SUBURBS + '곳까지 넣을 수 있습니다.'; return; }
      if (!draft.suburbs.some(s => s.name === item.name && s.state === item.state)) draft.suburbs.push(item);
      q.value = ''; $('#kjpErr1', body).textContent = ''; renderSuburbSel();
    });
  }
  function regionChipsHtml() {
    const list = (window.koausGeo && window.koausGeo.REGIONS) || [];
    const st = (draft.suburbs[0] && draft.suburbs[0].state) || '';
    const ordered = st ? list.filter(r => r.state === st).concat(list.filter(r => r.state !== st)) : list;
    const states = (window.koausGeo && window.koausGeo.STATE_REGIONS) || [];
    const sOrdered = st ? states.filter(r => r.state === st).concat(states.filter(r => r.state !== st)) : states;
    return `<div class="ksp-chips" id="kjpRegionChips">${ordered.map(r => `<button type="button" class="ksp-opt" data-region="${esc(r.code)}" aria-pressed="${draft.suburbs.some(x => x.km && x.name === r.name) ? 'true' : 'false'}">${esc(r.name)}</button>`).join('')}</div>
          <div class="ksp-label">주 전체 고르기</div>
          <div class="ksp-chips" id="kjpStateChips">${sOrdered.map(r => `<button type="button" class="ksp-opt" data-region="${esc(r.code)}" aria-pressed="${draft.suburbs.some(x => x.all && x.state === r.state) ? 'true' : 'false'}">${esc(r.name)}</button>`).join('')}</div>`;
  }
  function wireRegionChips(body) {
    body.querySelectorAll('#kjpRegionChips, #kjpStateChips').forEach(box => box.addEventListener('click', e => {
      const b = e.target.closest('[data-region]'); if (!b) return;
      const it = window.koausGeo && window.koausGeo.regionItem(b.dataset.region); if (!it) return;
      const i = draft.suburbs.findIndex(x => (x.km || x.all) && x.name === it.name && x.state === it.state);
      if (i !== -1) { draft.suburbs.splice(i, 1); b.setAttribute('aria-pressed', 'false'); }
      else {
        if (draft.suburbs.length >= MAX_SUBURBS) { $('#kjpErr1', body).textContent = '동네·지역은 ' + MAX_SUBURBS + '곳까지 넣을 수 있습니다.'; return; }
        draft.suburbs.push(it); b.setAttribute('aria-pressed', 'true'); $('#kjpErr1', body).textContent = '';
      }
      renderSuburbSel();
    }));
  }
  function renderSuburbSel() {
    const sel = $('#kjpSuburbSel', ovl); if (!sel) return;
    // 11-08(지시 10): 첫 동네가 지도 첫 화면의 기준. 다른 동네 이름을 누르면 앞으로 옮겨 기준이 바뀐다.
    sel.innerHTML = draft.suburbs.map((s, i) => `<span class="ksp-chip on"><button type="button" class="ksp-chip-name" data-first="${i}" title="${i ? '지도 기준으로' : '지도 기준'}">${suburbLabel(s)}</button>${i === 0 && draft.suburbs.length > 1 ? '<small class="ksp-pin">지도 기준</small>' : ''}<button type="button" data-rm="${i}" aria-label="빼기">×</button></span>`).join('') + (draft.suburbs.length > 1 ? '<div class="ksp-help ksp-first-help">첫 동네가 지도 첫 화면의 기준입니다. 다른 동네를 누르면 기준이 바뀝니다.</div>' : '');
    sel.querySelectorAll('[data-first]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.first); if (!i) return; const it = draft.suburbs.splice(i, 1)[0]; draft.suburbs.unshift(it); renderSuburbSel(); }));
    sel.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { draft.suburbs.splice(Number(b.dataset.rm), 1); renderSuburbSel(); try { ovl.querySelectorAll('#kjpRegionChips [data-region], #kjpStateChips [data-region]').forEach(c => { const it = window.koausGeo.regionItem(c.dataset.region); c.setAttribute('aria-pressed', it && draft.suburbs.some(x => (x.km || x.all) && x.name === it.name && x.state === it.state) ? 'true' : 'false'); }); } catch (_) {} }));
  }

  // ── 검증·저장 ──
  function validate() {
    const body = $('#kjpBody', ovl); const err = $('#kjpErr' + step, body);
    const set = m => { if (err) err.textContent = m; return !m; };
    switch (step) {
      case 1:
        if (!draft.industries.length) return set('업종을 하나 이상 골라 주십시오.');
        if (!draft.suburbs.length) return set('동네를 한 곳 이상 골라 주십시오.');
        return set('');
      case 2: {
        if (!draft.experience) return set("경력을 한 줄 적어 주십시오. 없으면 '경력 없음'이라고 적으시면 됩니다.");
        if (typeof draft.hasCar !== 'boolean') return set('차가 있는지 골라 주십시오.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) return set('시작 가능일을 골라 주십시오.');
        if (openedDay && draft.startDate < openedDay) return set('시작 가능일은 오늘 이후로 골라 주십시오.');
        if (draft.experience.length > 120) return set('경력은 120자 이내로 적어 주십시오.');
        if (CONTACT_RE.test(draft.experience)) return set('전화번호·카톡 아이디·링크는 넣을 수 없습니다. 연락은 채팅으로 옵니다.');
        return set('');
      }
      case 3: return set('');
      case 4:
        if (draft.payMin !== '' && (!Number.isFinite(Number(draft.payMin)) || Number(draft.payMin) < 0 || Number(draft.payMin) > 200)) return set('희망 시급을 확인해 주십시오. (0~200)');
        return set('');
      case 5:
        if (!draft.alertMode) return set('알림 방식을 골라 주십시오.');
        if (draft.alertMode !== 'off' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.alertEmail)) return set('알림 받을 이메일을 확인해 주십시오.');
        return set('');
    }
    return true;
  }
  async function onNext() {
    collect();
    if (step === totalSteps()) { const vis = $('#kjpVisible', ovl); if (vis) draft.visible = !!vis.checked; }
    if (!validate()) return;
    if (single) { await save(); return; }
    if (step < totalSteps()) { step++; if (!editing) saveDraft(); renderStep(); return; }
    await save();
  }
  function buildDocs(nick) {
    const d = {
      industries: draft.industries.slice(0, MAX_INDUSTRIES),
      suburbs: draft.suburbs.slice(0, MAX_SUBURBS).map(s => { const o = { name: s.name, state: s.state, lat: Number(s.lat), lng: Number(s.lng) }; if (s.postcode) o.postcode = String(s.postcode).slice(0, 4); if (s.km) o.km = Math.min(60, Math.max(1, Math.round(Number(s.km)))); if (s.all) o.all = true; return o; }),
      states: Array.from(new Set(draft.suburbs.map(s => s.state))).slice(0, 5),
      radiusKm: RADII.includes(Number(draft.radiusKm)) ? Number(draft.radiusKm) : 5,
      startDate: draft.startDate,
      nick, visible: !!draft.visible,
      status: (profile && profile.status === 'found' && editing) ? 'found' : 'looking',
      step: quick ? QUICK_STEPS : TOTAL_STEPS,
      lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp(),
      createdAt: (editing && profile && profile.createdAt) ? profile.createdAt : serverTimestamp(),
    };
    if (draft.payMin !== '' && Number.isFinite(Number(draft.payMin))) d.payMin = Math.round(Number(draft.payMin));
    if (draft.workTypes.length) d.workTypes = draft.workTypes.slice(0, 3);   // 11-08: 근무 형태는 선택(짧은 등록은 받지 않음, 규칙도 선택)
    if (draft.licenses.length) d.licenses = draft.licenses.slice(0, 8);
    if (typeof draft.hasCar === 'boolean') d.hasCar = draft.hasCar;
    if (draft.experience) d.experience = draft.experience.slice(0, 120);
    if (draft.visa) d.visa = draft.visa;   // 11-05: 비자는 선택
    if (draft.ageBand) d.ageBand = draft.ageBand;
    if (draft.gender) d.gender = draft.gender;
    // 11-05: 사는 곳(homeSuburb)은 받지 않는다(일하고 싶은 동네만)
    const p = {
      alerts: quick ? { enabled: true, mode: 'threshold5', email: String((me && me.email) || '').slice(0, 120) }
                    : { enabled: draft.alertMode !== 'off', mode: draft.alertMode, email: draft.alertEmail.slice(0, 120) },
      updatedAt: serverTimestamp(),
    };
    return { pub: d, priv: p };
  }
  async function save() {
    const btn = $('#kjpNext', ovl); if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    try {
      let nick = draft.nick || (await getNick()) || '회원';
      if (/([0-9][ .-]?){6,}|https?:|www[.]/i.test(nick)) nick = '회원';   // 규칙이 막는 닉(숫자 6자리 이상·링크)은 '회원'으로 — 짧은 등록이 영영 막히지 않게(11-04b)
      const docs = buildDocs(nick);
      const batch = writeBatch(db);
      batch.set(doc(db, 'job_profiles', me.uid), docs.pub);
      batch.set(doc(db, 'job_private', me.uid), docs.priv, { merge: !!quick });
      await batch.commit();
      clearDraft();
      try { if (window.koausGeo && docs.pub.suburbs[0]) window.koausGeo.saveProfileCenter(docs.pub.suburbs[0]); } catch (_) {}
      await loadProfile(true);
      if (hostEl) rerenderCard();
      step = totalSteps() + 1; renderStep();
    } catch (e) {
      console.warn('[job-profile] 저장 실패', e);
      const denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      const errEl = $('#kjpErr' + step, ovl) || $('#kjpErr5', ovl);
      if (errEl) errEl.textContent = denied ? (quick ? '저장할 수 없는 내용이 있습니다. 휴대폰 인증이 되어 있는지 확인해 주십시오. 계속 안 되면 닫고 마이페이지에서 다시 시도해 주십시오.' : '저장할 수 없는 내용이 있습니다. 경력에 연락처·링크가 없는지, 휴대폰 인증이 되어 있는지 확인해 주십시오.') : '저장하지 못했습니다. 잠시 후 다시 시도해 주십시오.';
      if (quick) { unlocked = true; try { $('[data-kjp-nav="close"]', ovl).style.visibility = 'visible'; } catch (_) {} }   // 짧은 등록 잠금은 저장 실패 시 풀어 준다(갇히지 않게, 11-04b)
      if (btn) { btn.disabled = false; btn.textContent = (editing || single) ? '저장' : (quick ? '등록' : '완료'); }
    }
  }

  // ═══ 사장님 쪽 — 근처에서 일 구하는 분(jobs.html 도구줄 [워커 구하기]) ═══
  //   11-08(지시 18): 목록 대신 → 상세 필터 시트(동네 혹은 주 최대 3곳 · 반경 · 업종 · 정렬 · 성별) → 바로 카드 넘겨 보기(koaus-people-deck.js).
  //   매칭 = 동네: 거리 ≤ max(내 반경, 그 사람 반경·큰 지역 km) 또는 그 사람이 주 전체. 주: 그 사람 states 에 그 주. 함수 규칙(11-04b)과 같음.
  const FILTER_KEY = 'koaus-jobpeople-filter-v2';
  const MAX_CENTERS = 3;
  const JSORTS = { near: '가까운 순', new: '최신 등록 순' };
  const JGENDERS = { all: '전체', female: '여성', male: '남성' };
  const JSTATES = [['qld', 'QLD'], ['nsw', 'NSW'], ['vic', 'VIC'], ['wa', 'WA'], ['sa', 'SA'], ['act', 'ACT'], ['tas', 'TAS'], ['nt', 'NT']];
  let pg = null, busy = false, deckList = [];
  const deck = () => window.koausPeopleDeck || null;
  function injectPageCss() {
    if (document.getElementById('kjpPageStyle')) return;
    const st = document.createElement('style'); st.id = 'kjpPageStyle';
    st.textContent = `
      .kjp-hero{padding:20px 16px 14px}.kjp-nick{font-size:24px;font-weight:800;letter-spacing:-.02em}.kjp-meta{font-size:14px;color:var(--text-muted);margin-top:4px}
      .kjp-sec{padding:12px 16px;border-top:1px solid var(--border)}.kjp-sec h4{font-size:12.5px;color:var(--text-muted);margin:0 0 6px;font-weight:600}.kjp-line{font-size:15.5px;line-height:1.6;word-break:keep-all}
      .kjp-rows{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14px;margin:0}.kjp-rows dt{color:var(--text-muted)}.kjp-rows dd{margin:0}
      .kjp-sheet{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9060;display:none;align-items:flex-end;justify-content:center}
      .kjp-sheet.open{display:flex}
      .kjp-sheet-box{width:100%;max-width:560px;background:var(--bg-base);color:var(--text-primary);border-radius:18px 18px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow:auto;box-sizing:border-box}
      @media(min-width:640px){.kjp-sheet{align-items:center}.kjp-sheet-box{border-radius:18px}}
      .kjp-sheet h3{margin:0 0 6px;font-size:16px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
      .kjp-lab{font-size:12.5px;color:var(--text-muted);font-weight:700;margin:12px 0 6px;display:flex;gap:6px;align-items:baseline}
      .kjp-lab .ksp-dim{font-weight:500}
      .kjp-opt{appearance:none;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);border-radius:999px;padding:7px 12px;font-size:13px;cursor:pointer;font-family:inherit}
      .kjp-opt[aria-pressed="true"]{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
      .kjp-opt.addr{border-radius:10px}
      .kjp-chips{display:flex;flex-wrap:wrap;gap:6px}
      .kjp-sheet input{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:inherit;background:var(--bg-base);color:var(--text-primary)}
      .kjp-sheet input:focus{outline:none;border-color:var(--border-focus,var(--text-primary))}
      .kjp-sheet .ksp-sug{margin-top:4px;max-height:200px;overflow:auto}
      .kjp-centers{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:4px}
      .kjp-center{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;padding:5px 8px 5px 11px;border-radius:999px;background:var(--accent);color:var(--accent-text)}
      .kjp-center button{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:0 2px}
      .kjp-lnk{appearance:none;border:0;background:none;color:var(--text-primary);font-size:14px;cursor:pointer;font-family:inherit;padding:4px 0}.kjp-lnk.muted{color:var(--text-muted)}
      .kjp-apply{margin-top:16px;appearance:none;border:0;background:var(--text-primary);color:var(--bg-base);border-radius:12px;padding:13px;font-size:15px;font-weight:800;font-family:inherit;width:100%;cursor:pointer}
      .kjp-apply:disabled{opacity:.5;cursor:default}`;
    document.head.appendChild(st);
  }
  const CONTACTED_KEY = 'koaus-contacted-jobseekers-v1';
  function contactedMap() { try { const m = JSON.parse(localStorage.getItem(CONTACTED_KEY) || '{}'); return (me && m && m[me.uid] && typeof m[me.uid] === 'object') ? m[me.uid] : {}; } catch (_) { return {}; } }
  function isContacted(uid) { return !!contactedMap()[uid]; }
  function markContacted(uid, on) { try { if (!me) return; const all = JSON.parse(localStorage.getItem(CONTACTED_KEY) || '{}') || {}; const mine = (all[me.uid] && typeof all[me.uid] === 'object') ? all[me.uid] : {}; if (on) mine[uid] = Date.now(); else delete mine[uid]; all[me.uid] = mine; localStorage.setItem(CONTACTED_KEY, JSON.stringify(all)); } catch (_) {} }
  async function loadMyJobPosts(uid) {
    const out = [];
    try {
      const snap = await getDocs(query(collection(db, 'jobs_posts'), where('uid', '==', uid), limit(5)));
      snap.docs.forEach(d => {
        const p = d.data() || {};
        const lat = Number(p.lat), lng = Number(p.lng); const st = String(p.state || '').toLowerCase();
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !st) return;
        const name = String(p.suburb || '').trim() || (String(p.address || p.region || '').match(/([A-Za-z][A-Za-z' .-]{1,40}?)\s*,?\s+(QLD|NSW|VIC|WA|SA|TAS|ACT|NT)\b/i) || [])[1] || String(p.title || '내 글').slice(0, 30);
        out.push({ name: name.replace(/^.*,\s*/, '').trim().slice(0, 40), state: st, lat, lng });
      });
    } catch (e) { console.warn('[job-profile] 내 구인 글 조회 실패', e); }
    return out;
  }
  // 구하는 사람 쪽 '닿는 반경' — 함수와 같은 규칙(11-04b): 동네마다 '그 사람 반경 또는 큰 지역 km' 안이면 맞음, 주 전체(all)는 같은 주면 맞음
  function reachOf(x, center) {
    let km = null, reach = Number(x.radiusKm) || 0, wide = false, hit = false;
    (Array.isArray(x.suburbs) ? x.suburbs : []).forEach(s => {
      if (s.all) { if (s.state && center && s.state === center.state) wide = true; return; }   // 11-08: 주 전체는 거리 계산에서 뺀다
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
      const k = kmBetween(center, s);
      if (km == null || k < km) km = k;
      if (k <= Math.max(Number(x.radiusKm) || 0, Number(s.km) || 0)) hit = true;
    });
    if ((wide || hit) && km != null) reach = Math.max(reach, km);
    return { km, reach, wide };
  }
  function matchOf(x, centers, radius) {
    let best = null;
    (centers || []).forEach(c => {
      if (c.all) {
        const inState = (Array.isArray(x.states) && x.states.includes(c.state)) || (Array.isArray(x.suburbs) && x.suburbs.some(s => s.state === c.state));
        if (inState && !best) best = { km: null, reach: 0, wide: true, center: c };
        return;
      }
      const r = reachOf(x, c);
      const near = r.km != null && r.km <= Math.max(radius, r.reach || 0);
      if (!(r.wide || near)) return;
      const cand = { km: r.km, reach: r.reach, wide: r.wide && !near, center: c };
      if (!best || best.km == null || (cand.km != null && cand.km < best.km)) best = cand;
    });
    return best;
  }
  async function fetchForCenters(centers) {
    const states = Array.from(new Set((centers || []).map(c => c.state).filter(Boolean))).slice(0, 10);
    if (!states.length) return [];
    const byState = states.length === 1 ? where('states', 'array-contains', states[0]) : where('states', 'array-contains-any', states);
    const snap = await getDocs(query(collection(db, 'job_profiles'), byState, where('visible', '==', true), orderBy('lastActiveAt', 'desc'), limit(20)));
    return snap.docs.filter(d => !me || d.id !== me.uid).map(d => ({ uid: d.id, p: d.data() || {} }));
  }
  function filtered() {
    const list = [];
    (pg.all || []).forEach(x => {
      const m = matchOf(x.p, pg.centers, pg.radius); if (!m) return;
      if (pg.industry && !(x.p.industries || []).includes(pg.industry)) return;
      if (pg.gender !== 'all' && x.p.gender !== pg.gender) return;
      list.push(Object.assign({ uid: x.uid, p: x.p }, m));
    });
    const ms = ts => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : 0;
    if (pg.sort === 'new') list.sort((a, b) => ms(b.p.createdAt) - ms(a.p.createdAt));
    else list.sort((a, b) => (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km));
    return list;
  }
  const kmText = it => it.wide ? '주 전체' : (it.km != null ? (it.km < 1 ? '1km 이내' : '약 ' + Math.round(it.km) + 'km') : '');
  // 카드 안 HTML(deck 이 그림)
  function cardBody(it, ctx) {
    const en = E(); const p = it.p;
    const nick = String(p.nick || '').trim() || '회원';
    const meta = [p.visa ? en.label('visas', p.visa) : '', p.gender ? en.label('genders', p.gender) : '', p.ageBand ? en.label('ageBands', p.ageBand) : ''].filter(Boolean);
    const k = kmText(it); if (k) meta.push(k + (ctx && ctx.showCenter && it.center && it.center.name && !it.wide ? ' · ' + it.center.name : ''));
    const subs = (p.suburbs || []).map(suburbLabel).join(' · ');
    const extra = [licL(p.licenses), typeof p.hasCar === 'boolean' ? (p.hasCar ? '차 있음' : '차 없음') : ''].filter(Boolean).join(' · ');
    return `
      <div class="kjp-hero"><div class="kjp-nick">${esc(nick)}</div><div class="kjp-meta">${esc(meta.join(' · '))}</div></div>
      <div class="kjp-sec"><h4>찾는 일</h4><div class="kjp-line">${esc(sentenceOf(p, en))}</div></div>
      <div class="kjp-sec"><h4>자세히</h4><dl class="kjp-rows">
        <dt>업종</dt><dd>${esc(indL(p.industries, en) || '—')}</dd>
        <dt>동네</dt><dd>${subs || '—'}${p.radiusKm && (p.suburbs || []).some(x => !(x.km || x.all)) ? ' (반경 ' + esc(p.radiusKm) + 'km)' : ''}</dd>
        <dt>근무</dt><dd>${[esc(wtL(p.workTypes)), p.startDate ? esc(startLabel(p.startDate)) : '', p.payMin ? '시급 $' + esc(p.payMin) + ' 이상' : ''].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>비자</dt><dd>${esc(en.label('visas', p.visa) || '—')}</dd>
        ${extra ? `<dt>기타</dt><dd>${esc(extra)}</dd>` : ''}
        ${p.experience ? `<dt>경력</dt><dd>${esc(p.experience)}</dd>` : ''}
      </dl></div>
      <div class="kjp-sec"><div class="ksp-help">이메일·연락처는 보이지 않습니다. 연락은 채팅으로만 됩니다.</div></div>`;
  }
  function emptyHtml() {
    const nextR = pg ? RADII[RADII.indexOf(pg.radius) + 1] : null;
    const hasSuburb = !!(pg && (pg.centers || []).some(c => !c.all));
    return `<b>조건에 맞는 분이 아직 없습니다.</b><span>동네나 주를 바꾸거나, 업종을 전체로 하거나, 범위를 늘려 보십시오.</span>
      <div class="kpd-empty-btns"><button type="button" class="kpd-btn primary" data-kpd="filter">필터 변경</button>${nextR && hasSuburb ? `<button type="button" class="kpd-btn" data-kjp-wider="${nextR}">범위 늘리기 (${nextR}km)</button>` : ''}</div>`;
  }
  document.addEventListener('click', e => {
    const w = e.target.closest('[data-kjp-wider]'); if (!w || !pg) return;
    pg.radius = Number(w.dataset.kjpWider) || pg.radius; saveFilter(); showResults();
  });
  function openDeck(list, index, ctx) {
    const D = deck(); if (!D) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    injectCss(); injectPageCss();
    deckList = list || [];
    D.open({
      items: deckList, index: index || 0, title: '일 구하는 분', loading: !!(ctx && ctx.loading),
      key: it => it.uid,
      render: it => cardBody(it, ctx),
      compose: it => ({ sent: isContacted(it.uid), preset: '안녕하세요. 찾으시는 일과 맞는 자리가 있어 연락드립니다.' }),
      onSend: (it, text) => sendFromProfile(it.uid, text),
      onReport: it => reportSeeker(it.uid),
      onShare: it => shareWorker(it.uid),
      onFilter: () => openSheet(),
      onShow: it => { if (it && me && db) getDoc(doc(db, 'chats', 'job_' + it.uid + '_' + me.uid)).then(s => { const on = !!(s && s.exists()); markContacted(it.uid, on); if (on && D.isOpen() && D.current() && D.current().uid === it.uid) D.markSent(it.uid); }).catch(() => {}); },
      guard: () => !(sheet && sheet.classList.contains('open')),
      emptyHtml,
      onClose: () => { try { if (/[?&](people=1|worker=)/.test(location.search)) history.replaceState(null, '', location.pathname + (location.search.replace(/[?&](people=1|worker=[^&]*)/g, '').replace(/^&/, '?') || '')); } catch (_) {} },
    });
  }
  function shareWorker(uid) {
    const url = location.origin + '/jobs.html?worker=' + encodeURIComponent(uid);
    const ok = () => toast('링크가 복사되었습니다');
    const no = () => prompt('이 링크를 복사해 주십시오', url);
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, no); else no(); } catch (_) { no(); }
  }
  function loadFilter() { try { return JSON.parse(localStorage.getItem(FILTER_KEY) || 'null'); } catch (_) { return null; } }
  function saveFilter() { try { localStorage.setItem(FILTER_KEY, JSON.stringify({ centers: pg.centers, radius: pg.radius, industry: pg.industry, sort: pg.sort, gender: pg.gender })); } catch (_) {} }
  const sameCenter = (a, b) => !!(a && b && a.state === b.state && !!a.all === !!b.all && (a.all || (a.lat === b.lat && a.lng === b.lng)));
  async function showResults(focusUid) {
    if (!me || !pg) return;
    const D = deck(); if (!D) return;
    const ctx = { radius: pg.radius, showCenter: true };
    const key = pg.centers.map(c => c.state).sort().join(',');
    if (!pg.all || pg.allKey !== key) {
      pg.all = null;
      if (!D.isOpen()) openDeck([], 0, Object.assign({ loading: true }, ctx)); else D.setLoading(true);
      try { pg.all = await fetchForCenters(pg.centers); pg.allKey = key; }
      catch (e) { console.warn('[job-profile] 목록 조회 실패', e); pg.all = []; toast('불러오지 못했습니다. 잠시 후 다시 시도해 주십시오.'); }
    }
    const list = filtered();
    const i = focusUid ? Math.max(0, list.findIndex(x => x.uid === focusUid)) : 0;
    if (!D.isOpen()) openDeck(list, i, ctx); else { deckList = list; D.update(list, i); }
  }
  // ── 상세 필터 시트 ──
  let sheet = null, fillMyChips = null;
  function openSheet() {
    injectCss(); injectPageCss();
    if (!pg) return;
    const en = E(); if (!en) return;
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'kjp-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      document.body.appendChild(sheet);
      sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-kjp-sheet="close"]')) closeSheet(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet(); });
    }
    const draft = { centers: (pg.centers || []).map(c => Object.assign({}, c)), radius: pg.radius, industry: pg.industry, sort: pg.sort, gender: pg.gender };
    const opts = (name, map, cur) => Object.keys(map).map(k => `<button type="button" class="kjp-opt" data-set="${name}" data-val="${k}" aria-pressed="${String(cur) === k ? 'true' : 'false'}">${esc(map[k])}</button>`).join('');
    const indChips = [{ code: '', label: '전체' }].concat(en.industries).map(i => `<button type="button" class="kjp-opt" data-set="industry" data-val="${esc(i.code)}" aria-pressed="${draft.industry === i.code ? 'true' : 'false'}">${esc(i.label)}</button>`).join('');
    sheet.innerHTML = `
      <div class="kjp-sheet-box">
        <h3>상세 필터 <button type="button" class="kjp-lnk muted" data-kjp-sheet="close">닫기</button></h3>
        <div class="kjp-lab">동네 혹은 주 검색 <span class="ksp-dim">(최대 ${MAX_CENTERS}곳)</span></div>
        <input id="kjpSheetQ" type="text" placeholder="동네 이름이나 우편번호 — 예: Sunnybank, 4109" autocomplete="off" inputmode="search"><ul class="ksp-sug" id="kjpSheetSug"></ul>
        <div class="kjp-chips" id="kjpStateChips" style="margin-top:8px;">${JSTATES.map(s => `<button type="button" class="kjp-opt" data-state="${s[0]}">${s[1]}</button>`).join('')}</div>
        <div id="kjpMyWrap"></div>
        <div class="kjp-centers" id="kjpCenters"></div>
        <div class="kjp-lab">반경 <span class="ksp-dim">(동네 기준)</span></div><div class="kjp-chips">${RADII.map(r => `<button type="button" class="kjp-opt" data-set="radius" data-val="${r}" aria-pressed="${r === draft.radius ? 'true' : 'false'}">${r}km</button>`).join('')}</div>
        <div class="kjp-lab">업종</div><div class="kjp-chips">${indChips}</div>
        <div class="kjp-lab">정렬</div><div class="kjp-chips">${opts('sort', JSORTS, draft.sort)}</div>
        <div class="kjp-lab">성별</div><div class="kjp-chips">${opts('gender', JGENDERS, draft.gender)}</div>
        <button type="button" class="kjp-apply" data-kjp-sheet="apply">적용</button>
      </div>`;
    const box = sheet.querySelector('.kjp-sheet-box');
    fillMyChips = () => {
      const w = box.querySelector('#kjpMyWrap'); if (!w || !(pg.myPosts || []).length) return;
      w.innerHTML = `<div class="kjp-lab">내 구인 글 동네</div><div class="kjp-chips">${pg.myPosts.map((m, i) => `<button type="button" class="kjp-opt addr" data-my="${i}" aria-pressed="${draft.centers.some(c => sameCenter(c, m)) ? 'true' : 'false'}">${esc(m.name)}</button>`).join('')}</div>`;
    };
    fillMyChips();
    const paintCenters = () => {
      box.querySelector('#kjpCenters').innerHTML = draft.centers.map((c, i) => `<span class="kjp-center">${esc(c.all ? c.name + ' 전체' : c.name + ' ' + String(c.state).toUpperCase())}<button type="button" data-rm="${i}" aria-label="빼기">×</button></span>`).join('');
      box.querySelectorAll('[data-state]').forEach(b => b.setAttribute('aria-pressed', draft.centers.some(c => c.all && c.state === b.dataset.state) ? 'true' : 'false'));
      box.querySelectorAll('[data-my]').forEach(b => { const m = pg.myPosts[Number(b.dataset.my)]; b.setAttribute('aria-pressed', m && draft.centers.some(c => sameCenter(c, m)) ? 'true' : 'false'); });
      box.querySelector('[data-kjp-sheet="apply"]').disabled = !draft.centers.length;
    };
    const addCenter = c => {
      const i = draft.centers.findIndex(x => sameCenter(x, c));
      if (i !== -1) { draft.centers.splice(i, 1); paintCenters(); return; }
      if (draft.centers.length >= MAX_CENTERS) { toast('동네·주는 ' + MAX_CENTERS + '곳까지 고를 수 있습니다.'); return; }
      draft.centers.push(c); paintCenters();
    };
    paintCenters();
    box.onclick = async e => {
      const my = e.target.closest('[data-my]');
      if (my) { const m = pg.myPosts[Number(my.dataset.my)]; if (m) addCenter({ name: m.name, state: m.state, lat: m.lat, lng: m.lng }); return; }
      const sc = e.target.closest('[data-state]');
      if (sc) { addCenter({ name: sc.textContent.trim(), state: sc.dataset.state, all: true }); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { draft.centers.splice(Number(rm.dataset.rm), 1); paintCenters(); return; }
      const st = e.target.closest('[data-set]');
      if (st) {
        const k = st.dataset.set, v = st.dataset.val;
        draft[k] = (k === 'radius') ? Number(v) : v;
        st.parentElement.querySelectorAll('[data-set]').forEach(b => b.setAttribute('aria-pressed', b === st ? 'true' : 'false'));
        return;
      }
      if (e.target.closest('[data-kjp-sheet="apply"]')) {
        if (!draft.centers.length) { toast('동네나 주를 한 곳 이상 골라 주십시오.'); return; }
        Object.assign(pg, { centers: draft.centers, radius: draft.radius, industry: draft.industry, sort: draft.sort, gender: draft.gender });
        saveFilter(); closeSheet();
        await showResults();
      }
    };
    const q = box.querySelector('#kjpSheetQ'), sug = box.querySelector('#kjpSheetSug');
    bindSuggest(q, sug, item => { addCenter(item); q.value = ''; });
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { try { if (!draft.centers.length) q.focus({ preventScroll: true }); } catch (_) {} }, 50);
  }
  function closeSheet() { if (!sheet) return; sheet.classList.remove('open'); if (!(deck() && deck().isOpen())) document.body.style.overflow = ''; }
  // 도구줄 [워커 구하기] — 필터 시트부터(지시 18). 지난번 필터는 채워져 있다.
  async function openPage(opts) {
    if (!me) { if (window.koausAuth && window.koausAuth.openAuthModal) window.koausAuth.openAuthModal(); return; }
    if (!db || !E()) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    injectCss(); injectPageCss();
    if (!pg || pg.uid !== me.uid) {
      const saved = loadFilter() || {};
      const centers = Array.isArray(saved.centers) ? saved.centers.filter(c => c && c.state && (c.all || (typeof c.lat === 'number' && typeof c.lng === 'number'))).slice(0, MAX_CENTERS) : [];
      pg = { uid: me.uid, centers, radius: RADII.includes(saved.radius) ? saved.radius : 5, industry: String(saved.industry || ''), sort: JSORTS[saved.sort] ? saved.sort : 'near',
             gender: JGENDERS[saved.gender] ? saved.gender : 'all', all: null, allKey: '', myPosts: [] };
      loadMyJobPosts(me.uid).then(list => { pg.myPosts = list; try { if (sheet && sheet.classList.contains('open') && fillMyChips) fillMyChips(); } catch (_) {} });
    }
    if (opts && opts.worker) { await openWorkerLink(opts.worker); return; }
    openSheet();
  }
  async function openWorkerLink(uid) {
    if (!me) return;
    if (uid === me.uid) { toast('본인 프로필입니다.'); openSheet(); return; }
    try {
      const snap = await getDoc(doc(db, 'job_profiles', uid));
      if (!snap.exists() || snap.data().visible !== true) { toast('이 프로필은 지금 공개되어 있지 않습니다.'); openSheet(); return; }
      const x = snap.data();
      const m = (pg && pg.centers.length) ? matchOf(x, pg.centers, pg.radius) : null;
      openDeck([Object.assign({ uid, p: x }, m || { km: null, reach: 0, wide: false, center: null })], 0, { radius: pg ? pg.radius : 5, showCenter: true });
    } catch (e) { console.warn('[job-profile] 링크 조회 실패', e); toast('이 프로필을 불러오지 못했습니다.'); openSheet(); }
  }
  function closePage() { try { if (deck()) deck().close(); } catch (_) {} closeSheet(); }
  function reportSeeker(uid) {
    const it = (deckList || []).find(x => x.uid === uid); if (!it) return;
    if (!window.koausDb && db) { try { window.koausDb = db; window.koausFs = { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, limit }; } catch (_) {} }
    if (window.koausReport && window.koausReport.open) window.koausReport.open({ postId: 'job_' + uid, board: 'jobseeker', postTitle: '일 구해요 · ' + (it.p.nick || ''), postAuthorUid: uid });
    else location.href = 'contact.html';
  }
  async function ensureChat(uid) {
    const it = (deckList || []).find(x => x.uid === uid);
    const chatId = 'job_' + uid + '_' + me.uid;
    const payload = { postId: 'job_' + uid, board: 'jobseeker', ownerUid: uid, inquirerUid: me.uid, participants: [uid, me.uid], unreadFor: [], blockedBy: [], createdAt: serverTimestamp(),
                      postTitle: ('일 구해요 · ' + ((it && it.p.nick) || '')).slice(0, 200) };
    const oNick = String((it && it.p.nick) || '').trim().slice(0, 60); if (oNick) payload.ownerNick = oNick;
    let iNick = ''; try { iNick = (localStorage.getItem('koaus-nickname') || me.displayName || '').trim().slice(0, 60); } catch (_) {} if (iNick) payload.inquirerNick = iNick;
    try { await setDoc(doc(db, 'chats', chatId), payload); return chatId; }
    catch (_) { const snap = await getDoc(doc(db, 'chats', chatId)); if (snap && snap.exists()) return chatId; throw new Error('deny'); }
  }
  // 카드 아래 칸에서 첫 메시지 — 성공이면 true(deck 이 칸을 잠근다, 지시 19)
  async function sendFromProfile(uid, text) {
    if (!me || busy) return false;
    if (uid === me.uid) { toast('본인 프로필입니다.'); return false; }
    const msg = String(text || '').trim().slice(0, 1000);
    if (!msg) { toast('메시지를 적어 주십시오.'); return false; }
    busy = true;
    try {
      const chatId = await ensureChat(uid);
      const b = writeBatch(db);
      b.set(doc(collection(db, 'chats', chatId, 'messages')), { senderUid: me.uid, text: msg, createdAt: serverTimestamp() });
      b.update(doc(db, 'chats', chatId), { lastMsg: msg.slice(0, 200), lastMsgAt: serverTimestamp(), lastSenderUid: me.uid, unreadFor: [uid], hiddenFor: [] });
      await b.commit();
      markContacted(uid, true); busy = false;
      toast('메시지를 보냈습니다.');
      return true;
    } catch (e) {
      busy = false;
      const denied = e && (e.message === 'deny' || e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      alert(denied ? '메시지를 보낼 수 없습니다. 휴대폰(SMS) 본인 인증을 완료했는지, 차단된 상대가 아닌지 확인해 주십시오.' : '보내지 못했습니다. 잠시 후 다시 시도해 주십시오.');
      return false;
    }
  }
  // ?worker=uid(공유 링크) / ?people=1 — 로그인 확정 뒤 한 번
  (function autoOpen() {
    let q; try { q = new URLSearchParams(location.search); } catch (_) { return; }
    const want = q.get('people') === '1' || !!q.get('worker'); if (!want) return;
    const t0 = Date.now();
    const tick = () => {
      if (me && db && E() && deck()) { openPage({ worker: q.get('worker') || '' }); return; }
      if (Date.now() - t0 < 8000) setTimeout(tick, 250);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 300)); else setTimeout(tick, 300);
  })();

  // ── 페이지 연결 ──
  // 마이페이지 '내 프로필' 탭: koaus-seeker-profile.js 가 Living 카드를 그린 뒤 kjpHost 를 비워 두면 그 자리에 Job 카드
  document.addEventListener('koaus:seeker-panel-rendered', e => { hostEl = (e.detail && e.detail.host) || document.getElementById('kjpHost'); refreshHost(); });
  // 환경설정 Job 시트 등: 직접 호스트를 지정해 그릴 때
  document.addEventListener('koaus:job-profile-panel', e => { hostEl = (e.detail && e.detail.panel) || null; refreshHost(); });

  window.koausJobProfile = {
    refresh: refreshHost,
    open: () => openModal(profile),
    openQuick: () => loadProfile(false).then(p => (p ? openModal(p, { startStep: 4, flow: true }) : openModal(null, { quick: true }))),
    has: () => loadProfile(false).then(p => !!p),
    openPage, closePage,
  };
})();
