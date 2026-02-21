/* ════════════════════════════════════════════════
   MAIN-SUPABASE.JS
════════════════════════════════════════════════ */

let _company      = null;
let _nfData       = [];
let _extratoData  = [];
let _impostosData = [];
let _prolaboreData= [];
let _authReady    = false;

/* ════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);

  sbOnAuthChange(async (event, user) => {
    if (!_authReady) return;
    if (event === 'SIGNED_IN')  await initApp();
    if (event === 'SIGNED_OUT') showLoginScreen(true);
  });

  const user = await sbGetUser();
  _authReady = true;

  if (user) {
    await initApp();
  } else {
    showLoading(false);
    showLoginScreen(true);
  }
});

/* ════════════════════════════════════════════════
   INIT APP (usuário já logado)
════════════════════════════════════════════════ */
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
    const w = (_company.porte === 'MEI') ? '34.6%' : '35.4%';
    setTimeout(() => { buildHomeChart(); document.getElementById('sBar').style.width = w; }, 200);
    showLoginScreen(false);
    showOnboardingScreen(false);
    showLoading(false);
  } catch (err) {
    showLoading(false);
    if (err.code === 'PGRST116' || (err.message && err.message.includes('0 rows'))) {
      // Logado mas sem empresa — não deveria acontecer no fluxo novo
      // mas trata por segurança
      showLoginScreen(false);
      showOnboardingScreen(true);
    } else {
      toast('❌', 'Erro ao carregar: ' + err.message);
      showLoginScreen(true);
    }
  }
}

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

function applyCompanyData(c) {
  if (!c) return;
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('idCompanyName', c.name);
  s('idCnpj', 'CNPJ · ' + c.cnpj);
  s('idPorte', c.porte);
  s('idRegime', c.regime === 'simples' ? 'Simples Nacional' : c.regime);
  s('companyTypeBadge', c.porte);
}

/* ════════════════════════════════════════════════
   LOGIN (tela de login → entra no app)
════════════════════════════════════════════════ */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { toast('⚠️', 'Preencha e-mail e senha'); return; }
  try {
    showLoading(true);
    await sbLogin(email, pass);
    // onAuthStateChange → initApp
  } catch (err) {
    showLoading(false);
    toast('❌', 'Login inválido: ' + err.message);
  }
}

async function doLogout() {
  await sbLogout();
  location.reload();
}

window.doLogin = doLogin;
window.doLogout = doLogout;

/* ════════════════════════════════════════════════
   CRIAR CONTA — só abre o onboarding
════════════════════════════════════════════════ */
function doRegister() {
  showOnboardingScreen(true);
}

window.doRegister = doRegister;

/* ════════════════════════════════════════════════
   ONBOARDING
   Fluxo: step1(porte) → step2(email+senha+empresa) → step3(resumo) → cadastrar
   Ao fim: signUp + cria empresa + mostra tela "confirme seu email"
   Usuário confirma email → faz login na tela de login → initApp
════════════════════════════════════════════════ */

function showOnboardingScreen(visible) {
  const el = document.getElementById('onboarding-screen');
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
  if (visible) obNextStep(1); // sempre começa do step 1
}
window.showOnboardingScreen = showOnboardingScreen;

window.obSelectTipo = function(tipo) {
  document.getElementById('ob-porte').value = tipo;
  ['MEI','ME','EPP'].forEach(t => {
    const card = document.getElementById('ob-card-' + t.toLowerCase());
    if (card) card.style.border = (t === tipo)
      ? '2px solid var(--accent)'
      : '2px solid var(--border)';
  });
};

window.obNextStep = function(step) {
  // Validações ao avançar para o step 3
  if (step === 3) {
    const email = document.getElementById('ob-email').value.trim();
    const pass  = document.getElementById('ob-pass').value;
    const name  = document.getElementById('ob-name').value.trim();
    const cnpj  = document.getElementById('ob-cnpj').value.trim();
    if (!email || !email.includes('@')) { toast('⚠️', 'Digite um e-mail válido'); return; }
    if (!pass || pass.length < 6)       { toast('⚠️', 'Senha precisa ter pelo menos 6 caracteres'); return; }
    if (!name)                           { toast('⚠️', 'Digite o nome da empresa'); return; }
    if (!cnpj || cnpj.replace(/\D/g,'').length < 14) { toast('⚠️', 'Digite um CNPJ válido'); return; }
    // Popula resumo
    const porte = document.getElementById('ob-porte').value;
    document.getElementById('ob-confirm-porte').textContent  = porte;
    document.getElementById('ob-confirm-nome').textContent   = name;
    document.getElementById('ob-confirm-cnpj').textContent   = cnpj;
    document.getElementById('ob-confirm-regime').textContent = (porte === 'MEI') ? 'DAS-MEI (fixo)' : 'Simples Nacional';
    document.getElementById('ob-confirm-email').textContent  = email;
  }
  // Troca o step visível e atualiza barra de progresso
  [1,2,3].forEach(i => {
    document.getElementById('ob-step-' + i).style.display = (i === step) ? 'block' : 'none';
    const bar = document.getElementById('ob-step-bar-' + i);
    if (bar) bar.style.background = (i <= step) ? 'var(--accent)' : 'var(--border2)';
  });
};

window.obCancelar = function() {
  showOnboardingScreen(false);
  showLoginScreen(true);
};

async function cadastrarEmpresa() {
  const email = document.getElementById('ob-email').value.trim();
  const pass  = document.getElementById('ob-pass').value;
  const name  = document.getElementById('ob-name').value.trim();
  const cnpj  = document.getElementById('ob-cnpj').value.trim();
  const porte = document.getElementById('ob-porte').value || 'ME';

  showLoading(true);
  try {
    // 1. Cria conta no Supabase Auth
    const { data, error } = await sb.auth.signUp({ email, password: pass });
    if (error) throw error;

    const user = data?.user;

    // Email já cadastrado
    if (!user || (user.identities && user.identities.length === 0)) {
      showLoading(false);
      toast('⚠️', 'E-mail já cadastrado. Faça login.');
      showOnboardingScreen(false);
      showLoginScreen(true);
      return;
    }

    // 2. Cria a empresa (funciona com ou sem confirmação de email ativada)
    //    Se email confirm estiver ON, o usuário ainda não está logado —
    //    salvamos os dados para criar a empresa após o primeiro login.
    const isConfirmed = !!(user.confirmed_at || user.email_confirmed_at);

    if (isConfirmed) {
      // Email confirm OFF — já está logado, cria empresa agora
      await createCompany({ name, cnpj, porte });
    } else {
      // Email confirm ON — salva dados para criar após confirmar
      try { localStorage.setItem('_pendingCompany', JSON.stringify({ name, cnpj, porte })); } catch(e) {}
    }

    showLoading(false);
    showOnboardingScreen(false);
    mostrarConfirmacaoEmail(email);

  } catch (err) {
    showLoading(false);
    toast('❌', err.message || 'Erro ao criar conta');
  }
}

function mostrarConfirmacaoEmail(email) {
  // Mostra tela de login com mensagem de "confirme seu email"
  showLoginScreen(true);
  const box = document.getElementById('login-box');
  if (!box) return;
  box.innerHTML = `
    <div style="text-align:center;padding:8px 0 16px">
      <div style="font-size:48px;margin-bottom:16px">📧</div>
      <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:var(--bright);letter-spacing:1px;margin-bottom:12px">
        CONFIRME SEU E-MAIL
      </div>
      <div style="font-family:var(--f-mono);font-size:10px;color:var(--muted);line-height:2;margin-bottom:16px">
        Enviamos um link para<br>
        <span style="color:var(--accent)">${email}</span><br>
        Clique no link e depois faça login.
      </div>
    </div>
    <button onclick="location.reload()" style="width:100%;padding:13px;background:var(--accent);border:none;border-radius:10px;color:#fff;font-family:var(--f-mono);font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;">
      IR PARA O LOGIN
    </button>
  `;
}

/* ════════════════════════════════════════════════
   NF / IMPOSTOS / PRÓ-LABORE
════════════════════════════════════════════════ */
window.emitirNF = async function() {
  const numero  = document.getElementById('nf-numero')?.value;
  const cliente = document.getElementById('nf-cliente')?.value;
  const valor   = document.getElementById('nf-valor')?.value;
  const tipo    = document.getElementById('nf-tipo')?.value || 'NFS-e';
  if (!numero || !cliente || !valor) { toast('⚠️', 'Preencha todos os campos'); return; }
  try {
    await createNF({ numero, cliente, tipo, valor: parseFloat(valor.replace(',','.')), data_emissao: new Date().toISOString().slice(0,10) });
    closeSheet('sheet-nf');
    toast('🚀', 'Nota fiscal emitida!');
    _nfData = await fetchNFs(); NFs.length = 0; NFs.push(..._nfData); buildNFList();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

window.marcarImpostoPago = async function(uuid) {
  try {
    await pagarImposto(uuid);
    toast('✅', 'Imposto marcado como pago!');
    _impostosData = await fetchImpostos(); IMPOSTOS.length = 0; IMPOSTOS.push(..._impostosData); buildTaxList();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

window.marcarPLPago = async function(uuid) {
  try {
    await marcarProlaborePago(uuid);
    toast('✅', 'Pró-labore pago!');
    _prolaboreData = await fetchProlabore(); PL_HIST.length = 0; PL_HIST.push(..._prolaboreData); buildPLHist();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

/* ════════════════════════════════════════════════
   TIPO DE EMPRESA (seletor de preview)
════════════════════════════════════════════════ */
window.selectCompanyType = async function(type, btn) {
  companyType = type;
  document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const d = COMPANY_DATA[type];
  document.getElementById('idCompanyName').textContent  = _company?.name || d.name;
  document.getElementById('idCnpj').textContent         = 'CNPJ · ' + (_company?.cnpj || '00.000.000/0001-00');
  document.getElementById('idPorte').textContent        = d.porte;
  document.getElementById('idRegime').textContent       = d.regime;
  document.getElementById('idTypeBadge').textContent    = d.badge;
  document.getElementById('companyTypeBadge').textContent = type;
  document.getElementById('niPlLabel').textContent      = d.navLabel;
  document.getElementById('plPageTitle').textContent    = d.pageTitle;
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

/* ════════════════════════════════════════════════
   UI HELPERS
════════════════════════════════════════════════ */
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
