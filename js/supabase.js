/* ════════════════════════════════════════════════
   SUPABASE CLIENT — sem módulos ES
════════════════════════════════════════════════ */

const sb = supabase.createClient(
  'https://splkxinyfckuywpekxbf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbGt4aW55ZmNrdXl3cGVreGJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTg4MDcsImV4cCI6MjA4NzE5NDgwN30.blm5MkslHBd34bHQ4Kg6H2_F9EXrej_uqwa0L74lvN8'
);

async function sbGetUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function sbLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function sbRegister(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

async function sbLogout() {
  await sb.auth.signOut();
}

function sbOnAuthChange(callback) {
  sb.auth.onAuthStateChange((event, session) => {
    callback(event, session?.user ?? null);
  });
}
