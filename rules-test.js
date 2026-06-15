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
//            ③ 제재 시스템 11케이스 (2026-06-11) — 정지 계정 쓰기 차단(notSuspended,
//               functionMocks 로 users/{uid} get/exists 모킹) · reports 복합 ID 패턴 ·
//               reports admin 전용 read 회수 · users.status 자가 변조 차단(F-B) ·
//               moderation_logs 클라 접근 차단 · admin 블라인드 잠금(F-A, hiddenBy)
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

function mkCreate(data, expectation, coll, label, token) {
  return {
    _label: label,
    expectation,
    request: {
      // 기본 토큰 = 이메일 인증 계정(H2 isVerifiedUser 통과 — 정상 유저). 5번째 인자로 토큰 오버라이드(미인증/폰 케이스).
      auth: { uid: 'testuser123', token: token || { firebase: { sign_in_provider: 'password' }, email_verified: true } },
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
// 범용 케이스 빌더 (제재 시스템 ③) — functionMocks 지원
//   · userDocStatus 지정 시 users/{uid} 의 exists/get 을 모킹 →
//     notSuspended() 의 정지/활성 분기를 시뮬레이션.
//   · 모킹 없으면 테스트 API 의 exists() 는 false (doc 없음 = active 취급 경로).
//   · isAdmin() ③ 의 get 도 같은 모킹에 걸리지만 data.isAdmin 부재 → 에러 →
//     rules 의 에러 흡수(||) 로 false 처리 — 의도된 동작.
function mk(opts) {
  const req = {
    auth: opts.uid ? { uid: opts.uid, token: Object.assign({ firebase: { sign_in_provider: 'password' }, email_verified: true }, opts.admin ? { admin: true } : {}) } : null,
    path: `/databases/(default)/documents/${opts.path}`,
    method: opts.method,
    time: '2026-06-10T00:00:00Z',
  };
  if (opts.data)  req.resource = { data: opts.data };
  if (opts.query) req.query = opts.query;
  const c = { _label: opts.label, expectation: opts.expectation, request: req };
  if (opts.resourceData) c.resource = { data: opts.resourceData };
  if (opts.userDocStatus !== undefined) {
    c.functionMocks = [
      { function: 'exists', args: [{ anyValue: {} }], result: { value: true } },
      { function: 'get',    args: [{ anyValue: {} }], result: { value: { data: { status: opts.userDocStatus } } } },
    ];
  }
  return c;
}
// reports 표준 페이로드 — koaus-report.js 신규 스키마 (복합 ID + 스냅샷)
const reportData = {
  postId: 'post123', board: 'accom', postTitle: '테스트 글', category: 'spam',
  reason: '🚫 스팸 · 홍보성 콘텐츠 — 테스트', detail: '테스트',
  reporterUid: 'testuser123', reporterEmail: 'e@e.com',
  postAuthorUid: 'author456', postBodyExcerpt: '본문 요약',
  status: 'pending', createdAt: '2026-06-10T00:00:00Z',
};

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
  // [B4] services legal 글 MARN 7자리 필수 (2026-06-11) — points.html 클라 payload 형태
  mkCreate({ category: 'legal', title: '비자 법무법인', contact: '0400000000', body: ' ',
             address: '', visaType: '', phone: '', kakaoLink: '', status: 'approved',
             isUserPost: true, author: 'a', uid: 'testuser123', authorId: 'testuser123',
             authorUid: 'testuser123', marn: '1234567', providedBy: '테스트 법무법인',
             lastReviewedAt: '2026-06-11' },
           'ALLOW', 'services', 'create: services legal + MARN 7자리 → 허용 (B4)'),
  mkCreate({ category: 'legal', title: '비자 법무법인', contact: '0400000000', body: ' ',
             status: 'approved', isUserPost: true, author: 'a', uid: 'testuser123',
             authorId: 'testuser123', authorUid: 'testuser123' },
           'DENY', 'services', 'create: services legal MARN 누락 → 거부 (B4)'),
  mkCreate({ category: 'legal', title: '비자 법무법인', contact: '0400000000', body: ' ',
             status: 'approved', isUserPost: true, author: 'a', uid: 'testuser123',
             authorId: 'testuser123', authorUid: 'testuser123', marn: '12345' },
           'DENY', 'services', 'create: services legal MARN 5자리(형식 위반) → 거부 (B4)'),
  mkCreate({ category: 'education', title: '유학원 후기', contact: '0400000000', body: ' ',
             status: 'approved', isUserPost: true, author: 'a', uid: 'testuser123',
             authorId: 'testuser123', authorUid: 'testuser123' },
           'ALLOW', 'services', 'create: services education MARN 無 → 허용 (B4 비대상)'),
  // [B-2a] validServicesUserCreate 미검증 필드 길이캡 — 위반 거부 / 정상 통과 회귀
  mkCreate({ category: 'restaurants', title: '식당', contact: '0400000000', uid: 'testuser123',
             status: 'approved', phone: '0'.repeat(31) },
           'DENY', 'services', 'create: services phone 31자(>30) → 거부 (B-2a 캡)'),
  mkCreate({ category: 'trades', title: '업체', contact: '0400000000', uid: 'testuser123',
             status: 'approved', mode: 'x'.repeat(21) },
           'DENY', 'services', 'create: services mode 21자(>20) → 거부 (B-2a 캡)'),
  mkCreate({ category: 'restaurants', title: '식당', contact: '0400000000', uid: 'testuser123',
             status: 'approved', author: 'a'.repeat(101) },
           'DENY', 'services', 'create: services author 101자(>100) → 거부 (B-2a 캡)'),
  mkCreate({ category: 'restaurants', title: '식당', contact: '0400000000', uid: 'testuser123',
             status: 'approved', summary: '한식', tagline: '한식', phone: '0400000000',
             kakaoLink: 'https://open.kakao.com/o/abc', hours: '평일 09:00~18:00',
             hoursJson: { mon: '09:00~18:00', sat: '09:00~13:00', sun: 'closed' },
             imageUrls: ['https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg'] },
           'ALLOW', 'services', 'create: services 사장님 폼(hoursJson 객체+hours+summary) → 허용 (B-2a hoursJson 미캡)'),
  mkCreate({ category: 'trades', title: '업체', contact: '0400000000', uid: 'testuser123',
             status: 'approved', adminPost: false, isUserPost: true, mode: 'offer', price: 120,
             gender: 'any', availableDate: '2026-07-01', types: ['short'], roomTypes: ['master'],
             lat: -33.8, lng: 151.2, authorEmail: 'e@e.com', email: 'e@e.com',
             authorId: 'testuser123', authorUid: 'testuser123', author: 'a' },
           'ALLOW', 'services', 'create: services trades 본폼(쉐어-클론 필드+lat/lng) → 허용 (B-2a 회귀)'),
  // [H2] 본인인증 게이트 — UGC create 는 폰 SMS 인증 OR 이메일 인증 계정만 (미인증 SDK 우회 차단)
  mkCreate(accomData, 'DENY',  'accom_posts', 'create: 미인증(폰X·이메일미인증) → 거부 (H2)',
           { firebase: { sign_in_provider: 'password' } }),
  mkCreate(accomData, 'ALLOW', 'accom_posts', 'create: 폰 SMS 인증 → 허용 (H2)',
           { firebase: { sign_in_provider: 'phone' }, phone_number: '+61400000000' }),
  mkCreate(accomData, 'ALLOW', 'accom_posts', 'create: 이메일 인증 → 허용 (H2)',
           { firebase: { sign_in_provider: 'password' }, email_verified: true }),
  mkCreate({ category: 'trades', title: '업체', contact: '0400000000', uid: 'testuser123', status: 'approved' },
           'DENY', 'services', 'create: services 미인증 → 거부 (H2)',
           { firebase: { sign_in_provider: 'password' } }),
  // ④ 제재 시스템 (2026-06-11) — notSuspended / reports 강화 / users.status 잠금 / hiddenBy
  mk({ label: '정지 계정 accom create → 거부 (notSuspended)', expectation: 'DENY',
       path: 'accom_posts/newdoc2', method: 'create', uid: 'testuser123',
       data: accomData, userDocStatus: 'suspended' }),
  mk({ label: 'active 계정 accom create → 허용 (status 필드 보유 변형)', expectation: 'ALLOW',
       path: 'accom_posts/newdoc2', method: 'create', uid: 'testuser123',
       data: accomData, userDocStatus: 'active' }),
  mk({ label: 'reports create 복합 ID {postId}_{uid} → 허용', expectation: 'ALLOW',
       path: 'reports/post123_testuser123', method: 'create', uid: 'testuser123',
       data: reportData }),
  mk({ label: 'reports create ID 패턴 불일치(임의 ID) → 거부', expectation: 'DENY',
       path: 'reports/randomid999', method: 'create', uid: 'testuser123',
       data: reportData }),
  mk({ label: 'reports get 신고자 본인 → 거부 (admin 전용 회수)', expectation: 'DENY',
       path: 'reports/post123_testuser123', method: 'get', uid: 'testuser123',
       resourceData: reportData }),
  mk({ label: 'reports list 일반유저 limit 20 → 거부', expectation: 'DENY',
       path: 'reports/abc', method: 'list', uid: 'testuser123', query: { limit: 20 } }),
  mk({ label: 'users 본인 status 자가 변조(suspended→active) → 거부 (F-B)', expectation: 'DENY',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', status: 'active' },
       resourceData: { email: 'e@e.com', nickname: 'n', status: 'suspended' } }),
  mk({ label: 'moderation_logs get 일반유저 → 거부', expectation: 'DENY',
       path: 'moderation_logs/log1', method: 'get', uid: 'testuser123',
       resourceData: { action: 'suspend', targetUid: 'x' } }),
  mk({ label: 'moderation_logs create 클라이언트 → 거부 (Functions 전용)', expectation: 'DENY',
       path: 'moderation_logs/log2', method: 'create', uid: 'testuser123',
       data: { action: 'suspend', targetUid: 'x' } }),
  mk({ label: 'admin 블라인드 글 작성자 status 복귀 → 거부 (F-A hiddenBy)', expectation: 'DENY',
       path: 'accom_posts/blinddoc1', method: 'update', uid: 'testuser123',
       data:         Object.assign({}, accomData, { status: 'approved', isHidden: false, hiddenBy: 'admin' }),
       resourceData: Object.assign({}, accomData, { status: 'hidden',   isHidden: true,  hiddenBy: 'admin' }) }),
  mk({ label: '본인 일시숨김 글(hiddenBy 無) 재노출 토글 → 허용 (기존 흐름 보존)', expectation: 'ALLOW',
       path: 'accom_posts/pausedoc1', method: 'update', uid: 'testuser123',
       data:         Object.assign({}, accomData, { status: 'approved', isHidden: false }),
       resourceData: Object.assign({}, accomData, { status: 'hidden',   isHidden: true }) }),
  // ⑤ 제재 관리 카드 (2026-06-11) — users list admin 한정 ≤100
  mk({ label: 'users list admin limit 100 → 허용 (제재 관리 카드)', expectation: 'ALLOW',
       path: 'users/someuid', method: 'list', uid: 'adminuid1', admin: true, query: { limit: 100 } }),
  mk({ label: 'users list admin limit 200 → 거부 (빌링 안전망)', expectation: 'DENY',
       path: 'users/someuid', method: 'list', uid: 'adminuid1', admin: true, query: { limit: 200 } }),
  mk({ label: 'users list 일반유저 limit 100 → 거부 (enumeration 차단 유지)', expectation: 'DENY',
       path: 'users/someuid', method: 'list', uid: 'testuser123', query: { limit: 100 } }),
];

// ── 기본 functionMocks 주입 ──
//   테스트 API 는 모킹 없는 exists()/get() 호출 시 'Function not found' 에러 →
//   notSuspended() 도입(2026-06-11) 후 모든 쓰기 케이스가 users/{uid} exists 를 호출.
//   기본값: exists=false (users doc 없음 = active 취급 — 실제 rules 의 옛 가입자 경로).
//   정지/활성 시뮬레이션 케이스는 mk({userDocStatus}) 가 자체 모킹으로 덮어씀.
for (const c of cases) {
  if (!c.functionMocks) {
    c.functionMocks = [
      { function: 'exists', args: [{ anyValue: {} }], result: { value: false } },
    ];
  }
}

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
