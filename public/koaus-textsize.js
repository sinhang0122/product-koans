// KoAus · 글자 크게 토글 — 좌하단 '가' 버튼: 100→120→140% 순환, localStorage 저장, 전 페이지 균일 확대.
(function () {
  if (typeof window === 'undefined' || window.__koausTextSizeInited) return;
  window.__koausTextSizeInited = true;
  var LEVELS = [1, 1.2, 1.4], LABELS = ['가', '가+', '가++'], KEY = 'koaus-textsize', idx = 0;
  try { var s = parseInt(localStorage.getItem(KEY) || '0', 10); if (s >= 0 && s < LEVELS.length) idx = s; } catch (e) {}
  function applyZoom(){ try { document.documentElement.style.zoom = String(LEVELS[idx]); } catch (e) {} }
  applyZoom();
  function injectStyle(){
    if (document.getElementById('koaus-textsize-style')) return;
    var t = document.createElement('style'); t.id = 'koaus-textsize-style';
    t.textContent =
      '.koaus-textsize-btn{position:fixed;left:14px;bottom:16px;z-index:9998;min-width:50px;height:50px;padding:0 12px;'+
      'border-radius:25px;border:2px solid var(--text-primary,#111);background:var(--bg-base,#fff);color:var(--text-primary,#111);'+
      'font:800 16px/1 "Noto Sans KR",system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.20);'+
      'display:flex;align-items:center;justify-content:center;transition:transform .12s;}'+
      '.koaus-textsize-btn:hover{transform:scale(1.06);}'+
      '@supports (padding:max(0px)){.koaus-textsize-btn{bottom:max(16px,env(safe-area-inset-bottom));}}';
    (document.head || document.documentElement).appendChild(t);
  }
  var btn = null;
  function mount(){
    if (!document.body || document.getElementById('koausTextSizeBtn')) return;
    injectStyle();
    btn = document.createElement('button');
    btn.id='koausTextSizeBtn'; btn.type='button'; btn.className='koaus-textsize-btn';
    btn.title='글자 크기 조절'; btn.setAttribute('aria-label','글자 크기 조절 — 눌러서 크게');
    btn.textContent = LABELS[idx];
    btn.addEventListener('click', function(){
      idx = (idx + 1) % LEVELS.length;
      try { localStorage.setItem(KEY, String(idx)); } catch (e) {}
      btn.textContent = LABELS[idx]; applyZoom();
    });
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true }); else mount();
})();
