/**
 * KoAus — hero_banners 마이그레이션: order(단일) + regions → slots 맵 (주별 독립 슬롯)
 *
 *   변환 규칙: regions:['nsw','qld'], order:2  →  slots:{nsw:2, qld:2}
 *              regions:['all'],      order:1  →  slots:{all:1}
 *              order 누락/범위 밖(1~4)        →  1로 간주 (hero-banner.js 와 동일)
 *   regions 는 slots 키에서 재파생해 동기 기록 (firestore.rules `regions is list` 필수)
 *   이미 slots 가 있는 문서는 건너뜀 (재실행 안전)
 *
 * 실행:
 *   node migrate-hero-slots.js            # dry-run — 변경 내용 보고만, 쓰기 없음
 *   node migrate-hero-slots.js --apply    # 본 실행
 *
 * ⚠️ 서비스 계정 키 필요 (setAdmin.js 와 동일 자동 감지). 절대 커밋 금지.
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const APPLY = process.argv.includes('--apply');
const SLOT_MIN = 1, SLOT_MAX = 4;
const VALID_KEYS = ['all','nsw','vic','qld','wa','sa','tas','act','nt'];

function resolveKeyPath() {
  const explicit = path.resolve(__dirname, './service-account-key.json');
  if (fs.existsSync(explicit)) return explicit;
  const auto = fs.readdirSync(__dirname).find(n => /firebase-adminsdk.*\.json$/i.test(n));
  return auto ? path.resolve(__dirname, auto) : null;
}
const keyPath = resolveKeyPath();
if (!keyPath) {
  console.error('✗ 서비스 계정 키 파일을 찾을 수 없습니다:', __dirname);
  process.exit(1);
}
console.log('• 서비스 계정 키 사용:', path.basename(keyPath));
console.log(APPLY ? '• 모드: ★ 본 실행 (--apply)' : '• 모드: dry-run (쓰기 없음 — --apply 로 본 실행)');

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

(async () => {
  try {
    const snap = await db.collection('hero_banners').get();
    console.log(`\n[1/2] hero_banners ${snap.size}건 조회됨\n`);

    let migrated = 0, skipped = 0;
    const writes = [];
    snap.forEach(doc => {
      const d = doc.data();
      const tag = `${doc.id} (alt: ${d.alt || '-'}, active: ${d.active !== false})`;
      if (d.slots && typeof d.slots === 'object') {
        console.log(`  ⏭  skip   ${tag} — 이미 slots 보유:`, JSON.stringify(d.slots));
        skipped++;
        return;
      }
      let ord = Number(d.order);
      if (!Number.isFinite(ord) || ord < SLOT_MIN || ord > SLOT_MAX) ord = 1;
      const regions = (Array.isArray(d.regions) ? d.regions : []).filter(r => VALID_KEYS.includes(r));
      const keys = regions.length ? regions : ['all'];
      const slots = {};
      keys.forEach(k => { slots[k] = ord; });
      console.log(`  ✏  migrate ${tag}`);
      console.log(`        order: ${d.order ?? '(없음)'} + regions: ${JSON.stringify(d.regions ?? null)}`);
      console.log(`     →  slots: ${JSON.stringify(slots)} + regions: ${JSON.stringify(keys)}`);
      writes.push({ ref: doc.ref, patch: { slots, regions: keys } });
      migrated++;
    });

    console.log(`\n[2/2] 변환 대상 ${migrated}건 / 건너뜀 ${skipped}건`);
    if (!APPLY) {
      console.log('\ndry-run 종료 — 쓰기 없음. 위 내용 확인 후 `node migrate-hero-slots.js --apply` 로 실행하세요.');
      process.exit(0);
    }
    for (const w of writes) await w.ref.update(w.patch);
    console.log(`\n🎉 완료 — ${writes.length}건 갱신됨.`);
    process.exit(0);
  } catch (err) {
    console.error('\n✗ 실패:', err.message || err);
    process.exit(1);
  }
})();
