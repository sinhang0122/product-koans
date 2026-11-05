'use strict';
// ═══════════════════════════════════════════════════════════════════
//  한글 동네 이름 → 영문 이름 + 동네 중심 좌표(대략, ±1km) — 외부 글의 동네 칸·제목에서 찾아 지도 핀(동네 중심)으로 쓴다.
//  QLD(브리즈번·골드코스트) 위주. 지오코딩 키가 없어도 여기 있는 동네는 핀이 찍힌다. 번지·도로명은 어디에도 저장하지 않는다.
//  - 표기 흔들림(써니뱅크/서니뱅크, 사우스뱅크/싸우스뱅크)은 ko 배열로 같이 적는다.
//  - 긴 이름이 먼저 맞는다('써니뱅크힐스'가 '써니뱅크'에 안 먹힘). 영문 키는 단어 경계로만 맞춘다(ascot ≠ mascot).
//  - 너무 짧아 다른 말과 겹치는 한글('눈다'·'밸리')은 넣지 않는다.
// ═══════════════════════════════════════════════════════════════════
const S = [
  // 브리즈번 남부
  { en: 'Sunnybank Hills',    ko: ['써니뱅크힐스', '써니뱅크 힐스', '서니뱅크힐스', 'sunnybank hills'], lat: -27.610, lng: 153.052 },
  { en: 'Sunnybank',          ko: ['써니뱅크', '서니뱅크', 'sunnybank'], lat: -27.578, lng: 153.059 },
  { en: 'Eight Mile Plains',  ko: ['에잇마일', '에이트마일', '에잇 마일', 'eight mile'], lat: -27.580, lng: 153.093 },
  { en: 'Algester',           ko: ['알제스터', 'algester'], lat: -27.612, lng: 153.032 },
  { en: 'Calamvale',          ko: ['칼람베일', '칼럼베일', 'calamvale'], lat: -27.624, lng: 153.047 },
  { en: 'Runcorn',            ko: ['런콘', 'runcorn'], lat: -27.595, lng: 153.080 },
  { en: 'Kuraby',             ko: ['쿠라비', 'kuraby'], lat: -27.607, lng: 153.095 },
  { en: 'Underwood',          ko: ['언더우드', 'underwood'], lat: -27.610, lng: 153.110 },
  { en: 'Springwood',         ko: ['스프링우드', 'springwood'], lat: -27.613, lng: 153.133 },
  { en: 'Rochedale',          ko: ['로체데일', '로치데일', 'rochedale'], lat: -27.572, lng: 153.124 },
  { en: 'Loganlea',           ko: ['로건리', 'loganlea'], lat: -27.672, lng: 153.140 },
  { en: 'Logan Central',      ko: ['로건센트럴', '로건 센트럴', 'logan central'], lat: -27.640, lng: 153.108 },
  { en: 'Woodridge',          ko: ['우드리지', 'woodridge'], lat: -27.632, lng: 153.103 },
  { en: 'Browns Plains',      ko: ['브라운스플레인스', '브라운플레인', 'browns plains'], lat: -27.660, lng: 153.030 },
  { en: 'Coopers Plains',     ko: ['쿠퍼스플레인', '쿠퍼스 플레인', 'coopers plains'], lat: -27.565, lng: 153.040 },
  { en: 'Macgregor',          ko: ['맥그리거', '맥그레거', 'macgregor'], lat: -27.565, lng: 153.070 },
  { en: 'Robertson',          ko: ['로버트슨', 'robertson'], lat: -27.565, lng: 153.060 },
  { en: 'Upper Mount Gravatt', ko: ['어퍼마운트그라밧', '어퍼 마운트', 'upper mount gravatt'], lat: -27.560, lng: 153.090 },
  { en: 'Mount Gravatt',      ko: ['마운트그라밧', '마운트 그라밧', '마운틴그라밧', 'mount gravatt', 'mt gravatt'], lat: -27.540, lng: 153.080 },
  { en: 'Moorooka',           ko: ['무루카', '모루카', 'moorooka'], lat: -27.535, lng: 153.025 },
  { en: 'Annerley',           ko: ['애널리', '아널리', 'annerley'], lat: -27.510, lng: 153.030 },
  { en: 'Carindale',          ko: ['카린데일', 'carindale'], lat: -27.505, lng: 153.100 },
  { en: 'Cannon Hill',        ko: ['캐논힐', '캐넌힐', 'cannon hill'], lat: -27.470, lng: 153.090 },
  { en: 'Woolloongabba',      ko: ['울룬가바', '우롱가바', '울런가바', 'woolloongabba', 'gabba'], lat: -27.490, lng: 153.035 },
  { en: 'Kangaroo Point',     ko: ['캥거루포인트', '캥거루 포인트', 'kangaroo point'], lat: -27.480, lng: 153.035 },
  { en: 'South Brisbane',     ko: ['사우스브리즈번', '싸우스브리즈번', '사우스뱅크', '싸우스뱅크', '사우스 뱅크', 'south brisbane', 'southbank', 'south bank'], lat: -27.480, lng: 153.020 },
  { en: 'West End',           ko: ['웨스트엔드', '웨스트 엔드', 'west end', 'westend'], lat: -27.483, lng: 153.010 },
  { en: 'Brisbane City',      ko: ['브리즈번 시티', '브리즈번시티', '브리즙번 시티', '시티', 'cbd', 'brisbane city'], lat: -27.470, lng: 153.025 },
  { en: 'Spring Hill',        ko: ['스프링힐', 'spring hill'], lat: -27.460, lng: 153.025 },
  { en: 'Fortitude Valley',   ko: ['포티튜드밸리', '포티튜드 밸리', 'fortitude valley'], lat: -27.457, lng: 153.035 },
  { en: 'New Farm',           ko: ['뉴팜', 'new farm'], lat: -27.468, lng: 153.050 },
  { en: 'Kelvin Grove',       ko: ['켈빈그로브', '켈빈 그로브', 'kelvin grove'], lat: -27.450, lng: 153.010 },
  { en: 'Milton',             ko: ['밀튼', '밀턴', 'milton'], lat: -27.470, lng: 153.000 },
  { en: 'Toowong',            ko: ['투웡', '토우옹', '투웅', 'toowong'], lat: -27.485, lng: 152.990 },
  { en: 'St Lucia',           ko: ['세인트루시아', '세인트 루시아', 'st lucia'], lat: -27.500, lng: 153.000 },
  { en: 'Indooroopilly',      ko: ['인두루필리', '인도루필리', 'indooroopilly'], lat: -27.500, lng: 152.975 },
  { en: 'Chermside',          ko: ['첨사이드', '첨싸이드', 'chermside'], lat: -27.385, lng: 153.030 },
  { en: 'Taigum',             ko: ['타이검', 'taigum'], lat: -27.345, lng: 153.045 },
  { en: 'Nundah',             ko: ['nundah'], lat: -27.400, lng: 153.060 },
  { en: 'Aspley',             ko: ['애스플리', '아스플리', 'aspley'], lat: -27.365, lng: 153.015 },
  { en: 'Ascot',              ko: ['아스콧', '애스콧', 'ascot'], lat: -27.430, lng: 153.060 },
  { en: 'Ipswich',            ko: ['입스위치', 'ipswich'], lat: -27.615, lng: 152.760 },
  { en: 'Beenleigh',          ko: ['빈리', 'beenleigh'], lat: -27.712, lng: 153.203 },
  { en: 'Yatala',             ko: ['야탈라', 'yatala'], lat: -27.730, lng: 153.220 },
  // 골드코스트
  { en: 'Southport',          ko: ['사우스포트', '싸우스포트', 'southport'], lat: -27.970, lng: 153.410 },
  { en: 'Surfers Paradise',   ko: ['서퍼스', '써퍼스', 'surfers'], lat: -28.000, lng: 153.430 },
  { en: 'Broadbeach',         ko: ['브로드비치', 'broadbeach'], lat: -28.030, lng: 153.430 },
  { en: 'Robina',             ko: ['로비나', 'robina'], lat: -28.070, lng: 153.390 },
  { en: 'Burleigh Heads',     ko: ['벌리헤즈', '벌리', 'burleigh'], lat: -28.090, lng: 153.450 },
  { en: 'Coolangatta',        ko: ['쿨랑가타', 'coolangatta'], lat: -28.170, lng: 153.540 },
  { en: 'Labrador',           ko: ['라브라도', '래브라도', 'labrador'], lat: -27.940, lng: 153.400 },
  { en: 'Helensvale',         ko: ['헬렌스베일', 'helensvale'], lat: -27.920, lng: 153.330 },
  { en: 'Nerang',             ko: ['네랑', 'nerang'], lat: -27.990, lng: 153.340 },
  { en: 'Varsity Lakes',      ko: ['바시티레이크', '바시티 레이크', 'varsity lakes'], lat: -28.080, lng: 153.410 },
  { en: 'Ashmore',            ko: ['애쉬모어', '애시모어', 'ashmore'], lat: -27.985, lng: 153.375 },
  { en: 'Gold Coast',         ko: ['골드코스트', '골코', 'gold coast'], lat: -28.017, lng: 153.400 },
  // QLD 지방
  { en: 'Toowoomba',          ko: ['투움바', 'toowoomba'], lat: -27.560, lng: 151.950 },
  { en: 'Sunshine Coast',     ko: ['선샤인코스트', '썬샤인코스트', '썬코', 'sunshine coast'], lat: -26.650, lng: 153.070 },
  { en: 'Cairns',             ko: ['케언즈', '케언스', 'cairns'], lat: -16.920, lng: 145.770 },
  { en: 'Townsville',         ko: ['타운즈빌', 'townsville'], lat: -19.260, lng: 146.820 },
  { en: 'Bundaberg',          ko: ['번다버그', 'bundaberg'], lat: -24.870, lng: 152.350 },
  { en: 'Gatton',             ko: ['개튼', '가튼', 'gatton'], lat: -27.560, lng: 152.280 },
  { en: 'Stanthorpe',         ko: ['스탠소프', 'stanthorpe'], lat: -28.660, lng: 151.930 },
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENTRIES = [];
for (const s of S) {
  for (const k of s.ko) {
    const key = k.toLowerCase();
    const ascii = /^[a-z0-9 ]+$/.test(key);
    ENTRIES.push({ s, key, len: key.length, re: ascii ? new RegExp('(^|[^a-z])' + esc(key) + '(?=[^a-z]|$)') : null });
  }
}
ENTRIES.sort((a, b) => b.len - a.len);   // 긴 이름 우선

// 텍스트에서 동네 찾기 → {en, lat, lng} 또는 null
function findSuburb(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  for (const e of ENTRIES) {
    const ok = e.re ? e.re.test(t) : t.includes(e.key);
    if (ok) return { en: e.s.en, lat: e.s.lat, lng: e.s.lng };
  }
  return null;
}
module.exports = { SUBURBS: S, findSuburb };
