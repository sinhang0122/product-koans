'use strict';
// ═══════════════════════════════════════════════════════════════════
//  KoAus Cloud Functions · ext 코드베이스(11-05) — 외부 한인 사이트 글 수집
//  - 배포: npx firebase deploy --only functions:ext   (메일 함수가 있는 'default' 코드베이스와 따로 배포된다)
//  - 두 가지 모드(ext_sources/{site}.mode, 관리자가 바꿈):
//      'link' — 목록만: 제목·가격·종류·성별·입주·동네 이름·날짜·원문 링크. 누르면 원문으로.
//      'full' — 목록 + 글마다 상세 페이지 1번: 본문 글(전화·링크 뺀 공개본)·올린 시각 → ext_posts, 전화번호 → ext_private(로그인 회원만 읽음).
//               사진은 가져오지 않는다(원문 링크로). 사용자 결정(11-05): 선브리즈번은 full, 나머지는 link. 경고 오면 link 로 내리면 다음 실행 때 본문·전화를 지운다.
//  - 30분마다: 켜진 사이트의 각 게시판 앞 2쪽(새 글). 2시간마다(짝수 시 정각): 14일치 전체를 훑어 원문에서 내려간 글(두 번 연속 안 보임)·14일 지난 글을 숨긴다.
//  - 스위치: ext_sources/{site}.enabled — 꺼지면 다음 실행 때 그 사이트 글을 전부 숨긴다(화면은 koaus-ext.js 가 즉시 뺀다).
//  - 숫자: stats/public — 사이트별·게시판별 보이는 글 수, KoAus 글 수, 오늘 글 수, 누적 수집 수.
//  - 관리자 호출(extAdmin): run(지금 수집·과거 글 되찾기) · hide(전부 숨김) · purge(전부 삭제) · stats(숫자 새로고침)
//  - 지오코딩: suburbs-ko.js 사전(한글 동네 → 좌표)이 1순위. 사전에 없으면 functions-ext/.env 의 GEOCODE_KEY(Geocoding API 전용 키)가 있을 때만 구글에 묻고 geo_cache 에 저장.
// ═══════════════════════════════════════════════════════════════════
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { SOURCES } = require('./sources');
const { parseList, parseDetail } = require('./parsers');
const { findSuburb } = require('./suburbs-ko');

if (!admin.apps.length) admin.initializeApp();
setGlobalOptions({ region: 'australia-southeast1', maxInstances: 2 });

const OWNER_EMAIL = 'sinhang0122@gmail.com';
const WINDOW_DAYS = 14;          // 사용자 결정(11-04): 14일. 그보다 오래된 글은 숨김
const PAGES_QUICK = 2;           // 30분 실행: 앞 2쪽
const PAGES_FULL = 20;           // 2시간 실행·관리자 '지금 수집': 14일치가 끝날 때까지, 최대 20쪽
const DETAIL_CAP = 40;           // full 모드: 한 실행에 게시판당 상세 페이지 최대 40개(나머지는 다음 실행에)
const DELAY_MS = 800;            // 요청 간격(상대 서버 예의)
const MISS_LIMIT = 2;            // 전체 훑기에서 두 번 연속 안 보이면 '원문에서 내려감'
const RUN_BUDGET_MS = 420000;    // 한 실행 7분 안에(함수 한도 9분)
const UA = 'KoAusBot/1.0 (+https://koaus.com.au/contact.html; community listings mirror; removal requests welcome)';
const BRISBANE_OFFSET = '+10:00';

const db = () => admin.firestore();
const TS = admin.firestore.Timestamp;
const FV = admin.firestore.FieldValue;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dayMs = dateStr => (dateStr ? Date.parse(dateStr + 'T00:00:00' + BRISBANE_OFFSET) : 0);
const minuteMs = s => (s ? Date.parse(String(s).replace(' ', 'T') + ':00' + BRISBANE_OFFSET) : 0);
const priceOf = t => { const m = /(\d{2,4})/.exec(String(t || '').replace(/,/g, '')); const n = m ? Number(m[1]) : 0; return n >= 50 && n <= 2500 ? n : null; };
const genderOf = t => (/남녀/.test(t) ? '' : (/여/.test(t) ? 'female' : (/남/.test(t) ? 'male' : '')));
const todayStartMs = () => { const now = new Date(Date.now() + 10 * 3600000); return Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00' + BRISBANE_OFFSET); };

// ── HTML 가져오기(문자셋 자동) ──
async function fetchHtml(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  const buf = Buffer.from(await r.arrayBuffer());
  let enc = (/charset=([\w-]+)/i.exec(r.headers.get('content-type') || '') || [])[1];
  if (!enc) enc = (/charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1')) || [])[1];
  enc = (enc || 'utf-8').toLowerCase();
  try { return new TextDecoder(enc).decode(buf); } catch (_) { return buf.toString('utf8'); }
}

// ── 동네 → 좌표: 사전 → (키 있을 때만) 구글 지오코딩 + geo_cache ──
const geoMem = new Map();
async function geoFor(it, board) {
  const hit = findSuburb([it.suburb, it.title].filter(Boolean).join(' '));   // 동네 칸·제목에서 사전 찾기(긴 이름 우선)
  if (hit) return { lat: hit.lat, lng: hit.lng, suburbEn: hit.en };
  if (it.zone === '시티') {   // 존(시티/2존/4존)은 동네가 아니라 '시티'만 지역별 중심지로
    if (board.region === '브리즈번') return { lat: -27.470, lng: 153.025, suburbEn: 'Brisbane City' };
    if (board.region === '골드코스트') return { lat: -28.000, lng: 153.430, suburbEn: 'Surfers Paradise' };
  }
  const q = it.suburb; const key = process.env.GEOCODE_KEY || '';
  if (!q || !key) return null;
  const state = String(board.state || '').toLowerCase();
  const ck = (q + '|' + state).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 80);
  if (geoMem.has(ck)) return geoMem.get(ck);
  const ref = db().collection('geo_cache').doc(ck);
  const snap = await ref.get();
  if (snap.exists) { const d = snap.data() || {}; const v = d.ok ? { lat: d.lat, lng: d.lng, suburbEn: d.name } : null; geoMem.set(ck, v); return v; }
  let v = null;
  try {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(q + ' ' + state.toUpperCase() + ' Australia') + '&components=country:AU&language=en&region=au&key=' + key;
    const j = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json();
    const okTypes = ['locality', 'sublocality', 'neighborhood', 'postal_town'];
    const r = (j.results || []).find(x => (x.types || []).some(t => okTypes.includes(t)) && (x.address_components || []).some(c => c.types.includes('administrative_area_level_1') && String(c.short_name).toLowerCase() === state));
    if (r) { const loc = r.address_components.find(c => c.types.includes('locality')) || r.address_components[0]; v = { lat: r.geometry.location.lat, lng: r.geometry.location.lng, suburbEn: String(loc.long_name).slice(0, 60) }; }
  } catch (e) { logger.warn('geocode 실패', q, e.message); return null; }   // 실패는 캐시하지 않음
  await ref.set({ q, state, ok: !!v, lat: v ? v.lat : null, lng: v ? v.lng : null, name: v ? v.suburbEn : null, at: TS.now() });
  geoMem.set(ck, v);
  return v;
}

// ── 게시판 하나 수집 ──
//   full=false: 앞 PAGES_QUICK 쪽만(새 글·바뀐 글). full=true: 14일이 끝날 때까지 + 안 보이는 글 숨기기
//   cfg.mode === 'full' 이면 본문 없는 글은 상세 페이지를 받아 본문·시각·전화(비공개)를 채운다
async function runBoard(srcId, src, b, opts, cfg) {
  const cutoffMs = Date.now() - WINDOW_DAYS * 86400000;
  const cap = opts.full ? (opts.pageCap || PAGES_FULL) : PAGES_QUICK;
  const deadline = opts.deadline || (Date.now() + RUN_BUDGET_MS);
  const seen = new Map();
  let pages = 0, stop = false, type = '';
  for (let p = 1; p <= cap && !stop && Date.now() < deadline; p++) {
    const url = b.url(p);
    const html = await fetchHtml(url);
    pages++;
    const parsed = parseList(html, url);
    type = parsed.type;
    if (!parsed.items.length) break;
    let olderOnPage = 0;
    for (const it of parsed.items) {
      const ms = dayMs(it.dateStr);
      if (!ms) continue;
      if (ms < cutoffMs) { olderOnPage++; continue; }
      if (!seen.has(it.extId)) seen.set(it.extId, it);
    }
    if (olderOnPage >= parsed.items.length) stop = true;   // 한 쪽이 전부 14일보다 오래되면 끝
    if (p < cap && !stop) await sleep(DELAY_MS);
  }
  // 저장할 모양으로
  const docs = new Map();
  for (const it of seen.values()) {
    let board = b.board;
    if (board === 'jobs' && Array.isArray(src.skipCategories) && src.skipCategories.includes(it.category)) continue;
    if (board === 'accom' && /랜트|렌트/.test(it.kind || '')) board = 'rent';
    const ms = dayMs(it.dateStr);
    const d = {
      source: srcId, sourceName: src.name, boardKey: b.key, board, region: b.region, state: src.state,
      extId: it.extId, extNum: Number(it.extId) || 0, url: it.url, title: it.title,
      postedAt: TS.fromMillis(ms), visible: true, gone: false, expired: false, hiddenBySwitch: false,
    };
    if (board === 'jobs') d.category = it.category || '';
    else Object.assign(d, { price: priceOf(it.priceText), kind: it.kind || '', gender: genderOf(it.genderText || ''), moveIn: it.moveIn || '', zone: it.zone || '', suburb: it.suburb || '' });
    const g = await geoFor(it, { region: b.region, state: src.state });   // 구인 글도 제목의 동네(써니뱅크 BBQ…)로 핀을 찍는다
    if (g) { d.lat = g.lat; d.lng = g.lng; d.suburbEn = g.suburbEn; }
    docs.set(`${srcId}_${b.key}_${it.extId}`, { d, it });
  }
  // 기존 문서와 비교해 바뀐 것만 쓴다
  const col = db().collection('ext_posts');
  const existing = new Map();   // docId → data
  if (opts.full) {
    const snap = await col.where('source', '==', srcId).where('boardKey', '==', b.key).where('visible', '==', true).get();
    snap.forEach(s => existing.set(s.id, s.data()));
  } else if (docs.size) {
    const refs = Array.from(docs.keys()).map(id => col.doc(id));
    for (let i = 0; i < refs.length; i += 100) {
      const got = await db().getAll(...refs.slice(i, i + 100));
      got.forEach(s => { if (s.exists) existing.set(s.id, s.data()); });
    }
  }
  // full 모드: 본문 없는 글은 상세 페이지(게시판당 DETAIL_CAP 개, 시간 예산 안에서)
  const fullMode = cfg && cfg.mode === 'full';
  const privCol = db().collection('ext_private');
  let details = 0, detailErr = 0;
  if (fullMode) {
    for (const [id, { d, it }] of docs) {
      if (details >= DETAIL_CAP || Date.now() > deadline) break;
      const ex = existing.get(id);
      if (ex && ex.bodyAt) continue;
      try {
        await sleep(DELAY_MS);
        const html = await fetchHtml(it.url);
        const det = parseDetail(html);
        details++;
        if (!det) continue;
        d.body = det.bodyPublic; d.bodyAt = TS.now(); d.hasDetail = true; d.imageCount = det.imageCount || 0;
        const pm = minuteMs(det.postedAtStr); if (pm) d.postedAt = TS.fromMillis(pm);
        const phones = Array.from(new Set([it.phoneText, ...(det.phones || [])].filter(Boolean)));
        d.hasPhone = phones.length > 0;
        if (phones.length) await privCol.doc(id).set({ phone: phones[0], phones: phones.slice(0, 3), source: srcId, boardKey: b.key, updatedAt: TS.now() }, { merge: true });
      } catch (e) { detailErr++; logger.warn('[ext] detail 실패', id, e.message || e); }
    }
  }
  const same = (a, b2) => a && a.visible === true && a.title === b2.title && (a.price || null) === (b2.price || null) && (a.kind || '') === (b2.kind || '') && (a.suburb || '') === (b2.suburb || '') && (a.category || '') === (b2.category || '') && (a.moveIn || '') === (b2.moveIn || '') && a.board === b2.board && !b2.bodyAt;
  let batch = db().batch(), n = 0, written = 0, expired = 0, gone = 0;
  const flush = async () => { if (n) { await batch.commit(); batch = db().batch(); n = 0; } };
  const put = async (ref, data, merge) => { batch.set(ref, data, { merge: !!merge }); n++; if (n >= 400) await flush(); };
  for (const [id, { d }] of docs) {
    const ex = existing.get(id);
    if (same(ex, d)) continue;
    if (ex && ex.bodyAt && !d.bodyAt && ex.postedAt) d.postedAt = ex.postedAt;   // 이미 받은 상세의 정확한 시각 유지
    await put(col.doc(id), { ...d, lastSeenAt: TS.now(), missCount: 0 }, true); written++;
  }
  if (opts.full) {
    for (const [id, ex] of existing) {
      if (docs.has(id)) { if (ex.missCount) { await put(col.doc(id), { missCount: 0 }, true); } continue; }
      const ms = ex.postedAt && ex.postedAt.toMillis ? ex.postedAt.toMillis() : 0;
      if (ms && ms < cutoffMs) { await put(col.doc(id), { visible: false, expired: true, hiddenAt: TS.now() }, true); expired++; continue; }
      const miss = (Number(ex.missCount) || 0) + 1;
      if (miss >= MISS_LIMIT) { await put(col.doc(id), { visible: false, gone: true, missCount: miss, hiddenAt: TS.now() }, true); gone++; }
      else await put(col.doc(id), { missCount: miss }, true);
    }
  }
  await flush();
  return { key: b.key, type, pages, found: seen.size, kept: docs.size, written, expired, gone, details, detailErr };
}

// ── 사이트 설정 문서(ext_sources) 보장 ──
async function ensureSource(id, src) {
  const ref = db().collection('ext_sources').doc(id);
  const snap = await ref.get();
  const base = { name: src.name, home: src.home || '', state: src.state, boards: (src.boards || []).map(b => b.key), hasParser: (src.boards || []).length > 0, todo: src.todo || '' };
  if (!snap.exists) {
    const init = { ...base, enabled: !!src.defaultEnabled, mode: src.defaultMode || 'link', counts: {}, createdAt: TS.now(), updatedAt: TS.now() };
    await ref.set(init, { merge: true });
    return init;
  }
  const d = snap.data() || {};
  const fix = {}; for (const k of Object.keys(base)) if (JSON.stringify(d[k]) !== JSON.stringify(base[k])) fix[k] = base[k];
  if (!d.mode) fix.mode = src.defaultMode || 'link';
  if (Object.keys(fix).length) await ref.set(fix, { merge: true });
  return { ...d, ...base, mode: d.mode || fix.mode };
}

async function countsFor(srcId) {
  const out = {};
  for (const board of ['accom', 'rent', 'jobs']) {
    const agg = await db().collection('ext_posts').where('source', '==', srcId).where('board', '==', board).where('visible', '==', true).count().get();
    out[board] = agg.data().count;
  }
  return out;
}

// 보이는 글 전부 숨기기(스위치 OFF·관리자 hide) — 문서는 남긴다(다시 켜면 다음 수집 때 되살아남)
async function hideSource(srcId) {
  const col = db().collection('ext_posts');
  let hidden = 0;
  for (;;) {
    const snap = await col.where('source', '==', srcId).where('visible', '==', true).limit(400).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.forEach(s => batch.set(s.ref, { visible: false, hiddenBySwitch: true, hiddenAt: TS.now() }, { merge: true }));
    await batch.commit(); hidden += snap.size;
    if (snap.size < 400) break;
  }
  await db().collection('ext_sources').doc(srcId).set({ counts: { accom: 0, rent: 0, jobs: 0 }, hasVisible: false, updatedAt: TS.now() }, { merge: true });
  return { hidden };
}

// link 모드로 내렸을 때: 저장된 본문·전화를 지운다("뭐라 하면 그때부터 원문만")
async function stripDetails(srcId) {
  const col = db().collection('ext_posts');
  let stripped = 0;
  for (;;) {
    const snap = await col.where('source', '==', srcId).where('hasDetail', '==', true).limit(300).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.forEach(s => { batch.set(s.ref, { body: FV.delete(), bodyAt: FV.delete(), imageCount: FV.delete(), hasDetail: false, hasPhone: false }, { merge: true }); batch.delete(db().collection('ext_private').doc(s.id)); });
    await batch.commit(); stripped += snap.size;
    if (snap.size < 300) break;
  }
  await db().collection('ext_sources').doc(srcId).set({ detailsStripped: true, updatedAt: TS.now() }, { merge: true });
  return { stripped };
}

// 전부 삭제(경고·삭제 요청 대응) — 되돌릴 수 없음. 비공개 전화 문서도 같이
async function purgeSource(srcId) {
  let deleted = 0;
  for (const colName of ['ext_private', 'ext_posts']) {
    const col = db().collection(colName);
    for (;;) {
      const snap = await col.where('source', '==', srcId).limit(400).get();
      if (snap.empty) break;
      const batch = db().batch();
      snap.forEach(s => batch.delete(s.ref));
      await batch.commit(); deleted += snap.size;
      if (snap.size < 400) break;
    }
  }
  await db().collection('ext_sources').doc(srcId).set({ enabled: false, counts: { accom: 0, rent: 0, jobs: 0 }, hasVisible: false, purgedAt: TS.now(), updatedAt: TS.now() }, { merge: true });
  return { deleted };
}

// ── 사이트 하나 실행 ──
async function runSource(id, opts) {
  const src = SOURCES[id]; if (!src) throw new Error('unknown source ' + id);
  const cfg = await ensureSource(id, src);
  const ref = db().collection('ext_sources').doc(id);
  if (!cfg.enabled) {
    if (cfg.hasVisible !== false) { const h = await hideSource(id); return { id, skipped: 'off', hidden: h.hidden }; }
    return { id, skipped: 'off' };
  }
  if (!src.boards.length) return { id, skipped: 'no-parser' };
  if (cfg.mode !== 'full') { if (!cfg.detailsStripped) await stripDetails(id); }
  else if (cfg.detailsStripped) await ref.set({ detailsStripped: false }, { merge: true });
  const runningMs = cfg.runningAt && cfg.runningAt.toMillis ? cfg.runningAt.toMillis() : 0;
  if (runningMs && Date.now() - runningMs < 12 * 60000 && !opts.force) return { id, skipped: 'running' };
  await ref.set({ runningAt: TS.now() }, { merge: true });
  const boards = [], errors = [];
  for (const b of src.boards) {
    if (Date.now() > (opts.deadline || Infinity)) { errors.push(b.key + ': 시간 예산 초과(다음 실행에 계속)'); continue; }
    try { boards.push(await runBoard(id, src, b, opts, cfg)); }
    catch (e) { errors.push(b.key + ': ' + (e.message || e)); logger.warn('[ext] board 실패', id, b.key, e.message || e); }
    await sleep(DELAY_MS);
  }
  const counts = await countsFor(id);
  await ref.set({ runningAt: null, lastRunAt: TS.now(), lastMode: opts.full ? 'full' : 'quick', lastError: errors.join(' · ').slice(0, 500) || '', lastBoards: boards, counts, hasVisible: true, runs: FV.increment(1), updatedAt: TS.now() }, { merge: true });
  return { id, mode: cfg.mode, boards, errors, counts };
}

// ── 숫자판(stats/public) — 홈·목록 상단 표시용. 외부 글은 보이는 것만, KoAus 글은 승인된 것만 ──
async function refreshStats() {
  const ext = {}, bySource = {}, today = {};
  const t0 = TS.fromMillis(todayStartMs());
  for (const board of ['accom', 'rent', 'jobs']) {
    ext[board] = (await db().collection('ext_posts').where('board', '==', board).where('visible', '==', true).count().get()).data().count;
    today[board] = (await db().collection('ext_posts').where('board', '==', board).where('visible', '==', true).where('postedAt', '>=', t0).count().get()).data().count;
  }
  for (const id of Object.keys(SOURCES)) {
    const s = await db().collection('ext_sources').doc(id).get();
    const d = s.exists ? s.data() : {};
    bySource[id] = { name: SOURCES[id].name, enabled: !!d.enabled, mode: d.mode || 'link', counts: d.counts || {} };
  }
  const own = {};
  try {
    own.accom = (await db().collection('accom_posts').where('status', '==', 'approved').count().get()).data().count;
    own.rent = (await db().collection('rent_posts').where('status', '==', 'approved').count().get()).data().count;
    own.jobs = (await db().collection('jobs_posts').count().get()).data().count;
  } catch (e) { logger.warn('[ext] own count 실패', e.message || e); }
  const cumulative = (await db().collection('ext_posts').count().get()).data().count;
  const doc = { ext, own, bySource, today, cumulative, windowDays: WINDOW_DAYS, updatedAt: TS.now() };
  await db().collection('stats').doc('public').set(doc, { merge: true });
  return doc;
}

async function runAll(opts) {
  const results = [];
  opts.deadline = opts.deadline || (Date.now() + RUN_BUDGET_MS);
  for (const id of Object.keys(SOURCES)) {
    try { results.push(await runSource(id, opts)); }
    catch (e) { results.push({ id, error: e.message || String(e) }); logger.error('[ext] source 실패', id, e); }
  }
  let stats = null;
  try { stats = await refreshStats(); } catch (e) { logger.error('[ext] stats 실패', e); }
  logger.info('[ext] run', JSON.stringify({ mode: opts.full ? 'full' : 'quick', results }));
  return { results, stats };
}

// 30분마다. 짝수 시 정각 실행은 14일치 전체 훑기(삭제 동기화), 나머지는 앞 2쪽(새 글)
exports.extScrape = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Australia/Brisbane', timeoutSeconds: 540, memory: '512MiB', retryCount: 0 }, async () => {
  const now = new Date();
  const full = now.getUTCMinutes() < 15 && now.getUTCHours() % 2 === 0;
  await runAll({ full, trigger: 'schedule' });
});

// 관리자: 지금 수집 / 전부 숨김 / 전부 삭제 / 숫자 새로고침
exports.extAdmin = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (req) => {
  const t = req.auth && req.auth.token;
  if (!t || !(t.admin === true || t.email === OWNER_EMAIL)) throw new HttpsError('permission-denied', '관리자만 쓸 수 있습니다.');
  const { action, source, pages } = req.data || {};
  if (action === 'stats') return await refreshStats();
  if (!SOURCES[source]) throw new HttpsError('invalid-argument', '모르는 사이트입니다.');
  const deadline = Date.now() + RUN_BUDGET_MS;
  if (action === 'run') { const r = await runSource(source, { full: true, pageCap: Math.min(Math.max(Number(pages) || PAGES_FULL, 1), 60), force: true, trigger: 'admin', deadline }); await refreshStats(); return r; }
  if (action === 'hide') { const r = await hideSource(source); await refreshStats(); return r; }
  if (action === 'purge') { const r = await purgeSource(source); await refreshStats(); return r; }
  throw new HttpsError('invalid-argument', 'action 은 run · hide · purge · stats 중 하나입니다.');
});

module.exports._internal = { priceOf, genderOf, dayMs, minuteMs, todayStartMs };
