// ════════════════════════════════════════════════════════════════════
//  KoAus · 홈 영상 칸 + 풀스크린 쇼츠 플레이어 (자체 주입 단일 파일 · ES module)
//  - 마운트: index.html `<section id="koausHomeVideos">` (홈 전용 — 없으면 조용히 종료)
//  - 홈 칸: 세로 9:16 썸네일 카드 가로 스크롤(scroll-snap x) · 탭 → 풀스크린 플레이어
//    · 인라인 자동재생(2026-07): 첫 로드 시 첫 영상, 가로 스크롤 시 중앙 타일이
//      음소거 자동재생 (iframe 은 항상 1개만 마운트 — 빌링/데이터 방어).
//      IntersectionObserver 로 칸이 화면 밖이면 언마운트, visibilitychange 대응.
//  - 데이터: Firestore `videos` — 유저 등록(pending) → 운영자 승인(approved) 큐
//    · 홈 구독: where('status','==','approved') + orderBy('createdAt','desc') + limit(20)
//      (rules 가 approved 조건 없는 list 를 거부 — firestore.indexes.json 복합 인덱스 필수)
//    · LS 캐시(koaus-home-videos) 즉시 렌더 → 스냅샷 도착 시 교체 (marquee.js 패턴)
//    · 등록은 환경설정 전용(settings.html · koaus-video-reg.js) — 홈 ＋ 버튼 폐지 (2026-07)
//  - 썸네일: i.ytimg.com/vi/<id>/hqdefault.jpg (API 키 불필요)
//  - 플레이어: 세로 scroll-snap 피드 · 활성 슬라이드만 iframe(이중 오디오 방지)
//    · 우측 소형 액션: 🔇음소거 토글 / ⚙설정(배속·자막 — 화질은 유튜브 임베드가
//      수동 선택 미지원이라 '자동' 고지) / ↗유튜브
//    · 하단: CTA "문구 ›" 링크(ctaText+ctaUrl, https 만) + 제목
//    · 음소거 자동재생 + 🔊 언뮤트 · end=60 + ENDED → 자동 다음 스크롤
//    · 임베드 차단(101/150) 폴백 · 좌상단 ‹ 뒤로가기 / 닫기 ✕ / ESC / 시스템 뒤로가기(popstate)
//  - 최근 본 영상(2026-07): 풀스크린 재생 시 LS 'koaus-recent-videos' 기록(dedupe·cap 30)
//    → mypage '최근 본 영상' 탭이 읽음 · index.html?v=<id> 딥링크 → 플레이어 직행
//      (첫 서버 스냅샷에도 없는 id 는 만료 처리 — 미승인/삭제 영상 소급 오픈 금지)
//  - CSP: frame-src youtube/youtube-nocookie · img-src i.ytimg.com
// ════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';   // App Check 공용 init — Enforce 차단 방지
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

(function () {
  'use strict';
  if (window.__koausHomeVideos) return;
  window.__koausHomeVideos = true;

  // host 는 boot()(파일 최하단)에서 할당 — 부트를 모든 선언 이후에 실행해
  // var 호이스팅 미초기화 참조(LS_KEY/VIDEOS/rail 재초기화 덮어쓰기) 원천 차단.
  // ⚠️ boot 호출부를 파일 상단으로 되돌리지 말 것 — init() 이 아직 undefined 인
  //    LS_KEY 로 캐시를 읽고, 이후 도달한 `var VIDEOS = []` 가 상태를 도로 wipe 한다.
  var host = null;

  /* ── Firebase ── */
  var firebaseConfig = {
    apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
    authDomain: 'koaus-f564c.firebaseapp.com',
    projectId: 'koaus-f564c',
    storageBucket: 'koaus-f564c.firebasestorage.app',
    messagingSenderId: '663988594088',
    appId: '1:663988594088:web:ef30c2fd557407b00b299d',
    measurementId: 'G-DERZ9MTKPL',
  };
  var db = null;

  /* ── 유틸 ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // YouTube URL → videoId (watch?v= / youtu.be/ / shorts/ / embed/ / live/ / 맨 ID)
  function vid(u) {
    try {
      u = String(u || '').trim();
      var m = u.match(/(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|[?&]v=)([A-Za-z0-9_-]{6,20})/);
      if (m) return m[1];
      if (/^[A-Za-z0-9_-]{6,20}$/.test(u)) return u;
    } catch (_) {}
    return '';
  }
  function thumb(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }
  // 타일 확대(33svh)에 맞춘 고해상 썸네일 — 일부 영상은 hq720 이 없어(404) onerror 로 hqdefault 폴백
  function thumbHi(id) { return 'https://i.ytimg.com/vi/' + id + '/hq720.jpg'; }
  function ga(ev) { try { if (typeof gtag === 'function') gtag('event', ev); } catch (_) {} }
  function sanitize(x) {
    var id = vid((x && (x.videoId || x.url || x.id)) || '');
    if (!id) return null;
    return {
      id: id,
      title: String((x && x.title) || '').slice(0, 200),
      ctaText: String((x && x.ctaText) || '').slice(0, 60),
      ctaUrl: /^https:\/\//.test(String((x && x.ctaUrl) || '')) ? String(x.ctaUrl).slice(0, 300) : '',
    };
  }
  function hasCta(v) { return !!(v && v.ctaText && v.ctaUrl); }

  /* ── 데이터 — LS 캐시 즉시 렌더 → Firestore approved 구독 ── */
  var LS_KEY = 'koaus-home-videos';
  var VIDEOS = [];
  function readCache() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      if (Array.isArray(a)) {
        return a.map(sanitize).filter(Boolean).slice(0, 20);
      }
    } catch (_) {}
    return [];
  }
  function writeCache(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (_) {}
  }

  /* ── 최근 본 영상 기록 (기기-로컬) — mypage '최근 본 영상' 탭이 읽음 ── */
  var RECENT_KEY = 'koaus-recent-videos';
  function recordWatch(v) {
    if (!v || !v.id) return;
    try {
      var a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(a)) a = [];
      a = a.filter(function (x) { return x && x.videoId !== v.id; });
      a.unshift({ videoId: v.id, title: v.title || '', at: Date.now() });
      localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 30)));
    } catch (_) {}
  }

  /* ── ?v= 딥링크 — mypage '최근 본 영상' → 홈 플레이어 직행 ── */
  var deepLinkId = '';
  try { deepLinkId = vid(new URLSearchParams(location.search).get('v') || ''); } catch (_) {}
  function stripDeepLinkParam() {
    try {
      var u = new URL(location.href);
      u.searchParams.delete('v');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    } catch (_) {}
  }
  function tryDeepLink() {
    if (!deepLinkId) return;
    for (var i = 0; i < VIDEOS.length; i++) {
      if (VIDEOS[i].id === deepLinkId) {
        deepLinkId = '';
        stripDeepLinkParam();
        openPlayer(i);
        return;
      }
    }
  }

  function init() {
    injectCss();
    VIDEOS = readCache();
    buildRail();
    setupVisibility();
    tryDeepLink();   // LS 캐시에 있으면 즉시 오픈 — 없으면 첫 스냅샷에서 재시도

    try {
      var app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      db = getFirestore(app);
      var q = query(collection(db, 'videos'),
                    where('status', '==', 'approved'),
                    orderBy('createdAt', 'desc'),
                    limit(20));
      onSnapshot(q, function (snap) {
        var list = [];
        snap.forEach(function (d) {
          var v = sanitize(d.data());
          if (v) list.push(v);
        });
        VIDEOS = list;
        writeCache(list);
        buildRail();
        tryDeepLink();
        if (deepLinkId) { deepLinkId = ''; stripDeepLinkParam(); }   // 첫 스냅샷에도 없으면 만료 (미승인/삭제 소급 오픈 금지)
      }, function (err) {
        try { console.warn('[koaus-videos] 구독 실패:', err && err.code); } catch (_) {}
      });
    } catch (e) {
      try { console.warn('[koaus-videos] init 실패:', e); } catch (_) {}
    }
  }

  /* ── 스타일 (자체 주입) ── */
  function injectCss() {
    if (document.getElementById('koaus-home-videos-style')) return;
    var css =
      /* 홈 칸 */
      '#koausHomeVideos{display:block;margin:4px 0 14px;}' +
      '#koausHomeVideos .kv-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px;}' +
      '#koausHomeVideos .kv-title{font-size:15px;font-weight:800;letter-spacing:-.3px;color:var(--text-primary,#111);}' +
      '#koausHomeVideos .kv-hint{font-size:11.5px;font-weight:600;color:var(--text-muted,#8e8e93);}' +
      '#koausHomeVideos .kv-rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;' +
        '-webkit-overflow-scrolling:touch;padding:2px 2px 6px;scrollbar-width:none;}' +
      '#koausHomeVideos .kv-rail::-webkit-scrollbar{display:none;}' +
      /* 타일 크기(2026-07 재확대 — 사용자 확정 "리얼스테이트 카드급"): 세로 기준 — 모바일 뷰포트
         세로의 ~45%(45svh, 300~470px 클램프), 가로는 aspect-ratio 9:16 이 자동 산출(폰에서 타일
         1.5~1.8개 노출). svh 미지원 브라우저는 앞줄 vh 폴백. width 고정으로 되돌리지 말 것. */
      '#koausHomeVideos .kv-tile{position:relative;flex:0 0 auto;height:clamp(300px,45vh,470px);' +
        'height:clamp(300px,45svh,470px);aspect-ratio:9/16;' +
        'border:0;padding:0;border-radius:14px;overflow:hidden;scroll-snap-align:start;cursor:pointer;' +
        'background:linear-gradient(150deg,var(--bg-subtle,#f3f4f6),var(--border,#e5e7eb));' +
        '-webkit-tap-highlight-color:transparent;}' +
      '#koausHomeVideos .kv-tile img{width:100%;height:100%;object-fit:cover;display:block;}' +
      /* 인라인 자동재생 iframe — 썸네일 위 오버레이, 탭은 타일이 받게 통과 차단 */
      '#koausHomeVideos .kv-tile iframe.kv-inline{position:absolute;inset:0;width:100%;height:100%;border:0;' +
        'pointer-events:none;background:#000;}' +
      '#koausHomeVideos .kv-tile.kv-live .kv-play{display:none;}' +
      '#koausHomeVideos .kv-tile::after{content:"";position:absolute;inset:auto 0 0 0;height:46%;' +
        'background:linear-gradient(180deg,transparent,rgba(0,0,0,.62));pointer-events:none;}' +
      '#koausHomeVideos .kv-tile-title{position:absolute;left:10px;right:10px;bottom:10px;z-index:1;text-align:left;' +
        'font-size:13px;font-weight:700;line-height:1.35;color:#fff;letter-spacing:-.2px;' +
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}' +
      '#koausHomeVideos .kv-play{position:absolute;top:8px;right:8px;z-index:1;width:24px;height:24px;border-radius:50%;' +
        'background:rgba(0,0,0,.55);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;}' +
      '#koausHomeVideos .kv-tile--soon{display:flex;align-items:center;justify-content:center;cursor:default;}' +
      '#koausHomeVideos .kv-tile--soon span{font-size:12px;font-weight:700;color:var(--text-muted,#8e8e93);' +
        'text-align:center;line-height:1.5;}' +
      '#koausHomeVideos .kv-tile--soon::after{display:none;}' +
      /* 풀스크린 플레이어 */
      '.kv-overlay{position:fixed;inset:0;z-index:99980;background:#000;}' +
      '.kv-wrap{position:absolute;inset:0;overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;}' +
      '.kv-wrap::-webkit-scrollbar{display:none;}' +
      '.kv-slide{position:relative;height:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;}' +
      '.kv-bg{position:absolute;inset:-24px;background-size:cover;background-position:center;' +
        'filter:blur(26px) brightness(.45);transform:scale(1.12);}' +   /* 가로 영상 레터박스 뒤 블러 */
      '.kv-frame{position:absolute;inset:0;margin:auto;height:100%;aspect-ratio:9/16;max-width:100%;background:#000;}' +
      /* iframe 은 반드시 positioned — 비positioned 로 두면 absolute 인 .kv-poster 가 위에
         페인트되어 "영상이 안 흘러가고 저화질(=썸네일)만 보이는" 버그 재발 (2026-07 확정 원인) */
      '.kv-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;}' +
      '.kv-poster{position:absolute;inset:0;background-size:cover;background-position:center;}' +
      '.kv-meta{position:absolute;left:14px;right:66px;bottom:calc(18px + env(safe-area-inset-bottom,0px));' +
        'color:#fff;font-size:13.5px;font-weight:700;line-height:1.4;letter-spacing:-.2px;text-shadow:0 1px 6px rgba(0,0,0,.7);' +
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;pointer-events:none;}' +
      /* CTA — 하단 "문구 ›" 링크 (제목 위) */
      '.kv-cta{position:absolute;left:14px;max-width:calc(100% - 96px);bottom:calc(60px + env(safe-area-inset-bottom,0px));' +
        'z-index:3;display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.94);color:#111;' +
        'font-size:13px;font-weight:800;letter-spacing:-.2px;padding:9px 14px;border-radius:999px;text-decoration:none;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.35);}' +
      '.kv-cta .kv-cta-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.kv-cta b{font-weight:900;font-size:15px;line-height:1;}' +
      /* 우측 소형 액션 버튼 */
      '.kv-actions{position:absolute;right:10px;bottom:calc(14px + env(safe-area-inset-bottom,0px));' +
        'display:flex;flex-direction:column;gap:10px;z-index:3;}' +
      '.kv-abtn{width:36px;height:36px;border-radius:50%;border:0;cursor:pointer;background:rgba(255,255,255,.16);' +
        'color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);-webkit-tap-highlight-color:transparent;}' +
      '.kv-abtn:active{transform:scale(.92);}' +
      /* 설정 패널 (배속·자막 — 화질은 자동 고지) */
      '.kv-set{position:absolute;right:56px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:6;width:216px;' +
        'background:rgba(20,20,24,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
        'border-radius:14px;padding:12px 12px 10px;color:#fff;}' +
      '.kv-set-row{margin-bottom:10px;}' +
      '.kv-set-label{display:block;font-size:11px;font-weight:800;color:rgba(255,255,255,.65);margin-bottom:6px;}' +
      '.kv-set-opts{display:flex;flex-wrap:wrap;gap:5px;}' +
      '.kv-set-opts button{border:0;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;font-size:11.5px;' +
        'font-weight:700;padding:6px 9px;border-radius:8px;-webkit-tap-highlight-color:transparent;}' +
      '.kv-set-opts button.on{background:#fff;color:#111;}' +
      '.kv-set-note{font-size:10.5px;line-height:1.5;color:rgba(255,255,255,.55);margin:2px 0 0;}' +
      '.kv-close,.kv-back{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));z-index:5;' +
        'width:40px;height:40px;border-radius:50%;border:0;cursor:pointer;background:rgba(0,0,0,.45);color:#fff;' +
        'font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;}' +
      '.kv-close{right:12px;}' +
      '.kv-back{left:12px;font-size:26px;padding-bottom:3px;}' +
      '.kv-unmute{position:absolute;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:4;' +
        'border:0;cursor:pointer;background:rgba(0,0,0,.55);color:#fff;font-size:12.5px;font-weight:700;' +
        'padding:9px 16px;border-radius:999px;-webkit-tap-highlight-color:transparent;}' +
      '.kv-fallback{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:14px;background:rgba(0,0,0,.72);color:#fff;text-align:center;padding:0 28px;}' +
      /* hidden 가드 — author display:flex 가 [hidden] UA 스타일을 덮어 폴백이 상시 노출되던
         버그(2026-07)의 원인. 이 줄을 지우면 "재생되는데 제한 문구" 가 전 영상에서 재발한다. */
      '.kv-fallback[hidden]{display:none!important;}' +
      '.kv-fallback p{margin:0;font-size:14px;font-weight:700;line-height:1.6;}' +
      '.kv-fallback a{display:inline-block;background:#fff;color:#111;font-size:13.5px;font-weight:800;' +
        'padding:11px 20px;border-radius:999px;text-decoration:none;}';
    var style = document.createElement('style');
    style.id = 'koaus-home-videos-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── 홈 칸 렌더 ── */
  var rail = null;
  function buildRail() {
    if (!host) return;
    inlineTile = null;   // innerHTML 교체 — 기존 인라인 iframe 은 DOM 과 함께 소멸
    var tiles;
    if (!VIDEOS.length) {
      tiles = '';
      for (var i = 0; i < 3; i++) {
        tiles += '<div class="kv-tile kv-tile--soon" aria-hidden="true"><span>🎬<br>영상 준비 중</span></div>';
      }
    } else {
      tiles = VIDEOS.map(function (v, i) {
        return '<div class="kv-tile" role="button" tabindex="0" data-i="' + i + '" aria-label="영상 재생: ' + esc(v.title || '영상') + '">' +
                 '<img src="' + thumbHi(v.id) + '" alt="" loading="lazy">' +
                 (v.title ? '<span class="kv-tile-title">' + esc(v.title) + '</span>' : '') +
                 '<span class="kv-play" aria-hidden="true">▶</span>' +
               '</div>';
      }).join('');
    }
    host.innerHTML =
      '<div class="kv-head">' +
        '<span class="kv-title">🎬 영상</span>' +
        '<span class="kv-hint">' + (VIDEOS.length ? '탭하면 전체화면' : '등록은 마이페이지 ⚙️에서') + '</span>' +
      '</div>' +
      '<div class="kv-rail">' + tiles + '</div>';
    rail = host.querySelector('.kv-rail');
    // hq720 미존재(404) → hqdefault 폴백 (인라인 onerror 는 CSP script-src 이슈 — JS 리스너로)
    host.querySelectorAll('.kv-tile img').forEach(function (im) {
      im.addEventListener('error', function () {
        if (im.__kvFb) return;
        im.__kvFb = 1;
        im.src = im.src.replace('/hq720.jpg', '/hqdefault.jpg');
      });
    });
    host.querySelectorAll('.kv-tile[data-i]').forEach(function (b) {
      function go() { openPlayer(parseInt(b.dataset.i, 10) || 0); }
      b.addEventListener('click', go);
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
    if (rail) {
      rail.addEventListener('scroll', function () { scheduleInline(150); }, { passive: true });
    }
    scheduleInline(60);
  }

  /* ── 인라인 자동재생 — 항상 iframe 1개 (중앙 타일, 음소거) ──
     · 첫 로드: scrollLeft 0 → 첫 영상 자동재생
     · 가로 스크롤: 뷰포트 중앙에 가장 가까운 타일 (양끝은 첫/마지막으로 클램프)
     · 칸이 화면 밖(IO)·탭 백그라운드(visibilitychange)·플레이어 열림 → 언마운트 */
  var inlineTile = null, inlineT = null, railVisible = false, ioStarted = false;
  function inlineSrc(id) {
    return 'https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1' +
      '&loop=1&playlist=' + id + '&end=60';
  }
  function railTiles() { return rail ? rail.querySelectorAll('.kv-tile[data-i]') : []; }
  function computeActive() {
    if (!rail) return -1;
    var ts = railTiles();
    if (!ts.length) return -1;
    var sl = rail.scrollLeft, vw = rail.clientWidth;
    if (sl <= 6) return 0;                                        // 맨앞 → 첫 영상
    if (sl + vw >= rail.scrollWidth - 6) return ts.length - 1;    // 맨끝 → 마지막
    // getBoundingClientRect 기준 — offsetLeft 는 offsetParent(레일 아님) 기준이라
    // 레일의 페이지 내 가로 오프셋(데스크탑 중앙 정렬 여백 등)이 섞여 오른쪽 타일을
    // 오선택하는 편향이 있었음 (2026-07 수정). rect 는 스크롤 반영된 뷰포트 좌표.
    var cx = rail.getBoundingClientRect().left + vw / 2, best = 0, bd = Infinity;
    for (var i = 0; i < ts.length; i++) {
      var r = ts[i].getBoundingClientRect();
      var d = Math.abs(r.left + r.width / 2 - cx);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function mountInline(i) {
    if (overlay || !railVisible || document.hidden) return;   // 플레이어 열림/칸 밖/백그라운드
    if (i < 0 || !VIDEOS[i]) return;
    var tile = railTiles()[i];
    if (!tile) return;
    if (inlineTile === tile && tile.querySelector('iframe.kv-inline')) return;
    unmountInline();
    var f = document.createElement('iframe');
    f.className = 'kv-inline';
    f.setAttribute('allow', 'autoplay; encrypted-media');
    f.setAttribute('tabindex', '-1');
    f.setAttribute('aria-hidden', 'true');
    f.src = inlineSrc(VIDEOS[i].id);
    tile.appendChild(f);
    tile.classList.add('kv-live');
    inlineTile = tile;
  }
  function unmountInline() {
    if (!inlineTile) return;
    var f = inlineTile.querySelector('iframe.kv-inline');
    if (f) { try { f.remove(); } catch (_) {} }
    inlineTile.classList.remove('kv-live');
    inlineTile = null;
  }
  function scheduleInline(delay) {
    clearTimeout(inlineT);
    inlineT = setTimeout(function () { mountInline(computeActive()); }, delay == null ? 150 : delay);
  }
  function setupVisibility() {
    if (ioStarted) return;
    ioStarted = true;
    if ('IntersectionObserver' in window) {
      try {
        new IntersectionObserver(function (entries) {
          railVisible = !!(entries[0] && entries[0].isIntersecting);
          if (railVisible) scheduleInline(80); else unmountInline();
        }, { threshold: 0.25 }).observe(host);
      } catch (_) { railVisible = true; scheduleInline(80); }
    } else {
      railVisible = true;
      scheduleInline(80);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) unmountInline(); else scheduleInline(120);
    });
  }

  /* ── 풀스크린 플레이어 — 열 때의 목록 스냅샷(PLAY) 사용 (구독 갱신과 분리) ── */
  var overlay = null, wrap = null, cur = -1, scrollT = null;
  var PLAY = [];
  // soundOn = 사용자가 이번 세션에서 (네이티브 컨트롤로) 소리를 켰는지. 기본 false —
  //  첫 슬라이드는 항상 mute 자동재생(모바일 허용). 제스처 없는 unMute 는 모바일 재생을 멈추므로
  //  세션 저장값으로 첫 화면을 unMute 하지 않는다. 사용자가 한 번 소리를 켜면(제스처=sticky 활성화)
  //  그 뒤 슬라이드부터 unMute 를 이어붙인다.
  var soundOn = false, rate = 1, ccOn = false;
  try {
    var r0 = parseFloat(sessionStorage.getItem('koaus_vid_rate'));
    if ([0.5, 0.75, 1, 1.25, 1.5, 2].indexOf(r0) !== -1) rate = r0;
    ccOn = sessionStorage.getItem('koaus_vid_cc') === '1';
  } catch (_) {}

  function embedSrc(id) {
    var origin = '';
    try { origin = '&origin=' + encodeURIComponent(location.origin); } catch (_) {}
    return 'https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&end=60&enablejsapi=1' +
      (ccOn ? '&cc_load_policy=1&cc_lang_pref=ko' : '') + origin;
  }
  function sendCmd(iframe, func, args) {
    try {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*');
    } catch (_) {}
  }
  function activeIframe() {
    var s = wrap && wrap.children[cur];
    return s ? s.querySelector('iframe') : null;
  }
  // 슬라이드 전환 후 재생 보장 — 소리는 유튜브 네이티브 컨트롤로 각 영상에서 직접 켠다.
  //  · 프로그램적 unMute 는 모바일에서 사용자 제스처가 없으면 재생을 멈추게 해(다음 영상 정지
  //    버그의 원인) 하지 않는다. URL mute=1 로 시작(음소거 자동재생은 모바일 허용) +
  //    playVideo 넛지로 스와이프 직후에도 바로 이어 재생되게 한다(2026-07 모바일 자동재생 수정).
  function applyPrefs() {
    var f = activeIframe();
    if (f) {
      // soundOn 은 사용자가 이번 세션에서 한 번 소리를 켠 뒤에만 true (제스처=sticky 활성화) —
      //  그 이후 슬라이드는 unMute 를 이어붙여도 모바일이 재생을 멈추지 않는다. 첫 슬라이드는
      //  soundOn=false 라 mute 유지(모바일 자동재생 보존).
      if (soundOn) { sendCmd(f, 'unMute'); sendCmd(f, 'setVolume', [100]); }
      sendCmd(f, 'setPlaybackRate', [rate]);
      sendCmd(f, 'playVideo');
      var s = wrap && wrap.children[cur];
      if (s) s.__kvApplied = true;   // 이후 도착하는 infoDelivery muted 값을 '사용자 토글'로 신뢰
    }
  }

  // 활성 슬라이드만 iframe 마운트 — 이웃은 포스터 유지 (오프스크린 이중 오디오 방지)
  function mountActive() {
    if (!wrap) return;
    Array.prototype.forEach.call(wrap.children, function (slide, i) {
      var frame = slide.querySelector('.kv-frame');
      if (!frame) return;
      var hasIframe = !!frame.querySelector('iframe');
      if (i === cur) {
        if (hasIframe) return;
        slide.__kvEnded = false;
        slide.__kvState = -1;
        slide.__kvApplied = false;   // applyPrefs 전 = 초기 mute 상태 (muted 감지 무시)
        var fbReset = slide.querySelector('.kv-fallback');
        if (fbReset) fbReset.hidden = true;   // 재마운트 = 재시도 — 이전 방문의 폴백 잔상 제거 (진짜 차단이면 onError 가 다시 띄움)
        recordWatch(PLAY[i]);   // 최근 본 영상 기록 — 풀스크린 재생만 (인라인 음소거 자동재생 제외)
        var f = document.createElement('iframe');
        f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
        f.setAttribute('allowfullscreen', '');
        f.src = embedSrc(PLAY[i].id);
        f.addEventListener('load', function () {
          // JS API 수신 핸드셰이크 + 세션 사운드/배속 상태 반영
          try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: String(i), channel: 'widget' }), '*'); } catch (_) {}
          setTimeout(function () { if (i === cur) applyPrefs(); }, 600);
        });
        frame.appendChild(f);
      } else if (hasIframe) {
        frame.querySelector('iframe').remove();   // 비활성 → 언마운트 (포스터가 아래에 그대로)
      }
    });
  }
  // 자막(cc_load_policy) 은 URL 파라미터라 토글 시 활성 iframe 재마운트 필요
  function remountActive() {
    var f = activeIframe();
    if (f) { try { f.remove(); } catch (_) {} }
    mountActive();
  }
  function settle() {
    if (!wrap) return;
    var h = wrap.clientHeight || 1;
    var i = Math.max(0, Math.min(PLAY.length - 1, Math.round(wrap.scrollTop / h)));
    if (i !== cur) { cur = i; mountActive(); }
  }
  function advance() {
    if (!wrap || cur >= PLAY.length - 1) return;
    wrap.scrollTo({ top: (cur + 1) * wrap.clientHeight, behavior: 'smooth' });
  }

  // YouTube iframe API 메시지 — ENDED(0) → 다음 스크롤, onError(100/101/150) → 임베드 차단 폴백.
  //  · 귀속: 위젯이 echo 하는 d.id(load 핸드셰이크에서 등록한 슬라이드 인덱스)로 발신 슬라이드를
  //    특정 — 스와이프 직후 지연 도착한 이전 슬라이드 에러가 현재 슬라이드에 오귀속되던
  //    false positive("재생되는데 제한 문구") 방지 (2026-07 수정).
  //  · 자가 치유: PLAYING/BUFFERING 수신 = 실재생 증거 → 폴백 철회. 스퓨리어스 onError 가
  //    떠도 실제로 재생되는 영상엔 문구가 남지 않는다. 진짜 임베드 차단 영상은 재생 상태가
  //    영원히 안 오므로 폴백이 그대로 유지 — 이 원리를 깨뜨리지 말 것.
  function onMsg(e) {
    if (!overlay) return;
    if (!/(^https?:\/\/)([a-z0-9-]+\.)*(youtube(-nocookie)?\.com)$/.test(e.origin || '')) return;
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
    if (!d || typeof d !== 'object') return;
    var si = (d.id != null && wrap && wrap.children[Number(d.id)]) ? Number(d.id) : cur;
    var slide = wrap && wrap.children[si];
    if (!slide) return;
    var st = (d.event === 'onStateChange') ? Number(d.info)
           : (d.event === 'infoDelivery' && d.info && d.info.playerState != null) ? Number(d.info.playerState)
           : null;
    if (st != null) slide.__kvState = st;   // 스페이스 일시정지 토글용 최신 재생 상태
    // 사용자가 네이티브 컨트롤로 소리를 켜고/끈 것을 infoDelivery.muted 로 감지 → 다음 슬라이드로 이어짐.
    //  applyPrefs 가 이미 돈 활성 슬라이드에서만 신뢰(초기 mute 자동재생 상태를 '사용자 끔'으로 오해 방지).
    if (d.event === 'infoDelivery' && d.info && typeof d.info.muted === 'boolean' && si === cur && slide.__kvApplied) {
      soundOn = !d.info.muted;
    }
    if (st === 0 && si === cur && !slide.__kvEnded) {
      slide.__kvEnded = true;   // infoDelivery 중복 발화 dedupe
      advance();
      return;
    }
    if (st === 1 || st === 3) {   // PLAYING/BUFFERING — 오발화 에러로 떠 있던 폴백 철회
      var fb0 = slide.querySelector('.kv-fallback');
      if (fb0 && !fb0.hidden) fb0.hidden = true;
      return;
    }
    if (d.event === 'onError' && [100, 101, 150].indexOf(Number(d.info)) !== -1) {
      var fb = slide.querySelector('.kv-fallback');
      if (fb) fb.hidden = false;
    }
  }

  /* ── 설정 패널 (배속·자막) ── */
  function setPanel() { return overlay ? overlay.querySelector('.kv-set') : null; }
  function syncSetUI() {
    var p = setPanel();
    if (!p) return;
    p.querySelectorAll('[data-rate]').forEach(function (b) {
      b.classList.toggle('on', parseFloat(b.dataset.rate) === rate);
    });
    p.querySelectorAll('[data-cc]').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.cc === '1') === ccOn);
    });
  }
  function toggleSet() {
    var p = setPanel();
    if (!p) return;
    p.hidden = !p.hidden;
    if (!p.hidden) syncSetUI();
  }
  function hideSet() {
    var p = setPanel();
    if (p) p.hidden = true;
  }
  function setRate(r) {
    if ([0.5, 0.75, 1, 1.25, 1.5, 2].indexOf(r) === -1) return;
    rate = r;
    try { sessionStorage.setItem('koaus_vid_rate', String(r)); } catch (_) {}
    var f = activeIframe();
    if (f) sendCmd(f, 'setPlaybackRate', [r]);
    syncSetUI();
  }
  function setCc(on) {
    on = !!on;
    if (ccOn === on) { syncSetUI(); return; }
    ccOn = on;
    try { sessionStorage.setItem('koaus_vid_cc', on ? '1' : '0'); } catch (_) {}
    remountActive();   // cc_load_policy 는 URL 파라미터 — 재마운트로 반영
    syncSetUI();
  }

  var prevBodyOverflow = '';
  function openPlayer(startIdx) {
    if (!VIDEOS.length || overlay) return;
    soundOn = false;   // 새 세션은 항상 mute 시작 (제스처 없는 unMute = 모바일 재생 정지 방지)
    ga('home_video_open');
    unmountInline();         // 홈 인라인 재생 중지 (이중 재생 방지)
    PLAY = VIDEOS.slice();   // 재생 중 스냅샷 갱신이 슬라이드와 어긋나지 않게 고정
    overlay = document.createElement('div');
    overlay.className = 'kv-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '영상 플레이어');
    var slides = PLAY.map(function (v, i) {
      var watch = 'https://www.youtube.com/watch?v=' + v.id;
      return '<div class="kv-slide" data-i="' + i + '">' +
        '<div class="kv-bg" style="background-image:url(&quot;' + thumb(v.id) + '&quot;)"></div>' +
        '<div class="kv-frame"><div class="kv-poster" style="background-image:url(&quot;' + thumbHi(v.id) + '&quot;),url(&quot;' + thumb(v.id) + '&quot;)"></div></div>' +
        (hasCta(v)
          ? '<a class="kv-cta" href="' + esc(v.ctaUrl) + '" target="_blank" rel="noopener noreferrer nofollow">' +
              '<span class="kv-cta-txt">' + esc(v.ctaText) + '</span><b>›</b></a>'
          : '') +
        (v.title ? '<div class="kv-meta">' + esc(v.title) + '</div>' : '') +
        /* 우하단 액션 = 공유(유튜브에서 보기)만 — 소리·자막·설정은 탭 시 뜨는
           유튜브 네이티브 컨트롤이 담당(2026-07 사용자 확정, 중복 UI 제거) */
        '<div class="kv-actions">' +
          '<a class="kv-abtn" href="' + watch + '" target="_blank" rel="noopener noreferrer" aria-label="유튜브에서 보기(공유)">↗</a>' +
        '</div>' +
        '<div class="kv-fallback" hidden>' +
          '<p>이 영상은 앱 안 재생이 제한되어 있어요.</p>' +
          '<a href="' + watch + '" target="_blank" rel="noopener noreferrer">▶ 유튜브에서 보기</a>' +
        '</div>' +
      '</div>';
    }).join('');
    overlay.innerHTML =
      '<div class="kv-wrap">' + slides + '</div>' +
      /* 배속·자막·소리 설정은 유튜브 네이티브 컨트롤(탭 시 노출)로 일원화 —
         커스텀 설정 패널/‘탭하여 소리 켜기’ 힌트 제거(2026-07 사용자 확정) */
      '<button type="button" class="kv-back" aria-label="뒤로가기">‹</button>' +
      '<button type="button" class="kv-close" aria-label="닫기">✕</button>';
    document.body.appendChild(overlay);
    wrap = overlay.querySelector('.kv-wrap');

    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 시작 인덱스로 즉시 점프 후 마운트
    cur = Math.max(0, Math.min(PLAY.length - 1, startIdx | 0));
    wrap.scrollTop = cur * wrap.clientHeight;
    mountActive();

    wrap.addEventListener('scroll', function () {
      hideSet();
      clearTimeout(scrollT);
      scrollT = setTimeout(settle, 90);
    }, { passive: true });
    overlay.querySelector('.kv-close').addEventListener('click', function () { requestClose(); });
    overlay.querySelector('.kv-back').addEventListener('click', function () { requestClose(); });
    window.addEventListener('message', onMsg);
    document.addEventListener('keydown', onKey);
    try { history.pushState({ koausVideos: 1 }, ''); } catch (_) {}
    window.addEventListener('popstate', onPop);
  }
  function setSound(on) {
    soundOn = !!on;
    try { sessionStorage.setItem('koaus_vid_sound', soundOn ? '1' : '0'); } catch (_) {}
    applyPrefs();
  }
  function onKey(e) {
    // 스페이스 = 재생/일시정지 (데스크탑) — 포커스가 iframe 밖이라 YT 기본 단축키가 안 먹는 보완
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();   // 페이지/피드 스크롤 방지
      var s = wrap && wrap.children[cur];
      var f = activeIframe();
      if (f) sendCmd(f, (s && (s.__kvState === 1 || s.__kvState === 3)) ? 'pauseVideo' : 'playVideo');
      return;
    }
    if (e.key !== 'Escape') return;
    var p = setPanel();
    if (p && !p.hidden) { hideSet(); return; }   // 설정 열림 → 패널만 닫기
    requestClose();
  }
  // ✕/ESC → history.back() 으로 위임(푸시한 상태 제거) → popstate 가 실제 닫기 수행
  function requestClose() { try { history.back(); } catch (_) { closePlayer(); } }
  function onPop() { closePlayer(); }
  function closePlayer() {
    if (!overlay) return;
    window.removeEventListener('message', onMsg);
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = prevBodyOverflow;
    try { overlay.remove(); } catch (_) {}
    overlay = null; wrap = null; cur = -1; PLAY = [];
    scheduleInline(250);   // 홈 인라인 자동재생 복귀
  }

  /* ── 부트 — 반드시 모든 선언 이후(파일 최하단)에서 실행 ── */
  function boot() {
    host = document.getElementById('koausHomeVideos');
    if (!host) return;   // 홈 아님 — Firebase 구독 없이 조용히 종료 (빌링 0)
    init();
  }
  if (document.readyState === 'loading') {
    // module 은 defer 실행이라 보통 DOM 준비됨 — 안전망만
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
