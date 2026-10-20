// ════════════════════════════════════════════════════════════════════
//  KoAus · 근처에서 구하는 사람 보기 (집주인 → seeker_profiles) — 2단계 ① (2026-10)
//  - accom.html / rent.html 이 로드하는 ES module. 본인 글 상세의 "근처에서 구하는 사람 보기" 버튼이
//    window.koausSeekersNearby.open(post, board) 호출 → 자체 모달.
//  - 조회: where('states','array-contains', 글의 주) + where('visible','==',true)
//          + orderBy('lastActiveAt','desc') + limit(20)   ← rules limitedList ≤20 · 복합 인덱스 필수
//    거리(반경 5/10/20/50km, 기본 10)는 클라이언트: 글 좌표(오프셋) ↔ 프로필 희망 동네 중심 중 가장 가까운 것.
//  - 여성 전용 글(gender==='female')이면 여성 프로필만. '예산 맞음' 토글 = 글 가격이 프로필 예산 범위 안.
//  - 연락 = 기존 chats 규칙 그대로: chatId {seekerUid}_{집주인uid}, postId=seekerUid, board 'seeker',
//    ownerUid=seekerUid(프로필 주인), inquirerUid=집주인. create-first → chat.html?id= 이동.
//    lastMsgAt 은 넣지 않음 — 첫 메시지 전까지 상대 목록에 빈 방이 안 뜸(의도).
//  - 빈 결과 문구(확정): 목록 끝 "더 이상 표시할 프로필이 없습니다. 범위를 늘리시겠습니까?" → "범위 늘리기".
// ════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

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
  let db = null;
  try { db = getFirestore(getApps().length ? getApp() : initializeApp(firebaseConfig)); } catch (e) { try { console.warn('[seekers-nearby] init 실패', e); } catch (_) {} }

  const E = () => window.koausEnums;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = m => { try { if (window.koausToast) window.koausToast.show(m); else alert(m); } catch (_) { alert(m); } };
  const $ = (sel, root) => (root || document).querySelector(sel);

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
      .ksn-body{overflow:auto;flex:1;padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px}
      .ksn-card{border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-card);padding:14px;display:flex;flex-direction:column;gap:8px}
      .ksn-top{display:flex;align-items:center;gap:10px}
      .ksn-ava{width:40px;height:40px;border-radius:50%;background:var(--accent);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex:0 0 auto}
      .ksn-name{font-weight:700;font-size:15px}
      .ksn-meta{font-size:12.5px;color:var(--text-muted)}
      .ksn-tags{display:flex;flex-wrap:wrap;gap:5px}
      .ksn-tag{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);background:var(--bg-surface)}
      .ksn-tag.ok{border-color:rgba(22,163,74,.35);background:var(--green-bg);color:var(--green)}
      .ksn-grid{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:13.5px}
      .ksn-grid dt{color:var(--text-muted)}
      .ksn-grid dd{margin:0}
      .ksn-intro{font-size:13.5px;line-height:1.55;white-space:pre-wrap;border-top:1px solid var(--border-subtle);padding-top:8px}
      .ksn-btn{appearance:none;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary);border-radius:var(--r-md);padding:9px 14px;font-size:14px;cursor:pointer;font-family:inherit}
      .ksn-btn.primary{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
      .ksn-btn.small{padding:6px 10px;font-size:12.5px}
      .ksn-btn:disabled{opacity:.5;cursor:default}
      .ksn-end{text-align:center;color:var(--text-muted);font-size:13.5px;padding:18px 8px;display:flex;flex-direction:column;gap:10px;align-items:center}
      .ksn-km{font-size:12.5px;color:var(--text-secondary);font-weight:600}
      /* 간단 행(10-20) */
      .ksn-row{appearance:none;width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border);border-radius:14px;padding:14px 16px;background:var(--bg-base);color:var(--text-primary);cursor:pointer;font-family:inherit}
      .ksn-row:hover{border-color:var(--text-primary)}
      .ksn-row-main{display:flex;flex-direction:column;gap:3px;min-width:0}
      .ksn-row-nick{font-size:17px;font-weight:800;letter-spacing:-.01em}
      .ksn-row-meta{font-size:13px;color:var(--text-muted)}
      .ksn-row-arr{color:var(--text-muted);font-size:18px;flex:0 0 auto}
      /* 프로필 페이지 */
      .ksn-detail{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9050;display:none;align-items:stretch;justify-content:center}
      .ksn-detail.open{display:flex}
      .ksn-detail-box{width:100%;background:var(--bg-base);color:var(--text-primary);display:flex;flex-direction:column;max-height:100%}
      @media(min-width:640px){.ksn-detail{align-items:center;padding:20px}.ksn-detail-box{max-width:560px;border-radius:18px;max-height:90vh;overflow:hidden}}
      .ksn-detail-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);font-size:14px}
      .ksn-detail-bar b{font-size:15px}
      .ksn-lnk{appearance:none;border:0;background:none;color:var(--text-primary);font-size:14px;cursor:pointer;font-family:inherit;padding:4px 0}
      .ksn-lnk.muted{color:var(--text-muted)}
      .ksn-detail-body{overflow:auto;flex:1}
      .ksn-detail-hero{padding:20px 16px 14px}
      .ksn-detail-nick{font-size:24px;font-weight:800;letter-spacing:-.02em}
      .ksn-detail-meta{font-size:14px;color:var(--text-muted);margin-top:4px}
      .ksn-sec{padding:14px 16px;border-top:1px solid var(--border)}
      .ksn-sec h4{margin:0 0 8px;font-size:12.5px;color:var(--text-muted);font-weight:700}
      .ksn-line{font-size:16px;font-weight:700;line-height:1.5}
      .ksn-rows{display:grid;grid-template-columns:52px 1fr;gap:7px 10px;font-size:14px;margin:0}
      .ksn-rows dt{color:var(--text-muted)} .ksn-rows dd{margin:0;font-weight:600}
      .ksn-note{font-size:12.5px;color:var(--text-muted);line-height:1.5;padding:12px 16px;border-top:1px solid var(--border)}
      .ksn-detail-foot{display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border);background:var(--bg-base)}
      .ksn-btn.big{padding:13px 16px;font-size:15px;font-weight:800;border-radius:12px;flex:1}
      .ksn-btn.big.ghost{flex:0 0 auto;background:var(--bg-base);color:var(--text-primary);border-color:var(--text-primary)}
    `;
    document.head.appendChild(st);
  }

  let ovl = null, post = null, board = '', radius = 10, budgetOnly = false, all = null, busy = false;

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
      if (o) { const it = (all || []).find(x => x.uid === o.dataset.ksnOpen); if (it) openDetail(it, { price: Number(post && post.price) || 0, radius }); return; }
      const c = e.target.closest('[data-ksn-chat]');
      if (c) startChat(c.dataset.ksnChat, c);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovl.classList.contains('open')) close(); });
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

  async function open(p, b) {
    const user = window.koausAuth && window.koausAuth.user;
    if (!user) { toast('로그인 후 이용할 수 있습니다.'); return; }
    if (!db) { toast('잠시 후 다시 시도해 주십시오.'); return; }
    mount();
    post = p; board = b || 'accom'; radius = 5; budgetOnly = false; all = null;
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
        let km = null;
        if (pc && Array.isArray(x.suburbs)) {
          x.suburbs.forEach(s => { if (typeof s.lat === 'number' && typeof s.lng === 'number') { const k = kmBetween(pc, s); if (km == null || k < km) km = k; } });
        }
        return { uid: d.id, p: x, km };
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
    const list = all.filter(it => {
      if (femaleOnly && it.p.gender !== 'female') return false;
      if (hasCoords && (it.km == null || it.km > Math.max(radius, Number(it.p.radiusKm) || 0))) return false;   // 양방향: 집주인 반경 또는 구하는 사람 반경 중 큰 쪽
      if (budgetOnly && price && !(it.p.budgetMin <= price && price <= it.p.budgetMax)) return false;
      return true;
    }).sort((a, b) => (a.km == null || b.km == null) ? 0 : a.km - b.km);
    const atMax = !hasCoords || radius === RADII[RADII.length - 1];
    const end = atMax
      ? '<div class="ksn-end">더 이상 표시할 프로필이 없습니다.</div>'
      : '<div class="ksn-end"><span>더 이상 표시할 프로필이 없습니다. 범위를 늘리시겠습니까?</span><button type="button" class="ksn-btn primary" data-ksn="more">범위 늘리기</button></div>';
    $('#ksnBody', ovl).innerHTML = list.map(it => card(it, en, price)).join('') + end;
  }

  // 카드 = 간단 행(닉네임 + 성별·나이대·거리). 사진·글자 동그라미 없음(10-20 확정). 누르면 프로필 페이지(openDetail).
  function card(it, en, price) {
    const p = it.p;
    const nick = String(p.nick || p.firstName || '').trim() || '회원';
    const meta = [];
    if (p.gender) meta.push(en.label('genders', p.gender));
    if (p.ageBand) meta.push(en.label('ageBands', p.ageBand));
    if (it.km != null) meta.push(it.km < 1 ? '1km 이내' : '약 ' + Math.round(it.km) + 'km');
    const saved = isSavedSeeker(it.uid);
    return `
      <button type="button" class="ksn-row" data-ksn-open="${esc(it.uid)}">
        <span class="ksn-row-main"><span class="ksn-row-nick">${esc(nick)}</span><span class="ksn-row-meta">${esc(meta.join(' · ') || '조건 등록')}${saved ? ' · 저장됨' : ''}</span></span>
        <span class="ksn-row-arr" aria-hidden="true">›</span>
      </button>`;
  }
  // 저장(관심) — 기기 LS. 목록 필터 '저장한 분만'
  const SAVED_KEY = 'koaus-saved-seekers-v1';
  function savedSeekers() { try { const a = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function isSavedSeeker(uid) { return savedSeekers().includes(uid); }
  function toggleSavedSeeker(uid) { const a = savedSeekers(); const i = a.indexOf(uid); if (i === -1) a.push(uid); else a.splice(i, 1); try { localStorage.setItem(SAVED_KEY, JSON.stringify(a.slice(-200))); } catch (_) {} return i === -1; }

  // 찾는 조건 한 문장 — 카드·프로필 페이지·미리보기 공용 문구
  function conditionSentence(p, en) {
    const subs = (p.suburbs || []).map(x => x.name).filter(Boolean).slice(0, 3).join(' · ');
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

  // ── 프로필 페이지(상세) — 목록·모달 공용. 휴대폰 전체 화면, 데스크탑 가운데 ──
  let det = null, detUid = null;
  function openDetail(it, ctx) {
    const en = E(); if (!it || !en) return;
    const p = it.p; detUid = it.uid;
    if (!det) {
      det = document.createElement('div'); det.className = 'ksn-detail'; det.setAttribute('role', 'dialog'); det.setAttribute('aria-modal', 'true');
      document.body.appendChild(det);
      det.addEventListener('click', e => {
        if (e.target === det || e.target.closest('[data-ksn-detail="back"]')) { closeDetail(); return; }
        if (e.target.closest('[data-ksn-detail="report"]')) { reportSeeker(); return; }
        const sv = e.target.closest('[data-ksn-detail="save"]');
        if (sv) { const on = toggleSavedSeeker(detUid); sv.textContent = on ? '저장됨' : '저장'; sv.setAttribute('aria-pressed', on ? 'true' : 'false'); refreshLists(); return; }
        const c = e.target.closest('[data-ksn-chat]'); if (c) startChat(c.dataset.ksnChat, c);
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && det.classList.contains('open')) closeDetail(); });
    }
    const nick = String(p.nick || p.firstName || '').trim() || '회원';
    const meta = [];
    if (p.gender) meta.push(en.label('genders', p.gender));
    if (p.ageBand) meta.push(en.label('ageBands', p.ageBand));
    const act = tsAgo(p.lastActiveAt); if (act) meta.push(act);
    if (it.km != null) meta.push(it.km < 1 ? '1km 이내' : '약 ' + Math.round(it.km) + 'km');
    const subs = (p.suburbs || []).map(x => esc(x.name) + ' ' + esc(String(x.state || '').toUpperCase())).join(' · ');
    const rooms = (p.roomTypes || []).map(c => en.label('roomTypes', c)).filter(Boolean).join(', ');
    const price = Number(ctx && ctx.price) || 0;
    const fit = [];
    if (price) fit.push(price >= (p.budgetMin || 0) && price <= (p.budgetMax != null ? p.budgetMax : 1e9) ? '<span class="ksn-tag ok">예산 맞음</span>' : '<span class="ksn-tag">예산 밖</span>');
    if (it.km != null) fit.push(it.km <= Math.max(Number(ctx && ctx.radius) || 0, Number(p.radiusKm) || 0) ? '<span class="ksn-tag ok">반경 안</span>' : '<span class="ksn-tag">반경 밖</span>');
    if (p.moveIn) { const d = new Date(p.moveIn + 'T00:00:00'); const days = Math.ceil((d - new Date()) / 86400000); fit.push(`<span class="ksn-tag">${days <= 0 ? '입주 지금 바로' : '입주일 ' + days + '일 뒤'}</span>`); }
    const saved = isSavedSeeker(it.uid);
    det.innerHTML = `
      <div class="ksn-detail-box">
        <div class="ksn-detail-bar"><button type="button" class="ksn-lnk" data-ksn-detail="back">‹ 구하는 사람</button><b>${esc(nick)}</b><button type="button" class="ksn-lnk muted" data-ksn-detail="report">신고</button></div>
        <div class="ksn-detail-body">
          <div class="ksn-detail-hero"><div class="ksn-detail-nick">${esc(nick)}</div><div class="ksn-detail-meta">${esc(meta.join(' · '))}</div></div>
          <div class="ksn-sec"><h4>찾는 조건</h4><div class="ksn-line">${esc(conditionSentence(p, en))}</div></div>
          <div class="ksn-sec"><h4>자세히</h4><dl class="ksn-rows">
            <dt>동네</dt><dd>${subs || '—'}${p.radiusKm ? ' (반경 ' + esc(p.radiusKm) + 'km)' : ''}</dd>
            <dt>예산</dt><dd>주 $${esc(p.budgetMin != null ? p.budgetMin : 0)}${p.budgetMax != null ? ' ~ $' + esc(p.budgetMax) : ' 이상'}</dd>
            <dt>입주</dt><dd>${esc(p.moveIn || '—')}${p.stay ? ' · ' + esc(en.label('stays', p.stay)) : ''}</dd>
            <dt>방</dt><dd>${esc(rooms || '상관없음')}${p.bathroom === 'private' ? ' · 개인 욕실' : ''}</dd>
          </dl></div>
          ${fit.length ? `<div class="ksn-sec"><h4>내 방과 맞는지</h4><div class="ksn-tags">${fit.join('')}</div></div>` : ''}
          <div class="ksn-note">소개글·신분·흡연·반려동물은 본인만 보는 칸입니다. 채팅이 시작되면 이 분이 직접 보낼 수 있습니다. 연락은 채팅으로만 됩니다.</div>
        </div>
        <div class="ksn-detail-foot"><button type="button" class="ksn-btn primary big" data-ksn-chat="${esc(it.uid)}">채팅으로 연락</button><button type="button" class="ksn-btn big ghost" data-ksn-detail="save" aria-pressed="${saved ? 'true' : 'false'}">${saved ? '저장됨' : '저장'}</button></div>
      </div>`;
    det.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeDetail() { if (!det) return; det.classList.remove('open'); if (!(ovl && ovl.classList.contains('open'))) document.body.style.overflow = ''; }
  function reportSeeker() {
    const it = (pg && pg.all || all || []).find(x => x.uid === detUid); if (!it) return;
    if (!window.koausDb && db) { try { window.koausDb = db; window.koausFs = { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, limit }; } catch (_) {} }
    if (window.koausReport && window.koausReport.open) window.koausReport.open({ postId: detUid, board: 'seeker', postTitle: '집 구해요 · ' + (it.p.nick || ''), postAuthorUid: detUid });
    else location.href = 'contact.html';
  }
  function refreshLists() { try { if (pg && pg.host) renderPage(); } catch (_) {} try { if (ovl && ovl.classList.contains('open')) render(); } catch (_) {} }

  async function startChat(seekerUid, btn) {
    const user = window.koausAuth && window.koausAuth.user;
    if (!user || busy) return;
    if (seekerUid === user.uid) { toast('본인 프로필입니다.'); return; }
    const it = all && all.find(x => x.uid === seekerUid);
    const chatId = seekerUid + '_' + user.uid;
    const goRoom = () => { location.href = 'chat.html?id=' + encodeURIComponent(chatId); };
    const payload = {
      postId: seekerUid, board: 'seeker',
      ownerUid: seekerUid, inquirerUid: user.uid,
      participants: [seekerUid, user.uid],
      unreadFor: [], blockedBy: [],
      createdAt: serverTimestamp(),
      postTitle: ('집 구해요 · ' + ((it && (it.p.nick || it.p.firstName)) || '')).slice(0, 200),
    };
    const oNick = String((it && (it.p.nick || it.p.firstName)) || '').trim().slice(0, 60);
    if (oNick) payload.ownerNick = oNick;
    let iNick = '';
    try { iNick = (localStorage.getItem('koaus-nickname') || user.displayName || '').trim().slice(0, 60); } catch (_) {}
    if (iNick) payload.inquirerNick = iNick;
    busy = true; if (btn) btn.disabled = true;
    const done = () => { busy = false; try { if (btn) btn.disabled = false; } catch (_) {} };
    const denyMsg = '채팅을 시작할 수 없습니다. 휴대폰(SMS) 본인 인증을 완료했는지 확인해 주십시오.';
    try {
      await setDoc(doc(db, 'chats', chatId), payload);
      done(); goRoom();
    } catch (_) {
      try {
        const snap = await getDoc(doc(db, 'chats', chatId));
        done();
        if (snap && snap.exists()) goRoom(); else alert(denyMsg);
      } catch (__) { done(); alert(denyMsg); }
    }
  }

  // ═══ 페이지 모드 (①-3, 2026-10 / 10-20 개편) — 마이페이지 ?tab=people '구하는 사람' 탭 / 탭바 '프로필' ═══
  //   · 머리 한 줄: "Sunnybank Hills · 5km · 가까운 순 · 전체" + [필터] → 시트(기준 주소: 내 글 칩/동네 검색 · 반경 · 정렬 · 성별 · 예산 · 저장한 분만)
  //   · 행(닉네임 + 성별·나이대·거리) → 누르면 프로필 페이지(openDetail). 사진·동그라미 없음.
  //   · 매칭 = 거리 ≤ max(내 반경, 구하는 사람 반경). 정렬: 가까운 순 / 최신 등록 순 / 예산 낮은 순.
  const GEOCODE_KEY = 'AIzaSyDwogQ55V0-JqZ-ZYRTpYgNZWOdp_-5vOQ';
  const CENTER_KEY = 'koaus-people-center-v2';
  let pg = null;   // { host, center, radius, sort, gender, budgetOnly, savedOnly, price, all, myPosts, sheetOpen }

  function injectPageCss() {
    if (document.getElementById('ksnPageStyle')) return;
    const st = document.createElement('style'); st.id = 'ksnPageStyle';
    st.textContent = `
      .ksn-page{display:flex;flex-direction:column;gap:8px}
      .ksn-hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px}
      .ksn-sum{font-size:13.5px;color:var(--text-muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
      .ksn-sum b{color:var(--text-primary)}
      .ksn-fbtn{flex:0 0 auto;appearance:none;border:1.5px solid var(--text-primary);background:var(--bg-base);color:var(--text-primary);border-radius:999px;padding:8px 14px;font-size:13.5px;font-weight:800;font-family:inherit;cursor:pointer}
      .ksn-page .ksn-end{padding:14px 0}
      /* 필터 시트 */
      .ksn-sheet{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9040;display:none;align-items:flex-end;justify-content:center}
      .ksn-sheet.open{display:flex}
      .ksn-sheet-box{width:100%;max-width:560px;background:var(--bg-base);color:var(--text-primary);border-radius:18px 18px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow:auto}
      @media(min-width:640px){.ksn-sheet{align-items:center}.ksn-sheet-box{border-radius:18px}}
      .ksn-sheet h3{margin:0 0 6px;font-size:16px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
      .ksn-lab{font-size:12.5px;color:var(--text-muted);font-weight:700;margin:12px 0 6px}
      .ksn-sheet .ksn-opt{padding:7px 12px}
      .ksn-sheet .ksn-opt.addr{border-radius:10px}
      .ksn-sheet .ksn-q{position:relative;margin-top:6px}
      .ksn-sheet input{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:inherit;background:var(--bg-base);color:var(--text-primary)}
      .ksn-sug{list-style:none;margin:4px 0 0;padding:0;border:1px solid var(--border);border-radius:10px;background:var(--bg-base);max-height:200px;overflow:auto;display:none}
      .ksn-sug.on{display:block}
      .ksn-sug li{padding:9px 12px;font-size:13.5px;cursor:pointer;border-bottom:1px solid var(--border-subtle)}
      .ksn-sug li:last-child{border-bottom:0}
      .ksn-sug li:hover{background:var(--bg-card)}
      .ksn-apply{margin-top:16px;appearance:none;border:0;background:var(--text-primary);color:var(--bg-base);border-radius:12px;padding:13px;font-size:15px;font-weight:800;font-family:inherit;width:100%;cursor:pointer}`;
    document.head.appendChild(st);
  }
  function loadCenter() { try { return JSON.parse(localStorage.getItem(CENTER_KEY) || 'null'); } catch (_) { return null; } }
  function saveCenter() { try { localStorage.setItem(CENTER_KEY, JSON.stringify({ center: pg.center, radius: pg.radius, sort: pg.sort, gender: pg.gender, price: pg.price })); } catch (_) {} }

  async function geocodeSuburb(text) {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(text) + '&components=country:AU&language=ko&key=' + GEOCODE_KEY;
    const res = await fetch(url); const j = await res.json();
    const out = [];
    (j.results || []).forEach(r => {
      const comps = r.address_components || [];
      const get = t => comps.find(x => (x.types || []).includes(t)) || null;
      const loc = get('locality') || get('sublocality') || get('postal_town');
      const st = get('administrative_area_level_1');
      if (!loc || !st || !r.geometry || !r.geometry.location) return;
      const code = String(st.short_name || '').toLowerCase();
      if (!['qld', 'nsw', 'vic', 'wa', 'sa', 'tas', 'act', 'nt'].includes(code)) return;
      out.push({ name: loc.long_name, state: code, lat: r.geometry.location.lat, lng: r.geometry.location.lng });
    });
    const seen = new Set();
    return out.filter(o => { const k = o.name + '|' + o.state; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
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
  async function fetchFor(center, meUid) {
    const snap = await getDocs(query(collection(db, 'seeker_profiles'), where('states', 'array-contains', center.state), where('visible', '==', true), orderBy('lastActiveAt', 'desc'), limit(20)));
    return snap.docs.filter(d => d.id !== meUid).map(d => {
      const x = d.data() || {};
      let km = null;
      (Array.isArray(x.suburbs) ? x.suburbs : []).forEach(s => { if (typeof s.lat === 'number' && typeof s.lng === 'number') { const k = kmBetween(center, s); if (km == null || k < km) km = k; } });
      return { uid: d.id, p: x, km };
    });
  }

  const SORTS = { near: '가까운 순', new: '최신 등록 순', budget: '예산 낮은 순' };
  const GENDERS = { all: '전체', female: '여성', male: '남성' };
  function filtered() {
    const list = (pg.all || []).filter(it => {
      if (pg.gender !== 'all' && it.p.gender !== pg.gender) return false;
      if (it.km == null || it.km > Math.max(pg.radius, Number(it.p.radiusKm) || 0)) return false;   // 양방향
      if (pg.budgetOnly && pg.price && !((it.p.budgetMin || 0) <= pg.price && pg.price <= (it.p.budgetMax != null ? it.p.budgetMax : 1e9))) return false;
      if (pg.savedOnly && !isSavedSeeker(it.uid)) return false;
      return true;
    });
    const ms = ts => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : 0;
    if (pg.sort === 'new') list.sort((a, b) => ms(b.p.createdAt) - ms(a.p.createdAt));
    else if (pg.sort === 'budget') list.sort((a, b) => ((a.p.budgetMax != null ? a.p.budgetMax : 1e9) - (b.p.budgetMax != null ? b.p.budgetMax : 1e9)));
    else list.sort((a, b) => a.km - b.km);
    return list;
  }

  function renderPage() {
    if (!pg || !pg.host) return;
    const en = E(); const h = pg.host; const c = pg.center;
    const sum = c
      ? `<b>${esc(c.name)}</b> · ${pg.radius}km · ${SORTS[pg.sort]} · ${GENDERS[pg.gender]}${pg.budgetOnly ? ' · 예산 맞음' : ''}${pg.savedOnly ? ' · 저장한 분' : ''}`
      : '기준 동네를 정해 주십시오';
    let body = '';
    if (!c) body = '<div class="ksn-end">[필터]에서 기준 동네(내 글 또는 검색)를 고르면 그 근처에서 집을 구하는 분들이 보입니다.</div>';
    else if (!pg.all) body = '<div class="ksn-end">불러오는 중…</div>';
    else {
      const list = filtered();
      const atMax = pg.radius === RADII[RADII.length - 1];
      const end = atMax
        ? '<div class="ksn-end">더 이상 표시할 프로필이 없습니다.</div>'
        : `<div class="ksn-end"><span>더 이상 표시할 프로필이 없습니다.</span><button type="button" class="ksn-btn primary" data-ksn="more">범위 늘리기 (${RADII[RADII.indexOf(pg.radius) + 1]}km)</button></div>`;
      body = list.map(it => card(it, en, pg.price)).join('') + end;
    }
    h.innerHTML = `<div class="ksn-page"><div class="ksn-hdr"><div class="ksn-sum">${sum}</div><button type="button" class="ksn-fbtn" data-ksn="filter">필터</button></div>${body}</div>`;
    h.onclick = e => {
      if (e.target.closest('[data-ksn="filter"]')) { openSheet(); return; }
      if (e.target.closest('[data-ksn="more"]')) { const i = RADII.indexOf(pg.radius); if (i < RADII.length - 1) { pg.radius = RADII[i + 1]; saveCenter(); renderPage(); } return; }
      const o = e.target.closest('[data-ksn-open]');
      if (o) { const it = (pg.all || []).find(x => x.uid === o.dataset.ksnOpen); if (it) openDetail(it, { price: pg.price, radius: pg.radius }); }
    };
  }

  // ── 필터 시트 ──
  let sheet = null, sugTimer2 = null, sugSeq2 = 0;
  function openSheet() {
    injectPageCss();
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'ksn-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      document.body.appendChild(sheet);
      sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-ksn-sheet="close"]')) closeSheet(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet(); });
    }
    const draft = { center: pg.center, radius: pg.radius, sort: pg.sort, gender: pg.gender, budgetOnly: pg.budgetOnly, savedOnly: pg.savedOnly, price: pg.price };
    const chips = (pg.myPosts || []).map((m, i) => `<button type="button" class="ksn-opt addr" data-my="${i}" aria-pressed="${draft.center && draft.center.lat === m.lat && draft.center.lng === m.lng ? 'true' : 'false'}">${esc(m.board)} · ${esc(m.name)}</button>`).join('');
    const custom = draft.center && !(pg.myPosts || []).some(m => m.lat === draft.center.lat && m.lng === draft.center.lng);
    const opts = (name, map, cur) => Object.keys(map).map(k => `<button type="button" class="ksn-opt" data-set="${name}" data-val="${k}" aria-pressed="${String(cur) === k ? 'true' : 'false'}">${esc(map[k])}</button>`).join('');
    sheet.innerHTML = `
      <div class="ksn-sheet-box">
        <h3>필터 <button type="button" class="ksn-lnk muted" data-ksn-sheet="close">닫기</button></h3>
        <div class="ksn-lab">기준 주소</div>
        <div class="ksn-bar" style="padding:0;border:0;">${chips}${custom ? `<button type="button" class="ksn-opt addr" data-my="custom" aria-pressed="true">${esc(draft.center.name)}</button>` : ''}</div>
        <div class="ksn-q"><input id="ksnSheetQ" type="text" placeholder="다른 동네 검색 — 예: Sunnybank, 4109" autocomplete="off" inputmode="search"><ul class="ksn-sug" id="ksnSheetSug"></ul></div>
        <div class="ksn-lab">반경</div><div class="ksn-bar" style="padding:0;border:0;">${RADII.map(r => `<button type="button" class="ksn-opt" data-set="radius" data-val="${r}" aria-pressed="${r === draft.radius ? 'true' : 'false'}">${r}km</button>`).join('')}</div>
        <div class="ksn-lab">정렬</div><div class="ksn-bar" style="padding:0;border:0;">${opts('sort', SORTS, draft.sort)}</div>
        <div class="ksn-lab">성별</div><div class="ksn-bar" style="padding:0;border:0;">${opts('gender', GENDERS, draft.gender)}</div>
        ${draft.price ? `<div class="ksn-lab">예산 (내 방 주 $${esc(draft.price)})</div><div class="ksn-bar" style="padding:0;border:0;">${opts('budgetOnly', { false: '전체', true: '내 방 가격에 맞는 분만' }, draft.budgetOnly)}</div>` : ''}
        <div class="ksn-lab">저장</div><div class="ksn-bar" style="padding:0;border:0;">${opts('savedOnly', { false: '전체', true: '저장한 분만' }, draft.savedOnly)}</div>
        <button type="button" class="ksn-apply" data-ksn-sheet="apply">적용</button>
      </div>`;
    const box = sheet.querySelector('.ksn-sheet-box');
    box.onclick = async e => {
      const my = e.target.closest('[data-my]');
      if (my) {
        if (my.dataset.my !== 'custom') { const m = pg.myPosts[Number(my.dataset.my)]; draft.center = { name: m.name, state: m.state, lat: m.lat, lng: m.lng }; draft.price = m.price || 0; }
        box.querySelectorAll('[data-my]').forEach(b => b.setAttribute('aria-pressed', b === my ? 'true' : 'false'));
        return;
      }
      const st = e.target.closest('[data-set]');
      if (st) {
        const k = st.dataset.set, v = st.dataset.val;
        draft[k] = (k === 'radius') ? Number(v) : (v === 'true' ? true : v === 'false' ? false : v);
        st.parentElement.querySelectorAll('[data-set]').forEach(b => b.setAttribute('aria-pressed', b === st ? 'true' : 'false'));
        return;
      }
      if (e.target.closest('[data-ksn-sheet="apply"]')) {
        const changedCenter = !pg.center || !draft.center || pg.center.lat !== draft.center.lat || pg.center.lng !== draft.center.lng || pg.center.state !== draft.center.state;
        Object.assign(pg, { radius: draft.radius, sort: draft.sort, gender: draft.gender, budgetOnly: draft.budgetOnly, savedOnly: draft.savedOnly, price: draft.price });
        closeSheet();
        if (draft.center && changedCenter) await setCenter(draft.center); else { saveCenter(); renderPage(); }
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
          sug.innerHTML = list.length ? list.map((o, i) => `<li data-i="${i}">${esc(o.name)} ${esc(o.state.toUpperCase())}</li>`).join('') : '<li>찾지 못했습니다</li>';
          sug.classList.add('on'); sug._list = list;
        } catch (_) {}
      }, 320);
    });
    sug.addEventListener('click', e => {
      const li = e.target.closest('li[data-i]'); if (!li || !sug._list) return;
      const o = sug._list[Number(li.dataset.i)];
      draft.center = { name: o.name, state: o.state, lat: o.lat, lng: o.lng }; draft.price = 0;
      q.value = o.name + ' ' + o.state.toUpperCase(); sug.classList.remove('on');
      box.querySelectorAll('[data-my]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    });
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() { if (!sheet) return; sheet.classList.remove('open'); document.body.style.overflow = ''; }

  async function setCenter(c) {
    if (!c) return;
    pg.center = { name: c.name, state: c.state, lat: c.lat, lng: c.lng };
    if (c.price != null) pg.price = c.price || 0;
    pg.all = null; saveCenter();
    renderPage();
    try {
      const user = window.koausAuth && window.koausAuth.user;
      pg.all = await fetchFor(pg.center, user ? user.uid : '');
    } catch (e) { console.warn('[seekers-nearby] 조회 실패', e); pg.all = []; toast('불러오지 못했습니다. 잠시 후 다시 시도해 주십시오.'); }
    renderPage();
  }

  async function mountPage(host) {
    if (!host) return;
    injectCss(); injectPageCss();
    const user = window.koausAuth && window.koausAuth.user;
    if (!user) { host.innerHTML = '<div class="post-empty">로그인 후 이용할 수 있습니다.</div>'; return; }
    if (!db || !E()) { host.innerHTML = '<div class="post-empty">불러오는 중…</div>'; setTimeout(() => mountPage(host), 600); return; }
    const saved = loadCenter() || {};
    pg = { host, center: null, radius: RADII.includes(saved.radius) ? saved.radius : 5, sort: SORTS[saved.sort] ? saved.sort : 'near',
           gender: GENDERS[saved.gender] ? saved.gender : 'all', budgetOnly: false, savedOnly: false, price: Number(saved.price) || 0, all: null, myPosts: [] };
    renderPage();
    pg.myPosts = await loadMyPosts(user.uid);
    if (saved.center && saved.center.lat && saved.center.state) setCenter(saved.center);
    else if (pg.myPosts.length) setCenter(pg.myPosts[0]);
    else renderPage();
  }

  window.koausSeekersNearby = { open, close, mountPage, openDetail };
})();
