/* ============================================================
   Qazart — UX micro-interactions
   Ничего не переопределяет, только дополняет.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. Ripple на кнопках ---------- */
  document.addEventListener('pointerdown', function (e) {
    const el = e.target.closest('.btn, .node, .opt, .tab, #zere');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const d = document.createElement('span');
    d.className = 'ripple';
    d.style.width = d.style.height = size + 'px';
    d.style.left = (e.clientX - r.left - size / 2) + 'px';
    d.style.top  = (e.clientY - r.top  - size / 2) + 'px';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(d);
    setTimeout(function () { d.remove(); }, 650);
  }, { passive: true });

  /* ---------- 2. Haptic (если поддерживается) ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('.btn, .tab, #zere') && navigator.vibrate) {
      try { navigator.vibrate(8); } catch (_) {}
    }
  }, { passive: true });

  /* ---------- 3. Красивое «печатает…» для AI ---------- */
  // Перехватываем создание «● ● ●» — превращаем в 3 пульсирующие точки.
  const obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes && m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.classList && n.classList.contains('msg') &&
            n.classList.contains('a') &&
            n.textContent.trim() === '● ● ●') {
          n.textContent = '';
          n.classList.add('typing');
          n.innerHTML = '<i></i><i></i><i></i>';
          // когда текст начнёт «печататься» typeInto — убираем точки
          const t = setInterval(function () {
            if (n.textContent.replace(/\s/g, '') !== '') {
              n.classList.remove('typing');
              clearInterval(t);
            }
          }, 200);
        }
      });
    });
  });
  const chat = document.getElementById('chat');
  if (chat) obs.observe(chat, { childList: true });

  /* ---------- 4. Прогресс-полоска скролла для экранов ---------- */
  document.querySelectorAll('.scr').forEach(function (scr) {
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:absolute;top:0;left:0;height:2px;width:0;' +
      'background:linear-gradient(90deg,var(--cy),var(--violet));' +
      'box-shadow:0 0 10px var(--cy);z-index