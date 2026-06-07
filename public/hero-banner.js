// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 히어로 배너 (서브 페이지 공통)
//  - 사용법: 페이지 헤더 직하단에 컨테이너 한 줄 삽입
//      <section class="koaus-hero" data-koaus-hero-cat="accom"></section>
//    그리고 <script src="hero-banner.js" defer></script> 로드.
//  - 카테고리별 4개 슬라이드 자동 렌더링 — PC + 모바일 동일 swiper, 동일 콘텐츠
//  - Swiper CDN 이 이미 페이지에 로드돼 있으면 자동 활성화, 없으면 동적 로드
//  - data-koaus-hero-slots / data-koaus-cap 속성을 부여 — 로컬 애널리틱스
//    타겟팅 광고 로직(별도 모듈) 이 이 속성을 보고 슬롯을 교체 가능 (확장 포인트)
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
        { eyebrow: '동행 인스펙션',         title: '중고차 구입 전 전문가 동행.',        sub: '계약 전 상태·키로미터·정비 이력 점검 후 안전 구매',           cta: null },
        { eyebrow: '중고차 매물',           title: '개인·딜러 매물 한 곳에서.',          sub: '연식·주행거리·가격대로 빠르게 비교',                          cta: null },
        { eyebrow: '렌트카',                title: '단기·장기 렌트카 한인 업체.',         sub: '공항 인수·자차·보험까지 한국어로 안내',                       cta: null },
      ],
    },
    trades: {
      gradients: ['hero-bg--legal1', 'hero-bg--legal2', 'hero-bg--home3', 'hero-bg--edu1'],
      slides: [
        { eyebrow: '🔧 Skilled Trades',     title: '한인 기술자 — 전기·배관·페인팅·핸디맨.', sub: '자격증·보험·ABN 보유 업체만 — 출장비·경력 비교',           cta: { href: '#postGrid', label: '기술자 보기 →' } },
        { eyebrow: '관리자 검토',           title: '광고가 아닌 진짜 한인 기술자.',      sub: '관리자 검토 후 등록 → 견적 요청 가능',                        cta: null },
        { eyebrow: '견적 요청',             title: '한 번에 여러 업체 견적 비교.',       sub: '평일·주말·공휴일 출동 가능 여부 확인',                        cta: null },
        { eyebrow: '🛡 Official 인증',      title: '인증된 한인 기술자만 노출.',          sub: '신원 + 자격증 + 보험 검토 완료 업체',                         cta: null },
      ],
    },
    restaurants: {
      gradients: ['hero-bg--edu1', 'hero-bg--edu3', 'hero-bg--home2', 'hero-bg--legal3'],
      slides: [
        { eyebrow: '🍱 K-Food', title: '등록된 K-Food, 지도와 함께.', sub: '한식·중식·치킨·BBQ·카페 — 가격대와 영업시간을 한눈에',     cta: { href: '#postGrid', label: '식당 보기 →' } },
        { eyebrow: '편의시설 필터',         title: '주차·배달·포장·할랄 옵션까지.',      sub: '음식 종류 + 편의시설 + 영업 상태로 빠르게 검색',              cta: null },
        { eyebrow: '영업 시간',             title: '요일별 영업·휴무를 7일 표로.',       sub: '오늘 영업 중인 가게만 골라 보기',                             cta: null },
        { eyebrow: '🛡 Official 인증',      title: '관리자 검토 후 등록된 가게.',         sub: '한인 사장님 직접 등록 + 검토',                                cta: null },
      ],
    },
    salon: {
      gradients: ['hero-bg--edu1', 'hero-bg--legal3', 'hero-bg--home2', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '💇 한인 미용실',        title: '커트·펌·염색·매직 한 곳에서.',       sub: '한국 스타일 · 한국어 디자이너 · 가격 투명',                   cta: { href: '#postGrid', label: '미용실 보기 →' } },
        { eyebrow: '서비스 필터',           title: '커트·펌·염색·붙임머리까지.',         sub: '내가 원하는 서비스만 빠르게 검색',                            cta: null },
        { eyebrow: '커트 가격',             title: '디자이너별 커트 · 펌 가격 비교.',    sub: '학생 할인 · 주차 · 카드 결제 옵션도 확인',                    cta: null },
        { eyebrow: '🛡 Official 인증',      title: '관리자 검토 미용실 우선 노출.',       sub: '한인 디자이너 + 정식 등록 사업장',                            cta: null },
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
        { eyebrow: '안심 거래',             title: '계약 전 인스펙션 동행 가능.',         sub: 'VIN · 정비 이력 · 누수 점검까지 한국어로',                     cta: null },
        { eyebrow: '시세 비교',             title: '같은 모델 · 같은 연식 가격 한눈에.',  sub: 'CarsGuide · CarSales 가격 참고',                              cta: null },
        { eyebrow: '🛡 검증된 딜러',        title: '한인 딜러 우선 노출.',                sub: '관리자 검토 후 등록된 사업장만',                              cta: null },
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
  };

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function buildSlide(slide, gradientCls, idx) {
    const cta = slide.cta
      ? `<a class="hero-cta" href="${escHtml(slide.cta.href)}">${escHtml(slide.cta.label)}</a>`
      : '';
    return `<div class="swiper-slide ${gradientCls}" data-koaus-slot="${idx}">
      <div class="hero-content">
        <span class="hero-eyebrow">${escHtml(slide.eyebrow)}</span>
        <h2 class="hero-title">${escHtml(slide.title)}</h2>
        <p class="hero-sub">${escHtml(slide.sub)}</p>
        ${cta}
      </div>
    </div>`;
  }

  // ── 지역 코드 → 한국어 라벨 (로컬 애널리틱스 슬롯 분배 시 eyebrow 보강) ──
  const STATE_LABEL = {
    nsw:'NSW', vic:'VIC', qld:'QLD', wa:'WA', sa:'SA', tas:'TAS', act:'ACT', nt:'NT',
  };

  // ════════════════════════════════════════════════════════════════════
  //  유저 닫기 상태 저장 — localStorage 'koaus-dismissed-ads'
  //   · 쿠키 동의 팝업 없이 브라우저 저장소만 사용 (개인정보 없음, 광고 ID + 타임스탬프만)
  //   · TTL 24h — 만료된 항목은 다음 조회 시 자가 청소
  //   · 키 형식: "{type}:{docId}" = timestamp (ex: "banner:abc123" = 1717584000000)
  // ════════════════════════════════════════════════════════════════════
  const DISMISS_KEY = 'koaus-dismissed-ads';
  const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
  function readDismissMap() {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      // 자가 청소 — TTL 만료된 항목 즉시 삭제
      const now = Date.now();
      let dirty = false;
      for (const k in obj) {
        const ts = +obj[k] || 0;
        if (!ts || (now - ts) >= DISMISS_TTL_MS) { delete obj[k]; dirty = true; }
      }
      if (dirty) {
        try { localStorage.setItem(DISMISS_KEY, JSON.stringify(obj)); } catch (_) {}
      }
      return obj;
    } catch (_) { return {}; }
  }
  function isDismissed(type, id) {
    if (!id) return false;
    const map = readDismissMap();
    const ts = +map[type + ':' + id] || 0;
    return ts > 0 && (Date.now() - ts) < DISMISS_TTL_MS;
  }
  function markDismissed(type, id) {
    if (!id) return;
    try {
      const map = readDismissMap();
      map[type + ':' + id] = Date.now();
      localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════════
  //  관리자 등록 배너 (Firestore hero_banners) — 지역 매칭 후 우선 노출
  //   · admin.html ② 히어로 배너 관리 에서 등록된 데이터
  //   · regions 배열에 'all' 또는 현재 페이지 ?state=xxx 가 포함된 배너만 핀셋 필터
  //   · 매칭 배너 1건 이상 → SLOTS(하드코딩) 완전 대체
  //   · 매칭 배너 0건 또는 fetch 실패 → SLOTS fallback (기존 사용자 경험 보존)
  //   · IIFE 안에서 dynamic import 로 Firebase SDK 로드 (페이지 script 태그 변경 불필요)
  // ════════════════════════════════════════════════════════════════════
  function currentState() {
    try { return (new URLSearchParams(location.search).get('state') || '').toLowerCase(); }
    catch (_) { return ''; }
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
        const state = currentState();
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => Array.isArray(b.regions) && b.regions.length
                       && (b.regions.includes('all') || (state && b.regions.includes(state)))
                       && !isDismissed('banner', b.id))   // 유저가 닫은 배너는 렌더 대상에서 완전 제외
          .sort((a, b) => ((a.order ?? 100) - (b.order ?? 100)));
      } catch (e) {
        console.warn('[hero-banner] admin 배너 fetch 실패 — SLOTS fallback', e);
        return [];
      }
    })();
    return _adminBannersPromise;
  }

  // 관리자 배너 슬라이드 — 이미지 + 클릭 링크 (linkUrl 있으면 새 탭) + X 닫기 버튼
  //   · X 버튼 클릭 → markDismissed + swiper.removeSlide (즉시 사라짐 + 24h 차단)
  //   · 슬라이드 이동 링크와 충돌하지 않도록 stopPropagation + preventDefault
  function buildAdminSlide(banner, idx) {
    // URL 스킴 화이트리스트 — admin 이 입력하지만 권한 탈취·실수 대비 (javascript: 등 차단)
    const rawLink = banner.linkUrl || '';
    const link = (window.koausUrlGuard && window.koausUrlGuard.isSafeHttp(rawLink)) ? rawLink : '';
    const rawImg = banner.imageUrl || '';
    const safeImg = (window.koausUrlGuard && window.koausUrlGuard.isSafeHttp(rawImg)) ? rawImg : '';
    const alt  = escHtml(banner.alt || '히어로 배너');
    const img  = escHtml(safeImg);
    const docId = escHtml(banner.id || '');
    const imgEl = `<img src="${img}" alt="${alt}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    const wrap = link
      ? `<a href="${escHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="${alt}" style="display:block;width:100%;height:100%;">${imgEl}</a>`
      : imgEl;
    const dismissBtn = `<button type="button" class="koaus-hero-dismiss" data-koaus-dismiss-id="${docId}"
        aria-label="이 광고 24시간 동안 숨기기"
        title="24시간 동안 숨기기"
        style="position:absolute;top:10px;right:10px;z-index:5;width:30px;height:30px;border-radius:999px;border:none;background:rgba(0,0,0,0.55);color:#fff;font-size:16px;font-weight:800;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">×</button>`;
    return `<div class="swiper-slide koaus-hero-admin-slide" data-koaus-slot="${idx}" data-koaus-banner-id="${docId}" style="background:var(--bg-base,#000);position:relative;">${wrap}${dismissBtn}</div>`;
  }

  // admin 배너로 컨테이너 렌더 시도 — true 반환 시 SLOTS 렌더 skip
  function renderAdminBanners(container, banners) {
    if (!banners || !banners.length) return false;
    if (container.__koausHeroRendered) return true;
    container.__koausHeroRendered = true;
    container.classList.add('koaus-hero');
    const slidesHtml = banners.map((b, i) => buildAdminSlide(b, i)).join('');
    const cat = container.getAttribute('data-koaus-hero-cat') || 'admin';
    container.setAttribute('data-koaus-hero-source', 'admin');
    container.setAttribute('data-koaus-hero-region', currentState() || 'all');
    container.innerHTML = `
      <div class="koaus-hero-pc">
        <div class="swiper" data-koaus-hero-swiper="${escHtml(cat)}">
          <div class="swiper-wrapper" data-koaus-hero-slots="${escHtml(cat)}" data-koaus-cap="${banners.length}">
            ${slidesHtml}
          </div>
          <div class="swiper-pagination"></div>
          <div class="swiper-button-prev"></div>
          <div class="swiper-button-next"></div>
        </div>
      </div>`;
    // X 닫기 이벤트 위임 — 컨테이너 1회 바인딩, 클릭된 슬라이드만 swiper.removeSlide
    if (!container.__koausDismissBound) {
      container.__koausDismissBound = true;
      container.addEventListener('click', e => {
        const btn = e.target.closest('.koaus-hero-dismiss');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const docId = btn.getAttribute('data-koaus-dismiss-id') || '';
        markDismissed('banner', docId);
        const sw = container.__koausSwiperInstance;
        const slideEl = btn.closest('.swiper-slide');
        if (sw && typeof sw.removeSlide === 'function' && slideEl) {
          // swiper-slide 인덱스 — DOM 순서 그대로
          const idx = Array.prototype.indexOf.call(slideEl.parentNode.children, slideEl);
          try { sw.removeSlide(idx); } catch (_) {}
          // 슬라이드 전부 비면 컨테이너 자체 숨김 (사용자 의도 충실)
          if (sw.slides && sw.slides.length === 0) container.style.display = 'none';
        } else if (slideEl) {
          slideEl.style.display = 'none';
        }
      });
    }
    return true;
  }

  function render(container) {
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
        // 지역별 슬롯 분배 — slotStates[i] 가 있으면 eyebrow 에 지역 태그 prepend
        const st = slotStates[i];
        const stagged = st ? Object.assign({}, s, {
          eyebrow: '📍 ' + (STATE_LABEL[st] || st.toUpperCase()) + ' · ' + s.eyebrow,
        }) : s;
        return buildSlide(stagged, data.gradients[i % data.gradients.length], i);
      })
      .join('');
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
      // dismiss 핸들러가 swiper.removeSlide 호출할 수 있도록 컨테이너에 인스턴스 보관
      container.__koausSwiperInstance = sw;
    } catch (e) { console.warn('[hero-banner] Swiper init 실패', e); }
  }

  async function run() {
    const containers = Array.from(document.querySelectorAll('[data-koaus-hero-cat]'));
    if (!containers.length) return;
    // 1) admin 배너 fetch (단일 fetch 캐시, 모든 컨테이너 공통)
    //    fetch 결과 없으면 SLOTS fallback 으로 즉시 진입
    let banners = [];
    try { banners = await fetchAdminBanners(); } catch (_) {}
    // 2) 컨테이너별 렌더 — admin 배너 있으면 SLOTS 대체, 없으면 SLOTS fallback
    containers.forEach(c => {
      const used = renderAdminBanners(c, banners);
      if (!used) render(c);
    });
    // 3) Swiper init (admin·SLOTS 공통)
    ensureSwiperLoaded(() => containers.forEach(initSwipers));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else { run(); }
})();
