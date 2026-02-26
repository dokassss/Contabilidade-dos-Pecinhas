/* ════════════════════════════════════════════════
   UI.JS  —  v30
   Responsável por: navegação, toast, sheets,
   máscaras de input, toggleHide, setTheme e controle
   de telas de autenticação (login / register / onboarding).

   REGRA: toda função chamada via onclick no HTML
   deve ser exposta em window.*  — ver bloco no final.
════════════════════════════════════════════════ */

/* ════════════════════
   NAVIGATION
════════════════════ */
function switchPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(el => el.classList.remove('active'));
  const page = document.getElementById('page-' + p);
  if (page) {
    page.classList.add('active');
    page.scrollTop = 0; // volta ao topo ao trocar de aba
  }
  const ni = document.getElementById('ni-' + p);
  if (ni) ni.classList.add('active');
  if (p === 'financeiro') setTimeout(buildCFChart, 60);
}

/* ════════════════════
   TEMA  (migrado do inline de index.html)
   Persiste no localStorage e aplica data-theme no <body>.
════════════════════ */

/**
 * Aplica o tema claro ou escuro.
 * @param {'dark'|'light'} mode
 */
function setTheme(mode) {
  document.body.setAttribute('data-theme', mode);
  const btnDark  = document.getElementById('btn-dark');
  const btnLight = document.getElementById('btn-light');
  if (btnDark)  btnDark.classList.toggle('active',  mode === 'dark');
  if (btnLight) btnLight.classList.toggle('active', mode === 'light');
  localStorage.setItem('theme', mode);
}

/**
 * Lê o tema salvo (ou 'dark' por padrão) e aplica imediatamente.
 * Deve ser chamada assim que o DOM estiver disponível.
 * Chamada automaticamente no DOMContentLoaded abaixo.
 */
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  setTheme(saved);
}

// Aplica o atributo no <html> o mais cedo possível (antes do DOMContentLoaded)
// para evitar flash de tema errado.
(function () {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', initTheme);
})();

/* ════════════════════
   TELAS DE AUTH
   Migradas de main-supabase.js para manter
   toda lógica de DOM/UI num único arquivo.
════════════════════ */

/**
 * Alterna entre a tela de login e o shell do app.
 * @param {boolean} visible
 */
function showLoginScreen(visible) {
  const loginEl = document.getElementById('login-screen');
  const appEl   = document.getElementById('phone');
  if (!loginEl || !appEl) return;
  loginEl.style.display = visible ? 'flex' : 'none';
  appEl.style.display   = visible ? 'none'  : '';
}

/**
 * Exibe ou oculta a tela de cadastro pessoal.
 * Ao exibir, garante que a tela de login fique oculta.
 * @param {boolean} visible
 */
function showRegisterScreen(visible) {
  const el = document.getElementById('register-screen');
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
  if (visible) showLoginScreen(false);
}

/**
 * Exibe ou oculta a tela de onboarding legado.
 * @param {boolean} visible
 */
function showOnboardingScreen(visible) {
  const el = document.getElementById('onboarding-screen');
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
}

/* ════════════════════
   TOAST
════════════════════ */
function toast(ico, msg) {
  const ex = document.querySelector('.toast');
  if (ex) { ex.remove(); clearTimeout(_toastTimer); }
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = '<span class="toast-ico">'+ico+'</span><span class="toast-msg">'+msg+'</span>';
  // Insere dentro do .phone para ficar acima de sheets e overlays.
  // Se .phone não existir (ex: tela de login), usa document.body como fallback.
  const container = document.querySelector('.phone') || document.body;
  container.appendChild(el);
  window._toastTimer = setTimeout(() => {
    el.style.transition = 'opacity .2s'; el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, 2400);
}

/* ════════════════════
   SHEETS
════════════════════ */
function openSheet(id)  { document.getElementById(id).classList.add('open'); }
function closeSheet(id) { document.getElementById(id).classList.remove('open'); }
function closeSheetOutside(e, id) { if (e.target === document.getElementById(id)) closeSheet(id); }

/* ════════════════════
   TOGGLE HIDE (valores monetários)
════════════════════ */
function toggleHide() {
  window._hidden = !window._hidden;

  document.querySelectorAll('.val').forEach(el => {
    if (el.classList.contains('cents')) return;
    if (window._hidden) {
      if (!el.dataset.orig) el.dataset.orig = el.innerHTML;
      el.innerHTML = '<span style="letter-spacing:2px">••••</span>';
    } else {
      if (el.dataset.orig) el.innerHTML = el.dataset.orig;
    }
  });

  document.querySelectorAll('.hide-btn .eye-open').forEach(el => {
    el.style.display = window._hidden ? 'none' : '';
  });
  document.querySelectorAll('.hide-btn .eye-closed').forEach(el => {
    el.style.display = window._hidden ? '' : 'none';
  });
}

/* ════════════════════
   MÁSCARAS DE INPUT
════════════════════ */
function maskCNPJ(input) {
  let v = input.value.replace(/\D/g,"");
  v = v.replace(/^(\d{2})(\d)/,"$1.$2");
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3");
  v = v.replace(/\.(\d{3})(\d)/,".$1/$2");
  v = v.replace(/(\d{4})(\d)/,"$1-$2");
  input.value = v.slice(0,18);
}

function maskCPF(input) {
  let v = input.value.replace(/\D/g,"");
  v = v.replace(/^(\d{3})(\d)/,"$1.$2");
  v = v.replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3");
  v = v.replace(/\.(\d{3})(\d)/,".$1-$2");
  input.value = v.slice(0,14);
}

function maskFone(input) {
  let v = input.value.replace(/\D/g,"");
  if (v.length <= 10) {
    v = v.replace(/^(\d{2})(\d)/,"($1) $2");
    v = v.replace(/(\d{4})(\d)/,"$1-$2");
  } else {
    v = v.replace(/^(\d{2})(\d)/,"($1) $2");
    v = v.replace(/(\d{5})(\d)/,"$1-$2");
  }
  input.value = v.slice(0,15);
}

/* ════════════════════
   EXPOR AO ESCOPO GLOBAL
   (necessário para handlers inline no HTML)
════════════════════ */
window.switchPage           = switchPage;
window.setTheme             = setTheme;
window.initTheme            = initTheme;
window.showLoginScreen      = showLoginScreen;
window.showRegisterScreen   = showRegisterScreen;
window.showOnboardingScreen = showOnboardingScreen;
window.toast                = toast;
window.openSheet            = openSheet;
window.closeSheet           = closeSheet;
window.closeSheetOutside    = closeSheetOutside;
window.toggleHide           = toggleHide;
window.maskCNPJ             = maskCNPJ;
window.maskCPF              = maskCPF;
window.maskFone             = maskFone;
