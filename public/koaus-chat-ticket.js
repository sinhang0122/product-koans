/* ══════════════════════════════════════════════════════════════════
   KoAus · 새 대화 표(chat_tickets) — 11-19 채팅 안전(사용자 지시)
   ─ 새 대화는 24시간에 Living 50개 · Job 50개까지(사용자 결정 11-19). 방(chats)을 만들기 전에 표를 한 장 끊는다.
     표는 묶음 두 개 — chat_tickets/{uid}/living/{1..50} · chat_tickets/{uid}/job/{1..50}.
     구인구직(board 가 jobs · jobseeker) = job 묶음, 그 밖(쉐어·렌트·집 구하는 사람 등) = living 묶음 — 규칙의 chatTicketOk() 와 같은 기준.
     칸은 비어 있거나 쓴 지 24시간이 지나야 다시 쓸 수 있고(규칙이 강제), 방을 만들 때 규칙이 그 칸(tk)에 이 방(chatId)이
     적혀 있는지 확인한다. 날짜 계산이 없어 기기 시계와 무관하다.
   ─ 쓰는 곳: koaus-contact-actions.js(글 문의) · koaus-seekers-nearby.js(집 구하는 사람) · koaus-job-profile.js(일 구하는 사람)
   ─ 사용:
       const r = await koausChatTicket.ensure({ db, doc, getDoc, setDoc, serverTimestamp }, uid, chatId, payload);
       r = { ok: true, existed: true|false } | { ok: false, reason: 'limit' | 'blocked' | 'denied', eta?, board? }
       실패했을 때 보여 줄 말: koausChatTicket.message(r)  (없으면 '' — 부르는 쪽의 기본 안내를 쓴다)
     · 묶음은 payload.board 로 정한다. 이미 있는 방이면 표를 쓰지 않고 그대로 돌려준다(같은 사람에게 다시 보낼 때 한도를 깎지 않는다).
     · 내가 차단한 상대면 표를 쓰지 않고 'blocked' 로 돌려준다.
     · 표는 끊었는데 방을 못 만든 경우(상대가 나를 차단) 그 표를 기기에 적어 두었다가 같은 방에 다시 쓴다(누를 때마다 표가 줄지 않게).
     · 표를 읽지도 쓰지도 못하면(규칙이 아직 옛것 — 배포 순서) 예전 방식으로 한 번 시도한다.
   ─ 한도를 바꾸려면 LIMIT 와 firestore.rules 의 정규식 '([1-9]|[1-4][0-9]|50)' 두 곳을 같이 바꾼다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausChatTicket) return;
  var LIMIT = 50, WINDOW_MS = 24 * 60 * 60 * 1000, LS = 'koaus-chat-tk';

  function poolOf(board) { return (board === 'jobs' || board === 'jobseeker') ? 'job' : 'living'; }
  // 기기에 적어 두는 것: { uid, living: { n: 마지막으로 쓴 칸, pend: { chatId: 칸 } }, job: { … } } — pend = 끊어 두고 아직 방을 못 만든 표
  function readLS(uid) {
    try {
      var h = JSON.parse(localStorage.getItem(LS) || 'null');
      if (!h || h.uid !== uid) h = { uid: uid };
      ['living', 'job'].forEach(function (p) {
        var x = h[p];
        if (!x || typeof x !== 'object' || !(x.n >= 1 && x.n <= LIMIT)) x = { n: 0, pend: {} };
        if (!x.pend || typeof x.pend !== 'object') x.pend = {};
        h[p] = x;
      });
      return h;
    } catch (_) { return { uid: uid, living: { n: 0, pend: {} }, job: { n: 0, pend: {} } }; }
  }
  function writeLS(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (_) {} }
  function isDenied(e) { return !!(e && (e.code === 'permission-denied' || /permission/i.test(String(e.message || '')))); }
  function slot(fs, uid, pool, n) { return fs.doc(fs.db, 'chat_tickets', uid, pool, String(n)); }

  // 칸 하나에 써 본다 — true(끊음) | false(규칙이 거부) | 그 밖의 오류는 던진다
  async function writeSlot(fs, uid, pool, n, chatId) {
    try { await fs.setDoc(slot(fs, uid, pool, n), { chatId: chatId, createdAt: fs.serverTimestamp() }); return true; }
    catch (e) { if (isDenied(e)) return false; throw e; }
  }
  // 묶음의 50칸을 한꺼번에 읽는다 — [{ n, used, chatId, at }] | null(하나도 읽지 못함 = 규칙이 아직 옛것)
  async function readSlots(fs, uid, pool) {
    if (!fs.getDoc) return null;
    var out = [], jobs = [];
    for (var n = 1; n <= LIMIT; n++) (function (k) {
      jobs.push(fs.getDoc(slot(fs, uid, pool, k)).then(function (s) {
        var d = (s && s.exists()) ? (s.data() || {}) : null;
        var at = (d && d.createdAt && typeof d.createdAt.toMillis === 'function') ? d.createdAt.toMillis() : 0;
        out.push({ n: k, used: !!d, chatId: d ? String(d.chatId || '') : '', at: at });
      }).catch(function () {}));
    })(n);
    await Promise.all(jobs);
    return out.length ? out.sort(function (a, b) { return a.n - b.n; }) : null;
  }
  // 끊은 표를 기기에 적는다(그 칸을 가리키던 옛 기록은 지운다 — 칸 하나 = 방 하나)
  function keep(uid, pool, n, chatId) {
    var h = readLS(uid), x = h[pool], k;
    for (k in x.pend) if (x.pend[k] === n) delete x.pend[k];
    x.n = n; x.pend[chatId] = n;
    writeLS(h);
    return { ok: true, tk: String(n) };
  }
  function forget(uid, pool, chatId) { var h = readLS(uid); if (h[pool].pend[chatId]) { delete h[pool].pend[chatId]; writeLS(h); } }

  // 표 한 장 — { ok, tk } | { ok:false, reason: 'limit'(eta) | 'denied' | 'unavailable' | 'error' }
  async function take(fs, uid, chatId, pool) {
    var x = readLS(uid)[pool];
    // ① 이 방으로 끊어 두고 아직 안 쓴 표 — 그대로 쓴다(방 만들기만 실패했던 경우. 한도를 또 깎지 않는다)
    if (x.pend[chatId]) return { ok: true, tk: String(x.pend[chatId]), reused: true };
    // ② 다음 칸에 바로 써 본다 — 대부분 여기서 끝난다(왕복 1번). 칸을 차례로 돌려 쓰므로 다음 칸이 가장 오래된 칸이다.
    var first = x.n ? (x.n % LIMIT) + 1 : 1 + Math.floor(Math.random() * LIMIT);
    try { if (await writeSlot(fs, uid, pool, first, chatId)) return keep(uid, pool, first, chatId); }
    catch (_) { return { ok: false, reason: 'error' }; }
    // ③ 거부 — 묶음의 칸을 모두 읽어 이유를 가른다
    var slots = await readSlots(fs, uid, pool);
    if (!slots) return { ok: false, reason: 'unavailable' };
    var i, same = null, f = null, empty = [], used = [];
    for (i = 0; i < slots.length; i++) {
      if (slots[i].used && slots[i].chatId === chatId && !same) same = slots[i];
      if (slots[i].n === first) f = slots[i];
      (slots[i].used ? used : empty).push(slots[i]);
    }
    if (same) return keep(uid, pool, same.n, chatId);                     // 이 방으로 끊어 둔 표가 이미 있다(다른 기기·지난 시도) — 그대로 쓴다
    if (f && !f.used) return { ok: false, reason: 'denied' };             // 빈 칸인데 거부 = 미인증·정지
    try {
      for (i = 0; i < empty.length && i < 3; i++) {                        // 빈 칸(동시에 연 다른 탭과 겹쳤을 때를 위해 3번까지)
        if (await writeSlot(fs, uid, pool, empty[i].n, chatId)) return keep(uid, pool, empty[i].n, chatId);
      }
      if (empty.length) return { ok: false, reason: 'denied' };
      used.sort(function (a, b) { return a.at - b.at; });                  // 빈 칸이 없다 — 가장 오래된 칸(24시간이 지났으면 규칙이 받아 준다)
      if (used.length && used[0].n !== first && await writeSlot(fs, uid, pool, used[0].n, chatId)) return keep(uid, pool, used[0].n, chatId);
    } catch (_) { return { ok: false, reason: 'error' }; }
    var eta = used.length && used[0].at ? used[0].at + WINDOW_MS - Date.now() : 0;
    return { ok: false, reason: 'limit', eta: eta > 0 ? eta : 0 };
  }
  // 그 칸에 아직 이 방이 적혀 있는가(적어 둔 표로 방 만들기가 실패했을 때 — 표가 바뀐 것인지, 다른 이유인지 가른다)
  async function slotHolds(fs, uid, pool, tk, chatId) {
    if (!fs.getDoc) return true;
    try { var s = await fs.getDoc(slot(fs, uid, pool, tk)); return !!(s && s.exists() && String((s.data() || {}).chatId || '') === chatId); } catch (_) { return true; }
  }

  async function chatExists(fs, chatId) {
    if (!fs.getDoc) return false;
    try { var s = await fs.getDoc(fs.doc(fs.db, 'chats', chatId)); return !!(s && s.exists()); } catch (_) { return false; }   // 없는 방 조회는 규칙이 거부 → '없음'으로 본다
  }
  async function blockedByMe(fs, uid, peer) {
    if (!fs.getDoc || !peer) return false;
    try { var s = await fs.getDoc(fs.doc(fs.db, 'blocks', uid, 'who', String(peer))); return !!(s && s.exists()); } catch (_) { return false; }
  }

  async function ensure(fs, uid, chatId, payload) {
    var board = String((payload && payload.board) || ''), pool = poolOf(board);
    var pre = await Promise.all([chatExists(fs, chatId), blockedByMe(fs, uid, payload && payload.ownerUid)]);
    if (pre[0]) { forget(uid, pool, chatId); return { ok: true, existed: true }; }
    if (pre[1]) return { ok: false, reason: 'blocked' };
    var ref = fs.doc(fs.db, 'chats', chatId);
    for (var round = 0; round < 2; round++) {
      var t = await take(fs, uid, chatId, pool);
      if (t.ok) {
        try {
          var p = {}; for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) p[k] = payload[k];
          p.tk = t.tk;
          await fs.setDoc(ref, p);
          forget(uid, pool, chatId);
          return { ok: true, existed: false };
        } catch (_) {
          // 적어 둔 표가 그새 다른 방으로 바뀌었으면(다른 기기가 그 칸을 다시 씀) 기록을 지우고 새로 끊어 한 번 더.
          // 표가 그대로인데 실패했으면 표 문제가 아니다(상대가 차단했거나 그 사이 방이 생겼다) — 표를 더 쓰지 않는다.
          if (t.reused && round === 0 && !(await slotHolds(fs, uid, pool, t.tk, chatId))) { forget(uid, pool, chatId); continue; }
        }
        break;
      }
      if (t.reason === 'limit') return { ok: false, reason: 'limit', eta: t.eta || 0, board: board };
      if (t.reason === 'unavailable') {
        // 표를 읽지도 쓰지도 못한다 — 규칙이 아직 옛것(호스팅이 규칙보다 먼저 배포된 순간). 예전 방식으로 한 번.
        try { await fs.setDoc(ref, payload); return { ok: true, existed: false }; } catch (_) {}
      }
      break;
    }
    if (await chatExists(fs, chatId)) { forget(uid, pool, chatId); return { ok: true, existed: true }; }
    return { ok: false, reason: 'denied' };
  }

  function etaText(ms) {
    var min = Math.ceil(ms / 60000);
    return min >= 60 ? '약 ' + Math.ceil(min / 60) + '시간' : '약 ' + Math.max(1, min) + '분';
  }
  // 한도 안내의 머리말 — 방의 종류에 맞게(쉐어·렌트 / 구인구직). 그 밖의 게시판은 머리말 없이.
  function sectionLabel(board) {
    if (board === 'jobs' || board === 'jobseeker') return '구인구직 ';
    if (board === 'accom' || board === 'rent' || board === 'seeker') return '쉐어·렌트 ';
    return '';
  }
  function message(r) {
    if (!r || r.ok) return '';
    if (r.reason === 'limit') return sectionLabel(r.board) + '새 대화는 24시간에 ' + LIMIT + '개까지 열 수 있습니다. ' + (r.eta > 0 ? etaText(r.eta) + ' 뒤에' : '잠시 뒤') + ' 다시 시도해 주십시오.';
    if (r.reason === 'blocked') return '차단한 사용자입니다. 채팅 화면에서 차단을 해제하면 다시 대화할 수 있습니다.';
    return '';
  }

  window.koausChatTicket = { LIMIT: LIMIT, poolOf: poolOf, take: take, ensure: ensure, message: message };
})();
