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
  const RADII = [5, 10, 20, 50];
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
    post = p; board = b || 'accom'; radius = 10; budgetOnly = false; all = null;
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
      if (hasCoords && (it.km == null || it.km > radius)) return false;
      if (budgetOnly && price && !(it.p.budgetMin <= price && price <= it.p.budgetMax)) return false;
      return true;
    }).sort((a, b) => (a.km == null || b.km == null) ? 0 : a.km - b.km);
    const atMax = !hasCoords || radius === RADII[RADII.length - 1];
    const end = atMax
      ? '<div class="ksn-end">더 이상 표시할 프로필이 없습니다.</div>'
      : '<div class="ksn-end"><span>더 이상 표시할 프로필이 없습니다. 범위를 늘리시겠습니까?</span><button type="button" class="ksn-btn primary" data-ksn="more">범위 늘리기</button></div>';
    $('#ksnBody', ovl).innerHTML = list.map(it => card(it, en, price)).join('') + end;
  }

  function card(it, en, price) {
    const p = it.p;
    const initial = (String(p.firstName || '?').trim()[0] || '?').toUpperCase();
    const tags = [];
    if (p.ageBand) tags.push(en.label('ageBands', p.ageBand));
    if (p.gender) tags.push(en.label('genders', p.gender));
    if (p.residency) tags.push(en.label('statuses', p.residency));
    if (p.smoker === false) tags.push('비흡연'); else if (p.smoker === true) tags.push('흡연');
    if (p.pet === true) tags.push('반려동물 있음');
    const budgetOk = price && p.budgetMin <= price && price <= p.budgetMax;
    const subs = (p.suburbs || []).map(s => esc(s.name) + ' ' + esc(String(s.state || '').toUpperCase())).join(' · ');
    const rooms = (p.roomTypes || []).map(c => en.label('roomTypes', c)).filter(Boolean).join(', ');
    return `
      <div class="ksn-card">
        <div class="ksn-top">
          <div class="ksn-ava">${esc(initial)}</div>
          <div style="flex:1;min-width:0;">
            <div class="ksn-name">${esc(p.firstName || '')} ${it.km != null ? `<span class="ksn-km">· 약 ${it.km < 1 ? '1km 이내' : Math.round(it.km) + 'km'}</span>` : ''}</div>
            <div class="ksn-meta">${esc(tsAgo(p.lastActiveAt))}</div>
          </div>
        </div>
        ${tags.length ? `<div class="ksn-tags">${tags.map(t => `<span class="ksn-tag">${esc(t)}</span>`).join('')}${budgetOk ? '<span class="ksn-tag ok">예산 맞음</span>' : ''}</div>` : (budgetOk ? '<div class="ksn-tags"><span class="ksn-tag ok">예산 맞음</span></div>' : '')}
        <dl class="ksn-grid">
          <dt>동네</dt><dd>${subs || '—'}</dd>
          <dt>예산</dt><dd>주 $${esc(p.budgetMin)} ~ $${esc(p.budgetMax)}</dd>
          <dt>입주</dt><dd>${esc(p.moveIn || '—')}${p.stay ? ' · ' + esc(en.label('stays', p.stay)) : ''}</dd>
          <dt>방</dt><dd>${esc(rooms || '상관없음')}${p.bathroom === 'private' ? ' · 개인 욕실' : ''}</dd>
        </dl>
        ${p.intro ? `<div class="ksn-intro">${esc(p.intro)}</div>` : ''}
        <div style="display:flex;justify-content:flex-end;"><button type="button" class="ksn-btn primary" data-ksn-chat="${esc(it.uid)}">채팅으로 연락</button></div>
      </div>`;
  }

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
      postTitle: ('집 구해요 · ' + ((it && it.p.firstName) || '')).slice(0, 200),
    };
    const oNick = String((it && it.p.firstName) || '').trim().slice(0, 60);
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

  window.koausSeekersNearby = { open, close };
})();
