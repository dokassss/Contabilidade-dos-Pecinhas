/* ════════════════════
   DATA
════════════════════ */
const NFs = [
  { id:'#2849', client:'Nubank S.A.',     ico:'🏦', date:'14/02/25', val:'R$ 18.750,37', raw:18750, status:'paid',    rec:true,  type:'NFS-e' },
<<<<<<< HEAD
  { id:'#091',  client:'Stripe Inc.',      ico:'💳', date:'01/02/25', val:'$4.200',   raw:4200,  status:'paid',    rec:false, type:'INVOICE USD' },
=======
  { id:'#091',  client:'Stripe Inc.',      ico:'💳', date:'01/02/25', val:'$4.200,00',   raw:4200,  status:'paid',    rec:false, type:'INVOICE USD' },
>>>>>>> b2ea1f6 (fix: valores monetários com centavos em todos os lugares)
  { id:'#2848', client:'Accenture Brasil', ico:'💼', date:'01/02/25', val:'R$ 13.480,15',raw:13480, status:'pending', rec:false, type:'NFS-e' },
  { id:'#2840', client:'BTG Pactual',      ico:'🏛', date:'05/01/25', val:'R$ 22.300,82',raw:22300, status:'overdue', rec:false, type:'NFS-e' },
  { id:'#2839', client:'iFood Tech',       ico:'🍔', date:'01/01/25', val:'R$ 17.650,64',raw:17650, status:'paid',    rec:true,  type:'NFS-e' },
];
const STATUS_CFG = {
  paid:    { label:'PAGO',     cls:'ok' },
  pending: { label:'PENDENTE', cls:'mid' },
  overdue: { label:'VENCIDA',  cls:'bad' },
};
const EXTRATO = [
  { grp:'HOJE · 20 FEV', items:[
    { dir:'in',  ico:'💰', desc:'Nubank S.A. — recebido',       cat:'Nota #2849',   val:'+18.750,37', raw:18750 },
    { dir:'out', ico:'🏢', desc:'Aluguel coworking',             cat:'Despesa fixa', val:'-1.340,19',  raw:1340  },
    { dir:'out', ico:'💻', desc:'GitHub Copilot',                cat:'Software',     val:'-49,90',     raw:49    },
  ]},
  { grp:'19 FEV', items:[
    { dir:'out', ico:'☁',  desc:'Amazon Web Services',          cat:'Cloud',        val:'-317,43',    raw:317   },
    { dir:'in',  ico:'💳', desc:'Stripe — recebido',             cat:'Invoice USD',  val:'+21.843,76', raw:21843 },
  ]},
  { grp:'18 FEV', items:[
    { dir:'out', ico:'🎨', desc:'Figma Pro',                     cat:'Design',       val:'-89,99',     raw:89    },
    { dir:'out', ico:'🧾', desc:'DAS Simples — jan/25',          cat:'Imposto',      val:'-1.847,52',  raw:1847  },
  ]},
];
const PAGAR = [
  { ico:'🧾', name:'DAS Simples Nacional', when:'URGENTE — Vence 20/02', val:'1.847,52', color:'var(--red)',   done:false },
  { ico:'🏙', name:'ISS São Paulo',         when:'Vence 28/02',           val:'314,18',   color:'var(--amber)', done:false },
  { ico:'💳', name:'Nubank Cartão PJ',      when:'Vence 25/02',           val:'2.183,67', color:'var(--soft)',  done:false },
  { ico:'🏢', name:'Coworking Labs SP',     when:'Vence 05/03',           val:'1.340,19', color:'var(--soft)',  done:false },
];
const RECEBER = [
  { ico:'💼', name:'Accenture Brasil', when:'28/02 — NFS-e #2848', val:'13.480,15', color:'var(--green)', done:false },
<<<<<<< HEAD
  { ico:'💳', name:'Stripe Inc. USD',  when:'A confirmar — #092',  val:'$4.200', color:'var(--soft)',  done:false },
=======
  { ico:'💳', name:'Stripe Inc. USD',  when:'A confirmar — #092',  val:'$4.200,00', color:'var(--soft)',  done:false },
>>>>>>> b2ea1f6 (fix: valores monetários com centavos em todos os lugares)
];
const IMPOSTOS = [
  { ico:'🧾', name:'DAS Simples Nacional', due:'20/02 · 3 DIAS', val:'R$ 1.847,52', color:'var(--red)',   bg:'var(--red-d)',   border:'var(--red-b)',   fill:88,
    detail:{ base:'R$ 32.094,88', aliq:'5,75%', comp:'jan/25', regime:'Simples Nacional' } },
  { ico:'🏙', name:'ISS São Paulo',        due:'28/02 · 10 DIAS', val:'R$ 314,18',   color:'var(--amber)', bg:'var(--amber-d)', border:'var(--amber-b)', fill:40,
    detail:{ base:'R$ 32.094,88', aliq:'2,0%',  comp:'jan/25', regime:'Serviços digitais' } },
  { ico:'📋', name:'DEFIS Anual 2024',     due:'31/03 · 40 DIAS', val:'—',        color:'var(--green)', bg:'var(--green-d)', border:'var(--green-b)', fill:10,
    detail:{ base:'—', aliq:'—', comp:'2024', regime:'Declaração anual' } },
];
const PL_HIST = [
  { month:'Fevereiro 2025', val:'4.150,33', net:'3.693,45', inss:'457,55', paid:false },
  { month:'Janeiro 2025',   val:'4.150,33', net:'3.693,45', inss:'457,55', paid:true  },
  { month:'Dezembro 2024',  val:'3.800,91', net:'3.382,17', inss:'418,83', paid:true  },
  { month:'Novembro 2024',  val:'3.500,48', net:'3.115,73', inss:'385,27', paid:true  },
];
const CASH = {
  months:  ['MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ','JAN','FEV'],
  income:  [23750,19840,27630,31200,22480,24910,18370,29650,32180,26740,19830,32094],
  expense: [9143, 8762, 7491,10380, 9847, 8134, 9463, 7218, 9937, 8763, 7584, 8293],
};
const FR = { faturamento:32000, baseAtual:4000, aliq5:0.155, aliq3:0.06 };
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* ════════════════════
   STATE
════════════════════ */
let _hidden = false;
let _nfFilter = 'todas';
let _calDate = new Date(2025,1,1);
let _chartMode = 'inc';
let _toastTimer;
