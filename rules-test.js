// ════════════════════════════════════════════════════════════════════
//  KoAus · firestore.rules 회귀 테스트 스위트 (Rules 공식 테스트 API)
//  · 사용법:  node rules-test.js [rules파일경로]   (기본: ./firestore.rules)
//  · 토큰:   firebase-tools 로그인 세션에서 실행 시점에 취득 — 디스크 저장 없음
//            (env RULES_TEST_TOKEN 으로 수동 주입 가능)
//  · 구성:   ① create/update 검증 16케이스 (게시판 검증기 v2 + M5 trim + services UGC +
//               chatAllowed 옵트인 pOptBool — 2026-07)
//            ② 비로그인 공개 read 21케이스 (2026-06-10 회귀 의심 사건 후 상시화 —
//               notices/ads/ad_banners/emails/nicknames/accom_posts/핀공지/services,
//               실제 클라이언트 쿼리 형태 그대로: orderBy 포함 · limit 유/무.
//               services 4케이스는 오피셜 폐기(2026-06-11) 노출 범위 불변 검증)
//            ③ 제재 시스템 11케이스 (2026-06-11) — 정지 계정 쓰기 차단(notSuspended,
//               functionMocks 로 users/{uid} get/exists 모킹) · reports 복합 ID 패턴 ·
//               reports admin 전용 read 회수 · users.status 자가 변조 차단(F-B) ·
//               moderation_logs 클라 접근 차단 · admin 블라인드 잠금(F-A, hiddenBy)
//            ⑥ 홈 영상 승인 큐 24케이스 (2026-07) — create pending 강제(자가 승인 차단) · CTA(ctaText/ctaUrl 유튜브 링크만) ·
//               createdAt==request.time(serverTimestamp 강제) · 유튜브 URL 형태 ·
//               approved 만 공개 read(쿼리 provability) · admin 승인 update · 본인 delete ·
//               본인 authorUid list(마이페이지 내 등록 영상) 허용/타인 거부
//            ⑦ 1:1 채팅 46케이스 (2026-07) — chats ID 패턴 {postId}_{inquirerUid} ·
//               participants 위조/자기채팅 거부 · unreadFor⊆participants(배지 DoS 가드) ·
//               blockedBy 본인만 증감 + 차단 시 대화 동결(요약 갱신·메시지 거부, 읽음 처리는 허용) ·
//               messages 부모 chat get 모킹(getMock) · 수정/삭제 금지(기록 보존) ·
//               profiles 공개 카드(본인 쓰기·hasOnly·https 사진·list 차단)
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
  authorUid: 'testuser123', availableDate: '',
  body: '테스트 본문', contact: '0400000000', createdAt: '2026-06-10T00:00:00Z',
  date: '06/10', gender: '', imageUrls: [],
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
  chatAllowed: true,   // 채팅 문의 옵트인 (2026-07)
});
const jobsLikeData = {
  title: '구인', body: '본문', state: 'qld', postType: 'offer', empType: 'casual',
  payAmount: 30, payUnit: 'hour', visaEligible: true, contact: '0400', phone: '',
  kakaoLink: '', author: 'a', uid: 'testuser123',
  authorUid: 'testuser123', date: '06/10', time: '12:00',
  status: 'approved', createdAt: '2026-06-10T00:00:00Z', id: 'x',
  chatAllowed: true,   // 채팅 문의 옵트인 (2026-07)
};
const autoData = {
  title: '2020 Corolla', body: '본문', state: 'qld', category: 'used',
  brand: 'Toyota', model: 'Corolla', year: '2020', mileage: '50,000km',
  rwc: 'yes', regoExpiry: '2026-12', price: 15000, region: 'Brisbane QLD',
  contact: '0400', phone: '', kakaoLink: '',
  imageUrls: ['https://x.com/a.jpg'], locationPrivate: true,
  lat: -27.5, lng: 152.9, isPremium: false,
  author: 'a', uid: 'testuser123', authorUid: 'testuser123',
  date: '06/10', time: '12:00', id: 'x',
  createdAt: '2026-06-10T00:00:00Z',
  chatAllowed: true,   // 채팅 문의 옵트인 (2026-07)
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
    auth: opts.uid ? { uid: opts.uid, token: Object.assign({ firebase: { sign_in_provider: 'password' }, email_verified: true }, opts.admin ? { admin: true } : {}, opts.unverified ? { email_verified: false } : {}) } : null,   // opts.unverified: 이메일 미인증·폰 없음(isVerifiedUser 실패)
    path: `/databases/(default)/documents/${opts.path}`,
    method: opts.method,
    time: opts.time || '2026-06-10T00:00:00Z',   // opts.time: request.time 재지정 (메시지 5분 삭제 창 테스트)
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
  //   · getMock: 임의 get() 반환 데이터 모킹 (chats/messages — 부모 chat doc 검증용).
  //     exists 는 false 유지 → notSuspended/isAdmin 이 users get 을 안 타므로
  //     get 모킹이 부모 chat doc 전용으로 작동 (users get 과 충돌 없음).
  if (opts.getMock) {
    c.functionMocks = [
      { function: 'exists', args: [{ anyValue: {} }], result: { value: false } },
      { function: 'get',    args: [{ anyValue: {} }], result: { value: { data: opts.getMock } } },
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
// videos 표준 페이로드 — koaus-home-videos.js 등록 모달 스키마 (승인 큐: pending 강제)
//   createdAt 은 rules 가 == request.time 강제(serverTimestamp) — mkCreate 의 time 과 동일 문자열.
const videoData = {
  videoId: 'abc123XYZ_-',
  url: 'https://www.youtube.com/shorts/abc123XYZ_-',
  title: '테스트 영상',
  status: 'pending', authorUid: 'testuser123',
  createdAt: '2026-06-10T00:00:00Z',
};
// daily_posts 표준 페이로드 — trades.html 일상 자기 PR 보드 (2026-07 개편) 클라 스키마
//   title=이름/상호(≤60) · body=포트폴리오(≤3000) · category food|beauty|tech ·
//   openKakaoUrl=open.kakao.com 만 · googleReviewUrl=구글 지도 도메인만 · phone=숫자만
const dailyData = {
  title: '시드니 한식 반찬가게', body: '10년 경력 반찬 전문. 주문 제작 가능합니다.',
  category: 'food', intro: '정성으로 만드는 집반찬', closing: '편하게 연락 주세요!',
  address: 'Strathfield NSW 2135', lat: -33.87, lng: 151.09, locationPrivate: true,
  chatAllowed: true, imageUrls: [], coverImageUrl: '', avatarUrl: '',
  phone: '0412345678', openKakaoUrl: 'https://open.kakao.com/o/abc123',
  googleReviewUrl: 'https://maps.app.goo.gl/xyz789',
  state: 'nsw', status: 'approved', author: '테스터',
  uid: 'testuser123', authorUid: 'testuser123',
  date: '07/11', time: '12:00', createdAt: '2026-06-10T00:00:00Z',
};
// chats 표준 페이로드 — koaus-contact-actions.js ensure-create 스키마 (2026-07 채팅)
//   chatId = {postId}_{inquirerUid} · participants = [ownerUid, inquirerUid] 고정 순서
//   createdAt == request.time 강제 — mkCreate/mk 의 time 과 동일 문자열
const chatData = {
  postId: 'post123', board: 'accom', postTitle: '테스트 글',
  ownerUid: 'owner456xyz', inquirerUid: 'testuser123',
  participants: ['owner456xyz', 'testuser123'],
  ownerNick: '글쓴이', inquirerNick: '문의자',
  unreadFor: [], blockedBy: [],
  createdAt: '2026-06-10T00:00:00Z',
};
// 내가 마지막으로 보낸 상태의 chat doc (수정·삭제 미리보기 교체 테스트용) — lastMsgAt 은 request.time 보다 과거
const chatLastMine = Object.assign({}, chatData, {
  lastMsg: '안녕하세요', lastMsgAt: '2026-06-09T23:00:00Z', lastSenderUid: 'testuser123', unreadFor: ['owner456xyz'],
});
// 집 구해요 프로필(seeker_profiles) 표준 페이로드 — 2026-10 2단계
const seekerData = {
  suburbs: [{ name: 'Sunnybank', state: 'qld', postcode: '4109', lat: -27.57, lng: 153.06 }],
  states: ['qld'],
  budgetMin: 150, budgetMax: 250, moveIn: '2026-07-01', stay: 'long',
  roomTypes: ['single', 'master'], bathroom: 'any',
  nick: '신행', ageBand: '20m', gender: 'male', radiusKm: 5,
  visible: true, status: 'looking', step: 7,
  lastActiveAt: '2026-06-10T00:00:00Z', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
};
const seekerExisting = Object.assign({}, seekerData, { createdAt: '2026-06-01T00:00:00Z', lastActiveAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' });
// 집 구해요 비공개 칸(seeker_private) — 본인만 (10-18 공개/비공개 분리)
const seekerPrivData = {
  residency: 'whv', smoker: false, pet: false,
  intro: '조용하고 깔끔합니다. 채팅으로 연락 주세요.',
  alerts: { enabled: true, mode: 'threshold5', email: 'me@example.com' },
  updatedAt: '2026-06-10T00:00:00Z',
};
// messages 표준 페이로드 + 부모 chat get 모킹 데이터 (mk getMock)
const msgData = {
  senderUid: 'testuser123', text: '안녕하세요, 문의드립니다',
  createdAt: '2026-06-10T00:00:00Z',
};
const chatParent = {
  participants: ['owner456xyz', 'testuser123'],
  blockedBy: [],
};

const cases = [
  // ① create / update
  mkCreate(accomData,     'ALLOW', 'accom_posts', 'create: accom 기본 31키'),
  mkCreate(accomMax,      'ALLOW', 'accom_posts', 'create: accom 최대 38키 (평가한도 감시)'),
  mkCreate(accomData,     'ALLOW', 'rent_posts',  'create: rent 동일 페이로드'),
  mkCreate(jobsLikeData,  'ALLOW', 'jobs_posts',  'create: jobs'),
  mkCreate(autoData,      'ALLOW', 'auto_posts',  'create: auto'),
  mkCreate(badPriceData,  'DENY',  'accom_posts', 'create: price 문자열 → 거부'),
  mkCreate(Object.assign({}, accomData, { chatAllowed: 'yes' }),
                          'DENY',  'accom_posts', 'create: chatAllowed 문자열 → 거부 (pOptBool)'),
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
             lat: null, lng: null },
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
             authorId: 'testuser123', authorUid: 'testuser123', marn: '' },
           'ALLOW', 'services', 'create: services legal MARN 빈값 → 허용 (B4 선택화 — 변호사 등)'),
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
             lat: -33.8, lng: 151.2,
             authorId: 'testuser123', authorUid: 'testuser123', author: 'a' },
           'ALLOW', 'services', 'create: services trades 본폼(쉐어-클론 필드+lat/lng) → 허용 (B-2a 회귀)'),
  // [H4] 공개 문서 작성자 PII 제거 — email/authorEmail 포함 create 는 거부 (보드 hasOnly + services 명시 차단)
  mkCreate(Object.assign({}, accomData, { email: 'leak@e.com' }),
           'DENY', 'accom_posts', 'create: accom email 포함 → 거부 (H4)'),
  mkCreate(Object.assign({}, accomData, { authorEmail: 'leak@e.com' }),
           'DENY', 'accom_posts', 'create: accom authorEmail 포함 → 거부 (H4)'),
  mkCreate({ category: 'trades', title: '업체', contact: '0400000000', uid: 'testuser123',
             status: 'approved', email: 'leak@e.com' },
           'DENY', 'services', 'create: services email 포함 → 거부 (H4)'),
  // [contactEmail 기능] 글쓴이 연락용 이메일(별개 키) — 포함해도 허용 (H4 의 email/authorEmail 차단과 무관)
  mkCreate(Object.assign({}, accomData, { contactEmail: 'seller@example.com' }),
           'ALLOW', 'accom_posts', 'create: accom contactEmail 포함 → 허용 (contactEmail 기능)'),
  mkCreate({ category: 'trades', title: '업체', contact: '0400000000', uid: 'testuser123',
             status: 'approved', contactEmail: 'biz@example.com' },
           'ALLOW', 'services', 'create: services contactEmail 포함 → 허용 (contactEmail 기능)'),
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
  // [사기 추적] 소프트삭제 — 작성자 본인 글 status='deleted' 허용(보관). reports postAuthorContact 스냅샷 허용.
  mk({ label: '작성자 소프트삭제(status=deleted+deletedAt) → 허용 (사기 추적 보관)', expectation: 'ALLOW',
       path: 'accom_posts/softdel1', method: 'update', uid: 'testuser123',
       data:         Object.assign({}, accomData, { status: 'deleted', deletedAt: '2026-06-17T00:00:00Z' }),
       resourceData: Object.assign({}, accomData) }),
  mk({ label: 'reports create postAuthorContact 포함 → 허용 (연락처 스냅샷)', expectation: 'ALLOW',
       path: 'reports/post123_testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, reportData, { postAuthorContact: '📞 0412345678 · ✉️ x@example.com' }) }),
  // 자기소개서 Living/Work 분리 (2026-07) — users introLiving/introWork ≤700 개별 가드
  mk({ label: 'users 본인 introLiving 700자 → 허용', expectation: 'ALLOW',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', introLiving: '가'.repeat(700) },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  mk({ label: 'users 본인 introLiving 701자(>700) → 거부', expectation: 'DENY',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', introLiving: '가'.repeat(701) },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  mk({ label: 'users 본인 introWork 숫자형 → 거부 (string 강제)', expectation: 'DENY',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', introWork: 12345 },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  mk({ label: 'users 타인 doc 에 introWork 쓰기 → 거부', expectation: 'DENY',
       path: 'users/testuser123', method: 'update', uid: 'attacker999',
       data:         { email: 'e@e.com', nickname: 'n', introWork: '워크 소개' },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  // ⑤ 제재 관리 카드 (2026-06-11) — users list admin 한정 ≤100
  mk({ label: 'users list admin limit 100 → 허용 (제재 관리 카드)', expectation: 'ALLOW',
       path: 'users/someuid', method: 'list', uid: 'adminuid1', admin: true, query: { limit: 100 } }),
  mk({ label: 'users list admin limit 200 → 거부 (빌링 안전망)', expectation: 'DENY',
       path: 'users/someuid', method: 'list', uid: 'adminuid1', admin: true, query: { limit: 200 } }),
  mk({ label: 'users list 일반유저 limit 100 → 거부 (enumeration 차단 유지)', expectation: 'DENY',
       path: 'users/someuid', method: 'list', uid: 'testuser123', query: { limit: 100 } }),
  // ⑥ 홈 영상(videos) 승인 큐 (2026-07) — create pending 강제 / approved 만 공개 / admin 승인
  mkCreate(videoData,                                              'ALLOW', 'videos', 'create: videos 유효 pending 등록'),
  mkCreate(Object.assign({}, videoData, { status: 'approved' }),   'DENY',  'videos', 'create: videos 자가 승인(status=approved) → 거부'),
  mkCreate(Object.assign({}, videoData, { authorEmail: 'l@e.c' }), 'DENY',  'videos', 'create: videos authorEmail 포함 → 거부 (H4)'),
  mkCreate(Object.assign({}, videoData, { plays: 999 }),           'DENY',  'videos', 'create: videos 화이트리스트 밖 키 → 거부'),
  mkCreate(Object.assign({}, videoData, { url: 'https://evil.com/watch?v=abc123XYZ' }),
                                                                   'DENY',  'videos', 'create: videos 유튜브 외 URL → 거부'),
  (() => { const c = mkCreate(videoData, 'DENY', 'videos', 'create: videos 비로그인 → 거부'); delete c.request.auth; return c; })(),
  mkCreate(videoData, 'DENY', 'videos', 'create: videos 미인증(폰X·이메일미인증) → 거부 (H2)',
           { firebase: { sign_in_provider: 'password' } }),
  mkUnauth('ALLOW', 'videos/abc', 'list', { limit: 20, orderBy: 'createdAt DESC' }, 'unauth: videos approved list (홈 실쿼리)',            { status: 'approved' }),
  mkUnauth('DENY',  'videos/abc', 'list', { limit: 50, orderBy: 'createdAt DESC' }, 'unauth: videos list limit 50 → 거부 (빌링 캡)',       { status: 'approved' }),
  mkUnauth('DENY',  'videos/abc', 'list', { limit: 20 },                            'unauth: videos 상태조건 없는 list → 거부 (approved 쿼리 강제)'),
  mkUnauth('ALLOW', 'videos/abc', 'get',  null, 'unauth: videos approved get',            { status: 'approved', authorUid: 'x' }),
  mkUnauth('DENY',  'videos/abc', 'get',  null, 'unauth: videos pending get → 거부',      { status: 'pending',  authorUid: 'x' }),
  mk({ label: 'videos 본인 pending get → 허용 (내 등록 확인)', expectation: 'ALLOW',
       path: 'videos/vid1', method: 'get', uid: 'testuser123',
       resourceData: { status: 'pending', authorUid: 'testuser123' } }),
  mk({ label: 'videos 타인 pending get → 거부', expectation: 'DENY',
       path: 'videos/vid1', method: 'get', uid: 'attacker999',
       resourceData: { status: 'pending', authorUid: 'testuser123' } }),
  mk({ label: 'videos admin 승인(update status→approved) → 허용', expectation: 'ALLOW',
       path: 'videos/vid1', method: 'update', uid: 'adminuid1', admin: true,
       data:         Object.assign({}, videoData, { status: 'approved' }),
       resourceData: Object.assign({}, videoData) }),
  mk({ label: 'videos 작성자 자가 승인 update → 거부 (admin 전용)', expectation: 'DENY',
       path: 'videos/vid1', method: 'update', uid: 'testuser123',
       data:         Object.assign({}, videoData, { status: 'approved' }),
       resourceData: Object.assign({}, videoData) }),
  mk({ label: 'videos 작성자 delete(등록 취소) → 허용', expectation: 'ALLOW',
       path: 'videos/vid1', method: 'delete', uid: 'testuser123',
       resourceData: { status: 'pending', authorUid: 'testuser123' } }),
  mk({ label: 'videos 타인 delete → 거부', expectation: 'DENY',
       path: 'videos/vid1', method: 'delete', uid: 'attacker999',
       resourceData: { status: 'pending', authorUid: 'testuser123' } }),
  // videos CTA (2026-07): ctaText ≤60 + ctaUrl 유튜브 링크만(https) — 등록자 입력·운영자 승인 게이트
  mkCreate(Object.assign({}, videoData, { ctaText: '채널 구경하기', ctaUrl: 'https://www.youtube.com/@koaus' }),
                                                                   'ALLOW', 'videos', 'create: videos CTA(text+유튜브 url) 포함 → 허용'),
  mkCreate(Object.assign({}, videoData, { ctaUrl: 'http://evil.com/phish' }),
                                                                   'DENY',  'videos', 'create: videos ctaUrl http(비-https) → 거부'),
  mkCreate(Object.assign({}, videoData, { ctaUrl: 'https://www.instagram.com/koaus' }),
                                                                   'DENY',  'videos', 'create: videos ctaUrl 유튜브 외 https → 거부 (유튜브 전용)'),
  mkCreate(Object.assign({}, videoData, { ctaText: 'x'.repeat(61) }),
                                                                   'DENY',  'videos', 'create: videos ctaText 61자 초과 → 거부'),
  // videos 내 등록 영상 (2026-07 마이페이지): 본인 authorUid list — koaus-video-reg.js 실쿼리
  //   where('authorUid','==',uid)+orderBy('createdAt','desc')+limit(20) (복합 인덱스 별도)
  mk({ label: 'videos 본인 authorUid list (마이페이지 내 등록 영상) → 허용', expectation: 'ALLOW',
       path: 'videos/vid1', method: 'list', uid: 'testuser123',
       query: { limit: 20, orderBy: 'createdAt DESC' },
       resourceData: { status: 'pending', authorUid: 'testuser123' } }),
  mk({ label: 'videos 타인 pending 포함 list → 거부', expectation: 'DENY',
       path: 'videos/vid1', method: 'list', uid: 'attacker999',
       query: { limit: 20, orderBy: 'createdAt DESC' },
       resourceData: { status: 'pending', authorUid: 'testuser123' } }),
  // ⑧ 일상 자기 PR 보드 daily_posts (2026-07 trades.html 개편) — validDailyCreate
  mkCreate(dailyData, 'ALLOW', 'daily_posts', 'create: daily 유효 payload (food+비공개 위치)'),
  mkCreate(Object.assign({}, dailyData, { category: 'legal' }),
           'DENY',  'daily_posts', 'create: daily 카테고리 3종 외(legal) → 거부'),
  mkCreate(Object.assign({}, dailyData, { title: 'x'.repeat(61) }),
           'DENY',  'daily_posts', 'create: daily 이름/상호 61자(>60) → 거부'),
  mkCreate(Object.assign({}, dailyData, { intro: 'x'.repeat(301) }),
           'DENY',  'daily_posts', 'create: daily intro 301자(>300) → 거부'),
  mkCreate(Object.assign({}, dailyData, { phone: '0412-345-678' }),
           'DENY',  'daily_posts', 'create: daily phone 비숫자 포함 → 거부'),
  mkCreate(Object.assign({}, dailyData, { phone: '' }),
           'ALLOW', 'daily_posts', 'create: daily phone 빈값 → 허용 (선택 필드)'),
  mkCreate(Object.assign({}, dailyData, { openKakaoUrl: 'https://evil.com/o/abc' }),
           'DENY',  'daily_posts', 'create: daily openKakaoUrl 오픈카톡 외 도메인 → 거부'),
  mkCreate(Object.assign({}, dailyData, { googleReviewUrl: 'https://phish.com/maps' }),
           'DENY',  'daily_posts', 'create: daily googleReviewUrl 구글 외 도메인 → 거부'),
  mkCreate(Object.assign({}, dailyData, { googleReviewUrl: 'https://www.google.com/maps/place/abc' }),
           'ALLOW', 'daily_posts', 'create: daily googleReviewUrl google.com/maps → 허용'),
  mkCreate(Object.assign({}, dailyData, { coverImageUrl: 'http://evil.com/a.jpg' }),
           'DENY',  'daily_posts', 'create: daily coverImageUrl http(비-https) → 거부'),
  mkCreate(Object.assign({}, dailyData, { garbage: 'x' }),
           'DENY',  'daily_posts', 'create: daily 화이트리스트 밖 키 → 거부'),
  mkCreate(Object.assign({}, dailyData, { mode: 'offer', price: 120 }),
           'DENY',  'daily_posts', 'create: daily 쉐어-클론 필드(mode/price) 혼입 → 거부'),
  // 2차 개편 (2026-07): coverOrient/primaryContact enum + imageUrls 10 + comment ≤500
  mkCreate(Object.assign({}, dailyData, { coverOrient: 'portrait', primaryContact: 'sms' }),
           'ALLOW', 'daily_posts', "create: daily coverOrient 'portrait' + primaryContact 'sms' → 허용"),
  mkCreate(Object.assign({}, dailyData, { coverOrient: 'diagonal' }),
           'DENY',  'daily_posts', "create: daily coverOrient enum 외('diagonal') → 거부"),
  mkCreate(Object.assign({}, dailyData, { primaryContact: 'email' }),
           'DENY',  'daily_posts', "create: daily primaryContact enum 외('email') → 거부"),
  mkCreate(Object.assign({}, dailyData, { comment: '코'.repeat(500) }),
           'ALLOW', 'daily_posts', 'create: daily comment 500자 → 허용'),
  mkCreate(Object.assign({}, dailyData, { comment: '코'.repeat(501) }),
           'DENY',  'daily_posts', 'create: daily comment 501자(>500) → 거부'),
  mkCreate(Object.assign({}, dailyData, { imageUrls: Array(10).fill('https://x.com/a.jpg') }),
           'ALLOW', 'daily_posts', 'create: daily imageUrls 10개 → 허용 (캐러셀 상한)'),
  mkCreate(Object.assign({}, dailyData, { imageUrls: Array(11).fill('https://x.com/a.jpg') }),
           'DENY',  'daily_posts', 'create: daily imageUrls 11개(>10) → 거부'),
  mkCreate(Object.assign({}, dailyData, { avatarHidden: true }),
           'ALLOW', 'daily_posts', 'create: daily avatarHidden bool → 허용 (프로필 숨기기)'),
  mkCreate(Object.assign({}, dailyData, { avatarHidden: 'yes' }),
           'DENY',  'daily_posts', 'create: daily avatarHidden 문자열 → 거부 (pOptBool)'),
  mkCreate(Object.assign({}, dailyData, { authorEmail: 'leak@e.com' }),
           'DENY',  'daily_posts', 'create: daily authorEmail 포함 → 거부 (H4)'),
  mkCreate(dailyData, 'DENY', 'daily_posts', 'create: daily 미인증(폰X·이메일미인증) → 거부 (H2)',
           { firebase: { sign_in_provider: 'password' } }),
  (() => { const c = mkCreate(dailyData, 'DENY', 'daily_posts', 'create: daily 비로그인 → 거부'); delete c.request.auth; return c; })(),
  mk({ label: 'daily 정지 계정 create → 거부 (notSuspended)', expectation: 'DENY',
       path: 'daily_posts/newdoc9', method: 'create', uid: 'testuser123',
       data: dailyData, userDocStatus: 'suspended' }),
  mkUnauth('ALLOW', 'daily_posts/abc', 'list', { limit: 20, orderBy: 'createdAt DESC' }, 'unauth: daily list limit 20 (보드 실쿼리)'),
  mkUnauth('DENY',  'daily_posts/abc', 'list', { limit: 100 },                           'unauth: daily list limit 100 → 거부 (빌링 캡)'),
  mkUnauth('ALLOW', 'daily_posts/abc', 'get',  null,                                     'unauth: daily get (상세 딥링크)'),
  mk({ label: 'daily 작성자 본인 update → 허용', expectation: 'ALLOW',
       path: 'daily_posts/existdoc9', method: 'update', uid: 'testuser123',
       data: Object.assign({}, dailyData, { intro: '수정된 소개' }),
       resourceData: dailyData }),
  mk({ label: 'daily 타인 update → 거부', expectation: 'DENY',
       path: 'daily_posts/existdoc9', method: 'update', uid: 'attacker999',
       data: Object.assign({}, dailyData, { intro: '변조' }),
       resourceData: dailyData }),
  mk({ label: 'daily 작성자 본인 delete → 허용', expectation: 'ALLOW',
       path: 'daily_posts/existdoc9', method: 'delete', uid: 'testuser123',
       resourceData: dailyData }),
  // ⑦ 1:1 채팅 (2026-07) — chats/messages/profiles
  //   chatId = {postId}_{inquirerUid} (reports 패턴) · participants 고정 2명 ·
  //   unreadFor⊆participants DoS 가드 · blockedBy 본인만 증감 · 차단 시 대화 동결 ·
  //   messages 는 부모 chat get 모킹(getMock) 필요
  mk({ label: 'chats create 유효 {postId}_{inquirerUid} → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: chatData }),
  mk({ label: 'chats create ID 패턴 불일치(임의 ID) → 거부', expectation: 'DENY',
       path: 'chats/randomid999', method: 'create', uid: 'testuser123',
       data: chatData }),
  mk({ label: 'chats create 자기 글에 채팅(owner==본인) → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, chatData, { ownerUid: 'testuser123', participants: ['testuser123', 'testuser123'] }) }),
  mk({ label: 'chats create participants 제3자 위조 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, chatData, { participants: ['owner456xyz', 'attacker999'] }) }),
  mk({ label: 'chats create unreadFor 비참여자 주입 → 거부 (배지 DoS 가드)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, chatData, { unreadFor: ['victimuid9'] }) }),
  mk({ label: 'chats create blockedBy 선차단 → 거부 (빈 배열 강제)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, chatData, { blockedBy: ['testuser123'] }) }),
  mk({ label: 'chats create 화이트리스트 밖 키 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, chatData, { spam: 'x' }) }),
  mk({ label: 'chats create 비로그인 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create',
       data: chatData }),
  (() => { const c = mk({ label: 'chats create 미인증(폰X·이메일미인증) → 거부 (H2)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: chatData }); delete c.request.auth.token.email_verified; return c; })(),
  mk({ label: 'chats create 정지 계정 → 거부 (notSuspended)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'create', uid: 'testuser123',
       data: chatData, userDocStatus: 'suspended' }),
  mk({ label: 'chats get 참여자 → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'get', uid: 'testuser123',
       resourceData: chatData }),
  mk({ label: 'chats get 비참여자 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'get', uid: 'attacker999',
       resourceData: chatData }),
  mk({ label: 'chats list 참여자 limit 20 (목록 실쿼리) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'list', uid: 'testuser123',
       query: { limit: 20, orderBy: 'lastMsgAt DESC' },
       resourceData: chatData }),
  mk({ label: 'chats list limit 50 → 거부 (빌링 캡)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'list', uid: 'testuser123',
       query: { limit: 50, orderBy: 'lastMsgAt DESC' },
       resourceData: chatData }),
  mk({ label: 'chats list 배지 쿼리(unreadFor 포함 doc, limit 1) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'list', uid: 'testuser123',
       query: { limit: 1 },
       resourceData: Object.assign({}, chatData, { unreadFor: ['testuser123'] }) }),
  mk({ label: 'chats update 메시지 요약(본인 발신) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { lastMsg: '안녕하세요', lastMsgAt: '2026-06-10T00:00:00Z',
                                           lastSenderUid: 'testuser123', unreadFor: ['owner456xyz'] }),
       resourceData: chatData }),
  mk({ label: 'chats update 허용 외 필드(postTitle) 변조 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { postTitle: '변조 제목' }),
       resourceData: chatData }),
  mk({ label: 'chats update 비참여자 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'attacker999',
       data: Object.assign({}, chatData, { lastMsg: 'x', lastMsgAt: '2026-06-10T00:00:00Z',
                                           lastSenderUid: 'attacker999' }),
       resourceData: chatData }),
  mk({ label: 'chats update lastSenderUid 위조(상대 명의 발신) → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { lastMsg: 'x', lastMsgAt: '2026-06-10T00:00:00Z',
                                           lastSenderUid: 'owner456xyz' }),
       resourceData: chatData }),
  mk({ label: 'chats update unreadFor 비참여자 주입 → 거부 (배지 DoS 가드)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { unreadFor: ['victimuid9'] }),
       resourceData: chatData }),
  mk({ label: 'chats update 차단(blockedBy 본인 추가) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { blockedBy: ['testuser123'] }),
       resourceData: chatData }),
  mk({ label: 'chats update blockedBy 에 타인 uid 추가 → 거부 (본인만 증감)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { blockedBy: ['owner456xyz'] }),
       resourceData: chatData }),
  mk({ label: 'chats update 상대 차단 해제 시도 → 거부 (본인만 증감)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { blockedBy: [] }),
       resourceData: Object.assign({}, chatData, { blockedBy: ['owner456xyz'] }) }),
  mk({ label: 'chats update 차단 상태 메시지 요약 갱신 → 거부 (대화 동결)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { blockedBy: ['owner456xyz'], lastMsg: 'x',
                                           lastMsgAt: '2026-06-10T00:00:00Z', lastSenderUid: 'testuser123' }),
       resourceData: Object.assign({}, chatData, { blockedBy: ['owner456xyz'] }) }),
  mk({ label: 'chats update 차단 상태 읽음 처리(unreadFor 비우기) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { blockedBy: ['owner456xyz'], unreadFor: [] }),
       resourceData: Object.assign({}, chatData, { blockedBy: ['owner456xyz'], unreadFor: ['testuser123'] }) }),
  mk({ label: 'chats update 본인 차단 해제 → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { blockedBy: [] }),
       resourceData: Object.assign({}, chatData, { blockedBy: ['testuser123'] }) }),
  mk({ label: 'chats delete 참여자 본인 → 거부 (기록 보존 — admin 전용)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'delete', uid: 'testuser123',
       resourceData: chatData }),
  mk({ label: 'messages create 참여자 → 허용 (부모 chat get 모킹)', expectation: 'ALLOW',
       path: 'chats/post123_testuser123/messages/msg1', method: 'create', uid: 'testuser123',
       data: msgData, getMock: chatParent }),
  mk({ label: 'messages create 비참여자 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'create', uid: 'attacker999',
       data: Object.assign({}, msgData, { senderUid: 'attacker999' }), getMock: chatParent }),
  mk({ label: 'messages create senderUid 위조 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'create', uid: 'testuser123',
       data: Object.assign({}, msgData, { senderUid: 'owner456xyz' }), getMock: chatParent }),
  mk({ label: 'messages create 차단 상태 → 거부 (대화 동결)', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'create', uid: 'testuser123',
       data: msgData, getMock: Object.assign({}, chatParent, { blockedBy: ['owner456xyz'] }) }),
  mk({ label: 'messages create 1001자 → 거부 (길이 캡)', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'create', uid: 'testuser123',
       data: Object.assign({}, msgData, { text: 'x'.repeat(1001) }), getMock: chatParent }),
  mk({ label: 'messages create 화이트리스트 밖 키 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'create', uid: 'testuser123',
       data: Object.assign({}, msgData, { imageUrl: 'https://x.com/a.jpg' }), getMock: chatParent }),
  mk({ label: 'messages list 참여자 limit 50 → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123/messages/msg1', method: 'list', uid: 'testuser123',
       query: { limit: 50, orderBy: 'createdAt DESC' }, getMock: chatParent,
       resourceData: msgData }),
  mk({ label: 'messages list limit 100 → 거부 (빌링 캡)', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'list', uid: 'testuser123',
       query: { limit: 100, orderBy: 'createdAt DESC' }, getMock: chatParent,
       resourceData: msgData }),
  mk({ label: 'messages list 비참여자 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'list', uid: 'attacker999',
       query: { limit: 50, orderBy: 'createdAt DESC' }, getMock: chatParent,
       resourceData: msgData }),
  mk({ label: 'messages update text 변경인데 edited 표시 없음 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       data: Object.assign({}, msgData, { text: '수정' }), resourceData: msgData }),
  mk({ label: 'messages 수정 본인·3분 후 (text+edited+editedAt) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-10T00:03:00Z',
       data: Object.assign({}, msgData, { text: '수정된 내용', edited: true, editedAt: '2026-06-10T00:03:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 수정 20시간 후 → 허용 (24시간 창)', expectation: 'ALLOW',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-10T20:00:00Z',
       data: Object.assign({}, msgData, { text: '수정된 내용', edited: true, editedAt: '2026-06-10T20:00:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 수정 25시간 후 → 거부 (24시간 창)', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-11T01:00:00Z',
       data: Object.assign({}, msgData, { text: '수정된 내용', edited: true, editedAt: '2026-06-11T01:00:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 수정 타인 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'owner456xyz',
       time: '2026-06-10T00:03:00Z',
       data: Object.assign({}, msgData, { text: '수정된 내용', edited: true, editedAt: '2026-06-10T00:03:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 수정으로 senderUid 변경 시도 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-10T00:03:00Z',
       data: Object.assign({}, msgData, { senderUid: 'owner456xyz', text: '수정', edited: true, editedAt: '2026-06-10T00:03:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages delete 발신자 본인 → 거부 (admin 전용)', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'delete', uid: 'testuser123',
       resourceData: msgData }),
  // ── 2026-10 본인 메시지 5분 내 삭제 표시(soft delete) ──
  mk({ label: 'messages 삭제표시 본인·3분 후 (text=\'\'+deleted+deletedAt) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-10T00:03:00Z',
       data: Object.assign({}, msgData, { text: '', deleted: true, deletedAt: '2026-06-10T00:03:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 삭제표시 6분 후 → 거부 (5분 창)', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-10T00:06:00Z',
       data: Object.assign({}, msgData, { text: '', deleted: true, deletedAt: '2026-06-10T00:06:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 삭제표시 타인(상대방) → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'owner456xyz',
       time: '2026-06-10T00:03:00Z',
       data: Object.assign({}, msgData, { text: '', deleted: true, deletedAt: '2026-06-10T00:03:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 삭제표시인데 text 남김 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-10T00:03:00Z',
       data: Object.assign({}, msgData, { deleted: true, deletedAt: '2026-06-10T00:03:00Z' }),
       resourceData: msgData }),
  mk({ label: 'messages 이미 삭제된 메시지 재변경 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123/messages/msg1', method: 'update', uid: 'testuser123',
       time: '2026-06-10T00:03:00Z',
       data: Object.assign({}, msgData, { text: '', deleted: true, deletedAt: '2026-06-10T00:03:00Z' }),
       resourceData: Object.assign({}, msgData, { text: '', deleted: true, deletedAt: '2026-06-10T00:01:00Z' }) }),
  // ── 2026-10 채팅방 나가기(hiddenFor) ──
  mk({ label: 'chats hiddenFor 본인 추가(나가기) + 읽음 처리 → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { hiddenFor: ['testuser123'], unreadFor: [] }),
       resourceData: Object.assign({}, chatData, { unreadFor: ['testuser123'] }) }),
  mk({ label: 'chats hiddenFor 에 타인 uid 추가 → 거부 (본인만 증감)', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { hiddenFor: ['owner456xyz'] }),
       resourceData: chatData }),
  mk({ label: 'chats hiddenFor 비참여자 주입 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { hiddenFor: ['testuser123', 'stranger999'] }),
       resourceData: chatData }),
  mk({ label: 'chats 메시지 전송 시 hiddenFor 전체 비우기(나간 상대에게 방 재노출) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { lastMsg: '다시 연락드려요', lastMsgAt: '2026-06-10T00:00:00Z',
                                           lastSenderUid: 'testuser123', unreadFor: ['owner456xyz'], hiddenFor: [] }),
       resourceData: Object.assign({}, chatData, { hiddenFor: ['owner456xyz'] }) }),
  mk({ label: 'chats 전송 아닌 update 로 상대 hiddenFor 제거 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { hiddenFor: [] }),
       resourceData: Object.assign({}, chatData, { hiddenFor: ['owner456xyz'] }) }),
  // ── 2026-10 내 마지막 메시지 수정·삭제 → 미리보기만 교체(lastMsgAt 유지, 알림·순서 변동 없음) + readAt ──
  mk({ label: 'chats 내 마지막 메시지 삭제: lastMsg만 교체 + 상대 unreadFor 되돌림(lastMsgAt 유지) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatLastMine, { lastMsg: '삭제된 메시지입니다', unreadFor: [] }),
       resourceData: chatLastMine }),
  mk({ label: 'chats 내 마지막 메시지 수정: lastMsg만 교체(unreadFor 그대로) → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatLastMine, { lastMsg: '수정한 내용' }),
       resourceData: chatLastMine }),
  mk({ label: 'chats 마지막 발신자가 상대인데 lastMsg 교체(lastMsgAt 없이) → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatLastMine, { lastSenderUid: 'owner456xyz', lastMsg: '삭제된 메시지입니다' }),
       resourceData: Object.assign({}, chatLastMine, { lastSenderUid: 'owner456xyz' }) }),
  mk({ label: 'chats lastMsg 교체하며 unreadFor 늘리기(상대에게 읽지 않음 심기) → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatLastMine, { lastMsg: '수정한 내용', unreadFor: ['owner456xyz'] }),
       resourceData: Object.assign({}, chatLastMine, { unreadFor: [] }) }),
  mk({ label: 'chats lastMsg 교체 + lastSenderUid 변조(lastMsgAt 없이) → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatLastMine, { lastMsg: '수정한 내용', lastSenderUid: 'owner456xyz' }),
       resourceData: chatLastMine }),
  mk({ label: 'chats 읽음 처리 + readAt 본인 키 serverTimestamp → 허용', expectation: 'ALLOW',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { unreadFor: [], readAt: { testuser123: '2026-06-10T00:00:00Z' } }),
       resourceData: Object.assign({}, chatData, { unreadFor: ['testuser123'] }) }),
  mk({ label: 'chats readAt 에 상대 키 쓰기 → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { readAt: { owner456xyz: '2026-06-10T00:00:00Z' } }),
       resourceData: chatData }),
  mk({ label: 'chats readAt 본인 키 과거 시각(serverTimestamp 아님) → 거부', expectation: 'DENY',
       path: 'chats/post123_testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, chatData, { readAt: { testuser123: '2026-06-01T00:00:00Z' } }),
       resourceData: chatData }),
  // ── 2026-10 집 구해요 프로필(seeker_profiles) ──
  mk({ label: 'seeker_profiles 본인 create(정상) → 허용', expectation: 'ALLOW',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123', data: seekerData }),
  mk({ label: 'seeker_profiles 타인 uid 로 create → 거부', expectation: 'DENY',
       path: 'seeker_profiles/owner456xyz', method: 'create', uid: 'testuser123', data: seekerData }),
  mk({ label: 'seeker_profiles create 미허용 필드(photoURL) → 거부 (사진 없음 확정)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { photoURL: 'https://x/y.jpg' }) }),
  mk({ label: 'seeker_profiles 공개 문서에 intro(비공개 칸) → 거부 (seeker_private 로만)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { intro: '조용합니다' }) }),
  mk({ label: 'seeker_profiles 공개 문서에 alerts.email → 거부 (이메일 비공개)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { alerts: { enabled: true, mode: 'daily', email: 'me@example.com' } }) }),
  mk({ label: 'seeker_profiles 옛 firstName 칸 → 거부 (닉네임만)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { firstName: '신행' }) }),
  mk({ label: 'seeker_profiles nick 없음 → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: (() => { const d = Object.assign({}, seekerData); delete d.nick; return d; })() }),
  mk({ label: 'seeker_profiles nick 에 전화번호 → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { nick: '0412345678' }) }),
  mk({ label: 'seeker_profiles states 에 없는 주 → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { states: ['qld', 'xx'] }) }),
  mk({ label: 'seeker_profiles suburbs 6개 → 거부 (최대 5)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { suburbs: Array(6).fill(seekerData.suburbs[0]) }) }),
  mk({ label: 'seeker_profiles suburbs 5개 + stay 상의 후 결정(tbd) → 허용 (표현식 한도 회귀 감시)', expectation: 'ALLOW',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { suburbs: Array(5).fill(seekerData.suburbs[0]), stay: 'tbd' }) }),
  mk({ label: 'seeker_profiles radiusKm 100 → 거부 (1~50)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { radiusKm: 100 }) }),
  mk({ label: 'seeker_profiles suburb 주 코드 틀림(xx) → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { suburbs: [Object.assign({}, seekerData.suburbs[0], { state: 'xx' })] }) }),
  mk({ label: 'seeker_profiles suburb 에 미허용 키(address) → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { suburbs: [Object.assign({}, seekerData.suburbs[0], { address: '12 Main St' })] }) }),
  mk({ label: 'seeker_profiles budgetMin > budgetMax → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { budgetMin: 300, budgetMax: 200 }) }),
  mk({ label: 'seeker_profiles roomTypes 에 없는 코드 → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { roomTypes: ['penthouse'] }) }),
  mk({ label: 'seeker_profiles 본인이 pausedAt 세팅 → 거부 (함수 전용)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerData, { pausedAt: '2026-06-10T00:00:00Z' }) }),
  mk({ label: 'seeker_profiles 미인증 계정 create → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'create', uid: 'testuser123', unverified: true, data: seekerData }),
  mk({ label: 'seeker_profiles 본인 update(정상, createdAt 유지) → 허용', expectation: 'ALLOW',
       path: 'seeker_profiles/testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, seekerData, { createdAt: '2026-06-01T00:00:00Z', visible: false }),
       resourceData: seekerExisting }),
  mk({ label: 'seeker_profiles update 로 createdAt 변조 → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'update', uid: 'testuser123',
       data: seekerData, resourceData: seekerExisting }),
  mk({ label: 'seeker_profiles update lastActiveAt 과거 시각 → 거부 (serverTimestamp 강제)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, seekerData, { createdAt: '2026-06-01T00:00:00Z', lastActiveAt: '2026-06-01T00:00:00Z' }),
       resourceData: seekerExisting }),
  mk({ label: 'seeker_profiles 일시정지된 프로필 다시 켜기(pausedAt 제거 + visible) → 허용', expectation: 'ALLOW',
       path: 'seeker_profiles/testuser123', method: 'update', uid: 'testuser123',
       data: Object.assign({}, seekerData, { createdAt: '2026-06-01T00:00:00Z', visible: true }),
       resourceData: Object.assign({}, seekerExisting, { visible: false, pausedAt: '2026-06-05T00:00:00Z' }) }),
  mk({ label: 'seeker_profiles 타인 update → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'update', uid: 'owner456xyz',
       data: Object.assign({}, seekerData, { createdAt: '2026-06-01T00:00:00Z' }), resourceData: seekerExisting }),
  mk({ label: 'seeker_profiles 타인 get visible=true → 허용', expectation: 'ALLOW',
       path: 'seeker_profiles/testuser123', method: 'get', uid: 'owner456xyz', resourceData: seekerExisting }),
  mk({ label: 'seeker_profiles 타인 get visible=false → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'get', uid: 'owner456xyz',
       resourceData: Object.assign({}, seekerExisting, { visible: false }) }),
  mk({ label: 'seeker_profiles 본인 get visible=false → 허용', expectation: 'ALLOW',
       path: 'seeker_profiles/testuser123', method: 'get', uid: 'testuser123',
       resourceData: Object.assign({}, seekerExisting, { visible: false }) }),
  mk({ label: 'seeker_profiles 집주인 list visible=true limit20 → 허용', expectation: 'ALLOW',
       path: 'seeker_profiles/testuser123', method: 'list', uid: 'owner456xyz',
       query: { limit: 20, orderBy: 'lastActiveAt DESC' }, resourceData: seekerExisting }),
  mk({ label: 'seeker_profiles list limit 50 → 거부 (빌링 캡)', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'list', uid: 'owner456xyz',
       query: { limit: 50, orderBy: 'lastActiveAt DESC' }, resourceData: seekerExisting }),
  mk({ label: 'seeker_profiles list 비공개 프로필 포함 → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'list', uid: 'owner456xyz',
       query: { limit: 20, orderBy: 'lastActiveAt DESC' }, resourceData: Object.assign({}, seekerExisting, { visible: false }) }),
  mk({ label: 'seeker_profiles 비로그인 get → 거부', expectation: 'DENY',
       path: 'seeker_profiles/testuser123', method: 'get', resourceData: seekerExisting }),
  // seeker_private — 본인만
  mk({ label: 'seeker_private 본인 create(정상) → 허용', expectation: 'ALLOW',
       path: 'seeker_private/testuser123', method: 'create', uid: 'testuser123', data: seekerPrivData }),
  mk({ label: 'seeker_private 본인 update(정상) → 허용', expectation: 'ALLOW',
       path: 'seeker_private/testuser123', method: 'update', uid: 'testuser123', data: seekerPrivData,
       resourceData: Object.assign({}, seekerPrivData, { updatedAt: '2026-06-01T00:00:00Z' }) }),
  mk({ label: 'seeker_private 타인 uid 로 create → 거부', expectation: 'DENY',
       path: 'seeker_private/owner456xyz', method: 'create', uid: 'testuser123', data: seekerPrivData }),
  mk({ label: 'seeker_private intro 에 전화번호 → 거부', expectation: 'DENY',
       path: 'seeker_private/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerPrivData, { intro: '연락은 0412 345 678 로 주세요' }) }),
  mk({ label: 'seeker_private intro 에 URL → 거부', expectation: 'DENY',
       path: 'seeker_private/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerPrivData, { intro: '제 소개는 https://example.com 참고' }) }),
  mk({ label: 'seeker_private 미허용 칸(nick) → 거부', expectation: 'DENY',
       path: 'seeker_private/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerPrivData, { nick: '신행' }) }),
  mk({ label: 'seeker_private updatedAt 과거 시각 → 거부', expectation: 'DENY',
       path: 'seeker_private/testuser123', method: 'create', uid: 'testuser123',
       data: Object.assign({}, seekerPrivData, { updatedAt: '2026-06-01T00:00:00Z' }) }),
  mk({ label: 'seeker_private 미인증 계정 create → 거부', expectation: 'DENY',
       path: 'seeker_private/testuser123', method: 'create', uid: 'testuser123', unverified: true, data: seekerPrivData }),
  mk({ label: 'seeker_private 본인 get → 허용', expectation: 'ALLOW',
       path: 'seeker_private/testuser123', method: 'get', uid: 'testuser123', resourceData: seekerPrivData }),
  mk({ label: 'seeker_private 타인(집주인) get → 거부 (이메일·소개글 비공개)', expectation: 'DENY',
       path: 'seeker_private/testuser123', method: 'get', uid: 'owner456xyz', resourceData: seekerPrivData }),
  mk({ label: 'seeker_private 일반 회원 list → 거부', expectation: 'DENY',
       path: 'seeker_private/testuser123', method: 'list', uid: 'owner456xyz',
       query: { limit: 20 }, resourceData: seekerPrivData }),
  mk({ label: 'seeker_private 관리자 get → 허용', expectation: 'ALLOW',
       path: 'seeker_private/testuser123', method: 'get', uid: 'adminuid001', admin: true, resourceData: seekerPrivData }),
  // users.roles — Living/Job 역할 (①-2)
  mk({ label: 'users 본인 update roles{living:seeker, job:employer} → 허용', expectation: 'ALLOW',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', roles: { living: 'seeker', job: 'employer' }, rolesAskedAt: '2026-06-10T00:00:00Z' },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  mk({ label: 'users roles 에 없는 값(living:landlord) → 거부', expectation: 'DENY',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', roles: { living: 'landlord' } },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  mk({ label: 'users notify{mode:daily, dailyAt:08:30} → 허용', expectation: 'ALLOW',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', notify: { mode: 'daily', dailyAt: '08:30' } },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  mk({ label: 'users notify dailyAt 25:99 → 거부', expectation: 'DENY',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', notify: { mode: 'daily', dailyAt: '25:99' } },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  mk({ label: 'users roles 에 미허용 키(auto) → 거부', expectation: 'DENY',
       path: 'users/testuser123', method: 'update', uid: 'testuser123',
       data:         { email: 'e@e.com', nickname: 'n', roles: { living: 'owner', auto: 'seller' } },
       resourceData: { email: 'e@e.com', nickname: 'n' } }),
  // profiles — 공개 최소 카드 (닉네임/사진만)
  mk({ label: 'profiles 본인 create(nickname+photoURL) → 허용', expectation: 'ALLOW',
       path: 'profiles/testuser123', method: 'create', uid: 'testuser123',
       data: { nickname: '테스터', photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg',
               updatedAt: '2026-06-10T00:00:00Z' } }),
  mk({ label: 'profiles 타인 doc 쓰기 → 거부', expectation: 'DENY',
       path: 'profiles/owner456xyz', method: 'create', uid: 'testuser123',
       data: { nickname: '사칭' } }),
  mk({ label: 'profiles PII(email) 포함 → 거부 (hasOnly)', expectation: 'DENY',
       path: 'profiles/testuser123', method: 'create', uid: 'testuser123',
       data: { nickname: '테스터', email: 'leak@e.com' } }),
  mk({ label: 'profiles photoURL http(비-https) → 거부', expectation: 'DENY',
       path: 'profiles/testuser123', method: 'create', uid: 'testuser123',
       data: { nickname: '테스터', photoURL: 'http://evil.com/p.jpg' } }),
  mk({ label: 'profiles get 로그인 유저 → 허용 (채팅 상대 별명 조회)', expectation: 'ALLOW',
       path: 'profiles/owner456xyz', method: 'get', uid: 'testuser123',
       resourceData: { nickname: '글쓴이' } }),
  mkUnauth('DENY', 'profiles/owner456xyz', 'get', null, 'unauth: profiles get → 거부 (크롤링 차단)'),
  mk({ label: 'profiles list → 거부 (열거 차단)', expectation: 'DENY',
       path: 'profiles/owner456xyz', method: 'list', uid: 'testuser123', query: { limit: 20 } }),
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
