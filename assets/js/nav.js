// Mobile nav disclosure + desktop dropdown groups (About / Photos).
// Progressive enhancement: without JS the CSS still shows the full menu on
// desktop, and a :focus-within fallback (gated on html.has-nav-js being
// absent) keeps dropdown links keyboard-reachable.
(function () {
  document.documentElement.classList.add('has-nav-js');

  var nav = document.querySelector('.site-nav');
  var toggle = nav && nav.querySelector('.nav-toggle');
  if (!nav) return;

  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Close the mobile menu when a link inside it is followed.
  nav.addEventListener('click', function (e) {
    var el = e.target.closest('a');
    if (el && nav.classList.contains('open')) {
      nav.classList.remove('open');
      toggle && toggle.setAttribute('aria-expanded', 'false');
    }
  });

  // ---- dropdown groups ----
  var groups = Array.prototype.slice.call(nav.querySelectorAll('.nav-group'));

  function closeGroup(group) {
    var btn = group.querySelector('.nav-group-btn');
    group.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function closeAll(except) {
    groups.forEach(function (g) { if (g !== except) closeGroup(g); });
  }

  groups.forEach(function (group) {
    var btn = group.querySelector('.nav-group-btn');
    if (!btn) return;
    // Opens on click (and therefore Enter/Space on a button) — not hover-only.
    btn.addEventListener('click', function () {
      var open = group.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAll(group);
    });
  });

  // Esc closes any open dropdown and returns focus to its button.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var open = groups.filter(function (g) { return g.classList.contains('open'); });
    if (!open.length) return;
    open.forEach(closeGroup);
    var btn = open[0].querySelector('.nav-group-btn');
    if (btn) btn.focus();
  });

  // Outside click closes all dropdowns.
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-group')) closeAll();
  });

  // Tabbing out of a group closes it, so the dropdown never lingers open.
  nav.addEventListener('focusout', function (e) {
    var group = e.target.closest && e.target.closest('.nav-group');
    if (!group) return;
    var next = e.relatedTarget;
    if (!next || !group.contains(next)) closeGroup(group);
  });
})();
