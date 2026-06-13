// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 히어로 배너 (전 페이지 공통 — 통합 배너 시스템)
//  - 사용법: 페이지 헤더 직하단에 컨테이너 한 줄 삽입
//      <section class="koaus-hero" data-koaus-hero-cat="accom"></section>
//      띠 배너 페이지는 data-koaus-hero-variant="strip" + class koaus-hero--strip 추가
//    그리고 <script src="hero-banner.js" defer></script> 로드.
//  - 타겟 기준은 "유저의 주 이용 주" 단일 (koaus_state_scores, 21일 반감기):
//      ① 성향 주(점수 ≥1.5) → ② 페이지 ?state= (성향 미확정 폴백) → ③ all 배너
//      → ④ 하우스 광고(house:true 문서) → ⑤ 하드코딩 SLOTS
//  - 카테고리별 기본 슬라이드 자동 렌더링 — PC + 모바일 동일 swiper, 동일 콘텐츠
//  - Swiper CDN 이 이미 페이지에 로드돼 있으면 자동 활성화, 없으면 동적 로드
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausHeroBannerInited) return;
  window.__koausHeroBannerInited = true;

  // ── 카테고리별 4개 슬라이드 데이터 (gradients 도 4개 — 시각적 다양성) ──
  //   · 로컬 애널리틱스 타겟팅 모듈이 이 데이터를 런타임에 덮어쓸 수 있음.
  const SLOTS = {
    accom: {
      gradients: ['hero-bg--home1', 'hero-bg--home2', 'hero-bg--edu2', 'hero-bg--legal3'],
      slides: [
        { eyebrow: '🏠 쉐어 (Share)',     title: '한인 쉐어하우스 찾기, 지도 한 번에.', sub: '시드니·멜버른·브리즈번 — 매물 사진과 위치를 한눈에 비교',  cta: { href: '#postGrid', label: '매물 보기 →' } },
        { eyebrow: '안전 거래 가이드',    title: '보증금·계약 사기 주의.',              sub: '직접 방문 + 단계별 결제 + 카카오 단톡 인증으로 안전하게',  cta: null },
        { eyebrow: '필터로 빠르게',       title: '방 형태·기간·성별·반려동물까지.',     sub: '내 조건에 맞는 매물만 골라 보세요',                          cta: null },
        { eyebrow: '⭐ 저장 · ☑ 연락',    title: '관심 매물은 한 번에 관리.',           sub: '저장한 글·연락한 글은 마이페이지에서 모두 확인',             cta: null },
      ],
    },
    rent: {
      gradients: ['hero-bg--home2', 'hero-bg--legal3', 'hero-bg--edu3', 'hero-bg--home1'],
      slides: [
        { eyebrow: '🏘 렌트 (Rent)',       title: '호주 한인 렌트 매물.',                sub: '룸·하우스·아파트 — 침실·욕실·주차까지 필터 검색',           cta: { href: '#postGrid', label: '리스트 보기 →' } },
        { eyebrow: '한인 매물 우선',       title: '한국어 가능 임대인 위주.',           sub: '계약서·등록비·전기·인터넷 안내까지 자세히 확인',             cta: null },
        { eyebrow: '예산·평수·옵션',       title: '월세 한도 + 가구 옵션으로 검색.',     sub: '주 단위 / 월 단위 임대료 환산까지 자동',                     cta: null },
        { eyebrow: '주변 인프라',          title: '교통·학교·마트까지 한눈에.',          sub: '지도로 매물 주변 환경 시뮬레이션',                            cta: null },
      ],
    },
    jobs: {
      gradients: ['hero-bg--legal3', 'hero-bg--edu3', 'hero-bg--legal1', 'hero-bg--home3'],
      slides: [
        { eyebrow: '💼 Work',               title: '한인 구인구직, 매일 새 글.',         sub: '워홀·학생·영주권자 — 시드니·멜번 전 지역 일자리',           cta: { href: '#postList', label: '일자리 보기 →' } },
        { eyebrow: 'Fair Work 가이드',     title: '최저 임금·세금·연차 확인.',          sub: '불법 구인 광고 신고 → 즉시 삭제. 안전한 근로 환경',          cta: null },
        { eyebrow: '구인 · 구직',           title: '직원 채용도 한 번에 등록.',          sub: '시급·근무 시간·자격 요건을 한 페이지에서',                    cta: null },
        { eyebrow: '지역 필터',             title: 'CBD·교외·로컬 단위 맞춤 매칭.',      sub: '집과 가까운 일자리만 모아 보기',                              cta: null },
      ],
    },
    auto: {
      gradients: ['hero-bg--legal2', 'hero-bg--home1', 'hero-bg--legal3', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '🚗 Auto',               title: '한인 정비·견인·렌트카.',             sub: '24시간 출동·한국어 응대·합리적인 가격',                       cta: { href: '#postGrid', label: '서비스 보기 →' } },
        { eyebrow: '정비소 · 견인',         title: '한인 정비소·견인 한 곳에서.',        sub: '견적 비교 · 긴급 견인 · 한국어 응대',                         cta: null },
        { eyebrow: '중고차 매물',           title: '개인·딜러 매물 한 곳에서.',          sub: '연식·주행거리·가격대로 빠르게 비교',                          cta: null },
        { eyebrow: '렌트카',                title: '단기·장기 렌트카 한인 업체.',         sub: '공항 인수·자차·보험까지 한국어로 안내',                       cta: null },
      ],
    },
    trades: {
      gradients: ['hero-bg--legal1', 'hero-bg--legal2', 'hero-bg--home3', 'hero-bg--edu1'],
      slides: [
        { eyebrow: '🔧 Skilled Trades',     title: '한인 기술자 — 전기·배관·페인팅·핸디맨.', sub: '출장비·경력·서비스 지역을 한 페이지에서 비교',             cta: { href: '#postGrid', label: '기술자 보기 →' } },
        { eyebrow: '한국어 소통',           title: '한국어로 소통하는 기술자 찾기.',     sub: '분야별 모아 보기 → 바로 견적 문의',                           cta: null },
        { eyebrow: '견적 요청',             title: '한 번에 여러 업체 견적 비교.',       sub: '평일·주말·공휴일 출동 가능 여부 확인',                        cta: null },
        { eyebrow: '분야 필터',             title: '필요한 분야만 골라 보기.',            sub: '출장 지역 · 연락처를 한 페이지에서',                          cta: null },
      ],
    },
    restaurants: {
      gradients: ['hero-bg--edu1', 'hero-bg--edu3', 'hero-bg--home2', 'hero-bg--legal3'],
      slides: [
        { eyebrow: '🍱 K-Food', title: '등록된 K-Food, 지도와 함께.', sub: '한식·중식·치킨·BBQ·카페 — 가격대와 영업시간을 한눈에',     cta: { href: '#postGrid', label: '식당 보기 →' } },
        { eyebrow: '편의시설 필터',         title: '주차·배달·포장·할랄 옵션까지.',      sub: '음식 종류 + 편의시설 + 영업 상태로 빠르게 검색',              cta: null },
        { eyebrow: '영업 시간',             title: '요일별 영업·휴무를 7일 표로.',       sub: '오늘 영업 중인 가게만 골라 보기',                             cta: null },
        { eyebrow: '사장님 직접 등록',      title: '한인 사장님이 직접 등록한 가게.',     sub: '메뉴 · 가격 · 영업시간 최신 정보',                            cta: null },
      ],
    },
    salon: {
      gradients: ['hero-bg--edu1', 'hero-bg--legal3', 'hero-bg--home2', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '💇 한인 미용실',        title: '커트·펌·염색·매직 한 곳에서.',       sub: '한국 스타일 · 한국어 디자이너 · 가격 투명',                   cta: { href: '#postGrid', label: '미용실 보기 →' } },
        { eyebrow: '서비스 필터',           title: '커트·펌·염색·붙임머리까지.',         sub: '내가 원하는 서비스만 빠르게 검색',                            cta: null },
        { eyebrow: '커트 가격',             title: '디자이너별 커트 · 펌 가격 비교.',    sub: '학생 할인 · 주차 · 카드 결제 옵션도 확인',                    cta: null },
        { eyebrow: '지도 보기',             title: '내 주변 한인 미용실 찾기.',           sub: '지도에서 위치 · 연락처 바로 확인',                            cta: null },
      ],
    },
    gp: {
      gradients: ['hero-bg--edu2', 'hero-bg--legal3', 'hero-bg--home1', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '🏥 Korean-Speaking GP', title: '한국어 가능 GP·치과·소아과.',         sub: '진료과 + 한국어 가능 여부 + Bulk Billing + 텔레헬스',         cta: { href: '#postGrid', label: 'GP 보기 →' } },
        { eyebrow: '워크인·예약',           title: '워크인 가능 클리닉도 한눈에.',        sub: '주말·저녁 진료 / 텔레헬스 / 한인 직원 보유 정보',             cta: null },
        { eyebrow: '진료시간 7일',          title: '요일별 진료 시간을 표로.',           sub: '오늘 진료 중인 의원만 골라 보기',                             cta: null },
        { eyebrow: 'Bulk Billing',          title: '메디케어 무료 진료 의원.',           sub: '한국어 진료 + Bulk Billing 옵션',                              cta: null },
      ],
    },
    points: {
      gradients: ['hero-bg--legal1', 'hero-bg--legal3', 'hero-bg--edu2', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '🛡 Visa · 법무 · 유학', title: '비자 · 영주권 · 유학원 한 곳에서.',   sub: '한인 법무법인 + 유학원 추천 + 무료 기술심사 가채점',         cta: { href: '#legalSection', label: '법무법인 보기 →' } },
        { eyebrow: '📊 기술심사 가채점',    title: '내 PR 점수, 미리 확인.',              sub: '나이·영어·학력·경력·NAATI·PY 자동 계산',                       cta: { href: '?cat=points', label: '가채점 시작 →' } },
        { eyebrow: '🎓 유학원',              title: '한인 유학원 추천.',                   sub: '어학원 · TAFE · 대학 — 무료 입학 상담',                        cta: { href: '?cat=education', label: '유학원 보기 →' } },
        { eyebrow: '⚖ 한인 법무법인',       title: '비자 · 영주권 · 가족 합류.',          sub: '한국어 가능 변호사 — 시드니 · 멜번 · 브리즈번',                cta: { href: '?cat=legal', label: '법무 상담 →' } },
      ],
    },
    'car-sale': {
      gradients: ['hero-bg--legal2', 'hero-bg--home1', 'hero-bg--legal3', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '🚗 중고차 판매',        title: '한인 중고차 매물 한 곳에서.',         sub: '개인 · 딜러 매물 — 연식 · 주행 · 가격대 비교',                cta: { href: '#postGrid', label: '매물 보기 →' } },
        { eyebrow: '꼼꼼한 확인',           title: '계약 전 차량 상태 직접 확인.',        sub: 'VIN · 정비 이력 · REGO 확인은 필수',                           cta: null },
        { eyebrow: '시세 비교',             title: '같은 모델 · 같은 연식 가격 한눈에.',  sub: 'CarsGuide · CarSales 가격 참고',                              cta: null },
        { eyebrow: '딜러 · 개인',           title: '딜러 · 개인 매물 함께 보기.',         sub: '판매 유형 필터로 원하는 매물만',                              cta: null },
      ],
    },
    mypage: {
      gradients: ['hero-bg--home1', 'hero-bg--home3', 'hero-bg--legal3', 'hero-bg--edu2'],
      slides: [
        { eyebrow: '👤 내 계정',             title: '내 글·저장 글·연락한 글 한 곳에서.', sub: 'KoAus 활동을 한눈에 관리 — 닉네임·테마·구독 설정까지',        cta: null },
        { eyebrow: '안전한 거래',           title: '연락 완료 표시로 진행 상황 추적.',   sub: '쉐어·렌트 매물에 ☑ 표시 → 마이페이지에서 한 번에 확인',       cta: null },
        { eyebrow: '닉네임 · 사진',         title: '프로필 사진과 별명도 변경.',         sub: '3개월에 한 번 닉네임 변경 가능',                              cta: null },
        { eyebrow: '이름 공개 설정',        title: '이름(Name) 공개 ON/OFF.',            sub: '기본은 별명 노출 — 마이페이지에서 토글',                       cta: null },
      ],
    },
    // ── 홈 (index) — 슬라이드 전체가 클릭 영역(href) — 옛 index 인라인 마크업 이관 ──
    home: {
      gradients: ['hero-bg--home1', 'hero-bg--home2', 'hero-bg--home3', 'hero-bg--legal3'],
      slides: [
        { href: '#sectionShortcuts',        eyebrow: 'KoAus · Korea ↔ Australia', title: '호주 한인 생활의 모든 것, 한 곳에서.', sub: '쉐어·렌트·구인구직·정비·식당·법무·유학 — 한인 커뮤니티 포털', cta: { label: '서비스 둘러보기 →' } },
        { href: 'accom.html',               eyebrow: '실시간 매물 · 지도 보기',   title: '쉐어·렌트, 위치까지 한눈에.',          sub: '시드니·멜버른·브리즈번 — 한인 매물을 지도와 사진으로 확인하세요', cta: { label: '쉐어 보러가기 →' } },
        { href: 'about.html',               eyebrow: 'KoAus',                     title: '미래는 호주에서, 추억은 한국에서.',     sub: '둘 다 KoAus에서.',                                            cta: { label: 'KoAus 소개 보기 →' } },
        { href: 'points.html?cat=visa-edu', eyebrow: 'Visa · 법무 · 유학',        title: '호주 정착부터 비자까지 한 페이지.',     sub: '법무법인·유학원 추천 + 기술심사 가채점 도구 무료 제공',        cta: { label: '상담 시작 →' } },
      ],
    },
    // ── 띠 배너(strip variant) 페이지 — 슬림 2슬라이드 기본 (광고 미배정 시 폴백) ──
    care: {
      gradients: ['hero-bg--edu2', 'hero-bg--home1'],
      slides: [
        { eyebrow: '🤝 Care',     title: '긴급 연락처 · 영사관 · 상비약 정보.',        sub: '000 · 영사콜센터 · 한인 의료 정보를 한 페이지에', cta: null },
        { eyebrow: '📢 KoAus',    title: '쉐어 · 구인 · 중고차 — 한인 게시판.',        sub: '호주 한인 커뮤니티 포털',                          cta: { href: 'index.html', label: '둘러보기 →' } },
      ],
    },
    powerball: {
      gradients: ['hero-bg--legal2', 'hero-bg--home3'],
      slides: [
        { eyebrow: '🎱 Powerball', title: '호주 파워볼 당첨 번호 확인.',               sub: '최신 회차 결과를 한눈에',                          cta: null },
        { eyebrow: '📢 KoAus',    title: '쉐어 · 구인 · 중고차 — 한인 게시판.',        sub: '호주 한인 커뮤니티 포털',                          cta: { href: 'index.html', label: '둘러보기 →' } },
      ],
    },
    calculator: {
      gradients: ['hero-bg--edu1', 'hero-bg--legal3'],
      slides: [
        { eyebrow: '💸 송금 비교', title: '환율 · 송금 수수료 한눈에 비교.',           sub: 'AUD ↔ KRW 송금 전 필수 체크',                      cta: null },
        { eyebrow: '📢 KoAus',    title: '쉐어 · 구인 · 중고차 — 한인 게시판.',        sub: '호주 한인 커뮤니티 포털',                          cta: { href: 'index.html', label: '둘러보기 →' } },
      ],
    },
    state: {
      gradients: ['hero-bg--home2', 'hero-bg--edu2'],
      slides: [
        { eyebrow: '🗺 주별 정보', title: 'NSW · VIC · QLD — 주별 생활 정보 허브.',    sub: '교통 · 의료 · 교육 정보를 주별로',                 cta: null },
        { eyebrow: '📢 KoAus',    title: '쉐어 · 구인 · 중고차 — 한인 게시판.',        sub: '호주 한인 커뮤니티 포털',                          cta: { href: 'index.html', label: '둘러보기 →' } },
      ],
    },
  };

  // admin 화면(admin-ads.html 히어로 탭)이 "기본 슬라이드 N" 라벨 표시에 참조 — 복제 금지
  window.koausHeroSlots = SLOTS;

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function buildSlide(slide, gradientCls, idx) {
    // slide.href — 슬라이드 전체가 클릭 영역(home 등). 이때 cta 는 시각 표시만(span)
    const cta = slide.cta
      ? (slide.href
          ? `<span class="hero-cta">${escHtml(slide.cta.label)}</span>`
          : `<a class="hero-cta" href="${escHtml(slide.cta.href)}">${escHtml(slide.cta.label)}</a>`)
      : '';
    const content = `<div class="hero-content">
        <span class="hero-eyebrow">${escHtml(slide.eyebrow)}</span>
        <h2 class="hero-title">${escHtml(slide.title)}</h2>
        <p class="hero-sub">${escHtml(slide.sub)}</p>
        ${cta}
      </div>`;
    if (slide.href) {
      return `<a class="swiper-slide ${gradientCls}" data-koaus-slot="${idx}" href="${escHtml(slide.href)}">${content}</a>`;
    }
    return `<div class="swiper-slide ${gradientCls}" data-koaus-slot="${idx}">${content}</div>`;
  }

  // ── 지역 코드 → 한국어 라벨 (로컬 애널리틱스 슬롯 분배 시 eyebrow 보강) ──
  const STATE_LABEL = {
    nsw:'NSW', vic:'VIC', qld:'QLD', wa:'WA', sa:'SA', tas:'TAS', act:'ACT', nt:'NT',
  };

  // 옛 24h 숨기기(X 버튼) 잔재 정리 — 광고는 항상 노출 정책으로 변경 (2026-06)
  try { localStorage.removeItem('koaus-dismissed-ads'); } catch (_) {}

  // ════════════════════════════════════════════════════════════════════
  //  관리자 등록 배너 (Firestore hero_banners) — 슬롯 N번 자리만 교체
  //   · admin-ads.html 에서 등록된 데이터 (광고주 배너 + house:true 하우스 광고)
  //   · slots 맵({nsw:1, qld:2, all:3 …})이 주별 독립 슬롯 — "타겟 주" 키 우선,
  //     없으면 'all' 키. slots 없는 옛 문서는 order(단일) + regions 로 fallback
  //   · 타겟 주 = ① 유저 성향 주(koaus_state_scores ≥1.5) → ② 페이지 ?state= → ③ 없음(all만)
  //   · 슬롯 N(1~4) 배너가 기본 슬라이드 N번 자리만 교체 — 나머지 기본 슬라이드 유지
  //   · 같은 슬롯 충돌: 광고주 > 하우스(house:true), 특정 주 > 'all',
  //     같은 구체성이면 최신 등록(createdAt) 우선
  //   · start/end(YYYY-MM-DD) 기간 밖 배너는 제외 (광고 계약 기간)
  //   · 매칭 배너 0건 또는 fetch 실패 → SLOTS 전체 노출 (기존 사용자 경험 보존)
  //   · IIFE 안에서 dynamic import 로 Firebase SDK 로드 (페이지 script 태그 변경 불필요)
  // ════════════════════════════════════════════════════════════════════
  function currentState() {
    try { return (new URLSearchParams(location.search).get('state') || '').toLowerCase(); }
    catch (_) { return ''; }
  }

  // ── 유저 성향 주 판정 — local-analytics.js 의 koaus_state_scores 를 읽기 전용 사용 ──
  //   · 점수 쓰기는 local-analytics.js recordAdScore 가 전 페이지에서 전담 (여기서 쓰지 말 것)
  //   · 반감기·minScore 는 옛 koaus-ads.js OPTIONS 와 동일 값 유지 (21일 / 1.5)
  //   · koaus_state_override(localStorage, JSON 문자열 예: "nsw") 로 강제 지정 — 디버그·실연용
  const TARGET_STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
  const SCORE_HALF_LIFE_MS = 21 * 86400000;
  const SCORE_MIN = 1.5;
  function dominantState() {
    try {
      const ov = JSON.parse(localStorage.getItem('koaus_state_override') || 'null');
      if (TARGET_STATES.indexOf(ov) !== -1) return ov;
    } catch (_) {}
    try {
      const raw = JSON.parse(localStorage.getItem('koaus_state_scores') || '{}') || {};
      const now = Date.now();
      let best = null, bestVal = 0;
      TARGET_STATES.forEach(s => {
        const e = raw[s];
        if (!e) return;
        const v = e.last
          ? (e.score || 0) * Math.pow(0.5, Math.max(0, now - e.last) / SCORE_HALF_LIFE_MS)
          : (e.score || 0);
        if (v > bestVal) { bestVal = v; best = s; }
      });
      if (best && bestVal >= SCORE_MIN) return best;
    } catch (_) {}
    return null;
  }
  let _targetState;
  function targetState() {
    if (_targetState === undefined) {
      const cs = currentState();
      _targetState = dominantState() || (TARGET_STATES.indexOf(cs) !== -1 ? cs : '') || '';
    }
    return _targetState;
  }

  // 기간 필터 — 옛 koaus-ads.js 와 동일 해석 (start 00:00:00 ~ end 23:59:59, 로컬 시간)
  function inPeriod(b) {
    try {
      const now = Date.now();
      if (b.start && new Date(b.start + 'T00:00:00').getTime() > now) return false;
      if (b.end   && new Date(b.end   + 'T23:59:59').getTime() < now) return false;
    } catch (_) {}
    return true;
  }

  // 페이지 진입 시 1회만 fetch — 결과 캐시 (다중 컨테이너 재사용)
  let _adminBannersPromise = null;
  function fetchAdminBanners() {
    if (_adminBannersPromise) return _adminBannersPromise;
    _adminBannersPromise = (async () => {
      try {
        const [{ initializeApp, getApps, getApp }, fb] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js'),
        ]);
        const firebaseConfig = {
          apiKey: 'AIzaSyCamqnt0bNUD9uz1N5BbCuQjSkWLSpPqlU',
          authDomain: 'koaus-f564c.firebaseapp.com',
          projectId: 'koaus-f564c',
          storageBucket: 'koaus-f564c.firebasestorage.app',
          messagingSenderId: '663988594088',
          appId: '1:663988594088:web:ef30c2fd557407b00b299d',
        };
        const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        const db  = fb.getFirestore(app);
        // active=true 만 조건 — orderBy(order)는 색인 부담 회피 위해 클라이언트 정렬
        // limit 20 — firestore.rules limitedList() 와 일치 (빌링 안전망)
        const snap = await fb.getDocs(fb.query(
          fb.collection(db, 'hero_banners'),
          fb.where('active', '==', true),
          fb.limit(20),
        ));
        const state = targetState();
        const matchesTarget = b => {
          if (b.slots && typeof b.slots === 'object'
              && (b.slots.all != null || (state && b.slots[state] != null))) return true;
          return Array.isArray(b.regions) && b.regions.length
                 && (b.regions.includes('all') || (state && b.regions.includes(state)));
        };
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => matchesTarget(b) && inPeriod(b));
      } catch (e) {
        console.warn('[hero-banner] admin 배너 fetch 실패 — SLOTS fallback', e);
        return [];
      }
    })();
    return _adminBannersPromise;
  }

  // 관리자 배너 슬라이드 — 이미지 + 클릭 링크 (linkUrl 있으면 새 탭)
  function buildAdminSlide(banner, idx) {
    // URL 스킴 화이트리스트 — admin 이 입력하지만 권한 탈취·실수 대비 (javascript: 등 차단)
    const rawLink = banner.linkUrl || '';
    const link = (window.koausUrlGuard && window.koausUrlGuard.isSafeHttp(rawLink)) ? rawLink : '';
    const rawImg = banner.imageUrl || '';
    const safeImg = (window.koausUrlGuard && window.koausUrlGuard.isSafeHttp(rawImg)) ? rawImg : '';
    const alt  = escHtml(banner.alt || '히어로 배너');
    const img  = escHtml(safeImg);
    const docId = escHtml(banner.id || '');
    // 첫 슬라이드(idx 0)는 above-the-fold LCP — eager + 높은 우선순위로 즉시 로드. 나머지 lazy.
    const _ld = idx === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    const imgEl = `<img src="${img}" alt="${alt}" ${_ld} style="width:100%;height:100%;object-fit:cover;display:block;">`;
    // position:relative;z-index:1 — 슬라이드 ::before 오버레이보다 위 (클릭 가로채기 방지 안전망)
    const wrap = link
      ? `<a href="${escHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="${alt}" style="display:block;width:100%;height:100%;position:relative;z-index:1;">${imgEl}</a>`
      : imgEl;
    return `<div class="swiper-slide koaus-hero-admin-slide" data-koaus-slot="${idx}" data-koaus-banner-id="${docId}" style="background:var(--bg-base,#000);position:relative;">${wrap}</div>`;
  }

  // 매칭 배너 → 슬롯 배정: 슬롯 N 배너가 N-1 인덱스 차지 (배열 길이 = 기본 슬라이드 수)
  //   슬롯 번호 해석: slots[현재 주] > slots.all > 옛 order (단일 필드 fallback)
  //   충돌 규칙: ① 특정 주 배너 > 'all' 배너 ② 같은 구체성이면 createdAt 최신 우선
  //   슬롯 누락/범위 밖(옛 doc 기본 99 등) → 1로 간주
  function resolveSlot(b, state, slotCount) {
    let ord;
    if (b.slots && typeof b.slots === 'object') {
      if (state && b.slots[state] != null) ord = Number(b.slots[state]);
      else if (b.slots.all != null)        ord = Number(b.slots.all);
    }
    if (ord == null || !Number.isFinite(ord)) ord = Number(b.order);
    if (!Number.isFinite(ord) || ord < 1 || ord > slotCount) ord = 1;
    return ord;
  }
  function assignSlots(banners, slotCount) {
    const slots = new Array(slotCount).fill(null);
    if (!banners || !banners.length) return slots;
    const state = targetState();
    // 우선순위: 광고주(+2) > 하우스(house:true, +0), 특정 주(+1) > all(+0)
    //   → 광고주 특정주 3 > 광고주 all 2 > 하우스 특정주 1 > 하우스 all 0
    const specificity = b => {
      let s = b.house === true ? 0 : 2;
      if (state && b.slots && typeof b.slots === 'object' && b.slots[state] != null) s += 1;
      else if (state && Array.isArray(b.regions) && b.regions.includes(state)
          && !(b.slots && typeof b.slots === 'object' && b.slots.all != null)) s += 1;
      return s;
    };
    const ts = b => (b.createdAt && typeof b.createdAt.toMillis === 'function') ? b.createdAt.toMillis() : 0;
    banners.forEach(b => {
      const i = resolveSlot(b, state, slotCount) - 1;
      const cur = slots[i];
      if (!cur
          || specificity(b) > specificity(cur)
          || (specificity(b) === specificity(cur) && ts(b) > ts(cur))) {
        slots[i] = b;
      }
    });
    return slots;
  }

  function render(container, banners) {
    const cat = container.getAttribute('data-koaus-hero-cat');
    const data = SLOTS[cat];
    if (!data) {
      console.warn('[hero-banner] unknown category:', cat);
      container.innerHTML = '';
      return;
    }
    if (container.__koausHeroRendered) return;
    container.__koausHeroRendered = true;
    container.classList.add('koaus-hero');
    if (container.getAttribute('data-koaus-hero-variant') === 'strip') {
      container.classList.add('koaus-hero--strip');
    }

    // ── admin 배너 슬롯 배정 — order N 배너가 기본 슬라이드 N번 자리만 교체 ──
    const slotBanners = assignSlots(banners, data.slides.length);
    const adminCount = slotBanners.filter(Boolean).length;

    // ── 로컬 애널리틱스 — 14일 활동 기반 4 슬롯 지역 분배 ──
    //   · allocateSlots 가 ['nsw','nsw','vic','sa'] 같은 4개 지역 배열 반환
    //   · 각 슬라이드의 eyebrow 앞에 [지역] 태그 inject (실제 슬라이드 데이터는 SLOTS 유지)
    //   · agent.md §1 — 로컬 애널리틱스 절대 훼손 X, hero-banner 의 SLOTS 데이터도 그대로
    let slotStates = [];
    try {
      if (window.koausAnalytics && typeof window.koausAnalytics.allocateSlots === 'function') {
        slotStates = window.koausAnalytics.allocateSlots(data.slides.length);
      }
    } catch (_) {}
    // 데스크톱 + 모바일 동일 swiper — 모바일 단일카드 패턴 폐기
    const slidesHtml = data.slides
      .map((s, i) => {
        // admin 배너가 배정된 슬롯은 교체, 나머지는 기본 슬라이드 유지
        if (slotBanners[i]) return buildAdminSlide(slotBanners[i], i);
        // 지역별 슬롯 분배 — slotStates[i] 가 있으면 eyebrow 에 지역 태그 prepend
        const st = slotStates[i];
        const stagged = st ? Object.assign({}, s, {
          eyebrow: '📍 ' + (STATE_LABEL[st] || st.toUpperCase()) + ' · ' + s.eyebrow,
        }) : s;
        return buildSlide(stagged, data.gradients[i % data.gradients.length], i);
      })
      .join('');
    // 디버깅 단서 — 일부 교체 'mixed' / 전체 교체 'admin'
    if (adminCount) {
      container.setAttribute('data-koaus-hero-source', adminCount === data.slides.length ? 'admin' : 'mixed');
    }
    // data-koaus-hero-region (분배 결과) — 별도 광고 모듈이 후속 덮어쓰기 가능 (확장 포인트)
    container.setAttribute('data-koaus-hero-region', slotStates.join(','));
    container.innerHTML = `
      <div class="koaus-hero-pc">
        <div class="swiper" data-koaus-hero-swiper="${escHtml(cat)}">
          <div class="swiper-wrapper" data-koaus-hero-slots="${escHtml(cat)}" data-koaus-cap="${data.slides.length}">
            ${slidesHtml}
          </div>
          <div class="swiper-pagination"></div>
          <div class="swiper-button-prev"></div>
          <div class="swiper-button-next"></div>
        </div>
      </div>`;
    return container;
  }

  function ensureSwiperLoaded(cb) {
    if (typeof window.Swiper === 'function') return cb();
    if (!document.querySelector('link[data-koaus-swiper-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css';
      link.setAttribute('data-koaus-swiper-css', '1');
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-koaus-swiper-js]')) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js';
      s.defer = true;
      s.setAttribute('data-koaus-swiper-js', '1');
      s.onload = cb;
      document.head.appendChild(s);
    } else {
      window.addEventListener('load', cb, { once: true });
    }
  }

  // ── sessionStorage 기반 슬라이더 상태 복원 (페이지 이동 동기화) ──
  //   · heroBannerCurrentIndex : 마지막 활성 인덱스
  //   · heroBannerLastShiftTime: 그 인덱스로 전환된 Date.now()
  //   · 기본 노출 3000ms — 페이지 이동 시 잔여 시간만 첫 delay 로 사용
  //   · admin (지시 7/7) 이 app_settings/timings 에서 설정 가능 → 동적 갱신
  let HERO_DELAY = 3000;
  (async function loadHeroDelayFromSettings() {
    try {
      // window.koausDb 가 다른 페이지 스크립트에서 노출됨 (jobs/restaurants/accom 등). admin 미진입 페이지에서 미정의 가능 → silent fallback.
      const db = window.koausDb;
      if (!db) return;
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js');
      const snap = await getDoc(doc(db, 'app_settings', 'timings'));
      if (snap.exists()) {
        const v = snap.data();
        if (typeof v.heroDelaySec === 'number' && v.heroDelaySec >= 1 && v.heroDelaySec <= 30) {
          HERO_DELAY = v.heroDelaySec * 1000;
        }
      }
    } catch (_) { /* best-effort — 실패 시 3000ms 기본 */ }
  })();
  function readHeroState(slideCount) {
    let savedIdx = parseInt(sessionStorage.getItem('heroBannerCurrentIndex') || '0', 10);
    const lastShift = parseInt(sessionStorage.getItem('heroBannerLastShiftTime') || '0', 10);
    if (!Number.isFinite(savedIdx) || savedIdx < 0 || savedIdx >= slideCount) savedIdx = 0;
    const elapsed = Date.now() - (Number.isFinite(lastShift) ? lastShift : 0);
    let remaining = HERO_DELAY - elapsed;
    if (!lastShift || remaining <= 0) remaining = 0;
    if (remaining > HERO_DELAY)       remaining = HERO_DELAY;
    return { savedIdx, remaining };
  }
  function persistHeroState(realIdx) {
    try {
      sessionStorage.setItem('heroBannerCurrentIndex',  String(realIdx));
      sessionStorage.setItem('heroBannerLastShiftTime', String(Date.now()));
    } catch (_) {}
  }

  function initSwipers(container) {
    if (!container || typeof window.Swiper !== 'function') return;
    const swEl = container.querySelector('.koaus-hero-pc .swiper');
    if (!swEl || swEl.__koausSwiperInited) return;
    const slideCount = swEl.querySelectorAll('.swiper-slide').length;
    if (slideCount === 0) return;
    const useLoop = slideCount >= 2;
    const { savedIdx, remaining } = readHeroState(slideCount);
    try {
      const sw = new window.Swiper(swEl, {
        loop: useLoop,
        speed: 700,
        initialSlide: savedIdx,
        autoplay: useLoop ? {
          // 첫 전환만 잔여시간 (0~3000ms), 이후 3000ms 정상 회전
          delay: remaining > 0 ? remaining : 1,
          disableOnInteraction: false,
        } : false,
        pagination: { el: swEl.querySelector('.swiper-pagination'), clickable: true },
        navigation: {
          nextEl: swEl.querySelector('.swiper-button-next'),
          prevEl: swEl.querySelector('.swiper-button-prev'),
        },
        on: {
          slideChange() {
            const idx = (this && typeof this.realIndex === 'number') ? this.realIndex : 0;
            persistHeroState(idx);
            // 첫 전환 직후 — 정상 3000ms 로 복귀
            if (this && this.params && this.params.autoplay) this.params.autoplay.delay = HERO_DELAY;
          },
        },
      });
      // 초기 1회 저장 (재진입 시 마지막 shift 시점 갱신)
      persistHeroState(savedIdx);
      swEl.__koausSwiperInited = true;
      swEl.__koausSwiper = sw;   // admin 배너 도착 시 재렌더 전 destroy 용
    } catch (e) { console.warn('[hero-banner] Swiper init 실패', e); }
  }

  async function run() {
    // ── 지시 1/10 ── notice-section 보호 가드 ────────────────────────
    // 1) data-koaus-hero-cat 컨테이너가 .notice-section 의 자손이면 무시 (마크업 회귀 방어)
    // 2) 컨테이너 자체가 .notice-section 의 형제로 직전에 있을 경우에도 fetch 결과 innerHTML 작성은
    //    그 컨테이너 안에만 일어남 — notice 의 부모/형제 DOM 은 절대 건드리지 않음.
    // 3) 옛 inline placeholder 가 있을 경우(아직 :empty 가 아님) 그대로 innerHTML 로 교체.
    const containers = Array.from(document.querySelectorAll('[data-koaus-hero-cat]'))
      .filter(c => !c.closest('.notice-section'));
    if (!containers.length) return;

    function paint(banners) {
      containers.forEach(c => render(c, banners));
      ensureSwiperLoaded(() => {
        containers.forEach(initSwipers);
        containers.forEach(c => {
          try {
            c.dispatchEvent(new CustomEvent('koaus:hero-ready', {
              bubbles: true,
              detail: { cat: c.getAttribute('data-koaus-hero-cat') },
            }));
          } catch (_) {}
        });
      });
    }

    // 1) ── LCP 단축 ── SLOTS 폴백을 App Check/Firestore 대기 없이 즉시 렌더 (첫 화면 즉시 표시).
    paint([]);
    // 2) admin 배너 도착 시에만 해당 슬롯 교체 재렌더 (도착 전 빈 placeholder 없음).
    let banners = [];
    try { banners = await fetchAdminBanners(); } catch (_) {}
    if (banners.length) {
      // 기존 swiper 정리 후 재렌더 (render 의 __koausHeroRendered 가드 해제)
      containers.forEach(c => {
        const sw = c.querySelector('.koaus-hero-pc .swiper');
        if (sw && sw.__koausSwiper) { try { sw.__koausSwiper.destroy(true, true); } catch (_) {} }
        c.__koausHeroRendered = false;
      });
      paint(banners);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else { run(); }
})();
