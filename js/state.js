/* ════════════════════════════════════════════════
   STATE.JS — Único ponto de verdade do estado global

   REGRAS:
   • Nenhum outro arquivo declara variáveis de estado
   • Dividido em dois blocos:
       UI_STATE  — controla interação visual (filtros, toggles, datas)
       APP_STATE — dados carregados do Supabase (sessão, empresa, caches)
   • Arrays de dados ([NFs], [PAGAR]…) vivem aqui e são populados
     por loadAllData() em main-supabase.js via splice/push
   • FR é derivado em computeFR() a partir de _activeCompany + _kpis;
     nunca hardcoded aqui
   • Exposto via window.STATE para debug — nunca lido via window.STATE
     no código de produção; módulos acessam as variáveis diretamente
     pois todos os scripts rodam no mesmo escopo global (UMD / no-module)
════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   UI STATE
   Controlado por ui.js e pages.js
───────────────────────────────────────────────*/

/** true quando o usuário ativou o modo "ocultar valores" */
let _hidden = false;

/** Filtro ativo na lista de NFs: 'todas' | 'pagas' | 'pendentes' | 'recorrentes' */
let _nfFilter = 'todas';

/** Mês exibido no calendário de obrigações */
let _calDate = new Date();

/** Modo do gráfico de fluxo de caixa: 'inc' | 'exp' */
let _chartMode = 'inc';

/** Handle do setTimeout do toast — permite cancelar antes do fade */
let _toastTimer;


/* ─────────────────────────────────────────────
   APP STATE
   Gerenciado exclusivamente por main-supabase.js
   Leitura por qualquer módulo; escrita apenas em:
     initApp(), loadAllData(), selectCompanyType(), doAddCompany()
───────────────────────────────────────────────*/

/** Perfil pessoal do usuário autenticado ({ nome, cpf, email… }) */
let _profile = null;

/** Todas as empresas vinculadas ao usuário (array de rows da tabela companies) */
let _companies = [];

/** Empresa ativa selecionada nas abas (null = todas / sem empresa) */
let _activeCompany = null;

/** KPIs do mês atual — preenchido por fetchKPIs() */
let _kpis = null;


/* ─────────────────────────────────────────────
   ARRAYS DE DADOS (cache local do Supabase)
   Populados por loadAllData() em main-supabase.js.
   Consumidos pelos builders em pages.js e charts.js.
   Nunca edite manualmente — use as funções de fetch.
───────────────────────────────────────────────*/

/** Notas fiscais — populado por fetchNFs() */
const NFs = [];

/** Lançamentos do extrato bancário — populado por fetchExtrato() */
const EXTRATO = [];

/** Contas a pagar pendentes — populado por fetchPagar() */
const PAGAR = [];

/** Notas fiscais a receber (pending/overdue) — populado por fetchReceber() */
const RECEBER = [];

/** Impostos — populado por fetchImpostos() */
const IMPOSTOS = [];

/** Histórico de pró-labore — populado por fetchProlabore() */
const PL_HIST = [];

/**
 * Fluxo de caixa para os gráficos — populado por fetchCashFlow().
 * charts.js consome CASH.months / CASH.income / CASH.expense.
 */
const CASH = { months: [], income: [], expense: [] };


/* ─────────────────────────────────────────────
   FATOR R — derivado dinamicamente
   Nunca hardcoded; sempre calculado de _activeCompany e _kpis.

   Se a empresa não tiver faturamento_12m no banco, usa como
   fallback o somatório dos últimos 12 meses de CASH.income.

   Alíquotas do Simples Nacional (Anexo III × Anexo V, Faixa 1):
     aliq5 = 15,5% (Anexo V / sem Fator R)
     aliq3 = 6,0%  (Anexo III / com Fator R ≥ 28%)
   Fonte: LC 123/2006, Anexo III, primeira faixa até R$ 180.000/ano.
───────────────────────────────────────────────*/

/**
 * Retorna o objeto FR calculado da empresa ativa.
 * @returns {{ faturamento: number, baseAtual: number, aliq5: number, aliq3: number }}
 */
function computeFR() {
  // Faturamento dos últimos 12 meses: prefere campo da empresa, senão soma CASH
  const faturamento = (
    (_activeCompany?.faturamento_12m && Number(_activeCompany.faturamento_12m) > 0)
      ? Number(_activeCompany.faturamento_12m)
      : CASH.income.reduce((s, v) => s + v, 0)
  ) || 1; // guard against division-by-zero

  // Pró-labore base atual: KPI do mês atual (receita como proxy se prolabore_mes ausente)
  const baseAtual = (
    (_activeCompany?.prolabore_mes && Number(_activeCompany.prolabore_mes) > 0)
      ? Number(_activeCompany.prolabore_mes)
      : (_kpis?.prolabore || 0)
  );

  return {
    faturamento,
    baseAtual,
    aliq5: 0.155, // Anexo V — Faixa 1
    aliq3: 0.060, // Anexo III — Faixa 1
  };
}

/**
 * Proxy de leitura para compatibilidade com código legado que
 * acessa FR.faturamento / FR.aliq5 / FR.aliq3 diretamente.
 *
 * Usando Proxy para que cada leitura de propriedade re-chame computeFR(),
 * garantindo que os valores reflitam _activeCompany e _kpis atuais
 * sem precisar atualizar o objeto FR manualmente a cada loadAllData().
 */
const FR = new Proxy({}, {
  get(_target, prop) {
    return computeFR()[prop];
  }
});


/* ─────────────────────────────────────────────
   CONSTANTES DE DOMÍNIO (imutáveis, sem fetch)
───────────────────────────────────────────────*/

/** Meses por extenso em pt-BR — usado por buildCalendar() e renderKPIs() */
const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

/** Mapeamento de status de NF para label e classe CSS */
const STATUS_CFG = {
  paid:    { label: 'PAGO',     cls: 'ok'  },
  pending: { label: 'PENDENTE', cls: 'mid' },
  overdue: { label: 'VENCIDA',  cls: 'bad' },
};


/* ─────────────────────────────────────────────
   DEBUG HELPER
   Acesse window.STATE no console do browser para
   inspecionar o estado completo sem precisar de DevTools.
───────────────────────────────────────────────*/
window.STATE = {
  get hidden()        { return _hidden; },
  get nfFilter()      { return _nfFilter; },
  get calDate()       { return _calDate; },
  get chartMode()     { return _chartMode; },
  get profile()       { return _profile; },
  get companies()     { return _companies; },
  get activeCompany() { return _activeCompany; },
  get kpis()          { return _kpis; },
  get fr()            { return computeFR(); },
  get NFs()           { return NFs; },
  get EXTRATO()       { return EXTRATO; },
  get PAGAR()         { return PAGAR; },
  get RECEBER()       { return RECEBER; },
  get IMPOSTOS()      { return IMPOSTOS; },
  get PL_HIST()       { return PL_HIST; },
  get CASH()          { return CASH; },
};
