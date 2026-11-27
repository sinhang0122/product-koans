/* ══════════════════════════════════════════════════════════════════
   KoAus · 글 등록 표(post_tickets) — 11-26c "1일 2회 등록"을 서버 규칙으로(사용자 지시 "코드로 막아줘")
   ─ 글쓰기 창의 '2회 등록 가능'은 그동안 안내만 있었다. 이제 게시판마다 정해진 만큼만 올라간다.
     11-27a(사용자 결정 "기준시간은 시드니로 … 그냥 하루 기준 4건하고 오늘 총 3건 남았습니다 2건남았습니다 로 가자"):
       게시판마다 하루 4건. 하루 = 시드니 시각의 0시~24시(서머타임 포함). 쉐어 · 렌트 · 구인구직 모두 같다.
       (11-26d 의 '쓴 지 12시간(쉐어) · 24시간(렌트 · 구인)에 2건'은 없앴다.)
     표는 게시판마다 네 칸 — post_tickets/{uid}/accom/{1|2|3|4} · …/rent/{1~4} · …/jobs/{1~4}.
     칸은 비어 있거나 거기 적힌 표가 시드니 날짜로 오늘 이전의 것이어야 다시 쓸 수 있고(규칙 postSlotStale 이 강제), 글을 만들 때 규칙이 네 칸 가운데 하나에
     이 글의 id 가 적혀 있고 끊은 지 10분이 안 됐는지 확인한다(firestore.rules postTicketOk). 판정은 서버 시각으로만 한다 — 기기 시계와 무관하다.
   ─ 그래서 글의 문서 id 를 먼저 정하고(자동 id) → 표를 끊고 → 그 id 로 글을 만든다(addDoc 대신 setDoc).
     글 수정 · 숨김 · 삭제는 표와 무관하다(횟수에 들어가지 않는다). 같은 글을 다시 올려 끌어올리는 것은 새 글이라 한 번으로 센다.
   ─ 사용(게시판 화면의 등록 코드):
       const r = await koausPostTicket.create({ db, doc, getDoc, setDoc, collection, serverTimestamp }, uid, 'accom',
                   async postId => { const ref = doc(db, 'accom_posts', postId); await setDoc(ref, payload); return ref; });
       r = { ok: true, ref, postId, board, left } | { ok: false, reason: 'limit'(board) | 'denied' | 'error' }   (글 쓰기 자체의 오류는 그대로 던진다)
         left = 오늘 더 올릴 수 있는 건수(표 없이 올렸거나 읽지 못했으면 null — 안내를 내지 않는다)
       표를 못 끊었을 때 보여 줄 말: koausPostTicket.message(r) — "쉐어 글은 하루 4건까지 등록 가능합니다. 내일 다시 등록 가능합니다." (없으면 '' — 부르는 쪽의 기본 안내를 쓴다)
       올린 뒤 보여 줄 말: koausPostTicket.notice(r) — "등록되었습니다. 오늘 총 3건 남았습니다." (표 없이 올렸으면 '')
     · 표는 끊었는데 글을 못 만든 경우(입력 오류 등) 그 표를 기기에 적어 두었다가 9분 안에는 같은 글 id 로 다시 쓴다(누를 때마다 표가 줄지 않게).
     · 관리자는 표 없이 올린다(규칙의 isAdmin()). 표를 읽지 못하면(규칙이 아직 옛것 — 배포 순서) 표 없이 예전 방식으로 올린다.
   ─ 한도를 바꾸려면: 건수는 LIMIT 와 firestore.rules 의 postTicketOk · validPostTicket(칸 이름 '1'~'4') · list 한도(limit <= 4),
     날짜 기준은 SYD_DST 와 firestore.rules 의 sydDst()(같은 표 — 2037년 10월 초까지 맞다. 그 전에 두 곳에 줄을 더한다)를 같이 바꾼다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausPostTicket) return;
  var LIMIT = 4, FRESH_MS = 9 * 60 * 1000, LS = 'koaus-post-tk';
  var LABEL = { accom: '쉐어', rent: '렌트', jobs: '구인구직' };
  // 시드니가 서머타임(UTC+11)인 기간 — [시작, 끝) UTC ms. 그 밖은 표준시(UTC+10). firestore.rules sydDst() 와 같은 값(짝).
  //   서머타임은 10월 첫 일요일 02:00 에 시작해 4월 첫 일요일 03:00 에 끝난다(UTC 로는 둘 다 그 전날 토요일 16:00). 첫 구간은 앞이 열려 있다.
  var SYD_DST = [
    [-Infinity,     1775318400000],   //            ~ 2026-04-04
    [1791043200000, 1806768000000],   // 2026-10-03 ~ 2027-04-03
    [1822492800000, 1838217600000],   // 2027-10-02 ~ 2028-04-01
    [1853942400000, 1869667200000],   // 2028-09-30 ~ 2029-03-31
    [1885996800000, 1901721600000],   // 2029-10-06 ~ 2030-04-06
    [1917446400000, 1933171200000],   // 2030-10-05 ~ 2031-04-05
    [1948896000000, 1964620800000],   // 2031-10-04 ~ 2032-04-03
    [1980345600000, 1996070400000],   // 2032-10-02 ~ 2033-04-02
    [2011795200000, 2027520000000],   // 2033-10-01 ~ 2034-04-01
    [2043244800000, 2058969600000],   // 2034-09-30 ~ 2035-03-31
    [2075299200000, 2091024000000],   // 2035-10-06 ~ 2036-04-05
    [2106748800000, 2122473600000]    // 2036-10-04 ~ 2037-04-04
  ];
  var HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;

  function ok(board) { return Object.prototype.hasOwnProperty.call(LABEL, board); }
  // 그 시각(UTC ms)의 시드니 시차(ms) — 규칙의 (sydDst(ms) ? 39600000 : 36000000) 과 같은 셈
  function sydOffset(ms) {
    for (var i = 0; i < SYD_DST.length; i++) if (ms >= SYD_DST[i][0] && ms < SYD_DST[i][1]) return 11 * HOUR;
    return 10 * HOUR;
  }
  // 그 시각이 든 시드니 날짜 — 시드니 시각으로 옮긴 ms 를 하루 단위로 내린 값(날짜가 같으면 값이 같다). 규칙 sydDay() 와 같은 셈
  function sydDay(ms) { var t = ms + sydOffset(ms); return t - (t % DAY); }
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
  // 네 칸을 읽는다 — [{ n, used, postId, at }] | null(하나도 읽지 못함 = 규칙이 아직 옛것)
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
    // ② 네 칸을 읽는다
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
      if (empty.length) return { ok: false, reason: 'denied' };                                      // 빈 칸이 있는데도 거부 = 한도가 아니다(미인증 · 정지)
      // ④ 가장 오래된 칸 하나 — 거기 적힌 표가 시드니 날짜로 오늘 이전의 것이면 규칙이 받아 준다(가장 오래된 칸이 안 되면 나머지도 안 된다)
      if (used.length && await writeSlot(fs, uid, board, used[0].n, fresh)) return keep(uid, board, used[0].n, fresh);
    } catch (_) { return { ok: false, reason: 'error' }; }
    if (used.length < LIMIT) return { ok: false, reason: 'denied' };                                 // 칸을 다 읽지 못했다 — 한도라고 말할 수 없다
    var first = used[0].at, last = used[used.length - 1].at;
    // 네 표가 한 날짜의 것이 아니면 가장 오래된 칸은 이미 풀려 있었다 — 그런데도 거부됐다면 한도가 아니라 미인증 · 정지 등이다(서버 시각끼리의 셈)
    if (!first || !last || sydDay(first) !== sydDay(last)) return { ok: false, reason: 'denied' };
    // 네 표 모두 같은 날 것인데 그날이 이미 지났다(이 기기의 시계로) — 역시 한도가 아니다. 어느 말을 보여 줄지 고르는 데만 쓴다(판정은 규칙이 했다)
    if (sydDay(last) < sydDay(Date.now())) return { ok: false, reason: 'denied' };
    return { ok: false, reason: 'limit', board: board };                                             // 오늘 네 건을 다 올렸다
  }

  async function postExists(fs, board, postId) {
    try { var s = await fs.getDoc(fs.doc(fs.db, board + '_posts', String(postId))); return !!(s && s.exists()); } catch (_) { return false; }
  }
  // 글을 올린 뒤 오늘 남은 건수 — 네 칸을 다시 읽어 서버 시각끼리 견준다(기기 시계와 무관): 방금 끊은 표와 같은 시드니 날짜의 표를 센다.
  //   { left } | null(표 없이 올렸거나 읽지 못함 — 안내를 내지 않는다)
  async function after(fs, uid, board, t) {
    if (!t || t.free || !fs.getDoc) return null;
    var slots = await Promise.race([readSlots(fs, uid, board), new Promise(function (res) { setTimeout(function () { res(null); }, 2500); })]);
    if (!slots || slots.length < LIMIT) return null;
    var mine = null;
    slots.forEach(function (s) { if (s.used && s.postId === String(t.postId)) mine = s; });
    if (!mine || !mine.at) return null;
    var day = sydDay(mine.at), usedToday = 0;
    slots.forEach(function (s) { if (s.used && s.at && sydDay(s.at) === day) usedToday++; });
    return { left: Math.max(0, LIMIT - usedToday) };
  }
  // 표를 끊고 글을 만든다 — writeFn(postId) 가 그 id 로 글을 쓰고 ref 를 돌려준다(실패하면 던진다).
  //   { ok: true, ref, postId, board, left } | { ok: false, reason, … }(표를 못 끊음 — message() 로 안내) | writeFn 의 오류는 그대로 던진다
  async function create(fs, uid, board, writeFn) {
    for (var round = 0; round < 2; round++) {
      var t = await take(fs, uid, board);
      if (!t.ok) return t;
      try {
        var ref = await writeFn(t.postId);
        done(uid, board);
        var st = null;
        try { st = await after(fs, uid, board, t); } catch (_) { st = null; }
        return { ok: true, ref: ref, postId: t.postId, board: board, left: st ? st.left : null };
      } catch (e) {
        // 적어 둔 표로 실패했고 그 글이 이미 있으면(지난번에 글은 올라갔는데 기록만 남은 경우) 기록을 지우고 새 표로 한 번 더.
        // 글이 없는데 실패했으면 표 문제가 아니다(입력 내용 등) — 표를 더 쓰지 않고 그대로 알린다(9분 안에 다시 누르면 같은 표를 쓴다).
        if (t.reused && round === 0 && fs.getDoc && await postExists(fs, board, t.postId)) { done(uid, board); continue; }
        throw e;
      }
    }
    return { ok: false, reason: 'error' };
  }

  // 한도에 걸렸을 때(그날의 다섯 번째 글) — 11-27a: 날짜 기준이라 시각을 적지 않는다
  function message(r) {
    if (!r || r.ok) return '';
    if (r.reason === 'limit') return (LABEL[r.board] ? LABEL[r.board] + ' 글은 ' : '') + '하루 ' + LIMIT + '건까지 등록 가능합니다. 내일 다시 등록 가능합니다.';
    return '';
  }
  // 글을 올린 뒤(11-27a, 사용자 지시 "오늘 총 3건 남았습니다 2건남았습니다 로 가자")
  function notice(r) {
    if (!r || !r.ok || r.left == null) return '';
    if (r.left > 0) return '등록되었습니다. 오늘 총 ' + r.left + '건 남았습니다.';
    return '등록되었습니다. 오늘 ' + LIMIT + '건을 모두 등록했습니다.';
  }

  window.koausPostTicket = { LIMIT: LIMIT, SYD_DST: SYD_DST, sydOffset: sydOffset, sydDay: sydDay, take: take, create: create, done: done, message: message, notice: notice };
})();
