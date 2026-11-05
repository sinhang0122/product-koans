'use strict';
// 배포 전 확인용(맥에서 실행, Firestore 안 씀):  node dry-run.js sunbrisbane home 1
//   → 그 게시판 1쪽을 실제로 받아 파서 결과(제목·가격·종류·동네·날짜·링크·핀 좌표)를 찍는다.
const { SOURCES } = require('./sources');
const { parseList } = require('./parsers');
const { findSuburb } = require('./suburbs-ko');
const [,, srcId = 'sunbrisbane', key = 'home', pageArg = '1'] = process.argv;
const src = SOURCES[srcId]; if (!src) { console.error('모르는 사이트:', srcId); process.exit(1); }
const b = src.boards.find(x => x.key === key); if (!b) { console.error('모르는 게시판:', key, '→', src.boards.map(x => x.key).join(', ')); process.exit(1); }
const UA = 'KoAusBot/1.0 (+https://koaus.com.au/contact.html; title/price/suburb/link only; removal requests welcome)';
(async () => {
  const url = b.url(Number(pageArg) || 1);
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'ko,en;q=0.8' }, signal: AbortSignal.timeout(15000) });
  console.log('GET', url, '→', r.status, r.headers.get('content-type'));
  const html = await r.text();
  const { type, items } = parseList(html, url);
  console.log('type:', type, '| items:', items.length);
  let pins = 0;
  for (const it of items) {
    const g = findSuburb([it.suburb, it.title].filter(Boolean).join(' '));
    if (g) pins++;
    console.log(`- [${it.extId}] ${it.dateStr} | ${it.title.slice(0, 48)} | ${it.priceText || it.category || ''} | ${it.kind || ''} ${it.genderText || ''} | ${it.zone || ''} ${it.suburb || ''} | ${g ? g.en : '(핀 없음)'}`);
  }
  console.log(`핀 찍히는 글: ${pins}/${items.length}`);
  if (!items.length) { console.error('파서가 아무것도 못 읽음 — 사이트 구조가 바뀌었을 수 있음'); process.exit(2); }
})().catch(e => { console.error('실패:', e.message || e); process.exit(1); });
