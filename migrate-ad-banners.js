/**
 * KoAus — 마이그레이션 2: ad_banners → hero_banners (컬렉션 단일화)
 *
 *   필드 변환:
 *     img     → imageUrl
 *     href    → linkUrl   (없으면 키 생략)
 *     alt     → alt       (없으면 키 생략)
 *     state   → slots:{state:n} + regions:[state]  (유효하지 않으면 'all')
 *     start/end → 그대로 이식 ('YYYY-MM-DD', 없으면 키 생략)
 *     order(Date.now() ms) → createdAt(Timestamp)  — 동점 시 최신 우선 tiebreak 유지
 *     imgPath → 그대로 이식 (Storage 정리 추적용)
 *     weight  → 폐기
 *     active  → active (기본 true)
 *
 *   슬롯 배정: 같은 주의 기존 hero_banners 점유 슬롯을 피해 1~4 중 최저 빈 슬롯.
 *              빈 슬롯이 없으면 4에 배정하고 ⚠ 충돌 경고 (specificity 가 승자 결정).
 *   재실행 안전: 새 문서에 migratedFrom:<ad_banners doc id> 기록 — 이미 있으면 건너뜀.
 *   원본 ad_banners 문서는 삭제하지 않음 (롤백 대비 보존).
 *
 * 실행:
 *   node migrate-ad-banners.js            # dry-run — 문서별 슬롯 배정안 보고만
 *   node migrate-ad-banners.js --apply    # 본 실행
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
    const heroSnap = await db.collection('hero_banners').get();
    const occupied = {};            // {stateKey: Set<slotNum>}
    const alreadyMigrated = new Set();
    heroSnap.forEach(doc => {
      const d = doc.data();
      if (d.migratedFrom) alreadyMigrated.add(d.migratedFrom);
      if (d.slots && typeof d.slots === 'object') {
        Object.keys(d.slots).forEach(k => {
          (occupied[k] = occupied[k] || new Set()).add(Number(d.slots[k]));
        });
      }
    });
    console.log(`\n[1/3] hero_banners ${heroSnap.size}건 — 기존 슬롯 점유:`,
      JSON.stringify(Object.fromEntries(Object.entries(occupied).map(([k, s]) => [k, [...s].sort()]))));

    const adSnap = await db.collection('ad_banners').get();
    console.log(`[2/3] ad_banners ${adSnap.size}건 조회됨\n`);

    const docs = [];
    adSnap.forEach(doc => docs.push({ id: doc.id, d: doc.data() }));
    docs.sort((a, b) => (Number(a.d.order) || 0) - (Number(b.d.order) || 0));   // 오래된 것부터

    let planned = 0, skipped = 0;
    const writes = [];
    for (const { id, d } of docs) {
      const tag = `${id} (alt: ${d.alt || '-'}, state: ${d.state || '-'}, active: ${d.active !== false})`;
      if (alreadyMigrated.has(id)) {
        console.log(`  ⏭  skip   ${tag} — 이미 이식됨 (migratedFrom 존재)`);
        skipped++;
        continue;
      }
      if (!d.img) {
        console.log(`  ⏭  skip   ${tag} — img 없음 (이식 불가)`);
        skipped++;
        continue;
      }
      const key = VALID_KEYS.includes(d.state) ? d.state : 'all';
      const occ = (occupied[key] = occupied[key] || new Set());
      let slot = 0;
      for (let n = SLOT_MIN; n <= SLOT_MAX; n++) { if (!occ.has(n)) { slot = n; break; } }
      const conflict = slot === 0;
      if (conflict) slot = SLOT_MAX;
      occ.add(slot);

      const data = {
        imageUrl: d.img,
        active: d.active !== false,
        slots: { [key]: slot },
        regions: [key],
        migratedFrom: id,
        createdAt: Number.isFinite(Number(d.order)) && Number(d.order) > 0
          ? admin.firestore.Timestamp.fromMillis(Number(d.order))
          : admin.firestore.FieldValue.serverTimestamp(),
      };
      if (d.href)    data.linkUrl = d.href;
      if (d.alt)     data.alt = d.alt;
      if (d.start)   data.start = d.start;
      if (d.end)     data.end = d.end;
      if (d.imgPath) data.imgPath = d.imgPath;

      console.log(`  ✏  migrate ${tag}`);
      console.log(`        state: ${d.state || '-'} / weight: ${d.weight ?? '-'} (폐기) / 기간: ${d.start || '-'} ~ ${d.end || '-'}`);
      console.log(`     →  slots: ${JSON.stringify(data.slots)} + regions: ${JSON.stringify(data.regions)}${conflict ? '  ⚠ 빈 슬롯 없음 — 4에 중복 배정 (specificity 로 승자 결정)' : ''}`);
      writes.push({ id, data });
      planned++;
    }

    console.log(`\n[3/3] 이식 대상 ${planned}건 / 건너뜀 ${skipped}건 — 원본 ad_banners 는 보존(삭제 없음)`);
    if (!APPLY) {
      console.log('\ndry-run 종료 — 쓰기 없음. 위 배정안 승인 후 `node migrate-ad-banners.js --apply` 로 실행하세요.');
      process.exit(0);
    }
    for (const w of writes) {
      const ref = await db.collection('hero_banners').add(w.data);
      console.log(`  ✓ ${w.id} → hero_banners/${ref.id}`);
    }
    console.log(`\n🎉 완료 — ${writes.length}건 이식됨.`);
    process.exit(0);
  } catch (err) {
    console.error('\n✗ 실패:', err.message || err);
    process.exit(1);
  }
})();
