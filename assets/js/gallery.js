// Photos-page lightbox carousel. Progressive enhancement over the CSS mosaic:
// without JS each mosaic tile is a plain <a> to its full-size image. With JS
// the tiles (and the "See all N photos" button) open a full-screen dialog
// carousel — arrows/keyboard/swipe, focus trapped, body scroll locked, focus
// returned to the triggering tile on close. Style mirrors nav.js: one IIFE,
// small and readable, no libraries.
(function () {
  var mosaic = document.querySelector('[data-mosaic]');
  var box = document.querySelector('[data-lightbox]');
  if (!mosaic || !box) return;

  // Every tile in DOM order (visible collage tiles first, then the hidden
  // overflow tiles) — data-index gives each its slot in the full photo set.
  var tiles = Array.prototype.slice.call(mosaic.querySelectorAll('[data-mosaic-tile]'));
  if (!tiles.length) return;

  // Build the ordered photo model from the tiles themselves — no second data
  // source. `href` is the full-size (~1600w) image; `tile` is the trigger we
  // return focus to on close.
  var photos = tiles
    .map(function (t) {
      return {
        index: parseInt(t.getAttribute('data-index'), 10) || 0,
        full: t.getAttribute('href'),
        alt: (t.querySelector('img') && t.querySelector('img').getAttribute('alt')) || '',
        caption: t.getAttribute('data-caption') || '',
        credit: t.getAttribute('data-credit') || '',
        tile: t
      };
    })
    .sort(function (a, b) { return a.index - b.index; });

  var total = photos.length;

  // Elements inside the dialog.
  var scrim = box.querySelector('[data-lightbox-scrim]');
  var imgEl = box.querySelector('[data-lightbox-img]');
  var capEl = box.querySelector('[data-lightbox-caption]');
  var curEl = box.querySelector('[data-lightbox-current]');
  var totEl = box.querySelector('[data-lightbox-total]');
  var btnClose = box.querySelector('[data-lightbox-close]');
  var btnPrev = box.querySelector('[data-lightbox-prev]');
  var btnNext = box.querySelector('[data-lightbox-next]');

  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var current = 0;      // index into `photos`
  var lastFocus = null; // element to restore focus to on close
  var open = false;

  if (totEl) totEl.textContent = String(total);

  // Preload one image URL (adjacent-slide prefetch).
  function preload(url) {
    if (!url) return;
    var im = new Image();
    im.src = url;
  }

  // Render slide `i` into the dialog. The image and caption always paint
  // synchronously (never gated behind rAF, so the photo can't fail to load).
  // The fade is a cosmetic-only .is-swapping class, applied unless the user
  // prefers reduced motion, and cleared on the next frame (with a timeout
  // fallback so it never sticks if rAF is throttled).
  function show(i) {
    if (i < 0) i = total - 1;
    if (i >= total) i = 0;
    current = i;
    var p = photos[i];

    imgEl.src = p.full;
    imgEl.setAttribute('alt', p.alt);
    // Caption line: plain caption text + trusted credit HTML (already escaped
    // at build time in the data-credit attribute, decoded by getAttribute).
    var html = '';
    if (p.caption) html += '<span class="lightbox-cap-text">' + escapeText(p.caption) + '</span>';
    if (p.credit) html += '<span class="lightbox-cap-credit">' + p.credit + '</span>';
    capEl.innerHTML = html;
    capEl.hidden = !html;
    if (curEl) curEl.textContent = String(i + 1);

    if (!reduceMotion) {
      box.classList.add('is-swapping');
      var clear = function () { box.classList.remove('is-swapping'); };
      if (window.requestAnimationFrame) window.requestAnimationFrame(clear);
      window.setTimeout(clear, 140);
    }

    // Preload neighbors so prev/next feels instant.
    preload(photos[(i + 1) % total].full);
    preload(photos[(i - 1 + total) % total].full);
  }

  // Minimal text escape for the caption (credit is pre-escaped HTML).
  function escapeText(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function next() { show(current + 1); }
  function prev() { show(current - 1); }

  // ---- focus trap ----
  function focusable() {
    return Array.prototype.filter.call(
      box.querySelectorAll('button, [href], img[tabindex], [tabindex]'),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
  }
  function trap(e) {
    if (e.key !== 'Tab') return;
    var f = focusable();
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); return; }
    trap(e);
  }

  function openAt(i) {
    lastFocus = photos[i] ? photos[i].tile : document.activeElement;
    open = true;
    box.hidden = false;
    document.documentElement.classList.add('lightbox-open');
    document.body.classList.add('lightbox-open');
    show(i);
    document.addEventListener('keydown', onKey);
    // Focus the Next button — a large, obvious control that keeps arrow-key
    // and Tab navigation predictable from the start.
    (btnNext || btnClose).focus();
  }

  function close() {
    if (!open) return;
    open = false;
    box.hidden = true;
    document.documentElement.classList.remove('lightbox-open');
    document.body.classList.remove('lightbox-open');
    document.removeEventListener('keydown', onKey);
    // Return focus to the tile that opened the viewer.
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  // ---- wire tile triggers (intercept the plain-link navigation) ----
  photos.forEach(function (p, i) {
    p.tile.addEventListener('click', function (e) {
      e.preventDefault();
      openAt(i);
    });
  });

  // "See all N photos" button + the 5th-tile overlay both open at photo 1.
  var seeAll = document.querySelector('[data-mosaic-seeall]');
  if (seeAll) {
    seeAll.addEventListener('click', function (e) { e.preventDefault(); openAt(0); });
  }

  // ---- dialog controls ----
  if (btnNext) btnNext.addEventListener('click', next);
  if (btnPrev) btnPrev.addEventListener('click', prev);
  if (btnClose) btnClose.addEventListener('click', close);
  if (scrim) scrim.addEventListener('click', close);

  // ---- touch swipe (no libraries) ----
  var touchX = null, touchY = null;
  box.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { touchX = null; return; }
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchX;
    var dy = t.clientY - touchY;
    // Horizontal intent only, past a small threshold.
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
    touchX = null; touchY = null;
  }, { passive: true });
})();
