/* Format value with cents span */
function fmtVal(v) {
  if (!v || v === '—') return v;
  const m = String(v).match(/^(.*),(\d{2})$/);
  if (!m) return v;
  return m[1] + '<span class="cents">,' + m[2] + '</span>';
}
/* Format "R$ X.XXX,XX" string with cents span (or return as-is if '—' or foreign) */
function fmtBRL(v) {
  if (!v || v === '—') return v;
  if (v.startsWith('R$ ')) return 'R$ ' + fmtVal(v.slice(3));
  return fmtVal(v);
}

/* ════════════════════
   NOTAS FISCAIS
════════════════════ */
function buildNFList(filter, search) {
  filter = filter || _nfFilter; search = search || '';
  const el = document.getElementById('nfList'); if (!el) return;
  el.innerHTML = '';
  const list = NFs.filter(nf => {
    const fOk = filter === 'todas' ||
      (filter === 'pagas' && nf.status === 'paid') ||
      (filter === 'pendentes' && (nf.status === 'pending' || nf.status === 'overdue')) ||
      (filter === 'recorrentes' && nf.rec);
    const sOk = !search || nf.client.toLowerCase().includes(search.toLowerCase()) || nf.id.includes(search);
    return fOk && sOk;
  });
  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;font-family:var(--f-mono);font-size:11px;color:var(--muted)">NENHUM RESULTADO</div>';
    return;
  }
  const s_colors = { paid:'var(--green)', pending:'var(--amber)', overdue:'var(--red)' };
  list.forEach(nf => {
    const s = STATUS_CFG[nf.status];
    const card = document.createElement('div'); card.className = 'nf-card';
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
function setNFTab(filter, tabEl) {
  document.querySelectorAll('.tab-row .tab').forEach(t => t.classList.remove('on'));
  tabEl.classList.add('on'); _nfFilter = filter;
  buildNFList(filter, document.getElementById('nfSearch').value);
}
function filterNFs(val) { buildNFList(_nfFilter, val); }

/* ════════════════════
   EXTRATO
════════════════════ */
function buildExtrato() {
  const el = document.getElementById('extratoList'); if (!el) return; el.innerHTML = '';
  EXTRATO.forEach(grp => {
    const sep = document.createElement('div'); sep.className = 'ext-sep'; sep.textContent = grp.grp; el.appendChild(sep);
    grp.items.forEach(item => {
      const row = document.createElement('div'); row.className = 'ext-row';
      row.innerHTML = `
        <div class="ext-ico ${item.dir}">${item.ico}</div>
        <div class="ext-body"><div class="ext-desc">${item.desc}</div><div class="ext-cat">${item.cat}</div></div>
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
  const div = document.createElement('div'); div.className = 'pay-row' + (item.done ? ' done' : '');
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
      <button class="pay-btn" style="${btnStyle}" onclick="event.stopPropagation();markPay(${i},'${type}')">${btnLabel}</button>
    </div>`;
  return div;
}
function buildPagar() {
  const el = document.getElementById('pagarList'); if (!el) return; el.innerHTML = '';
  PAGAR.forEach((row, i) => el.appendChild(makePayRow(row, i, 'pagar')));
}
function buildReceber() {
  const el = document.getElementById('receberList'); if (!el) return; el.innerHTML = '';
  RECEBER.forEach((row, i) => el.appendChild(makePayRow(row, i, 'receber')));
}
function markPay(i, type) {
  if (type === 'pagar') { PAGAR[i].done = !PAGAR[i].done; buildPagar(); }
  else { RECEBER[i].done = !RECEBER[i].done; buildReceber(); }
  toast('✅','Status atualizado');
}
function setFtab(tab, tabEl) {
  document.querySelectorAll('.ftab').forEach(el => el.classList.remove('on'));
  document.querySelectorAll('.fpanel').forEach(el => el.classList.remove('on'));
  if (tabEl) tabEl.classList.add('on');
  else {
    const order = ['extrato','fluxo','pagar','receber'];
    const tabs = document.querySelectorAll('.ftab');
    const idx = order.indexOf(tab); if (tabs[idx]) tabs[idx].classList.add('on');
  }
  document.getElementById('fp-' + tab).classList.add('on');
  if (tab === 'fluxo') setTimeout(buildCFChart, 50);
}

/* ════════════════════
   IMPOSTOS
════════════════════ */
function buildTaxList() {
  const el = document.getElementById('taxList'); if (!el) return; el.innerHTML = '';
  IMPOSTOS.forEach((row, i) => {
    const div = document.createElement('div'); div.className = 'tax-row';
    div.innerHTML = `
      <div class="tr-top">
        <div class="tr-ico" style="background:${row.bg};border:1px solid ${row.border}">${row.ico}</div>
        <div class="tr-info">
          <div class="tr-name">${row.name}</div>
          <div class="tr-due" style="color:${row.color}">${row.due}</div>
        </div>
        <div class="tr-val val" style="color:${row.color}" data-raw="${row.val}">${fmtBRL(row.val)}</div>
      </div>
      <div class="tr-track"><div class="tr-fill" style="background:${row.color}" data-f="${row.fill}"></div></div>
      <div class="tr-detail">
        <div class="trd-grid">
          <div class="trd"><div class="trd-lbl">Base de cálculo</div><div class="trd-val">${fmtBRL(row.detail.base)}</div></div>
          <div class="trd"><div class="trd-lbl">Alíquota</div><div class="trd-val">${row.detail.aliq}</div></div>
          <div class="trd"><div class="trd-lbl">Competência</div><div class="trd-val">${row.detail.comp}</div></div>
          <div class="trd"><div class="trd-lbl">Regime</div><div class="trd-val">${row.detail.regime}</div></div>
        </div>
        ${row.val !== '—' ? '<button class="tr-pay-btn" onclick="event.stopPropagation();toast(\'💳\',\'Código de barras copiado!\')">Gerar boleto / PIX</button>' : ''}
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
function buildCalendar() {
  const el = document.getElementById('calGrid'); if (!el) return;
  document.getElementById('calMonth').textContent = MONTHS_PT[_calDate.getMonth()] + ' ' + _calDate.getFullYear();
  el.innerHTML = '';
  ['D','S','T','Q','Q','S','S'].forEach(d => {
    const h = document.createElement('div'); h.className = 'cc hdr'; h.textContent = d; el.appendChild(h);
  });
  const firstDay = new Date(_calDate.getFullYear(), _calDate.getMonth(), 1).getDay();
  const totalDays = new Date(_calDate.getFullYear(), _calDate.getMonth()+1, 0).getDate();
  const todayD = (_calDate.getMonth()===1 && _calDate.getFullYear()===2025) ? 20 : -1;
  for (let i=0; i<firstDay; i++) { const e=document.createElement('div'); e.className='cc'; el.appendChild(e); }
  for (let d=1; d<=totalDays; d++) {
    ((day) => {
      const e = document.createElement('div'); e.className = 'cc'; e.textContent = day;
      if (day === todayD) e.classList.add('today');
      if ([20].includes(day)) e.classList.add('ev','red');
      else if ([28].includes(day)) e.classList.add('ev');
      else if ([5,12].includes(day)) e.classList.add('ev','green');
      e.addEventListener('click', () => {
        const msg = [20].includes(day) ? 'DAS vence hoje! ⚠️' : [28].includes(day) ? 'ISS vence neste dia' : [5,12].includes(day) ? 'Imposto pago ✓' : '';
        if (msg) toast('📅', msg);
      });
      el.appendChild(e);
    })(d);
  }
}
function shiftMonth(delta) { _calDate.setMonth(_calDate.getMonth()+delta); buildCalendar(); }

/* ════════════════════
   PRÓ-LABORE / FATOR R
════════════════════ */
function updateSim(val) {
  val = parseInt(val);
  const simValEl = document.getElementById('simVal');
  delete simValEl.dataset.orig;
  simValEl.dataset.raw = val;
  simValEl.innerHTML = 'R$ ' + val.toLocaleString('pt-BR') + '<span class="cents">,00</span>';
  if (_hidden) { simValEl.dataset.orig = simValEl.innerHTML; simValEl.innerHTML = '<span style="letter-spacing:2px">••••</span>'; }
  const fr = val / FR.faturamento * 100;
  const isB3 = fr >= 28;
  const frPctEl = document.getElementById('frPct');
  delete frPctEl.dataset.orig;
  frPctEl.dataset.raw = fr.toFixed(1) + 'pct';
  frPctEl.innerHTML = fr.toFixed(1) + '%';
  frPctEl.className = 'fr-pct val ' + (isB3 ? 'good' : 'warn');
  if (_hidden) { frPctEl.dataset.orig = frPctEl.innerHTML; frPctEl.innerHTML = '<span style="letter-spacing:2px">••••</span>'; }
  const res = document.getElementById('simResult');
  if (isB3) {
    res.className = 'sim-result good';
    res.querySelector('.sim-r-ico').textContent = '🎉';
    document.getElementById('simTitle').textContent = 'Anexo III — economia real!';
    document.getElementById('simTitle').style.color = 'var(--green)';
    document.getElementById('simDesc').textContent = 'Fator R ' + fr.toFixed(1) + '% — acima de 28%. Alíquota: 15,5% → ~6%.';
    const econ = Math.round((FR.faturamento*(FR.aliq5-FR.aliq3)) - (val-FR.baseAtual)*0.11);
    const simSavEl = document.getElementById('simSav');
    delete simSavEl.dataset.orig;
    simSavEl.dataset.raw = econ > 0 ? econ : 0;
    simSavEl.innerHTML = econ > 0 ? 'R$ '+econ.toLocaleString('pt-BR')+'<span class="cents">,00</span>' : '—';
    if (_hidden && econ > 0) { simSavEl.dataset.orig = simSavEl.innerHTML; simSavEl.innerHTML = '<span style="letter-spacing:2px">••••</span>'; }
    document.getElementById('simSav').style.color = econ > 0 ? 'var(--green)' : 'var(--muted)';
    document.getElementById('frTitle').textContent = 'Você está no Anexo III 🎉';
    document.getElementById('frDesc').textContent = 'Fator R acima de 28% — menor alíquota';
    document.getElementById('frArrow').textContent = '🎉';
  } else {
    res.className = 'sim-result warn';
    res.querySelector('.sim-r-ico').textContent = '⚠️';
    document.getElementById('simTitle').textContent = 'Ainda no Anexo V';
    document.getElementById('simTitle').style.color = 'var(--amber)';
    const needed = Math.ceil(FR.faturamento*0.28 - val);
    document.getElementById('simDesc').textContent = 'Falta R$ '+needed.toLocaleString('pt-BR')+',00 de pró-labore para atingir 28%.';
    document.getElementById('simSav').textContent = '—';
    document.getElementById('simSav').style.color = 'var(--muted)';
    document.getElementById('frTitle').textContent = 'Você está no Anexo V';
    document.getElementById('frDesc').textContent = 'Fator R abaixo de 28% — alíquota mais alta';
    document.getElementById('frArrow').textContent = '⚠️';
  }
}
function buildPLHist() {
  const el = document.getElementById('plHist'); if (!el) return;
  PL_HIST.forEach(item => {
    const div = document.createElement('div'); div.className = 'plh';
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
    div.addEventListener('click', () => toast('🧾','Recibo de '+item.month+' baixado'));
    el.appendChild(div);
  });
}

// Expose to global scope for inline HTML handlers
window.setNFTab = setNFTab;
window.filterNFs = filterNFs;
window.emitirNF = emitirNF;
window.setFtab = setFtab;
window.shiftMonth = shiftMonth;
window.updateSim = updateSim;
