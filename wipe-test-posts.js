/**
 * KoAus — 테스트 글 일괄 삭제 (Admin SDK · 서버사이드)
 *   클라이언트 삭제 버그(window.koausIsAdmin 타이밍 / fsDocId 누락)를 우회해
 *   Firestore 게시판 글을 직접 삭제한다.
 * 실행:
 *   node wipe-test-posts.js            # dry-run — 삭제될 글 목록만 출력 (안전)
 *   node wipe-test-posts.js --delete   # 실제 삭제 (복구 불가)
 * ⚠️ 서비스 계정 키(*-firebase-adminsdk-*.json) 필요 — 로컬 전용, git 커밋 금지.
 */
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const SERVICE_ACCOUNT_FILE = './service-account-key.json';
function resolveKeyPath() {
  const explicit = path.resolve(__dirname, SERVICE_ACCOUNT_FILE);
  if (fs.existsSync(explicit)) return explicit;
  const auto = fs.readdirSync(__dirname).find(n => /firebase-adminsdk.*\.json$/i.test(n));
  return auto ? path.resolve(__dirname, auto) : null;
}
const keyPath = resolveKeyPath();
if (!keyPath) { console.error('✗ 서비스 계정 키를 찾을 수 없습니다 (setAdmin.js 와 동일 위치).'); process.exit(1); }
console.log('• 서비스 계정 키:', path.basename(keyPath));
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const BOARDS = ['accom_posts', 'rent_posts', 'jobs_posts', 'auto_posts', 'services'];
const DO_DELETE = process.argv.includes('--delete');
const label = d => (d.title || d.name || d.businessName || (d.content ? String(d.content).slice(0,30) : '') || '(제목없음)').replace(/\s+/g,' ').trim();

(async () => {
  let total = 0;
  for (const col of BOARDS) {
    const snap = await db.collection(col).get();
    console.log(`\n=== ${col} — ${snap.size}건 ===`);
    for (const docSnap of snap.docs) {
      const d = docSnap.data();
      console.log(`  • ${docSnap.id} | ${label(d)} | ${d.authorEmail || d.uid || '?'} | status=${d.status || '-'}`);
      total++;
      if (DO_DELETE) {
        const pd = await docSnap.ref.collection('private_data').get();
        for (const p of pd.docs) await p.ref.delete();
        await docSnap.ref.delete();
      }
    }
  }
  console.log(`\n총 ${total}건${DO_DELETE ? ' 삭제 완료 ✅' : ' (dry-run — 실제 삭제하려면 --delete 추가)'}`);
  process.exit(0);
})().catch(e => { console.error('✗ 실패:', e.message || e); process.exit(1); });
