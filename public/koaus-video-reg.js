// ════════════════════════════════════════════════════════════════════
//  KoAus · 영상 등록 모달 (마이페이지 전용 진입점 · ES module)
//  - 2026-07 분리: 홈(koaus-home-videos.js)의 ＋ 등록 버튼 폐지 → 등록은 마이페이지에서만.
//    mypage.html 이 이 모듈을 로드하고, 진입 버튼이 window.koausVideoReg.open() 호출.
//  - 흐름: 로그인 게이트(window.koausAuth) → URL 붙여넣기 모달 →
//    addDoc { videoId, url(canonical watch), title, status:'pending', authorUid,
//             createdAt:serverTimestamp, [ctaText, ctaUrl] }
//    · 제목 미입력 시 oEmbed(https://www.youtube.com/oembed) best-effort 자동 취득
//    · 임베드 사전 검사 (2026-07): 등록 직전 숨김 테스트 플레이어로 실재생 판정 —
//      퍼가기 차단(101/150)·연령 제한 19+(150 — 유튜브 정책상 임베드 재생 불가)·
//      삭제/비공개(100) 영상은 등록 자체를 거부. 제한은 영상 단위라 같은 채널의
//      전체연령 영상은 정상 통과. 타임아웃은 fail-open(승인 큐가 2차 게이트).
//    · 리다이렉트/CTA(선택, UI 라벨 "리다이렉트 제목/URL"): 제목+URL 세트 입력 —
//      rules 가 ctaText ≤60 / ctaUrl **유튜브 링크만**(https·≤300 — 2026-07 도메인 제한,
//      이전 '어디든' 정책 폐기), 운영자가 승인 큐에서 링크 검토 후 승인
//    · 60초 초과/부적절 영상은 운영자 검토 단계에서 거르는 정책 (v1: Data API 미사용)
//  - rules: status 'pending' 강제(자가 승인 차단) + createdAt == request.time
//  - 내 등록 영상 (2026-07): mypage `#mpMyVideos` 를 본인 영상 구독으로 hydrate —
//    where('authorUid','==',uid)+orderBy('createdAt','desc')+limit(20)
//    (rules limitedList ≤20 · videos(authorUid ASC, createdAt DESC) 복합 인덱스 필수)
//    · 상태 칩: pending=승인 대기 / approved=게시 중 · 본인 삭제(deleteDoc — rules 기허용)
// ════════════════════════════════════════════════════════════════════
import './koaus-appcheck-init.js';   // App Check 공용 init — Enforce 차단 방지
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

(function () {
  'use strict';
  if (window.koausVideoReg) return;

  var firebaseConfig = {
    apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
    authDomain: 'koaus-f564c.firebaseapp.com',
    projectId: 'koaus-f564c',
    storageBucket: 'koaus-f564c.firebasestorage.app',
    messagingSenderId: '663988594088',
    appId: '1:663988594088:web:ef30c2fd557407b00b299d',
    measurementId: 'G-DERZ9MTKPL',
  };
  var db = null, me = null;
  try {
    var app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    onAuthStateChanged(getAuth(app), function (u) { me = u; startMyVideos(); maybeAutoOpen(); });
  } catch (e) {
    try { console.warn('[koaus-video-reg] init 실패:', e); } catch (_) {}
  }

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
  function ga(ev) { try { if (typeof gtag === 'function') gtag('event', ev); } catch (_) {} }

  function injectCss() {
    if (document.getElementById('koaus-video-reg-style')) return;
    var css =
      '.kv-reg-overlay{position:fixed;inset:0;z-index:99900;background:rgba(0,0,0,.55);' +
        'display:flex;align-items:center;justify-content:center;padding:18px;}' +
      '.kv-reg{width:100%;max-width:420px;background:var(--bg-card,#fff);border-radius:18px;' +
        'padding:20px 18px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 18px 60px rgba(0,0,0,.28);' +
        'max-height:86vh;overflow-y:auto;}' +
      '.kv-reg h3{margin:0 0 6px;font-size:17px;font-weight:800;letter-spacing:-.3px;color:var(--text-primary,#111);}' +
      '.kv-reg .kv-reg-guide{margin:0 0 14px;font-size:12.5px;line-height:1.65;color:var(--text-muted,#6b7280);}' +
      '.kv-reg label{display:block;font-size:12px;font-weight:700;color:var(--text-secondary,#374151);margin:10px 0 5px;}' +
      '.kv-reg input[type="text"],.kv-reg input[type="url"]{width:100%;box-sizing:border-box;border:1px solid var(--border,#d1d5db);' +
        'border-radius:10px;padding:11px 12px;font-size:14px;background:var(--bg-subtle,#fafafa);color:var(--text-primary,#111);}' +
      '.kv-reg .kv-reg-sub{margin:2px 0 0;font-size:11px;line-height:1.5;color:var(--text-muted,#9ca3af);}' +
      '.kv-reg .kv-consent{display:flex;gap:8px;align-items:flex-start;margin:14px 0 0;font-size:11.5px;' +
        'line-height:1.55;color:var(--text-muted,#6b7280);}' +
      '.kv-reg .kv-consent input{margin-top:2px;flex:0 0 auto;}' +
      '.kv-reg .kv-reg-actions{display:flex;gap:8px;margin-top:14px;}' +
      '.kv-reg .kv-reg-actions button{flex:1;border:0;border-radius:12px;padding:13px 0;font-size:14px;font-weight:800;' +
        'cursor:pointer;-webkit-tap-highlight-color:transparent;}' +
      '.kv-reg .kv-reg-cancel{background:var(--bg-subtle,#f3f4f6);color:var(--text-secondary,#374151);}' +
      '.kv-reg .kv-reg-submit{background:var(--primary,#111);color:#fff;}' +
      '.kv-reg .kv-reg-submit[disabled]{opacity:.55;cursor:default;}' +
      /* 내 등록 영상 (mypage #mpMyVideos) */
      '#mpMyVideos{margin:10px 0 4px;}' +
      '#mpMyVideos .kv-my-head{font-size:12.5px;font-weight:800;color:var(--text-secondary,#374151);margin:0 0 8px;}' +
      '.kv-my-row{display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;' +
        'border:1px solid var(--border,#e5e7eb);border-radius:12px;background:var(--bg-card,#fff);}' +
      '.kv-my-thumb{width:56px;height:42px;object-fit:cover;border-radius:8px;flex:0 0 auto;background:#e5e7eb;}' +
      '.kv-my-info{flex:1;min-width:0;}' +
      '.kv-my-title{font-size:13px;font-weight:700;color:var(--text-primary,#111);' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.kv-my-sub{font-size:11px;color:var(--text-muted,#8e8e93);margin-top:3px;display:flex;align-items:center;gap:6px;}' +
      '.kv-my-chip{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;}' +
      '.kv-my-chip--pending{background:#fef3c7;color:#b45309;}' +
      '.kv-my-chip--approved{background:#dcfce7;color:#15803d;}' +
      '.kv-my-del{flex:0 0 auto;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;font-size:11.5px;' +
        'font-weight:800;padding:6px 10px;border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent;}' +
      '.kv-my-del[disabled]{opacity:.5;cursor:default;}';
    var style = document.createElement('style');
    style.id = 'koaus-video-reg-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  var regOverlay = null;
  function open() {
    var user = me || (window.koausAuth && window.koausAuth.user) || null;
    if (!user) {
      alert('영상을 등록하려면 로그인이 필요합니다.');
      try {
        if (window.koausAuth && typeof window.koausAuth.openAuthModal === 'function') window.koausAuth.openAuthModal();
      } catch (_) {}
      return;
    }
    openRegModal();
  }
  function openRegModal() {
    if (regOverlay) return;
    injectCss();
    ga('home_video_reg_open');
    regOverlay = document.createElement('div');
    regOverlay.className = 'kv-reg-overlay';
    regOverlay.innerHTML =
      '<div class="kv-reg" role="dialog" aria-label="영상 등록">' +
        '<h3>🎬 영상 등록</h3>' +
        '<p class="kv-reg-guide">유튜브 영상 링크를 붙여넣어 주세요.<br>' +
          '· <b>60초 이하 세로(쇼츠) 영상</b>만 승인돼요<br>' +
          '· 운영자 검토(승인) 후 홈에 게시됩니다</p>' +
        '<label for="kvRegUrl">유튜브 링크 <span style="color:#e11d48">*</span></label>' +
        '<input type="url" id="kvRegUrl" inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/shorts/...">' +
        '<label for="kvRegTitle">제목 (비우면 유튜브 제목 자동 사용)</label>' +
        '<input type="text" id="kvRegTitle" maxlength="100" autocomplete="off" placeholder="예: 시드니 브이로그">' +
        '<label for="kvRegCtaText">리다이렉트 제목 (선택)</label>' +
        '<input type="text" id="kvRegCtaText" maxlength="60" autocomplete="off" placeholder="예: 우리 가게 보러가기">' +
        '<label for="kvRegCtaUrl">리다이렉트 URL (선택 · 유튜브 링크만)</label>' +
        '<input type="url" id="kvRegCtaUrl" inputmode="url" autocomplete="off" placeholder="예: https://www.youtube.com/@채널명">' +
        '<p class="kv-reg-sub">제목+URL을 함께 입력하면 풀스크린 영상 하단에 "제목 ›" 버튼이 생기고, 탭하면 그 링크로 이동해요. URL은 유튜브 링크(영상·채널)만 가능하며, 링크도 운영자 검토 대상입니다.</p>' +
        '<label class="kv-consent"><input type="checkbox" id="writeConsent">' +
          '<span>[필수] 이용약관 및 주의사항을 확인하였으며, 서비스 규정 위반 시 게시물 삭제 및 계정 제재가 이루어질 수 있음에 동의합니다.</span></label>' +
        '<div class="kv-reg-actions">' +
          '<button type="button" class="kv-reg-cancel">취소</button>' +
          '<button type="button" class="kv-reg-submit">등록</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(regOverlay);
    regOverlay.addEventListener('click', function (e) { if (e.target === regOverlay) closeRegModal(); });
    regOverlay.querySelector('.kv-reg-cancel').addEventListener('click', closeRegModal);
    regOverlay.querySelector('.kv-reg-submit').addEventListener('click', submitVideo);
    document.addEventListener('keydown', onRegKey);
    setTimeout(function () { var i = document.getElementById('kvRegUrl'); if (i) i.focus(); }, 60);
  }
  function onRegKey(e) { if (e.key === 'Escape') closeRegModal(); }
  function closeRegModal() {
    if (!regOverlay) return;
    document.removeEventListener('keydown', onRegKey);
    try { regOverlay.remove(); } catch (_) {}
    regOverlay = null;
  }
  // oEmbed 제목 자동 취득 — best-effort (실패해도 등록 진행)
  function fetchTitle(watchUrl) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(''); } }, 2500);
      fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(watchUrl))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (!done) { done = true; clearTimeout(t); resolve((j && j.title) || ''); } })
        .catch(function () { if (!done) { done = true; clearTimeout(t); resolve(''); } });
    });
  }
  // 임베드 재생 사전 검사 (2026-07) — 숨김 테스트 플레이어를 잠깐 띄워 실재생 여부를 판정.
  //  · PLAYING/BUFFERING 수신 = 재생 가능 → 등록 진행 / onError = 등록 거부
  //    (100 = 삭제·비공개 / 101·150 = 퍼가기 차단 또는 연령 제한 19+ — 유튜브 정책상
  //     연령 제한 영상은 임베드 재생 자체가 불가해 이 검사로 함께 걸러진다.
  //     제한은 영상 단위 — 같은 채널의 전체연령 영상은 정상 통과.)
  //  · 타임아웃(8s)은 등록 허용(fail-open) — 네트워크 순단이 정상 등록을 막지 않게.
  //    운영자 승인 큐(2차) + 홈 플레이어 폴백(3차)이 뒤를 받친다. fail-closed 로 바꾸지 말 것.
  //  · frame-src CSP 는 전역 헤더(firebase.json `**`)에 youtube-nocookie 기포함 — 추가 설정 불요.
  function checkEmbeddable(id) {
    return new Promise(function (resolve) {
      var f = document.createElement('iframe');
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        window.removeEventListener('message', onM);
        try { f.remove(); } catch (_) {}
        resolve(v);
      }
      function onM(e) {
        if (e.source !== f.contentWindow) return;   // 이 테스트 iframe 발신 메시지만 (타 임베드 배제)
        if (!/(^https?:\/\/)([a-z0-9-]+\.)*(youtube(-nocookie)?\.com)$/.test(e.origin || '')) return;
        var d = e.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
        if (!d || typeof d !== 'object') return;
        var st = (d.event === 'onStateChange') ? Number(d.info)
               : (d.event === 'infoDelivery' && d.info && d.info.playerState != null) ? Number(d.info.playerState)
               : null;
        if (st === 1 || st === 3) { finish({ ok: true }); return; }
        if (d.event === 'onError' && [100, 101, 150].indexOf(Number(d.info)) !== -1) {
          finish({ ok: false, code: Number(d.info) });
        }
      }
      var t = setTimeout(function () { finish({ ok: true, timeout: true }); }, 8000);
      window.addEventListener('message', onM);
      f.setAttribute('allow', 'autoplay; encrypted-media');
      f.setAttribute('tabindex', '-1');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-9999px;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;border:0;';
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
              '?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1';
      f.addEventListener('load', function () {
        try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'kvchk', channel: 'widget' }), '*'); } catch (_) {}
      });
      document.body.appendChild(f);
    });
  }
  function submitVideo() {
    if (!regOverlay) return;
    var user = me || (window.koausAuth && window.koausAuth.user) || null;
    var _consent = document.getElementById('writeConsent');
    if (!_consent || !_consent.checked) {
      alert('이용약관 및 주의사항 동의(필수)에 체크해 주세요.');
      if (_consent) { _consent.focus(); _consent.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (!user) { closeRegModal(); open(); return; }
    var urlEl = document.getElementById('kvRegUrl');
    var id = vid(urlEl && urlEl.value);
    if (!id) {
      alert('유튜브 링크를 확인해 주세요.\n예: https://www.youtube.com/shorts/... 또는 https://youtu.be/...');
      if (urlEl) urlEl.focus();
      return;
    }
    // 리다이렉트(CTA) — 제목+URL 세트 강제 (한쪽만 있으면 렌더 불가),
    // URL 은 유튜브 링크만 (2026-07 도메인 제한 — rules 패턴과 동일 기준)
    var ctaText = String((document.getElementById('kvRegCtaText') || {}).value || '').trim().slice(0, 60);
    var ctaUrl  = String((document.getElementById('kvRegCtaUrl')  || {}).value || '').trim();
    if ((ctaText && !ctaUrl) || (!ctaText && ctaUrl)) {
      alert('리다이렉트는 제목과 URL을 함께 입력해 주세요. (한쪽만 입력됨)');
      return;
    }
    if (ctaUrl && !/^https:\/\/((www\.|m\.)?youtube\.com|youtu\.be)\/.+/.test(ctaUrl)) {
      alert('리다이렉트 URL은 유튜브 링크만 가능합니다.\n예: https://www.youtube.com/@채널명 또는 https://youtu.be/...');
      return;
    }
    if (ctaUrl.length > 300) {
      alert('리다이렉트 URL이 너무 깁니다. (300자 이하)');
      return;
    }
    var btn = regOverlay.querySelector('.kv-reg-submit');
    btn.disabled = true;
    btn.textContent = '영상 확인 중…';
    var watchUrl = 'https://www.youtube.com/watch?v=' + id;   // canonical — rules URL 패턴 항상 통과
    var titleEl = document.getElementById('kvRegTitle');
    var manual = String((titleEl && titleEl.value) || '').trim();
    checkEmbeddable(id).then(function (chk) {
      if (!chk.ok) {   // 임베드 재생 불가 — 등록 자체를 거부 (홈에서 어차피 재생 안 됨)
        alert(chk.code === 100
          ? '영상을 찾을 수 없어요.\n삭제되었거나 비공개로 전환된 영상입니다.'
          : '이 영상은 유튜브 밖(임베드) 재생이 차단되어 있어 등록할 수 없어요.\n채널이 퍼가기를 막았거나 연령 제한(19+) 영상인 경우예요.');
        btn.disabled = false;
        btn.textContent = '등록';
        return null;   // 체인 중단 — 아래 등록 단계 스킵
      }
      btn.textContent = '등록 중...';
      return (manual ? Promise.resolve(manual) : fetchTitle(watchUrl)).then(function (title) {
        var payload = {
          videoId: id,
          url: watchUrl,
          title: String(title || '').slice(0, 200),
          status: 'pending',            // rules 강제 — 운영자 승인 후 노출
          authorUid: user.uid,
          createdAt: serverTimestamp(), // rules: createdAt == request.time
        };
        if (ctaText && ctaUrl) { payload.ctaText = ctaText; payload.ctaUrl = ctaUrl; }
        return addDoc(collection(db, 'videos'), payload);
      }).then(function () {
        ga('home_video_submit');
        closeRegModal();
        alert('접수 완료! 운영자 검토(승인) 후 홈에 게시됩니다. 🎬\n아래 "내 등록 영상"에서 상태 확인·삭제할 수 있어요.');
      });
    }).catch(function (err) {
      var code = (err && err.code) || '';
      if (code.indexOf('permission-denied') !== -1) {
        alert('등록 권한이 없습니다.\n본인 인증이 완료된 계정인지, 이용 제한 상태가 아닌지 확인해 주세요.');
      } else {
        alert('등록에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      btn.disabled = false;
      btn.textContent = '등록';
    });
  }

  /* ── 내 등록 영상 — mypage #mpMyVideos hydrate (본인 구독 + 삭제) ── */
  var myUnsub = null;
  function fmtDate(ts) {
    try {
      var d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
      return d ? (d.getMonth() + 1) + '/' + d.getDate() : '';
    } catch (_) { return ''; }
  }
  function startMyVideos() {
    var box = document.getElementById('mpMyVideos');
    if (!box || !db) return;   // mypage 아님 → 구독 없음 (빌링 0)
    if (myUnsub) { try { myUnsub(); } catch (_) {} myUnsub = null; }
    if (!me) { box.hidden = true; box.innerHTML = ''; return; }
    try {
      // rules: 본인(authorUid==uid) list 허용 + limitedList ≤20 — where 가 이를 정적으로 증명.
      // ⚠️ videos(authorUid ASC, createdAt DESC) 복합 인덱스 필수 (누락 시 FAILED_PRECONDITION)
      var q = query(collection(db, 'videos'),
                    where('authorUid', '==', me.uid),
                    orderBy('createdAt', 'desc'),
                    limit(20));
      myUnsub = onSnapshot(q, function (snap) {
        renderMyVideos(box, snap);
      }, function (err) {
        try { console.warn('[koaus-video-reg] 내 영상 구독 실패:', err && err.code); } catch (_) {}
        box.hidden = true;
      });
    } catch (e) {
      try { console.warn('[koaus-video-reg] 내 영상 init 실패:', e); } catch (_) {}
    }
  }
  function renderMyVideos(box, snap) {
    injectCss();
    var rows = [];
    snap.forEach(function (d) {
      var v = d.data() || {};
      var id = vid(v.videoId || v.url || '');
      var approved = v.status === 'approved';
      var dt = fmtDate(v.createdAt);
      rows.push(
        '<div class="kv-my-row">' +
          '<img class="kv-my-thumb" src="https://i.ytimg.com/vi/' + esc(id) + '/default.jpg" alt="" loading="lazy">' +
          '<div class="kv-my-info">' +
            '<div class="kv-my-title">' + esc(v.title || '(제목 없음)') + '</div>' +
            '<div class="kv-my-sub">' +
              '<span class="kv-my-chip kv-my-chip--' + (approved ? 'approved' : 'pending') + '">' +
                (approved ? '게시 중' : '승인 대기') + '</span>' +
              (dt ? '<span>' + dt + ' 등록</span>' : '') +
            '</div>' +
          '</div>' +
          '<button type="button" class="kv-my-del" data-kv-del="' + esc(d.id) + '"' +
            (approved ? ' data-kv-approved="1"' : '') + '>삭제</button>' +
        '</div>');
    });
    if (!rows.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<div class="kv-my-head">🎬 내 등록 영상 (' + rows.length + ')</div>' + rows.join('');
    box.hidden = false;
  }
  function onDelClick(btn) {
    var docId = btn.getAttribute('data-kv-del');
    if (!docId || !db) return;
    var msg = btn.getAttribute('data-kv-approved')
      ? '이 영상을 삭제할까요?\n게시 중인 영상은 홈에서도 즉시 내려갑니다.'
      : '이 영상(승인 대기)을 삭제할까요?';
    if (!confirm(msg)) return;
    btn.disabled = true;
    deleteDoc(doc(db, 'videos', docId)).then(function () {
      ga('home_video_self_delete');   // onSnapshot 이 목록 자동 갱신
    }).catch(function (err) {
      btn.disabled = false;
      var code = (err && err.code) || '';
      alert(code.indexOf('permission-denied') !== -1
        ? '삭제 권한이 없습니다. (본인 영상만 삭제 가능)'
        : '삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    });
  }

  /* ── 탭바 영상 탭 딥링크(settings.html?video=1) 자동 오픈 ──
     로그인 확인 후 등록 모달을 자동으로 열고 영상 섹션으로 스크롤.
     한 번만 실행(플래그) — onAuth 재발화·재로그인에도 재오픈 방지. */
  var autoOpened = false;
  function maybeAutoOpen() {
    if (autoOpened) return;
    try {
      if (new URLSearchParams(location.search).get('video') !== '1') return;
    } catch (_) { return; }
    if (!me) return;              // 로그인 확정 전 — 다음 auth 콜백에서 재시도
    autoOpened = true;
    var scrollToVideos = function () {
      var anchor = document.getElementById('mpVideoRegBtn') || document.getElementById('mpMyVideos');
      if (anchor) { try { anchor.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {} }
    };
    var run = function () { scrollToVideos(); open(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else setTimeout(run, 60);
  }

  window.koausVideoReg = { open: open };

  // 진입 버튼/삭제 버튼 위임 바인딩 — innerHTML 교체와 무관하게 동작
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-koaus-video-reg]');
    if (b) { e.preventDefault(); open(); return; }
    var del = e.target && e.target.closest && e.target.closest('[data-kv-del]');
    if (del) { e.preventDefault(); onDelClick(del); }
  }, true);
})();
