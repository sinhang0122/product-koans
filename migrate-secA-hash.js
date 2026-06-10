// ════════════════════════════════════════════════════════════════════
//  KoAus · H3 보안답변 평문 → PBKDF2 해시 일괄 마이그레이션 (1회성 운영 스크립트)
//  · 파라미터는 public/auth-extra.js hashSecA() 와 반드시 동일: PBKDF2-SHA256 / 150000 iter / 32B / salt 16B
//  · 사용법:  node migrate-secA-hash.js --dry-run   (변경 없이 대상 보고만)
//             node migrate-secA-hash.js             (본 실행)
//  · 대상: users(securityA→해시 3필드), emails(동일), nicknames(securityA 필드 삭제만 — 미사용 미러)
// ════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

const DRY = process.argv.includes('--dry-run');
const SECA_ITER = 150000;

const keyFile = fs.readdirSync(__dirname).find(f => /^koaus-f564c-firebase-adminsdk-.*\.json$/.test(f))
  || 'service-account-key.json';
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, keyFile))) });
const db = admin.firestore();

function hashSecA(plain, saltHex) {
  return crypto.pbkdf2Sync(String(plain), Buffer.from(saltHex, 'hex'), SECA_ITER, 32, 'sha256').toString('hex');
}
const maskId = id => id.length <= 4 ? id[0] + '***' : id.slice(0, 3) + '***' + id.slice(-2);

async function migrateHashColl(coll) {
  const snap = await db.collection(coll).get();
  let toMigrate = 0, alreadyHashed = 0, noField = 0;
  const batch = db.batch();
  for (const d of snap.docs) {
    const v = d.data();
    if ('securityA' in v) {
      toMigrate++;
      // 해시 생성은 의미 있는 평문(비어있지 않은 string)일 때만 — 빈 값/비문자열은 필드 삭제만
      const hashable = typeof v.securityA === 'string' && v.securityA.length && !v.securityAHash;
      const fields = hashable
        ? ['securityA(삭제)', '+securityAHash', '+securityASalt', '+securityAIter']
        : ['securityA(삭제만 — ' + (v.securityAHash ? '해시 이미 존재' : '빈 값/비문자열') + ')'];
      console.log(`  [${coll}/${maskId(d.id)}] ${fields.join(', ')}`);
      if (!DRY) {
        const upd = { securityA: admin.firestore.FieldValue.delete() };
        if (hashable) {
          const salt = crypto.randomBytes(16).toString('hex');
          upd.securityAHash = hashSecA(v.securityA, salt);
          upd.securityASalt = salt;
          upd.securityAIter = SECA_ITER;
        }
        batch.update(d.ref, upd);
      }
    } else if (v.securityAHash) alreadyHashed++;
    else noField++;
  }
  if (!DRY && toMigrate) await batch.commit();
  console.log(`  → ${coll}: 총 ${snap.size} doc | 마이그레이션 대상 ${toMigrate} | 해시 기존재 ${alreadyHashed} | securityA 없음 ${noField}`);
  return toMigrate;
}

async function migrateNicknames() {
  const snap = await db.collection('nicknames').get();
  let toClean = 0;
  const batch = db.batch();
  for (const d of snap.docs) {
    if ('securityA' in d.data()) {
      toClean++;
      console.log(`  [nicknames/${maskId(d.id)}] securityA(삭제 — 미사용 미러, 해시 불필요)`);
      if (!DRY) batch.update(d.ref, { securityA: admin.firestore.FieldValue.delete() });
    }
  }
  if (!DRY && toClean) await batch.commit();
  console.log(`  → nicknames: 총 ${snap.size} doc | 평문 미러 삭제 대상 ${toClean}`);
  return toClean;
}

async function verify() {
  let leftovers = 0;
  for (const coll of ['users', 'emails', 'nicknames']) {
    const snap = await db.collection(coll).get();
    for (const d of snap.docs) {
      if ('securityA' in d.data()) { leftovers++; console.log(`  ⚠️ 평문 잔존: ${coll}/${maskId(d.id)}`); }
    }
  }
  console.log(leftovers === 0 ? '  ✅ 평문 securityA 잔존 0건' : `  ❌ 평문 잔존 ${leftovers}건`);
  return leftovers;
}

(async () => {
  console.log(DRY ? '=== DRY-RUN (변경 없음) ===' : '=== 본 실행 ===');
  const a = await migrateHashColl('users');
  const b = await migrateHashColl('emails');
  const c = await migrateNicknames();
  console.log(`합계 변경 대상: ${a + b + c}건`);
  if (!DRY) {
    console.log('--- 실행 후 잔존 검증 ---');
    const left = await verify();
    process.exit(left === 0 ? 0 : 2);
  }
  process.exit(0);
})().catch(e => { console.error('실패:', e); process.exit(1); });
