'use strict';
// 파서·사전 단위 테스트 — node test-parsers.js (실제 선브리즈번 목록에서 베낀 행 구조)
const assert = require('assert');
const { parseList, parseDetail, noContact } = require('./parsers');
const { findSuburb } = require('./suburbs-ko');
const { _internal } = require('./index.js');

const item = (id, no, title, row1, phone, zone, suburb, date) => `
<div class="webzine-item"><div class="webzine-item-body"><div class="webzine-noimg-desc">
 <div class="webzine-img"><a href="https://www.sunbrisbane.com/brsb/bbs/board.php?bo_table=home&amp;wr_id=${id}"><div class="webzine-img-box"><div class="webzine-img-box-in"><img src="/brsb/eyoom/theme/basic3/image/noimage.gif" alt="no-image"></div></div></a></div>
 <h4 class="ellipsis"><a href="https://www.sunbrisbane.com/brsb/bbs/board.php?bo_table=home&amp;wr_id=${id}"> ${no}. <strong>${title}</strong> </a></h4>
 <div class="ex-list"><div class="row"><div class="col col-12 ellipsis"> <span class="color-blue">${row1[0]}</span> | ${row1[1]} | ${row1[2]} | ${row1[3]} </div></div></div>
 <div class="ex-list"><div class="row"><ul><li class="col col-12 md-margin-bottom-10">${phone}</li></ul></div></div>
 <div class="ex-list"><div class="row"><div class="col col-12 ellipsis"> <span class="color-grey margin-right-5"><span class="cate_box" style="background:#2aac00;">${zone}</span> </span> ${suburb} </div></div></div>
 <div class="webzine-info"><span><i class="fa fa-eye"></i><strong class="color-black">14</strong></span> <span><span class="sv_wrap"><b>yxxth00</b></span></span> <span class="webzine-date"><i class="fa fa-clock-o"></i> ${date} </span></div>
</div></div></div>`;
const webzine = `<html><body><div class="board-webzine eyoom-form">
${item(214735, '13,190', '깨끗한 마스터룸에서 에어컨과 사생활 지키며 생활하실 분 오세요 당장', ['', '쉐어독방', '남녀무관', '바로 가능'], '', '시티', '', '2026.11.04')}
${item(214733, '13,188', '런콘 와리갈스퀘어 (Runcorn Warrigal Square Shopping Centre) 0426 020 919', ['215/주', '쉐어독방', '', '바로 입주 가능'], '0426020919', '2존', '', '2026.11.04')}
${item(214731, '13,186', 'Loganlea 독방 쉐어생 구해요', ['180(모든빌 포함)', '쉐어독방', '남녀무관', '바로가능'], '0434980013', '4존', '', '2026.11.03')}
${item(214734, '13,189', '단기 환영! 웰컴! www.example.com', ['', '쉐어독방', '여', ''], '', '시티', '써니뱅크', '2026.11.02')}
${item(214716, '13,171', '리버시티 렌트 받으실 분 구합니다 (테이크오버)', ['', '랜트', '', ''], '', '시티', '79 Albert st', '2026.10.01')}
</div></body></html>`;

const tr = (cls, id, cat, title, who, date) => `<tr class="${cls}"><td class="td-num hidden-md hidden-sm">16,719</td><td class="td-subj-wrap"><div class="td-subject ellipsis"><a href="https://www.sunbrisbane.com/brsb/bbs/board.php?bo_table=job&amp;wr_id=${id}"><span class="color-grey margin-right-5"><span class="cate_box" style="background:#7bcb7b;">${cat}</span> </span> <i class="fa fa-circle margin-right-5"></i> <span class="subject">${title}</span></a></div></td><td class="td-name hidden-xs"><span class="td-name-in"><span class="sv_wrap"><b>${who}</b></span></span></td><td class="td-date hidden-xs"> ${date} </td><td class="td-num hidden-xs">9</td></tr>`;
const table = `<html><body><div class="board-list"><table><tbody>
<tr class="board-notice"><td class="td-num"><strong class="color-red">공지</strong></td><td class="td-subj-wrap"><div class="td-subject ellipsis"><a href="https://www.sunbrisbane.com/brsb/bbs/board.php?bo_table=job&amp;wr_id=198199"><span class="cate_box">구인</span> <strong>CBD Medical Centre 에서 리셉셔니스트를 모집합니다</strong></a></div></td><td class="td-date hidden-xs">2026.10.29</td></tr>
<tr class="td-mobile visible-xs"><td colspan="5"><span class="td-mobile-name"><b>Sun Admin</b></span> <span>2026.10.29</span></td></tr>
${tr('', 198831, '한식', '◆써니뱅크 BBQ 레스토랑 주방 풀타임 &amp; 파트타임 직원 모집 ◆ 0412 345 678', 'CaseyB', '2026.11.04')}
${tr('', 198829, '청소', '사우스 브리즈번 호텔 하우스키핑 직원 구합니다', 'plainnote', '2026.11.04')}
${tr('', 198827, '운송', '금요일오전 브리즈번공항 drop 저렴하게 모십니다.', 'Weekend', '2026.11.04')}
</tbody></table></div></body></html>`;

// ── 웹진형 ──
const w = parseList(webzine, 'https://www.sunbrisbane.com/brsb/bbs/board.php?bo_table=home&page=1');
assert.strictEqual(w.type, 'webzine');
assert.strictEqual(w.items.length, 5);
const a = w.items[0];
assert.strictEqual(a.extId, '214735');
assert.strictEqual(a.title, '깨끗한 마스터룸에서 에어컨과 사생활 지키며 생활하실 분 오세요 당장');
assert.strictEqual(a.url, 'https://www.sunbrisbane.com/brsb/bbs/board.php?bo_table=home&wr_id=214735');
assert.deepStrictEqual([a.kind, a.genderText, a.moveIn, a.zone, a.suburb, a.dateStr], ['쉐어독방', '남녀무관', '바로 가능', '시티', '', '2026-11-04']);
const b = w.items[1];
assert.strictEqual(b.priceText, '215/주');
assert.ok(!/0426/.test(b.title), '제목의 전화번호 제거: ' + b.title);
assert.strictEqual(_internal.priceOf(b.priceText), 215);
assert.strictEqual(_internal.priceOf(w.items[2].priceText), 180);
assert.strictEqual(_internal.priceOf(''), null);
assert.strictEqual(_internal.genderOf('남녀무관'), '');
assert.strictEqual(_internal.genderOf('여'), 'female');
assert.strictEqual(_internal.genderOf('남'), 'male');
assert.ok(!/example/.test(w.items[3].title), '제목의 링크 제거: ' + w.items[3].title);
assert.strictEqual(w.items[3].suburb, '써니뱅크');
assert.strictEqual(w.items[4].suburb, '', '번지수 섞인 동네 칸은 버림');
assert.strictEqual(w.items[4].kind, '랜트');
// ── 표형 ──
const t = parseList(table, 'https://www.sunbrisbane.com/brsb/bbs/board.php?bo_table=job&page=1');
assert.strictEqual(t.type, 'table');
assert.deepStrictEqual(t.items.map(x => x.extId), ['198831', '198829', '198827'], '공지·모바일 중복행 제외');
assert.strictEqual(t.items[0].category, '한식');
assert.ok(/써니뱅크 BBQ 레스토랑 주방 풀타임 & 파트타임 직원 모집/.test(t.items[0].title), t.items[0].title);
assert.ok(!/0412/.test(t.items[0].title), '구인 제목의 전화번호 제거');
assert.strictEqual(t.items[0].dateStr, '2026-11-04');
// ── 사전 ──
assert.strictEqual(findSuburb('1인실/2인1실 써니뱅크힐스 꼬불 3분거리').en, 'Sunnybank Hills');
assert.strictEqual(findSuburb('써니뱅크 독방').en, 'Sunnybank');
assert.strictEqual(findSuburb('브리즈번 시티 여자 2인1실').en, 'Brisbane City');
assert.strictEqual(findSuburb('첨사이드 옆 Taigum 에서 장, 단기').en, 'Taigum');   // 긴 키 우선(taigum 6자 > 첨사이드 4자) — 실제로도 Taigum 이 맞음
assert.strictEqual(findSuburb('mascot 근처'), null, '영문은 단어 경계');
assert.strictEqual(findSuburb('ascot 근처').en, 'Ascot');
assert.strictEqual(findSuburb('아무 동네 없음'), null);
// ── 날짜 ──
assert.strictEqual(_internal.dayMs('2026-11-04'), Date.parse('2026-11-04T00:00:00+10:00'));
assert.strictEqual(noContact('연락 0412 345 678 주세요 https://x.y/z'), '연락 주세요');

// ── 상세 페이지(full 모드) ──
const detail = `<html><body><div class="board-view"><div class="board-view-info"><div class="view-info-box"><div class="info-box-top"><span class="view-nick"><b>김루이</b></span></div><div class="info-box-bottom"><span><i class="fa fa-clock-o"></i>2026.11.04 20:47</span> <span><i class="fa fa-eye"></i>92</span></div></div></div>
<div class="board-view-atc"><h2 class="board-view-atc-title">본문</h2><div class="board-view-con view-content"><p>런콘 와리갈스퀘어 근처 2층 집 하우스에서 같이 쉐어하실분 찾습니다</p><p>2주 디파짓, 2주 노티스 // ($215/주) &lt; 모든 빌포함입니다.</p><p>주소는 연락주시면 답장드리겠습니다.<br>0426 020 919 로 연락주세요 https://open.kakao.com/o/abc</p><img src="/brsb/data/editor/x.jpg"><img src="/brsb/data/editor/y.jpg"><script>alert(1)</script></div></div></div>
<div class="board-list"><div class="board-webzine"></div></div></body></html>`;
const dd = parseDetail(detail);
assert.ok(dd, 'detail parsed');
assert.strictEqual(dd.postedAtStr, '2026-11-04 20:47');
assert.strictEqual(dd.imageCount, 2);
assert.deepStrictEqual(dd.phones, ['0426020919']);
assert.ok(!/0426|kakao|alert/.test(dd.bodyPublic), '공개 본문에 전화·링크·스크립트 없음: ' + dd.bodyPublic);
assert.ok(/런콘 와리갈스퀘어 근처/.test(dd.bodyPublic) && /\n/.test(dd.bodyPublic), '본문 줄바꿈 보존');
assert.strictEqual(w.items[1].phoneText, '0426020919', '목록 둘째 줄 전화 → phoneText');
assert.strictEqual(w.items[0].phoneText, '');
assert.strictEqual(_internal.minuteMs('2026-11-04 20:47'), Date.parse('2026-11-04T20:47:00+10:00'));
console.log('detail OK');
console.log('parsers OK —', w.items.length, 'webzine,', t.items.length, 'table rows');
