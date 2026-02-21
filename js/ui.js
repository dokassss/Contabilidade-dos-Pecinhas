/* ════════════════════
   NAVIGATION
════════════════════ */
function switchPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  const ni = document.getElementById('ni-' + p);
  if (ni) ni.classList.add('active');
  if (p === 'financeiro') setTimeout(buildCFChart, 60);
}

/* ════════════════════
   UI UTILS
════════════════════ */
function toast(ico, msg) {
  const ex = document.querySelector('.toast');
  if (ex) { ex.remove(); clearTimeout(_toastTimer); }
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = '<span class="toast-ico">'+ico+'</span><span class="toast-msg">'+msg+'</span>';
  document.body.appendChild(el);
  _toastTimer = setTimeout(() => {
    el.style.transition = 'opacity .2s'; el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, 2400);
}
function openSheet(id)  { document.getElementById(id).classList.add('open'); }
function closeSheet(id) { document.getElementById(id).classList.remove('open'); }
function closeSheetOutside(e, id) { if (e.target === document.getElementById(id)) closeSheet(id); }
function toggleHide() {
  _hidden = !_hidden;

  // Hide/show all monetary values
  document.querySelectorAll('.val').forEach(el => {
    if (el.classList.contains('cents')) return; // child of .val, handled by parent
    if (_hidden) {
      if (!el.dataset.orig) el.dataset.orig = el.innerHTML;
      el.innerHTML = '<span style="letter-spacing:2px">••••</span>';
    } else {
      if (el.dataset.orig) el.innerHTML = el.dataset.orig;
    }
  });

  // Toggle eye icon on all hide buttons
  document.querySelectorAll('.hide-btn .eye-open').forEach(el => {
    el.style.display = _hidden ? 'none' : '';
  });
  document.querySelectorAll('.hide-btn .eye-closed').forEach(el => {
    el.style.display = _hidden ? '' : 'none';
  });
}

function maskCNPJ(input) {
  let v = input.value.replace(/\D/g,"");
  v = v.replace(/^(\d{2})(\d)/,"$1.$2");
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3");
  v = v.replace(/\.(\d{3})(\d)/,".$1/$2");
  v = v.replace(/(\d{4})(\d)/,"$1-$2");
  input.value = v.slice(0,18);
}

// Expose to global scope for inline HTML handlers
window.switchPage = switchPage;
window.toast = toast;
window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.closeSheetOutside = closeSheetOutside;
window.toggleHide = toggleHide;
window.maskCNPJ = maskCNPJ;
