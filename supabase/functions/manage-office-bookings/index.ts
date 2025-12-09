import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

interface OfficeBooking {
    id: string;
    office_id: string;
    user_id: string | null;
    start_time: string;
    end_time: string;
    is_admin_block: boolean;
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
            .select('role, id, full_name')
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
        console.log(`User ${user.id} (${user.role}) performing booking operation: ${operation}`);

        // Helper to check if user is admin
        const isAdmin = (): boolean => {
            return user.role === 'admin' || user.role === 'super_admin';
        };

        // Helper to check for booking conflicts
        const hasConflict = async (officeId: string, startTime: string, endTime: string, excludeBookingId?: string): Promise<boolean> => {
            let query = supabase
                .from('office_bookings')
                .select('id')
                .eq('office_id', officeId)
                .or(`and(start_time.lt.${endTime},end_time.gt.${startTime})`);

            if (excludeBookingId) {
                query = query.neq('id', excludeBookingId);
            }

            const { data: conflicts } = await query;
            return (conflicts?.length || 0) > 0;
        };

        // Helper to validate 15-minute increments
        const isValid15MinIncrement = (dateTime: string): boolean => {
            const date = new Date(dateTime);
            const minutes = date.getMinutes();
            return minutes % 15 === 0;
        };

        let result;
        switch (operation) {
            case 'list_by_office': {
                // Get bookings for an office within a date range
                const { officeId, startDate, endDate } = data;

                // Check if user has access to this office
                const { data: office } = await supabase
                    .from('offices')
                    .select('is_shared')
                    .eq('id', officeId)
                    .single();

                if (!office || (!isAdmin() && !office.is_shared)) {
                    return new Response(
                        JSON.stringify({ error: 'You do not have access to this office' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data: bookings, error } = await supabase
                    .from('office_bookings')
                    .select('*, users(id, username, full_name)')
                    .eq('office_id', officeId)
                    .gte('start_time', startDate)
                    .lte('end_time', endDate)
                    .order('start_time', { ascending: true });

                result = { data: bookings, error };
                break;
            }

            case 'list_by_user': {
                // Get all bookings for the current user
                const { data: bookings, error } = await supabase
                    .from('office_bookings')
                    .select('*, offices(id, name, location)')
                    .eq('user_id', user.id)
                    .order('start_time', { ascending: true });

                result = { data: bookings, error };
                break;
            }

            case 'create': {
                const { officeId, startTime, endTime } = data;

                // Validate 15-minute increments
                if (!isValid15MinIncrement(startTime) || !isValid15MinIncrement(endTime)) {
                    return new Response(
                        JSON.stringify({ error: 'Booking times must be in 15-minute increments' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Validate time range
                const start = new Date(startTime);
                const end = new Date(endTime);
                if (end <= start) {
                    return new Response(
                        JSON.stringify({ error: 'End time must be after start time' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Check if office exists and is shared
                const { data: office } = await supabase
                    .from('offices')
                    .select('is_shared')
                    .eq('id', officeId)
                    .single();

                if (!office) {
                    return new Response(
                        JSON.stringify({ error: 'Office not found' }),
                        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                if (!isAdmin() && !office.is_shared) {
                    return new Response(
                        JSON.stringify({ error: 'This office is not available for booking' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Check for conflicts
                if (await hasConflict(officeId, startTime, endTime)) {
                    return new Response(
                        JSON.stringify({ error: 'This time slot is already booked' }),
                        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Create booking
                const { data: booking, error } = await supabase
                    .from('office_bookings')
                    .insert({
                        office_id: officeId,
                        user_id: user.id,
                        start_time: startTime,
                        end_time: endTime,
                        is_admin_block: false,
                        created_by: user.id
                    })
                    .select('*, users(id, username, full_name)')
                    .single();

                result = { data: booking, error };
                break;
            }

            case 'create_admin_block': {
                // Only admins can create admin blocks
                if (!isAdmin()) {
                    return new Response(
                        JSON.stringify({ error: 'Only admins can create admin blocks' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { officeId, startTime, endTime } = data;

                // Validate 15-minute increments
                if (!isValid15MinIncrement(startTime) || !isValid15MinIncrement(endTime)) {
                    return new Response(
                        JSON.stringify({ error: 'Booking times must be in 15-minute increments' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Validate time range
                const start = new Date(startTime);
                const end = new Date(endTime);
                if (end <= start) {
                    return new Response(
                        JSON.stringify({ error: 'End time must be after start time' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Check for conflicts
                if (await hasConflict(officeId, startTime, endTime)) {
                    return new Response(
                        JSON.stringify({ error: 'This time slot is already booked' }),
                        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Create admin block (user_id is NULL)
                const { data: booking, error } = await supabase
                    .from('office_bookings')
                    .insert({
                        office_id: officeId,
                        user_id: null,
                        start_time: startTime,
                        end_time: endTime,
                        is_admin_block: true,
                        created_by: user.id
                    })
                    .select()
                    .single();

                result = { data: booking, error };
                break;
            }

            case 'delete': {
                const { bookingId } = data;

                // Get booking details
                const { data: booking } = await supabase
                    .from('office_bookings')
                    .select('user_id, is_admin_block')
                    .eq('id', bookingId)
                    .single();

                if (!booking) {
                    return new Response(
                        JSON.stringify({ error: 'Booking not found' }),
                        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Users can delete their own bookings, admins can delete any
                if (!isAdmin() && booking.user_id !== user.id) {
                    return new Response(
                        JSON.stringify({ error: 'You can only delete your own bookings' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { error } = await supabase
                    .from('office_bookings')
                    .delete()
                    .eq('id', bookingId);

                result = { data: { success: true }, error };
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
        console.error('Error in manage-office-bookings function:', errorMessage, error);
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
