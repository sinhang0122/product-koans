// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 공용 토스트 (koausToast)
//  · window.koausToast.show(msg [, autoMs]) / .hide()
//  · 사진 업로드 중 "사진 처리 중…" 안내 등 비차단 상태 메시지에 사용.
//    버튼 disabled 만으로는 "왜 안 눌리지" 혼란 → 화면 하단 토스트로 사유 안내.
//  · 자체 CSS 주입(글로벌 style.css 의존 없음) — 어느 페이지에 붙여도 동작.
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausToast) return;
  let el = null, timer = null;

  function ensure() {
    if (el) return el;
    const style = document.createElement('style');
    style.textContent =
      '#koausToast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(12px);' +
      'max-width:90vw;padding:11px 18px;background:rgba(20,20,22,.92);color:#fff;font-size:14px;' +
      'font-weight:600;line-height:1.3;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.28);' +
      'z-index:99999;opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease;' +
      "font-family:'Urbanist','Noto Sans KR',sans-serif;white-space:nowrap;}" +
      '#koausToast.show{opacity:1;transform:translateX(-50%) translateY(0);}';
    document.head.appendChild(style);
    el = document.createElement('div');
    el.id = 'koausToast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  window.koausToast = {
    // autoMs 미지정 시 hide() 호출 전까지 유지(진행 중 상태 표시용)
    show(msg, autoMs) {
      const n = ensure();
      n.textContent = msg || '';
      requestAnimationFrame(() => n.classList.add('show'));
      if (timer) { clearTimeout(timer); timer = null; }
      if (autoMs) timer = setTimeout(() => window.koausToast.hide(), autoMs);
    },
    hide() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (el) el.classList.remove('show');
    },
  };
})();
