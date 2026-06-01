// ════════════════════════════════════════════════════════════════════
//  KoAus · 전역 히어로 배너 (게시판 페이지 공통)
//  - 사용법: 페이지 헤더 직하단에 컨테이너 한 줄 삽입
//      <section class="koaus-hero" data-koaus-hero-cat="accom"></section>
//    그리고 <script src="hero-banner.js" defer></script> 로드.
//  - 카테고리별 더미 슬라이드 2 개 + 모바일 카드 1 개를 자동 렌더링.
//  - Swiper CDN 이 이미 페이지에 로드돼 있으면 자동 활성화, 없으면 동적 로드.
//  - 향후 Firestore 인기 광고주 → slots 배열에 매핑 가능 (확장 포인트).
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.__koausHeroBannerInited) return;
  window.__koausHeroBannerInited = true;

  // ── 카테고리별 슬라이드 데이터 (state 별 2 개씩, 확장 가능) ──
  const SLOTS = {
    accom: {
      gradients: ['hero-bg--home1', 'hero-bg--home2'],
      slides: [
        { eyebrow: '🏠 쉐어 (Share)',        title: '한인 쉐어하우스 찾기, 지도 한 번에.',  sub: '시드니·멜버른·브리즈번 — 매물 사진과 위치를 한눈에 비교',          cta: { href: '#postGrid', label: '매물 보기 →' } },
        { eyebrow: '안전 거래 가이드',       title: '보증금·계약 사기 주의.',                sub: '직접 방문 + 단계별 결제 + 카카오 단톡 인증으로 안전하게',          cta: null },
      ],
    },
    rent: {
      gradients: ['hero-bg--home2', 'hero-bg--legal3'],
      slides: [
        { eyebrow: '🏘 렌트 (Rent)',          title: '호주 한인 렌트 매물.',                  sub: '룸·하우스·아파트 — 침실·욕실·주차까지 필터 검색',                  cta: { href: '#postGrid', label: '리스트 보기 →' } },
        { eyebrow: '한인 매물 우선',          title: '한국어 가능 임대인 위주.',             sub: '계약서·등록비·전기·인터넷 안내까지 자세히 확인',                  cta: null },
      ],
    },
    jobs: {
      gradients: ['hero-bg--legal3', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '💼 Work',                  title: '한인 구인구직, 매일 새 글.',           sub: '워홀·학생·영주권자 — 시드니·멜번 전 지역 일자리',                 cta: { href: '#postList', label: '일자리 보기 →' } },
        { eyebrow: 'Fair Work 가이드',        title: '최저 임금·세금·연차 확인.',            sub: '불법 구인 광고 신고 → 즉시 삭제. 안전한 근로 환경',                cta: null },
      ],
    },
    auto: {
      gradients: ['hero-bg--legal2', 'hero-bg--home1'],
      slides: [
        { eyebrow: '🚗 Auto',                  title: '한인 정비·견인·렌트카.',               sub: '24시간 출동·한국어 응대·합리적인 가격',                            cta: { href: '#postGrid', label: '서비스 보기 →' } },
        { eyebrow: '동행 인스펙션',           title: '중고차 구입 전 전문가 동행.',          sub: '계약 전 상태·키로미터·정비 이력 점검 후 안전 구매',                cta: null },
      ],
    },
    trades: {
      gradients: ['hero-bg--legal1', 'hero-bg--legal2'],
      slides: [
        { eyebrow: '🔧 Skilled Trades',        title: '한인 기술자 — 전기·배관·페인팅·핸디맨.', sub: '자격증·보험·ABN 보유 업체만 — 출장비·경력 비교',                cta: { href: '#postGrid', label: '기술자 보기 →' } },
        { eyebrow: '관리자 검증',             title: '광고가 아닌 진짜 한인 기술자.',        sub: '직접 검증 후 등록 → 안심하고 견적 요청 가능',                       cta: null },
      ],
    },
    restaurants: {
      gradients: ['hero-bg--edu1', 'hero-bg--edu3'],
      slides: [
        { eyebrow: '🍱 Korean Restaurants',    title: '검증된 K-푸드 & 다이닝, 지도와 함께.',       sub: '한식·중식·치킨·BBQ·카페 — 가격대와 영업시간을 한눈에',            cta: { href: '#postGrid', label: '식당 보기 →' } },
        { eyebrow: '편의시설 필터',           title: '주차·배달·포장·할랄 옵션까지.',        sub: '음식 종류 + 편의시설 + 영업 상태로 빠르게 검색',                   cta: null },
      ],
    },
    gp: {
      gradients: ['hero-bg--edu2', 'hero-bg--legal3'],
      slides: [
        { eyebrow: '🏥 Korean-Speaking GP',    title: '한국어 가능 GP·치과·소아과.',           sub: '진료과 + 한국어 가능 여부 + Bulk Billing + 텔레헬스',              cta: { href: '#postGrid', label: 'GP 보기 →' } },
        { eyebrow: '워크인·예약',             title: '워크인 가능 클리닉도 한눈에.',          sub: '주말·저녁 진료 / 텔레헬스 / 한인 직원 보유 정보',                  cta: null },
      ],
    },
    mypage: {
      gradients: ['hero-bg--home1', 'hero-bg--home3'],
      slides: [
        { eyebrow: '👤 내 계정',               title: '내 글·저장 글·연락한 글 한 곳에서.',  sub: 'KoAus 활동을 한눈에 관리 — 닉네임·테마·구독 설정까지',              cta: null },
        { eyebrow: '안전한 거래',             title: '연락 완료 표시로 진행 상황 추적.',     sub: '쉐어·렌트 매물에 ☑ 표시 → 마이페이지에서 한 번에 확인',            cta: null },
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

  function render(container) {
    const cat = container.getAttribute('data-koaus-hero-cat');
    const data = SLOTS[cat];
    if (!data) {
      console.warn('[hero-banner] unknown category:', cat);
      container.innerHTML = '';
      return;
    }
    // 중복 렌더링 방지
    if (container.__koausHeroRendered) return;
    container.__koausHeroRendered = true;
    container.classList.add('koaus-hero');

    const pcSlides = data.slides
      .map((s, i) => buildSlide(s, data.gradients[i % data.gradients.length], i))
      .join('');
    const mobile = data.slides[0];
    container.innerHTML = `
      <div class="koaus-hero-pc">
        <div class="swiper" data-koaus-hero-swiper="${escHtml(cat)}">
          <div class="swiper-wrapper" data-koaus-hero-slots="${escHtml(cat)}" data-koaus-cap="${data.slides.length}">
            ${pcSlides}
          </div>
          <div class="swiper-pagination"></div>
          <div class="swiper-button-prev"></div>
          <div class="swiper-button-next"></div>
        </div>
      </div>
      <div class="koaus-hero-mobile">
        <div class="hero-card ${data.gradients[0]}">
          <div class="hero-content">
            <span class="hero-eyebrow">${escHtml(mobile.eyebrow)}</span>
            <h2 class="hero-title">${escHtml(mobile.title)}</h2>
            <p class="hero-sub">${escHtml(mobile.sub)}</p>
          </div>
        </div>
      </div>`;
    return container;
  }

  function ensureSwiperLoaded(cb) {
    if (typeof window.Swiper === 'function') return cb();
    // CSS
    if (!document.querySelector('link[data-koaus-swiper-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css';
      link.setAttribute('data-koaus-swiper-css', '1');
      document.head.appendChild(link);
    }
    // JS
    if (!document.querySelector('script[data-koaus-swiper-js]')) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js';
      s.defer = true;
      s.setAttribute('data-koaus-swiper-js', '1');
      s.onload = cb;
      document.head.appendChild(s);
    } else {
      // 이미 로드 중 — load 이벤트 대기
      window.addEventListener('load', cb, { once: true });
    }
  }

  function initSwipers(container) {
    if (typeof window.Swiper !== 'function') return;
    const swEl = container.querySelector('.koaus-hero-pc .swiper');
    if (!swEl || swEl.__koausSwiperInited) return;
    try {
      new window.Swiper(swEl, {
        loop: true,
        speed: 700,
        autoplay: { delay: 4500, disableOnInteraction: false },
        pagination: { el: swEl.querySelector('.swiper-pagination'), clickable: true },
        navigation: {
          nextEl: swEl.querySelector('.swiper-button-next'),
          prevEl: swEl.querySelector('.swiper-button-prev'),
        },
      });
      swEl.__koausSwiperInited = true;
    } catch (e) { console.warn('[hero-banner] Swiper init 실패', e); }
  }

  function run() {
    const containers = Array.from(document.querySelectorAll('[data-koaus-hero-cat]'));
    if (!containers.length) return;
    containers.forEach(render);
    ensureSwiperLoaded(() => containers.forEach(initSwipers));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else { run(); }
})();
