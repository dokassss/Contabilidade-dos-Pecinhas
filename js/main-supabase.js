/* ════════════════════════════════════════════════
   MAIN-SUPABASE.JS  —  Orquestrador principal

   FLUXO DE AUTENTICAÇÃO:
   1. Cadastro pessoal (nome, nascimento, email, cpf, telefone, senha)
   2. Confirma email → faz login
   3. Dentro do app, cria empresas vinculadas à conta
   4. Home mostra dados consolidados de todas as empresas

   DEPENDÊNCIAS DOM (funções de tela):
   showLoginScreen / showRegisterScreen / showOnboardingScreen
   → definidas em ui.js e expostas via window.*
   → NÃO duplicar aqui — único ponto de verdade em ui.js

   ESTADO GLOBAL:
   _profile, _companies, _activeCompany, _kpis, NFs, EXTRATO,
   PAGAR, RECEBER, IMPOSTOS, PL_HIST, CASH, FR
   → declarados em state.js — não duplicar aqui.
════════════════════════════════════════════════ */

// Cache de módulo — variáveis internas não expostas ao escopo global
let _nfData        = [];
let _extratoData   = [];
let _impostosData  = [];
let _prolaboreData = [];
let _pagarData     = [];
let _receberData   = [];

/* ════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);

  // Só monitora SIGNED_OUT — para deslogar se sessão expirar em outra aba
  sbOnAuthChange((event) => {
    if (event === 'SIGNED_OUT') {
      _profile   = null;
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
    _profile   = await fetchProfile();
    _companies = await fetchCompanies();

    _activeCompany = _companies.length > 0 ? _companies[0] : null;

    // ── Saudação personalizada ──────────────────────────────────────
    if (_profile) {
      const hour       = new Date().getHours();
      const greet      = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
      const firstName  = (_profile.nome || _profile.email || '').split(' ')[0];
      const greetHello = document.getElementById('greet-hello');
      const greetName  = document.getElementById('greet-name');
      if (greetHello) greetHello.textContent = greet + ', ' + firstName + ' 👋';
      if (greetName)  greetName.textContent  = _profile.nome || _profile.email || '';
    }

    // ── Dados e UI da empresa ativa ─────────────────────────────────
    if (_activeCompany) {
      applyCompanyData(_activeCompany);
      applyDefaultType(_activeCompany.porte || 'EPP');
    }

    // ── Carrega todos os dados (inclui KPIs e CashFlow) ─────────────
    await loadAllData();

    // ── Marca aba home como ativa ───────────────────────────────────
    document.getElementById('ni-home').classList.add('active');

    // ── Build das listas ────────────────────────────────────────────
    buildNFList();
    buildExtrato();
    buildPagar();
    buildReceber();
    buildTaxList();
    buildCalendar();

    // CORREÇÃO: buildPLHist só faz sentido para ME/EPP.
    // MEI não possui pró-labore formal — renderizar a lista vazia
    // causaria confusão; a tela MEI já tem conteúdo próprio (#pl-mei-content).
    const porte = _activeCompany?.porte || 'EPP';
    if (porte !== 'MEI') {
      buildPLHist();
    }

    // CORREÇÃO: renderKPIs() deve ser chamado ANTES de buildHomeChart()
    // pois injeta os data-attributes (data-income / data-expense)
    // que buildHomeChart() consome para animar as barras.
    renderKPIs();

    const w = (porte === 'MEI') ? '34.6%' : '35.4%';
    setTimeout(() => {
      buildHomeChart(); // lê data-attributes injetados por renderKPIs()
      buildCFChart();
      document.getElementById('sBar').style.width = w;
    }, 200);

    // ── Banner sem empresa ──────────────────────────────────────────
    if (_companies.length === 0) {
      showNenhumaEmpresaBanner(true);
    }

    // ── Oculta telas de auth ────────────────────────────────────────
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

/* ════════════════════════════════════════════════
   LOAD ALL DATA
   Busca tudo em paralelo, com tratamento
   individual de erro para não travar a tela.
════════════════════════════════════════════════ */
async function loadAllData() {
  const companyId = _activeCompany?.id || null;

  const [nfs, extrato, impostos, prolabore, pagar, receber, kpis, cashFlow] = await Promise.all([
    fetchNFs({ companyId }).catch(e           => { console.warn('fetchNFs:', e);       return []; }),
    fetchExtrato({ companyId }).catch(e       => { console.warn('fetchExtrato:', e);   return []; }),
    fetchImpostos({ companyId }).catch(e      => { console.warn('fetchImpostos:', e);  return []; }),
    fetchProlabore({ companyId }).catch(e     => { console.warn('fetchProlabore:', e); return []; }),
    fetchPagar({ companyId }).catch(e         => { console.warn('fetchPagar:', e);     return []; }),
    fetchReceber({ companyId }).catch(e       => { console.warn('fetchReceber:', e);   return []; }),
    fetchKPIs({ companyId }).catch(e          => { console.warn('fetchKPIs:', e);      return null; }),
    fetchCashFlow({ companyId, months: 12 }).catch(e => { console.warn('fetchCashFlow:', e); return null; }),
  ]);

  _nfData        = nfs;
  _extratoData   = extrato;
  _impostosData  = impostos;
  _prolaboreData = prolabore;
  _pagarData     = pagar;
  _receberData   = receber;
  _kpis          = kpis;

  // Sincroniza arrays globais consumidos por pages.js / charts.js
  NFs.length = 0;      NFs.push(..._nfData);
  EXTRATO.length = 0;  EXTRATO.push(..._extratoData);
  IMPOSTOS.length = 0; IMPOSTOS.push(..._impostosData);
  PL_HIST.length = 0;  PL_HIST.push(..._prolaboreData);
  PAGAR.length = 0;    PAGAR.push(..._pagarData);
  RECEBER.length = 0;  RECEBER.push(..._receberData);

  // Atualiza CASH para charts.js
  if (cashFlow) {
    CASH.months  = cashFlow.months;
    CASH.income  = cashFlow.income;
    CASH.expense = cashFlow.expense;
  }
}

/* ════════════════════════════════════════════════
   RENDER KPIs
   Atualiza o DOM da home com dados reais do Supabase.
   DEVE ser chamado antes de buildHomeChart() pois
   injeta os data-attributes que o chart consome.
════════════════════════════════════════════════ */
function renderKPIs() {
  if (!_kpis) return;

  const { receita, despesa, resultado } = _kpis;
  // fmtKPI / fmtSimples / fmtK — definidas globalmente em charts.js (carrega antes)

  // ── Resultado do mês ──────────────────────────────────────────────
  const resultEl = document.querySelector('.cfe-result-val');
  if (resultEl) {
    resultEl.innerHTML   = fmtKPI(resultado);
    resultEl.dataset.raw = Math.round(resultado);
    resultEl.className   = 'cfe-result-val val ' + (resultado >= 0 ? 'pos' : 'neg');
  }

  // Margem %
  const margemEl = document.querySelector('.cfe-result-sub strong');
  if (margemEl && receita > 0) {
    const margem = ((resultado / receita) * 100).toFixed(1);
    margemEl.textContent = margem + '%';
    margemEl.dataset.raw = margem + 'pct';
  }

  // ── Entradas ──────────────────────────────────────────────────────
  const incValEl = document.querySelector('.cfe-row:first-child .cfe-row-val');
  if (incValEl) {
    incValEl.innerHTML   = fmtSimples(receita);
    incValEl.dataset.raw = Math.round(receita);
  }

  // ── Saídas ────────────────────────────────────────────────────────
  const expValEl = document.querySelector('.cfe-row:last-child .cfe-row-val');
  if (expValEl) {
    expValEl.innerHTML   = fmtSimples(despesa);
    expValEl.dataset.raw = Math.round(despesa);
  }

  // ── Data-attributes para buildHomeChart() ────────────────────────
  const cfeIncFill = document.getElementById('cfeIncFill');
  const cfeExpFill = document.getElementById('cfeExpFill');
  if (cfeIncFill) cfeIncFill.dataset.income  = receita;
  if (cfeExpFill) cfeExpFill.dataset.expense = despesa;

  // ── Label dinâmico do mês ─────────────────────────────────────────
  const now     = new Date();
  const mesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][now.getMonth()];
  const mesAno  = mesNome + ' ' + now.getFullYear();

  document.querySelectorAll('.slabel').forEach(el => {
    if (el.textContent.startsWith('Caixa ·')) el.textContent = 'Caixa · ' + mesAno;
  });

  // ── Painel fluxo de caixa (fsc-val) — tela financeiro ────────────
  const fscVals = document.querySelectorAll('.fsc-val');
  if (fscVals.length >= 3) {
    fscVals[0].innerHTML   = fmtK(receita);
    fscVals[0].dataset.raw = Math.round(receita);
    fscVals[1].innerHTML   = fmtK(despesa);
    fscVals[1].dataset.raw = Math.round(despesa);
    fscVals[2].innerHTML   = fmtK(resultado);
    fscVals[2].dataset.raw = Math.round(resultado);
  }
}

/* ════════════════════════════════════════════════
   APPLY COMPANY DATA
════════════════════════════════════════════════ */
function applyCompanyData(c) {
  if (!c) return;
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('idCompanyName',     c.name);
  s('idCnpj',           'CNPJ · ' + c.cnpj);
  s('idPorte',          c.porte);
  s('idRegime',         c.regime === 'simples' ? 'Simples Nacional' : c.regime);
  s('companyTypeBadge', c.porte);
}

/* ════════════════════════════════════════════════
   BANNER SEM EMPRESA
════════════════════════════════════════════════ */
function showNenhumaEmpresaBanner(visible) {
  let banner = document.getElementById('no-company-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'no-company-banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:50%', 'transform:translateX(-50%)',
      'z-index:999', 'width:100%', 'max-width:390px',
      'background:var(--accent)', 'padding:10px 16px',
      'font-family:var(--f-mono)', 'font-size:10px',
      'color:#fff', 'text-align:center', 'cursor:pointer', 'letter-spacing:.5px',
    ].join(';');
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
  _profile   = null;
  _companies = [];
  showLoginScreen(true);
}

window.doLogin  = doLogin;
window.doLogout = doLogout;

/* ════════════════════════════════════════════════
   CADASTRO PESSOAL
════════════════════════════════════════════════ */
function doRegister() {
  showRegisterScreen(true);
}
window.doRegister = doRegister;

async function doCreateAccount() {
  const nome       = document.getElementById('reg-nome').value.trim();
  const nascimento = document.getElementById('reg-nascimento').value.trim();
  const email      = document.getElementById('reg-email').value.trim();
  const cpf        = document.getElementById('reg-cpf').value.trim();
  const telefone   = document.getElementById('reg-telefone').value.trim();
  const senha      = document.getElementById('reg-senha').value;

  if (!nome)                                                { toast('⚠️', 'Digite seu nome completo'); return; }
  if (!nascimento)                                          { toast('⚠️', 'Digite sua data de nascimento'); return; }
  if (!email || !email.includes('@'))                       { toast('⚠️', 'Digite um e-mail válido'); return; }
  if (!cpf || cpf.replace(/\D/g,'').length < 11)           { toast('⚠️', 'Digite um CPF válido'); return; }
  if (!telefone || telefone.replace(/\D/g,'').length < 10) { toast('⚠️', 'Digite um telefone válido'); return; }
  if (!senha || senha.length < 6)                          { toast('⚠️', 'Senha precisa ter pelo menos 6 caracteres'); return; }

  showLoading(true);
  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password: senha,
      options: { data: { nome, nascimento, cpf, telefone } }
    });
    if (error) throw error;

    const user = data?.user;

    if (!user || (user.identities && user.identities.length === 0)) {
      showLoading(false);
      toast('⚠️', 'E-mail já cadastrado. Faça login.');
      showRegisterScreen(false);
      showLoginScreen(true);
      return;
    }

    const isConfirmed = !!(user.confirmed_at || user.email_confirmed_at);

    if (isConfirmed) {
      await createProfile({ userId: user.id, nome, nascimento, cpf, telefone, email });
      showLoading(false);
      showRegisterScreen(false);
      await initApp();
    } else {
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
  if (visible) openSheet('sheet-add-company');
  else         closeSheet('sheet-add-company');
}
window.showAddCompanySheet = showAddCompanySheet;

async function doAddCompany() {
  const name  = document.getElementById('add-company-name').value.trim();
  const cnpj  = document.getElementById('add-company-cnpj').value.trim();
  const porte = document.getElementById('add-company-porte').value || 'ME';

  if (!name)                                         { toast('⚠️', 'Digite o nome da empresa'); return; }
  if (!cnpj || cnpj.replace(/\D/g,'').length < 14)  { toast('⚠️', 'Digite um CNPJ válido'); return; }

  showLoading(true);
  try {
    const newCompany = await createCompany({ name, cnpj, porte });
    _companies.push(newCompany);
    _activeCompany = newCompany;

    applyCompanyData(_activeCompany);
    applyDefaultType(_activeCompany.porte || 'EPP');
    closeSheet('sheet-add-company');
    showNenhumaEmpresaBanner(false);

    // CORREÇÃO: recarrega todos os dados para a nova empresa e reconstrói
    // todas as listas — sem isso, as telas ficavam com dados da empresa anterior.
    await loadAllData();
    buildNFList();
    buildExtrato();
    buildPagar();
    buildReceber();
    buildTaxList();
    buildCalendar();

    const porteNovo = _activeCompany.porte || 'EPP';
    if (porteNovo !== 'MEI') buildPLHist();

    renderKPIs();
    setTimeout(() => { buildHomeChart(); buildCFChart(); }, 200);

    toast('✅', 'Empresa adicionada!');
    showLoading(false);
  } catch (err) {
    showLoading(false);
    toast('❌', err.message || 'Erro ao adicionar empresa');
  }
}
window.doAddCompany = doAddCompany;

/* ════════════════════════════════════════════════
   NF / IMPOSTOS / PRÓ-LABORE
════════════════════════════════════════════════ */
window.emitirNF = async function() {
  const numero     = document.getElementById('nf-numero')?.value?.trim();
  const cliente    = document.getElementById('nf-cliente')?.value?.trim();
  const valor      = document.getElementById('nf-valor')?.value?.trim();
  const tipo       = document.getElementById('nf-tipo')?.value || 'NFS-e';
  const descricao  = document.getElementById('nf-descricao')?.value?.trim() || '';
  const recorrente = document.getElementById('nf-recorrente')?.classList.contains('on') ?? false;

  if (!numero || !cliente || !valor) { toast('⚠️', 'Preencha todos os campos'); return; }
  if (!_activeCompany?.id) { toast('⚠️', 'Selecione uma empresa primeiro'); return; }

  try {
    await createNF({
      companyId:    _activeCompany.id,
      numero,
      cliente,
      tipo,
      descricao,
      recorrente,
      valor:        parseFloat(valor.replace(',', '.')),
      data_emissao: new Date().toISOString().slice(0, 10),
    });
    closeSheet('sheet-nf');
    toast('🚀', 'Nota fiscal emitida!');
    _nfData = await fetchNFs({ companyId: _activeCompany.id });
    NFs.length = 0; NFs.push(..._nfData);
    buildNFList();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

window.marcarImpostoPago = async function(uuid) {
  try {
    await pagarImposto(uuid);
    toast('✅', 'Imposto marcado como pago!');
    _impostosData = await fetchImpostos({ companyId: _activeCompany?.id });
    IMPOSTOS.length = 0; IMPOSTOS.push(..._impostosData);
    buildTaxList();
  } catch (err) { toast('❌', 'Erro: ' + err.message); }
};

window.marcarPLPago = async function(uuid) {
  try {
    await marcarProlaborePago(uuid);
    toast('✅', 'Pró-labore pago!');
    _prolaboreData = await fetchProlabore({ companyId: _activeCompany?.id });
    PL_HIST.length = 0; PL_HIST.push(..._prolaboreData);
    buildPLHist();
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
    document.getElementById('pl-mei-content').style.display  = 'block';
    document.getElementById('pl-full-content').style.display = 'none';
    const fa = document.getElementById('frAlert'); if (fa) fa.style.display = 'none';
    document.getElementById('sBar').style.width = '34.6%';
  } else {
    document.getElementById('pl-mei-content').style.display  = 'none';
    document.getElementById('pl-full-content').style.display = 'block';
    const fa = document.getElementById('frAlert'); if (fa) fa.style.display = 'flex';
    document.getElementById('sBar').style.width = '35.4%';
  }

  toast('✅', 'Visualizando como ' + type);

  // CORREÇÃO: persiste no banco E atualiza _activeCompany em memória —
  // sem isso, initApp() na próxima sessão lia o porte desatualizado do objeto
  // em RAM e tomava decisões erradas (ex.: buildPLHist() para MEI).
  if (_activeCompany?.id) {
    try {
      const updated = await saveCompany({ id: _activeCompany.id, porte: type });
      // Mescla o retorno do banco para garantir sincronismo
      _activeCompany = { ..._activeCompany, ...updated, porte: type };
    } catch(e) {
      // Mesmo que o banco falhe, mantém a memória atualizada
      _activeCompany = { ..._activeCompany, porte: type };
      console.warn('[selectCompanyType] Falha ao persistir porte:', e);
    }
  }
};

/* ════════════════════════════════════════════════
   UI HELPERS (locais — DOM do shell)
════════════════════════════════════════════════ */
function showLoading(visible) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = visible ? 'flex' : 'none';
}
