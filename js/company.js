/* ════════════════════
   COMPANY TYPE (preview selector)
════════════════════ */
let companyType = 'EPP'; // default

const COMPANY_DATA = {
  MEI: {
    name: 'Fantinny Entretenimentos',
    cnpj: '12.345.678/0001-90',
    porte: 'MEI',
    regime: 'DAS-MEI (fixo)',
    badge: 'MEI',
    navLabel: 'MEI',
    pageTitle: 'Informações MEI',
  },
  ME: {
    name: 'Fantinny Entretenimentos',
    cnpj: '12.345.678/0001-90',
    porte: 'ME',
    regime: 'Simples Nacional',
    badge: 'ME',
    navLabel: 'FATOR R',
    pageTitle: 'Pró-labore',
  },
  EPP: {
    name: 'Fantinny Entretenimentos',
    cnpj: '12.345.678/0001-90',
    porte: 'EPP',
    regime: 'Simples Nacional',
    badge: 'EPP',
    navLabel: 'FATOR R',
    pageTitle: 'Pró-labore',
  },
};

function applyDefaultType(type) {
  type = type || 'EPP';
  // Activate correct pill
  document.querySelectorAll('.type-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.type === type);
  });
  if (type === 'MEI') {
    document.getElementById('pl-mei-content').style.display = 'block';
    document.getElementById('pl-full-content').style.display = 'none';
    const fa = document.getElementById('frAlert'); if (fa) fa.style.display = 'none';
    document.getElementById('sBar').style.width = '34.6%';
  } else {
    document.getElementById('pl-mei-content').style.display = 'none';
    document.getElementById('pl-full-content').style.display = 'block';
    const fa = document.getElementById('frAlert'); if (fa) fa.style.display = 'flex';
    document.getElementById('sBar').style.width = '35.4%';
  }
  const d = COMPANY_DATA[type] || COMPANY_DATA['EPP'];
  document.getElementById('niPlLabel').textContent = d.navLabel;
  document.getElementById('plPageTitle').textContent = d.pageTitle;
  companyType = type;
}

// selectCompanyType is exposed in main-supabase.js (window.selectCompanyType = async function...)
