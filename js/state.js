/* ════════════════════════════════════════════════
   STATE.JS — Funções derivadas e helper de debug

   As variáveis globais (NFs, CASH, _hidden, etc.)
   são declaradas como window.X no <script> inline do
   index.html — isso garante que existam antes de
   qualquer script externo ser carregado.

   Este arquivo só precisa declarar:
     • computeFR() — derivado de _activeCompany + _kpis
     • FR (Proxy)  — atalho de leitura para computeFR()
     • window.STATE — helper de debug no console
════════════════════════════════════════════════ */

function computeFR() {
  const faturamento = (
    (window._activeCompany?.faturamento_12m && Number(window._activeCompany.faturamento_12m) > 0)
      ? Number(window._activeCompany.faturamento_12m)
      : window.CASH.income.reduce((s, v) => s + v, 0)
  ) || 1;

  const baseAtual = (
    (window._activeCompany?.prolabore_mes && Number(window._activeCompany.prolabore_mes) > 0)
      ? Number(window._activeCompany.prolabore_mes)
      : (window._kpis?.prolabore || 0)
  );

  return { faturamento, baseAtual, aliq5: 0.155, aliq3: 0.060 };
}
window.computeFR = computeFR;

window.FR = new Proxy({}, {
  get(_target, prop) { return computeFR()[prop]; }
});

// Debug: window.STATE no console do browser
window.STATE = {
  get hidden()        { return window._hidden; },
  get calDate()       { return window._calDate; },
  get profile()       { return window._profile; },
  get companies()     { return window._companies; },
  get activeCompany() { return window._activeCompany; },
  get kpis()          { return window._kpis; },
  get fr()            { return computeFR(); },
  get NFs()         { return window.NFs; },
  get EXTRATO()       { return window.EXTRATO; },
  get PAGAR()         { return window.PAGAR; },
  get RECEBER()       { return window.RECEBER; },
  get IMPOSTOS()      { return window.IMPOSTOS; },
  get PL_HIST()       { return window.PL_HIST; },
  get CASH()          { return window.CASH; },
};
