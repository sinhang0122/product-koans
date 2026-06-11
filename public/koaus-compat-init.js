/*!
 * koaus-compat-init.js — compat SDK 체인(app → app-check → firestore) 직후,
 * koaus-ads.js 이전에 defer 로 로드해야 한다 (koaus-ads.js 는 실행 즉시
 * firebase.apps.length 를 검사하므로 그 전에 compat [DEFAULT] 앱이 있어야 함).
 * compat 번들은 ESM(모듈) 번들과 앱 레지스트리를 공유하지 않아 별도 init 필수.
 * App Check Enforce 환경 — 토큰 미첨부 시 Firestore 전면 차단되므로 activate 동반.
 */
(function () {
  if (!window.firebase || !firebase.initializeApp) return;
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
        authDomain: 'koaus-f564c.firebaseapp.com',
        projectId: 'koaus-f564c',
        storageBucket: 'koaus-f564c.firebasestorage.app',
        messagingSenderId: '663988594088',
        appId: '1:663988594088:web:ef30c2fd557407b00b299d',
      });
    }
    if (firebase.appCheck) {
      firebase.appCheck().activate('6Ld1mAwtAAAAADURkCq0J6GOr3wFg9DQVOsxVG5v', true);
    }
  } catch (e) {
    if (window.console) console.warn('[koaus] compat init 실패:', e && e.message);
  }
})();
