// ════════════════════════════════════════════════════════════════════
//  KoAus · 관리자(custom claim admin: true) 권한 확인 시 body.is-admin 토글
//  - 각 페이지 head 에 <script type="module" src="admin-mark.js"></script> 로 로드
//  - .admin-only 컨텍스트 버튼/요소가 자동 노출
// ════════════════════════════════════════════════════════════════════
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
  authDomain: 'koaus-f564c.firebaseapp.com',
  projectId: 'koaus-f564c',
  storageBucket: 'koaus-f564c.firebasestorage.app',
  messagingSenderId: '663988594088',
  appId: '1:663988594088:web:ef30c2fd557407b00b299d',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

function setAdmin(flag) {
  document.body.classList.toggle('is-admin', !!flag);
}

onAuthStateChanged(auth, async user => {
  if (!user) { setAdmin(false); return; }
  try {
    const t = await user.getIdTokenResult();
    setAdmin(!!(t.claims && t.claims.admin));
  } catch (e) {
    console.warn('[admin-mark] custom claim 조회 실패', e);
    setAdmin(false);
  }
});
