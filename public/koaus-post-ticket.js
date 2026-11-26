/* ══════════════════════════════════════════════════════════════════
   KoAus · 글 등록 표(post_tickets) — 11-26c "1일 2회 등록"을 서버 규칙으로(사용자 지시 "코드로 막아줘")
   ─ 글쓰기 창의 '1일 2회 등록 가능'은 그동안 안내만 있었다. 이제 게시판마다(쉐어 · 렌트 · 구인구직) 24시간에 2건까지만 올라간다.
     표는 게시판마다 두 칸 — post_tickets/{uid}/accom/{1|2} · …/rent/{1|2} · …/jobs/{1|2}.
     칸은 비어 있거나 쓴 지 24시간이 지나야 다시 쓸 수 있고(규칙이 강제), 글을 만들 때 규칙이 두 칸 가운데 하나에
     이 글의 id 가 적혀 있고 끊은 지 10분이 안 됐는지 확인한다(firestore.rules postTicketOk). 날짜 계산이 없어 기기 시계와 무관하다.
   ─ 그래서 글의 문서 id 를 먼저 정하고(자동 id) → 표를 끊고 → 그 id 로 글을 만든다(addDoc 대신 setDoc).
     글 수정 · 숨김 · 삭제는 표와 무관하다(횟수에 들어가지 않는다). 같은 글을 다시 올려 끌어올리는 것은 새 글이라 한 번으로 센다.
   ─ 사용(게시판 화면의 등록 코드):
       const r = await koausPostTicket.create({ db, doc, getDoc, setDoc, collection, serverTimestamp }, uid, 'accom',
                   async postId => { const ref = doc(db, 'accom_posts', postId); await setDoc(ref, payload); return ref; });
       r = { ok: true, ref, postId } | { ok: false, reason: 'limit'(eta, board) | 'denied' | 'error' }   (글 쓰기 자체의 오류는 그대로 던진다)
       표를 못 끊었을 때 보여 줄 말: koausPostTicket.message(r)  (없으면 '' — 부르는 쪽의 기본 안내를 쓴다)
     · 표는 끊었는데 글을 못 만든 경우(입력 오류 등) 그 표를 기기에 적어 두었다가 9분 안에는 같은 글 id 로 다시 쓴다(누를 때마다 표가 줄지 않게).
     · 관리자는 표 없이 올린다(규칙의 isAdmin()). 표를 읽지 못하면(규칙이 아직 옛것 — 배포 순서) 표 없이 예전 방식으로 올린다.
   ─ 한도를 바꾸려면 LIMIT 와 firestore.rules 의 postTicketOk · validPostTicket(칸 이름 '1' · '2') 을 같이 바꾼다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausPostTicket) return;
  var LIMIT = 2, WINDOW_MS = 24 * 60 * 60 * 1000, FRESH_MS = 9 * 60 * 1000, LS = 'koaus-post-tk';
  var LABEL = { accom: '쉐어', rent: '렌트', jobs: '구인구직' };

  function ok(board) { return Object.prototype.hasOwnProperty.call(LABEL, board); }
  // 기기에 적어 두는 것: { uid, accom: { postId, n, t }, rent: …, jobs: … } — 끊어 두고 아직 글을 못 만든 표
  function readLS(uid) {
    try { var h = JSON.parse(localStorage.getItem(LS) || 'null'); return (h && h.uid === uid) ? h : { uid: uid }; }
    catch (_) { return { uid: uid }; }
  }
  function writeLS(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (_) {} }
  function isDenied(e) { return !!(e && (e.code === 'permission-denied' || /permission/i.test(String(e.message || '')))); }
  function slot(fs, uid, board, n) { return fs.doc(fs.db, 'post_tickets', uid, board, String(n)); }
  function newId(fs, board) { return fs.doc(fs.collection(fs.db, board + '_posts')).id; }

  // 칸 하나에 써 본다 — true(끊음) | false(규칙이 거부) | 그 밖의 오류는 던진다
  async function writeSlot(fs, uid, board, n, postId) {
    try { await fs.setDoc(slot(fs, uid, board, n), { postId: postId, createdAt: fs.serverTimestamp() }); return true; }
    catch (e) { if (isDenied(e)) return false; throw e; }
  }
  // 두 칸을 읽는다 — [{ n, used, postId, at }] | null(하나도 읽지 못함 = 규칙이 아직 옛것)
  async function readSlots(fs, uid, board) {
    var out = [], jobs = [];
    for (var n = 1; n <= LIMIT; n++) (function (k) {
      jobs.push(fs.getDoc(slot(fs, uid, board, k)).then(function (s) {
        var d = (s && s.exists()) ? (s.data() || {}) : null;
        var at = (d && d.createdAt && typeof d.createdAt.toMillis === 'function') ? d.createdAt.toMillis() : 0;
        out.push({ n: k, used: !!d, postId: d ? String(d.postId || '') : '', at: at });
      }).catch(function () {}));
    })(n);
    await Promise.all(jobs);
    return out.length ? out.sort(function (a, b) { return a.n - b.n; }) : null;
  }
  function keep(uid, board, n, postId) {
    var h = readLS(uid); h[board] = { postId: postId, n: n, t: Date.now() }; writeLS(h);
    return { ok: true, postId: postId, n: n };
  }
  // 글을 만들었으면(또는 그 표를 더 쓰지 않으려면) 적어 둔 표를 지운다
  function done(uid, board) { var h = readLS(uid); if (h[board]) { delete h[board]; writeLS(h); } }

  async function take(fs, uid, board) {
    if (!fs || !fs.db || !fs.doc || !fs.collection || !ok(board)) return { ok: false, reason: 'error' };
    var fresh;
    try { fresh = newId(fs, board); } catch (_) { return { ok: false, reason: 'error' }; }
    if (!fs.getDoc || !fs.setDoc || !fs.serverTimestamp) return { ok: true, postId: fresh, free: true };
    if (window.koausIsAdmin === true) return { ok: true, postId: fresh, free: true };                // 관리자는 표 없이(규칙 isAdmin())
    // ① 끊어 두고 아직 글을 못 만든 표 — 9분 안이면 같은 글 id 로 다시 쓴다(규칙의 10분 창 안)
    var pend = readLS(uid)[board];
    if (pend && pend.postId && pend.n >= 1 && pend.n <= LIMIT && (Date.now() - pend.t) >= 0 && (Date.now() - pend.t) < FRESH_MS) {
      return { ok: true, postId: String(pend.postId), n: pend.n, reused: true };
    }
    // ② 두 칸을 읽는다
    var slots;
    try { slots = await readSlots(fs, uid, board); } catch (_) { slots = null; }
    if (!slots) return { ok: true, postId: fresh, free: true };                                      // 표를 읽지 못한다 — 규칙이 아직 옛것(호스팅이 규칙보다 먼저 배포된 순간). 예전 방식으로.
    var empty = slots.filter(function (s) { return !s.used; });
    var used = slots.filter(function (s) { return s.used; }).sort(function (a, b) { return a.at - b.at; });
    try {
      // ③ 빈 칸
      for (var i = 0; i < empty.length; i++) {
        if (await writeSlot(fs, uid, board, empty[i].n, fresh)) return keep(uid, board, empty[i].n, fresh);
      }
      if (empty.length === LIMIT) return { ok: false, reason: 'denied' };                            // 둘 다 빈 칸인데 거부 = 미인증 · 정지
      // ④ 가장 오래된 칸(24시간이 지났으면 규칙이 받아 준다)
      for (var j = 0; j < used.length; j++) {
        if (await writeSlot(fs, uid, board, used[j].n, fresh)) return keep(uid, board, used[j].n, fresh);
      }
    } catch (_) { return { ok: false, reason: 'error' }; }
    if (used.length < LIMIT) return { ok: false, reason: 'denied' };
    var eta = used[0].at ? used[0].at + WINDOW_MS - Date.now() : 0;
    return { ok: false, reason: 'limit', eta: eta > 0 ? eta : 0, board: board };
  }

  async function postExists(fs, board, postId) {
    try { var s = await fs.getDoc(fs.doc(fs.db, board + '_posts', String(postId))); return !!(s && s.exists()); } catch (_) { return false; }
  }
  // 표를 끊고 글을 만든다 — writeFn(postId) 가 그 id 로 글을 쓰고 ref 를 돌려준다(실패하면 던진다).
  //   { ok: true, ref, postId } | { ok: false, reason, … }(표를 못 끊음 — message() 로 안내) | writeFn 의 오류는 그대로 던진다
  async function create(fs, uid, board, writeFn) {
    for (var round = 0; round < 2; round++) {
      var t = await take(fs, uid, board);
      if (!t.ok) return t;
      try {
        var ref = await writeFn(t.postId);
        done(uid, board);
        return { ok: true, ref: ref, postId: t.postId };
      } catch (e) {
        // 적어 둔 표로 실패했고 그 글이 이미 있으면(지난번에 글은 올라갔는데 기록만 남은 경우) 기록을 지우고 새 표로 한 번 더.
        // 글이 없는데 실패했으면 표 문제가 아니다(입력 내용 등) — 표를 더 쓰지 않고 그대로 알린다(9분 안에 다시 누르면 같은 표를 쓴다).
        if (t.reused && round === 0 && fs.getDoc && await postExists(fs, board, t.postId)) { done(uid, board); continue; }
        throw e;
      }
    }
    return { ok: false, reason: 'error' };
  }

  function etaText(ms) {
    var min = Math.ceil(ms / 60000);
    return min >= 60 ? '약 ' + Math.ceil(min / 60) + '시간' : '약 ' + Math.max(1, min) + '분';
  }
  function message(r) {
    if (!r || r.ok) return '';
    if (r.reason === 'limit') {
      return (LABEL[r.board] ? LABEL[r.board] + ' ' : '') + '글은 24시간에 ' + LIMIT + '개까지 올릴 수 있습니다. ' +
        (r.eta > 0 ? etaText(r.eta) + ' 뒤에' : '잠시 뒤') + ' 다시 올릴 수 있습니다.\n올린 글의 내용은 [수정]으로 바꿀 수 있습니다(횟수에 들어가지 않습니다).';
    }
    return '';
  }

  window.koausPostTicket = { LIMIT: LIMIT, take: take, create: create, done: done, message: message };
})();
