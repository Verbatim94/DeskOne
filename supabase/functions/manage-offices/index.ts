import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

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

        const isAdmin = (): boolean => user.role === 'admin' || user.role === 'super_admin';

        const assertAdmin = () => {
            if (!isAdmin()) {
                return new Response(
                    JSON.stringify({ error: 'Only admins can manage offices' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            return null;
        };

        const getOfficeAccessIds = async (officeId: string): Promise<string[]> => {
            const { data: access, error } = await supabase
                .from('office_access')
                .select('user_id')
                .eq('office_id', officeId);

            if (error) throw error;
            return (access || []).map((row: { user_id: string }) => row.user_id);
        };

        const replaceOfficeAccess = async (officeId: string, userIds: string[]) => {
            const uniqueUserIds = Array.from(new Set((userIds || []).filter(Boolean)));

            const { error: deleteError } = await supabase
                .from('office_access')
                .delete()
                .eq('office_id', officeId);

            if (deleteError) throw deleteError;

            if (uniqueUserIds.length === 0) return;

            const { error: insertError } = await supabase
                .from('office_access')
                .insert(uniqueUserIds.map((userId) => ({
                    office_id: officeId,
                    user_id: userId,
                    created_by: user.id,
                })));

            if (insertError) throw insertError;
        };

        let result;
        switch (operation) {
            case 'list': {
                if (isAdmin()) {
                    const { data: offices, error } = await supabase
                        .from('offices')
                        .select('*, office_access(user_id)')
                        .order('created_at', { ascending: false });

                    result = {
                        data: (offices || []).map((office: Record<string, unknown>) => ({
                            ...office,
                            access_count: Array.isArray(office.office_access) ? office.office_access.length : 0,
                            office_access: undefined,
                        })),
                        error,
                    };
                } else {
                    const { data: accessRows, error } = await supabase
                        .from('office_access')
                        .select('offices(*)')
                        .eq('user_id', user.id);

                    if (error) throw error;

                    result = {
                        data: (accessRows || [])
                            .map((row: { offices: unknown }) => row.offices)
                            .filter(Boolean),
                        error: null,
                    };
                }
                break;
            }

            case 'get': {
                const { data: office, error } = await supabase
                    .from('offices')
                    .select('*')
                    .eq('id', data.officeId)
                    .single();

                if (office && !isAdmin()) {
                    const accessIds = await getOfficeAccessIds(data.officeId);
                    if (!accessIds.includes(user.id)) {
                        return new Response(
                            JSON.stringify({ error: 'You do not have access to this office' }),
                            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }
                }

                result = { data: office, error };
                break;
            }

            case 'create': {
                const adminResponse = assertAdmin();
                if (adminResponse) return adminResponse;

                const { data: office, error } = await supabase
                    .from('offices')
                    .insert({
                        name: data.name,
                        location: data.location,
                        is_shared: false,
                        created_by: user.id
                    })
                    .select()
                    .single();

                if (error) throw error;
                await replaceOfficeAccess(office.id, data.userIds || []);

                result = { data: { ...office, access_count: (data.userIds || []).length }, error: null };
                break;
            }

            case 'update': {
                const adminResponse = assertAdmin();
                if (adminResponse) return adminResponse;

                const { name, location, userIds } = data.updates;
                const { data: office, error } = await supabase
                    .from('offices')
                    .update({ name, location })
                    .eq('id', data.officeId)
                    .select()
                    .single();

                if (error) throw error;
                await replaceOfficeAccess(data.officeId, userIds || []);

                result = { data: { ...office, access_count: (userIds || []).length }, error: null };
                break;
            }

            case 'delete': {
                const adminResponse = assertAdmin();
                if (adminResponse) return adminResponse;

                const { error } = await supabase
                    .from('offices')
                    .delete()
                    .eq('id', data.officeId);

                result = { data: { success: true }, error };
                break;
            }

            case 'list_users': {
                const adminResponse = assertAdmin();
                if (adminResponse) return adminResponse;

                const { data: users, error } = await supabase
                    .from('users')
                    .select('id, username, full_name, role, is_active')
                    .eq('is_active', true)
                    .order('full_name', { ascending: true });

                result = { data: users, error };
                break;
            }

            case 'list_access': {
                const adminResponse = assertAdmin();
                if (adminResponse) return adminResponse;

                const accessIds = await getOfficeAccessIds(data.officeId);
                result = { data: accessIds, error: null };
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
