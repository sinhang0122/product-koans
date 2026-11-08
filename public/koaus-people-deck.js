/* ═══════════════════════════════════════════════════════════════════
   KoAus · 구하는 사람 카드 넘겨 보기 (11-08, 사용자 지시 18·19) — 집(koaus-seekers-nearby.js)·일(koaus-job-profile.js) 공용
   ─ 목록 없이 상세 카드부터 보여 주고, 틴더처럼 옆으로 넘긴다(손가락 끌기·화살표·← →).
     · 휴대폰: 카드 한 장이 화면을 채우고 옆으로 밀면 다음 사람.
     · 데스크탑(≥900px): 가운데 카드 양옆에 이전·다음 사람이 흐리게 보인다(누르면 그쪽으로).
   ─ 머리: [‹ 제목] ……… [필터 변경](가운데, 네모 상자) ……… [신고] [공유]  (11-08b: 'n / N' 표시 없음)
   ─ 카드 아래 메시지 칸: 보내면 칸이 잠기고 "메시지를 보냈습니다."만 남는다(지시 19). 이미 보낸 사람도 같은 모양.
   ─ 쓰는 쪽이 넘기는 것: items(배열), key(it)→id, render(it)→카드 안 HTML, compose(it)→{sent, preset},
     onSend(it, text)→Promise<boolean>, onReport(it), onShare(it), onFilter(), onClose(), emptyHtml, title, guard()→false 면 Esc 무시
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.koausPeopleDeck) return;

  var css =
    '.kpd-ovl{position:fixed;inset:0;z-index:9045;display:none;background:rgba(0,0,0,.62)}' +
    '.kpd-ovl.open{display:block}' +
    '.kpd-box{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg-base,#fff);color:var(--text-primary,#111)}' +
    '.kpd-bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 14px 8px;border-bottom:1px solid var(--border,#e0e0e0);font-size:14px;min-height:46px;background:var(--bg-base,#fff);box-sizing:border-box}' +
    '.kpd-bar-l{display:flex;justify-content:flex-start;min-width:0}.kpd-bar-c{display:flex;justify-content:center}.kpd-bar-r{display:flex;justify-content:flex-end;gap:12px}' +
    '.kpd-ok{color:#0b7a5c;font-weight:800}:root[data-theme=dark] .kpd-ok{color:#5eead4}' +
    '.kpd-lnk{appearance:none;border:0;background:none;color:var(--text-primary,#111);font-family:inherit;font-size:14px;cursor:pointer;padding:4px 0;white-space:nowrap;-webkit-tap-highlight-color:transparent}' +
    '.kpd-lnk.muted{color:var(--text-muted,#8e8e93)}' +
    '.kpd-lnk.kpd-filter{font-weight:800;font-size:13px;border:1.5px solid var(--text-primary,#111);border-radius:8px;padding:6px 14px}' +
    '.kpd-count{font-size:13px;color:var(--text-muted,#8e8e93);font-weight:700;white-space:nowrap}' +
    '.kpd-spacer{flex:1}' +
    '.kpd-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:pan-y}' +
    '.kpd-stage.kpd-dragging,.kpd-stage.kpd-dragging *{user-select:none;-webkit-user-select:none;cursor:grabbing}' +
    '.kpd-track{position:absolute;top:0;bottom:0;left:0;display:flex;gap:var(--gap,0px);will-change:transform}' +
    '.kpd-card{flex:0 0 var(--slot,100vw);width:var(--slot,100vw);height:100%;display:flex;flex-direction:column;background:var(--bg-base,#fff);color:var(--text-primary,#111);overflow:hidden;box-sizing:border-box}' +
    '.kpd-card.kpd-ghost{visibility:hidden}' +
    '.kpd-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
    '.kpd-compose{display:flex;flex-direction:column;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border,#e0e0e0);background:var(--bg-base,#fff)}' +
    '.kpd-compose textarea{width:100%;box-sizing:border-box;border:1px solid var(--border,#e0e0e0);background:var(--bg-input,var(--bg-base,#fff));color:var(--text-primary,#111);border-radius:12px;padding:11px 12px;font-size:15px;font-family:inherit;resize:none;min-height:64px;line-height:1.45}' +
    '.kpd-compose textarea:focus{outline:none;border-color:var(--border-focus,var(--text-primary,#111))}' +
    '.kpd-send{appearance:none;border:1px solid var(--accent,#111);background:var(--accent,#111);color:var(--accent-text,#fff);border-radius:12px;padding:13px 16px;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer}' +
    '.kpd-send:disabled{opacity:.5;cursor:default}' +
    '.kpd-sent{padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border,#e0e0e0);text-align:center;font-weight:700;color:var(--text-muted,#8e8e93);background:var(--bg-surface,var(--bg-card,#f6f6f7))}' +
    '.kpd-empty{padding:48px 22px;text-align:center;color:var(--text-muted,#8e8e93);line-height:1.6;display:flex;flex-direction:column;gap:14px;align-items:center;font-size:14.5px}' +
    '.kpd-empty b{color:var(--text-primary,#111);font-size:16px}' +
    '.kpd-empty-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}' +
    '.kpd-btn{appearance:none;border:1.5px solid var(--text-primary,#111);background:var(--bg-base,#fff);color:var(--text-primary,#111);border-radius:999px;padding:9px 16px;font-size:14px;font-weight:800;font-family:inherit;cursor:pointer}' +
    '.kpd-btn.primary{background:var(--text-primary,#111);color:var(--bg-base,#fff)}' +
    '.kpd-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(17,24,39,.9);color:#fff;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:999px;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap}' +
    '.kpd-hint.show{opacity:1}' +
    '.kpd-arrow{display:none}' +
    '@media(min-width:900px){' +
      '.kpd-ovl.kpd-peek .kpd-box{background:transparent}' +
      '.kpd-ovl.kpd-peek .kpd-bar{width:var(--slot,560px);margin:16px auto 10px;border:1px solid var(--border,#e0e0e0);border-radius:14px;padding:8px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25)}' +
      '.kpd-ovl.kpd-peek .kpd-stage{padding-bottom:18px}' +
      '.kpd-ovl.kpd-peek .kpd-track{bottom:18px}' +
      '.kpd-ovl.kpd-peek .kpd-card{border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.4);transition:filter .28s,opacity .28s,transform .28s}' +
      '.kpd-ovl.kpd-peek .kpd-card:not(.kpd-cur){filter:blur(3px);opacity:.5;transform:scale(.94);cursor:pointer}' +
      '.kpd-ovl.kpd-peek .kpd-card:not(.kpd-cur) *{pointer-events:none}' +
      '.kpd-ovl.kpd-peek .kpd-arrow{display:flex;position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:1px solid var(--border,#e0e0e0);background:var(--bg-base,#fff);color:var(--text-primary,#111);align-items:center;justify-content:center;font-size:26px;line-height:1;cursor:pointer;z-index:2;box-shadow:0 6px 18px rgba(0,0,0,.25)}' +
      '.kpd-ovl.kpd-peek .kpd-arrow.l{left:calc(50% - var(--slot,560px) / 2 - var(--gap,28px) - 62px)}' +
      '.kpd-ovl.kpd-peek .kpd-arrow.r{right:calc(50% - var(--slot,560px) / 2 - var(--gap,28px) - 62px)}' +
      '.kpd-ovl.kpd-peek .kpd-arrow:disabled{opacity:.3;cursor:default}' +
    '}';

  var ovl = null, bar = null, stage = null, track = null, hintEl = null;
  var o = null, items = [], idx = 0, drafts = {}, sent = {}, base = 0, dragging = null, animating = false, suppressClick = 0, peek = false, hintShown = false, loading = false, goTimer = null;

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  function injectCss() {
    if (document.getElementById('kpdStyle')) return;
    var st = document.createElement('style'); st.id = 'kpdStyle'; st.textContent = css;
    document.head.appendChild(st);
  }
  function keyOf(it) { try { return String((o && o.key) ? o.key(it) : (it && (it.uid || it.id) || '')); } catch (_) { return ''; } }
  function slotPx() { return parseFloat(stage.style.getPropertyValue('--slot')) || stage.clientWidth || 0; }
  function gapPx() { return parseFloat(stage.style.getPropertyValue('--gap')) || 0; }
  function setX(dx, animate) {
    track.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    track.style.transform = 'translateX(' + (base + dx) + 'px)';
  }
  function layout() {
    if (!stage) return;
    var W = stage.clientWidth || window.innerWidth;
    peek = W >= 900;
    var slot = peek ? Math.min(560, W - 2 * 120) : W, gap = peek ? 28 : 0;
    stage.style.setProperty('--slot', slot + 'px'); stage.style.setProperty('--gap', gap + 'px');
    ovl.classList.toggle('kpd-peek', peek);
    base = (W - slot) / 2 - (slot + gap);
    setX(0, false);
  }

  function mount() {
    if (ovl) return;
    injectCss();
    ovl = document.createElement('div'); ovl.className = 'kpd-ovl'; ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true');
    ovl.innerHTML =
      '<div class="kpd-box">' +
        '<div class="kpd-bar">' +
          '<div class="kpd-bar-l"><button type="button" class="kpd-lnk" data-kpd="close" id="kpdTitle">‹ 구하는 사람</button></div>' +
          '<div class="kpd-bar-c"><button type="button" class="kpd-lnk kpd-filter" data-kpd="filter">필터 변경</button></div>' +
          '<div class="kpd-bar-r"><button type="button" class="kpd-lnk muted" data-kpd="report">신고</button><button type="button" class="kpd-lnk muted" data-kpd="share">공유</button></div>' +
        '</div>' +
        '<div class="kpd-stage"><div class="kpd-track"></div>' +
          '<button type="button" class="kpd-arrow l" data-kpd="prev" aria-label="이전 사람">‹</button>' +
          '<button type="button" class="kpd-arrow r" data-kpd="next" aria-label="다음 사람">›</button>' +
          '<div class="kpd-hint" id="kpdHint">옆으로 밀면 다음 사람</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ovl);
    bar = ovl.querySelector('.kpd-bar'); stage = ovl.querySelector('.kpd-stage'); track = ovl.querySelector('.kpd-track');
    hintEl = ovl.querySelector('#kpdHint');

    ovl.addEventListener('click', function (e) {
      if (Date.now() < suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
      var b = e.target.closest('[data-kpd]');
      if (b) {
        var act = b.dataset.kpd;
        if (act === 'close') { close(); return; }
        if (act === 'filter') { if (o && o.onFilter) o.onFilter(current()); return; }
        if (act === 'report') { if (o && o.onReport && current()) o.onReport(current()); return; }
        if (act === 'share') { if (o && o.onShare && current()) o.onShare(current()); return; }
        if (act === 'prev') { go(-1); return; }
        if (act === 'next') { go(1); return; }
      }
      var sd = e.target.closest('[data-kpd-send]');
      if (sd) { send(sd); return; }
      var card = e.target.closest('.kpd-card');
      if (card && peek && !card.classList.contains('kpd-cur') && !card.classList.contains('kpd-ghost')) { go(card.classList.contains('kpd-prev') ? -1 : 1); }
    });
    ovl.addEventListener('input', function (e) {
      var ta = e.target.closest('textarea[data-kpd-draft]'); if (ta) drafts[ta.dataset.kpdDraft] = ta.value;
    });
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onCancel);
    stage.addEventListener('lostpointercapture', function () { if (dragging) onCancel(); });   // 창 밖·alt-tab 으로 up 이 안 오면 되돌린다
    window.addEventListener('blur', onCancel);
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (o && o.guard && o.guard() === false) { if (e.key === 'Escape') setTimeout(relock, 0); return; }   // 시트가 Esc 를 처리한 뒤에도 카드는 남는다
      var t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) { if (e.key === 'Escape') { try { t.blur(); } catch (_) {} relock(); } return; }
      if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.stopImmediatePropagation(); }   // 뒤에 등록된 다른 Esc 처리(옛 모달)가 같이 닫지 않게
    });
    window.addEventListener('resize', function () { if (isOpen()) { layout(); } });
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (animating || loading || items.length < 2) return;
    if (e.target.closest('textarea, input, select, button, a, .kpd-arrow')) return;
    dragging = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, decided: false, horiz: false, t0: Date.now() };
  }
  function onMove(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    var dx = e.clientX - dragging.x0, dy = e.clientY - dragging.y0;
    if (!dragging.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      dragging.decided = true; dragging.horiz = Math.abs(dx) > Math.abs(dy);
      if (!dragging.horiz) { dragging = null; return; }
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      stage.classList.add('kpd-dragging');
    }
    if ((dx > 0 && idx === 0) || (dx < 0 && idx >= items.length - 1)) dx = dx / 3;   // 끝에서는 덜 움직인다
    dragging.dx = dx; setX(dx, false);
    if (e.cancelable) e.preventDefault();
  }
  function onUp(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    var d = dragging; dragging = null; stage.classList.remove('kpd-dragging');
    if (!d.horiz) return;
    suppressClick = Date.now() + 350;
    var slot = slotPx();
    var fast = Math.abs(d.dx) > 30 && (Date.now() - d.t0) < 260;
    var th = Math.min(90, slot * 0.22);
    if ((d.dx < -th || (fast && d.dx < 0)) && idx < items.length - 1) go(1);
    else if ((d.dx > th || (fast && d.dx > 0)) && idx > 0) go(-1);
    else setX(0, true);
  }
  function onCancel() { if (dragging) { dragging = null; stage.classList.remove('kpd-dragging'); setX(0, true); } }

  function go(dir) {
    if (!isOpen() || animating) return;
    var ni = idx + dir;
    if (ni < 0 || ni >= items.length) { setX(0, true); return; }
    animating = true;
    setX(-dir * (slotPx() + gapPx()), true);
    goTimer = setTimeout(function () { goTimer = null; animating = false; idx = ni; renderAll(); }, 290);
  }

  function composeHtml(it, cur) {
    var k = keyOf(it);
    var c = {};
    try { c = (o && o.compose) ? (o.compose(it) || {}) : {}; } catch (_) { c = {}; }
    if (sent[k] || c.sent) return '<div class="kpd-sent">메시지를 보냈습니다.</div>';
    var draft = drafts[k] != null ? drafts[k] : (c.preset || '');
    return '<div class="kpd-compose">' +
      '<textarea rows="2" maxlength="1000" placeholder="메시지를 적어 주십시오" data-kpd-draft="' + esc(k) + '"' + (cur ? '' : ' tabindex="-1"') + '>' + esc(draft) + '</textarea>' +
      '<button type="button" class="kpd-send" data-kpd-send="' + esc(k) + '"' + (cur ? '' : ' tabindex="-1"') + '>메시지 보내기</button>' +
    '</div>';
  }
  function cardHtml(it, pos) {
    if (!it) return '<article class="kpd-card kpd-ghost ' + pos + '" aria-hidden="true"></article>';
    var body = '';
    try { body = o.render ? o.render(it) : ''; } catch (e) { body = ''; }
    return '<article class="kpd-card ' + pos + '" data-key="' + esc(keyOf(it)) + '"' + (pos === 'kpd-cur' ? '' : ' aria-hidden="true"') + '>' +
      '<div class="kpd-body">' + body + '</div>' + composeHtml(it, pos === 'kpd-cur') + '</article>';
  }
  function renderAll() {
    if (!ovl) return;
    if (loading || !items.length) {
      idx = 0;
      var eh = loading ? '<b>불러오는 중…</b>' : ((o && (typeof o.emptyHtml === 'function' ? o.emptyHtml() : o.emptyHtml)) || '<b>조건에 맞는 분이 아직 없습니다.</b>');
      track.innerHTML = '<article class="kpd-card kpd-prev kpd-ghost" aria-hidden="true"></article>' +
        '<article class="kpd-card kpd-cur kpd-empty-card"><div class="kpd-body"><div class="kpd-empty">' + eh + '</div></div></article>' +
        '<article class="kpd-card kpd-next kpd-ghost" aria-hidden="true"></article>';
    } else {
      idx = Math.max(0, Math.min(idx, items.length - 1));
      track.innerHTML = cardHtml(items[idx - 1], 'kpd-prev') + cardHtml(items[idx], 'kpd-cur') + cardHtml(items[idx + 1], 'kpd-next');
    }
    var l = ovl.querySelector('.kpd-arrow.l'), r = ovl.querySelector('.kpd-arrow.r');
    if (l) l.disabled = idx <= 0; if (r) r.disabled = idx >= items.length - 1;
    var rep = ovl.querySelector('[data-kpd="report"]'), sh = ovl.querySelector('[data-kpd="share"]');
    if (rep) rep.style.visibility = (items.length && !loading) ? 'visible' : 'hidden';
    if (sh) sh.style.visibility = (items.length && !loading && o && o.onShare) ? 'visible' : 'hidden';
    setX(0, false);
    if (o && o.onShow && items.length && !loading) { try { o.onShow(current(), idx); } catch (_) {} }
    if (!hintShown && items.length > 1 && !peek) {
      hintShown = true;
      try { if (localStorage.getItem('koaus-deck-hint-v1')) hintShown = true; else { localStorage.setItem('koaus-deck-hint-v1', '1'); hintEl.classList.add('show'); setTimeout(function () { hintEl.classList.remove('show'); }, 2200); } } catch (_) {}
    }
  }

  async function send(btn) {
    if (!o || !o.onSend) return;
    var k = btn.dataset.kpdSend, it = current();
    if (!it || keyOf(it) !== k) return;
    var card = btn.closest('.kpd-card'), ta = card && card.querySelector('textarea[data-kpd-draft]');
    var text = ta ? ta.value : (drafts[k] || '');
    if (!String(text || '').trim()) { if (ta) { try { ta.focus(); } catch (_) {} } return; }
    btn.disabled = true; btn.textContent = '보내는 중…';
    var ok = false, myO = o;
    try { ok = await o.onSend(it, text); } catch (_) { ok = false; }
    if (ok && o !== myO) return;   // 보내는 동안 닫혔거나 다른 목록으로 바뀜 — 화면은 건드리지 않는다
    if (ok) {
      sent[k] = true; delete drafts[k];
      var comp = card && card.querySelector('.kpd-compose');
      if (comp) comp.outerHTML = '<div class="kpd-sent">메시지를 보냈습니다.</div>';
      if (o && o.onSent) { try { o.onSent(it); } catch (_) {} }   // 보내는 동안 닫았으면 o 가 없다
    } else {
      btn.disabled = false; btn.textContent = '메시지 보내기';
    }
  }

  function current() { return (items.length && !loading) ? items[idx] : null; }
  // 11-08f: 페이지 공통 Esc 처리(사이드바·인증 모달 닫기)가 body overflow 를 비워도, 카드가 떠 있으면 배경 잠금을 되살린다(koaus-scroll-lock.js 가 'hidden' 을 본다)
  function relock() { if (isOpen() && document.body.style.overflow !== 'hidden') document.body.style.overflow = 'hidden'; }
  // 불러오는 중 표시(필터 적용 뒤 조회 동안)
  function setLoading(v) { loading = !!v; if (isOpen()) renderAll(); }
  function isOpen() { return !!(ovl && ovl.classList.contains('open')); }
  // 열기 — opts 는 머리말 참고. items 가 비면 emptyHtml(필터 변경 안내)을 보여 준다.
  function open(opts) {
    o = opts || {};
    items = Array.isArray(o.items) ? o.items.slice() : [];
    idx = Math.max(0, Math.min(Number(o.index) || 0, Math.max(0, items.length - 1)));
    drafts = {}; sent = {}; dragging = null; animating = false; loading = !!o.loading;
    mount();
    ovl.querySelector('#kpdTitle').textContent = '‹ ' + (o.title || '구하는 사람');
    ovl.querySelector('[data-kpd="filter"]').style.visibility = o.onFilter ? 'visible' : 'hidden';
    ovl.classList.add('open');
    document.body.style.overflow = 'hidden';
    layout(); renderAll();
  }
  // 목록 바꿔 끼우기(필터 적용 뒤) — 열려 있지 않으면 연다
  function update(newItems, newIndex) {
    if (!isOpen()) { if (o) { o.items = newItems; o.index = newIndex || 0; open(o); } return; }
    items = Array.isArray(newItems) ? newItems.slice() : [];
    idx = Math.max(0, Math.min(Number(newIndex) || 0, Math.max(0, items.length - 1)));
    loading = false;
    layout(); renderAll();
  }
  function close() {
    if (!isOpen()) return;
    ovl.classList.remove('open');
    document.body.style.overflow = '';
    if (goTimer) { clearTimeout(goTimer); goTimer = null; } animating = false; dragging = null;
    var cb = o && o.onClose; o = null; items = []; drafts = {}; sent = {};
    if (cb) { try { cb(); } catch (_) {} }
  }
  // 다른 기기에서 보낸 메시지가 확인되면 그 사람 칸을 잠근다
  function markSent(key) {
    sent[String(key)] = true;
    if (!isOpen()) return;
    var card = ovl.querySelector('.kpd-card.kpd-cur[data-key="' + String(key).replace(/"/g, '\\"') + '"]');
    var comp = card && card.querySelector('.kpd-compose');
    if (comp) comp.outerHTML = '<div class="kpd-sent">메시지를 보냈습니다.</div>';
  }
  function setIndex(i) { if (!isOpen()) return; idx = Math.max(0, Math.min(Number(i) || 0, Math.max(0, items.length - 1))); renderAll(); }

  window.koausPeopleDeck = { open: open, update: update, close: close, isOpen: isOpen, current: current, markSent: markSent, setIndex: setIndex, setLoading: setLoading, go: go, relock: relock };
})();
