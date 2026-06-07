/**
 * KoAus(코오스) — 관리자 권한 검증용 테스트 데이터 시드 스크립트 (재설정/Re-seed)
 *
 * 목적:
 *   호주 8개 주 × 6개 섹션(share/rent/work/auto/kfood/daily) = 총 48개 글을 운영자 UID 로
 *   Firestore 에 일괄 push. 각 페이지의 List View 렌더에 즉시 노출 가능한 규격.
 *   · kfood → services + category='restaurants' (restaurants.html 필터 매칭)
 *   · daily → services + category='trades'      (trades.html 필터 매칭)
 *
 * 동작:
 *   1) 기존 'seed-admin-test' 마커 글 전수 삭제 (accom_posts/rent_posts/jobs_posts/services 4개 컬렉션)
 *   2) 새 규격으로 batch write (각 페이지의 onSnapshot 쿼리 + Firestore Rules 호환)
 *
 * 실행:
 *   node seed-admin-test.js              # 실제 재설정 (삭제 + 시드 — 40건)
 *   node seed-admin-test.js --dry-run    # 미리보기 (write 0건, 삭제 0건)
 *
 * 핵심 규격 (프론트엔드 쿼리 분석 결과):
 *   · services      — onSnapshot(where('status','==','approved'), orderBy('createdAt','desc'))
 *                     → status:'approved' + createdAt:serverTimestamp() 필수
 *                     → admin 직권 등록 표시: isOfficial:true (status 무관 노출 보장)
 *   · jobs_posts    — onSnapshot(orderBy('createdAt','desc'))   (where 없음, 모두 노출)
 *   · accom_posts   — 페이지가 localStorage 만 읽음 (Firestore 안 읽음 — 호환성만 유지)
 *   · rent_posts    — 동일 (localStorage 만)
 *
 *   · Firestore Rules:
 *     - services.create (admin):     reqStr('category',1,50) + reqStr('title',1,200) + optStr 나머지
 *     - jobs_posts.create:           validPostCreate = reqStr('title',1,120) + reqStr('body',1,5000)
 *     - accom_posts/rent_posts:      동일 validPostCreate
 *
 * 사전 준비:
 *   1) Firebase Console > 프로젝트 설정 > 서비스 계정 > 비공개 키 JSON 을 루트에 배치
 *   2) ⚠️ 키 파일은 .gitignore 처리됨 — 절대 커밋 금지
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');

// ── 운영자 (대표님) 계정 정보 — 시드 데이터의 작성자로 지정 ──
const ADMIN_UID    = 'av9b3RnYjSWrz2PoH2Z9VUfhjeP2';
const ADMIN_EMAIL  = 'sinhang0122@gmail.com';
const ADMIN_AUTHOR = 'KAofficial';

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
  console.error('  → service-account-key.json 또는 *-firebase-adminsdk-*.json 을 이 폴더에 배치하세요.');
  process.exit(1);
}
const serviceAccount = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── 호주 8개 주 + 각 주의 대표 도시 좌표·실제 주소 ──
const STATES = [
  { code: 'qld', label: 'QLD', city: 'Brisbane',  address: '110 Queen St, Brisbane City QLD 4000',  lat: -27.4710, lng: 153.0254 },
  { code: 'nsw', label: 'NSW', city: 'Sydney',    address: '88 George St, Sydney NSW 2000',         lat: -33.8688, lng: 151.2093 },
  { code: 'vic', label: 'VIC', city: 'Melbourne', address: '300 Flinders St, Melbourne VIC 3000',   lat: -37.8183, lng: 144.9671 },
  { code: 'wa',  label: 'WA',  city: 'Perth',     address: '100 St Georges Tce, Perth WA 6000',     lat: -31.9514, lng: 115.8617 },
  { code: 'sa',  label: 'SA',  city: 'Adelaide',  address: '200 Rundle St, Adelaide SA 5000',       lat: -34.9285, lng: 138.6007 },
  { code: 'tas', label: 'TAS', city: 'Hobart',    address: '99 Bathurst St, Hobart TAS 7000',       lat: -42.8821, lng: 147.3272 },
  { code: 'act', label: 'ACT', city: 'Canberra',  address: '1 City Walk, Canberra ACT 2601',        lat: -35.2809, lng: 149.1300 },
  { code: 'nt',  label: 'NT',  city: 'Darwin',    address: '50 Mitchell St, Darwin NT 0800',        lat: -12.4634, lng: 130.8456 },
];

const SHARED_TAIL = '\n\n— 관리자 권한 검증용 자동 생성 테스트 데이터입니다. (seed-admin-test.js)';
const SEED_MARK   = 'seed-admin-test';   // 재설정 시 삭제 식별 마커

// ── 5개 섹션 — 컬렉션·payload 빌더 (프론트엔드 쿼리 + Firestore Rules 양쪽 호환) ──
const SECTIONS = [
  // 1. share (쉐어) — accom_posts (페이지 localStorage 만 읽음 — 호환성으로만 유지)
  {
    key: 'share', label: '쉐어', collection: 'accom_posts',
    build: s => ({
      title:   `[${s.label} 쉐어] ${s.city} 중심가 매스터룸 쉐어생 구합니다`,
      body:    `${s.city} CBD 한복판 매스터룸 1개. 가구·인터넷·세탁기 완비. 단기 3개월 / 장기 모두 환영. 보증금 2주분. 한인 환영.` + SHARED_TAIL,
      price:   250,
      mode:    'offer',
      state:   s.code,
      address: s.address, lat: s.lat, lng: s.lng,
      roomTypes: ['master'], types: ['long'], gender: 'any',
    }),
  },
  // 2. rent (렌트) — rent_posts (동일 — localStorage 만)
  {
    key: 'rent', label: '렌트', collection: 'rent_posts',
    build: s => ({
      title:   `[${s.label} 렌트] ${s.city} 2BR 풀가구 아파트 단기 임대`,
      body:    `${s.city} CBD 근접 2-bedroom 풀가구 아파트. 단기 6개월부터 가능. 보증금 4주분. 주차 1대 포함.` + SHARED_TAIL,
      price:   600,
      mode:    'offer',
      state:   s.code,
      address: s.address, lat: s.lat, lng: s.lng,
    }),
  },
  // 3. work (구인구직) — jobs_posts (Firestore onSnapshot 직접 읽음 — 즉시 노출)
  //    필드: title/body/contact/address/lat/lng/state/postType/category/empType/payUnit/payAmount
  {
    key: 'work', label: '구인', collection: 'jobs_posts',
    build: s => ({
      title:    `[${s.label} 구인] ${s.city} 한식당 홀서빙·주방보조 모집 (워홀 환영)`,
      body:     `${s.city} CBD 한식당에서 홀서빙·주방보조 정직원/파트타임 모집합니다. 시급 $28~$32 + 슈퍼애뉴에이션. 점심·저녁 식사 제공. 워홀비자 환영, 한국어/영어 가능자 우대.` + SHARED_TAIL,
      contact:  'KakaoTalk: koaus-admin',
      address:  s.address, lat: s.lat, lng: s.lng,
      state:    s.code,
      postType: 'hiring',           // 'hiring' = 구인 / 'looking' = 구직
      category: 'fnb',              // 직종: F&B
      empType:  'part-time',
      payUnit:  'hour',
      payAmount: 30,
    }),
  },
  // 4. auto (중고차) — services + category:'used' + status:'approved' + isOfficial:true
  //    프론트엔드: onSnapshot(where('status','==','approved'), orderBy('createdAt','desc'))
  {
    key: 'auto', label: '중고차', collection: 'services',
    build: s => ({
      category: 'used',
      title:    `[${s.label} 중고차] ${s.city} 2018 Toyota RAV4 SUV 판매`,
      body:     `${s.city} 등록 2018년식 Toyota RAV4. 12만 km. RWC 완료, 정기점검 완료. 직거래만 가능합니다.` + SHARED_TAIL,
      summary:  '2018 RAV4 · 12만km · RWC OK',
      tagline:  '직거래 우대 · 정기점검 완료',
      brand: 'Toyota', model: 'RAV4', year: 2018, mileage: 120000, rwc: 'yes',
      price: 15000,
      state: s.code,
      address: s.address, region: s.address, lat: s.lat, lng: s.lng,
      contact: 'KakaoTalk: koaus-admin',
      status:     'approved',  // services 쿼리 통과 보장
      isOfficial: true,        // admin 직권 등록 — status 무관 노출 보장 (룰 read 분기)
      adminPost:  true,
    }),
  },
  // 5. kfood (K-Food / restaurants) — services + category:'restaurants' (restaurants.html 필터 매칭)
  //    프론트엔드: onSnapshot 후 .filter(s => s.category === 'restaurants') — 카테고리명 정확 일치 필요
  {
    key: 'kfood', label: 'K-Food', collection: 'services',
    build: s => ({
      category: 'restaurants',
      title:    `[${s.label}] ${s.city} 한식당 본점 — 김치찌개·삼겹살·반찬 무한 리필`,
      body:     `${s.city} CBD 한식당 — 김치찌개/된장찌개/제육볶음 등 정통 한식. 점심 $18, 저녁 $25 코스. 예약 환영.` + SHARED_TAIL,
      summary:  '한식당 · 점심 $18 / 저녁 $25',
      tagline:  '본점 한식 · 예약 환영',
      state: s.code,
      address: s.address, region: s.address, lat: s.lat, lng: s.lng,
      contact: 'KakaoTalk: koaus-admin',
      status:     'approved',
      isOfficial: true,
      adminPost:  true,
    }),
  },
  // 6. daily (일상 / trades) — services + category:'trades' (trades.html 필터 매칭)
  //    프론트엔드: onSnapshot 후 .filter(s => s.category === 'trades') — 카테고리명 정확 일치 필요
  {
    key: 'daily', label: '일상', collection: 'services',
    build: s => ({
      category: 'trades',
      title:    `[${s.label}] ${s.city} 한인 일상 도움 서비스 (픽업·통역)`,
      body:     `${s.city} 한인 일상 도움 서비스 — 공항 픽업, 통역 동행, 장보기 동반. 시간당 협의 가능.` + SHARED_TAIL,
      summary:  '픽업 · 통역 · 장보기 동반',
      tagline:  '한인 가족 안심 동행',
      state: s.code,
      address: s.address, region: s.address, lat: s.lat, lng: s.lng,
      contact: 'KakaoTalk: koaus-admin',
      status:     'approved',
      isOfficial: true,
      adminPost:  true,
    }),
  },
];

const COLLECTIONS = ['accom_posts', 'rent_posts', 'jobs_posts', 'services'];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  KoAus · 관리자 권한 검증 시드 재설정 (Re-seed)');
console.log(DRY_RUN ? '  *** DRY RUN — 실제 write/delete 발생 안 함 ***' : '  모드: 실제 재설정 (삭제 → 시드 48건 — 8주 × 6섹션)');
console.log('  운영자 UID:  ' + ADMIN_UID);
console.log('  키:          ' + path.basename(keyPath));
console.log('  프로젝트:    ' + (serviceAccount.project_id || '?'));
console.log('  대상 컬렉션: ' + COLLECTIONS.join(' / '));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ── 공통 메타 (모든 시드 글에 부착) ──
function withMeta(base, section) {
  const now = Date.now();
  return Object.assign({
    uid:         ADMIN_UID,
    email:       ADMIN_EMAIL,
    authorEmail: ADMIN_EMAIL,
    author:      ADMIN_AUTHOR,
    nickname:    ADMIN_AUTHOR,
    id:          now + Math.floor(Math.random() * 100000),
    imageUrls:   [],
    isPremium:   false,
    // 타임스탬프: serverTimestamp (orderBy 정렬 핵심) + createdAtMs (페이지 client id 호환)
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: now,
    seedSource:  SEED_MARK,
    seedSection: section.key,
  }, base);
}

(async () => {
  // ──────── Phase 1: 기존 시드 데이터 삭제 (batch) ────────
  let deletedTotal = 0;
  const deletedPerCol = {};
  console.log('\n[1] 기존 seed-admin-test 마커 글 삭제 중…');
  for (const col of COLLECTIONS) {
    let n = 0;
    try {
      const snap = await db.collection(col).where('seedSource', '==', SEED_MARK).get();
      if (snap.empty) {
        console.log(`  · ${col.padEnd(13)} 0건 (삭제 대상 없음)`);
        deletedPerCol[col] = 0;
        continue;
      }
      // batch 는 500 op 제한 — 여러 배치로 분할
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 500) {
        const batch = db.batch();
        docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
        if (!DRY_RUN) await batch.commit();
        n += Math.min(500, docs.length - i);
      }
      deletedPerCol[col] = n;
      deletedTotal += n;
      console.log(`  ${DRY_RUN ? '[DRY]' : '  ✅'} ${col.padEnd(13)} ${n}건 삭제`);
    } catch (e) {
      console.error(`  ❌ ${col} 삭제 실패: ${e.message || e}`);
    }
  }

  // ──────── Phase 2: 새 규격으로 batch write ────────
  console.log('\n[2] 새 규격으로 시드 데이터 batch write 중…');
  const writeTotals = { ok: 0, fail: 0, perSection: {} };
  const errors = [];

  for (const section of SECTIONS) {
    writeTotals.perSection[section.key] = 0;
    const batch = db.batch();
    let pending = 0;
    for (const state of STATES) {
      const payload = withMeta(section.build(state), section);
      const ref     = db.collection(section.collection).doc();  // 자동 ID
      const tag     = `${section.collection.padEnd(13)} | ${section.label} × ${state.label}`;
      if (DRY_RUN) {
        console.log(`  [DRY] ${tag} | docId=${ref.id}`);
        writeTotals.ok++; writeTotals.perSection[section.key]++;
        continue;
      }
      batch.set(ref, payload);
      pending++;
    }
    if (!DRY_RUN && pending > 0) {
      try {
        await batch.commit();
        for (const state of STATES) {
          console.log(`  ✅ ${section.collection.padEnd(13)} | ${section.label} × ${state.label}`);
          writeTotals.ok++; writeTotals.perSection[section.key]++;
        }
      } catch (e) {
        console.error(`  ❌ ${section.key} batch 실패: ${e.message || e}`);
        errors.push({ section: section.key, error: e.message || String(e) });
        writeTotals.fail += STATES.length;
      }
    }
  }

  // ──────── 결과 요약 ────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Re-seed Complete' + (DRY_RUN ? ' (DRY RUN — write 없음)' : ''));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  삭제 합계:        ' + deletedTotal);
  console.log('  삭제 컬렉션별:   ', JSON.stringify(deletedPerCol));
  console.log('  생성 합계:        ' + writeTotals.ok);
  console.log('  생성 섹션별:     ', JSON.stringify(writeTotals.perSection));
  console.log('  실패:             ' + writeTotals.fail);

  if (errors.length) {
    console.log('\n  --- 실패 상세 (' + errors.length + '건) ---');
    errors.forEach(e => console.log('  · [' + e.section + '] ' + e.error));
    process.exit(1);
  }
  process.exit(0);
})().catch(err => {
  console.error('[seed-admin-test] FATAL', err);
  process.exit(1);
});
