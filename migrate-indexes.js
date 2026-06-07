/**
 * KoAus(코오스) — nicknames/emails 인덱스 1회용 마이그레이션 스크립트
 *
 * 목적:
 *   users 컬렉션을 순회하며 누락된 nicknames/{nick}, emails/{email} 색인 doc 을
 *   원자적 트랜잭션으로 backfill. 재실행 안전 (이미 있는 doc 은 건너뜀).
 *
 * 실행:
 *   node migrate-indexes.js              # 실제 backfill
 *   node migrate-indexes.js --dry-run    # 변경 사항 시뮬레이션 (write 0건)
 *
 * 사전 준비 (setAdmin.js 와 동일 — 같은 키 파일 재사용 가능):
 *   1) npm install firebase-admin   (이미 설치됨 — package.json dependency)
 *   2) Firebase Console > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성"
 *      → 받은 JSON 을 이 폴더(루트)에 배치
 *      → service-account-key.json 또는 koaus-f564c-firebase-adminsdk-*.json
 *
 * ⚠️ 서비스 계정 키 JSON 은 .gitignore 처리됨. 절대 커밋 금지.
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// ── CLI 인자 ──
const DRY_RUN = process.argv.includes('--dry-run');

// ── 튜닝 파라미터 ──
const PAGE_SIZE   = 500;   // users 컬렉션 페이지 사이즈 (Firestore 권장 ≤ 500)
const CONCURRENCY = 20;    // 동시 트랜잭션 (Firestore RPS 보호 + 메모리 안정)

// ── 서비스 계정 키 자동 감지 (setAdmin.js 패턴 재사용) ──
const SERVICE_ACCOUNT_FILE = './service-account-key.json';
function resolveKeyPath() {
  const explicit = path.resolve(__dirname, SERVICE_ACCOUNT_FILE);
  if (fs.existsSync(explicit)) return explicit;
  const auto = fs.readdirSync(__dirname).find(n => /firebase-adminsdk.*\.json$/i.test(n));
  return auto ? path.resolve(__dirname, auto) : null;
}

const keyPath = resolveKeyPath();
if (!keyPath) {
  console.error('✗ 서비스 계정 키 파일을 찾을 수 없습니다.');
  console.error('  → service-account-key.json 또는 *-firebase-adminsdk-*.json 을');
  console.error('    이 폴더에 배치하세요:', __dirname);
  process.exit(1);
}

const serviceAccount = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  KoAus · nicknames/emails 인덱스 마이그레이션');
console.log(DRY_RUN ? '  *** DRY RUN — 실제 write 는 발생하지 않습니다 ***' : '  모드: 실제 backfill');
console.log('  키:      ' + path.basename(keyPath));
console.log('  프로젝트: ' + (serviceAccount.project_id || '?'));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

/**
 * 단일 user 마이그레이션 — 본인의 nicknames/emails 인덱스 doc 을
 * 트랜잭션 1회로 원자적 backfill.
 *
 * 반환: { nickCreated, emailCreated, nickAlreadyOk, emailAlreadyOk, skipped }
 * 충돌(다른 uid 가 해당 nick/email 점유 중)은 예외 throw → 호출부에서 에러 로그.
 */
async function migrateUser(uid, userData) {
  const lowEmail = String(userData.email || '').toLowerCase().trim();
  const lowNick  = String(userData.nickname || '').toLowerCase().trim();

  if (!lowEmail && !lowNick) {
    return { skipped: 'no_email_no_nickname' };
  }

  const out = {
    nickCreated: false, emailCreated: false,
    nickAlreadyOk: false, emailAlreadyOk: false,
  };

  await db.runTransaction(async tx => {
    // 트랜잭션 재시도 시 outer 변수 초기화 — 마지막 commit 값만 반영
    let _nc = false, _ec = false, _nok = false, _eok = false;

    const nickRef  = lowNick  ? db.collection('nicknames').doc(lowNick)  : null;
    const emailRef = lowEmail ? db.collection('emails').doc(lowEmail)    : null;

    // ── Reads (모든 read 가 write 보다 앞서야 함 — Firestore TX 룰) ──
    const nickSnap  = nickRef  ? await tx.get(nickRef)  : null;
    const emailSnap = emailRef ? await tx.get(emailRef) : null;

    // ── 충돌 검증 ──
    if (nickSnap && nickSnap.exists) {
      const ownerUid = nickSnap.data().uid;
      if (ownerUid !== uid) {
        throw new Error(`NICK_COLLISION: nicknames/${lowNick} owned by ${ownerUid}`);
      }
      _nok = true;
    }
    if (emailSnap && emailSnap.exists) {
      const ownerUid = emailSnap.data().uid;
      if (ownerUid !== uid) {
        throw new Error(`EMAIL_COLLISION: emails/${lowEmail} owned by ${ownerUid}`);
      }
      _eok = true;
    }

    // ── Writes ──
    if (nickRef && !nickSnap.exists) {
      if (!DRY_RUN) tx.set(nickRef, {
        uid,
        nickname:  userData.nickname || '',
        email:     lowEmail,
        securityA: userData.securityA || '',
        createdAt: userData.createdAt || Date.now(),
        migratedAt: Date.now(),
      });
      _nc = true;
    }
    if (emailRef && !emailSnap.exists) {
      if (!DRY_RUN) tx.set(emailRef, {
        uid,
        securityA: userData.securityA || '',
        createdAt: userData.createdAt || Date.now(),
        migratedAt: Date.now(),
      });
      _ec = true;
    }

    out.nickCreated   = _nc;
    out.emailCreated  = _ec;
    out.nickAlreadyOk = _nok;
    out.emailAlreadyOk = _eok;
  });

  return out;
}

(async () => {
  let cursor = null;
  let pageNo = 0;
  const totals = {
    usersScanned:    0,
    nickCreated:     0,
    emailCreated:    0,
    nickAlreadyOk:   0,
    emailAlreadyOk:  0,
    skippedNoFields: 0,
    failed:          0,
  };
  const errors = [];   // [{ uid, error }]

  while (true) {
    let q = db.collection('users')
              .orderBy(admin.firestore.FieldPath.documentId())
              .limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;
    pageNo++;

    // 페이지 내부에서 CONCURRENCY 만큼 동시 트랜잭션 — RPS 보호
    for (let i = 0; i < snap.docs.length; i += CONCURRENCY) {
      const chunk = snap.docs.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async ds => {
        try {
          const r = await migrateUser(ds.id, ds.data());
          totals.usersScanned++;
          if (r.skipped)         totals.skippedNoFields++;
          if (r.nickCreated)     totals.nickCreated++;
          if (r.emailCreated)    totals.emailCreated++;
          if (r.nickAlreadyOk)   totals.nickAlreadyOk++;
          if (r.emailAlreadyOk)  totals.emailAlreadyOk++;
        } catch (e) {
          totals.failed++;
          errors.push({ uid: ds.id, error: e.message || String(e) });
        }
      }));
    }

    cursor = snap.docs[snap.docs.length - 1];
    console.log(
      `  [page ${pageNo}] scanned=${totals.usersScanned} ` +
      `nick+${totals.nickCreated} email+${totals.emailCreated} ` +
      `nickOk=${totals.nickAlreadyOk} emailOk=${totals.emailAlreadyOk} ` +
      `fail=${totals.failed}`
    );

    if (snap.docs.length < PAGE_SIZE) break;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Migration Complete' + (DRY_RUN ? ' (DRY RUN — write 없음)' : ''));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  users 스캔:           ' + totals.usersScanned);
  console.log('  nicknames 신규 생성: ' + totals.nickCreated);
  console.log('  emails 신규 생성:    ' + totals.emailCreated);
  console.log('  nicknames 이미 OK:   ' + totals.nickAlreadyOk);
  console.log('  emails 이미 OK:      ' + totals.emailAlreadyOk);
  console.log('  필드 없어 skip:       ' + totals.skippedNoFields);
  console.log('  실패:                 ' + totals.failed);

  if (errors.length) {
    console.log('\n  --- 실패 상세 (' + errors.length + '건) ---');
    errors.forEach(e => console.log('  · ' + e.uid + ': ' + e.error));
    process.exit(1);
  }
  process.exit(0);
})().catch(err => {
  console.error('[migrate-indexes] FATAL', err);
  process.exit(1);
});
