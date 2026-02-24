/* ════════════════════════════════════════════════
   CHARTS.JS — gráficos animados do app

   Expõe:
     buildHomeChart()  — sparkline + barras de progresso (home)
     buildCFChart()    — barras duplas receita/despesa (financeiro)
     fmtK(val)         — formata número como "1.2K" ou "R$ 350,00"
     fmtKPI(val)       — "+ R$ 1.234,56" / "- R$ 1.234,56" (resultado)
     fmtSimples(val)   — "R$ 1.234,56" sem sinal (entradas/saídas)

   Fontes de dados:
     • buildHomeChart lê data-attributes injetados por renderKPIs()
       (data-income em #cfeIncFill, data-expense em #cfeExpFill)
     • buildCFChart e a sparkline consomem CASH[] de state.js,
       populado por fetchCashFlow() via loadAllData()

   Ordem de carregamento: charts.js vem ANTES de main-supabase.js,
   portanto fmtK/fmtKPI/fmtSimples estão disponíveis quando
   renderKPIs() é chamada.
════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   FORMATAÇÃO MONETÁRIA — único ponto de verdade
   Usadas por renderKPIs() em main-supabase.js
   e pelos builders de gráfico abaixo.
───────────────────────────────────────────────*/

/**
 * Formata um valor monetário compacto para rótulos de gráfico.
 * Ex.: 1250 → "1.3K" | 350 → "R$ 350,00" | -2000 → "-2K"
 *
 * @param {number} val
 * @returns {string}
 */
function fmtK(val) {
  const abs = Math.abs(val);
  if (abs >= 1000) return (val < 0 ? '-' : '') + (abs / 1000).toFixed(1) + 'K';
  return 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/**
 * Formata resultado com sinal explícito e centavos em <span>.
 * Ex.: 1234.56  → "+ R$ 1.234<span>,56</span>"
 *      -500     → "- R$ 500<span>,00</span>"
 * Usado pelo card de resultado do mês na home.
 *
 * @param {number} val
 * @returns {string} HTML
 */
function fmtKPI(val) {
  const str = Math.abs(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const [int, dec] = str.split(',');
  return `${val < 0 ? '- ' : '+ '}R$ ${int}<span class="cents">,${dec}</span>`;
}

/**
 * Formata valor sem sinal, com centavos em <span>.
 * Ex.: 3200 → "R$ 3.200<span>,00</span>"
 * Usado pelos campos de entradas e saídas na home.
 *
 * @param {number} val
 * @returns {string} HTML
 */
function fmtSimples(val) {
  const str = val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const [int, dec] = str.split(',');
  return `R$ ${int}<span class="cents">,${dec}</span>`;
}


/* ─────────────────────────────────────────────
   buildHomeChart
   Barras de progresso receita × despesa + sparkline
   de resultado líquido dos últimos 5 meses.

   Lê os data-attributes injetados por renderKPIs():
     #cfeIncFill[data-income]
     #cfeExpFill[data-expense]
   Se renderKPIs ainda não rodou (boot rápido),
   as barras ficam em 0 sem erro.
───────────────────────────────────────────────*/
function buildHomeChart() {
  const incFill = document.getElementById('cfeIncFill');
  const expFill = document.getElementById('cfeExpFill');

  const receita = parseFloat(incFill?.dataset.income  || 0);
  const despesa = parseFloat(expFill?.dataset.expense || 0);

  // Animação das barras de progresso
  setTimeout(() => {
    if (incFill) incFill.style.width = receita > 0 ? '100%' : '0%';
    if (expFill) {
      expFill.style.width = receita > 0
        ? Math.min((despesa / receita) * 100, 100).toFixed(1) + '%'
        : '0%';
    }
  }, 300);

  // ── Sparkline ────────────────────────────────────────────────────
  const el = document.getElementById('cfeSparkline');
  if (!el) return;
  el.innerHTML = '';

  // Aguarda CASH ser populado por loadAllData() — sem dados, não renderiza
  if (!CASH.months.length) return;

  const count   = Math.min(5, CASH.months.length);
  const months  = CASH.months.slice(-count);
  const income  = CASH.income.slice(-count);
  const expense = CASH.expense.slice(-count);
  const results = income.map((inc, i) => inc - expense[i]);
  const maxAbs  = Math.max(...results.map(Math.abs), 1);

  months.forEach((m, i) => {
    const r         = results[i];
    const isPos     = r >= 0;
    const isCurrent = i === count - 1;
    const h         = Math.max((Math.abs(r) / maxAbs) * 28, 4);

    const col = document.createElement('div');
    col.className = 'cfe-spark-col';
    // title = tooltip nativo ao passar o mouse — informa o valor real
    col.title = m + ': ' + (isPos ? '+' : '-') + ' R$ ' + Math.abs(r).toLocaleString('pt-BR');
    col.innerHTML = `
      <div class="cfe-spark-bar ${isPos ? 'pos' : 'neg'}${isCurrent ? ' current' : ''}"
           style="height:0" data-h="${h}"></div>
      <div class="cfe-spark-lbl">${m}</div>
    `;
    el.appendChild(col);
    setTimeout(() => {
      col.querySelector('.cfe-spark-bar').style.height = h + 'px';
    }, 400 + i * 60);
  });
}


/* ─────────────────────────────────────────────
   buildCFChart
   Barras duplas receita (verde) / despesa (vermelho)
   para cada um dos últimos 12 meses — tela Financeiro.

   Consome CASH[] de state.js.
   Se não houver dados, exibe estado vazio no lugar.
───────────────────────────────────────────────*/
function buildCFChart() {
  const barsEl = document.getElementById('cfBars');
  const lblsEl = document.getElementById('cfLbls');
  if (!barsEl || !lblsEl) return;

  barsEl.innerHTML = '';
  lblsEl.innerHTML = '';

  // ── Estado vazio ─────────────────────────────────────────────────
  if (!CASH.months.length) {
    const empty = document.createElement('div');
    empty.style.cssText = [
      'grid-column:1/-1', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'padding:32px 16px', 'gap:8px',
    ].join(';');
    empty.innerHTML = `
      <div style="font-size:28px">📊</div>
      <div style="font-family:var(--f-mono);font-size:10px;font-weight:700;
                  color:var(--bright);letter-spacing:.5px;">SEM DADOS DE FLUXO</div>
      <div style="font-family:var(--f-mono);font-size:10px;color:var(--muted)">
        Registre transações para ver o gráfico.
      </div>`;
    barsEl.appendChild(empty);
    return;
  }

  // ── Escala: máximo entre receita e despesa de todos os meses ─────
  const maxVal = Math.max(...CASH.income, ...CASH.expense, 1);

  CASH.months.forEach((m, i) => {
    const incVal = CASH.income[i]  || 0;
    const expVal = CASH.expense[i] || 0;

    const pair = document.createElement('div');
    pair.className = 'cf-pair';

    const bi = document.createElement('div');
    bi.className = 'cf-bar i';
    bi.style.height = '0';
    // Tooltip com valores reais ao passar o mouse
    bi.title = m + ' receita: R$ ' + incVal.toLocaleString('pt-BR');

    const bo = document.createElement('div');
    bo.className = 'cf-bar o';
    bo.style.height = '0';
    bo.title = m + ' despesa: R$ ' + expVal.toLocaleString('pt-BR');

    pair.appendChild(bi);
    pair.appendChild(bo);
    barsEl.appendChild(pair);

    const lbl = document.createElement('div');
    lbl.className = 'cf-lbl';
    lbl.textContent = m;
    lblsEl.appendChild(lbl);

    setTimeout(() => {
      bi.style.height = (incVal / maxVal * 90).toFixed(1) + 'px';
      bo.style.height = (expVal / maxVal * 90).toFixed(1) + 'px';
    }, 100 + i * 40);
  });
}

/*
  ╔══════════════════════════════════════════════╗
  ║  setChartMode() — REMOVIDA INTENCIONALMENTE  ║
  ║                                              ║
  ║  Era um stub vazio sem implementação.        ║
  ║  Não há chamadas a setChartMode() no HTML    ║
  ║  nem em outros arquivos JS.                  ║
  ║  A variável _chartMode em state.js está      ║
  ║  reservada para uso futuro se necessário.    ║
  ╚══════════════════════════════════════════════╝
*/
