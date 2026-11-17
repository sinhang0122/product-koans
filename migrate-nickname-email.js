/**
 * KoAus — nicknames/{닉네임} 문서의 email 필드 지우기 (2026-11-15 보안 점검)
 *
 * 왜: nicknames 문서는 가입 전 "이미 쓰는 닉네임인지" 확인 때문에 누구나 한 건씩 읽을 수 있다(규칙 allow get: if true).
 *     그런데 문서에 email 이 들어 있어, 글·채팅에 보이는 닉네임만 알면 그 회원의 이메일을 알 수 있었다.
 *     코드 어디에서도 이 email 을 읽지 않는다(이메일 색인은 emails/{email} 문서가 따로 있음).
 *     11-15 배포부터 새 문서에는 email 을 넣지 않는다. 이 스크립트는 이미 있는 문서에서 그 필드만 지운다.
 *
 * 사용:
 *   node migrate-nickname-email.js            → 세기만 한다(아무것도 바꾸지 않음)
 *   node migrate-nickname-email.js --apply    → email 필드 삭제(uid · nickname · createdAt 은 그대로)
 *
 * 준비: setAdmin.js 와 같다 — 이 폴더에 서비스 계정 키(service-account-key.json 또는 *-firebase-adminsdk-*.json).
 */
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

function resolveKeyPath() {
  const explicit = path.resolve(__dirname, './service-account-key.json');
  if (fs.existsSync(explicit)) return explicit;
  const auto = fs.readdirSync(__dirname).find(n => /firebase-adminsdk.*\.json$/i.test(n));
  return auto ? path.resolve(__dirname, auto) : null;
}
const keyPath = resolveKeyPath();
if (!keyPath) {
  console.error('✗ 서비스 계정 키 파일을 찾을 수 없습니다. (service-account-key.json 또는 *-firebase-adminsdk-*.json)');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

(async () => {
  let total = 0, withEmail = 0, changed = 0, last = null;
  for (;;) {
    let q = db.collection('nicknames').orderBy(admin.firestore.FieldPath.documentId()).limit(300);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    const batch = db.batch(); let n = 0;
    for (const d of page.docs) {
      total++;
      if (Object.prototype.hasOwnProperty.call(d.data() || {}, 'email')) {
        withEmail++;
        if (APPLY) { batch.update(d.ref, { email: admin.firestore.FieldValue.delete() }); n++; }
      }
    }
    if (APPLY && n) { await batch.commit(); changed += n; }
    last = page.docs[page.docs.length - 1];
    if (page.size < 300) break;
  }
  console.log(`nicknames 문서 ${total}개 중 email 필드가 있는 문서: ${withEmail}개`);
  console.log(APPLY ? `→ ${changed}개 문서에서 email 필드를 지웠습니다.` : '→ 세기만 했습니다(바꾼 것 없음). 지우려면: node migrate-nickname-email.js --apply');
  process.exit(0);
})().catch(e => { console.error('✗ 실패:', e && e.message || e); process.exit(1); });
