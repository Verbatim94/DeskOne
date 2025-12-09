import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

interface Office {
    id: string;
    name: string;
    location: string;
    is_shared: boolean;
    created_by: string;
    created_at: string;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const sessionToken = req.headers.get('x-session-token');
        if (!sessionToken) {
            return new Response(
                JSON.stringify({ error: 'Missing session token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify session and get user
        const { data: session } = await supabase
            .from('user_sessions')
            .select('user_id')
            .eq('session_token', sessionToken)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (!session) {
            return new Response(
                JSON.stringify({ error: 'Invalid or expired session' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get user info
        const { data: user } = await supabase
            .from('users')
            .select('role, id')
            .eq('id', session.user_id)
            .eq('is_active', true)
            .single();

        if (!user) {
            return new Response(
                JSON.stringify({ error: 'User not found or inactive' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { operation, data } = await req.json();
        console.log(`User ${user.id} (${user.role}) performing office operation: ${operation}`);

        // Helper to check if user is admin
        const isAdmin = (): boolean => {
            return user.role === 'admin' || user.role === 'super_admin';
        };

        let result;
        switch (operation) {
            case 'list': {
                // Admins see all offices, users see only shared offices
                let query = supabase
                    .from('offices')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (!isAdmin()) {
                    query = query.eq('is_shared', true);
                }

                const { data: offices, error } = await query;
                result = { data: offices, error };
                break;
            }

            case 'get': {
                const { data: office, error } = await supabase
                    .from('offices')
                    .select('*')
                    .eq('id', data.officeId)
                    .single();

                // Check access: admins can see all, users can only see shared
                if (office && !isAdmin() && !office.is_shared) {
                    return new Response(
                        JSON.stringify({ error: 'You do not have access to this office' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                result = { data: office, error };
                break;
            }

            case 'create': {
                // Only admins can create offices
                if (!isAdmin()) {
                    return new Response(
                        JSON.stringify({ error: 'Only admins can create offices' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data: office, error } = await supabase
                    .from('offices')
                    .insert({
                        name: data.name,
                        location: data.location,
                        is_shared: data.is_shared ?? false,
                        created_by: user.id
                    })
                    .select()
                    .single();

                result = { data: office, error };
                break;
            }

            case 'update': {
                // Only admins can update offices
                if (!isAdmin()) {
                    return new Response(
                        JSON.stringify({ error: 'Only admins can update offices' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data: office, error } = await supabase
                    .from('offices')
                    .update(data.updates)
                    .eq('id', data.officeId)
                    .select()
                    .single();

                result = { data: office, error };
                break;
            }

            case 'delete': {
                // Only admins can delete offices
                if (!isAdmin()) {
                    return new Response(
                        JSON.stringify({ error: 'Only admins can delete offices' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { error } = await supabase
                    .from('offices')
                    .delete()
                    .eq('id', data.officeId);

                result = { data: { success: true }, error };
                break;
            }

            case 'toggle_share': {
                // Only admins can toggle share status
                if (!isAdmin()) {
                    return new Response(
                        JSON.stringify({ error: 'Only admins can toggle office sharing' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data: office, error } = await supabase
                    .from('offices')
                    .update({ is_shared: data.is_shared })
                    .eq('id', data.officeId)
                    .select()
                    .single();

                result = { data: office, error };
                break;
            }

            default:
                return new Response(
                    JSON.stringify({ error: 'Invalid operation' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
        }

        if (result.error) {
            throw result.error;
        }

        return new Response(
            JSON.stringify(result.data),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error: unknown) {
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
            const supabaseError = error as { message?: string; error_description?: string };
            errorMessage = supabaseError.message || supabaseError.error_description || JSON.stringify(error);
        }
        console.error('Error in manage-offices function:', errorMessage, error);
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
