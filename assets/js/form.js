// Progressive enhancement for the FMC application/contact form.
// Without JS the form posts normally (multipart) to FORM_ENDPOINT, and the
// native <input type="file"> inside the dropzone still works.
// With JS: click-anywhere dropzone, drag-and-drop, a managed list of chosen
// files (synced back to the input via DataTransfer so the plain POST still
// carries them), a running total, inline size errors, and — on the Apply
// form — a large confirmation panel that replaces the form after submit.
(function () {
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    var kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + ' KB';
    var mb = kb / 1024;
    return mb.toFixed(1) + ' MB';
  }

  // Wire the friendly dropzone for one form. Returns a recheck() helper the
  // submit handler can call, or null if this form has no dropzone.
  function setupDropzone(form, fileInput, maxBytes, maxLabel, announce, showError, clearError) {
    var dropzone = form.querySelector('[data-dropzone]');
    if (!dropzone || !fileInput) return null;

    var list = form.querySelector('[data-file-list]');
    var totalEl = form.querySelector('[data-file-total]');
    var maxMbLabel = maxLabel || '25 MB';

    // The managed set of files. We keep our own array and mirror it into the
    // input's .files via DataTransfer so a no-JS-style POST still submits them.
    var files = [];

    function totalBytes() {
      var t = 0;
      for (var i = 0; i < files.length; i++) t += files[i].size;
      return t;
    }

    function syncInput() {
      if (typeof DataTransfer === 'undefined') return; // very old browser: leave native selection as-is
      var dt = new DataTransfer();
      for (var i = 0; i < files.length; i++) dt.items.add(files[i]);
      fileInput.files = dt.files;
    }

    function sizeOk() {
      return !maxBytes || totalBytes() <= maxBytes;
    }

    function render() {
      if (!list) return;
      list.innerHTML = '';
      if (!files.length) {
        list.hidden = true;
        if (totalEl) totalEl.hidden = true;
        return;
      }
      list.hidden = false;
      for (var i = 0; i < files.length; i++) {
        (function (index) {
          var f = files[index];
          var li = document.createElement('li');

          var name = document.createElement('span');
          name.className = 'file-name';
          name.textContent = f.name;

          var size = document.createElement('span');
          size.className = 'file-size';
          size.textContent = formatBytes(f.size);

          var remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'file-remove';
          remove.textContent = 'Remove';
          remove.setAttribute('aria-label', 'Remove ' + f.name);
          remove.addEventListener('click', function () {
            files.splice(index, 1);
            syncInput();
            render();
            announce('Removed ' + f.name + '. ' + summary());
            checkSize();
          });

          li.appendChild(name);
          li.appendChild(size);
          li.appendChild(remove);
          list.appendChild(li);
        })(i);
      }
      if (totalEl) {
        totalEl.hidden = false;
        totalEl.textContent = 'Total: ' + formatBytes(totalBytes()) + ' of ' + maxMbLabel;
      }
    }

    function summary() {
      if (!files.length) return 'No files chosen.';
      return files.length + (files.length === 1 ? ' file, ' : ' files, ') +
        formatBytes(totalBytes()) + ' of ' + maxMbLabel + '.';
    }

    function checkSize() {
      if (!maxBytes) { clearError(); return true; }
      if (!sizeOk()) {
        showError('That file is too large. All files together can be up to ' + maxMbLabel + '.');
        return false;
      }
      clearError();
      return true;
    }

    function addFiles(fileList) {
      var added = 0;
      for (var i = 0; i < fileList.length; i++) {
        var f = fileList[i];
        // Skip exact duplicates (same name + size) so re-picking is forgiving.
        var dup = false;
        for (var j = 0; j < files.length; j++) {
          if (files[j].name === f.name && files[j].size === f.size) { dup = true; break; }
        }
        if (!dup) { files.push(f); added++; }
      }
      syncInput();
      render();
      if (added) announce('Added ' + added + (added === 1 ? ' file. ' : ' files. ') + summary());
      checkSize();
    }

    // Picking via the native input (click or keyboard on the input).
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length) {
        // Copy out, then re-sync from our managed array (dedupe + accumulate).
        addFiles(fileInput.files);
      }
    });

    // Drag and drop onto the box.
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'dragend'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        // Only clear when leaving the box itself, not a child.
        if (evt === 'dragleave' && dropzone.contains(e.relatedTarget)) return;
        dropzone.classList.remove('is-dragover');
      });
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    });

    return checkSize;
  }

  var forms = document.querySelectorAll('.fmc-form');
  Array.prototype.forEach.call(forms, function (form) {
    var isApply = form.classList.contains('apply-form');
    var status = form.querySelector('.form-status');
    var fileInput = form.querySelector('input[type="file"]');
    var fileError = form.querySelector('#files-error');
    var liveRegion = form.querySelector('[data-file-live]');
    var maxBytes = parseInt(form.getAttribute('data-max-bytes'), 10) || 0;
    var maxLabel = form.getAttribute('data-max-label') || '';

    function announce(msg) {
      if (liveRegion) liveRegion.textContent = msg;
    }
    function showError(msg) {
      if (fileError) { fileError.textContent = msg; fileError.hidden = false; }
      announce(msg);
    }
    function clearError() {
      if (fileError) { fileError.hidden = true; fileError.textContent = ''; }
    }

    // Preferred path: the friendly dropzone (Apply form).
    var recheck = setupDropzone(form, fileInput, maxBytes, maxLabel, announce, showError, clearError);

    // Fallback size check for forms without a dropzone (none today, but safe).
    function plainCheckSize() {
      if (!fileInput || !maxBytes || !fileInput.files) return true;
      var total = 0;
      for (var i = 0; i < fileInput.files.length; i++) total += fileInput.files[i].size;
      if (total > maxBytes) {
        showError('That file is too large. All files together can be up to ' + maxLabel + '.');
        return false;
      }
      clearError();
      return true;
    }
    function checkSize() {
      return recheck ? recheck() : plainCheckSize();
    }
    if (fileInput && !recheck) fileInput.addEventListener('change', checkSize);

    function showStatus(msg, ok) {
      if (!status) return;
      status.hidden = false;
      status.textContent = msg;
      status.className = 'form-status ' + (ok ? 'ok' : 'err');
      status.focus && status.focus();
    }

    // Replace the Apply form with a large confirmation panel.
    function showConfirmation() {
      var phoneLink = form.querySelector('.form-fallback-note a[href^="tel:"]');
      var phoneHref = phoneLink ? phoneLink.getAttribute('href') : '';
      var phoneText = phoneLink ? phoneLink.textContent : '';

      var panel = document.createElement('div');
      panel.className = 'apply-confirm';
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      panel.setAttribute('tabindex', '-1');

      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'confirm-icon');
      icon.setAttribute('viewBox', '0 0 48 48');
      icon.setAttribute('width', '56');
      icon.setAttribute('height', '56');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="3"/>' +
        '<path d="M15 24l6 6 12-13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
      panel.appendChild(icon);

      var h = document.createElement('h3');
      // Neutral wording: this form carries the initial application or
      // documents the office asked for later.
      h.textContent = 'We received your files.';
      panel.appendChild(h);

      var p = document.createElement('p');
      if (phoneHref) {
        p.appendChild(document.createTextNode('We will be in touch soon. Questions? Call '));
        var a = document.createElement('a');
        a.href = phoneHref;
        a.textContent = phoneText;
        p.appendChild(a);
        p.appendChild(document.createTextNode('.'));
      } else {
        p.textContent = 'We will be in touch soon.';
      }
      panel.appendChild(p);

      form.parentNode.replaceChild(panel, form);
      panel.focus && panel.focus();
    }

    form.addEventListener('submit', function (e) {
      // Let the browser enforce required fields first.
      if (!form.checkValidity()) { form.reportValidity(); e.preventDefault(); return; }
      if (!checkSize()) { e.preventDefault(); return; }

      // Enhance: submit via fetch so we can show inline messaging.
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      fetch(form.action, { method: 'POST', body: new FormData(form) })
        .then(function (res) {
          if (res.ok) {
            if (isApply) {
              showConfirmation();
            } else {
              form.reset();
              clearError();
              showStatus('Thank you — we received your message and will be in touch. If it is urgent, please call the office.', true);
              if (btn) { btn.disabled = false; btn.textContent = original; }
            }
          } else {
            throw new Error('bad status');
          }
        })
        .catch(function () {
          showStatus(isApply
            ? 'Sorry, something went wrong sending your files. Please call the office and we will help you right away.'
            : 'Sorry, something went wrong sending your message. Please call the office and we will help you right away.', false);
          if (btn) { btn.disabled = false; btn.textContent = original; }
        });
    });
  });
})();
