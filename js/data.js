/* ════════════════════════════════════════════════
   DATA.JS — AVISO: conteúdo migrado para state.js
   ─────────────────────────────────────────────────
   Este arquivo existe apenas para documentar a
   migração. Todo o estado global, arrays de dados,
   constantes de domínio (MONTHS_PT, STATUS_CFG, FR)
   e o objeto CASH vivem agora em js/state.js.

   Se você precisar adicionar uma constante de
   negócio nova, adicione em state.js — nunca aqui.

   ORDEM DE CARREGAMENTO (index.html):
     1. supabase CDN
     2. state.js   ← ponto de entrada do estado
     3. data.js    ← este arquivo (shim vazio)
     4. company.js
     5. ui.js
     6. pages.js
     7. charts.js
     8. supabase.js (wrapper)
     9. api.js
    10. onboarding.js
    11. main-supabase.js
════════════════════════════════════════════════ */
