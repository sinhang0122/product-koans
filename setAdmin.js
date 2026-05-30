/**
 * KoAus(코오스) — Firebase 관리자 권한 부여 스크립트
 *
 * 실행 방법 (터미널에서 프로젝트 폴더 cd 후):
 *   1) npm install firebase-admin
 *   2) Firebase Console → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"으로 받은
 *      JSON 파일을 이 폴더에 배치하고, 아래 SERVICE_ACCOUNT_FILE 경로를 본인 파일명으로 맞춰주세요.
 *   3) node setAdmin.js
 *   4) 성공 후, admin.html 로그아웃 → 다시 로그인 (토큰 갱신 필요)
 *
 * ⚠️ 보안: 서비스 계정 키 JSON은 절대 git에 커밋하지 마세요. (.gitignore 에 자동 등록됨)
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// ─────────────────────────────────────────────────────────────
// 🔑 본인이 다운로드한 서비스 계정 키 파일명으로 수정하세요.
//    (Firebase Console에서 다운로드한 기본 이름은 보통 아래와 같은 형식입니다:
//     koaus-f564c-firebase-adminsdk-XXXXX-YYYYYYYY.json)
const SERVICE_ACCOUNT_FILE = './service-account-key.json';

// 관리자 권한을 부여할 이메일
const ADMIN_EMAIL = 'sinhang0122@gmail.com';
// ─────────────────────────────────────────────────────────────

// 명시된 파일이 있으면 우선 사용, 없으면 폴더에서 *-firebase-adminsdk-*.json 자동 감지
function resolveKeyPath() {
  const explicit = path.resolve(__dirname, SERVICE_ACCOUNT_FILE);
  if (fs.existsSync(explicit)) return explicit;
  const auto = fs.readdirSync(__dirname).find(n => /firebase-adminsdk.*\.json$/i.test(n));
  return auto ? path.resolve(__dirname, auto) : null;
}
const keyPath = resolveKeyPath();
if (!keyPath) {
  console.error('✗ 서비스 계정 키 파일을 찾을 수 없습니다.');
  console.error('  → service-account-key.json 또는 *-firebase-adminsdk-*.json 파일을');
  console.error('    이 폴더에 배치해 주세요:', __dirname);
  process.exit(1);
}
console.log('• 서비스 계정 키 사용:', path.basename(keyPath));

const serviceAccount = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

(async () => {
  try {
    console.log(`[1/3] '${ADMIN_EMAIL}' 사용자 조회 중...`);
    const user = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    console.log(`     ✓ uid = ${user.uid}`);

    console.log('[2/3] custom claim { admin: true } 부여 중...');
    // 기존 claim을 보존하고 admin만 덮어쓰기
    const prev = user.customClaims || {};
    await admin.auth().setCustomUserClaims(user.uid, { ...prev, admin: true });
    console.log('     ✓ 부여 완료');

    console.log('[3/3] 검증 중...');
    const refreshed = await admin.auth().getUser(user.uid);
    console.log('     ✓ 현재 customClaims =', refreshed.customClaims);

    console.log('\n🎉 완료! 다음 단계를 진행해 주세요:');
    console.log('   • admin.html에서 한 번 로그아웃 후 다시 로그인하면 새 토큰에 admin:true 가 반영됩니다.');
    console.log('   • firestore.rules 를 firebase deploy --only firestore:rules 로 배포하세요.');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ 실패:', err.message || err);
    if (err.code === 'auth/user-not-found') {
      console.error(`  → '${ADMIN_EMAIL}' 계정이 Firebase Auth에 존재하지 않습니다.`);
      console.error('    먼저 회원가입 폼(또는 Firebase Console)으로 해당 이메일을 등록해 주세요.');
    }
    process.exit(1);
  }
})();
