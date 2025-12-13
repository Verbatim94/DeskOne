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
    console.log(`User ${user.id} (${user.role}) performing operation: ${operation}`);

    // Helper function to check room admin access
    const isRoomAdmin = async (roomId: string): Promise<boolean> => {
      if (user.role === 'admin') return true;

      const { data: access } = await supabase
        .from('room_access')
        .select('role')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();

      return access?.role === 'admin';
    };

    let result;
    switch (operation) {
      case 'create_fixed_assignment': {
        // Only admins can create fixed assignments
        if (user.role !== 'admin') {
          return new Response(
            JSON.stringify({ error: 'Only admins can create fixed assignments' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const startDate = new Date(data.date_start);
        const endDate = new Date(data.date_end);

        // Validate date range (max 1 year)
        const oneYearLater = new Date(startDate);
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

        if (endDate > oneYearLater) {
          return new Response(
            JSON.stringify({ error: 'Assignment period cannot exceed 1 year' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if admin has access to the room
        if (!(await isRoomAdmin(data.room_id))) {
          return new Response(
            JSON.stringify({ error: 'You do not have admin access to this room' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for existing reservations for this user in this range
        const { data: conflicts } = await supabase
          .from('reservations')
          .select('date_start')
          .eq('user_id', data.assigned_to)
          .in('status', ['approved', 'pending'])
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end);

        if (conflicts && conflicts.length > 0) {
          return new Response(
            JSON.stringify({ error: `User already has reservations on: ${conflicts.map((c: any) => c.date_start).join(', ')}` }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Generate daily reservations
        const reservationsToInsert = [];
        const current = new Date(startDate);

        while (current <= endDate) {
          const dateStr = current.toISOString().split('T')[0];
          reservationsToInsert.push({
            room_id: data.room_id,
            cell_id: data.cell_id,
            user_id: data.assigned_to,
            date_start: dateStr,
            date_end: dateStr,
            time_segment: 'FULL',
            status: 'approved',
            type: 'day', // Treat as standard daily reservation
            approved_by: user.id,
            approved_at: new Date().toISOString()
          });
          current.setDate(current.getDate() + 1);
        }

        // Bulk insert
        const { data: insertedData, error: insertError } = await supabase
          .from('reservations')
          .insert(reservationsToInsert)
          .select();

        if (insertError) {
          console.error('Error batch inserting assignments:', insertError);
          throw insertError;
        }

        result = { data: insertedData, error: null };
        console.log(`Created ${insertedData?.length} daily reservations for user ${data.assigned_to}`);
        break;
      }

      case 'list_fixed_assignments': {
        const { data: assignments, error: assignmentsError } = await supabase
          .from('fixed_assignments')
          .select(`
            *,
            assigned_user:users!fixed_assignments_assigned_to_fkey(id, username, full_name)
          `)
          .eq('room_id', data.roomId);

        if (assignmentsError) {
          console.error('Error fetching fixed assignments:', assignmentsError);
          throw assignmentsError;
        }

        result = { data: assignments || [], error: null };
        break;
      }

      case 'delete_fixed_assignment': {
        // Get the fixed assignment to check permissions
        const { data: fixedAssignment } = await supabase
          .from('fixed_assignments')
          .select('room_id, assigned_to')
          .eq('id', data.assignmentId)
          .single();

        if (!fixedAssignment) {
          return new Response(
            JSON.stringify({ error: 'Fixed assignment not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Users can delete assignments assigned to them, or admins can delete any assignment in their rooms
        const canDelete =
          fixedAssignment.assigned_to === user.id ||
          await isRoomAdmin(fixedAssignment.room_id);

        if (!canDelete) {
          return new Response(
            JSON.stringify({ error: 'You can only delete assignments assigned to you or assignments in rooms you manage' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('fixed_assignments')
          .delete()
          .eq('id', data.assignmentId)
          .select()
          .single();

        console.log('Fixed assignment deleted:', data.assignmentId);
        break;
      }

      case 'create': {
        // Check if user has access to the room
        const { data: hasAccess } = await supabase
          .from('room_access')
          .select('id')
          .eq('room_id', data.room_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!hasAccess && user.role !== 'admin') {
          return new Response(
            JSON.stringify({ error: 'You do not have access to this room' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user already has a reservation on this date (in any room)
        // This applies to ALL users, including admins booking for themselves
        const { data: userExistingReservations } = await supabase
          .from('reservations')
          .select('id')
          .eq('user_id', user.id)
          .in('status', ['approved', 'pending'])
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end);

        if (userExistingReservations && userExistingReservations.length > 0) {
          return new Response(
            JSON.stringify({ error: "Non puoi prenotare più di una scrivania nello stesso periodo, anche in room diverse." }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user has a fixed assignment on this date (in any room)
        const { data: userFixedAssignments } = await supabase
          .from('fixed_assignments')
          .select('id')
          .eq('assigned_to', user.id)
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end);

        if (userFixedAssignments && userFixedAssignments.length > 0) {
          return new Response(
            JSON.stringify({ error: "Hai già una scrivania assegnata in questo periodo." }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for fixed assignments first
        const { data: fixedAssignments } = await supabase
          .from('fixed_assignments')
          .select('id, assigned_to')
          .eq('cell_id', data.cell_id)
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end);

        if (fixedAssignments && fixedAssignments.length > 0) {
          const assignment = fixedAssignments[0];
          if (assignment.assigned_to !== user.id) {
            return new Response(
              JSON.stringify({ error: 'This desk has a fixed assignment for the selected period' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Check for conflicts considering time segments
        const { data: conflictingReservations } = await supabase
          .from('reservations')
          .select('id, time_segment, date_start, date_end')
          .eq('cell_id', data.cell_id)
          .eq('status', 'approved')
          .not('status', 'in', '(cancelled,rejected)')
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end);

        console.log('Checking conflicts for:', {
          cell_id: data.cell_id,
          date_start: data.date_start,
          date_end: data.date_end,
          time_segment: data.time_segment,
          found: conflictingReservations?.length || 0
        });

        if (conflictingReservations && conflictingReservations.length > 0) {
          // Check if there's a real conflict based on time segments
          const hasConflict = conflictingReservations.some(existing => {
            console.log('Checking existing reservation:', existing);
            // If either reservation is FULL day, there's always a conflict
            if (existing.time_segment === 'FULL' || data.time_segment === 'FULL') {
              return true;
            }
            // If both are half-day, only conflict if same time segment
            return existing.time_segment === data.time_segment;
          });

          if (hasConflict) {
            return new Response(
              JSON.stringify({ error: 'This desk is already reserved for the selected dates and time' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        result = await supabase
          .from('reservations')
          .insert({
            ...data,
            user_id: user.id,
            status: 'approved',
            approved_by: user.id,
            approved_at: new Date().toISOString()
          })
          .select()
          .single();
        break;
      }

      case 'list_my_reservations': {
        // Fetch regular reservations
        const { data: myReservations, error: myResError } = await supabase
          .from('reservations')
          .select(`
            *,
            rooms!inner(id, name),
            room_cells!inner(id, label, type)
          `)
          .eq('user_id', user.id)
          .order('date_start', { ascending: false });

        if (myResError) {
          console.error('Error fetching my reservations:', myResError);
          throw myResError;
        }

        // Fetch fixed assignments for this user
        const { data: myAssignments, error: assignError } = await supabase
          .from('fixed_assignments')
          .select(`
            *,
            rooms!inner(id, name),
            room_cells!inner(id, label, type)
          `)
          .eq('assigned_to', user.id)
          .order('date_start', { ascending: false });

        if (assignError) {
          console.error('Error fetching my fixed assignments:', assignError);
          throw assignError;
        }

        // Convert fixed assignments to reservation format
        const convertedAssignments = (myAssignments || []).map(assignment => ({
          ...assignment,
          user_id: assignment.assigned_to,
          status: 'approved',
          type: 'fixed_assignment',
          time_segment: 'FULL',
          approved_by: assignment.created_by,
          approved_at: assignment.created_at
        }));

        // Combine both arrays
        const combined = [...(myReservations || []), ...convertedAssignments];

        // Sort by date_start descending
        combined.sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());

        result = { data: combined, error: null };
        break;
      }

      case 'list_room_reservations': {
        // Check if user has access to the room
        if (!(await isRoomAdmin(data.roomId)) && user.role !== 'admin') {
          // Check if regular member has access
          const { data: memberAccess } = await supabase
            .from('room_access')
            .select('id')
            .eq('room_id', data.roomId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!memberAccess) {
            return new Response(
              JSON.stringify({ error: 'You do not have access to this room' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data: roomReservations, error: roomResError } = await supabase
          .from('reservations')
          .select(`
            *,
            users!reservations_user_id_fkey(id, username, full_name),
            room_cells!inner(id, label, type, x, y)
          `)
          .eq('room_id', data.roomId)
          .order('date_start', { ascending: false });

        if (roomResError) {
          console.error('Error fetching room reservations:', roomResError);
          throw roomResError;
        }

        result = { data: roomReservations || [], error: null };
        break;
      }

      case 'list_pending_approvals': {
        // Only room admins can see pending approvals
        if (user.role === 'admin') {
          const { data: pendingReservations, error: reservationsError } = await supabase
            .from('reservations')
            .select(`
              *,
              rooms!inner(id, name),
              users!reservations_user_id_fkey(id, username, full_name),
              room_cells!inner(id, label, type)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

          if (reservationsError) {
            console.error('Error fetching pending reservations:', reservationsError);
            throw reservationsError;
          }

          result = { data: pendingReservations || [], error: null };
        } else {
          // Get rooms where user is admin
          const { data: adminRooms } = await supabase
            .from('room_access')
            .select('room_id')
            .eq('user_id', user.id)
            .eq('role', 'admin');

          if (!adminRooms || adminRooms.length === 0) {
            result = { data: [], error: null };
            break;
          }

          const roomIds = adminRooms.map(r => r.room_id);
          const { data: pendingReservations, error: reservationsError } = await supabase
            .from('reservations')
            .select(`
              *,
              rooms!inner(id, name),
              users!reservations_user_id_fkey(id, username, full_name),
              room_cells!inner(id, label, type)
            `)
            .eq('status', 'pending')
            .in('room_id', roomIds)
            .order('created_at', { ascending: true });

          if (reservationsError) {
            console.error('Error fetching pending reservations:', reservationsError);
            throw reservationsError;
          }

          result = { data: pendingReservations || [], error: null };
        }
        break;
      }

      case 'approve': {
        // Get reservation to check room
        const { data: reservation } = await supabase
          .from('reservations')
          .select('room_id, status')
          .eq('id', data.reservationId)
          .single();

        if (!reservation) {
          return new Response(
            JSON.stringify({ error: 'Reservation not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (reservation.status !== 'pending') {
          return new Response(
            JSON.stringify({ error: 'Only pending reservations can be approved' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!(await isRoomAdmin(reservation.room_id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can approve reservations' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('reservations')
          .update({
            status: 'approved',
            approved_by: user.id,
            approved_at: new Date().toISOString()
          })
          .eq('id', data.reservationId)
          .select()
          .single();
        break;
      }

      case 'reject': {
        const { data: rejectReservation } = await supabase
          .from('reservations')
          .select('room_id, status')
          .eq('id', data.reservationId)
          .single();

        if (!rejectReservation) {
          return new Response(
            JSON.stringify({ error: 'Reservation not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (rejectReservation.status !== 'pending') {
          return new Response(
            JSON.stringify({ error: 'Only pending reservations can be rejected' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!(await isRoomAdmin(rejectReservation.room_id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can reject reservations' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('reservations')
          .update({ status: 'rejected' })
          .eq('id', data.reservationId)
          .select()
          .single();
        break;
      }

      case 'cancel': {
        const { data: cancelReservation } = await supabase
          .from('reservations')
          .select('user_id, status, room_id')
          .eq('id', data.reservationId)
          .single();

        if (!cancelReservation) {
          return new Response(
            JSON.stringify({ error: 'Reservation not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Global admins, room admins, or the user themselves can cancel a reservation
        const canCancel =
          cancelReservation.user_id === user.id ||
          await isRoomAdmin(cancelReservation.room_id);

        if (!canCancel) {
          return new Response(
            JSON.stringify({ error: 'You can only cancel your own reservations' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (cancelReservation.status === 'cancelled') {
          return new Response(
            JSON.stringify({ error: 'Reservation is already cancelled' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('reservations')
          .update({ status: 'cancelled' })
          .eq('id', data.reservationId)
          .select()
          .single();
        break;
      }

      case 'check_availability': {
        const { data: existingReservations } = await supabase
          .from('reservations')
          .select('id, date_start, date_end, time_segment')
          .eq('cell_id', data.cellId)
          .eq('status', 'approved')
          .or(`date_start.lte.${data.date_end},date_end.gte.${data.date_start}`);

        result = { data: { available: !existingReservations || existingReservations.length === 0, conflicts: existingReservations }, error: null };
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in manage-reservations function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
