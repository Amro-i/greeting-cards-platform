import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization') || '';

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) throw new Error('Unauthorized');

    const { data: caller } = await callerClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', authData.user.id)
      .single();

    if (caller?.role !== 'super_admin' || !caller.is_active) {
      throw new Error('Only the super admin can create users.');
    }

    const { email, password, fullName, role = 'viewer' } = await request.json();
    if (!email || !password || !fullName) throw new Error('Missing required fields.');
    if (!['super_admin', 'admin', 'viewer'].includes(role)) throw new Error('Invalid role.');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;

    await adminClient
      .from('profiles')
      .update({ full_name: fullName, role, is_active: true })
      .eq('id', data.user.id);

    return new Response(JSON.stringify({ user: { id: data.user.id, email } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
