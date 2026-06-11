// ════════════════════════════════════════════════════════════════════
//  KoAus · firestore.rules 회귀 테스트 스위트 (Rules 공식 테스트 API)
//  · 사용법:  node rules-test.js [rules파일경로]   (기본: ./firestore.rules)
//  · 토큰:   firebase-tools 로그인 세션에서 실행 시점에 취득 — 디스크 저장 없음
//            (env RULES_TEST_TOKEN 으로 수동 주입 가능)
//  · 구성:   ① create/update 검증 15케이스 (게시판 검증기 v2 + M5 trim + services UGC)
//            ② 비로그인 공개 read 21케이스 (2026-06-10 회귀 의심 사건 후 상시화 —
//               notices/ads/ad_banners/emails/nicknames/accom_posts/핀공지/services,
//               실제 클라이언트 쿼리 형태 그대로: orderBy 포함 · limit 유/무.
//               services 4케이스는 오피셜 폐기(2026-06-11) 노출 범위 불변 검증)
//  · 주의:   App Check Enforce 계층 차단은 본 스위트로 못 잡는다 — 콘솔 작업(K4류)
//            후엔 운영 도메인에서 공개 페이지 1회 열람 확인 병행할 것.
// ════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const PROJECT = 'koaus-f564c';
const RULES = fs.readFileSync(process.argv[2] || path.join(__dirname, 'firestore.rules'), 'utf8');

async function getToken() {
  if (process.env.RULES_TEST_TOKEN) return process.env.RULES_TEST_TOKEN;
  const candidates = [
    '/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js',
    '/usr/local/lib/node_modules/firebase-tools/lib/auth.js',
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const a = require(p);
    const acct = a.getGlobalDefaultAccount();
    const t = await a.getAccessToken(acct.tokens.refresh_token, []);
    return t.access_token;
  }
  throw new Error('firebase-tools 로그인 세션을 찾지 못함 — RULES_TEST_TOKEN env 로 주입하거나 `firebase login` 후 재실행');
}

// ── ① create/update 스위트 ──────────────────────────────────────────
const accomData = {
  address: 'Some St, Park Ridge QLD', airCon: false, author: '테스터',
  authorEmail: 'sinhang0122@gmail.com', authorUid: 'testuser123', availableDate: '',
  body: '테스트 본문', contact: '0400000000', createdAt: '2026-06-10T00:00:00Z',
  date: '06/10', email: 'sinhang0122@gmail.com', gender: '', imageUrls: [],
  kakaoLink: '', kidsInHouse: false, lat: -27.9953912, lng: 152.6794626,
  locationPrivate: true, minStay: '', mode: 'offer', parking: false,
  petFriendly: false, phone: '', price: 222, roomTypes: [], state: 'qld',
  status: 'approved', time: '12:00', title: '테스트 글', types: [], uid: 'testuser123',
};
// 최악 케이스: 화이트리스트 필드 전부 채운 페이로드 (표현식 평가 비용 최대 — 1,000개 한도 회귀 감시)
const accomMax = Object.assign({}, accomData, {
  updatedAt: '2026-06-10T00:00:00Z', id: 'x', propType: 'house',
  minStay: '3m', gender: 'any', availableDate: '2026-07-01',
  bedrooms: 3, bathrooms: 2, carSpaces: 1,
  types: ['house', 'unit'], roomTypes: ['master', 'second'],
  imageUrls: ['https://x.com/a.jpg', 'https://x.com/b.jpg'],
});
const jobsLikeData = {
  title: '구인', body: '본문', state: 'qld', postType: 'offer', empType: 'casual',
  payAmount: 30, payUnit: 'hour', visaEligible: true, contact: '0400', phone: '',
  kakaoLink: '', author: 'a', email: 'e@e.com', uid: 'testuser123',
  authorUid: 'testuser123', authorEmail: 'e@e.com', date: '06/10', time: '12:00',
  status: 'approved', createdAt: '2026-06-10T00:00:00Z', id: 'x',
};
const autoData = {
  title: '2020 Corolla', body: '본문', state: 'qld', category: 'used',
  brand: 'Toyota', model: 'Corolla', year: '2020', mileage: '50,000km',
  rwc: 'yes', regoExpiry: '2026-12', price: 15000, region: 'Brisbane QLD',
  contact: '0400', phone: '', kakaoLink: '', email: 'e@e.com',
  imageUrls: ['https://x.com/a.jpg'], locationPrivate: true,
  lat: -27.5, lng: 152.9, isPremium: false,
  author: 'a', uid: 'testuser123', authorUid: 'testuser123',
  authorEmail: 'e@e.com', date: '06/10', time: '12:00', id: 'x',
  createdAt: '2026-06-10T00:00:00Z',
};
const badPriceData   = Object.assign({}, accomData, { price: '222' });
const rogueKeyData   = Object.assign({}, accomData, { garbage: 'x' });
const crossBoardData = Object.assign({}, accomData, { empType: 'casual' });
const wsTitleData    = Object.assign({}, accomData, { title: '   ' });
const padTitleData   = Object.assign({}, accomData, { title: '  정상 제목  ' });
const spaceBodyData  = Object.assign({}, accomData, { body: ' ' });

function mkCreate(data, expectation, coll, label) {
  return {
    _label: label,
    expectation,
    request: {
      auth: { uid: 'testuser123', token: { firebase: { sign_in_provider: 'password' } } },
      path: `/databases/(default)/documents/${coll}/newdoc1`,
      method: 'create',
      time: '2026-06-10T00:00:00Z',
      resource: { data },
    },
  };
}
function mkUpdate(authUid, expectation, label) {
  return {
    _label: label,
    expectation,
    request: {
      auth: authUid ? { uid: authUid, token: { firebase: { sign_in_provider: 'password' } } } : undefined,
      path: '/databases/(default)/documents/accom_posts/existdoc1',
      method: 'update',
      time: '2026-06-10T00:00:00Z',
      resource: { data: Object.assign({}, accomData, { title: '제목 수정' }) },
    },
    resource: { data: Object.assign({}, accomData) },
  };
}
function mkUnauth(expectation, coll, method, query, label, resourceData) {
  const req = { auth: null, path: `/databases/(default)/documents/${coll}`, method, time: '2026-06-10T00:00:00Z' };
  if (query) req.query = query;
  const c = { _label: label, expectation, request: req };
  if (resourceData) c.resource = { data: resourceData };
  return c;
}

const cases = [
  // ① create / update
  mkCreate(accomData,     'ALLOW', 'accom_posts', 'create: accom 기본 31키'),
  mkCreate(accomMax,      'ALLOW', 'accom_posts', 'create: accom 최대 37키 (평가한도 감시)'),
  mkCreate(accomData,     'ALLOW', 'rent_posts',  'create: rent 동일 페이로드'),
  mkCreate(jobsLikeData,  'ALLOW', 'jobs_posts',  'create: jobs'),
  mkCreate(autoData,      'ALLOW', 'auto_posts',  'create: auto'),
  mkCreate(badPriceData,  'DENY',  'accom_posts', 'create: price 문자열 → 거부'),
  mkCreate(rogueKeyData,  'DENY',  'accom_posts', 'create: 화이트리스트 밖 키 → 거부'),
  mkCreate(crossBoardData,'DENY',  'accom_posts', 'create: 타 게시판 필드(empType) 혼입 → 거부'),
  (() => { const c = mkCreate(accomData, 'DENY', 'accom_posts', 'create: 비로그인 → 거부'); delete c.request.auth; return c; })(),
  mkUpdate('testuser123', 'ALLOW', 'update: 작성자 본인'),
  mkUpdate('attacker999', 'DENY',  'update: 타인 → 거부'),
  mkCreate(wsTitleData,   'DENY',  'accom_posts', 'create: 공백만 제목 (M5) → 거부'),
  mkCreate(padTitleData,  'ALLOW', 'accom_posts', 'create: 앞뒤 공백 제목 → 허용'),
  mkCreate(spaceBodyData, 'ALLOW', 'accom_posts', 'create: body 공백 1자 (클라 보정 패턴) → 허용'),
  // ② 비로그인 공개 read — 실제 클라이언트 쿼리 형태 그대로
  mkUnauth('ALLOW', 'notices/abc',    'get',  null,                                       'unauth: notices get'),
  mkUnauth('ALLOW', 'notices/abc',    'list', { limit: 20, orderBy: 'createdAt DESC' },   'unauth: notices list (marquee.js 실쿼리)'),
  mkUnauth('ALLOW', 'notices/abc',    'list', null,                                       'unauth: notices list (query 정보 0)'),
  mkUnauth('ALLOW', 'ads/abc',        'get',  null,                                       'unauth: ads get (legacy 홈 광고슬롯)'),
  mkUnauth('ALLOW', 'ads/abc',        'list', { limit: 20, orderBy: 'createdAt DESC' },   'unauth: ads list (index.html 실쿼리)'),
  mkUnauth('ALLOW', 'ad_banners/abc', 'get',  null,                                       'unauth: ad_banners get'),
  mkUnauth('ALLOW', 'ad_banners/abc', 'list', { limit: 20 },                              'unauth: ad_banners list limit 20'),
  mkUnauth('DENY',  'ad_banners/abc', 'list', { limit: 50 },                              'unauth: ad_banners list limit 50 → 거부'),
  mkUnauth('ALLOW', 'emails/test@example.com', 'get',  null,                              'unauth: emails get (비번 재설정 경로)'),
  mkUnauth('DENY',  'emails/test@example.com', 'list', { limit: 20 },                     'unauth: emails list → 거부 (열거 차단)'),
  mkUnauth('ALLOW', 'nicknames/testnick', 'get', null,                                    'unauth: nicknames get (가입 중복체크)'),
  mkUnauth('ALLOW', 'accom_posts/abc', 'list', { limit: 20 },                             'unauth: accom_posts list limit 20'),
  mkUnauth('DENY',  'accom_posts/abc', 'list', { limit: 100 },                            'unauth: accom_posts list limit 100 → 거부'),
  mkUnauth('ALLOW', 'board_pinned_notices/accom', 'get', null,                            'unauth: 핀공지 get'),
  mkUnauth('DENY',  'users/someuid',  'get',  null,                                       'unauth: users get → 거부'),
  // ③ services 공개 read — 오피셜 폐기(2026-06-11) 후 노출 범위 불변 검증
  //    (잔존 데이터 전수: status='approved' + isOfficial 필드 삭제 완료 — 케이스 1이 현 데이터 형태)
  mkUnauth('ALLOW', 'services/abc', 'get', null, 'unauth: services approved get',                          { status: 'approved', category: 'trades', title: 't' }),
  mkUnauth('ALLOW', 'services/abc', 'get', null, 'unauth: services approved+옛isOfficial get (불변 검증)', { status: 'approved', isOfficial: true, category: 'trades', title: 't' }),
  mkUnauth('DENY',  'services/abc', 'get', null, 'unauth: services pending get → 거부',                    { status: 'pending', category: 'trades', title: 't' }),
  mkUnauth('DENY',  'services/abc', 'get', null, 'unauth: services pending+isOfficial get → 거부 (의도)',  { status: 'pending', isOfficial: true, category: 'trades', title: 't' }),
  mkUnauth('ALLOW', 'services/abc', 'list', { limit: 50 },  'unauth: services list limit 50'),
  mkUnauth('DENY',  'services/abc', 'list', { limit: 100 }, 'unauth: services list limit 100 → 거부'),
  // 일반 유저 services create — isOfficial 없는 신규 클라이언트 payload (points/trades 패턴)
  mkCreate({ category: 'trades', title: '테스트 업체', contact: '0400000000', body: ' ',
             address: '', state: 'qld', status: 'approved', isUserPost: true, author: 'a',
             uid: 'testuser123', authorId: 'testuser123', authorUid: 'testuser123',
             authorEmail: 'e@e.com', email: 'e@e.com', lat: null, lng: null },
           'ALLOW', 'services', 'create: services 일반유저 isOfficial 無 payload'),
];

(async () => {
  const token = await getToken();
  const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: { files: [{ name: 'firestore.rules', content: RULES }] },
      testSuite: { testCases: cases.map(({ _label, ...c }) => c) },
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.testResults) {
    console.error('HTTP', res.status, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  let fail = 0;
  json.testResults.forEach((r, i) => {
    const ok = r.state === 'SUCCESS';
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${cases[i].expectation}] ${cases[i]._label}`);
    if (!ok) {
      for (const d of r.debugMessages || []) console.log('       debug:', d);
      if (r.errorPosition) console.log('       errorPosition:', JSON.stringify(r.errorPosition));
    }
  });
  console.log(`\n${cases.length - fail}/${cases.length} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('실패:', e.message || e); process.exit(1); });
