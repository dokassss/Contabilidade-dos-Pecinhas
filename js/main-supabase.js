/* ════════════════════════════════════════════════
   MAIN-SUPABASE.JS
   
   FLUXO DE AUTENTICAÇÃO:
   1. Cadastro pessoal (nome, nascimento, email, cpf, telefone, senha)
   2. Confirma email → faz login
   3. Dentro do app, cria empresas vinculadas à conta
   4. Home mostra dados consolidados de todas as empresas
════════════════════════════════════════════════ */

let _profile       = null; // dados pessoais do usuário logado
let _companies     = [];   // todas as empresas do usuário
let _activeCompany = null; // empresa selecionada nas abas (null = todas)
let _nfData        = [];
let _extratoData   = [];
let _impostosData  = [];
let _prolaboreData = [];

/* ════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);

  // Só monitora SIGNED_OUT — para deslogar se sessão expirar em outra aba
  sbOnAuthChange((event) => {
    if (event === 'SIGNED_OUT') {
      _profile = null;
      _companies = [];
      showLoginScreen(true);
    }
  });

  const user = await sbGetUser();

  if (user) {
    await initApp();
  } else {
    showLoading(false);
    showLoginScreen(true);
  }
});

/* ════════════════════════════════════════════════
   INIT APP
════════════════════════════════════════════════ */
async function initApp() {
  showLoading(true);
  try {
    // Carrega perfil pessoal do usuário
    _profile    = await fetchProfile();
    _companies  = await fetchCompanies();

    // Usa a primeira empresa como ativa por padrão (se houver)
    _activeCompany = _companies.length > 0 ? _companies[0] : null;

    if (_activeCompany) {
      applyCompanyData(_activeCompany);
      applyDefaultType(_activeCompany.porte || 'EPP');
    }

    await loadAllData();

    document.getElementById('ni-home').classList.add('active');
    buildNFList();
    buildExtrato();
    buildPagar();
    buildReceber();
    buildTaxList();
    buildCalendar();
    buildPLHist();

    const w = (_activeCompany?.porte === 'MEI') ? '34.6%' : '35.4%';
    setTimeout(() => {
      buildHomeChart();
      document.getElementById('sBar').style.width = w;
    }, 200);

    // Se não tem empresa ainda, mostra banner de boas-vindas (não bloqueia o app)
    if (_companies.length === 0) {
      showNenhumaEmpresaBanner(true);
    }

    showLoginScreen(false);
    showOnboardingScreen(false);
    showRegisterScreen(false);
    showLoading(false);

  } catch (err) {
    showLoading(false);
    console.error('[initApp]', err);
    toast('❌', 'Erro ao carregar: ' + (err.message || err));
    showLoginScreen(true);
  }
}

async function loadAllData() {
  const companyId = _activeCompany?.id || null;
  const [nfs, extrato, impostos, prolabore] = await Promise.all([
    fetchNFs({ companyId }).catch(e => { console.warn('fetchNFs:', e); return []; }),
    fetchExtrato({ companyId }).catch(e => { console.warn('fetchExtrato:', e); return []; }),
    fetchImpostos({ companyId }).catch(e => { console.warn('fetchImpostos:', e); return []; }),
    fetchProlabore({ companyId }).catch(e => { console.warn('fetchProlabore:', e); return []; }),
  ]);

  _nfData        = nfs;
  _extratoData   = extrato;
  _impostosData  = impostos;
  _prolaboreData = prolabore;

  NFs.length = 0;      NFs.push(..._nfData);
  EXTRATO.length = 0;  EXTRATO.push(..._extratoData);
  IMPOSTOS.length = 0; IMPOSTOS.push(..._impostosData);
  PL_HIST.length = 0;  PL_HIST.push(..._prolaboreData);
}

function applyCompanyData(c) {
  if (!c) return;
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('idCompanyName',     c.name);
  s('idCnpj',           'CNPJ · ' + c.cnpj);
  s('idPorte',          c.porte);
  s('idRegime',         c.regime === 'simples' ? 'Simples Nacional' : c.regime);
  s('companyTypeBadge', c.porte);
}

function showNenhumaEmpresaBanner(visible) {
  // Banner não bloqueante: aparece no topo do app quando não há empresa
  let banner = document.getElementById('no-company-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'no-company-banner';
    banner.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:999;width:100%;max-width:390px;background:var(--accent);padding:10px 16px;font-family:var(--f-mono);font-size:10px;color:#fff;text-align:center;cursor:pointer;letter-spacing:.5px;';
    banner.textContent = '+ Adicione sua primeira empresa para começar';
    banner.onclick = () => showAddCompanySheet(true);
    document.body.appendChild(banner);
  }
  banner.style.display = visible ? 'block' : 'none';
}

/* ════════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════════ */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { toast('⚠️', 'Preencha e-mail e senha'); return; }
  try {
    showLoading(true);
    await sbLogin(email, pass);
    await initApp();
  } catch (err) {
    showLoading(false);
    toast('❌', 'Login inválido: ' + err.message);
  }
}

async function doLogout() {
  await sbLogout();
  _profile = null;
  _companies = [];
  showLoginScreen(true);
}

window.doLogin  = doLogin;
window.doLogout = doLogout;

/* ════════════════════════════════════════════════
   CADASTRO PESSOAL
   Tela separada do login — coleta dados pessoais,
   cria conta no Supabase Auth + perfil na tabela profiles.
   Depois confirma email → faz login → adiciona empresa dentro do app.
════════════════════════════════════════════════ */
function doRegister() {
  showRegisterScreen(true);
}
window.doRegister = doRegister;

function showRegisterScreen(visible) {
  const el = document.getElementById('register-screen');
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
  if (visible) showLoginScreen(false);
}
window.showRegisterScreen = showRegisterScreen;

async function doCreateAccount() {
  const nome       = document.getElementById('reg-nome').value.trim();
  const nascimento = document.getElementById('reg-nascimento').value.trim();
  const email      = document.getElementById('reg-email').value.trim();
  const cpf        = document.getElementById('reg-cpf').value.trim();
  const telefone   = document.getElementById('reg-telefone').value.trim();
  const senha      = document.getElementById('reg-senha').value;

  if (!nome)                                              { toast('⚠️', 'Digite seu nome completo'); return; }
  if (!nascimento)                                        { toast('⚠️', 'Digite sua data de nascimento'); return; }
  if (!email || !email.includes('@'))                     { toast('⚠️', 'Digite um e-mail válido'); return; }
  if (!cpf || cpf.replace(/\D/g,'').length < 11)         { toast('⚠️', 'Digite um CPF válido'); return; }
  if (!telefone || telefone.replace(/\D/g,'').length < 10){ toast('⚠️', 'Digite um telefone válido'); return; }
  if (!senha || senha.length < 6)                        { toast('⚠️', 'Senha precisa ter pelo menos 6 caracteres'); return; }

  showLoading(true);
  try {
    // 1. Cria conta no Supabase Auth com dados pessoais no metadata
    const { data, error } = await sb.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, nascimento, cpf, telefone } // salvo no user_metadata
      }
    });
    if (error) throw error;

    const user = data?.user;

    // Email já cadastrado
    if (!user || (user.identities && user.identities.length === 0)) {
      showLoading(false);
      toast('⚠️', 'E-mail já cadastrado. Faça login.');
      showRegisterScreen(false);
      showLoginScreen(true);
      return;
    }

    const isConfirmed = !!(user.confirmed_at || user.email_confirmed_at);

    if (isConfirmed) {
      // Email confirm OFF no Supabase — já logado, cria perfil e entra
      await createProfile({ userId: user.id, nome, nascimento, cpf, telefone, email });
      showLoading(false);
      showRegisterScreen(false);
      await initApp();
    } else {
      // Email confirm ON — mostra tela de confirmação
      showLoading(false);
      showRegisterScreen(false);
      mostrarConfirmacaoEmail(email);
    }

  } catch (err) {
    showLoading(false);
    toast('❌', err.message || 'Erro ao criar conta');
  }
}
window.doCreateAccount = doCreateAccount;

function mostrarConfirmacaoEmail(email) {
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
   ADICIONAR EMPRESA (dentro do app, pós-login)
════════════════════════════════════════════════ */
function showAddCompanySheet(visible) {
  // Usa um sheet/modal dentro do app para adicionar empresa
  if (visible) {
    openSheet('sheet-add-company');
  } else {
    closeSheet('sheet-add-company');
  }
}
window.showAddCompanySheet = showAddCompanySheet;

async function doAddCompany() {
  const name  = document.getElementById('add-company-name').value.trim();
  const cnpj  = document.getElementById('add-company-cnpj').value.trim();
  const porte = document.getElementById('add-company-porte').value || 'ME';

  if (!name)                                                    { toast('⚠️', 'Digite o nome da empresa'); return; }
  if (!cnpj || cnpj.replace(/\D/g,'').length < 14)             { toast('⚠️', 'Digite um CNPJ válido'); return; }

  showLoading(true);
  try {
    const newCompany = await createCompany({ name, cnpj, porte });
    _companies.push(newCompany);
    _activeCompany = newCompany;
    applyCompanyData(_activeCompany);
    applyDefaultType(_activeCompany.porte || 'EPP');
    closeSheet('sheet-add-company');
    showNenhumaEmpresaBanner(false);
    toast('✅', 'Empresa adicionada!');
    showLoading(false);
  } catch (err) {
    showLoading(false);
    toast('❌', err.message || 'Erro ao adicionar empresa');
  }
}
window.doAddCompany = doAddCompany;

/* ════════════════════════════════════════════════
   ONBOARDING LEGADO (mantido por compatibilidade
   mas não é mais o fluxo principal)
════════════════════════════════════════════════ */
function showOnboardingScreen(visible) {
  const el = document.getElementById('onboarding-screen');
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
}
window.showOnboardingScreen = showOnboardingScreen;

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
  document.getElementById('idCompanyName').textContent    = _activeCompany?.name || d.name;
  document.getElementById('idCnpj').textContent           = 'CNPJ · ' + (_activeCompany?.cnpj || '00.000.000/0001-00');
  document.getElementById('idPorte').textContent          = d.porte;
  document.getElementById('idRegime').textContent         = d.regime;
  document.getElementById('idTypeBadge').textContent      = d.badge;
  document.getElementById('companyTypeBadge').textContent = type;
  document.getElementById('niPlLabel').textContent        = d.navLabel;
  document.getElementById('plPageTitle').textContent      = d.pageTitle;
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
  if (_activeCompany?.id) { try { await saveCompany({ id: _activeCompany.id, porte: type }); } catch(e) {} }
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
  appEl.style.display   = visible ? 'none'  : '';
}
