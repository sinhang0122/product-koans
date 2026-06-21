// KoAus · 글자 크게 토글 — 상단바 '가' 버튼: 100→120→140% 순환, localStorage 저장, 전 페이지 균일 확대.
//  배치: .topbar-actions 안 #themeToggleBtn 바로 앞 (순서: 로그인/내계정 → 가 → 테마 → 햄버거).
//  상단바 없으면 좌하단 플로팅으로 폴백.
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
      '.koaus-textsize-btn{height:38px;min-width:38px;padding:0 9px;box-sizing:border-box;'+
      'background:none;border:1px solid var(--border);border-radius:var(--r-sm);color:var(--text-secondary);'+
      'font:800 15px/1 var(--font),"Noto Sans KR",system-ui,sans-serif;cursor:pointer;'+
      'display:inline-flex;align-items:center;justify-content:center;'+
      'transition:background .15s,border-color .15s,color .15s;}'+
      '.koaus-textsize-btn:hover{background:var(--bg-card);border-color:var(--accent);color:var(--accent);}'+
      '.koaus-textsize-btn.is-on{border-color:var(--accent);color:var(--accent);}'+
      '.koaus-textsize-btn.is-floating{position:fixed;left:14px;bottom:16px;z-index:9998;height:50px;min-width:50px;'+
      'border-width:2px;border-color:var(--text-primary,#111);background:var(--bg-base,#fff);color:var(--text-primary,#111);'+
      'border-radius:25px;font-size:16px;box-shadow:0 6px 18px rgba(0,0,0,.20);}'+
      '@supports (padding:max(0px)){.koaus-textsize-btn.is-floating{bottom:max(16px,env(safe-area-inset-bottom));}}';
    (document.head || document.documentElement).appendChild(t);
  }

  var btn = null;
  function syncBtn(){ if (!btn) return; btn.textContent = LABELS[idx]; btn.classList.toggle('is-on', idx > 0); }
  function makeBtn(){
    btn = document.createElement('button');
    btn.id='koausTextSizeBtn'; btn.type='button'; btn.className='koaus-textsize-btn';
    btn.title='글자 크기 조절'; btn.setAttribute('aria-label','글자 크기 조절 — 눌러서 크게');
    syncBtn();
    btn.addEventListener('click', function(){
      idx = (idx + 1) % LEVELS.length;
      try { localStorage.setItem(KEY, String(idx)); } catch (e) {}
      syncBtn(); applyZoom();
    });
    return btn;
  }

  var tries = 0;
  function mount(){
    if (document.getElementById('koausTextSizeBtn')) return;
    var theme = document.getElementById('themeToggleBtn');
    var ham = document.getElementById('hamburgerBtn');
    var actions = document.querySelector('.topbar-actions');
    if (theme && theme.parentNode){ injectStyle(); theme.parentNode.insertBefore(makeBtn(), theme); return; }
    if (ham && ham.parentNode){ injectStyle(); ham.parentNode.insertBefore(makeBtn(), ham); return; }
    if (actions){ injectStyle(); actions.appendChild(makeBtn()); return; }
    if (tries++ < 20){ setTimeout(mount, 100); return; }   // 동적 주입 대비 잠깐 재시도
    if (!document.body) return;
    injectStyle(); var b = makeBtn(); b.classList.add('is-floating'); document.body.appendChild(b);   // 상단바 없는 페이지 폴백
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true }); else mount();
})();
