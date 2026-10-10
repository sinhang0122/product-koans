/* koaus-state.js — 게시글의 "진짜 주(state)"를 주소에서 판별하는 단일 헬퍼.
 *
 * 배경(2026-06): 글의 state 필드는 작성 당시 페이지 탭(?state=)에서 가져왔을 뿐
 *   주소와 무관했다. 그래서 (1) state 가 빈 글은 모든 주 탭에 노출되거나(accom/auto/
 *   restaurants/salon/trades/gp), (2) 빈 글이 어느 주 탭에도 안 보이는(rent/jobs) 회귀가 있었다.
 *   → "주소가 진실"로 통일: 쓰기/필터 모두 주소에서 주를 도출해 해당 주 탭에만 노출.
 *
 * 소비처: 8개 보드(accom/rent/jobs/auto/restaurants/salon/trades/gp)의
 *   - 쓰기:  state = (koausState.fromAddress(주소) || currentState)
 *   - 필터: es = koausState.effective(p);  if (currentState && es && es!==currentState) 제외
 *   호출 시점은 모두 로드 이후(제출 클릭 / onSnapshot 데이터 도착)라 defer 로드로 충분.
 */
(function (g) {
  'use strict';

  // 주(state) 약어 정규화
  var ABBR = { nsw: 'nsw', vic: 'vic', qld: 'qld', wa: 'wa', sa: 'sa', tas: 'tas', act: 'act', nt: 'nt' };

  // 대표 도시 폴백 — 명시 약어가 없는 자유입력 주소(jobs/auto/서비스 보드)용.
  //   모호한 교외명(Richmond 등 여러 주 중복)은 일부러 제외 — 오분류 방지.
  //   주도(主都) + 명백히 한 주에 귀속되는 대도시만 포함.
  var CITY = {
    'sydney': 'nsw', 'newcastle': 'nsw', 'wollongong': 'nsw', 'parramatta': 'nsw',
    'melbourne': 'vic', 'geelong': 'vic',
    'brisbane': 'qld', 'gold coast': 'qld', 'goldcoast': 'qld', 'cairns': 'qld',
    'townsville': 'qld', 'sunshine coast': 'qld',
    'perth': 'wa', 'fremantle': 'wa',
    'adelaide': 'sa',
    'hobart': 'tas', 'launceston': 'tas',
    'canberra': 'act',
    'darwin': 'nt'
  };

  // 한글 주(state) 이름 → 약어. Google Places 한국어 로캘 주소("...퀸즐랜드 주...") 대응.
  //   services 보드(맛집/미용/병원/기술자)·jobs 는 redactAddress 영문정규화를 안 거쳐
  //      한글 주소가 그대로 저장됨 → 여기서 직접 판별 (listing-privacy._KO_STATE 와 동기화).
  var KO_STATE = [
    ['오스트레일리아 수도 준주', 'act'], ['오스트레일리아 캐피털 준주', 'act'], ['수도 준주', 'act'],
    ['노던 준주', 'nt'], ['노던 테리토리', 'nt'], ['노던준주', 'nt'],
    ['뉴사우스웨일스', 'nsw'], ['뉴사우스웨일즈', 'nsw'], ['뉴 사우스 웨일스', 'nsw'],
    ['웨스턴오스트레일리아', 'wa'], ['웨스턴 오스트레일리아', 'wa'], ['서호주', 'wa'],
    ['사우스오스트레일리아', 'sa'], ['사우스 오스트레일리아', 'sa'], ['남호주', 'sa'],
    ['태즈메이니아', 'tas'], ['태즈매니아', 'tas'], ['타스마니아', 'tas'],
    ['퀸즐랜드', 'qld'], ['퀸스랜드', 'qld'],
    ['빅토리아', 'vic']
  ];
  // 한글 대표 도시명 → 주 (영문 CITY 와 짝). 모호명 제외 동일 원칙.
  var KO_CITY = {
    '시드니': 'nsw', '뉴캐슬': 'nsw', '울런공': 'nsw', '울릉공': 'nsw', '파라마타': 'nsw',
    '멜버른': 'vic', '멜번': 'vic', '질롱': 'vic',
    '브리즈번': 'qld', '브리스번': 'qld', '골드코스트': 'qld', '골드 코스트': 'qld',
    '케언즈': 'qld', '타운즈빌': 'qld', '선샤인코스트': 'qld', '선샤인 코스트': 'qld',
    '퍼스': 'wa', '프리맨틀': 'wa',
    '애들레이드': 'sa', '애들래이드': 'sa',
    '호바트': 'tas', '론서스턴': 'tas',
    '캔버라': 'act',
    '다윈': 'nt'
  };

  // 주소 문자열 → 주 약어('qld' 등). 판별 불가 시 '' 반환.
  //   한글 토큰은 toLowerCase 영향 없음 → 동일 소문자 문자열에서 indexOf 매칭.
  function fromAddress(addr) {
    if (!addr) return '';
    var s = String(addr).toLowerCase();
    // 1순위: 명시 영문 주 약어 (단어 경계) — accom/rent redactAddress "Suburb STATE Postcode" 정확 판별
    var m = s.match(/\b(nsw|vic|qld|wa|sa|tas|act|nt)\b/);
    if (m) return ABBR[m[1]];
    // 2순위: 한글 주 이름 — 한국어 로캘 구글 주소(미정규화 경로)
    for (var i = 0; i < KO_STATE.length; i++) {
      if (s.indexOf(KO_STATE[i][0]) !== -1) return KO_STATE[i][1];
    }
    // 3순위: 영문 대표 도시명 — 자유입력 주소 폴백
    for (var city in CITY) {
      if (Object.prototype.hasOwnProperty.call(CITY, city) && s.indexOf(city) !== -1) return CITY[city];
    }
    // 4순위: 한글 대표 도시명
    for (var kcity in KO_CITY) {
      if (Object.prototype.hasOwnProperty.call(KO_CITY, kcity) && s.indexOf(kcity) !== -1) return KO_CITY[kcity];
    }
    return '';
  }

  // 게시글 객체 → 유효 주. 주소(address|region)가 진실, 없으면 저장된 state 폴백.
  function effective(p) {
    if (!p) return '';
    return fromAddress(p.address || p.region || '') || (p.state || '');
  }

  g.koausState = { fromAddress: fromAddress, effective: effective };
})(typeof window !== 'undefined' ? window : this);
