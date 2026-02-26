/* ════════════════════════════════════════════════
   ONBOARDING.JS
   Funções do fluxo de onboarding (3 passos):
   Step 1 — tipo de empresa
   Step 2 — dados do responsável e empresa
   Step 3 — confirmação e criação da conta
════════════════════════════════════════════════ */

/* ── SELEÇÃO DO TIPO ────────────────────────── */
function obSelectTipo(tipo) {
  document.getElementById('ob-porte').value = tipo;
  const cards = { MEI: 'ob-card-mei', ME: 'ob-card-me', EPP: 'ob-card-epp' };
  Object.entries(cards).forEach(([t, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.border = t === tipo ? '2px solid var(--accent)' : '2px solid var(--border)';
  });
}

/* ── NAVEGAÇÃO ENTRE PASSOS ─────────────────── */
function obNextStep(step) {

  // Validação do Step 1: porte deve estar selecionado antes de avançar
  if (step === 2) {
    const porte = document.getElementById('ob-porte')?.value?.trim();
    if (!porte) {
      toast('⚠️', 'Selecione o tipo de empresa para continuar');
      return;
    }
  }

  // Validações antes de avançar para Step 3
  if (step === 3) {
    const nome    = document.getElementById('ob-user-name')?.value?.trim();
    const cpf     = document.getElementById('ob-user-cpf')?.value?.trim();
    const fone    = document.getElementById('ob-user-fone')?.value?.trim();
    const email   = document.getElementById('ob-email')?.value?.trim();
    const senha   = document.getElementById('ob-pass')?.value;
    const empresa = document.getElementById('ob-name')?.value?.trim();
    const cnpj    = document.getElementById('ob-cnpj')?.value?.trim();

    if (!nome)                                              { toast('⚠️', 'Digite o nome completo'); return; }
    if (!cpf || cpf.replace(/\D/g,'').length < 11)         { toast('⚠️', 'Digite um CPF válido'); return; }
    if (!fone || fone.replace(/\D/g,'').length < 10)       { toast('⚠️', 'Digite um telefone válido'); return; }
    if (!email || !email.includes('@'))                    { toast('⚠️', 'Digite um e-mail válido'); return; }
    if (!senha || senha.length < 6)                        { toast('⚠️', 'Senha precisa ter pelo menos 6 caracteres'); return; }
    if (!empresa)                                          { toast('⚠️', 'Digite o nome da empresa'); return; }
    if (!cnpj || cnpj.replace(/\D/g,'').length < 14)      { toast('⚠️', 'Digite um CNPJ válido'); return; }

    // Preenche tela de confirmação
    const porte = document.getElementById('ob-porte')?.value || 'ME';
    const regimes = { MEI: 'DAS-MEI (fixo)', ME: 'Simples Nacional', EPP: 'Simples Nacional' };
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('ob-confirm-username', nome);
    el('ob-confirm-cpf',      cpf);
    el('ob-confirm-fone',     fone);
    el('ob-confirm-porte',    porte);
    el('ob-confirm-nome',     empresa);
    el('ob-confirm-cnpj',     cnpj);
    el('ob-confirm-regime',   regimes[porte] || 'Simples Nacional');
    el('ob-confirm-email',    email);
  }

  // Esconde todos os steps
  [1, 2, 3].forEach(s => {
    const el = document.getElementById('ob-step-' + s);
    if (el) el.style.display = 'none';
  });

  // Mostra o step alvo
  const target = document.getElementById('ob-step-' + step);
  if (target) target.style.display = '';

  // Atualiza barra de progresso
  [1, 2, 3].forEach(s => {
    const bar = document.getElementById('ob-step-bar-' + s);
    if (!bar) return;
    bar.style.background = s <= step ? 'var(--accent)' : 'var(--border2)';
  });
}

/* ── CANCELAR ONBOARDING ────────────────────── */
function obCancelar() {
  showOnboardingScreen(false);
  showLoginScreen(true);
}

/* ── CADASTRAR EMPRESA (Step 3 → submit) ─────── */
async function cadastrarEmpresa() {
  const nome      = document.getElementById('ob-user-name')?.value?.trim();
  const cpf       = document.getElementById('ob-user-cpf')?.value?.trim();
  const fone      = document.getElementById('ob-user-fone')?.value?.trim();
  const email     = document.getElementById('ob-email')?.value?.trim();
  const senha     = document.getElementById('ob-pass')?.value;
  const empresa   = document.getElementById('ob-name')?.value?.trim();
  const cnpj      = document.getElementById('ob-cnpj')?.value?.trim();
  const cidade    = document.getElementById('ob-cidade')?.value?.trim();
  const porte     = document.getElementById('ob-porte')?.value || 'ME';

  if (!nome || !email || !senha || !empresa || !cnpj) {
    toast('⚠️', 'Preencha todos os campos obrigatórios');
    return;
  }

  if (typeof showLoading === 'function') showLoading(true);

  let userId = null; // guarda o ID para rollback em caso de falha

  try {
    // 1. Cria conta no Supabase Auth
    const { data, error } = await sb.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, cpf, telefone: fone }
      }
    });
    if (error) throw error;

    const user = data?.user;
    if (!user || (user.identities && user.identities.length === 0)) {
      if (typeof showLoading === 'function') showLoading(false);
      toast('⚠️', 'E-mail já cadastrado. Faça login.');
      showOnboardingScreen(false);
      showLoginScreen(true);
      return;
    }

    userId = user.id;

    // 2. Cria perfil
    if (typeof createProfile === 'function') {
      await createProfile({ userId: user.id, nome, cpf, telefone: fone, email, nascimento: '' });
    }

    const isConfirmed = !!(user.confirmed_at || user.email_confirmed_at);

    if (isConfirmed) {
      // 3. Cria empresa — com rollback se falhar
      try {
        if (typeof createCompany === 'function') {
          await createCompany({ name: empresa, cnpj, porte, cidade });
        }
      } catch (companyErr) {
        // Rollback: remove perfil e apaga a conta para não deixar usuário órfão sem empresa
        console.error('[onboarding] createCompany falhou — iniciando rollback:', companyErr);
        try {
          // Remove o perfil criado no passo anterior (chave correta: user_id, não id)
          if (typeof sb !== 'undefined') {
            await sb.from('profiles').delete().eq('user_id', userId);
          }
          // Faz logout para limpar a sessão Auth (a conta fica pendente de remoção pelo admin)
          await sb.auth.signOut();
        } catch (rollbackErr) {
          console.error('[onboarding] Rollback parcialmente falhou:', rollbackErr);
        }
        if (typeof showLoading === 'function') showLoading(false);
        toast('❌', 'Erro ao criar empresa. Tente novamente.');
        return;
      }

      if (typeof showLoading === 'function') showLoading(false);
      showOnboardingScreen(false);
      if (typeof initApp === 'function') await initApp();
    } else {
      if (typeof showLoading === 'function') showLoading(false);
      showOnboardingScreen(false);
      // Mostra confirmação de e-mail
      showLoginScreen(true);
      const box = document.getElementById('login-box');
      if (box) {
        box.innerHTML = `
          <div style="text-align:center;padding:8px 0 16px">
            <div style="font-size:48px;margin-bottom:16px">📧</div>
            <div style="font-family:var(--f-mono);font-size:13px;font-weight:700;color:var(--bright);letter-spacing:1px;margin-bottom:12px">CONFIRME SEU E-MAIL</div>
            <div style="font-family:var(--f-mono);font-size:10px;color:var(--muted);line-height:2;margin-bottom:16px">
              Enviamos um link para<br>
              <span style="color:var(--accent)">${email}</span><br>
              Clique no link e depois faça login.
            </div>
          </div>
          <button onclick="location.reload()" style="width:100%;padding:13px;background:var(--accent);border:none;border-radius:10px;color:#fff;font-family:var(--f-mono);font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;">IR PARA O LOGIN</button>
        `;
      }
    }
  } catch (err) {
    if (typeof showLoading === 'function') showLoading(false);
    toast('❌', err.message || 'Erro ao criar conta');
  }
}

// Expõe funções ao escopo global (necessário para handlers inline no HTML)
window.obSelectTipo     = obSelectTipo;
window.obNextStep       = obNextStep;
window.obCancelar       = obCancelar;
window.cadastrarEmpresa = cadastrarEmpresa;
