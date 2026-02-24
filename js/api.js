/* ════════════════════════════════════════════════
   API.JS — camada de dados Supabase
   Regras:
   • Um único ponto de verdade por função
   • Nunca duplicar lógica entre arquivos
   • fetchCompany() REMOVIDO (era alias morto de fetchCompanies()[0])
════════════════════════════════════════════════ */

/* ── PERFIL PESSOAL ─────────────────────────── */

async function fetchProfile() {
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) {
    return {
      nome:       user.user_metadata?.nome      || user.email,
      cpf:        user.user_metadata?.cpf       || '',
      telefone:   user.user_metadata?.telefone  || '',
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

async function saveCompany(fields) {
  const { data, error } = await sb.from('companies')
    .update(fields)
    .eq('id', fields.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createCompany({ name, cnpj, porte }) {
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('companies')
    .insert({ name, cnpj, porte, user_id: user.id, regime: 'simples' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── NOTAS FISCAIS ──────────────────────────── */

/**
 * @param {object}  opts
 * @param {string}  [opts.status]      - 'pagas' | 'pendentes' | 'recorrentes'
 * @param {string}  [opts.search]      - filtro ilike no campo cliente
 * @param {string}  [opts.companyId]   - UUID da empresa
 * @param {number}  [opts.page=0]      - página (0-indexada)
 * @param {number}  [opts.pageSize=30] - registros por página
 */
async function fetchNFs({ status, search, companyId, page = 0, pageSize = 30 } = {}) {
  const from = page * pageSize;
  const to   = from + pageSize - 1;

  let query = sb.from('notas_fiscais')
    .select('*')
    .order('data_emissao', { ascending: false })
    .range(from, to);

  if (companyId)                query = query.eq('company_id', companyId);
  if (status === 'pagas')       query = query.eq('status', 'paid');
  if (status === 'pendentes')   query = query.in('status', ['pending', 'overdue']);
  if (status === 'recorrentes') query = query.eq('recorrente', true);
  if (search)                   query = query.ilike('cliente', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(nf => ({
    id:     '#' + nf.numero,
    client: nf.cliente,
    ico:    nf.icone || '🧾',
    date:   new Date(nf.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    val:    nf.moeda === 'BRL'
              ? 'R$ ' + Number(nf.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
              : '$'   + Number(nf.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    raw:    Math.round(nf.valor),
    status: nf.status,
    rec:    nf.recorrente,
    type:   nf.tipo,
    _id:    nf.id,
  }));
}

/**
 * Cria uma nota fiscal. companyId é explícito — nunca busca companies[0] internamente.
 *
 * @param {object} opts
 * @param {string} opts.companyId    - UUID da empresa (obrigatório)
 * @param {string} opts.numero
 * @param {string} opts.cliente
 * @param {string} opts.tipo
 * @param {number} opts.valor
 * @param {string} [opts.descricao]
 * @param {string} [opts.moeda]
 * @param {boolean}[opts.recorrente]
 * @param {string} opts.data_emissao - YYYY-MM-DD
 */
async function createNF({ companyId, numero, cliente, tipo, valor, descricao = '', moeda = 'BRL', recorrente = false, data_emissao }) {
  if (!companyId) throw new Error('createNF: companyId é obrigatório');
  const { data, error } = await sb.from('notas_fiscais')
    .insert({ numero, cliente, tipo, valor, descricao, moeda, recorrente, data_emissao, status: 'pending', company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Marca uma NF como paga (status → 'paid').
 * Usada por markPay() em pages.js quando type === 'receber'.
 *
 * @param {string} uuid - id da nota fiscal
 */
async function marcarNFRecebida(uuid) {
  const { error } = await sb.from('notas_fiscais')
    .update({ status: 'paid' })
    .eq('id', uuid);
  if (error) throw error;
}

/* ── EXTRATO ────────────────────────────────── */

async function fetchExtrato({ limit = 30, companyId } = {}) {
  let query = sb.from('transacoes')
    .select('*')
    .order('data', { ascending: false })
    .limit(limit);
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;

  const today  = new Date().toISOString().slice(0, 10);
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
  let query = sb.from('impostos')
    .select('*')
    .order('vencimento', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;

  const today = new Date();
  return (data || []).map(imp => {
    const due  = new Date(imp.vencimento + 'T12:00:00');
    const diff = Math.round((due - today) / 86400000);
    const dueStr = diff === 0 ? 'Vence HOJE'
                 : diff < 0  ? `Vencida há ${Math.abs(diff)} dias`
                              : `Vence ${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${diff} DIAS`;
    const cfg  = TAX_COLORS[imp.status] || TAX_COLORS.pendente;
    const fill = imp.status === 'pago' ? 100 : diff <= 0 ? 95 : Math.max(5, 100 - diff * 3);
    return {
      ico: imp.icone || '🧾', name: imp.nome, due: dueStr,
      val: imp.valor
        ? 'R$ ' + Number(imp.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '—',
      color: cfg.color, bg: cfg.bg, border: cfg.border, fill,
      detail: {
        base:   imp.base_calculo ? 'R$ ' + Number(imp.base_calculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—',
        aliq:   imp.aliquota ? (imp.aliquota * 100).toFixed(2) + '%' : '—',
        comp:   imp.competencia,
        regime: imp.regime || 'Simples Nacional',
      },
      status:     imp.status,
      vencimento: imp.vencimento, // YYYY-MM-DD — consumido por buildCalendar()
      _id:        imp.id,
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
  let query = sb.from('prolabore')
    .select('*')
    .order('competencia', { ascending: false })
    .limit(12);
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(pl => {
    const [y, m] = pl.competencia.split('-');
    return {
      month:   MESES[parseInt(m) - 1] + ' ' + y,
      val:     Number(pl.valor_bruto).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      net:     Number(pl.valor_liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      inss:    Number(pl.inss).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      paid:    pl.pago,
      fator_r: pl.fator_r,
      _id:     pl.id,
    };
  });
}

async function marcarProlaborePago(uuid) {
  const { error } = await sb.from('prolabore').update({ pago: true }).eq('id', uuid);
  if (error) throw error;
}

/* ── A PAGAR ────────────────────────────────── */

/**
 * Busca contas a pagar pendentes do mês atual + próximos 30 dias.
 * Popula o array PAGAR que buildPagar() (pages.js) consome.
 *
 * @param {object} [opts]
 * @param {string} [opts.companyId]
 */
async function fetchPagar({ companyId } = {}) {
  const hoje      = new Date();
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const limite30  = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  let query = sb.from('contas_pagar')
    .select('*')
    .eq('status', 'pendente')
    .gte('vencimento', inicioMes)
    .lte('vencimento', limite30)
    .order('vencimento', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(row => {
    const due   = new Date(row.vencimento + 'T12:00:00');
    const diff  = Math.round((due - hoje) / 86400000);
    const when  = diff === 0 ? 'Vence HOJE'
                : diff < 0  ? `Vencida há ${Math.abs(diff)} dia${Math.abs(diff) > 1 ? 's' : ''}`
                : diff <= 5 ? `URGENTE — Vence ${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
                            : `Vence ${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    const color = diff <= 0 ? 'var(--red)'
                : diff <= 5 ? 'var(--amber)'
                            : 'var(--soft)';
    return {
      ico:   row.icone || '🧾',
      name:  row.descricao,
      when,
      val:   Number(row.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      color,
      done:  false,
      _id:   row.id,
    };
  });
}

/**
 * Marca uma conta a pagar como paga (status → 'pago').
 * Usada por markPay() em pages.js quando type === 'pagar'.
 *
 * @param {string} uuid - id da conta em contas_pagar
 */
async function pagarConta(uuid) {
  const { error } = await sb.from('contas_pagar')
    .update({ status: 'pago' })
    .eq('id', uuid);
  if (error) throw error;
}

/* ── A RECEBER ──────────────────────────────── */

/**
 * Busca notas fiscais pendentes/vencidas como "a receber".
 * Popula o array RECEBER que buildReceber() (pages.js) consome.
 *
 * @param {object} [opts]
 * @param {string} [opts.companyId]
 */
async function fetchReceber({ companyId } = {}) {
  let query = sb.from('notas_fiscais')
    .select('id, numero, cliente, valor, moeda, status, data_emissao, icone')
    .in('status', ['pending', 'overdue'])
    .order('data_emissao', { ascending: false })
    .limit(50);

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(nf => {
    const due   = new Date(nf.data_emissao + 'T12:00:00');
    const color = nf.status === 'overdue' ? 'var(--red)' : 'var(--green)';
    const val   = nf.moeda === 'BRL'
      ? 'R$ ' + Number(nf.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '$'   + Number(nf.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    return {
      ico:   nf.icone || '💼',
      name:  nf.cliente,
      when:  `${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} — ${nf.moeda !== 'BRL' ? nf.moeda + ' · ' : ''}NF #${nf.numero}`,
      val,
      color,
      done:  false,
      _id:   nf.id,
    };
  });
}

/* ── FLUXO DE CAIXA (gráfico) ───────────────── */

/**
 * Agrega receitas e despesas dos últimos N meses para o gráfico de barras.
 * Substitui o array CASH hardcoded em data.js.
 *
 * @param {object} [opts]
 * @param {number} [opts.months=12]  - quantos meses para trás
 * @param {string} [opts.companyId]
 * @returns {{ months: string[], income: number[], expense: number[] }}
 */
async function fetchCashFlow({ months = 12, companyId } = {}) {
  const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const now = new Date();
  const result = { months: [], income: [], expense: [] };
  const queries = [];

  for (let i = months - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y   = d.getFullYear();
    const mon = d.getMonth();
    const ini = `${y}-${String(mon + 1).padStart(2, '0')}-01`;
    const fim = `${y}-${String(mon + 1).padStart(2, '0')}-${new Date(y, mon + 1, 0).getDate()}`;

    result.months.push(MESES_ABREV[mon]);

    let q = sb.from('transacoes')
      .select('valor, direcao')
      .gte('data', ini)
      .lte('data', fim);
    if (companyId) q = q.eq('company_id', companyId);
    queries.push(q);
  }

  const responses = await Promise.all(queries);
  responses.forEach(({ data }) => {
    const rows    = data || [];
    const entrada = rows.filter(r => r.direcao === 'in').reduce((s, r)  => s + Number(r.valor), 0);
    const saida   = rows.filter(r => r.direcao === 'out').reduce((s, r) => s + Number(r.valor), 0);
    result.income.push(Math.round(entrada));
    result.expense.push(Math.round(saida));
  });

  return result;
}

/* ── KPIs DA HOME ───────────────────────────── */

/**
 * KPIs do mês atual: receita, despesa, resultado, a receber, imposto total.
 * Chamado em loadAllData() → renderKPIs() atualiza o DOM da home.
 *
 * @param {object} [opts]
 * @param {string} [opts.companyId]
 * @returns {{ receita, despesa, resultado, aReceber, impostoTotal }}
 */
async function fetchKPIs({ companyId } = {}) {
  const mes = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();

  let nfsQ = sb.from('notas_fiscais').select('valor, status').gte('data_emissao', mes);
  let txQ  = sb.from('transacoes').select('valor, direcao').gte('data', mes);
  let impQ = sb.from('impostos').select('valor, status').eq('status', 'pendente');

  if (companyId) {
    nfsQ = nfsQ.eq('company_id', companyId);
    txQ  = txQ.eq('company_id', companyId);
    impQ = impQ.eq('company_id', companyId);
  }

  const [nfsRes, txRes, impRes] = await Promise.all([nfsQ, txQ, impQ]);

  const receita      = (txRes.data  || []).filter(t => t.direcao === 'in').reduce((s, t)  => s + Number(t.valor), 0);
  const despesa      = (txRes.data  || []).filter(t => t.direcao === 'out').reduce((s, t) => s + Number(t.valor), 0);
  const aReceber     = (nfsRes.data || []).filter(n => n.status === 'pending').reduce((s, n) => s + Number(n.valor), 0);
  const impostoTotal = (impRes.data || []).reduce((s, i) => s + Number(i.valor || 0), 0);

  return { receita, despesa, resultado: receita - despesa, aReceber, impostoTotal };
}
