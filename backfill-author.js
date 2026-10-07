// backfill-author.js — 본인 기존 글 author 를 현재 별명으로 일괄 갱신 (Admin SDK, 1회용)
//   node backfill-author.js            # dry-run (바뀔 글 목록만)
//   node backfill-author.js --apply    # 실제 변경
const admin = require('firebase-admin');
const path = require('path'); const fs = require('fs');
const f = fs.readdirSync(__dirname).find(n => /firebase-adminsdk.*\.json$/i.test(n));
if (!f) { console.error('✗ 서비스계정 키 없음'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, f))) });
const db = admin.firestore();

const EMAIL = 'sinhang0122@gmail.com';
const COLS = ['accom_posts','rent_posts','jobs_posts','auto_posts','services'];
const APPLY = process.argv.includes('--apply');
const nickArg = (process.argv.find(a => a.startsWith('--nick=')) || '').slice(7);
const fromArg = (process.argv.find(a => a.startsWith('--from=')) || '').slice(7);   // 지정 시 그 author 인 글만 대상(나머지 보존)

(async () => {
  const user = await admin.auth().getUserByEmail(EMAIL);
  const uid = user.uid;
  const usnap = await db.collection('users').doc(uid).get();
  const nick = nickArg || (usnap.exists ? (usnap.data().nickname || '') : '');
  if (!nick) { console.error('✗ 현재 별명을 못 찾음 — --nick=shin 로 지정'); process.exit(1); }
  console.log(`• uid=${uid}  현재 별명="${nick}"`);
  let total = 0;
  for (const c of COLS) {
    const seen = new Set();
    for (const field of ['uid','authorId','authorUid']) {
      const snap = await db.collection(c).where(field, '==', uid).get();
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue; seen.add(d.id);
        const cur = d.data().author || '';
        if (cur === nick) continue;
        if (fromArg && cur !== fromArg) continue;   // --from 지정 시 그 author 만
        console.log(`  ${c}/${d.id}  author: "${cur}" → "${nick}"`);
        total++;
        if (APPLY) await d.ref.update({ author: nick });
      }
    }
  }
  console.log(`\n총 ${total}건${APPLY ? ' 갱신 완료 ✅' : ' (dry-run — 적용하려면 --apply)'}`);
  process.exit(0);
})().catch(e => { console.error('✗', e.message || e); process.exit(1); });
