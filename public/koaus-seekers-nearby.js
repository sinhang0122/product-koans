// ════════════════════════════════════════════════════════════════════
//  KoAus · 근처에서 구하는 사람 보기 (집주인 → seeker_profiles) — 2단계 ① (2026-10)
//  - accom.html / rent.html 이 로드하는 ES module. 본인 글 상세의 "근처에서 구하는 사람 보기" 버튼이
//    window.koausSeekersNearby.open(post, board) 호출 → 자체 모달(목록) → 행을 누르면 카드 넘겨 보기(deck).
//  - 조회: where('states','array-contains'(-any), 주) + where('visible','==',true)
//          + orderBy('lastActiveAt','desc') + limit(20)   ← rules limitedList ≤20 · 복합 인덱스 필수
//    거리(반경 3/5/10/20km)는 클라이언트: 기준 동네 ↔ 프로필 희망 동네 중 가장 가까운 것(양방향 반경·큰 지역 km·주 전체).
//  - 여성 전용 글(gender==='female')이면 여성 프로필만. '예산' = 내 방 가격이 프로필 예산 범위 안.
//  - 연락 = 기존 chats 규칙 그대로: chatId {seekerUid}_{집주인uid}, postId=seekerUid, board 'seeker',
//    ownerUid=seekerUid(프로필 주인), inquirerUid=집주인. 메시지는 카드 아래 칸에서 바로 보냄(보내면 칸 잠금, 11-08 지시 19).
//  - 11-08(지시 18) 도구줄 [쉐어생 구하기]: 목록 페이지 대신 → 상세 필터 시트(동네 혹은 주 최대 3곳 · 반경 · 정렬 · 성별 · 예산)
//    → 바로 카드 넘겨 보기(koaus-people-deck.js: 옆으로 밀기, 데스크탑은 양옆 흐림). 머리 [‹ 구하는 사람][필터 변경] … [신고][공유].
//    '저장'(관심) 기능은 숨김 — LS 값은 남겨 둔다(삭제 아님).
// ════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

(function () {
  'use strict';
  if (window.koausSeekersNearby) return;

  const firebaseConfig = {
    apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
    authDomain: 'koaus-f564c.firebaseapp.com',
    projectId: 'koaus-f564c',
    storageBucket: 'koaus-f564c.firebasestorage.app',
    messagingSenderId: '663988594088',
    appId: '1:663988594088:web:ef30c2fd557407b00b299d',
    measurementId: 'G-DERZ9MTKPL',
  };
  const RADII = [3, 5, 10, 20];   // 10-19: 기본 5km(동네 2~3개 묶음), 3km = 바로 옆 동네, 20km = 외곽·지방
  const MAX_CENTERS = 3;          // 11-08b: 필터의 동네 최대 3곳(주는 드롭다운으로 한 곳)
  let db = null;
  try { db = getFirestore(getApps().length ? getApp() : initializeApp(firebaseConfig)); } catch (e) { try { console.warn('[seekers-nearby] init 실패', e); } catch (_) {} }

  const E = () => window.koausEnums;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = m => { try { if (window.koausToast) window.koausToast.show(m); else alert(m); } catch (_) { alert(m); } };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const page = () => (location.pathname.split('/').pop() || '').toLowerCase();
  const deck = () => window.koausPeopleDeck || null;

  function injectCss() {
    if (document.getElementById('ksnStyle')) return;
    const st = document.createElement('style');
    st.id = 'ksnStyle';
    st.textContent = `
      .ksn-ovl{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:none;align-items:flex-end;justify-content:center}
      .ksn-ovl.open{display:flex}
      .ksn-modal{width:100%;max-width:560px;background:var(--bg-base);border-radius:var(--r-xl) var(--r-xl) 0 0;max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
      @media(min-width:640px){.ksn-ovl{align-items:center}.ksn-modal{border-radius:var(--r-xl)}}
      .ksn-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border)}
      .ksn-title{font-weight:700;font-size:16px}
      .ksn-sub{font-size:12.5px;color:var(--text-muted);line-height:1.5;padding:10px 16px 0}
      .ksn-bar{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px;border-bottom:1px solid var(--border-subtle)}
      .ksn-opt{appearance:none;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit}
      .ksn-opt[aria-pressed="true"]{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
      .ksn-body{overflow:auto;overscroll-behavior:contain;flex:1;padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px}
      .ksn-tags{display:flex;flex-wrap:wrap;gap:5px}
      .ksn-tag{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);background:var(--bg-surface)}
      .ksn-tag.ok{border-color:rgba(22,163,74,.35);background:var(--green-bg);color:var(--green)}
      .ksn-btn{appearance:none;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);border-radius:var(--r-md);padding:9px 14px;font-size:14px;cursor:pointer;font-family:inherit}
      .ksn-btn.primary{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
      .ksn-btn.small{padding:6px 10px;font-size:12.5px}
      .ksn-btn:disabled{opacity:.5;cursor:default}
      .ksn-end{text-align:center;color:var(--text-muted);font-size:13.5px;padding:18px 8px;display:flex;flex-direction:column;gap:10px;align-items:center}
      /* 간단 행(10-20) — 본인 글 상세의 모달 목록 */
      .ksn-row{appearance:none;width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border);border-radius:14px;padding:14px 16px;background:var(--bg-base);color:var(--text-primary);cursor:pointer;font-family:inherit}
      .ksn-row:hover{border-color:var(--text-primary)}
      .ksn-row-main{display:flex;flex-direction:column;gap:3px;min-width:0}
      .ksn-row-nick{font-size:17px;font-weight:800;letter-spacing:-.01em}
      .ksn-row-meta{font-size:13px;color:var(--text-muted)}
      .ksn-sent{display:inline-block;font-size:11px;font-weight:600;color:var(--text-muted);border:1px solid var(--border);border-radius:6px;padding:0 6px;margin-left:6px;vertical-align:middle}
      .ksn-row-arr{color:var(--text-muted);font-size:18px;flex:0 0 auto}
      /* 카드 안(deck) */
      .ksn-detail-hero{padding:20px 16px 14px}
      .ksn-detail-nick{font-size:24px;font-weight:800;letter-spacing:-.02em}
      .ksn-detail-meta{font-size:14px;color:var(--text-muted);margin-top:4px}
      .ksn-sec{padding:14px 16px;border-top:1px solid var(--border)}
      .ksn-sec h4{margin:0 0 8px;font-size:12.5px;color:var(--text-muted);font-weight:700}
      .ksn-line{font-size:16px;font-weight:700;line-height:1.5}
      .ksn-rows{display:grid;grid-template-columns:52px 1fr;gap:7px 10px;font-size:14px;margin:0}
      .ksn-rows dt{color:var(--text-muted)} .ksn-rows dd{margin:0;font-weight:600}
      .ksn-note{font-size:12.5px;color:var(--text-muted);line-height:1.5;padding:12px 16px;border-top:1px solid var(--border)}
    `;
    document.head.appendChild(st);
  }

  let ovl = null, post = null, board = '', radius = 10, budgetOnly = false, all = null, busy = false, shown = [];

  function mount() {
    if (ovl) return;
    injectCss();
    ovl = document.createElement('div');
    ovl.className = 'ksn-ovl'; ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true');
    ovl.innerHTML = `
      <div class="ksn-modal">
        <div class="ksn-head"><div class="ksn-title">근처에서 구하는 사람</div><button type="button" class="ksn-btn small" data-ksn="close">닫기</button></div>
        <div class="ksn-sub" id="ksnSub"></div>
        <div class="ksn-bar" id="ksnBar"></div>
        <div class="ksn-body" id="ksnBody"></div>
      </div>`;
    document.body.appendChild(ovl);
    ovl.addEventListener('click', e => {
      if (e.target === ovl || e.target.closest('[data-ksn="close"]')) { close(); return; }
      const r = e.target.closest('[data-ksn-radius]');
      if (r) { radius = Number(r.dataset.ksnRadius); render(); return; }
      if (e.target.closest('[data-ksn="budget"]')) { budgetOnly = !budgetOnly; render(); return; }
      if (e.target.closest('[data-ksn="more"]')) { const i = RADII.indexOf(radius); if (i < RADII.length - 1) { radius = RADII[i + 1]; render(); } return; }
      const o = e.target.closest('[data-ksn-open]');
      if (o) { const i = shown.findIndex(x => x.uid === o.dataset.ksnOpen); if (i !== -1) openDeck(shown, i, { price: Number(post && post.price) || 0, radius, title: '근처에서 구하는 사람', fromModal: true }); return; }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovl.classList.contains('open') && !(deck() && deck().isOpen())) close(); });
  }
  function close() { if (!ovl) return; ovl.classList.remove('open'); document.body.style.overflow = ''; }

  const postState = p => { try { return String((window.koausState && window.koausState.effective(p)) || p.state || '').toLowerCase(); } catch (_) { return String(p.state || '').toLowerCase(); } };
  const postCoords = p => (typeof p.lat === 'number' && typeof p.lng === 'number' && p.lat && p.lng) ? { lat: p.lat, lng: p.lng } : null;
  function kmBetween(a, b) {
    const R = 6371, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const tsAgo = ts => {
    try { const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0; if (!ms) return ''; const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? '오늘 활동' : d + '일 전 활동'; } catch (_) { return ''; }
  };
  const kmText = it => it.wide ? '주 전체' : (it.km != null ? (it.km < 1 ? '1km 이내' : '약 ' + Math.round(it.km) + 'km') : '');

  // ── 본인 글 상세 → 근처에서 구하는 사람(모달 목록) ──
  async function open(p, b) {
    const user = window.koausAuth && window.koausAuth.user;
    if (!user) { toast('로그인 후 이용할 수 있습니다.'); return; }
    if (!db) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    mount();
    post = p; board = b || 'accom'; radius = 5; budgetOnly = false; all = null; shown = [];
    const st = postState(p);
    const en = E();
    $('#ksnSub', ovl).textContent = '이 방 근처에서 집을 구하는 사람입니다. 연락은 채팅으로만 됩니다.' + (p.gender === 'female' ? ' 여성 전용 방이라 여성 프로필만 보입니다.' : '') + (!postCoords(p) ? ' 이 글에는 위치가 없어 ' + (en && en.state(st) ? en.state(st).label : st.toUpperCase()) + ' 전체를 보여드립니다.' : '');
    ovl.classList.add('open'); document.body.style.overflow = 'hidden';
    $('#ksnBar', ovl).innerHTML = ''; $('#ksnBody', ovl).innerHTML = '<div class="ksn-end">불러오는 중…</div>';
    if (!st) { $('#ksnBody', ovl).innerHTML = '<div class="ksn-end">이 글의 주를 알 수 없어 보여드릴 수 없습니다.</div>'; return; }
    try {
      const snap = await getDocs(query(collection(db, 'seeker_profiles'), where('states', 'array-contains', st), where('visible', '==', true), orderBy('lastActiveAt', 'desc'), limit(20)));
      const me = user.uid;
      const pc = postCoords(p);
      all = snap.docs.filter(d => d.id !== me).map(d => {
        const x = d.data() || {};
        const r = pc ? reachOf(x, Object.assign({ state: st }, pc)) : { km: null, reach: 0 };   // 주 전체 매칭에 글의 주가 필요(11-04b)
        return { uid: d.id, p: x, km: r.km, reach: r.reach, wide: r.wide, center: pc ? { name: String(p.suburb || '내 글').slice(0, 40), state: st, lat: pc.lat, lng: pc.lng } : null };
      });
    } catch (e) {
      console.warn('[seekers-nearby] 조회 실패', e);
      $('#ksnBody', ovl).innerHTML = '<div class="ksn-end">불러오지 못했습니다. 잠시 후 다시 시도해 주십시오.</div>';
      return;
    }
    render();
  }

  function render() {
    if (!ovl || !all) return;
    const hasCoords = !!postCoords(post);
    const price = Number(post.price) || 0;
    $('#ksnBar', ovl).innerHTML =
      (hasCoords ? RADII.map(r => `<button type="button" class="ksn-opt" data-ksn-radius="${r}" aria-pressed="${r === radius ? 'true' : 'false'}">${r}km</button>`).join('') : '') +
      (price ? `<button type="button" class="ksn-opt" data-ksn="budget" aria-pressed="${budgetOnly ? 'true' : 'false'}">예산 맞음</button>` : '');
    const en = E();
    const femaleOnly = post.gender === 'female';
    shown = all.filter(it => {
      if (femaleOnly && it.p.gender !== 'female') return false;
      if (hasCoords && !it.wide && (it.km == null || it.km > Math.max(radius, it.reach || 0))) return false;   // 양방향: 집주인 반경 또는 구하는 사람 반경(큰 지역이면 그 지역 km) 중 큰 쪽. 주 전체(wide)는 통과
      if (budgetOnly && price && !(it.p.budgetMin <= price && price <= it.p.budgetMax)) return false;
      return true;
    }).sort((a, b) => (a.km == null || b.km == null) ? 0 : a.km - b.km);
    const atMax = !hasCoords || radius === RADII[RADII.length - 1];
    const end = atMax
      ? '<div class="ksn-end">더 이상 표시할 프로필이 없습니다.</div>'
      : '<div class="ksn-end"><span>더 이상 표시할 프로필이 없습니다. 범위를 늘리시겠습니까?</span><button type="button" class="ksn-btn primary" data-ksn="more">범위 늘리기</button></div>';
    $('#ksnBody', ovl).innerHTML = shown.map(it => card(it, en)).join('') + end;
  }

  // 모달 목록의 행 = 닉네임 + 성별·나이대·거리. 누르면 카드 넘겨 보기.
  function card(it, en) {
    const p = it.p;
    const nick = String(p.nick || p.firstName || '').trim() || '회원';
    const meta = [];
    if (p.gender) meta.push(en.label('genders', p.gender));
    if (p.ageBand) meta.push(en.label('ageBands', p.ageBand));
    const k = kmText(it); if (k) meta.push(k);
    return `
      <button type="button" class="ksn-row" data-ksn-open="${esc(it.uid)}">
        <span class="ksn-row-main"><span class="ksn-row-nick">${esc(nick)}${isContacted(it.uid) ? ' <span class="ksn-sent">메시지 보냄</span>' : ''}</span><span class="ksn-row-meta">${esc(meta.join(' · ') || '조건 등록')}</span></span>
        <span class="ksn-row-arr" aria-hidden="true">›</span>
      </button>`;
  }
  // 메시지 보낸 사람(11-04) — 기기 LS {내uid: {상대uid: 시각}} + 카드 열 때 chats/{상대_나} 존재 확인
  const CONTACTED_KEY = 'koaus-contacted-seekers-v1';
  function contactedMap() { try { const m = JSON.parse(localStorage.getItem(CONTACTED_KEY) || '{}'); const u = window.koausAuth && window.koausAuth.user; return (u && m && typeof m === 'object' && m[u.uid] && typeof m[u.uid] === 'object') ? m[u.uid] : {}; } catch (_) { return {}; } }
  function isContacted(uid) { return !!contactedMap()[uid]; }
  function markContacted(uid, on) {
    try {
      const u = window.koausAuth && window.koausAuth.user; if (!u) return;
      const all = JSON.parse(localStorage.getItem(CONTACTED_KEY) || '{}') || {};
      const mine = (all[u.uid] && typeof all[u.uid] === 'object') ? all[u.uid] : {};
      if (on) mine[uid] = Date.now(); else delete mine[uid];
      all[u.uid] = mine; localStorage.setItem(CONTACTED_KEY, JSON.stringify(all));
    } catch (_) {}
  }
  async function checkContacted(uid) {
    const u = window.koausAuth && window.koausAuth.user; if (!u || !db || uid === u.uid) return false;
    try { const snap = await getDoc(doc(db, 'chats', uid + '_' + u.uid)); const on = !!(snap && snap.exists()); markContacted(uid, on); return on; } catch (_) { return isContacted(uid); }
  }
  // 저장(관심) — 11-08: 화면에서 숨김(지시 18). LS 값은 그대로 두어 되살리기 쉽게.
  const SAVED_KEY = 'koaus-saved-seekers-v1';
  function savedSeekers() { try { const a = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function isSavedSeeker(uid) { return savedSeekers().includes(uid); }

  // 찾는 조건 한 문장 — 모달 행 등에서 씀. 큰 지역·주 전체는 영어 이름 그대로(11-08: 칩과 통일)
  const subName = x => (x && (x.km || x.all) ? (x.name + ' 전체') : (x && x.name) || '');
  const moveInLabel = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0); return (isNaN(d) || d <= t) ? '최대한 빨리' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일부터'; };
  function conditionSentence(p, en) {
    const subs = (p.suburbs || []).map(subName).filter(Boolean).slice(0, 3).join(' · ');
    let when = '';
    if (p.moveIn) {
      const d = new Date(p.moveIn + 'T00:00:00'); const today = new Date(); today.setHours(0, 0, 0, 0);
      when = (isNaN(d) || d <= today) ? '최대한 빨리' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일부터';
    }
    const stay = p.stay === 'tbd' ? '기간은 상의 후 결정' : (en.label('stays', p.stay) || '');
    const bmin = p.budgetMin != null ? Number(p.budgetMin) : null, bmax = p.budgetMax != null ? Number(p.budgetMax) : null;
    const budget = (bmax != null) ? (bmin ? `주 $${bmin}~${bmax}` : `주 $${bmax}까지`) : (bmin ? `주 $${bmin} 이상` : '');
    const parts = [];
    if (subs) parts.push(subs + '에서');
    if (when) parts.push(when);
    if (stay) parts.push(stay);
    if (budget) parts.push(budget);
    return parts.length ? parts.join(', ').replace(/에서, /, '에서 ') + ' 방을 찾습니다.' : '조건을 등록한 분입니다.';
  }

  // ── 카드 안 HTML(deck 이 그림) — 닉네임·조건·자세히·내 방과 맞는지 ──
  function cardBody(it, ctx) {
    const en = E(); const p = it.p;
    const nick = String(p.nick || p.firstName || '').trim() || '회원';
    const meta = [];
    if (p.gender) meta.push(en.label('genders', p.gender));
    if (p.ageBand) meta.push(en.label('ageBands', p.ageBand));
    const act = tsAgo(p.lastActiveAt); if (act) meta.push(act);
    const k = kmText(it); if (k) meta.push(k + (ctx && ctx.showCenter && it.center && it.center.name && !it.wide ? ' · ' + it.center.name : ''));
    const subs = (p.suburbs || []).map(x => (x.km || x.all) ? esc(x.name) + ' 전체' + (x.km ? ' ' + esc(x.km) + 'km' : '') : esc(x.name) + ' ' + esc(String(x.state || '').toUpperCase())).join(' · ');
    const rooms = (p.roomTypes || []).map(c => en.label('roomTypes', c)).filter(Boolean).join(', ');
    // 11-08b: 문장·'내 방과 맞는지'·안내문 없이 표 하나. 내 조건(필터·내 글)에 맞는 값만 ✓ 초록(색약도 읽히는 청록, 다크 모드 별도)
    const price = Number(ctx && ctx.price) || 0;
    const budgetOk = !!(price && price >= (p.budgetMin || 0) && price <= (p.budgetMax != null ? p.budgetMax : 1e9));
    const nearOk = !!(it.wide || (it.km != null && it.km <= Math.max(Number(ctx && ctx.radius) || 0, it.reach || Number(p.radiusKm) || 0)));
    const ok = (yes, html) => yes ? '<dd class="kpd-ok">✓ ' + html + '</dd>' : '<dd>' + html + '</dd>';
    return `
      <div class="ksn-detail-hero"><div class="ksn-detail-nick">${esc(nick)}</div><div class="ksn-detail-meta">${esc(meta.join(' · '))}</div></div>
      <div class="ksn-sec"><h4>찾는 조건</h4><dl class="ksn-rows">
        <dt>동네</dt>${ok(nearOk, (subs || '—') + (p.radiusKm && (p.suburbs || []).some(x => !(x.km || x.all)) ? ' (반경 ' + esc(p.radiusKm) + 'km)' : ''))}
        <dt>예산</dt>${ok(budgetOk, '주 $' + esc(p.budgetMin != null ? p.budgetMin : 0) + (p.budgetMax != null ? ' ~ $' + esc(p.budgetMax) : ' 이상'))}
        <dt>입주</dt><dd>${esc(moveInLabel(p.moveIn) || p.moveIn || '—')}${p.stay ? ' · ' + esc(en.label('stays', p.stay)) : ''}</dd>
        <dt>방</dt><dd>${esc(rooms || '상관없음')}${p.bathroom === 'private' ? ' · 개인 욕실' : ''}</dd>
      </dl></div>`;
  }

  // ── 카드 넘겨 보기 열기(공용 deck) — list: 보여 줄 사람들, index: 시작 위치, ctx: {price, radius, title, fromModal} ──
  let deckList = [], deckCtx = {};
  function openDeck(list, index, ctx) {
    const D = deck(); if (!D) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    injectCss();
    const en = E(); if (!en) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    deckList = list || []; deckCtx = ctx || {};
    const fromModal = !!(ctx && ctx.fromModal);
    D.open({
      items: deckList, index: index || 0,
      title: (ctx && ctx.title) || '구하는 사람',
      key: it => it.uid,
      render: it => cardBody(it, deckCtx),   // 필터를 바꾸면 deckCtx 도 바뀐다(예산·반경 표시)
      compose: it => ({ sent: isContacted(it.uid), preset: '안녕하세요. 찾으시는 조건에 맞는 방이 있어 연락드립니다.' }),
      onSend: (it, text) => sendFromProfile(it.uid, text),
      onSent: () => { try { if (ovl && ovl.classList.contains('open')) render(); } catch (_) {} },
      onReport: it => reportSeeker(it.uid),
      onShare: it => shareSeeker(it.uid),
      onFilter: fromModal ? null : () => openSheet(),
      onShow: it => { if (it) checkContacted(it.uid).then(on => { if (on && D.isOpen() && D.current() && D.current().uid === it.uid) D.markSent(it.uid); }); },
      guard: () => !(sheet && sheet.classList.contains('open')),
      emptyHtml: emptyHtml,
      loading: !!(ctx && ctx.loading),
      onClose: () => {
        if (ovl && ovl.classList.contains('open')) { document.body.style.overflow = 'hidden'; return; }   // 모달 위에서 열렸으면 모달은 그대로
        try { const q = new URLSearchParams(location.search); if (q.has('people') || q.has('seeker')) { q.delete('people'); q.delete('seeker'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash); } } catch (_) {}
      },
    });
  }
  function emptyHtml() {
    const nextR = pg ? RADII[RADII.indexOf(pg.radius) + 1] : null;
    const hasSuburb = !!(pg && (pg.centers || []).some(c => !c.all));
    return `<b>조건에 맞는 분이 아직 없습니다.</b><span>동네나 주를 바꾸거나 범위를 늘려 보십시오.</span>
      <div class="kpd-empty-btns"><button type="button" class="kpd-btn primary" data-kpd="filter">필터 변경</button>${nextR && hasSuburb ? `<button type="button" class="kpd-btn" data-ksn-wider="${nextR}">범위 늘리기 (${nextR}km)</button>` : ''}</div>`;
  }
  document.addEventListener('click', e => {
    const w = e.target.closest('[data-ksn-wider]'); if (!w || !pg) return;
    pg.radius = Number(w.dataset.ksnWider) || pg.radius; saveFilter(); showResults();
  });
  function reportSeeker(uid) {
    const it = (deckList || []).find(x => x.uid === uid) || (all || []).find(x => x.uid === uid); if (!it) return;
    if (!window.koausDb && db) { try { window.koausDb = db; window.koausFs = { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, limit }; } catch (_) {} }
    if (window.koausReport && window.koausReport.open) window.koausReport.open({ postId: uid, board: 'seeker', postTitle: '집 구해요 · ' + (it.p.nick || ''), postAuthorUid: uid });
    else location.href = 'contact.html';
  }
  // 공유 = 이 사람 카드로 바로 열리는 링크 복사(로그인·인증 회원만 볼 수 있음)
  function shareSeeker(uid) {
    const url = location.origin + '/' + (page() === 'rent.html' ? 'rent.html' : 'accom.html') + '?people=1&seeker=' + encodeURIComponent(uid);
    const ok = () => toast('링크가 복사되었습니다');
    const no = () => prompt('이 링크를 복사해 주십시오', url);
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, no); else no(); } catch (_) { no(); }
  }

  async function ensureChat(seekerUid, user) {
    const it = (deckList || []).find(x => x.uid === seekerUid) || (all || []).find(x => x.uid === seekerUid);
    const chatId = seekerUid + '_' + user.uid;
    const payload = {
      postId: seekerUid, board: 'seeker', ownerUid: seekerUid, inquirerUid: user.uid, participants: [seekerUid, user.uid],
      unreadFor: [], blockedBy: [], createdAt: serverTimestamp(),
      postTitle: ('집 구해요 · ' + ((it && (it.p.nick || it.p.firstName)) || '')).slice(0, 200),
    };
    const oNick = String((it && (it.p.nick || it.p.firstName)) || '').trim().slice(0, 60); if (oNick) payload.ownerNick = oNick;
    let iNick = ''; try { iNick = (localStorage.getItem('koaus-nickname') || user.displayName || '').trim().slice(0, 60); } catch (_) {} if (iNick) payload.inquirerNick = iNick;
    try { await setDoc(doc(db, 'chats', chatId), payload); return chatId; }
    catch (_) { const snap = await getDoc(doc(db, 'chats', chatId)); if (snap && snap.exists()) return chatId; throw new Error('deny'); }
  }
  // 카드 아래 칸에서 첫 메시지 보내기 — 성공이면 true(deck 이 칸을 잠근다)
  async function sendFromProfile(seekerUid, text) {
    const user = window.koausAuth && window.koausAuth.user;
    if (!user || busy) return false;
    if (seekerUid === user.uid) { toast('본인 프로필입니다.'); return false; }
    const msg = String(text || '').trim().slice(0, 1000);
    if (!msg) { toast('메시지를 적어 주십시오.'); return false; }
    busy = true;
    try {
      const chatId = await ensureChat(seekerUid, user);
      const b = writeBatch(db);
      b.set(doc(collection(db, 'chats', chatId, 'messages')), { senderUid: user.uid, text: msg, createdAt: serverTimestamp() });
      b.update(doc(db, 'chats', chatId), { lastMsg: msg.slice(0, 200), lastMsgAt: serverTimestamp(), lastSenderUid: user.uid, unreadFor: [seekerUid], hiddenFor: [] });
      await b.commit();
      markContacted(seekerUid, true);
      busy = false;
      toast('메시지를 보냈습니다.');
      return true;
    } catch (e) {
      busy = false;
      const denied = e && (e.message === 'deny' || e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      alert(denied ? '메시지를 보낼 수 없습니다. 휴대폰(SMS) 본인 인증을 완료했는지, 차단된 상대가 아닌지 확인해 주십시오.' : '보내지 못했습니다. 잠시 후 다시 시도해 주십시오.');
      return false;
    }
  }

  // ═══ 쉐어생 구하기(지시 18) — 도구줄 버튼 → 상세 필터 시트 → 카드 넘겨 보기 ═══
  //   · 필터: 동네 혹은 주(최대 3곳: 동네 검색·내 글 동네·주 전체 칩) · 반경(동네 기준) · 정렬 · 성별 · 예산(내 방 주당 가격)
  //   · 매칭 = 동네: 거리 ≤ max(내 반경, 구하는 사람 반경·큰 지역 km) 또는 그 사람이 주 전체. 주: 그 사람 states 에 그 주.
  const FILTER_KEY = 'koaus-people-filter-v3';
  let pg = null;   // { centers:[{name,state,lat,lng,all?}], radius, sort, gender, price, all:[]|null, myPosts:[] }
  const SORTS = { near: '가까운 순', new: '최신 등록 순', budget: '예산 낮은 순' };
  const GENDERS = { all: '전체', female: '여성', male: '남성' };
  const STATES = [['qld', 'QLD'], ['nsw', 'NSW'], ['vic', 'VIC'], ['wa', 'WA'], ['sa', 'SA'], ['act', 'ACT'], ['tas', 'TAS'], ['nt', 'NT']];

  function injectPageCss() {
    if (document.getElementById('ksnPageStyle')) return;
    const st = document.createElement('style'); st.id = 'ksnPageStyle';
    st.textContent = `
      .ksn-sheet{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9060;display:none;align-items:flex-end;justify-content:center}
      .ksn-sheet.open{display:flex}
      .ksn-sheet-box{width:100%;max-width:560px;background:var(--bg-base);color:var(--text-primary);border-radius:18px 18px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow:auto;overscroll-behavior:contain;box-sizing:border-box}
      @media(min-width:640px){.ksn-sheet{align-items:center}.ksn-sheet-box{border-radius:18px}}
      .ksn-sheet h3{margin:0 0 6px;font-size:16px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
      .ksn-lab{font-size:12.5px;color:var(--text-muted);font-weight:700;margin:12px 0 6px;display:flex;gap:6px;align-items:baseline}
      .ksn-lab .ksn-dim{font-weight:500}
      .ksn-dim{font-size:11.5px;color:var(--text-muted)}
      .ksn-sheet .ksn-opt{padding:7px 12px}
      .ksn-sheet .ksn-opt.addr{border-radius:10px}
      .ksn-sheet .ksn-q{position:relative;margin-top:6px}
      .ksn-sheet input{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:inherit;background:var(--bg-base);color:var(--text-primary)}
      .ksn-sheet input:focus{outline:none;border-color:var(--border-focus,var(--text-primary))}
      .ksn-select{appearance:none;-webkit-appearance:none;width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:10px;padding:9px 32px 9px 12px;font-size:13.5px;font-family:inherit;background:var(--bg-base) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9.5 12 15.5 18 9.5'/></svg>") no-repeat right 10px center/12px 12px;color:var(--text-primary)}
      .ksn-sug{list-style:none;margin:4px 0 0;padding:0;border:1px solid var(--border);border-radius:10px;background:var(--bg-base);max-height:200px;overflow:auto;display:none}
      .ksn-sug.on{display:block}
      .ksn-sug li{padding:9px 12px;font-size:13.5px;cursor:pointer;border-bottom:1px solid var(--border-subtle)}
      .ksn-sug li:last-child{border-bottom:0}
      .ksn-sug li:hover{background:var(--bg-card)}
      .ksn-centers{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:4px}
      .ksn-center{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;padding:5px 8px 5px 11px;border-radius:999px;background:var(--accent);color:var(--accent-text)}
      .ksn-center button{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:0 2px}
      .ksn-lnk{appearance:none;border:0;background:none;color:var(--text-primary);font-size:14px;cursor:pointer;font-family:inherit;padding:4px 0}
      .ksn-lnk.muted{color:var(--text-muted)}
      .ksn-help{font-size:12px;color:var(--text-muted);line-height:1.5;margin-top:6px}
      .ksn-apply{margin-top:16px;appearance:none;border:0;background:var(--text-primary);color:var(--bg-base);border-radius:12px;padding:13px;font-size:15px;font-weight:800;font-family:inherit;width:100%;cursor:pointer}
      .ksn-apply:disabled{opacity:.5;cursor:default}`;
    document.head.appendChild(st);
  }
  function loadFilter() { try { return JSON.parse(localStorage.getItem(FILTER_KEY) || 'null'); } catch (_) { return null; } }
  function saveFilter() { try { localStorage.setItem(FILTER_KEY, JSON.stringify({ centers: pg.centers, radius: pg.radius, sort: pg.sort, gender: pg.gender, price: pg.price })); } catch (_) {} }
  const sameCenter = (a, b) => !!(a && b && a.state === b.state && !!a.all === !!b.all && (a.all || (a.lat === b.lat && a.lng === b.lng)));

  // 동네 검색 — koaus-geo.js 공통(Maps JS, 한글·영문·우편번호)
  async function geocodeSuburb(text) {
    if (!window.koausGeo) { console.warn('[seekers-nearby] koaus-geo.js 가 없습니다'); return []; }
    try { return (await window.koausGeo.suburbs(text)).slice(0, 8); } catch (e) { console.warn('[seekers-nearby] geocode 실패', e); return []; }
  }
  async function loadMyPosts(uid) {
    const out = [];
    for (const coll of ['accom_posts', 'rent_posts']) {
      try {
        const snap = await getDocs(query(collection(db, coll), where('uid', '==', uid), limit(5)));
        snap.docs.forEach(d => {
          const p = d.data() || {}; const c = postCoords(p); const st = postState(p);
          if (!c || !st) return;
          const name = String(p.suburb || '').trim() || (String(p.address || '').match(/([A-Za-z][A-Za-z' .-]{1,40}?)\s*,?\s+(QLD|NSW|VIC|WA|SA|TAS|ACT|NT)\b/i) || [])[1] || String(p.title || '내 글').slice(0, 30);
          out.push({ name: name.replace(/^.*,\s*/, '').replace(/^\d+[A-Za-z]?\s+/, '').trim().slice(0, 40), state: st, lat: c.lat, lng: c.lng, price: Number(p.price) || 0, board: coll === 'accom_posts' ? '쉐어' : '렌트' });
        });
      } catch (e) { console.warn('[seekers-nearby] 내 글 조회 실패', coll, e); }
    }
    return out.slice(0, 5);
  }
  // 구하는 사람 쪽 '닿는 반경' — 가장 가까운 동네 기준. '브리즈번 전체'처럼 큰 지역은 그 지역 km(11-04)
  //   함수(functions/index.js onNewListing)와 같은 규칙(11-04b): 동네마다 '그 사람 반경 또는 큰 지역 km' 안이면 맞음, 주 전체(all)는 같은 주면 맞음.
  //   km = 가장 가까운 동네까지 거리, reach = 어느 동네든 맞으면 km 이상(필터 it.km <= max(내 반경, reach) 통과), 아니면 그 사람 반경.
  function reachOf(x, center) {
    let km = null, reach = Number(x.radiusKm) || 0, wide = false, hit = false;
    (Array.isArray(x.suburbs) ? x.suburbs : []).forEach(s => {
      if (s.all) { if (s.state && center && s.state === center.state) wide = true; return; }   // 11-08: 주 전체는 거리 계산에서 뺀다(좌표는 주도일 뿐)
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
      const k = kmBetween(center, s);
      if (km == null || k < km) km = k;
      if (k <= Math.max(Number(x.radiusKm) || 0, Number(s.km) || 0)) hit = true;
    });
    if ((wide || hit) && km != null) reach = Math.max(reach, km);
    return { km, reach, wide };
  }
  // 여러 기준(동네·주)으로 한 번에 조회 — 주가 하나면 array-contains, 여럿이면 array-contains-any(같은 인덱스)
  async function fetchForCenters(centers, meUid) {
    const states = Array.from(new Set((centers || []).map(c => c.state).filter(Boolean))).slice(0, 10);
    if (!states.length) return [];
    const byState = states.length === 1 ? where('states', 'array-contains', states[0]) : where('states', 'array-contains-any', states);
    const snap = await getDocs(query(collection(db, 'seeker_profiles'), byState, where('visible', '==', true), orderBy('lastActiveAt', 'desc'), limit(20)));
    return snap.docs.filter(d => d.id !== meUid).map(d => ({ uid: d.id, p: d.data() || {} }));
  }
  // 한 사람이 지금 필터(기준들·반경)에 맞는지 → {km, reach, wide, center} 또는 null
  function matchOf(x, centers, radius) {
    let best = null;
    (centers || []).forEach(c => {
      if (c.all) {
        const inState = (Array.isArray(x.states) && x.states.includes(c.state)) || (Array.isArray(x.suburbs) && x.suburbs.some(s => s.state === c.state));
        if (inState && !best) best = { km: null, reach: 0, wide: true, center: c };
        return;
      }
      const r = reachOf(x, c);
      const ok = r.wide || (r.km != null && r.km <= Math.max(radius, r.reach || 0));
      if (!ok) return;
      const cand = { km: r.km, reach: r.reach, wide: r.wide && !(r.km != null && r.km <= Math.max(radius, r.reach || 0)), center: c };
      if (!best || best.km == null || (cand.km != null && cand.km < best.km)) best = cand;
    });
    return best;
  }
  function filtered() {
    const list = [];
    (pg.all || []).forEach(x => {
      const m = matchOf(x.p, pg.centers, pg.radius); if (!m) return;
      if (pg.gender !== 'all' && x.p.gender !== pg.gender) return;
      if (pg.price && !((x.p.budgetMin || 0) <= pg.price && pg.price <= (x.p.budgetMax != null ? x.p.budgetMax : 1e9))) return;
      list.push(Object.assign({ uid: x.uid, p: x.p }, m));
    });
    const ms = ts => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : 0;
    if (pg.sort === 'new') list.sort((a, b) => ms(b.p.createdAt) - ms(a.p.createdAt));
    else if (pg.sort === 'budget') list.sort((a, b) => ((a.p.budgetMax != null ? a.p.budgetMax : 1e9) - (b.p.budgetMax != null ? b.p.budgetMax : 1e9)));
    else list.sort((a, b) => (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km));
    return list;
  }
  // 필터 적용 → 조회(필요하면) → 카드 넘겨 보기
  async function showResults(focusUid) {
    const user = window.koausAuth && window.koausAuth.user; if (!user || !pg) return;
    const D = deck(); if (!D) return;
    const ctx = { price: pg.price, radius: pg.radius, title: '구하는 사람', showCenter: true };
    const need = !pg.all || pg.allKey !== pg.centers.map(c => c.state).sort().join(',');
    if (need) {
      pg.all = null;
      if (!D.isOpen()) openDeck([], 0, Object.assign({ loading: true }, ctx)); else D.setLoading(true);
      try { pg.all = await fetchForCenters(pg.centers, user.uid); pg.allKey = pg.centers.map(c => c.state).sort().join(','); }
      catch (e) { console.warn('[seekers-nearby] 조회 실패', e); pg.all = []; toast((e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) ? '휴대폰(SMS) 또는 이메일 인증을 마친 회원만 볼 수 있습니다.' : '불러오지 못했습니다. 잠시 후 다시 시도해 주십시오.'); }
      if (!D.isOpen()) return;   // 불러오는 동안 닫았으면 다시 열지 않는다
    }
    const list = filtered();
    const i = focusUid ? Math.max(0, list.findIndex(x => x.uid === focusUid)) : 0;
    if (!D.isOpen()) openDeck(list, i, ctx);
    else { deckList = list; deckCtx = ctx; D.update(list, i); }
  }

  // ── 상세 필터 시트 ──
  let sheet = null, sugTimer2 = null, sugSeq2 = 0, fillMyChips = null;
  function openSheet() {
    injectCss(); injectPageCss();
    if (!pg) return;
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'ksn-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      document.body.appendChild(sheet);
      sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-ksn-sheet="close"]')) closeSheet(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) { e.stopImmediatePropagation(); closeSheet(); } });   // 시트만 닫는다(카드 넘겨 보기는 그대로)
    }
    // 11-08b: 주는 드롭다운으로 한 곳, 동네는 최대 3곳. 저장은 centers(주 all 항목 + 동네들) 한 배열
    const draft = { state: ((pg.centers || []).find(c => c.all) || {}).state || '', centers: (pg.centers || []).filter(c => !c.all).map(c => Object.assign({}, c)), radius: pg.radius, sort: pg.sort, gender: pg.gender, price: pg.price };
    const opts = (name, map, cur) => Object.keys(map).map(k => `<button type="button" class="ksn-opt" data-set="${name}" data-val="${k}" aria-pressed="${String(cur) === k ? 'true' : 'false'}">${esc(map[k])}</button>`).join('');
    sheet.innerHTML = `
      <div class="ksn-sheet-box">
        <h3>상세 필터 <button type="button" class="ksn-lnk muted" data-ksn-sheet="close">닫기</button></h3>
        <div class="ksn-lab">주 <span class="ksn-dim">(한 곳)</span></div>
        <select class="ksn-select" id="ksnStateSel"><option value="">고르지 않음</option>${STATES.map(s => `<option value="${s[0]}"${draft.state === s[0] ? ' selected' : ''}>${s[1]} 전체</option>`).join('')}</select>
        <div class="ksn-lab">동네 검색 <span class="ksn-dim">(최대 ${MAX_CENTERS}곳)</span></div>
        <div class="ksn-q"><input id="ksnSheetQ" type="text" placeholder="동네 이름이나 우편번호 — 예: Sunnybank, 4109" autocomplete="off" inputmode="search"><ul class="ksn-sug" id="ksnSheetSug"></ul></div>
        <div id="ksnMyWrap"></div>
        <div class="ksn-centers" id="ksnCenters"></div>
        <div class="ksn-lab">반경 <span class="ksn-dim">(동네 기준)</span></div><div class="ksn-bar" style="padding:0;border:0;">${RADII.map(r => `<button type="button" class="ksn-opt" data-set="radius" data-val="${r}" aria-pressed="${r === draft.radius ? 'true' : 'false'}">${r}km</button>`).join('')}</div>
        <div class="ksn-lab">정렬</div><div class="ksn-bar" style="padding:0;border:0;">${opts('sort', SORTS, draft.sort)}</div>
        <div class="ksn-lab">성별</div><div class="ksn-bar" style="padding:0;border:0;">${opts('gender', GENDERS, draft.gender)}</div>
        <div class="ksn-lab">예산 <span class="ksn-dim">(내 방 주당 가격 · 선택)</span></div>
        <input id="ksnPrice" type="number" inputmode="numeric" min="0" max="3000" step="10" placeholder="예: 250" value="${draft.price ? esc(draft.price) : ''}">
        <div class="ksn-help">적으면 이 가격이 예산 안에 드는 분만 보입니다.</div>
        <button type="button" class="ksn-apply" data-ksn-sheet="apply">적용</button>
      </div>`;
    const box = sheet.querySelector('.ksn-sheet-box');
    // 내 글 동네 칩 — 내 글 조회가 끝나면 채운다(시트를 다시 그리지 않음)
    fillMyChips = () => {
      const w = box.querySelector('#ksnMyWrap'); if (!w || !(pg.myPosts || []).length) return;
      w.innerHTML = `<div class="ksn-lab">내 글 동네</div><div class="ksn-bar" style="padding:0;border:0;">${pg.myPosts.map((m, i) => `<button type="button" class="ksn-opt addr" data-my="${i}" aria-pressed="${draft.centers.some(c => sameCenter(c, m)) ? 'true' : 'false'}">${esc(m.board)} · ${esc(m.name)}</button>`).join('')}</div>`;
    };
    fillMyChips();
    const paintCenters = () => {
      const el = box.querySelector('#ksnCenters');
      el.innerHTML = draft.centers.map((c, i) => `<span class="ksn-center">${esc(c.name + ' ' + String(c.state).toUpperCase())}<button type="button" data-rm="${i}" aria-label="빼기">×</button></span>`).join('');
      box.querySelectorAll('[data-my]').forEach(b => { const m = pg.myPosts[Number(b.dataset.my)]; b.setAttribute('aria-pressed', m && draft.centers.some(c => sameCenter(c, m)) ? 'true' : 'false'); });
      box.querySelector('[data-ksn-sheet="apply"]').disabled = !(draft.centers.length || draft.state);
    };
    const addCenter = c => {
      const i = draft.centers.findIndex(x => sameCenter(x, c));
      if (i !== -1) { draft.centers.splice(i, 1); paintCenters(); return; }
      if (draft.centers.length >= MAX_CENTERS) { toast('동네는 ' + MAX_CENTERS + '곳까지 고를 수 있습니다.'); return; }
      draft.centers.push(c); paintCenters();
    };
    paintCenters();
    const stSel = box.querySelector('#ksnStateSel');
    stSel.addEventListener('change', () => { draft.state = stSel.value || ''; paintCenters(); });
    box.onclick = async e => {
      const my = e.target.closest('[data-my]');
      if (my) { const m = pg.myPosts[Number(my.dataset.my)]; if (m) { addCenter({ name: m.name, state: m.state, lat: m.lat, lng: m.lng }); if (m.price && !box.querySelector('#ksnPrice').value) box.querySelector('#ksnPrice').value = m.price; } return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { draft.centers.splice(Number(rm.dataset.rm), 1); paintCenters(); return; }
      const st = e.target.closest('[data-set]');
      if (st) {
        const k = st.dataset.set, v = st.dataset.val;
        draft[k] = (k === 'radius') ? Number(v) : v;
        st.parentElement.querySelectorAll('[data-set]').forEach(b => b.setAttribute('aria-pressed', b === st ? 'true' : 'false'));
        return;
      }
      if (e.target.closest('[data-ksn-sheet="apply"]')) {
        if (!draft.centers.length && !draft.state) { toast('주나 동네를 한 곳 이상 골라 주십시오.'); return; }
        const pv = Number(box.querySelector('#ksnPrice').value); draft.price = Number.isFinite(pv) && pv > 0 ? Math.round(pv) : 0;
        const stName = (STATES.find(s => s[0] === draft.state) || [])[1] || '';
        const centers = (draft.state ? [{ name: stName, state: draft.state, all: true }] : []).concat(draft.centers.slice(0, MAX_CENTERS));
        Object.assign(pg, { centers, radius: draft.radius, sort: draft.sort, gender: draft.gender, price: draft.price });
        saveFilter(); closeSheet();
        await showResults();
      }
    };
    const q = box.querySelector('#ksnSheetQ'), sug = box.querySelector('#ksnSheetSug');
    q.addEventListener('input', () => {
      const t = q.value.trim(); clearTimeout(sugTimer2);
      if (t.length < 2) { sug.classList.remove('on'); sug.innerHTML = ''; return; }
      const seq = ++sugSeq2;
      sugTimer2 = setTimeout(async () => {
        try {
          const list = await geocodeSuburb(t); if (seq !== sugSeq2) return;
          const st = window.koausGeo && window.koausGeo.lastStatus;
          sug.innerHTML = list.length ? list.map((o, i) => `<li data-i="${i}">${esc(o.name)} ${esc(o.state.toUpperCase())}${o.postcode ? ' ' + esc(o.postcode) : ''}</li>`).join('') : `<li>찾지 못했습니다${st && st !== 'ZERO_RESULTS' && st !== 'OK' ? ' (지도 서비스: ' + esc(st) + ')' : ''}</li>`;
          sug.classList.add('on'); sug._list = list;
        } catch (_) {}
      }, 320);
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const li = sug.querySelector('li[data-i]'); if (li) li.click(); } });
    sug.addEventListener('click', async e => {
      const li = e.target.closest('li[data-i]'); if (!li || !sug._list) return;
      let o = sug._list[Number(li.dataset.i)];
      if (o.approx && window.koausGeo) { try { o = await window.koausGeo.refine(o); } catch (_) {} }   // 우편번호로 고른 동네 → 동네 좌표
      addCenter({ name: o.name, state: o.state, lat: Number(o.lat), lng: Number(o.lng) });
      q.value = ''; sug.classList.remove('on'); sug.innerHTML = '';
    });
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { try { if (!draft.centers.length) q.focus({ preventScroll: true }); } catch (_) {} }, 50);
  }
  function closeSheet() { if (!sheet) return; sheet.classList.remove('open'); document.body.style.overflow = ((deck() && deck().isOpen()) || (ovl && ovl.classList.contains('open'))) ? 'hidden' : ''; }   // 11-08f: 남은 창이 있으면 잠금을 다시 건다(페이지 Esc 처리가 비웠을 수 있음)

  // 도구줄 [쉐어생 구하기] / 탭바 / ?people=1 — 필터 시트부터(지시 18). 지난번 필터는 채워져 있다.
  async function openPage(opts) {
    const user = window.koausAuth && window.koausAuth.user;
    if (!user) { if (window.koausAuth && window.koausAuth.openAuthModal) window.koausAuth.openAuthModal(); return; }
    // 11-08f: 목록은 인증 회원(휴대폰/이메일)만 읽을 수 있다(규칙 isVerifiedUser) — 글쓰기와 같은 게이트로 먼저 안내
    if (window.koausRequireCanPost && !window.koausRequireCanPost(user, window.koausAuth && window.koausAuth.openAuthModal, () => openPage(opts))) return;
    if (!db || !E()) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    injectCss(); injectPageCss();
    if (!pg || pg.uid !== user.uid) {
      const saved = loadFilter() || {};
      const centers = Array.isArray(saved.centers) ? saved.centers.filter(c => c && c.state && (c.all || (typeof c.lat === 'number' && typeof c.lng === 'number'))).slice(0, MAX_CENTERS + 1) : [];
      pg = { uid: user.uid, centers, radius: RADII.includes(saved.radius) ? saved.radius : 5, sort: SORTS[saved.sort] ? saved.sort : 'near',
             gender: GENDERS[saved.gender] ? saved.gender : 'all', price: Number(saved.price) || 0, all: null, allKey: '', myPosts: [] };
      loadMyPosts(user.uid).then(list => { pg.myPosts = list; try { if (sheet && sheet.classList.contains('open') && fillMyChips) fillMyChips(); } catch (_) {} });
    }
    if (opts && opts.seeker) { await openSeekerLink(opts.seeker); return; }
    openSheet();
  }
  // 공유 링크(?seeker=uid) — 그 사람 카드 한 장부터. '필터 변경'으로 이어서 찾을 수 있다.
  async function openSeekerLink(uid) {
    const user = window.koausAuth && window.koausAuth.user; if (!user) return;
    if (uid === user.uid) { toast('본인 프로필입니다.'); openSheet(); return; }
    try {
      const snap = await getDoc(doc(db, 'seeker_profiles', uid));
      if (!snap.exists() || snap.data().visible !== true) { toast('이 프로필은 지금 공개되어 있지 않습니다.'); openSheet(); return; }
      const x = snap.data();
      const m = (pg && pg.centers.length) ? matchOf(x, pg.centers, pg.radius) : null;
      openDeck([Object.assign({ uid, p: x }, m || { km: null, reach: 0, wide: false, center: null })], 0, { price: pg ? pg.price : 0, radius: pg ? pg.radius : 5, title: '구하는 사람', showCenter: true });
    } catch (e) { console.warn('[seekers-nearby] 링크 조회 실패', e); toast('이 프로필을 불러오지 못했습니다.'); openSheet(); }
  }
  function closePage() { try { if (deck()) deck().close(); } catch (_) {} closeSheet(); }

  // ?people=1 딥링크(탭바·공유 링크) — 로그인 확정 뒤 한 번
  (function autoOpen() {
    let q; try { q = new URLSearchParams(location.search); } catch (_) { return; }
    const want = q.get('people') === '1' || !!q.get('seeker'); if (!want) return;
    const t0 = Date.now();
    const tick = () => {
      const user = window.koausAuth && window.koausAuth.user;
      if (user && db && E() && deck()) { openPage({ seeker: q.get('seeker') || '' }); return; }
      if (Date.now() - t0 < 8000) setTimeout(tick, 250);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 300)); else setTimeout(tick, 300);
  })();

  // mountPage(host): 옛 마이페이지 '구하는 사람' 탭용 — 탭은 숨김(koaus-role.js). 호출되면 안내 한 줄과 [쉐어생 구하기] 버튼만 그린다.
  function mountPage(host) { if (!host) return; host.innerHTML = '<div class="post-empty">구하는 사람은 쉐어·렌트 목록의 [쉐어생 구하기]에서 봅니다. <button type="button" class="ksn-btn primary" data-ksn-mount-open>지금 열기</button></div>'; host.onclick = e => { if (e.target.closest('[data-ksn-mount-open]')) openPage(); }; }
  window.koausSeekersNearby = { open, close, mountPage, openDetail: (it, ctx) => openDeck([it], 0, ctx || {}), openPage, closePage, openSheet, isSavedSeeker };
})();
