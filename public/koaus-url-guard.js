// ════════════════════════════════════════════════════════════════════
//  KoAus · URL 스킴 화이트리스트 가드
//  -----------------------------------------------------------------
//  목적: 동적으로 a.href / window.open / img.src 등에 주입되는 URL이
//        반드시 안전한 스킴(http/https/mailto/tel)만 통과하도록 강제.
//        javascript:/data:/vbscript:/file:/ftp: 등 피싱/XSS 벡터 차단.
//
//  사용 예:
//    window.koausUrlGuard.isSafeHttp('https://open.kakao.com/...')  → true
//    window.koausUrlGuard.isSafeHttp('javascript:alert(1)')         → false
//    window.koausUrlGuard.safe('javascript:alert(1)')               → '' (안전 기본값)
//    window.koausUrlGuard.safe('https://example.com')               → 'https://example.com'
//
//  주의:
//    · URL 객체 파싱 실패(상대경로 등)는 false 반환. 절대 URL만 허용.
//    · 카카오 오픈채팅은 일반 https 링크이므로 isSafeHttp 로 통과.
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausUrlGuard) return;

  // http / https 만 통과 (가장 흔한 외부 링크)
  function isSafeHttp(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  // mailto:email@domain 검증
  function isSafeMailto(url) {
    if (!url || typeof url !== 'string') return false;
    const s = url.trim().toLowerCase();
    if (!s.startsWith('mailto:')) return false;
    const email = s.slice(7).split('?')[0];
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // tel:phone 검증 — 숫자/+/공백/-/() 만
  function isSafeTel(url) {
    if (!url || typeof url !== 'string') return false;
    const s = url.trim().toLowerCase();
    if (!s.startsWith('tel:') && !s.startsWith('sms:')) return false;
    const tail = url.trim().split(':').slice(1).join(':');
    if (!tail) return false;
    return /^[0-9+\s\-().]+$/.test(tail) && tail.replace(/\D/g, '').length >= 5;
  }

  // 통합 검증: 안전 스킴 화이트리스트 (http/https/mailto/tel/sms)
  function isSafe(url) {
    return isSafeHttp(url) || isSafeMailto(url) || isSafeTel(url);
  }

  // 안전한 URL 만 반환, 그 외엔 fallback (기본 '' → 빈 링크 = no-op)
  function safe(url, fallback) {
    return isSafe(url) ? String(url).trim() : (fallback != null ? fallback : '');
  }

  window.koausUrlGuard = {
    isSafeHttp:   isSafeHttp,
    isSafeMailto: isSafeMailto,
    isSafeTel:    isSafeTel,
    isSafe:       isSafe,
    safe:         safe,
  };
})();
