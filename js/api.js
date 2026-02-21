/* ════════════════════════════════════════════════
   API.JS
════════════════════════════════════════════════ */

/* ── PERFIL PESSOAL ─────────────────────────── */

async function fetchProfile() {
  const { data: { user } } = await sb.auth.getUser();
  // Perfil pode estar na tabela profiles ou só no user_metadata
  const { data, error } = await sb.from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  // Se não houver tabela profiles ainda, usa os dados do metadata
  if (error || !data) {
    return {
      nome:       user.user_metadata?.nome     || user.email,
      cpf:        user.user_metadata?.cpf      || '',
      telefone:   user.user_metadata?.telefone || '',
      nascimento: user.user_metadata?.nascimento || '',
      email:      user.email,
    };
  }
  return data;
}

async function createProfile({ userId, nome, nascimento, cpf, telefone, email }) {
  const { data, error } = await sb.from('profiles')
    .insert({ user_id: userId, nome, nascimento, cpf, telefone, email })
    .select()
    .single();
  // Se a tabela não existir ainda, não quebra o fluxo — dados estão no metadata
  if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
    console.warn('[createProfile]', error);
  }
  return data;
}

/* ── EMPRESAS ───────────────────────────────── */

async function fetchCompanies() {
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchCompany() {
  // Mantido por compatibilidade — retorna a primeira empresa do usuário
  const companies = await fetchCompanies();
  if (!companies.length) throw new Error('0 rows');
  return companies[0];
}

async function saveCompany(fields) {
  const { data, error } = await sb.from('companies')
    .update(fields)
    .eq('id', fields.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createCompany({ name, cnpj, porte, cidade, codigo_ibge, inscricao_municipal, cnae, item_lista_servico, aliquota_iss }) {
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('companies')
    .insert({
      name, cnpj, porte, user_id: user.id, regime: 'simples',
      cidade, codigo_ibge, inscricao_municipal, cnae, item_lista_servico,
      aliquota_iss: aliquota_iss ? parseFloat(aliquota_iss) : null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── NOTAS FISCAIS ──────────────────────────── */

async function fetchNFs({ status, search, companyId } = {}) {
  let query = sb.from('notas_fiscais').select('*').order('data_emissao', { ascending: false });
  if (companyId) query = query.eq('company_id', companyId);
  if (status === 'pagas')       query = query.eq('status', 'paid');
  if (status === 'pendentes')   query = query.in('status', ['pending', 'overdue']);
  if (status === 'recorrentes') query = query.eq('recorrente', true);
  if (search) query = query.ilike('cliente', `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(nf => ({
    id:     '#' + nf.numero,
    client: nf.cliente,
    ico:    nf.icone || '🧾',
    date:   new Date(nf.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }),
    val:    nf.moeda === 'BRL'
              ? 'R$ ' + Number(nf.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
              : '$'   + Number(nf.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    raw:    Math.round(nf.valor),
    status: nf.status,
    rec:    nf.recorrente,
    type:   nf.tipo,
    _id:    nf.id,
    // novos campos:
    enotas_status: nf.enotas_status || null,
    pdf_url:       nf.pdf_url || null,
  }));
}

async function createNF({ numero, cliente, cpf_cnpj_tomador, email_tomador, descricao_servico, tipo, valor, moeda = 'BRL', recorrente = false, data_emissao }) {
  const company = await fetchCompany();
  const { data, error } = await sb.from('notas_fiscais')
    .insert({
      numero, cliente, cpf_cnpj_tomador, email_tomador, descricao_servico,
      tipo, valor, moeda, recorrente, data_emissao,
      status: 'pending', company_id: company.id
    })
    .select().single();
  if (error) throw error;
  return data;
}

/* ── EXTRATO ────────────────────────────────── */

async function fetchExtrato({ limit = 30, companyId } = {}) {
  let query = sb.from('transacoes').select('*').order('data', { ascending: false }).limit(limit);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const groups = {};
  (data || []).forEach(tx => {
    const isToday = tx.data === today;
    const key = isToday
      ? 'HOJE · ' + new Date(tx.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase()
      : new Date(tx.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      dir:  tx.direcao,
      ico:  tx.icone || (tx.direcao === 'in' ? '💰' : '💸'),
      desc: tx.descricao,
      cat:  tx.categoria || '',
      val:  (tx.direcao === 'in' ? '+' : '-') + Number(tx.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      raw:  Math.round(tx.valor),
      _id:  tx.id,
    });
  });
  return Object.entries(groups).map(([grp, items]) => ({ grp, items }));
}

/* ── IMPOSTOS ───────────────────────────────── */

const TAX_COLORS = {
  atrasado: { color: 'var(--red)',   bg: 'var(--red-d)',   border: 'var(--red-b)'   },
  pendente: { color: 'var(--amber)', bg: 'var(--amber-d)', border: 'var(--amber-b)' },
  pago:     { color: 'var(--green)', bg: 'var(--green-d)', border: 'var(--green-b)' },
};

async function fetchImpostos({ companyId } = {}) {
  let query = sb.from('impostos').select('*').order('vencimento', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw error;
  const today = new Date();
  return (data || []).map(imp => {
    const due  = new Date(imp.vencimento + 'T12:00:00');
    const diff = Math.round((due - today) / 86400000);
    const dueStr = diff === 0 ? 'Vence HOJE'
                 : diff < 0  ? `Vencida há ${Math.abs(diff)} dias`
                              : `Vence ${due.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} · ${diff} DIAS`;
    const cfg  = TAX_COLORS[imp.status] || TAX_COLORS.pendente;
    const fill = imp.status === 'pago' ? 100 : diff <= 0 ? 95 : Math.max(5, 100 - diff * 3);
    return {
      ico: imp.icone || '🧾', name: imp.nome, due: dueStr,
      val: imp.valor ? 'R$ ' + Number(imp.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—',
      color: cfg.color, bg: cfg.bg, border: cfg.border, fill,
      detail: {
        base:   imp.base_calculo ? 'R$ ' + Number(imp.base_calculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—',
        aliq:   imp.aliquota ? (imp.aliquota * 100).toFixed(2) + '%' : '—',
        comp:   imp.competencia, regime: imp.regime || 'Simples Nacional',
      },
      status: imp.status, _id: imp.id,
    };
  });
}

async function pagarImposto(uuid) {
  const { error } = await sb.from('impostos').update({ status: 'pago' }).eq('id', uuid);
  if (error) throw error;
}

/* ── PRÓ-LABORE ─────────────────────────────── */

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function fetchProlabore({ companyId } = {}) {
  let query = sb.from('prolabore').select('*').order('competencia', { ascending: false }).limit(12);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(pl => {
    const [y, m] = pl.competencia.split('-');
    return {
      month: MESES[parseInt(m) - 1] + ' ' + y,
      val:   Number(pl.valor_bruto).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      net:   Number(pl.valor_liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      inss:  Number(pl.inss).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      paid:  pl.pago, fator_r: pl.fator_r, _id: pl.id,
    };
  });
}

async function marcarProlaborePago(uuid) {
  const { error } = await sb.from('prolabore').update({ pago: true }).eq('id', uuid);
  if (error) throw error;
}

async function fetchKPIs({ companyId } = {}) {
  const mes = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })();
  let nfsQ = sb.from('notas_fiscais').select('valor, status').gte('data_emissao', mes);
  let txQ  = sb.from('transacoes').select('valor, direcao').gte('data', mes);
  let impQ = sb.from('impostos').select('valor, status').eq('status', 'pendente');
  if (companyId) { nfsQ = nfsQ.eq('company_id', companyId); txQ = txQ.eq('company_id', companyId); impQ = impQ.eq('company_id', companyId); }
  const [nfsRes, txRes, impRes] = await Promise.all([nfsQ, txQ, impQ]);
  const receita      = (txRes.data||[]).filter(t=>t.direcao==='in').reduce((s,t)=>s+Number(t.valor),0);
  const despesa      = (txRes.data||[]).filter(t=>t.direcao==='out').reduce((s,t)=>s+Number(t.valor),0);
  const aReceber     = (nfsRes.data||[]).filter(n=>n.status==='pending').reduce((s,n)=>s+Number(n.valor),0);
  const impostoTotal = (impRes.data||[]).reduce((s,i)=>s+Number(i.valor||0),0);
  return { receita, despesa, resultado: receita - despesa, aReceber, impostoTotal };
}
