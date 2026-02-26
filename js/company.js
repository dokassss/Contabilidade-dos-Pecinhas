/* ════════════════════
   COMPANY TYPE (preview selector)
════════════════════ */
let companyType = 'EPP'; // default

const COMPANY_DATA = {
  MEI: {
    name: 'Minha Empresa',      // fallback quando _activeCompany for null
    cnpj: '00.000.000/0001-00', // fallback — substituído por dados reais em selectCompanyType()
    porte: 'MEI',
    regime: 'DAS-MEI (fixo)',
    badge: 'MEI',
    navLabel: 'MEI',
    pageTitle: 'Informações MEI',
  },
  ME: {
    name: 'Minha Empresa',
    cnpj: '00.000.000/0001-00',
    porte: 'ME',
    regime: 'Simples Nacional',
    badge: 'ME',
    navLabel: 'FATOR R',
    pageTitle: 'Pró-labore',
  },
  EPP: {
    name: 'Minha Empresa',
    cnpj: '00.000.000/0001-00',
    porte: 'EPP',
    regime: 'Simples Nacional',
    badge: 'EPP',
    navLabel: 'FATOR R',
    pageTitle: 'Pró-labore',
  },
};

/*
 * IDs do DOM manipulados por applyDefaultType().
 * Centralizado aqui para facilitar manutenção caso os IDs mudem no HTML.
 */
const APPLY_TYPE_DOM_IDS = {
  meiContent  : 'pl-mei-content',  // bloco visível quando porte === MEI
  fullContent : 'pl-full-content', // bloco visível quando porte !== MEI
  frAlert     : 'frAlert',         // alerta do Fator R (oculto no MEI)
  sBar        : 'sBar',            // barra de alíquota
  navLabel    : 'niPlLabel',       // label do item de nav (MEI vs FATOR R)
  pageTitle   : 'plPageTitle',     // título da aba de pró-labore
};

function applyDefaultType(type) {
  type = type || 'EPP';

  // Ativa a pill correta
  document.querySelectorAll('.type-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.type === type);
  });

  const ids = APPLY_TYPE_DOM_IDS;

  const meiContent  = document.getElementById(ids.meiContent);
  const fullContent = document.getElementById(ids.fullContent);
  const frAlert     = document.getElementById(ids.frAlert);
  const sBar        = document.getElementById(ids.sBar);

  if (type === 'MEI') {
    if (meiContent)  meiContent.style.display  = 'block';
    if (fullContent) fullContent.style.display = 'none';
    if (frAlert)     frAlert.style.display     = 'none';
    if (sBar)        sBar.style.width          = '34.6%';
  } else {
    if (meiContent)  meiContent.style.display  = 'none';
    if (fullContent) fullContent.style.display = 'block';
    if (frAlert)     frAlert.style.display     = 'flex';
    if (sBar)        sBar.style.width          = '35.4%';
  }

  const d = COMPANY_DATA[type] || COMPANY_DATA['EPP'];

  const navLabelEl  = document.getElementById(ids.navLabel);
  const pageTitleEl = document.getElementById(ids.pageTitle);
  if (navLabelEl)  navLabelEl.textContent  = d.navLabel;
  if (pageTitleEl) pageTitleEl.textContent = d.pageTitle;

  companyType = type;
}

// selectCompanyType é exposto em main-supabase.js (window.selectCompanyType = async function...)
