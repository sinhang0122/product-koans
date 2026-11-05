// ═══════════════════════════════════════════════════════════════════
//  KoAus · 외부 한인 사이트 글(ext_posts) 화면 연결 (11-05)
//  - accom/rent/jobs 목록에 외부 글을 시간순으로 섞어 보여 준다. 카드는 KoAus 카드와 같은 규격 + 구석에 작은 출처 표시(*sunbrisbane).
//  - 사이트 모드(ext_sources.mode):
//      'full' — 카드를 누르면 KoAus 안 상세창(본문·올린 시각·동네·가격·전화(로그인 회원만)·문자 보내기·원문 보기). 선브리즈번.
//      'link' — 카드를 누르면 out.html 을 거쳐 원문으로(뒤로가기 한 번에 KoAus 목록).
//  - 데이터: ext_posts(서버 함수가 쓴 것, visible 만 읽힘) 최신 200건 + ext_sources(스위치·모드) + stats/public(숫자판) + ext_private(전화, 로그인 회원만).
//  - 꺼진 사이트(enabled:false)는 여기서 즉시 뺀다(서버는 다음 수집 때 숨김).
//  - 페이지 쪽 연결: window.koausExt.last[board] 와 'koaus:ext-posts' 이벤트(detail {board, posts}). 카드 빌더는 p.ext 면 koausExt.cardHtml(p), 클릭은 koausExt.open(id).
//  - 문자 보내기 본문은 koaus-contact-actions.js 와 같은 꼴: "[KoAus] 동네 \n 이 글 링크 \n\n 내 소개글" — 받는 쪽이 KoAus 를 자연스럽게 알게 된다(사용자 결정 11-05).
//  - 딥링크: accom.html?id=ext_<문서id> 로 들어오면 그 글의 상세창을 연다.
// ═══════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

(function () {
  'use strict';
  if (window.koausExt) return;
  const firebaseConfig = {
    apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
    authDomain: 'koaus-f564c.firebaseapp.com',
    projectId: 'koaus-f564c',
    storageBucket: 'koaus-f564c.firebasestorage.app',
    messagingSenderId: '663988594088',
    appId: '1:663988594088:web:ef30c2fd557407b00b299d',
    measurementId: 'G-DERZ9MTKPL',
  };
  let db = null;
  try { db = getFirestore(getApps().length ? getApp() : initializeApp(firebaseConfig)); } catch (e) { try { console.warn('[koaus-ext] init 실패', e); } catch (_) {} }

  const LIMIT = 200;                           // rules: list 는 200건 이하만
  const SHOW_SOURCE_BAR = false;               // 출처별 건수 칩 — 사용자 결정(11-05): KoAus 글이 많아지면 켠다. '총 N건'만 둔다
  const BOARD = (function () { const b = document.body && document.body.dataset && document.body.dataset.koausBoard; if (b) return b; const f = (location.pathname.split('/').pop() || '').toLowerCase(); if (f.includes('accom')) return 'accom'; if (f.includes('rent')) return 'rent'; if (f.includes('jobs')) return 'jobs'; return ''; })();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);

  const api = { board: BOARD, last: {}, raw: {}, byId: {}, sources: {}, stats: null, ready: null };
  const modeOf = src => ((api.sources[src] || {}).mode === 'full' ? 'full' : 'link');

  function mapDoc(d) {
    const x = d.data() || {};
    const ms = x.postedAt && x.postedAt.toMillis ? x.postedAt.toMillis() : 0;
    const dt = ms ? new Date(ms) : null; const p2 = n => String(n).padStart(2, '0');
    const where = x.suburbEn || x.suburb || x.zone || x.region || '';
    const st = String(x.state || '').toLowerCase();
    const p = {
      id: 'ext_' + d.id, docId: d.id, ext: true, source: x.source, sourceName: x.sourceName || x.source, extUrl: x.url || '', outUrl: 'out.html?id=' + encodeURIComponent(d.id),
      title: x.title || '', price: typeof x.price === 'number' ? x.price : null, kind: x.kind || '', gender: x.gender || '', moveIn: x.moveIn || '', category: x.category || '',
      suburb: x.suburb || '', suburbEn: x.suburbEn || '', zone: x.zone || '', region: x.region || '',
      address: where ? (where + ' ' + st.toUpperCase()) : '', state: st,
      lat: typeof x.lat === 'number' ? x.lat : undefined, lng: typeof x.lng === 'number' ? x.lng : undefined,
      body: typeof x.body === 'string' ? x.body : '', hasDetail: !!x.hasDetail, hasPhone: !!x.hasPhone, imageCount: Number(x.imageCount) || 0,
      mode: 'offer', types: [], roomTypes: [], imageUrls: [], status: 'approved', isHidden: false, postType: 'hiring',
      date: dt ? `${p2(dt.getMonth() + 1)}/${p2(dt.getDate())}` : '', time: dt && x.hasDetail ? `${p2(dt.getHours())}:${p2(dt.getMinutes())}` : '',
      postedMs: ms,
      // 상세를 받은 글은 실제 올린 시각, 아니면 그 날 안에서 글 번호 순(KoAus 글보다 아래)
      _ts: x.hasDetail ? ms : ms + ((Number(x.extNum) || 0) % 43200000),
    };
    api.byId[p.id] = p;
    return p;
  }
  const filterOn = list => list.filter(p => { const s = api.sources[p.source]; return !s || s.enabled !== false; });

  async function loadSources() {
    if (!db) return {};
    try {
      const snap = await getDocs(query(collection(db, 'ext_sources'), limit(20)));
      const out = {}; snap.forEach(d => { out[d.id] = Object.assign({ id: d.id }, d.data() || {}); });
      api.sources = out;
    } catch (e) { console.warn('[koaus-ext] sources 실패', e); }
    return api.sources;
  }
  async function loadStats() {
    if (!db) return null;
    try { const s = await getDoc(doc(db, 'stats', 'public')); api.stats = s.exists() ? s.data() : null; }
    catch (e) { console.warn('[koaus-ext] stats 실패', e); }
    try { window.dispatchEvent(new CustomEvent('koaus:ext-stats', { detail: { stats: api.stats } })); } catch (_) {}
    return api.stats;
  }
  async function load(board) {
    board = board || BOARD;
    if (!db || !board) return [];
    let posts = [];
    try {
      const snap = await getDocs(query(collection(db, 'ext_posts'), where('board', '==', board), where('visible', '==', true), orderBy('postedAt', 'desc'), limit(LIMIT)));
      posts = snap.docs.map(mapDoc);
    } catch (e) { console.warn('[koaus-ext] posts 실패', e); }
    api.raw[board] = posts;
    emit(board);
    return api.last[board];
  }
  function emit(board) {
    api.last[board] = filterOn(api.raw[board] || []);
    try { window.dispatchEvent(new CustomEvent('koaus:ext-posts', { detail: { board, posts: api.last[board] } })); } catch (_) {}
    if (SHOW_SOURCE_BAR) renderBar(board);
  }
  // (꺼 둠) 출처 칩 — #boardCount 옆
  function renderBar(board) {
    const anchor = document.getElementById('boardCount'); if (!anchor) return;
    let bar = document.getElementById('extSourceBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'extSourceBar'; bar.className = 'ext-bar'; anchor.insertAdjacentElement('afterend', bar); injectCss(); }
    const raw = api.raw[board] || []; const bySrc = {}; raw.forEach(p => { bySrc[p.source] = (bySrc[p.source] || 0) + 1; });
    const own = api.stats && api.stats.own && typeof api.stats.own[board] === 'number' ? api.stats.own[board] : null;
    bar.innerHTML = (own != null ? `<span class="ext-chip on">KoAus <b>${own}</b></span>` : '') + Object.keys(bySrc).map(id => `<span class="ext-chip on">${esc((api.sources[id] || {}).name || id)} <b>${bySrc[id]}</b></span>`).join('');
  }

  function injectCss() {
    if (document.getElementById('koausExtCss')) return;
    const st = document.createElement('style'); st.id = 'koausExtCss';
    st.textContent = `
      .ext-bar{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;font-size:12px}
      .ext-chip{display:inline-flex;gap:4px;padding:3px 9px;border-radius:999px;border:1.5px solid var(--text-primary,#111);background:var(--text-primary,#111);color:var(--bg-base,#fff);font-size:12px;font-weight:700}
      .ext-tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.01em;color:var(--text-muted,#777);opacity:.85;white-space:nowrap;line-height:1.2;padding-top:2px}
      .accom-card-ext .ext-ph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;height:100%;color:var(--text-muted,#666);font-size:11px;font-weight:700;text-align:center;padding:4px;line-height:1.15}
      .accom-card-ext .ext-ph svg{width:20px;height:20px}
      .kxt-ovl{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9300;display:none;align-items:flex-end;justify-content:center}
      .kxt-ovl.open{display:flex}
      @media(min-width:720px){.kxt-ovl{align-items:center}}
      .kxt-box{width:100%;max-width:640px;max-height:92vh;overflow:auto;background:var(--bg-base,#fff);color:var(--text-primary,#111);border-radius:20px 20px 0 0;padding:16px 16px 22px;box-shadow:0 -10px 40px rgba(0,0,0,.25)}
      @media(min-width:720px){.kxt-box{border-radius:20px;padding:22px}}
      .kxt-head{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted,#666);font-weight:700}
      .kxt-head .kxt-src{font-weight:800;color:var(--text-primary,#111)}
      .kxt-x{margin-left:auto;border:1.5px solid var(--text-primary,#111);background:transparent;color:var(--text-primary,#111);border-radius:999px;width:32px;height:32px;font-size:16px;font-weight:800;cursor:pointer}
      .kxt-title{font-size:19px;font-weight:900;line-height:1.3;margin:10px 0 8px;letter-spacing:-.01em}
      .kxt-meta{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
      .kxt-meta span{display:inline-block;padding:4px 10px;border-radius:999px;border:1.5px solid var(--text-primary,#111);font-size:12px;font-weight:700}
      .kxt-meta span.price{background:var(--text-primary,#111);color:var(--bg-base,#fff)}
      .kxt-body{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.65;border-top:1px solid rgba(0,0,0,.08);padding-top:12px;margin-bottom:12px;max-height:46vh;overflow:auto}
      .kxt-body.empty{color:var(--text-muted,#666)}
      .kxt-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 6px}
      .kxt-btn{flex:1 1 calc(50% - 8px);display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 14px;border-radius:999px;border:1.5px solid var(--text-primary,#111);background:var(--text-primary,#111);color:var(--bg-base,#fff);font-weight:800;font-size:14px;text-decoration:none;cursor:pointer}
      .kxt-btn.sec{background:transparent;color:var(--text-primary,#111)}
      .kxt-btn.full{flex-basis:100%}
      .kxt-note{font-size:11px;color:var(--text-muted,#666);line-height:1.5;margin-top:8px}
      .kxt-note a{color:inherit;text-decoration:underline}`;
    document.head.appendChild(st);
  }

  // 카드(목록·지도 서랍 공용) — KoAus 카드 규격(.accom-card) 그대로. 액션 버튼 대신 구석에 *출처
  function cardHtml(p, opts) {
    opts = opts || {};
    injectCss();
    const st = String(p.state || '').toUpperCase();
    const where = esc(p.suburbEn || p.suburb || p.zone || p.region || '');
    let priceHtml;
    if (opts.board === 'jobs') priceHtml = p.category ? `<span class="accom-card-find">${esc(p.category)}</span>` : '<span class="accom-card-find">원문 참고</span>';
    else priceHtml = p.price ? `<span class="accom-price">$${esc(p.price)}<small>/wk</small></span>` : '<span class="accom-card-find">가격 협의</span>';
    const sub = [where, p.kind, p.moveIn].filter(Boolean).map(esc).join(' · ');
    const pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
    return `
        <div class="accom-card accom-card-ext" data-id="${esc(p.id)}" data-ext="1" data-out="${esc(p.outUrl)}">
          <div class="accom-card-thumb"><div class="ext-ph">${pin}<span>${where || esc(p.sourceName)}</span></div></div>
          <div class="accom-card-info">
            <div class="accom-card-row1">
              <div class="accom-card-title2">${esc(p.title)}</div>
              <div class="accom-card-actions"><span class="ext-tag" title="${esc(p.sourceName)} 글">*${esc(p.source)}</span></div>
            </div>
            <div class="accom-card-row2">
              <div class="accom-card-price-wrap">${priceHtml}${st ? `<div class="accom-card-state">${esc(st)}</div>` : ''}</div>
              ${sub ? `<div class="accom-card-sub">${sub}</div>` : ''}
            </div>
          </div>
        </div>`;
  }

  // ── 상세창(full 모드) ──
  let ovl = null, cur = null;
  function mount() {
    if (ovl) return;
    injectCss();
    ovl = document.createElement('div'); ovl.className = 'kxt-ovl'; ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true');
    ovl.innerHTML = '<div class="kxt-box" id="kxtBox"></div>';
    document.body.appendChild(ovl);
    ovl.addEventListener('click', e => { if (e.target === ovl || e.target.closest('[data-kxt-close]')) close(); const lg = e.target.closest('[data-kxt-login]'); if (lg) { try { window.koausAuth && window.koausAuth.openAuthModal && window.koausAuth.openAuthModal(); } catch (_) {} } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovl.classList.contains('open')) close(); });
  }
  function close() { if (!ovl) return; ovl.classList.remove('open'); document.body.style.overflow = ''; cur = null; }
  const ago = ms => { if (!ms) return ''; const h = Math.floor((Date.now() - ms) / 3600000); if (h < 1) return '방금'; if (h < 24) return h + '시간 전'; const d = Math.floor(h / 24); return d === 0 ? '오늘' : d + '일 전'; };
  function myIntro(board) {
    try {
      if (board === 'jobs') return (localStorage.getItem('koaus-my-intro-work') || '').trim();
      return (localStorage.getItem('koaus-my-intro-living') || localStorage.getItem('koaus-my-intro') || '').trim();
    } catch (_) { return ''; }
  }
  function deepLink(p) { try { return location.origin + location.pathname + '?id=' + encodeURIComponent(p.id); } catch (_) { return ''; } }
  // 문자 본문 — koaus-contact-actions.js inquiryBody 와 같은 꼴([KoAus] 동네 / 이 글 링크 / 내 소개글)
  function smsBody(p) {
    const lines = ['[KoAus]' + (p.suburbEn || p.suburb ? ' ' + (p.suburbEn || p.suburb) : '')];
    const link = deepLink(p); if (link) lines.push(link);
    lines.push('');
    const intro = myIntro(BOARD);
    lines.push(intro || '(성함과 문의 내용을 입력해 주세요)');
    return lines.join('\n');
  }
  function render(p) {
    const box = $('#kxtBox', ovl);
    const meta = [];
    if (BOARD === 'jobs') { if (p.category) meta.push(`<span>${esc(p.category)}</span>`); }
    else { meta.push(p.price ? `<span class="price">$${esc(p.price)}/wk</span>` : '<span>가격 협의</span>'); if (p.kind) meta.push(`<span>${esc(p.kind)}</span>`); if (p.gender) meta.push(`<span>${p.gender === 'female' ? '여성' : '남성'}</span>`); if (p.moveIn) meta.push(`<span>${esc(p.moveIn)}</span>`); }
    const where = [p.suburbEn || p.suburb, p.zone && p.zone !== (p.suburbEn || p.suburb) ? p.zone : '', p.region].filter(Boolean);
    if (where.length) meta.push(`<span>${esc(where.join(' · '))}</span>`);
    const when = p.postedMs ? (p.hasDetail ? ago(p.postedMs) : p.date) : '';
    box.innerHTML = `
      <div class="kxt-head"><span class="kxt-src">*${esc(p.source)}</span><span>${esc(p.sourceName)}${when ? ' · ' + esc(when) : ''}</span><button type="button" class="kxt-x" data-kxt-close aria-label="닫기">×</button></div>
      <h3 class="kxt-title">${esc(p.title)}</h3>
      <div class="kxt-meta">${meta.join('')}</div>
      <div class="kxt-body${p.body ? '' : ' empty'}">${p.body ? esc(p.body) : '본문은 원문에서 볼 수 있습니다.'}</div>
      ${p.imageCount ? `<div class="kxt-note">사진 ${esc(p.imageCount)}장은 원문에 있습니다.</div>` : ''}
      <div class="kxt-actions" id="kxtActions"></div>
      <div class="kxt-note">다른 한인 사이트(${esc(p.sourceName)})에 올라온 글을 KoAus 가 모아 보여 드립니다. 문자·전화는 글쓴이에게 직접 갑니다. 이 글에 문제가 있으면 <a href="contact.html">문의하기</a>로 알려 주십시오.</div>`;
    renderActions(p);
  }
  async function renderActions(p) {
    const box = $('#kxtActions', ovl); if (!box) return;
    const orig = `<a class="kxt-btn sec" href="${esc(p.outUrl)}">원문 보기 ›</a>`;
    const user = window.koausAuth && window.koausAuth.user;
    if (!p.hasPhone) { box.innerHTML = orig.replace('kxt-btn sec', 'kxt-btn sec full'); return; }
    if (!user) { box.innerHTML = `<button type="button" class="kxt-btn full" data-kxt-login>로그인하고 연락처 보기</button>${orig}`; return; }
    box.innerHTML = '<span class="kxt-note">연락처 불러오는 중…</span>' + orig;
    let phone = '';
    try { const s = await getDoc(doc(db, 'ext_private', p.docId)); phone = s.exists() ? String((s.data() || {}).phone || '') : ''; }
    catch (e) { console.warn('[koaus-ext] 전화 조회 실패', e); }
    if (cur !== p) return;
    phone = phone.replace(/[^\d+]/g, '');
    if (!phone) { box.innerHTML = orig.replace('kxt-btn sec', 'kxt-btn sec full'); return; }
    const sms = 'sms:' + phone + '?&body=' + encodeURIComponent(smsBody(p));
    box.innerHTML = `<a class="kxt-btn" href="${esc(sms)}">문자 보내기</a><a class="kxt-btn sec" href="${esc('tel:' + phone)}">전화 ${esc(phone)}</a>${orig.replace('kxt-btn sec', 'kxt-btn sec full')}`;
  }
  function openModal(p) {
    mount(); cur = p; render(p);
    ovl.classList.add('open'); document.body.style.overflow = 'hidden';
    try { if (window.koausExtTrack) window.koausExtTrack(p); } catch (_) {}
  }
  // 글 하나 열기 — full 모드면 상세창, link 모드면 원문(out.html)
  async function open(idOrPost) {
    let p = typeof idOrPost === 'object' ? idOrPost : api.byId[idOrPost];
    if (!p && typeof idOrPost === 'string' && idOrPost.startsWith('ext_') && db) {
      try { const s = await getDoc(doc(db, 'ext_posts', idOrPost.slice(4))); if (s.exists()) p = mapDoc(s); } catch (e) { console.warn('[koaus-ext] 글 조회 실패', e); }
    }
    if (!p) return false;
    if (modeOf(p.source) === 'full') openModal(p); else window.location.href = p.outUrl;
    return true;
  }
  const go = open;

  Object.assign(api, { load, loadSources, loadStats, cardHtml, open, go, close, injectCss, modeOf });
  window.koausExt = api;
  api.ready = (async () => {
    await loadSources(); await loadStats();
    if (BOARD) await load(BOARD);
    // 딥링크 ?id=ext_… — 페이지의 자체 딥링크는 ext 글을 못 찾으므로 여기서 연다
    try { const id = new URLSearchParams(location.search).get('id'); if (id && id.startsWith('ext_')) setTimeout(() => { if (!(ovl && ovl.classList.contains('open'))) open(id); }, 300); } catch (_) {}
  })();
})();
