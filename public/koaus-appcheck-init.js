// ════════════════════════════════════════════════════════════════════
//  KoAus · 공용 App Check 초기화 모듈 (reCAPTCHA v3)
//  - Firestore/Storage 가 App Check Enforce 상태 — 토큰 미첨부 = 전면 차단.
//  - marquee.js 최상단에서 side-effect import → 26개 전 페이지 커버
//    (자체 init 블록이 없는 index/points/contact/about 등 포함).
//  - 자체 init 이 이미 있는 페이지와 중복 호출돼도 안전: initializeAppCheck 는
//    동일 사이트 키 + 동일 isTokenAutoRefreshEnabled 면 기존 인스턴스를 반환.
//  - try/catch 필수 — 광고차단기 등으로 실패해도 importing 모듈을 죽이지 않는다.
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app-check.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain:        'koaus-f564c.firebaseapp.com',
  projectId:         'koaus-f564c',
  storageBucket:     'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId:             '1:663988594088:web:ef30c2fd557407b00b299d',
  measurementId:     'G-DERZ9MTKPL',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

if (!window.__koausAppCheckInited) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6Ld1mAwtAAAAADURkCq0J6GOr3wFg9DQVOsxVG5v'),
      isTokenAutoRefreshEnabled: true,
    });
    window.__koausAppCheckInited = true;
  } catch (e) {
    console.warn('[koaus] App Check init 실패:', e && e.message);
  }
}
