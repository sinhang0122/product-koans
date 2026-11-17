// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 공용 토스트 (koausToast)
//  · window.koausToast.show(msg [, autoMs [, kind]]) / .hide()
//  · 11-17(사용자 선택 — 후보 B): 흰 카드 · 얇은 테두리 · 모서리 12px · 14px + 왼쪽 점. offline.js · session-timeout.js 와 같은 모양.
//    점 색: kind 'ok' 는 청록, 그 밖은 글자색. kind 를 안 주면 첫 문장이 "…했습니다/되었습니다" 로 끝나는 성공 문구만 청록.
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
      // 가운데 = 좌우 16px + auto 여백(left:50% 는 폭이 화면 절반으로 줄어 글이 꺾인다). nowrap 을 빼 긴 문구도 화면 안에서 줄바꿈
      '#koausToast{position:fixed;left:16px;right:16px;margin:0 auto;width:fit-content;bottom:calc(88px + env(safe-area-inset-bottom,0px));transform:translateY(12px);' +
      'display:flex;align-items:center;gap:9px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 16px 10px 14px;' +
      'background:var(--bg-base,#fff);color:var(--text-primary,#111);border:1px solid var(--border,#dcdcdc);border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.10);' +
      'font-size:14px;font-weight:600;line-height:1.35;letter-spacing:-.2px;word-break:keep-all;' +
      'z-index:99999;opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease;' +
      "font-family:'Noto Sans KR','Urbanist',system-ui,-apple-system,sans-serif;}" +
      '#koausToast .kt-dot{width:8px;height:8px;border-radius:50%;background:var(--text-primary,#111);flex:0 0 auto;}' +
      '#koausToast.ok .kt-dot{background:#0b7a5c;}' +
      ':root[data-theme="dark"] #koausToast{background:#111;border-color:#333;}' +
      ':root[data-theme="dark"] #koausToast.ok .kt-dot{background:#5eead4;}' +
      '#koausToast.show{opacity:1;transform:translateY(0);}';
    document.head.appendChild(style);
    el = document.createElement('div');
    el.id = 'koausToast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="kt-dot" aria-hidden="true"></span><span class="kt-msg"></span>';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }
  // 점 색 고르기 — 첫 문장만 본다: "저장했습니다." "링크가 복사되었습니다" 는 성공(청록), "…못했습니다" 등은 기본
  function guessKind(t) {
    const first = String(t).split(/[.!?\n—]/)[0].trim();
    return (/(했습니다|되었습니다|됐습니다|보냈습니다|했어요|됐어요|보냈어요)$/.test(first) && !/못|실패|않/.test(first)) ? 'ok' : 'info';
  }

  window.koausToast = {
    // autoMs 미지정 시 hide() 호출 전까지 유지(진행 중 상태 표시용)
    show(msg, autoMs, kind) {
      const n = ensure();
      const text = String(msg == null ? '' : msg);
      n.querySelector('.kt-msg').textContent = text;
      n.classList.toggle('ok', (kind || guessKind(text)) === 'ok');
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
