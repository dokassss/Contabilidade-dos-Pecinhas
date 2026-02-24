/* ════════════════════════════════════════════════
   PAGES.JS — builders de listas e calendário

   Responsabilidade: ler arrays globais (NFs, EXTRATO,
   IMPOSTOS, PAGAR, RECEBER, PL_HIST) e gerar DOM.
   Sem chamadas de rede diretas — exceto markPay(),
   que delega persistência para api.js.

   Arrays globais são populados por loadAllData()
   em main-supabase.js antes de qualquer build ser chamado.

   Estado (_hidden, _nfFilter, _calDate, _chartMode)
   declarado em state.js — leitura direta aqui.
════════════════════════════════════════════════ */

/* ── UTILITÁRIOS DE FORMATAÇÃO ──────────────── */

/** Envolve a parte de centavos num <span class="cents"> */
function fmtVal(v) {
  if (!v || v === '—') return v;
  const m = String(v).match(/^(.*),(\d{2})$/);
  if (!m) return v;
  return m[1] + '<span class="cents">,' + m[2] + '</span>';
}

/** Formata "R$ X.XXX,XX" aplicando fmtVal nos centavos */
function fmtBRL(v) {
  if (!v || v === '—') return v;
  if (v.startsWith('R$ ')) return 'R$ ' + fmtVal(v.slice(3));
  return fmtVal(v);
}

/**
 * Renderiza um placeholder de estado vazio padronizado.
 * @param {string} ico   - emoji
 * @param {string} titulo
 * @param {string} [sub] - linha secundária opcional
 * @returns {string} HTML
 */
function _emptyState(ico, titulo, sub = '') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                padding:48px 24px;gap:10px;text-align:center;">
      <div style="font-size:32px;line-height:1">${ico}</div>
      <div style="font-family:var(--f-mono);font-size:11px;font-weight:700;
                  color:var(--bright);letter-spacing:.5px;">${titulo}</div>
      ${sub ? `<div style="font-family:var(--f-mono);font-size:10px;color:var(--muted);line-height:1.8;">${sub}</div>` : ''}
    </div>`;
}

/* ════════════════════
   NOTAS FISCAIS
════════════════════ */

/** Timer de debounce para a busca por texto — evita N roundtrips enquanto o usuário digita */
let _nfSearchTimer = null;

/**
 * Busca NFs no Supabase com os filtros ativos e reconstrói a lista.
 * Async porque vai ao banco — substitui a filtragem em memória sobre NFs[].
 *
 * @param {string} [filter] - 'todas' | 'pagas' | 'pendentes' | 'recorrentes'
 * @param {string} [search] - texto livre (debounced)
 */
async function buildNFList(filter, search) {
  filter = filter || _nfFilter;
  search = (search !== undefined ? search : (document.getElementById('nfSearch')?.value || '')).trim();

  const el = document.getElementById('nfList');
  if (!el) return;

  // Feedback visual imediato enquanto aguarda resposta
  el.innerHTML = '<div style="text-align:center;padding:32px;font-family:var(--f-mono);font-size:10px;color:var(--muted)">CARREGANDO…</div>';

  let list = [];
  try {
    list = await fetchNFs({
      companyId: (typeof _activeCompany !== 'undefined' && _activeCompany?.id) || undefined,
      status:    filter !== 'todas' ? filter : undefined,
      search:    search || undefined,
    });

    // Sincroniza array global para que outros módulos (ex.: buildCalendar)
    // reflitam o subconjunto filtrado sem nova chamada de rede.
    NFs.length = 0;
    NFs.push(...list);
  } catch (err) {
    console.warn('[buildNFList]', err);
    el.innerHTML = _emptyState('⚠️', 'ERRO AO CARREGAR', 'Verifique sua conexão e tente novamente.');
    return;
  }

  el.innerHTML = '';

  if (!list.length) {
    el.innerHTML = _emptyState('🔍', 'NENHUM RESULTADO',
      filter !== 'todas' ? 'Tente mudar o filtro ou a busca.' : 'Emita sua primeira nota fiscal.');
    return;
  }

  list.forEach(nf => {
    const s    = STATUS_CFG[nf.status];
    const card = document.createElement('div');
    card.className = 'nf-card';
    card.innerHTML = `
      <div class="nf-main">
        <div class="nf-ico">${nf.ico}</div>
        <div class="nf-body">
          <div class="nf-client">${nf.client}</div>
          <div class="nf-meta">${nf.id} · ${nf.date}${nf.rec ? ' · <span style="color:var(--accent)">●REC</span>' : ''}</div>
        </div>
        <div class="nf-right">
          <div class="nf-val val" data-raw="${nf.raw}">${fmtVal(nf.val)}</div>
          <div class="badge ${s.cls}">${s.label}</div>
        </div>
      </div>
      <div class="nf-expand">
        <div class="nf-btns">
          <button class="nf-btn s" onclick="event.stopPropagation();toast('📄','PDF baixado')">⬇ PDF</button>
          <button class="nf-btn s" onclick="event.stopPropagation();toast('📤','Enviado por email')">📤 Enviar</button>
          <button class="nf-btn p" onclick="event.stopPropagation();toast('🔄','Nota duplicada')">Duplicar</button>
        </div>
      </div>`;
    card.addEventListener('click', () => card.classList.toggle('open'));
    el.appendChild(card);
  });
}

/**
 * Troca a aba ativa e dispara buildNFList com o filtro correto.
 * Síncrona — buildNFList cuida da assincronicidade internamente.
 */
function setNFTab(filter, tabEl) {
  document.querySelectorAll('.tab-row .tab').forEach(t => t.classList.remove('on'));
  tabEl.classList.add('on');
  _nfFilter = filter;
  buildNFList(filter, document.getElementById('nfSearch')?.value || '');
}

/**
 * Chamada pelo oninput do campo de busca.
 * Debounce de 350 ms para não disparar uma query por tecla.
 */
function filterNFs(val) {
  clearTimeout(_nfSearchTimer);
  _nfSearchTimer = setTimeout(() => buildNFList(_nfFilter, val), 350);
}

/* ════════════════════
   EXTRATO
════════════════════ */
function buildExtrato() {
  const el = document.getElementById('extratoList');
  if (!el) return;
  el.innerHTML = '';

  if (!EXTRATO.length) {
    el.innerHTML = _emptyState('📒', 'SEM MOVIMENTAÇÕES', 'As transações do mês aparecerão aqui.');
    return;
  }

  EXTRATO.forEach(grp => {
    const sep = document.createElement('div');
    sep.className = 'ext-sep';
    sep.textContent = grp.grp;
    el.appendChild(sep);

    grp.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ext-row';
      row.innerHTML = `
        <div class="ext-ico ${item.dir}">${item.ico}</div>
        <div class="ext-body">
          <div class="ext-desc">${item.desc}</div>
          <div class="ext-cat">${item.cat}</div>
        </div>
        <div class="ext-val ${item.dir} val" data-raw="${item.raw}">${fmtVal(item.val)}</div>`;
      row.addEventListener('click', () => toast('💬', item.desc + ': ' + item.val));
      el.appendChild(row);
    });
  });
}

/* ════════════════════
   A PAGAR / RECEBER
════════════════════ */

function makePayRow(item, i, type) {
  const div = document.createElement('div');
  div.className = 'pay-row' + (item.done ? ' done' : '');
  const btnLabel = item.done ? '✓' : (type === 'pagar' ? 'PAGAR' : 'CONFIRMAR');
  const btnStyle = item.done
    ? 'background:var(--green-d);color:var(--green);border:1px solid var(--green-b)'
    : 'background:var(--lift);color:var(--soft);border:1px solid var(--border2)';
  div.innerHTML = `
    <div class="pay-ico">${item.ico}</div>
    <div class="pay-body">
      <div class="pay-name">${item.name}</div>
      <div class="pay-when" style="color:${item.color}">${item.when}</div>
    </div>
    <div class="pay-right">
      <div class="pay-val val" style="color:${item.color}" data-raw="${item.val}">${fmtVal(item.val)}</div>
      <button class="pay-btn" style="${btnStyle}"
        onclick="event.stopPropagation();markPay(${i},'${type}')">${btnLabel}</button>
    </div>`;
  return div;
}

function buildPagar() {
  const el = document.getElementById('pagarList');
  if (!el) return;
  el.innerHTML = '';
  if (!PAGAR.length) {
    el.innerHTML = _emptyState('✅', 'NADA A PAGAR', 'Nenhuma conta pendente nos próximos 30 dias.');
    return;
  }
  PAGAR.forEach((row, i) => el.appendChild(makePayRow(row, i, 'pagar')));
}

function buildReceber() {
  const el = document.getElementById('receberList');
  if (!el) return;
  el.innerHTML = '';
  if (!RECEBER.length) {
    el.innerHTML = _emptyState('💸', 'NADA A RECEBER', 'Nenhuma nota pendente ou vencida.');
    return;
  }
  RECEBER.forEach((row, i) => el.appendChild(makePayRow(row, i, 'receber')));
}

/**
 * Persiste o pagamento no Supabase (otimismo: atualiza UI antes,
 * reverte em caso de erro).
 *
 * @param {number} i    - índice no array PAGAR ou RECEBER
 * @param {string} type - 'pagar' | 'receber'
 */
async function markPay(i, type) {
  const arr     = type === 'pagar' ? PAGAR : RECEBER;
  const rebuild = type === 'pagar' ? buildPagar : buildReceber;
  const item    = arr[i];
  if (!item) return;

  // Otimismo: reflete na UI imediatamente
  const prevDone = item.done;
  item.done = !prevDone;
  rebuild();

  try {
    if (item._id) {
      if (type === 'pagar') {
        await pagarConta(item._id);
      } else {
        await marcarNFRecebida(item._id);
      }
    }
    toast('✅', item.done ? 'Marcado como pago!' : 'Marcação removida.');
  } catch (err) {
    // Rollback: desfaz a mudança otimista
    item.done = prevDone;
    rebuild();
    toast('❌', 'Erro ao salvar: ' + (err.message || err));
    console.error('[markPay]', err);
  }
}

function setFtab(tab, tabEl) {
  document.querySelectorAll('.ftab').forEach(el => el.classList.remove('on'));
  document.querySelectorAll('.fpanel').forEach(el => el.classList.remove('on'));
  if (tabEl) {
    tabEl.classList.add('on');
  } else {
    const order = ['extrato', 'fluxo', 'pagar', 'receber'];
    const tabs  = document.querySelectorAll('.ftab');
    const idx   = order.indexOf(tab);
    if (tabs[idx]) tabs[idx].classList.add('on');
  }
  document.getElementById('fp-' + tab).classList.add('on');
  if (tab === 'fluxo') setTimeout(buildCFChart, 50);
}

/* ════════════════════
   IMPOSTOS
════════════════════ */
function buildTaxList() {
  const el = document.getElementById('taxList');
  if (!el) return;
  el.innerHTML = '';

  if (!IMPOSTOS.length) {
    el.innerHTML = _emptyState('🧾', 'SEM IMPOSTOS REGISTRADOS',
      'Nenhum imposto encontrado para a empresa selecionada.');
    return;
  }

  IMPOSTOS.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'tax-row';
    div.innerHTML = `
      <div class="tr-top">
        <div class="tr-ico" style="background:${row.bg};border:1px solid ${row.border}">${row.ico}</div>
        <div class="tr-info">
          <div class="tr-name">${row.name}</div>
          <div class="tr-due" style="color:${row.color}">${row.due}</div>
        </div>
        <div class="tr-val val" style="color:${row.color}" data-raw="${row.val}">${fmtBRL(row.val)}</div>
      </div>
      <div class="tr-track">
        <div class="tr-fill" style="background:${row.color}" data-f="${row.fill}"></div>
      </div>
      <div class="tr-detail">
        <div class="trd-grid">
          <div class="trd"><div class="trd-lbl">Base de cálculo</div><div class="trd-val">${fmtBRL(row.detail.base)}</div></div>
          <div class="trd"><div class="trd-lbl">Alíquota</div><div class="trd-val">${row.detail.aliq}</div></div>
          <div class="trd"><div class="trd-lbl">Competência</div><div class="trd-val">${row.detail.comp}</div></div>
          <div class="trd"><div class="trd-lbl">Regime</div><div class="trd-val">${row.detail.regime}</div></div>
        </div>
        ${row.val !== '—'
          ? `<button class="tr-pay-btn"
               onclick="event.stopPropagation();marcarImpostoPago('${row._id}')">
               Marcar como pago
             </button>`
          : ''}
      </div>`;
    div.addEventListener('click', () => div.classList.toggle('open'));
    el.appendChild(div);
    setTimeout(() => {
      const fill = div.querySelector('.tr-fill');
      if (fill) fill.style.width = fill.dataset.f + '%';
    }, 250 + i * 80);
  });
}

/* ════════════════════
   CALENDÁRIO
════════════════════ */

/**
 * Constrói o calendário a partir dos dados já em memória (IMPOSTOS e NFs).
 * Nenhuma chamada de rede — usa os arrays globais populados por loadAllData().
 *
 * Lógica de marcação de dias:
 *  - Imposto pendente/atrasado no mês → ponto vermelho (ev red)
 *  - Imposto pago no mês              → ponto verde  (ev green)
 *  - NF pendente/vencida no mês       → ponto âmbar  (ev amber)
 *  - NF paga no mês                   → ponto verde  (ev green)
 */
function buildCalendar() {
  const el = document.getElementById('calGrid');
  if (!el) return;

  const year  = _calDate.getFullYear();
  const month = _calDate.getMonth(); // 0-indexed

  document.getElementById('calMonth').textContent = MONTHS_PT[month] + ' ' + year;
  el.innerHTML = '';

  // Cabeçalho dos dias da semana
  ['D','S','T','Q','Q','S','S'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cc hdr';
    h.textContent = d;
    el.appendChild(h);
  });

  // ── Derivar eventos dos arrays globais ───────────────────────────
  const eventos = {};

  function addEvento(dateStr, cls, msg) {
    if (!dateStr) return;
    const d = new Date(dateStr + 'T12:00:00');
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const day = d.getDate();
    if (!eventos[day]) eventos[day] = { classes: new Set(), msgs: [] };
    eventos[day].classes.add(cls);
    if (msg) eventos[day].msgs.push(msg);
  }

  // Impostos
  IMPOSTOS.forEach(imp => {
    if (!imp.vencimento) return;
    if (imp.status === 'pago') {
      addEvento(imp.vencimento, 'green', imp.name + ' — pago ✓');
    } else if (imp.status === 'atrasado') {
      addEvento(imp.vencimento, 'red', imp.name + ' — ATRASADO ⚠️');
    } else {
      addEvento(imp.vencimento, 'red', imp.name + ' — vence hoje');
    }
  });

  // NFs — apenas quando _rawDate estiver disponível no objeto
  NFs.forEach(nf => {
    if (nf._rawDate) {
      if (nf.status === 'paid') {
        addEvento(nf._rawDate, 'green', 'NF ' + nf.id + ' — recebida ✓');
      } else {
        addEvento(nf._rawDate, 'amber', 'NF ' + nf.id + ' — ' + (nf.status === 'overdue' ? 'VENCIDA' : 'pendente'));
      }
    }
  });

  // ── Renderizar células ──────────────────────────────────────────
  const firstDay  = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const today     = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cc';
    el.appendChild(e);
  }

  for (let day = 1; day <= totalDays; day++) {
    const e = document.createElement('div');
    e.className = 'cc';
    e.textContent = day;

    if (isCurrentMonth && day === today.getDate()) {
      e.classList.add('today');
    }

    const ev = eventos[day];
    if (ev) {
      e.classList.add('ev');
      if (ev.classes.has('red'))        e.classList.add('red');
      else if (ev.classes.has('amber')) e.classList.add('amber');
      else if (ev.classes.has('green')) e.classList.add('green');

      const msgs = ev.msgs;
      e.addEventListener('click', () => {
        if (msgs.length === 1) {
          toast('📅', msgs[0]);
        } else {
          toast('📅', msgs.length + ' eventos — ' + msgs[0] + (msgs.length > 1 ? ' e mais.' : ''));
        }
      });
    }

    el.appendChild(e);
  }
}

function shiftMonth(delta) {
  _calDate.setMonth(_calDate.getMonth() + delta);
  buildCalendar();
}

/* ════════════════════
   PRÓ-LABORE / FATOR R
════════════════════ */

/**
 * Recalcula e exibe o Simulador de Fator R.
 *
 * Usa computeFR() de state.js — nunca os valores hardcoded do antigo FR.
 * computeFR() deriva faturamento_12m de _activeCompany (campo do banco)
 * ou do somatório de CASH.income como fallback.
 *
 * @param {number|string} val - valor do pró-labore simulado (slider ou input)
 */
function updateSim(val) {
  val = parseInt(val);

  // FR dinâmico — reflete a empresa ativa atual
  const fr_obj = computeFR();

  const simValEl = document.getElementById('simVal');
  delete simValEl.dataset.orig;
  simValEl.dataset.raw = val;
  simValEl.innerHTML = 'R$ ' + val.toLocaleString('pt-BR') + '<span class="cents">,00</span>';
  if (_hidden) {
    simValEl.dataset.orig = simValEl.innerHTML;
    simValEl.innerHTML = '<span style="letter-spacing:2px">••••</span>';
  }

  // Fator R = pró-labore ÷ faturamento 12 meses × 100
  const frPct = val / fr_obj.faturamento * 100;
  const isB3  = frPct >= 28;

  const frPctEl = document.getElementById('frPct');
  delete frPctEl.dataset.orig;
  frPctEl.dataset.raw = frPct.toFixed(1) + 'pct';
  frPctEl.innerHTML   = frPct.toFixed(1) + '%';
  frPctEl.className   = 'fr-pct val ' + (isB3 ? 'good' : 'warn');
  if (_hidden) {
    frPctEl.dataset.orig = frPctEl.innerHTML;
    frPctEl.innerHTML = '<span style="letter-spacing:2px">••••</span>';
  }

  // Faturamento de referência visível no subtítulo do simulador
  const faturRef = document.getElementById('simFaturRef');
  if (faturRef) {
    faturRef.textContent = 'Base: R$ ' + fr_obj.faturamento.toLocaleString('pt-BR') + ' (12 meses)';
  }

  const res = document.getElementById('simResult');
  if (isB3) {
    res.className = 'sim-result good';
    res.querySelector('.sim-r-ico').textContent = '🎉';
    document.getElementById('simTitle').textContent = 'Anexo III — economia real!';
    document.getElementById('simTitle').style.color = 'var(--green)';
    document.getElementById('simDesc').textContent  =
      'Fator R ' + frPct.toFixed(1) + '% — acima de 28%. Alíquota: '
      + (fr_obj.aliq5 * 100).toFixed(1) + '% → ~' + (fr_obj.aliq3 * 100).toFixed(1) + '%.';

    // Economia estimada: diferença de alíquota × faturamento anual,
    // menos o custo incremental de INSS sobre o aumento de pró-labore (11%)
    const econ = Math.round(
      (fr_obj.faturamento * (fr_obj.aliq5 - fr_obj.aliq3))
      - (val - fr_obj.baseAtual) * 0.11
    );
    const simSavEl = document.getElementById('simSav');
    delete simSavEl.dataset.orig;
    simSavEl.dataset.raw = econ > 0 ? econ : 0;
    simSavEl.innerHTML   = econ > 0 ? 'R$ ' + econ.toLocaleString('pt-BR') + '<span class="cents">,00</span>' : '—';
    if (_hidden && econ > 0) {
      simSavEl.dataset.orig = simSavEl.innerHTML;
      simSavEl.innerHTML = '<span style="letter-spacing:2px">••••</span>';
    }
    simSavEl.style.color = econ > 0 ? 'var(--green)' : 'var(--muted)';
    document.getElementById('frTitle').textContent = 'Você está no Anexo III 🎉';
    document.getElementById('frDesc').textContent  = 'Fator R acima de 28% — menor alíquota';
    document.getElementById('frArrow').textContent = '🎉';
  } else {
    res.className = 'sim-result warn';
    res.querySelector('.sim-r-ico').textContent = '⚠️';
    document.getElementById('simTitle').textContent = 'Ainda no Anexo V';
    document.getElementById('simTitle').style.color = 'var(--amber)';
    const needed = Math.ceil(fr_obj.faturamento * 0.28 - val);
    document.getElementById('simDesc').textContent  =
      'Falta R$ ' + needed.toLocaleString('pt-BR') + ',00 de pró-labore para atingir 28%.';
    document.getElementById('simSav').textContent   = '—';
    document.getElementById('simSav').style.color   = 'var(--muted)';
    document.getElementById('frTitle').textContent  = 'Você está no Anexo V';
    document.getElementById('frDesc').textContent   = 'Fator R abaixo de 28% — alíquota mais alta';
    document.getElementById('frArrow').textContent  = '⚠️';
  }
}

function buildPLHist() {
  const el = document.getElementById('plHist');
  if (!el) return;
  el.innerHTML = '';

  if (!PL_HIST.length) {
    el.innerHTML = _emptyState('📋', 'SEM HISTÓRICO DE PRÓ-LABORE',
      'Os registros mensais aparecerão aqui\nassim que forem lançados.');
    return;
  }

  PL_HIST.forEach(item => {
    const div = document.createElement('div');
    div.className = 'plh';
    div.innerHTML = `
      <div class="plh-ico">${item.paid ? '✅' : '📋'}</div>
      <div class="plh-body">
        <div class="plh-month">${item.month}</div>
        <div class="plh-detail">INSS: <span class="val" data-raw="${item.inss}">R$ ${fmtVal(item.inss)}</span> · Líquido: <span class="val" data-raw="${item.net}">R$ ${fmtVal(item.net)}</span></div>
      </div>
      <div class="plh-right">
        <div class="plh-val val" data-raw="${item.val}">R$ ${fmtVal(item.val.includes(',') ? item.val : item.val + ',00')}</div>
        <div class="badge ${item.paid ? 'ok' : 'mid'}">${item.paid ? 'PAGO' : 'PENDENTE'}</div>
      </div>`;
    div.addEventListener('click', () => toast('🧾', 'Recibo de ' + item.month + ' baixado'));
    el.appendChild(div);
  });
}

/* ════════════════════
   EXPOR AO ESCOPO GLOBAL
   (necessário para handlers inline no HTML)
════════════════════ */
window.setNFTab   = setNFTab;
window.markPay    = markPay;
window.filterNFs  = filterNFs;
window.setFtab    = setFtab;
window.shiftMonth = shiftMonth;
window.updateSim  = updateSim;
