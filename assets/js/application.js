// Progressive enhancement for the DRAFT Section 515 application repeaters
// (household members, income, assets, residences, references). Each
// [data-repeater] has an .app-repeater-items list, a <template> using __I__
// (item index) / __N__ (display number), an [data-add] button, and — on every
// non-protected row — a [data-remove] control. "+ Add" clones the template using
// a MONOTONIC data-count as the index (never reused, so removing a middle row
// can't collide names). "Remove" deletes a row down to data-min. Display numbers
// are kept sequential. Without JS the starting rows render and the paper
// application remains the fallback.
(function () {
  function renumber(rep) {
    var items = rep.querySelector('.app-repeater-items');
    if (!items) return;
    var rows = items.children, n = 0;
    for (var i = 0; i < rows.length; i++) {
      n++;
      var row = rows[i];
      var numEl = row.querySelector('.rt-num');
      if (numEl) numEl.textContent = n;
      var titleEl = row.querySelector('.app-card-title');
      // Renumber generic titles ("Home 2"); leave a protected first label
      // ("Head of household" / "Current home") — it has no digit — alone.
      if (titleEl && /\d/.test(titleEl.textContent)) titleEl.textContent = titleEl.textContent.replace(/\d+/, n);
      // Keep the row's aria-label (which the submit serializer uses as the group
      // heading) and the remove button's aria-label in sync with the visible
      // number, so a filed application never shows gapped/mismatched headings.
      var aria = row.getAttribute('aria-label');
      if (aria && /\d/.test(aria)) row.setAttribute('aria-label', aria.replace(/\d+/, n));
      var rmBtn = row.querySelector('[data-remove]');
      if (rmBtn) { var ra = rmBtn.getAttribute('aria-label'); if (ra && /\d/.test(ra)) rmBtn.setAttribute('aria-label', ra.replace(/\d+/, n)); }
    }
  }
  function rowCount(rep) {
    var items = rep.querySelector('.app-repeater-items');
    return items ? items.children.length : 0;
  }
  function notifyChanged(rep) {
    try { rep.dispatchEvent(new CustomEvent('repeater:changed', { bubbles: true })); } catch (e) { /* old browser */ }
  }

  var reps = document.querySelectorAll('[data-repeater]');
  Array.prototype.forEach.call(reps, function (rep) {
    var addBtn = rep.querySelector('[data-add]');
    var tpl = rep.querySelector('template[data-repeater-template]');
    var items = rep.querySelector('.app-repeater-items');
    if (!tpl || !items) return;
    var min = parseInt(rep.getAttribute('data-min') || '0', 10);

    if (addBtn) addBtn.addEventListener('click', function () {
      var n = parseInt(rep.getAttribute('data-count') || '1', 10);
      var html = tpl.innerHTML.split('__I__').join(n).split('__N__').join(n + 1).trim();
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var node = holder.firstElementChild;
      if (!node) return;
      items.appendChild(node);
      rep.setAttribute('data-count', String(n + 1)); // monotonic; never reused
      renumber(rep);
      notifyChanged(rep);
      var firstCtrl = node.querySelector('input, select, textarea');
      if (firstCtrl && firstCtrl.focus) firstCtrl.focus();
    });

    // Remove is event-delegated so cloned rows work without re-wiring.
    rep.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-remove]');
      if (!btn || !rep.contains(btn)) return;
      if (rowCount(rep) <= min) return;
      var row = btn.closest('.rt-row, .app-card');
      if (!row || row.parentNode !== items) return;
      // Choose where focus goes BEFORE removing (deleting the focused button
      // would otherwise strand focus on <body>): next row's remove, else the
      // previous row's remove, else the Add button.
      var next = row.nextElementSibling, prev = row.previousElementSibling;
      var focusTarget = (next && next.querySelector('[data-remove]'))
        || (prev && prev.querySelector('[data-remove]')) || addBtn || null;
      row.parentNode.removeChild(row);
      renumber(rep);
      notifyChanged(rep);
      if (focusTarget && focusTarget.focus) focusTarget.focus();
    });
  });
})();

// Conditional visibility: an [.app-cond] wrapper shows/hides based on another
// field's value (data-cond-field / -mode / -equals / -checked). A required
// control inside a hidden wrapper is temporarily un-required so it can never
// block submission of a field the applicant was not shown.
(function () {
  var form = document.querySelector('.application-form');
  if (!form) return;
  var conds = form.querySelectorAll('.app-cond[data-cond-field]');
  if (!conds.length) return;

  function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  function fieldState(name) {
    var ctrls = form.querySelectorAll('[name="' + cssEsc(name) + '"]');
    var val = '', anyChecked = false;
    Array.prototype.forEach.call(ctrls, function (c) {
      var t = (c.type || '').toLowerCase();
      if (t === 'radio' || t === 'checkbox') { if (c.checked) { val = c.value; anyChecked = true; } }
      else val = c.value;
    });
    return { val: val, anyChecked: anyChecked };
  }

  function setVisible(el, show) {
    el.hidden = !show;
    var ctrls = el.querySelectorAll('input, select, textarea');
    Array.prototype.forEach.call(ctrls, function (c) {
      if (show) { if (c.getAttribute('data-req') === '1') { c.required = true; c.removeAttribute('data-req'); } }
      else if (c.required) { c.setAttribute('data-req', '1'); c.required = false; }
    });
  }

  function evalOne(el) {
    var st = fieldState(el.getAttribute('data-cond-field'));
    var met;
    if (el.hasAttribute('data-cond-checked')) met = (st.anyChecked === (el.getAttribute('data-cond-checked') === 'true'));
    else if (el.hasAttribute('data-cond-equals')) met = (st.val === el.getAttribute('data-cond-equals'));
    else met = true;
    setVisible(el, el.getAttribute('data-cond-mode') === 'show' ? met : !met);
  }

  function evalAll() { Array.prototype.forEach.call(conds, evalOne); }
  form.addEventListener('change', evalAll);
  evalAll();
})();

// "Which household members lived here" checkboxes: filled at runtime from the
// names typed in the household section, and refreshed when those names change or
// rows are added/removed. Without JS, a plain text field is submitted instead.
(function () {
  if (!document.querySelector('[data-household-members]')) return;

  function memberList() {
    // Each member has a STABLE id (its monotonic input name, e.g. members_3_name)
    // and a display label (the typed name, or a positional fallback). The
    // checkbox value is the readable label (what the office sees), but checked
    // state is preserved by id — so renaming a member never drops their check.
    var list = [], seen = 0;
    var inputs = document.querySelectorAll('input[name^="members_"][name$="_name"]');
    Array.prototype.forEach.call(inputs, function (inp) {
      seen++;
      var v = (inp.value || '').trim();
      list.push({ id: inp.name, label: v || ('Household member ' + seen) });
    });
    return list;
  }

  function populate() {
    var members = memberList();
    Array.prototype.forEach.call(document.querySelectorAll('[data-household-members]'), function (fs) {
      var target = fs.querySelector('[data-hm-target]');
      var base = fs.getAttribute('data-hm-name');
      if (!target || !base) return;
      var checked = {};
      Array.prototype.forEach.call(target.querySelectorAll('input:checked'), function (c) {
        checked[c.getAttribute('data-hm-id') || c.value] = true;
      });
      var fallback = fs.querySelector('.hm-fallback');
      if (fallback && members.length) fallback.parentNode.removeChild(fallback);
      target.innerHTML = '';
      members.forEach(function (m) {
        var lab = document.createElement('label');
        lab.className = 'choice choice-inline';
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.name = base; cb.value = m.label;
        cb.setAttribute('data-hm-id', m.id);
        if (checked[m.id]) cb.checked = true;
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(' ' + m.label));
        target.appendChild(lab);
      });
    });
  }

  document.addEventListener('input', function (e) {
    if (e.target && /^members_\d+_name$/.test(e.target.name || '')) populate();
  });
  document.addEventListener('repeater:changed', function () { setTimeout(populate, 0); });
  populate();
})();

// Secure online submission. Only active when the form was built with
// data-apply-endpoint (config.applyOnlineEnabled). Serializes the whole form
// into labelled sections + a flat values map, attaches the Turnstile token, and
// POSTs JSON to the Worker's /apply endpoint, which files the application into
// the property's Google Drive folder (never by email). On success, the form is
// replaced by a receipt panel showing the server's reference number + timestamp.
// Without JS the form does not submit — the paper application (linked in the
// fallback note) is the alternative.
(function () {
  var form = document.querySelector('.apply-online-form[data-apply-endpoint]');
  if (!form) return;
  var endpoint = form.getAttribute('data-apply-endpoint');
  var status = form.querySelector('.form-status');

  function showStatus(msg, ok) {
    if (!status) return;
    status.hidden = false;
    status.textContent = msg;
    status.className = 'form-status ' + (ok ? 'ok' : 'err');
    if (status.focus) status.focus();
  }

  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*\*$/, '')
      .replace(/\s*\(optional\)$/i, '');
  }

  function esc(ident) {
    return (window.CSS && CSS.escape) ? CSS.escape(ident) : String(ident).replace(/"/g, '\\"');
  }

  function labelFor(ctrl, scope) {
    var type = (ctrl.type || '').toLowerCase();
    // Grouped inputs (radio / checkbox-group) carry their real label on the
    // fieldset legend; the wrapping <label> holds only the option text — which
    // is the value, captured separately. A lone consent checkbox has no
    // fieldset, so it falls through to its wrapping label below.
    if (type === 'radio' || type === 'checkbox') {
      var gfs = ctrl.closest && ctrl.closest('fieldset');
      if (gfs) { var glg = gfs.querySelector('legend'); if (glg) return clean(glg.textContent); }
    }
    if (ctrl.id) {
      var l = scope.querySelector('label[for="' + esc(ctrl.id) + '"]') ||
        document.querySelector('label[for="' + esc(ctrl.id) + '"]');
      if (l) return clean(l.textContent);
    }
    var wrap = ctrl.closest && ctrl.closest('label');
    if (wrap) return clean(wrap.textContent);
    return ctrl.name || ctrl.id || '';
  }

  // Collect labelled {label,value} pairs from a scope. Radios/checkboxes of the
  // same name collapse to one item (checked value(s)). Controls are marked in
  // `handled` so a later sweep of the whole section skips repeater-row controls.
  function collect(scope, handled) {
    var out = [], byName = {};
    var ctrls = scope.querySelectorAll('input, select, textarea');
    Array.prototype.forEach.call(ctrls, function (c) {
      if (handled && handled.indexOf(c) !== -1) return;
      var type = (c.type || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') return;
      if (c.name === 'cf-turnstile-response') return;
      if (c.closest('[hidden]')) return; // skip conditionally-hidden fields
      if (handled) handled.push(c);
      var name = c.name || c.id;
      if (!name) return;
      if (type === 'radio' || type === 'checkbox') {
        if (byName[name] != null) {
          if (c.checked) {
            var idx = byName[name];
            out[idx].value = out[idx].value ? out[idx].value + ', ' + c.value : c.value;
          }
          return;
        }
        byName[name] = out.length;
        out.push({ label: labelFor(c, scope), value: c.checked ? (c.value === 'yes' ? 'Yes' : c.value) : '' });
      } else {
        out.push({ label: labelFor(c, scope), value: (c.value || '').trim() });
      }
    });
    return out;
  }

  function hasVal(it) { return it.value !== '' && it.value != null; }

  function serialize() {
    var sections = [];
    var handled = [];
    Array.prototype.forEach.call(form.querySelectorAll('.app-section'), function (sec) {
      var h = sec.querySelector('h2');
      var title = h ? clean(h.textContent) : '';
      var groups = [];
      Array.prototype.forEach.call(sec.querySelectorAll('.app-repeater .rt-row, .app-repeater .app-card'), function (row) {
        if (row.closest('[hidden]')) return;
        var gitems = collect(row, handled);
        if (gitems.some(hasVal)) {
          groups.push({ label: clean(row.getAttribute('aria-label') || ''), items: gitems });
        }
      });
      var items = collect(sec, handled).filter(hasVal);
      if (items.length || groups.length) sections.push({ title: title, items: items, groups: groups });
    });

    // Flat name -> value map (stable field ids), for future PDF form-filling.
    var values = {};
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (c) {
      var type = (c.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'file' || type === 'hidden') return;
      if (!c.name || c.name === 'cf-turnstile-response') return;
      if (c.closest('[hidden]')) return; // skip conditionally-hidden fields
      if (type === 'radio') { if (c.checked) { values[c.name] = c.value; } }
      else if (type === 'checkbox') {
        // checkbox-groups (multiple same-name) accumulate; lone checkboxes set yes/''.
        if (c.checked) { values[c.name] = values[c.name] ? values[c.name] + ', ' + c.value : (c.value || 'yes'); }
        else if (values[c.name] == null) { values[c.name] = ''; }
      }
      else values[c.name] = c.value;
    });

    return { sections: sections, values: values };
  }

  function fieldVal(name) {
    var el = form.querySelector('[name="' + esc(name) + '"]');
    return el ? (el.value || '').trim() : '';
  }

  function resetTurnstile() {
    try { if (window.turnstile && typeof window.turnstile.reset === 'function') window.turnstile.reset(); } catch (e) {}
  }

  function showConfirmation(data) {
    data = data || {};
    var panel = document.createElement('div');
    panel.className = 'apply-confirm';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('tabindex', '-1');

    // Server-provided values are escaped before they touch innerHTML — the
    // Worker sends plain text, but the receipt must never parse it as HTML.
    var escHtml = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    var receipt = '';
    if (data.reference) receipt += '<div><dt>Reference number</dt><dd>' + escHtml(data.reference) + '</dd></div>';
    if (data.receivedAtDisplay) receipt += '<div><dt>Received</dt><dd>' + escHtml(data.receivedAtDisplay) + '</dd></div>';

    // Only promise a confirmation email if the server actually sent one
    // (data.confirmationEmailed). Otherwise lean on the on-screen receipt so we
    // never tell the applicant to expect an email that isn't coming.
    var lead = data.confirmationEmailed === true
      ? 'Thank you. We’ve received your application and emailed you a confirmation.'
      : 'Thank you. We’ve received your application. Please save your reference number below for your records.';

    panel.innerHTML =
      '<svg class="confirm-icon" viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<path d="M15 24l6 6 12-13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<h3>Application received</h3>' +
      '<p>' + lead + '</p>' +
      (receipt ? '<dl class="apply-receipt">' + receipt + '</dl>' : '') +
      '<p class="apply-receipt-note">This confirms we <strong>received</strong> your application — it is not yet a decision or a spot on a waiting list. Please keep your reference number.</p>';

    form.parentNode.replaceChild(panel, form);
    if (panel.focus) panel.focus();
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var tk = form.querySelector('[name="cf-turnstile-response"]');
    var token = tk ? tk.value : '';

    var btn = form.querySelector('button[type="submit"]');
    var original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    if (status) status.hidden = true;

    var ser = serialize();
    var payload = {
      property: form.getAttribute('data-property-domain'),
      propertyName: form.getAttribute('data-property-name'),
      schemaVersion: form.getAttribute('data-schema-version') || '',
      'cf-turnstile-response': token,
      applicant: {
        name: fieldVal('members_0_name'),
        email: fieldVal('email'),
        phone: fieldVal('home_phone')
      },
      sections: ser.sections,
      values: ser.values
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return { ok: res.ok }; }).then(function (data) {
        return { httpOk: res.ok, data: data || {} };
      });
    }).then(function (r) {
      if (r.httpOk && r.data.ok) {
        showConfirmation(r.data);
      } else {
        showStatus(r.data.message || 'Sorry, we could not submit your application. Please call the office and we will help you right away.', false);
        if (btn) { btn.disabled = false; btn.textContent = original; }
        resetTurnstile();
      }
    }).catch(function () {
      showStatus('Sorry, something went wrong submitting your application. Please call the office and we will help you right away.', false);
      if (btn) { btn.disabled = false; btn.textContent = original; }
      resetTurnstile();
    });
  });
})();
