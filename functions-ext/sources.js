'use strict';
// ═══════════════════════════════════════════════════════════════════
//  KoAus · 외부 한인 사이트 글 수집 — 사이트 목록(11-04 결정)
//  - 가져오는 것: 제목·가격·동네(동네 이름만, 번지·전화 없음)·날짜·원문 링크·출처. 사진·본문·연락처는 안 가져온다.
//  - 사이트마다 관리자 스위치(ext_sources/{id}.enabled) — 끄면 화면에서 즉시 빠지고, 다음 수집 때 저장된 글도 숨긴다.
//  - 경고·삭제 요청이 오면: 관리자 페이지에서 끄기 → [전부 삭제]. (사용자 결정: 전부 켜 두고 경고 오는 순간 그 사이트 해체)
//  - 파서가 없는 사이트는 boards 가 비어 있어 아무것도 안 가져온다(등록만).
//  - mode: 'link'(목록만, 누르면 원문) | 'full'(본문·올린 시각 + 전화는 ext_private 로그인 회원만). 기본은 link.
// ═══════════════════════════════════════════════════════════════════
const SB = 'https://www.sunbrisbane.com/brsb/bbs/board.php';

const SOURCES = {
  sunbrisbane: {
    name: '선브리즈번', home: 'https://www.sunbrisbane.com/', state: 'qld', defaultEnabled: false, defaultMode: 'full',   // 11-05: 결제 카드 정지 중이라 처음엔 꺼 둠 — 관리자 페이지에서 켠다   // 사용자 결정(11-05): 선브리즈번은 본문·전화까지(full). 경고 오면 관리자가 link 로
    // 구인 게시판의 '구직'(일 구함)·'운송'(공항 픽업 광고)·'우대'(업체 광고)는 뺀다
    skipCategories: ['구직', '운송', '우대', '공지'],
    boards: [
      { key: 'home',     board: 'accom', region: '브리즈번',   url: p => `${SB}?bo_table=home&page=${p}` },
      { key: 'gc_home',  board: 'accom', region: '골드코스트', url: p => `${SB}?bo_table=gc_home&page=${p}` },
      { key: 'qld_home', board: 'accom', region: 'QLD',       url: p => `${SB}?bo_table=qld_home&page=${p}` },
      { key: 'job',      board: 'jobs',  region: '브리즈번',   url: p => `${SB}?bo_table=job&page=${p}` },
      { key: 'gc_job',   board: 'jobs',  region: '골드코스트', url: p => `${SB}?bo_table=gc_job&page=${p}` },
      { key: 'qld_job',  board: 'jobs',  region: 'QLD',       url: p => `${SB}?bo_table=qld_job&page=${p}` },
      { key: 'farm_job', board: 'jobs',  region: 'QLD 농장',  url: p => `${SB}?bo_table=farm_job&page=${p}` },
    ],
  },
  // ── 아래는 등록만(파서 없음) — 구조 확인 뒤 boards 를 채운다. 11-04 결정: 사용자가 전부 켜기로 함(경고 오면 즉시 끔) ──
  qvision:   { name: '퀸비전',   home: 'https://www.qvision.com.au/', state: 'qld', defaultEnabled: false, defaultMode: 'link', boards: [], todo: 'robots.txt 전면 차단·약관 18조(사전 승낙). 구조 확인 필요' },
  melbhanul: { name: '멜번하늘', home: '',                            state: 'vic', defaultEnabled: false, defaultMode: 'link', boards: [], todo: '자동 수집 금지 문구. 주소·구조 확인 필요' },
  hojunara:  { name: '호주나라', home: 'https://hojunara.com/',       state: 'nsw', defaultEnabled: false, defaultMode: 'link', boards: [], todo: '약관 스크래핑 명시 금지. /realestate /recruit 구조 확인 필요' },
  hojubada:  { name: '호주바다', home: 'https://hojubada.com/',       state: 'vic', defaultEnabled: false, defaultMode: 'link', boards: [], todo: '약관 스크래핑 명시 금지(호주나라 자매). 구조 확인 필요' },
};

module.exports = { SOURCES };
