// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 공통 갤러리 (모바일 네이티브 + 데스크톱)
//  ─────────────────────────────────────────────────────────────────
//  사용법:
//    window.koausGallery.open(urls, startIndex)
//        urls       : string[]  — 이미지 URL 배열
//        startIndex : number   — 시작 인덱스 (기본 0)
//
//    또는 자동 감지: <img data-koaus-gallery="groupKey"> + 한 그룹의 모든 img
//    클릭 시 자동 오픈.
//
//  구조 (2026-06 재작성 — 트랙 슬라이더):
//    · 모든 사진을 .kg-track 안 .kg-slide 로 한 번에 마운트(=프리로드).
//      → 빠른 스와이프 시 src 를 갈아끼우지 않으므로 "1번 사진이 6번까지
//        보이는" 스테일 이미지 / 중복 회귀가 원천 차단됨.
//    · 넘김 = 트랙 translateX 애니메이션(슬라이드 인) — 단일 img.src 스왑(옛
//      구조)의 끊김/덜컥임 제거. 스냅 곡선 cubic-bezier 로 부드럽게.
//    · 줌(더블탭/휠/핀치)은 "현재 슬라이드 img" 에만 transform 적용.
//      줌 상태에서는 스와이프 대신 팬(pan). 1× 복귀 시 스와이프 재개.
//    · 우상단 카운터(3/6) + X — 단탭 시 UI 토글(몰입 모드).
//    · 키보드: ESC 닫기, ←/→ 이동. 블랙(#000)/화이트(#fff) 톤.
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausGallery) return;

  let overlay, viewport, track, counterEl, closeBtn;
  let urls = [], idx = 0, W = 0;
  let scale = 1, panX = 0, panY = 0;
  let uiVisible = true, lastTap = 0;
  // 제스처 상태
  let startX = 0, startY = 0, dragDX = 0, dragging = false, panning = false;
  let pinching = false, startDist = 0, baseScale = 1, mouseDown = false;

  const SNAP = 'transform .3s cubic-bezier(.22,.61,.36,1)';
  const ZOOM = 'transform .2s ease-out';

  function ensureMounted() {
    if (overlay) return overlay;
    const style = document.createElement('style');
    style.textContent = `
      #koausGallery {
        position: fixed; inset: 0; z-index: 99999;
        background: #000; display: none;
        touch-action: none; user-select: none; -webkit-user-select: none;
        overflow: hidden;
      }
      #koausGallery.is-open { display: block; }
      #koausGallery .kg-viewport { position: absolute; inset: 0; overflow: hidden; }
      #koausGallery .kg-track {
        display: flex; height: 100%; will-change: transform;
      }
      #koausGallery .kg-slide {
        flex: 0 0 100%; width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
      }
      #koausGallery .kg-img {
        max-width: 100%; max-height: 100%;
        transform-origin: 50% 50%; will-change: transform;
        -webkit-user-drag: none; user-drag: none; pointer-events: none;
      }
      #koausGallery .kg-ui {
        position: absolute; top: 0; left: 0; right: 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: env(safe-area-inset-top, 14px) 18px 14px;
        gap: 14px;
        background: linear-gradient(180deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 100%);
        transition: opacity 0.22s ease; pointer-events: none;
      }
      #koausGallery .kg-ui > * { pointer-events: auto; }
      #koausGallery.kg-ui-hidden .kg-ui { opacity: 0; }
      #koausGallery .kg-counter {
        color: #fff; font: 800 14px 'Urbanist','Noto Sans KR',sans-serif;
        letter-spacing: 0.04em;
        background: rgba(0,0,0,0.45); padding: 6px 12px; border-radius: 999px;
        backdrop-filter: blur(8px);
      }
      #koausGallery .kg-close {
        width: 38px; height: 38px; border-radius: 50%;
        background: rgba(0,0,0,0.5); color: #fff;
        border: 1px solid rgba(255,255,255,0.25);
        font: 700 18px sans-serif; line-height: 1;
        cursor: pointer; backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
      }
      #koausGallery .kg-close:hover { background: rgba(0,0,0,0.75); }
      /* ‹› 넘김 버튼 (2026-07) — 데스크탑 전용: 평소 숨김, 오버레이 hover 시만 표시.
         터치는 스와이프 전용(display:none 유지 — 기본값). 사진 1장이면 항상 숨김(.kg-single). */
      #koausGallery .kg-nav {
        position: absolute; top: 50%; transform: translateY(-50%);
        width: 44px; height: 44px; border-radius: 50%;
        background: rgba(0,0,0,0.45); color: #fff;
        border: 1px solid rgba(255,255,255,0.25);
        font: 700 24px/1 sans-serif; padding: 0 0 3px;
        display: none; align-items: center; justify-content: center;
        cursor: pointer; backdrop-filter: blur(8px); z-index: 3;
      }
      #koausGallery .kg-prev { left: 14px; }
      #koausGallery .kg-next { right: 14px; }
      @media (hover: hover) and (pointer: fine) {
        #koausGallery .kg-nav { display: flex; opacity: 0; pointer-events: none; transition: opacity .18s ease, background .18s ease; }
        #koausGallery:hover .kg-nav { opacity: 1; pointer-events: auto; }
        #koausGallery .kg-nav:hover { background: rgba(0,0,0,0.75); }
        #koausGallery.kg-ui-hidden .kg-nav { opacity: 0; pointer-events: none; }
      }
      #koausGallery.kg-single .kg-nav { display: none; }
    `;
    document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.id = 'koausGallery';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="kg-viewport" id="kgViewport">
        <div class="kg-track" id="kgTrack"></div>
      </div>
      <div class="kg-ui">
        <span class="kg-counter" id="kgCounter">1 / 1</span>
        <button class="kg-close" id="kgClose" type="button" aria-label="닫기">✕</button>
      </div>
      <button class="kg-nav kg-prev" id="kgPrev" type="button" aria-label="이전 사진">‹</button>
      <button class="kg-nav kg-next" id="kgNext" type="button" aria-label="다음 사진">›</button>`;
    document.body.appendChild(overlay);
    viewport  = document.getElementById('kgViewport');
    track     = document.getElementById('kgTrack');
    counterEl = document.getElementById('kgCounter');
    closeBtn  = document.getElementById('kgClose');
    closeBtn.addEventListener('click', close);
    // ‹› 버튼 — overlay 직속 자식(viewport 밖)이라 드래그(mousedown) 제스처와 충돌 없음
    document.getElementById('kgPrev').addEventListener('click', prev);
    document.getElementById('kgNext').addEventListener('click', next);
    window.addEventListener('resize', () => { if (overlay.classList.contains('is-open')) { measure(); setTrack(false); } });
    bindGestures();
    return overlay;
  }

  // ── 트랙 빌드: 모든 사진을 슬라이드로 한 번에 마운트(프리로드) ──
  function buildTrack() {
    track.innerHTML = '';
    const frag = document.createDocumentFragment();
    urls.forEach(u => {
      const slide = document.createElement('div');
      slide.className = 'kg-slide';
      const img = document.createElement('img');
      img.className = 'kg-img';
      img.alt = '';
      img.src = u;
      slide.appendChild(img);
      frag.appendChild(slide);
    });
    track.appendChild(frag);
  }

  function currentImg() {
    const s = track.children[idx];
    return s ? s.querySelector('img') : null;
  }
  function measure() { W = overlay.clientWidth || window.innerWidth; }

  function setTrack(animate) {
    if (!track) return;
    track.style.transition = animate ? SNAP : 'none';
    track.style.transform = `translateX(${-(idx * W) + dragDX}px)`;
  }
  function applyZoom(animate) {
    const img = currentImg();
    if (!img) return;
    img.style.transition = animate ? ZOOM : 'none';
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  function resetZoom() {
    // 현재/이전 슬라이드 잔여 줌 제거 (어느 슬라이드로 돌아와도 1× 깨끗)
    scale = 1; panX = 0; panY = 0;
    Array.from(track.children).forEach(s => {
      const im = s.querySelector('img');
      if (im) { im.style.transition = 'none'; im.style.transform = ''; }
    });
  }
  function toggleZoom() {
    scale = scale > 1.5 ? 1 : 2.4; panX = 0; panY = 0; applyZoom(true);
  }

  function setIndex(n, animate) {
    if (!urls.length) return;
    idx = Math.max(0, Math.min(urls.length - 1, n));
    dragDX = 0;
    resetZoom();
    if (counterEl) counterEl.textContent = `${idx + 1} / ${urls.length}`;
    setTrack(animate !== false);
  }
  function next() { setIndex(idx + 1, true); }
  function prev() { setIndex(idx - 1, true); }

  function onKeyDown(e) {
    if (!overlay || !overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape')          { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next();  }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); prev();  }
  }

  function open(_urls, start) {
    if (!Array.isArray(_urls) || !_urls.length) return;
    ensureMounted();
    urls = _urls.slice();
    buildTrack();
    overlay.classList.add('is-open');
    overlay.classList.remove('kg-ui-hidden');
    overlay.classList.toggle('kg-single', urls.length < 2); // 1장 — ‹› 숨김
    uiVisible = true;
    document.documentElement.style.overflow = 'hidden';
    measure();
    setIndex(start || 0, false);
    document.removeEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onKeyDown);
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    urls = []; idx = 0; dragDX = 0; scale = 1; panX = 0; panY = 0;
    if (track) track.innerHTML = '';
    document.removeEventListener('keydown', onKeyDown);
  }
  function toggleUI() {
    if (!overlay) return;
    uiVisible = !uiVisible;
    overlay.classList.toggle('kg-ui-hidden', !uiVisible);
  }

  // ── 스와이프 종료: 임계 넘으면 다음/이전, 아니면 스냅백 ──
  function endSwipe() {
    const TH = Math.max(48, W * 0.16);
    let target = idx;
    if (dragDX <= -TH) target = idx + 1;
    else if (dragDX >= TH) target = idx - 1;
    dragDX = 0;
    setIndex(target, true);
  }

  function bindGestures() {
    // ── Touch (모바일 네이티브) ──
    viewport.addEventListener('touchstart', e => {
      const t = e.touches;
      if (t.length === 2) {
        pinching = true;
        startDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        baseScale = scale;
      } else if (t.length === 1) {
        startX = t[0].clientX; startY = t[0].clientY;
        pinching = false;
        if (scale > 1.01) { panning = true; }
        else { dragging = true; dragDX = 0; setTrack(false); }
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', e => {
      const t = e.touches;
      if (t.length === 2) {
        const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        scale = Math.max(1, Math.min(5, baseScale * (d / (startDist || 1))));
        applyZoom(false);
        e.preventDefault();
      } else if (t.length === 1 && scale > 1.01) {
        // 줌 상태 — 팬
        panX += (t[0].clientX - startX); panY += (t[0].clientY - startY);
        startX = t[0].clientX; startY = t[0].clientY;
        applyZoom(false);
        e.preventDefault();
      } else if (t.length === 1) {
        // 1× — 트랙 드래그(스와이프)
        dragDX = t[0].clientX - startX;
        if ((idx === 0 && dragDX > 0) || (idx === urls.length - 1 && dragDX < 0)) dragDX *= 0.35; // 끝단 고무줄
        setTrack(false);
        e.preventDefault();
      }
    }, { passive: false });

    viewport.addEventListener('touchend', e => {
      if (pinching) { if (e.touches.length === 0) { pinching = false; baseScale = scale; } return; }
      const t = e.changedTouches[0];
      const moved = Math.hypot(t.clientX - startX, t.clientY - startY);
      if (moved < 6) {
        // Tap — 더블탭(줌 토글) vs 단탭(UI 토글)
        const now = Date.now();
        if (now - lastTap < 320) { toggleZoom(); lastTap = 0; }
        else { toggleUI(); lastTap = now; }
        dragging = false; dragDX = 0; setTrack(true);
        return;
      }
      if (scale > 1.01) { panning = false; return; } // 줌 상태 팬 종료 — 스와이프 아님
      dragging = false;
      endSwipe();
    });

    // ── Mouse (데스크톱) ──
    viewport.addEventListener('mousedown', e => {
      mouseDown = true; startX = e.clientX; startY = e.clientY;
      if (scale > 1.01) { panning = true; }
      else { dragging = true; dragDX = 0; setTrack(false); }
    });
    window.addEventListener('mousemove', e => {
      if (!mouseDown) return;
      if (scale > 1.01) {
        panX += e.movementX; panY += e.movementY; applyZoom(false);
      } else {
        dragDX = e.clientX - startX;
        if ((idx === 0 && dragDX > 0) || (idx === urls.length - 1 && dragDX < 0)) dragDX *= 0.35;
        setTrack(false);
      }
    });
    window.addEventListener('mouseup', e => {
      if (!mouseDown) return;
      mouseDown = false;
      if (scale > 1.01) { panning = false; return; }
      const moved = Math.abs(e.clientX - startX);
      dragging = false;
      if (moved < 6) { dragDX = 0; setTrack(true); return; } // 단순 클릭 — 데스크톱은 X 로 닫음
      endSwipe();
    });

    // 더블 클릭 — 줌 토글 (데스크톱)
    viewport.addEventListener('dblclick', () => { toggleZoom(); });
    // 휠 — 줌 (데스크톱)
    viewport.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.18 : -0.18;
      scale = Math.max(1, Math.min(5, scale + delta));
      if (scale <= 1.01) { panX = 0; panY = 0; }
      applyZoom(false);
    }, { passive: false });
  }

  // ── 자동 감지: data-koaus-gallery="groupKey" — 같은 그룹 img 묶음 ──
  document.addEventListener('click', e => {
    const img = e.target.closest('[data-koaus-gallery]');
    if (!img) return;
    e.preventDefault();
    const key = img.getAttribute('data-koaus-gallery');
    const group = Array.from(document.querySelectorAll('[data-koaus-gallery="' + key + '"]'));
    const list = group.map(el => el.getAttribute('data-src') || el.src || el.dataset.src).filter(Boolean);
    const startIdx = Math.max(0, group.indexOf(img));
    open(list, startIdx);
  });

  // ── 상세 모달 인라인 사진 캐러셀(.rea-hero) — 데스크탑 hover ‹› 넘김 (2026-07) ──
  //    · 9개 보드(rea-detail)의 .detail-hero-gallery 는 scroll-snap x 캐러셀 — 마우스로는
  //      넘길 수단이 없어(휠=세로 스크롤) hover 시 ‹› 표시. 클릭 → 한 장 폭만큼 smooth 스크롤
  //      (기존 scroll 리스너가 카운터 1/N 자동 동기화).
  //    · 터치 기기는 주입 자체를 안 함(matchMedia 게이트) — 스와이프 전용, 사용자 확정.
  //    · ≥1024 rea-detail 분할 레이아웃은 세로 스택(휠로 넘어감) → CSS 로 화살표 숨김.
  //    · mouseover 위임(버블) 지연 주입 — 상세 모달이 글마다 갤러리를 재생성해도(버튼은
  //      hero 직속 자식이라 생존) 무해. 사진 0~1장이면 data-kg-nav="off" 로 숨김.
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const heroCss = document.createElement('style');
    heroCss.textContent = `
      .rea-hero .kg-hero-nav {
        position: absolute; top: 50%; transform: translateY(-50%);
        width: 38px; height: 38px; border-radius: 50%;
        background: rgba(0,0,0,0.45); color: #fff;
        border: 1px solid rgba(255,255,255,0.25);
        font: 700 20px/1 sans-serif; padding: 0 0 3px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; backdrop-filter: blur(8px); z-index: 3;
        opacity: 0; pointer-events: none; transition: opacity .18s ease, background .18s ease;
      }
      .rea-hero .kg-hero-prev { left: 12px; }
      .rea-hero .kg-hero-next { right: 12px; }
      .rea-hero[data-kg-nav="on"]:hover .kg-hero-nav { opacity: 1; pointer-events: auto; }
      .rea-hero .kg-hero-nav:hover { background: rgba(0,0,0,0.75); }
      @media (min-width: 1024px) {
        .rea-detail .rea-hero .kg-hero-nav { display: none; } /* 세로 스택 — 휠 스크롤로 충분 */
      }
    `;
    document.head.appendChild(heroCss);

    document.addEventListener('mouseover', e => {
      const hero = e.target && e.target.closest ? e.target.closest('.rea-hero') : null;
      if (!hero) return;
      const gal = hero.querySelector('.detail-hero-gallery');
      const n = gal ? gal.querySelectorAll('img').length : 0;
      hero.setAttribute('data-kg-nav', n > 1 ? 'on' : 'off');
      if (hero.querySelector('.kg-hero-nav')) return; // 이미 주입됨
      const mkNav = (cls, glyph, label, dir) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kg-hero-nav ' + cls;
        b.setAttribute('aria-label', label);
        b.textContent = glyph;
        b.addEventListener('click', ev => {
          ev.stopPropagation(); // 갤러리 img 클릭(라이트박스 오픈)과 분리
          const g = hero.querySelector('.detail-hero-gallery');
          if (g) g.scrollBy({ left: dir * (g.clientWidth || 0), behavior: 'smooth' });
        });
        hero.appendChild(b);
      };
      mkNav('kg-hero-prev', '‹', '이전 사진', -1);
      mkNav('kg-hero-next', '›', '다음 사진', 1);
    });
  }

  window.koausGallery = { open, close, next, prev };
})();
