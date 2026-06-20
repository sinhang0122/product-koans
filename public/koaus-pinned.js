// ════════════════════════════════════════════════════════════════════════
//  KoAus 공용 핀배너(상단 노출 글) — 리치 표시 + 풀스크린 상세
//  · #pinnedNoticeBox[data-board] → board_pinned_notices/{board} 실시간 구독
//  · 박스: 썸네일 + 제목 + 본문 요약 + "자세히 ›" (전체 클릭 가능). 데이터 없으면 hidden.
//  · 클릭 → 풀스크린 상세 오버레이(.post-detail-overlay > .post-detail-card.rea-detail)
//          → :has(.rea-detail) 풀스크린 CSS 자동 적용. 사진 갤러리/주소·길찾기/연락 버튼.
//  · 의존: window.koausGallery(open), window.koausContactActions(render) — 전 보드 로드됨(가드 포함).
//  · 전 보드 공용: 인라인 핀공지 스크립트(title+text 만)를 대체.
// ════════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';   // App Check 공용 init — 자체 init 없는 페이지(points·car-sale 등)의 Enforce 차단 방지 (marquee.js 동일 패턴)
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const cfg = {
  apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU', authDomain: 'koaus-f564c.firebaseapp.com',
  projectId: 'koaus-f564c', storageBucket: 'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088', appId: '1:663988594088:web:ef30c2fd557407b00b299d',
};
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

(function () {
  const box = document.getElementById('pinnedNoticeBox');
  if (!box) return;
  const board = (box.dataset.board || '').trim();
  if (!board) { console.warn('[pinned] #pinnedNoticeBox data-board 누락'); return; }

  let app, db;
  try { app = getApps().length ? getApp() : initializeApp(cfg); db = getFirestore(app); }
  catch (e) { console.warn('[pinned] Firebase init 실패', e); return; }

  injectStyles();

  let current = null;   // 최신 핀 데이터 (박스 클릭 시 상세에 사용)
  box.style.cursor = 'pointer';
  box.addEventListener('click', () => { if (current) openPinnedDetail(current); });

  onSnapshot(doc(db, 'board_pinned_notices', board), snap => {
    const d = snap.exists() ? snap.data() : null;
    if (d && d.text && String(d.text).trim() && d.active !== false) {
      current = d; renderBox(d); box.hidden = false;
    } else {
      current = null; box.hidden = true; box.innerHTML = '';
    }
  }, err => console.warn('[pinned] 구독 실패', err));

  // ── 박스 렌더 (썸네일 + 제목 + 요약 + 자세히) ──
  function renderBox(d) {
    const title = (d.title || '').trim();
    const text = String(d.text || '').trim().replace(/\s+/g, ' ');
    const summary = text.length > 90 ? text.slice(0, 90) + '…' : text;
    const thumb = (Array.isArray(d.imageUrls) && d.imageUrls[0])
      ? '<img class="pn-thumb" src="' + esc(d.imageUrls[0]) + '" alt="" loading="lazy" />' : '';
    box.innerHTML =
      '<div class="pn-rich">' +
        thumb +
        '<div class="pn-rich-body">' +
          (title ? '<strong class="pn-title">' + esc(title) + '</strong>' : '') +
          '<span class="pn-text">' + esc(summary) + '</span>' +
        '</div>' +
        '<span class="pn-more">자세히 ›</span>' +
      '</div>';
  }

  // ── 풀스크린 상세 오버레이 (1회 주입) ──
  let ov = null;
  function ensureOverlay() {
    if (ov) return ov;
    ov = document.createElement('div');
    ov.className = 'post-detail-overlay';
    ov.id = 'pinnedDetailOverlay';
    ov.innerHTML =
      '<div class="post-detail-card rea-detail">' +
        '<div class="rea-navbar">' +
          '<button class="rea-back" type="button" aria-label="뒤로가기">‹</button>' +
          '<span class="rea-nav-title" id="pinnedDetailTitle"></span>' +
          '<button class="rea-nav-close" type="button" aria-label="닫기">✕</button>' +
        '</div>' +
        '<div class="rea-scroll">' +
          '<div class="rea-hero" id="pinnedDetailHero" style="display:none;"></div>' +
          '<div class="rea-content">' +
            '<h2 class="pn-detail-h" id="pinnedDetailH"></h2>' +
            '<div class="rea-section">' +
              '<div class="rea-desc" id="pinnedDetailBody"></div>' +
            '</div>' +
            '<div class="rea-section" id="pinnedDetailAddrSec" style="display:none;">' +
              '<div class="rea-addr-row"><span class="rea-addr" id="pinnedDetailAddr"></span></div>' +
              '<div class="rea-loc-btns">' +
                '<a class="rea-loc-btn" id="pinnedDetailDir" target="_blank" rel="noopener noreferrer">' +
                  '<span>📍 길찾기 <em>Get Directions</em></span><span class="rea-loc-arrow">›</span></a>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="rea-actionbar">' +
          '<div id="pinnedContactContainer" class="contact-action-container" aria-label="연락 수단"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => ov.classList.remove('open');
    ov.querySelector('.rea-back').addEventListener('click', close);
    ov.querySelector('.rea-nav-close').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
    return ov;
  }

  function openPinnedDetail(d) {
    const o = ensureOverlay();
    const title = (d.title || '').trim();
    o.querySelector('#pinnedDetailTitle').textContent = title || '공지';
    o.querySelector('#pinnedDetailH').textContent = title || '';
    o.querySelector('#pinnedDetailBody').textContent = String(d.text || '');   // textContent — XSS 안전(.rea-desc white-space:pre-wrap 로 줄바꿈 보존)

    // 사진 갤러리
    const hero = o.querySelector('#pinnedDetailHero');
    const imgs = Array.isArray(d.imageUrls) ? d.imageUrls.filter(Boolean) : [];
    hero.innerHTML = '';
    if (imgs.length) {
      const wrap = document.createElement('div');
      wrap.className = 'detail-hero-gallery';
      wrap.innerHTML = imgs.map(u => '<img src="' + esc(u) + '" alt="" loading="lazy" />').join('');
      hero.appendChild(wrap);
      hero.style.display = '';
      wrap.addEventListener('click', e => {
        const t = e.target.closest('img'); if (!t) return;
        const list = [...wrap.querySelectorAll('img')];
        const idx = Math.max(0, list.indexOf(t));
        if (window.koausGallery && window.koausGallery.open) window.koausGallery.open(imgs, idx);
      });
    } else { hero.style.display = 'none'; }

    // 주소 + 길찾기
    const addrSec = o.querySelector('#pinnedDetailAddrSec');
    const addr = (d.address || '').trim();
    if (addr) {
      o.querySelector('#pinnedDetailAddr').textContent = '📍 ' + addr;
      o.querySelector('#pinnedDetailDir').href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr);
      addrSec.style.display = '';
    } else { addrSec.style.display = 'none'; }

    // 연락 버튼 — koaus-contact-actions.render 재사용.
    //   render 는 첫 #contact-action-container(보드 자체 상세 모달용)에 HTML 생성 → 그 결과를
    //   내 오버레이 컨테이너로 복사(중복 id 충돌 회피, 보드 상세 동작 불변). 버튼은 순수 anchor +
    //   전역 로그인 게이트(.contact-action-btn 위임)라 복사해도 그대로 동작.
    const myC = o.querySelector('#pinnedContactContainer');
    if (myC) {
      myC.innerHTML = ''; myC.style.display = 'none';
      if (window.koausContactActions && window.koausContactActions.render) {
        try {
          window.koausContactActions.render({ phone: d.phone, kakaoLink: d.kakaoLink, contactEmail: d.contactEmail, contact: d.contact });
          const src = document.getElementById('contact-action-container');
          if (src && src !== myC && src.innerHTML.trim()) { myC.innerHTML = src.innerHTML; myC.style.display = ''; }
        } catch (_) {}
      }
    }

    o.classList.add('open');
    const sc = o.querySelector('.rea-scroll'); if (sc) sc.scrollTop = 0;
  }

  // ── 박스 리치 레이아웃 스타일 (1회 주입 — style.css 무변경, 자기완결) ──
  function injectStyles() {
    if (document.getElementById('koaus-pinned-style')) return;
    const st = document.createElement('style');
    st.id = 'koaus-pinned-style';
    st.textContent =
      '.pinned-notice .pn-rich{display:flex;align-items:center;gap:10px;width:100%;min-width:0;}' +
      '.pinned-notice .pn-thumb{width:44px;height:44px;flex-shrink:0;border-radius:8px;object-fit:cover;border:1px solid var(--border);}' +
      '.pinned-notice .pn-rich-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}' +
      '.pinned-notice .pn-title{color:var(--text-primary);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.pinned-notice .pn-text{color:var(--text-secondary);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.pinned-notice .pn-more{flex-shrink:0;font-weight:800;color:var(--text-primary);font-size:12.5px;white-space:nowrap;}' +
      '#pinnedDetailOverlay .pn-detail-h{font-size:22px;font-weight:900;color:var(--text-primary);letter-spacing:-0.4px;margin:0 0 4px;line-height:1.25;}';
    document.head.appendChild(st);
  }
})();
