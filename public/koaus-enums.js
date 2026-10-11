// ════════════════════════════════════════════════════════════════════
//  KoAus · 공유 enum (2026-10 2단계) — 프로필·글쓰기 폼·검색이 전부 이 파일 하나를 읽는다.
//  - 일반 스크립트(ES module 아님): <script src="koaus-enums.js"></script> → window.koausEnums
//  - 코드(code)는 저장 값, 라벨(label)은 화면 표시. 코드는 한 번 저장되면 바꾸지 말 것
//    (프로필·글에 옛 값이 남음). 항목 "추가"는 언제든 안전, "삭제·합치기"는 데이터 정리 동반.
//  - 방 종류·성별·거주 기간 코드는 accom.html 글쓰기 폼의 기존 값과 동일하게 맞춤(매칭 호환).
// ════════════════════════════════════════════════════════════════════
(function () {
  if (typeof window === 'undefined' || window.koausEnums) return;

  const states = [
    { code: 'qld', label: 'QLD', name: '퀸즐랜드',       cities: [
      { code: 'brisbane',       label: '브리즈번' },
      { code: 'gold_coast',     label: '골드코스트' },
      { code: 'sunshine_coast', label: '선샤인코스트' },
      { code: 'cairns',         label: '케언즈' },
      { code: 'other',          label: '기타 QLD' },
    ] },
    { code: 'nsw', label: 'NSW', name: '뉴사우스웨일스', cities: [
      { code: 'sydney',    label: '시드니' },
      { code: 'newcastle', label: '뉴캐슬' },
      { code: 'other',     label: '기타 NSW' },
    ] },
    { code: 'vic', label: 'VIC', name: '빅토리아',       cities: [
      { code: 'melbourne', label: '멜번' },
      { code: 'other',     label: '기타 VIC' },
    ] },
    { code: 'wa',  label: 'WA',  name: '서호주',         cities: [{ code: 'perth',    label: '퍼스' },     { code: 'other', label: '기타 WA' }] },
    { code: 'sa',  label: 'SA',  name: '남호주',         cities: [{ code: 'adelaide', label: '애들레이드' }, { code: 'other', label: '기타 SA' }] },
    { code: 'tas', label: 'TAS', name: '태즈메이니아',   cities: [{ code: 'hobart',   label: '호바트' },   { code: 'other', label: '기타 TAS' }] },
    { code: 'act', label: 'ACT', name: '캔버라(ACT)',    cities: [{ code: 'canberra', label: '캔버라' }] },
    { code: 'nt',  label: 'NT',  name: '노던테리토리',   cities: [{ code: 'darwin',   label: '다윈' },     { code: 'other', label: '기타 NT' }] },
  ];

  // 방 종류 — accom.html #wRoomTypes 와 동일 코드
  const roomTypes = [
    { code: 'master',       label: '마스터룸' },
    { code: 'second',       label: '세컨룸' },
    { code: 'single',       label: '독방' },
    { code: 'living_share', label: '거실쉐어' },
    { code: 'sunroom',      label: '썬룸' },
  ];

  // 희망 거주 기간 — accom.html 기간 필터와 동일 코드
  const stays = [
    { code: 'ultra_short', label: '2주 미만' },
    { code: 'short',       label: '2주~1달' },
    { code: 'mid',         label: '1~2달' },
    { code: 'long',        label: '2달 이상' },
  ];

  const ageBands = [
    { code: '20e', label: '20대 초반' },
    { code: '20m', label: '20대 중반' },
    { code: '20l', label: '20대 후반' },
    { code: '30e', label: '30대 초반' },
    { code: '30l', label: '30대 후반' },
    { code: '40p', label: '40대 이상' },
  ];

  // 성별 — accom 글의 gender(male/female/any)와 같은 코드. 프로필은 선택 입력, 여성 전용 방 필터에만 쓴다.
  const genders = [
    { code: 'female', label: '여' },
    { code: 'male',   label: '남' },
  ];

  const statuses = [
    { code: 'whv',     label: '워홀' },
    { code: 'student', label: '학생' },
    { code: 'worker',  label: '취업 비자' },
    { code: 'pr',      label: '영주권·시민권' },
    { code: 'other',   label: '기타' },
  ];

  // 비자(일 구해요 프로필용) — 고용 가능 여부 판단에 쓰는 선
  const visas = [
    { code: 'whv1',    label: '워홀 1년차' },
    { code: 'whv2',    label: '워홀 2년차' },
    { code: 'whv3',    label: '워홀 3년차' },
    { code: 'student', label: '학생 비자' },
    { code: 'pr',      label: '영주권' },
    { code: 'citizen', label: '시민권' },
    { code: 'other',   label: '기타' },
  ];

  // 업종 — 구인 글·일 구해요·사업체 프로필 공통
  const industries = [
    { code: 'food',    label: '식당·카페' },
    { code: 'factory', label: '공장·농장' },
    { code: 'clean',   label: '청소·건설' },
    { code: 'office',  label: '사무·서비스' },
    { code: 'beauty',  label: '뷰티' },
    { code: 'drive',   label: '운전·배달' },
    { code: 'retail',  label: '마트·판매' },
    { code: 'other',   label: '기타' },
  ];

  const lists = { states, roomTypes, stays, ageBands, genders, statuses, visas, industries };

  function list(kind) { return lists[kind] || []; }
  function codes(kind) { return list(kind).map(x => x.code); }
  function label(kind, code) {
    const hit = list(kind).find(x => x.code === code);
    return hit ? hit.label : '';
  }
  function state(code) { return states.find(s => s.code === String(code || '').toLowerCase()) || null; }
  function isCode(kind, code) { return codes(kind).indexOf(code) !== -1; }

  window.koausEnums = Object.freeze({ states, roomTypes, stays, ageBands, genders, statuses, visas, industries, list, codes, label, state, isCode });
})();
