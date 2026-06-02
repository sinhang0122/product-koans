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
//  기능:
//    · Stage 1 풀스크린 모달 — 좌우 스와이프(터치/마우스 드래그)
//    · Stage 2 더블탭 / 휠 / 핀치 줌 (transform scale + translate)
//    · 우상단 카운터(3/6) + X 버튼 — 단탭 시 UI 토글 (몰입 모드)
//    · 핀치 / 팬 (확대 상태에서) — 좌우 스와이프와 충돌 없는 정밀 제어
//    · 키보드: ESC 닫기, ←/→ 이동
//    · 블랙 앤 화이트 톤 (배경 #000, 컨트롤 #fff)
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausGallery) return;

  let overlay, imgEl, counterEl, closeBtn, urls = [], idx = 0;
  let scale = 1, panX = 0, panY = 0;
  let touchStartX = 0, touchStartY = 0, touchStartDist = 0, baseScale = 1;
  let dragging = false, dragStartX = 0, dragMoveX = 0;
  let uiVisible = true, lastTap = 0;

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
      #koausGallery .kg-stage {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
      }
      #koausGallery .kg-img {
        max-width: 100%; max-height: 100%;
        transform-origin: 50% 50%;
        transition: transform 0.18s ease-out;
        will-change: transform;
        -webkit-user-drag: none; user-drag: none;
        pointer-events: none;
      }
      #koausGallery.kg-dragging .kg-img { transition: none; }
      #koausGallery .kg-ui {
        position: absolute; top: 0; left: 0; right: 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: env(safe-area-inset-top, 14px) 18px 14px;
        gap: 14px;
        background: linear-gradient(180deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 100%);
        transition: opacity 0.22s ease;
        pointer-events: none;
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
    `;
    document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.id = 'koausGallery';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="kg-stage" id="kgStage">
        <img class="kg-img" id="kgImg" alt="" />
      </div>
      <div class="kg-ui">
        <span class="kg-counter" id="kgCounter">1 / 1</span>
        <button class="kg-close" id="kgClose" type="button" aria-label="닫기">✕</button>
      </div>`;
    document.body.appendChild(overlay);
    imgEl     = document.getElementById('kgImg');
    counterEl = document.getElementById('kgCounter');
    closeBtn  = document.getElementById('kgClose');
    closeBtn.addEventListener('click', close);
    bindGestures();
    return overlay;
  }

  function applyTransform(animate) {
    if (!imgEl) return;
    imgEl.style.transition = animate ? 'transform 0.22s ease-out' : 'none';
    imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  function resetTransform() { scale = 1; panX = 0; panY = 0; applyTransform(true); }
  function setIndex(n) {
    if (!urls.length) return;
    idx = Math.max(0, Math.min(urls.length - 1, n));
    if (imgEl) imgEl.src = urls[idx];
    if (counterEl) counterEl.textContent = `${idx + 1} / ${urls.length}`;
    resetTransform();
  }
  function next() { setIndex(idx + 1); }
  function prev() { setIndex(idx - 1); }
  function open(_urls, start) {
    if (!Array.isArray(_urls) || !_urls.length) return;
    ensureMounted();
    urls = _urls.slice();
    overlay.classList.add('is-open');
    overlay.classList.remove('kg-ui-hidden');
    uiVisible = true;
    document.documentElement.style.overflow = 'hidden';
    setIndex(start || 0);
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    urls = []; resetTransform();
  }
  function toggleUI() {
    if (!overlay) return;
    uiVisible = !uiVisible;
    overlay.classList.toggle('kg-ui-hidden', !uiVisible);
  }

  function bindGestures() {
    const stage = document.getElementById('kgStage');
    // ── Touch (모바일 네이티브) ──
    stage.addEventListener('touchstart', e => {
      const t = e.touches;
      if (t.length === 2) {
        touchStartDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        baseScale = scale;
      } else if (t.length === 1) {
        touchStartX = t[0].clientX; touchStartY = t[0].clientY;
        dragStartX = t[0].clientX; dragMoveX = 0;
        dragging = scale > 1.01;   // 확대 상태에서만 pan, 아니면 swipe
      }
    }, { passive: true });
    stage.addEventListener('touchmove', e => {
      const t = e.touches;
      if (t.length === 2) {
        const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        scale = Math.max(1, Math.min(5, baseScale * (d / touchStartDist)));
        applyTransform(false);
        e.preventDefault();
      } else if (t.length === 1 && scale > 1.01) {
        // 확대 시 Pan
        panX += (t[0].clientX - touchStartX);
        panY += (t[0].clientY - touchStartY);
        touchStartX = t[0].clientX; touchStartY = t[0].clientY;
        applyTransform(false);
        e.preventDefault();
      } else if (t.length === 1) {
        // 1× 상태에서 swipe — 진행 거리 기록
        dragMoveX = t[0].clientX - dragStartX;
        overlay.classList.add('kg-dragging');
        imgEl.style.transform = `translate(${dragMoveX}px, 0) scale(1)`;
      }
    }, { passive: false });
    stage.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      // Tap 감지 (이동 < 6px, 시간 < 300ms 가정)
      const moved = Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY);
      const now = Date.now();
      if (moved < 6 && scale <= 1.01) {
        if (now - lastTap < 320) {
          // 더블탭: 줌 토글
          scale = scale > 1.5 ? 1 : 2.4; panX = 0; panY = 0; applyTransform(true);
          lastTap = 0;
        } else {
          // 단탭: UI 토글
          toggleUI();
          lastTap = now;
        }
      } else if (scale <= 1.01 && Math.abs(dragMoveX) > 60) {
        // 스와이프 임계 (60px) — 다음/이전
        if (dragMoveX > 0) prev(); else next();
        dragMoveX = 0;
      } else if (scale <= 1.01) {
        // 임계 미달 — 원위치
        applyTransform(true);
      }
      overlay.classList.remove('kg-dragging');
    });
    // ── Mouse (데스크톱 대체) ──
    let mouseDown = false;
    stage.addEventListener('mousedown', e => {
      mouseDown = true; dragStartX = e.clientX; dragMoveX = 0;
      overlay.classList.add('kg-dragging');
    });
    window.addEventListener('mousemove', e => {
      if (!mouseDown) return;
      if (scale > 1.01) {
        panX += e.movementX; panY += e.movementY; applyTransform(false);
      } else {
        dragMoveX = e.clientX - dragStartX;
        imgEl.style.transform = `translate(${dragMoveX}px, 0) scale(1)`;
      }
    });
    window.addEventListener('mouseup', e => {
      if (!mouseDown) return;
      mouseDown = false; overlay.classList.remove('kg-dragging');
      if (scale <= 1.01) {
        if (Math.abs(dragMoveX) > 80) { dragMoveX > 0 ? prev() : next(); dragMoveX = 0; }
        else applyTransform(true);
      }
    });
    // 더블 클릭 — 줌 토글 (데스크톱)
    stage.addEventListener('dblclick', () => {
      scale = scale > 1.5 ? 1 : 2.4; panX = 0; panY = 0; applyTransform(true);
    });
    // 휠 — 줌 (데스크톱)
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.18 : -0.18;
      scale = Math.max(1, Math.min(5, scale + delta));
      if (scale <= 1.01) { panX = 0; panY = 0; }
      applyTransform(false);
    }, { passive: false });
    // 키보드
    document.addEventListener('keydown', e => {
      if (!overlay || !overlay.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft')  prev();
    });
  }

  // ── 자동 감지: data-koaus-gallery="groupKey" — 같은 그룹 img 들 묶음 ──
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

  window.koausGallery = { open, close, next, prev };
})();
