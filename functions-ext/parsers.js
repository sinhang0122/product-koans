'use strict';
// ═══════════════════════════════════════════════════════════════════
//  KoAus · 외부 사이트 목록 페이지 파서 — 제목·가격·종류·성별·입주·동네(이름만)·날짜·원문 링크만 뽑는다.
//  - 전화번호·링크는 어느 칸에서든 지운다(noContact). 번지수가 섞인 동네 칸은 통째로 버린다(동네 이름만 저장).
//  - 사진·본문·작성자는 가져오지 않는다.
//  - gnuboardWebzine: 그누보드5 eyoom 테마 '웹진형' 목록(선브리즈번 숙소정보) — .board-webzine .webzine-item
//  - gnuboardTable:   그누보드5 '표형' 목록(선브리즈번 구인구직) — .board-list tbody tr (공지·모바일 중복행 제외)
// ═══════════════════════════════════════════════════════════════════
const cheerio = require('cheerio');

const PHONE_RE = /(?:\+?61|0)[ -]?[2-9](?:[ -]?\d){7,9}|(?:\d[ .\-]?){8,}/g;   // 호주 번호·8자리 이상 숫자열
const LINK_RE = /https?:\/\/\S+|www\.\S+/gi;
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const noContact = s => clean(s).replace(LINK_RE, '').replace(PHONE_RE, '').replace(/\s{2,}/g, ' ').trim();
const wrId = href => { const m = /wr_id=(\d+)/.exec(String(href || '')); return m ? m[1] : null; };
const parseDate = s => { const m = /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/.exec(String(s || '')); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; };
const stripNo = s => clean(s).replace(/^[\d,]+\.\s*/, '').replace(/^-\s*/, '');   // "13,190. 제목" → "제목"
const digitsOnly = s => { const d = String(s || '').replace(/[^\d+]/g, ''); return d.replace(/\D/g, '').length >= 8 && d.length <= 16 ? d : ''; };
const absUrl = (href, base) => { try { return new URL(String(href || '').replace(/&amp;/g, '&'), base).toString(); } catch (_) { return ''; } };

// 숙소 웹진형: 한 글 = 제목 + "가격 | 종류 | 성별 | 입주" + (전화) + "[존] 동네"
function gnuboardWebzine(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('.board-webzine .webzine-item').each((_, el) => {
    const it = $(el);
    const a = it.find('h4 a[href*="wr_id="]').first();
    const href = absUrl(a.attr('href'), baseUrl);
    const id = wrId(href);
    if (!id) return;
    const title = noContact(stripNo(a.find('strong').text() || a.text()));
    if (!title) return;
    const ex = it.find('.ex-list').map((_, e) => clean($(e).text())).get();
    const row1 = (ex[0] || '').split('|').map(clean);               // [가격, 종류, 성별, 입주]
    const zone = clean(it.find('.cate_box').first().text());
    const last = ex.length >= 2 ? ex[ex.length - 1] : '';
    let suburb = clean(zone ? last.replace(zone, '') : last);
    if (/\d/.test(suburb) || suburb.length > 40) suburb = '';       // 번지·전화가 섞이면 동네 칸은 버린다
    suburb = noContact(suburb);
    const phoneText = ex.length >= 3 ? digitsOnly(ex[1]) : '';   // 둘째 줄 = 연락처(전체 수집 모드에서만 저장, 비공개 문서로)
    out.push({
      extId: id, url: href, title: title.slice(0, 120),
      priceText: row1[0] || '', kind: (row1[1] || '').slice(0, 20), genderText: row1[2] || '',
      moveIn: noContact(row1[3] || '').slice(0, 30), zone: zone.slice(0, 20), suburb, phoneText,
      dateStr: parseDate(it.find('.webzine-date').text()),
    });
  });
  return out;
}

// 구인 표형: 한 행 = [번호] [분류] 제목 | 작성자 | 날짜 | 조회
function gnuboardTable(html, baseUrl) {
  const $ = cheerio.load(html);
  const out = [];
  $('.board-list tbody tr').each((_, el) => {
    const tr = $(el);
    if (tr.hasClass('board-notice') || tr.hasClass('td-mobile')) return;
    const a = tr.find('.td-subject a[href*="wr_id="], a[href*="wr_id="]').first();
    const href = absUrl(a.attr('href'), baseUrl);
    const id = wrId(href);
    if (!id) return;
    const category = clean(tr.find('.cate_box').first().text());
    let title = a.find('.subject').text() || a.find('strong').text();
    if (!title) { title = clean(a.text()); if (category && title.startsWith(category)) title = title.slice(category.length); }
    title = noContact(stripNo(title));
    if (!title) return;
    out.push({ extId: id, url: href, title: title.slice(0, 120), category: category.slice(0, 20), dateStr: parseDate(tr.find('.td-date').first().text() || tr.text()) });
  });
  return out;
}

// 상세 페이지(전체 수집 모드) — 본문 글(줄바꿈 보존)·올린 시각·본문 속 전화번호·사진 수. 사진 자체는 가져오지 않는다.
//   선브리즈번(eyoom): .board-view-con.view-content 본문, .board-view-info 에 "2026.11.04 20:47"
function parseDetail(html) {
  const $ = cheerio.load(html);
  const con = $('.board-view-con, .view-content, #bo_v_con').first();
  if (!con.length) return null;
  con.find('script, style, iframe, noscript').remove();
  const imageCount = con.find('img').length;
  con.find('br').replaceWith('\n');
  con.find('p, div, li, tr, h1, h2, h3, h4').append('\n');
  let text = con.text().replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const phones = Array.from(new Set((text.match(PHONE_RE) || []).map(x => digitsOnly(x)).filter(Boolean)));
  const w = /(\d{4})[.\-](\d{2})[.\-](\d{2})\s+(\d{2}):(\d{2})/.exec($('.board-view-info').first().text() || '');
  const postedAtStr = w ? `${w[1]}-${w[2]}-${w[3]} ${w[4]}:${w[5]}` : null;
  const bodyPublic = text.replace(LINK_RE, '').replace(PHONE_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);   // 공개 본문: 전화·링크 뺀 글
  return { bodyPublic, phones, postedAtStr, imageCount, bodyLen: text.length };
}

// 페이지 종류 자동 판별 — 웹진형이 있으면 웹진, 없으면 표형
function parseList(html, baseUrl) {
  if (/board-webzine/.test(html)) return { type: 'webzine', items: gnuboardWebzine(html, baseUrl) };
  return { type: 'table', items: gnuboardTable(html, baseUrl) };
}

module.exports = { gnuboardWebzine, gnuboardTable, parseList, parseDetail, clean, noContact, parseDate, digitsOnly };
