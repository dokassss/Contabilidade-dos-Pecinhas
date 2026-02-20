/* ════════════════════════════════════════════════
   MAIN-SUPABASE.JS — sem módulos ES
════════════════════════════════════════════════ */

let _company      = null;
let _nfData       = [];
let _extratoData  = [];
let _impostosData = [];
let _prolaboreData= [];
let _authReady    = false;

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);

  // Listener de mudança de auth — ignora o disparo inicial (tratado abaixo)
  sbOnAuthChange(async (event, user) => {
    if (!_authReady) return;
    // Se onboarding já está visível, não fazer nada
    const ob = document.getElementById('onboarding-screen');
    if (ob && ob.style.display === 'flex') return;
    if (event === 'SIGNED_IN') await initApp();
    else if (event === 'SIGNED_OUT') { showLoginScreen(true); }
  });

  // Verifica sessão existente
  const user = await sbGetUser();
  _authReady = true;
  if (user) await initApp();
  else { showLoading(false); showLoginScreen(true); }
});

/* ── INIT APP ── */
async function initApp() {
  showLoading(true);
  try {
    _company = await fetchCompany();
    applyCompanyData(_company);
    applyDefaultType(_company.porte || 'EPP');
    await loadAllData();
    document.getElementById('ni-home').classList.add('active');
    buildNFList(); buildExtrato(); buildPagar(); buildReceber();
    buildTaxList(); buildCalendar(); buildPLHist();
    const sBarWidth = (_company.porte === 'MEI') ? '34.6%' : '35.4%';
    setTimeout(() => { buildHomeChart(); document.getElementById('sBar').style.width = sBarWidth; }, 200);
    showLoginScreen(false);
    showOnboardingScreen(false);
    showLoading(false);
  } catch (err) {
    console.error('initApp error:', err);
    showLoading(false);
    if (err.code === 'PGRST116' || (err.message && err.message.includes('0 rows'))) {
      showLoginScreen(false);
      showOnboardingScreen(true);
    } else {
      toast('❌', 'Erro ao carregar: ' + err.message);
      showLoginScreen(true);
    }
  }
}

/* ── LOAD DATA ── */
async function loadAllData() {
  const [nfs, extrato, impostos, prolabore] = await Promise.all([
    fetchNFs(), fetchExtrato(), fetchImpostos(), fetchProlabore()
  ]);
  _nfData = nfs; _extratoData = extrato; _impostosData = impostos; _prolaboreData = prolabore;
  NFs.length = 0;      NFs.push(..._nfData);
  EXTRATO.length = 0;  EXTRATO.push(..._extratoData);
  IMPOSTOS.length = 0; IMPOSTOS.push(..._impostosData);
  PL_HIST.length = 0;  PL_HIST.push(..._prolaboreData);
}

/* ── EMPRESA ── */
function applyCompanyData(company) {
  if (!company) return;
  const s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  s('idCompanyName', company.name);
  s('idCnpj', 'CNPJ · ' + company.cnpj);
  s('idPorte', company.porte);
  s('idRegime', company.regime === 'simples' ? 'Simples Nacional' : company.regime);
  s('companyTypeBadge', company.porte);
}

/* ── AUTH ── */
async function doLogin() {
  const email = document.getElementById('login-email')?.value;
  const pass  = document.getElementById('login-pass')?.value;
  if (!email || !pass) { toast('⚠️', 'Preencha e-mail e senha'); return; }
  try {
    showLoading(true);
    await sbLogin(email, pass);
  } catch (err) {
    showLoading(false);
    toast('❌', 'Login inválido: ' + err.message);
  }
}

async function doRegister() {
  const email = document.getElementById('login-email')?.value?.trim();
  const pass  = document.getElementById('login-pass')?.value;
  if (!email || !pass) { toast('⚠️', 'Preencha e-mail e senha'); return; }
  if (pass.length < 6) { toast('⚠️', 'Senha deve ter ao menos 6 caracteres'); return; }

  showLoading(true);
  try {
    const { data, error } = await sb.auth.signUp({ email, password: pass });
    showLoading(false);

    if (error) {
      toast('❌', error.message);
      return;
    }

    const user = data?.user;
    if (!user) {
      toast('❌', 'Erro inesperado. Tente novamente.');
      return;
    }

    // E-mail já cadastrado (Supabase retorna user com identities vazia)
    if (user.identities && user.identities.length === 0) {
      toast('⚠️', 'E-mail já cadastrado. Faça login.');
      return;
    }

    // Usuário já confirmado (confirmação de e-mail desativada no projeto)
    const isConfirmed = !!(user.confirmed_at || user.email_confirmed_at);
    if (isConfirmed) {
      showLoginScreen(false);
      showOnboardingScreen(true);
      return;
    }

    // Confirmação de e-mail necessária
    showRegisterSuccess();

  } catch (err) {
    showLoading(false);
    toast('❌', err.message || 'Erro ao criar conta');
  }
}

function showRegisterSuccess() {
  const loginBox = document.querySelector('#login-screen > div');
  if (!loginBox) return;
  loginBox.innerHTML = `
    <div style="text-align:center;padding:16px 0 8px">
      <div style="font-size:40px;margin-bottom:12px">📧</div>
      <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:var(--bright);letter-spacing:1px;margin-bottom:10px">CONFIRME SEU E-MAIL</div>
      <div style="font-family:var(--f-mono);font-size:10px;color:var(--muted);letter-spacing:.5px;line-height:1.8">Enviamos um link de confirmação.<br>Clique no link e depois faça login aqui.</div>
    </div>
    <button onclick="location.reload()" style="width:100%;padding:13px;background:var(--accent);border:none;border-radius:10px;color:#fff;font-family:var(--f-mono);font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;margin-top:8px">IR PARA O LOGIN</button>
  `;
}

async function doLogout() {
  await sbLogout();
  location.reload();
}

/* ── ONBOARDING ── */
function showOnboardingScreen(visible) {
  const el = document.getElementById('onboarding-screen');
  if (el) el.style.display = visible ? 'flex' : 'none';
}
window.showOnboardingScreen = showOnboardingScreen;

window.obSelectTipo = function(tipo) {
  document.getElementById('ob-porte').value = tipo;
  ['MEI','ME','EPP'].forEach(t => {
    const card = document.getElementById('ob-card-' + t.toLowerCase());
    if (card) card.style.border = t === tipo ? '2px solid var(--accent)' : '2px solid var(--border)';
  });
};

window.obNextStep = function(step) {
  if (step === 3) {
    const name = document.getElementById('ob-name')?.value?.trim();
    const cnpj = document.getElementById('ob-cnpj')?.value?.trim();
    if (!name) { toast('⚠️', 'Digite o nome da empresa'); return; }
    if (!cnpj || cnpj.length < 14) { toast('⚠️', 'Digite um CNPJ válido'); return; }
    const porte = document.getElementById('ob-porte').value;
    document.getElementById('ob-confirm-porte').textContent = porte;
    document.getElementById('ob-confirm-nome').textContent = name;
    document.getElementById('ob-confirm-cnpj').textContent = cnpj;
    document.getElementById('ob-confirm-regime').textContent = porte === 'MEI' ? 'MEI Simples' : 'Simples Nacional';
  }
  [1,2,3].forEach(i => {
    document.getElementById('ob-step-' + i).style.display = i === step ? 'block' : 'none';
    const bar = document.getElementById('ob-step-bar-' + i);
    if (bar) bar.style.background = i <= step ? 'var(--accent)' : 'var(--border2)';
  });
};

async function cadastrarEmpresa() {
  const name   = document.getElementById('ob-name')?.value?.trim();
  const cnpj   = document.getElementById('ob-cnpj')?.value?.trim();
  const porte  = document.getElementById('ob-porte')?.value || 'ME';
  if (!name || !cnpj) { toast('⚠️', 'Preencha nome e CNPJ'); return; }
  try {
    showLoading(true);
    _company = await createCompany({ name, cnpj, porte });
    showOnboardingScreen(false);
    applyCompanyData(_company);
    applyDefaultType(porte);
    await loadAllData();
    document.getElementById('ni-home').classList.add('active');
    buildNFList(); buildExtrato(); buildPagar(); buildReceber();
    buildTaxList(); buildCalendar(); buildPLHist();
    const sBarWidth = (porte === 'MEI') ? '34.6%' : '35.4%';
    setTimeout(() => { buildHomeChart(); document.getElementById('sBar').style.width = sBarWidth; }, 200);
    showLoading(false);
    toast('🎉', 'Empresa cadastrada! Bem-vindo!');
  } catch (err) {
    showLoading(false);
    toast('❌', 'Erro: ' + err.message);
  }
}

/* ── NF ── */
window.emitirNF = async function() {
  const numero  = document.getElementById('nf-numero')?.value;
  const cliente = document.getElementById('nf-cliente')?.value;
  const valor   = document.getElementById('nf-valor')?.value;
  const tipo    = document.getElementById('nf-tipo')?.value || 'NFS-e';
  if (!numero || !cliente || !valor) { toast('⚠️', 'Preencha todos os campos'); return; }
  try {
    await createNF({ numero, cliente, tipo, valor: parseFloat(valor.replace(',','.')), data_emissao: new Date().toISOString().slice(0,10) });
    closeSheet('sheet-nf'); toast('🚀', 'Nota fiscal emitida!');
    _nfData = await fetchNFs(); NFs.length = 0; NFs.push(..._nfData); buildNFList();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

/* ── IMPOSTOS ── */
window.marcarImpostoPago = async function(uuid) {
  try {
    await pagarImposto(uuid); toast('✅', 'Imposto marcado como pago!');
    _impostosData = await fetchImpostos(); IMPOSTOS.length = 0; IMPOSTOS.push(..._impostosData); buildTaxList();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

/* ── PRÓ-LABORE ── */
window.marcarPLPago = async function(uuid) {
  try {
    await marcarProlaborePago(uuid); toast('✅', 'Pró-labore pago!');
    _prolaboreData = await fetchProlabore(); PL_HIST.length = 0; PL_HIST.push(..._prolaboreData); buildPLHist();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

/* ── TIPO DE EMPRESA ── */
window.selectCompanyType = async function(type, btn) {
  companyType = type;
  document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const d = COMPANY_DATA[type];
  document.getElementById('idCompanyName').textContent = _company?.name || d.name;
  document.getElementById('idCnpj').textContent = 'CNPJ · ' + (_company?.cnpj || '00.000.000/0001-00');
  document.getElementById('idPorte').textContent = d.porte;
  document.getElementById('idRegime').textContent = d.regime;
  document.getElementById('idTypeBadge').textContent = d.badge;
  document.getElementById('companyTypeBadge').textContent = type;
  document.getElementById('niPlLabel').textContent = d.navLabel;
  document.getElementById('plPageTitle').textContent = d.pageTitle;
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
  toast('✅', 'Visualizando como ' + type);
  if (_company?.id) { try { await saveCompany({ id: _company.id, porte: type }); } catch(e) {} }
};

/* ── UI HELPERS ── */
function showLoading(visible) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = visible ? 'flex' : 'none';
}
function showLoginScreen(visible) {
  const loginEl = document.getElementById('login-screen');
  const appEl   = document.getElementById('phone');
  if (!loginEl || !appEl) return;
  loginEl.style.display = visible ? 'flex' : 'none';
  appEl.style.display   = visible ? 'none' : '';
}
