// ════════════════════════════════════════════════════════════════════
//  KoAus · 고아 이미지 정리 (Firebase Storage) — Node Admin SDK
//
//  Storage 에 올라갔지만 어떤 Firestore 문서도 참조하지 않는 이미지를 찾아
//  카운트·목록·총용량(비용 추정)을 출력한다.
//
//  ⚠️ 기본 동작 = DRY-RUN (삭제 안 함). 실제 삭제는 `--delete` 플래그 명시 필수.
//      node cleanup-orphan-images.js            # dry-run (목록만)
//      node cleanup-orphan-images.js --delete    # 실제 삭제
//
//  안전 가드:
//   1. SKIP_PREFIXES — auto(used/maintenance)는 localStorage 기반이라 Firestore 참조가
//      없음 → 고아로 오판되므로 정리 대상에서 제외.
//   2. 24시간 이내 업로드 파일 제외 — 글 등록 진행 중(아직 Firestore 저장 전) 이미지 보호.
//
//  실행 조건: 서비스 계정 키(service-account-key.json 또는 *-firebase-adminsdk-*.json)가
//            이 폴더에 있어야 함. **키는 로컬에만 — repo 커밋 절대 금지(.gitignore 확인).**
//  권장: 분기마다 1회 dry-run 으로 누적 고아 점검 (CLAUDE.md 운영 메모).
// ════════════════════════════════════════════════════════════════════
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// ── 설정 ──────────────────────────────────────────────────────────
const BUCKET = 'koaus-f564c.firebasestorage.app';
// Firestore 에서 이미지 URL/경로를 들고 있는 컬렉션·필드 (참조 수집 소스).
//   · field 가 배열이면 각 원소, 문자열이면 단일로 처리.
const REFERENCED = [
  { col: 'services',     fields: ['imageUrls'] },
  { col: 'accom_posts',  fields: ['imageUrls'] },
  { col: 'rent_posts',   fields: ['imageUrls'] },   // 존재하지 않으면 자동 스킵
  { col: 'jobs_posts',   fields: ['imageUrls'] },
  { col: 'hero_banners', fields: ['imageUrl', 'img'] },
  { col: 'ad_banners',   fields: ['img', 'imgPath'] },
  { col: 'users',        fields: ['avatar', 'photoURL'] },
];
// localStorage 기반(Firestore 미연동) — 고아 오판 방지로 제외.
const SKIP_PREFIXES = ['post_images/used/', 'post_images/maintenance/'];
const FRESH_MS = 24 * 60 * 60 * 1000;  // 24h 이내 업로드 제외
// ──────────────────────────────────────────────────────────────────

const DELETE = process.argv.includes('--delete');

function resolveKeyPath() {
  const explicit = path.resolve(__dirname, './service-account-key.json');
  if (fs.existsSync(explicit)) return explicit;
  const auto = fs.readdirSync(__dirname).find(n => /firebase-adminsdk.*\.json$/i.test(n));
  return auto ? path.resolve(__dirname, auto) : null;
}
const keyPath = resolveKeyPath();
if (!keyPath) {
  console.error('✗ 서비스 계정 키 없음 — service-account-key.json 또는 *-firebase-adminsdk-*.json 을 이 폴더에 배치하세요.');
  process.exit(1);
}
console.log('• 서비스 계정 키:', path.basename(keyPath));
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)), storageBucket: BUCKET });

// download URL / gs:// / 평문 경로 → Storage object path 추출
function toObjectPath(ref) {
  if (!ref || typeof ref !== 'string') return null;
  // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<ENCODED_PATH>?...
  const m = ref.match(/\/o\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  if (ref.startsWith('gs://')) return ref.replace(/^gs:\/\/[^/]+\//, '');
  if (!/^https?:\/\//.test(ref)) return ref.replace(/^\/+/, '');  // 평문 경로(imgPath 등)
  return null;  // 외부 URL(우리 버킷 아님) — 무시
}

(async () => {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  // 1) Firestore 참조 경로 수집
  const referenced = new Set();
  for (const { col, fields } of REFERENCED) {
    let snap;
    try { snap = await db.collection(col).get(); }
    catch (e) { console.warn(`  (스킵) ${col}: ${e.message}`); continue; }
    snap.forEach(doc => {
      const d = doc.data();
      for (const f of fields) {
        const v = d[f];
        const arr = Array.isArray(v) ? v : (v ? [v] : []);
        arr.forEach(u => { const p = toObjectPath(u); if (p) referenced.add(p); });
      }
    });
    console.log(`  참조 수집: ${col} (${snap.size} docs)`);
  }
  console.log(`• 참조된 이미지 경로: ${referenced.size}개`);

  // 2) Storage 전체 객체 나열
  const [files] = await bucket.getFiles();
  const now = Date.now();

  // 3) 차집합 = 고아 (가드 적용)
  let orphans = [], skipFresh = 0, skipGuard = 0, totalBytes = 0;
  for (const file of files) {
    const name = file.name;
    if (SKIP_PREFIXES.some(p => name.startsWith(p))) { skipGuard++; continue; }
    if (referenced.has(name)) continue;
    const updated = Date.parse(file.metadata.updated || file.metadata.timeCreated || 0);
    if (now - updated < FRESH_MS) { skipFresh++; continue; }
    const size = Number(file.metadata.size || 0);
    orphans.push({ name, size, updated: file.metadata.updated });
    totalBytes += size;
  }

  // 4) 보고
  const mb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log('\n──────── 결과 ────────');
  console.log(`Storage 총 객체: ${files.length}`);
  console.log(`가드 제외(used/maintenance): ${skipGuard} · 최근 24h 제외: ${skipFresh}`);
  console.log(`고아 후보: ${orphans.length}개 · 총 ${mb}MB (Storage 비용 추정)`);
  orphans.slice(0, 200).forEach(o => console.log(`  - ${o.name}  (${(o.size/1024).toFixed(0)}KB, ${o.updated})`));
  if (orphans.length > 200) console.log(`  … 외 ${orphans.length - 200}건`);

  if (!DELETE) {
    console.log('\n※ DRY-RUN — 삭제 안 함. 실제 삭제는 `node cleanup-orphan-images.js --delete`');
    process.exit(0);
  }
  // 5) 삭제
  console.log(`\n⚠️  --delete — ${orphans.length}건 삭제 시작…`);
  let done = 0;
  for (const o of orphans) {
    try { await bucket.file(o.name).delete(); done++; }
    catch (e) { console.warn(`  삭제 실패 ${o.name}: ${e.message}`); }
  }
  console.log(`✓ 삭제 완료: ${done}/${orphans.length}`);
  process.exit(0);
})().catch(e => { console.error('✗ 오류:', e); process.exit(1); });
