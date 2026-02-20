/* ════════════════════════════════════════════════
   MAIN-SUPABASE.JS — sem módulos ES
════════════════════════════════════════════════ */

let _company      = null;
let _nfData       = [];
let _extratoData  = [];
let _impostosData = [];
let _prolaboreData= [];
let _justRegistered = false;

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);
  sbOnAuthChange(async (event, user) => {
    if (_justRegistered) return; // evita initApp durante fluxo de registro
    if (user) await initApp();
    else { showLoading(false); showLoginScreen(true); }
  });
  const user = await sbGetUser();
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
    setTimeout(() => { buildHomeChart(); document.getElementById('sBar').style.width = '35.4%'; }, 200);
    showLoginScreen(false);
    showLoading(false);
  } catch (err) {
    console.error('initApp error:', err);
    if (err.code === 'PGRST116') {
      showLoading(false); showLoginScreen(false); openSheet('sheet-onboarding');
    } else {
      toast('❌', 'Erro ao carregar: ' + err.message);
      showLoading(false);
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
  if (pass.length < 6) { toast('⚠️', 'A senha deve ter ao menos 6 caracteres'); return; }
  try {
    _justRegistered = true;
    showLoading(true);
    const user = await sbRegister(email, pass);
    showLoading(false);
    if (user && user.identities && user.identities.length === 0) {
      // e-mail já cadastrado
      toast('⚠️', 'E-mail já cadastrado. Faça login.');
      _justRegistered = false;
      return;
    }
    // Mostra feedback de sucesso na tela de login
    showRegisterSuccess();
    toast('🎉', 'Conta criada! Verifique seu e-mail.');
  } catch (err) {
    _justRegistered = false;
    showLoading(false);
    toast('❌', err.message);
  }
}

function showRegisterSuccess() {
  const loginBox = document.querySelector('#login-screen > div');
  if (!loginBox) return;
  loginBox.innerHTML = `
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:40px;margin-bottom:12px">📧</div>
      <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:var(--text1);letter-spacing:1px;margin-bottom:8px">CONTA CRIADA!</div>
      <div style="font-family:var(--f-mono);font-size:10px;color:var(--muted);letter-spacing:.5px;line-height:1.6">Enviamos um e-mail de confirmação.<br>Clique no link e depois faça login.</div>
    </div>
    <button onclick="location.reload()" style="width:100%;padding:13px;background:var(--accent);border:none;border-radius:10px;color:#fff;font-family:var(--f-mono);font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;margin-top:16px">VOLTAR AO LOGIN</button>
  `;
}

async function doLogout() {
  await sbLogout();
  location.reload();
}

/* ── ONBOARDING ── */
async function cadastrarEmpresa() {
  const name  = document.getElementById('ob-name')?.value;
  const cnpj  = document.getElementById('ob-cnpj')?.value;
  const porte = document.getElementById('ob-porte')?.value || 'ME';
  if (!name || !cnpj) { toast('⚠️', 'Preencha nome e CNPJ'); return; }
  try {
    _company = await createCompany({ name, cnpj, porte });
    closeSheet('sheet-onboarding');
    applyCompanyData(_company);
    toast('🎉', 'Empresa cadastrada!');
    await loadAllData();
    buildNFList(); buildExtrato(); buildTaxList(); buildPLHist();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
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
