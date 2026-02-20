/* ════════════════════════════════════════════════
   API.JS — sem módulos ES
════════════════════════════════════════════════ */

async function fetchCompany() {
  const { data, error } = await sb.from('companies').select('*').single();
  if (error) throw error;
  return data;
}

async function saveCompany(fields) {
  const { data, error } = await sb.from('companies').update(fields).eq('id', fields.id).select().single();
  if (error) throw error;
  return data;
}

async function createCompany({ name, cnpj, porte }) {
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('companies').insert({ name, cnpj, porte, user_id: user.id, regime: 'simples' }).select().single();
  if (error) throw error;
  return data;
}

async function fetchNFs({ status, search } = {}) {
  let query = sb.from('notas_fiscais').select('*').order('data_emissao', { ascending: false });
  if (status === 'pagas')       query = query.eq('status', 'paid');
  if (status === 'pendentes')   query = query.in('status', ['pending', 'overdue']);
  if (status === 'recorrentes') query = query.eq('recorrente', true);
  if (search) query = query.ilike('cliente', `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(nf => ({
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
  }));
}

async function createNF({ numero, cliente, tipo, valor, moeda = 'BRL', recorrente = false, data_emissao }) {
  const company = await fetchCompany();
  const { data, error } = await sb.from('notas_fiscais')
    .insert({ numero, cliente, tipo, valor, moeda, recorrente, data_emissao, status: 'pending', company_id: company.id })
    .select().single();
  if (error) throw error;
  return data;
}

async function fetchExtrato({ limit = 30 } = {}) {
  const { data, error } = await sb.from('transacoes').select('*').order('data', { ascending: false }).limit(limit);
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const groups = {};
  data.forEach(tx => {
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

const TAX_COLORS = {
  atrasado: { color: 'var(--red)',   bg: 'var(--red-d)',   border: 'var(--red-b)'   },
  pendente: { color: 'var(--amber)', bg: 'var(--amber-d)', border: 'var(--amber-b)' },
  pago:     { color: 'var(--green)', bg: 'var(--green-d)', border: 'var(--green-b)' },
};

async function fetchImpostos() {
  const { data, error } = await sb.from('impostos').select('*').order('vencimento', { ascending: true });
  if (error) throw error;
  const today = new Date();
  return data.map(imp => {
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

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function fetchProlabore() {
  const { data, error } = await sb.from('prolabore').select('*').order('competencia', { ascending: false }).limit(12);
  if (error) throw error;
  return data.map(pl => {
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

async function fetchKPIs() {
  const mes = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })();
  const [nfsRes, txRes, impRes] = await Promise.all([
    sb.from('notas_fiscais').select('valor, status').gte('data_emissao', mes),
    sb.from('transacoes').select('valor, direcao').gte('data', mes),
    sb.from('impostos').select('valor, status').eq('status', 'pendente'),
  ]);
  const receita  = (txRes.data||[]).filter(t=>t.direcao==='in').reduce((s,t)=>s+Number(t.valor),0);
  const despesa  = (txRes.data||[]).filter(t=>t.direcao==='out').reduce((s,t)=>s+Number(t.valor),0);
  const aReceber = (nfsRes.data||[]).filter(n=>n.status==='pending').reduce((s,n)=>s+Number(n.valor),0);
  const impostoTotal = (impRes.data||[]).reduce((s,i)=>s+Number(i.valor||0),0);
  return { receita, despesa, resultado: receita - despesa, aReceber, impostoTotal };
}
