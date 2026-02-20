/* ════════════════════
   CHARTS
════════════════════ */
function buildHomeChart() {
  // Barras de entrada/saída animadas
  setTimeout(() => {
    const incFill = document.getElementById('cfeIncFill');
    const expFill = document.getElementById('cfeExpFill');
    if (incFill) incFill.style.width = '100%';
    if (expFill) expFill.style.width = (8293/32094*100).toFixed(1) + '%';
  }, 300);

  // Sparkline — resultado líquido dos últimos 5 meses
  const el = document.getElementById('cfeSparkline');
  if (!el) return;
  el.innerHTML = '';

  const count = 5;
  const months  = CASH.months.slice(-count);
  const income  = CASH.income.slice(-count);
  const expense = CASH.expense.slice(-count);
  const results = income.map((inc, i) => inc - expense[i]);
  const maxAbs  = Math.max(...results.map(Math.abs));

  months.forEach((m, i) => {
    const r = results[i];
    const isPos = r >= 0;
    const isCurrent = i === count - 1;
    const h = Math.max((Math.abs(r) / maxAbs) * 28, 4);

    const col = document.createElement('div');
    col.className = 'cfe-spark-col';
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

function fmtK(val) {
  const abs = Math.abs(val);
  if (abs >= 1000) return (val < 0 ? '-' : '') + (abs/1000).toFixed(0) + 'k';
  return val.toString();
}

function setChartMode() { /* compatibilidade */ }
function buildCFChart() {
  const barsEl = document.getElementById('cfBars');
  const lblsEl = document.getElementById('cfLbls');
  if (!barsEl) return;
  barsEl.innerHTML = ''; lblsEl.innerHTML = '';
  const maxVal = Math.max(...CASH.income, ...CASH.expense);
  CASH.months.forEach((m, i) => {
    const pair = document.createElement('div'); pair.className = 'cf-pair';
    const bi = document.createElement('div'); bi.className = 'cf-bar i'; bi.style.height='0';
    const bo = document.createElement('div'); bo.className = 'cf-bar o'; bo.style.height='0';
    pair.appendChild(bi); pair.appendChild(bo); barsEl.appendChild(pair);
    const lbl = document.createElement('div'); lbl.className = 'cf-lbl'; lbl.textContent = m; lblsEl.appendChild(lbl);
    setTimeout(() => {
      bi.style.height = (CASH.income[i]/maxVal*90)+'px';
      bo.style.height = (CASH.expense[i]/maxVal*90)+'px';
    }, 100 + i*40);
  });
}
