/* ════════════════════════════════════════════════
   SUPABASE.JS — cliente e wrappers de autenticação

   Expõe:  sb, sbGetUser, sbLogin, sbLogout, sbOnAuthChange
   NÃO expõe: sbRegister (removida — use doCreateAccount()
               em main-supabase.js, que cria o perfil junto)
════════════════════════════════════════════════ */

/* ── Cliente Supabase ───────────────────────────
   A "anon key" abaixo é PÚBLICA por design do Supabase.
   Ela identifica o projeto e só concede acesso às
   tabelas que as Row Level Security (RLS) policies
   explicitamente permitem — não é um segredo.
   Referência: https://supabase.com/docs/guides/api/api-keys
   A service_role key (essa SIM é secreta) nunca deve
   aparecer no frontend.
──────────────────────────────────────────────── */
const sb = supabase.createClient(
  'https://splkxinyfckuywpekxbf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbGt4aW55ZmNrdXl3cGVreGJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTg4MDcsImV4cCI6MjA4NzE5NDgwN30.blm5MkslHBd34bHQ4Kg6H2_F9EXrej_uqwa0L74lvN8'
);

/* ── sbGetUser ──────────────────────────────────
   Retorna o usuário da sessão local (cache JWT).
   NÃO faz round-trip ao banco — é síncrono no cache,
   mas retorna Promise para manter a API uniforme.

   Retorna null em dois casos:
     1. Sem sessão ativa (usuário não logado)
     2. Falha de rede ao validar o token com o servidor

   O chamador (initApp em main-supabase.js) deve tratar
   null como "não autenticado" e exibir a tela de login.
──────────────────────────────────────────────── */
async function sbGetUser() {
  try {
    const { data, error } = await sb.auth.getUser();
    if (error) {
      // AuthSessionMissingError é esperado quando não há sessão — silencia.
      // Outros erros (rede, token corrompido) são logados mas não propagados:
      // o app deve degradar para a tela de login, não travar.
      if (error.name !== 'AuthSessionMissingError') {
        console.warn('[sbGetUser]', error.name, error.message);
      }
      return null;
    }
    return data?.user ?? null;
  } catch (err) {
    // Falha de rede ou exceção inesperada — trata como "sem sessão"
    console.warn('[sbGetUser] exceção inesperada:', err);
    return null;
  }
}

/* ── sbLogin ────────────────────────────────────
   Autentica com email + senha.
   Lança erro em caso de credenciais inválidas —
   o chamador (doLogin) é responsável pelo toast.
──────────────────────────────────────────────── */
async function sbLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/* ── sbLogout ───────────────────────────────────
   Encerra a sessão local e invalida o JWT no servidor.
   Erros são ignorados — mesmo que o servidor falhe,
   o estado local é limpo pelo listener sbOnAuthChange.
──────────────────────────────────────────────── */
async function sbLogout() {
  await sb.auth.signOut();
}

/* ── sbOnAuthChange ─────────────────────────────
   Registra um listener para mudanças de sessão.
   Eventos relevantes: 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'.
   O app só reage a SIGNED_OUT (ver main-supabase.js).
──────────────────────────────────────────────── */
function sbOnAuthChange(callback) {
  sb.auth.onAuthStateChange((event, session) => {
    callback(event, session?.user ?? null);
  });
}

/*
  ╔══════════════════════════════════════════════╗
  ║  sbRegister() — REMOVIDA INTENCIONALMENTE    ║
  ║                                              ║
  ║  O Supabase exige que o perfil (tabela        ║
  ║  profiles) seja criado junto com o usuário.  ║
  ║  Usar sb.auth.signUp() diretamente criaria   ║
  ║  um usuário sem perfil — estado inválido.    ║
  ║                                              ║
  ║  Use doCreateAccount() em main-supabase.js,  ║
  ║  que faz signUp + createProfile atomicamente.║
  ╚══════════════════════════════════════════════╝
*/
