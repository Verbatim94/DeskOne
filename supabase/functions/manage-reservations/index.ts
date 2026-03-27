import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');
const timeSegmentSchema = z.enum(['AM', 'PM', 'FULL']);
const reservationTypeSchema = z.enum(['half_day', 'day', 'week', 'month', 'quarter', 'semester', 'meeting']);
const biReportTypeSchema = z.enum(['raw', 'daily']);
const uuidSchema = z.string().uuid();
const emptyDataSchema = z
  .object({})
  .passthrough()
  .optional()
  .transform(() => ({}));

const operationSchema = z.enum([
  'create',
  'list_my_reservations',
  'list_all_reservations',
  'list_room_reservations',
  'list_pending_approvals',
  'approve',
  'reject',
  'cancel',
  'check_availability',
  'export_bi_report',
]);

const operationDataSchemas = {
  create: z.object({
    room_id: uuidSchema,
    cell_id: uuidSchema,
    date_start: isoDateSchema,
    date_end: isoDateSchema,
    time_segment: timeSegmentSchema.default('FULL'),
    type: reservationTypeSchema.default('day'),
  }).refine((value) => value.date_end >= value.date_start, {
    message: 'date_end must be on or after date_start',
    path: ['date_end'],
  }),
  list_my_reservations: emptyDataSchema,
  list_all_reservations: z.object({
    date_start: isoDateSchema,
    date_end: isoDateSchema,
  }).refine((value) => value.date_end >= value.date_start, {
    message: 'date_end must be on or after date_start',
    path: ['date_end'],
  }),
  list_room_reservations: z.object({
    roomId: uuidSchema,
  }),
  list_pending_approvals: emptyDataSchema,
  approve: z.object({
    reservationId: uuidSchema,
  }),
  reject: z.object({
    reservationId: uuidSchema,
  }),
  cancel: z.object({
    reservationId: uuidSchema,
  }),
  check_availability: z.object({
    cellId: uuidSchema,
    date_start: isoDateSchema,
    date_end: isoDateSchema,
  }).refine((value) => value.date_end >= value.date_start, {
    message: 'date_end must be on or after date_start',
    path: ['date_end'],
  }),
  export_bi_report: z.object({
    date_start: isoDateSchema,
    date_end: isoDateSchema,
    report_type: biReportTypeSchema,
    room_ids: z.array(uuidSchema).optional(),
    user_ids: z.array(uuidSchema).optional(),
  }).refine((value) => value.date_end >= value.date_start, {
    message: 'date_end must be on or after date_start',
    path: ['date_end'],
  }),
} as const;

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

    const requestBody = await req.json();
    const operation = operationSchema.parse(requestBody?.operation);
    const data = operationDataSchemas[operation].parse(requestBody?.data);
    console.log(`User ${user.id} (${user.role}) performing operation: ${operation}`);
    const isGlobalAdmin = user.role === 'admin' || user.role === 'super_admin';

    // Helper function to check room admin access
    const isRoomAdmin = async (roomId: string): Promise<boolean> => {
      if (isGlobalAdmin) return true;

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






      case 'create': {
        // Check if user has access to the room
        const { data: hasAccess } = await supabase
          .from('room_access')
          .select('id')
          .eq('room_id', data.room_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!hasAccess && !isGlobalAdmin) {
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

        if (conflictingReservations && conflictingReservations.length > 0) {
          // Check if there's a real conflict based on time segments
          const hasConflict = conflictingReservations.some(existing => {
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

        if (result.error) {
          console.error('Error creating reservation:', result.error);
        }
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

      case 'list_all_reservations': {
        // Only admin/super_admin
        if (!isGlobalAdmin) {
          return new Response(
            JSON.stringify({ error: 'Only admins can view all reservations' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: allReservations, error: allResError } = await supabase
          .from('reservations')
          .select(`
            *,
            rooms!inner(id, name),
            users!reservations_user_id_fkey(id, username, full_name),
            room_cells!inner(id, label, type)
          `)
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end)
          .neq('status', 'cancelled')
          .neq('status', 'rejected')
          .order('date_start', { ascending: false });

        if (allResError) {
          console.error('Error fetching all reservations:', allResError);
          throw allResError;
        }

        result = { data: allReservations || [], error: null };
        break;
      }

      case 'list_room_reservations': {
        // Check if user has access to the room
        if (!(await isRoomAdmin(data.roomId)) && !isGlobalAdmin) {
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
        if (isGlobalAdmin) {
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

      case 'export_bi_report': {
        if (!isGlobalAdmin) {
          return new Response(
            JSON.stringify({ error: 'Only admins can export BI reports' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const roomIdsFilter = data.room_ids?.length ? data.room_ids : null;
        const userIdsFilter = data.user_ids?.length ? data.user_ids : null;

        let reservationsQuery = supabase
          .from('reservations')
          .select(`
            id,
            room_id,
            cell_id,
            user_id,
            status,
            type,
            time_segment,
            date_start,
            date_end,
            created_at,
            approved_at,
            approved_by,
            rooms!inner(id, name),
            room_cells!inner(id, label),
            users!reservations_user_id_fkey(id, username, full_name)
          `)
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end)
          .neq('status', 'cancelled')
          .neq('status', 'rejected');

        if (roomIdsFilter) reservationsQuery = reservationsQuery.in('room_id', roomIdsFilter);
        if (userIdsFilter) reservationsQuery = reservationsQuery.in('user_id', userIdsFilter);

        const { data: reportReservations, error: reservationsError } = await reservationsQuery;
        if (reservationsError) {
          console.error('Error exporting BI reservation report:', reservationsError);
          throw reservationsError;
        }

        let assignmentsQuery = supabase
          .from('fixed_assignments')
          .select(`
            id,
            room_id,
            cell_id,
            assigned_to,
            created_by,
            date_start,
            date_end,
            created_at,
            rooms!inner(id, name),
            room_cells!inner(id, label)
          `)
          .gte('date_end', data.date_start)
          .lte('date_start', data.date_end);

        if (roomIdsFilter) assignmentsQuery = assignmentsQuery.in('room_id', roomIdsFilter);
        if (userIdsFilter) assignmentsQuery = assignmentsQuery.in('assigned_to', userIdsFilter);

        const { data: reportAssignments, error: assignmentsError } = await assignmentsQuery;
        if (assignmentsError) {
          console.error('Error exporting BI assignment report:', assignmentsError);
          throw assignmentsError;
        }

        const userIds = Array.from(new Set([
          ...(reportReservations || []).flatMap((reservation: any) => [reservation.user_id, reservation.approved_by].filter(Boolean)),
          ...(reportAssignments || []).flatMap((assignment: any) => [assignment.assigned_to, assignment.created_by].filter(Boolean)),
        ]));

        let userMap: Record<string, { full_name: string | null; username: string | null }> = {};
        if (userIds.length > 0) {
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, full_name, username')
            .in('id', userIds);

          if (usersError) {
            console.error('Error loading users for BI export:', usersError);
            throw usersError;
          }

          userMap = (usersData || []).reduce((acc: Record<string, { full_name: string | null; username: string | null }>, userRecord: any) => {
            acc[userRecord.id] = {
              full_name: userRecord.full_name ?? null,
              username: userRecord.username ?? null,
            };
            return acc;
          }, {});
        }

        const startBoundary = new Date(`${data.date_start}T00:00:00.000Z`);
        const endBoundary = new Date(`${data.date_end}T00:00:00.000Z`);
        const clampDateRange = (dateStart: string, dateEnd: string) => {
          const effectiveStart = new Date(`${dateStart}T00:00:00.000Z`);
          const effectiveEnd = new Date(`${dateEnd}T00:00:00.000Z`);
          const start = effectiveStart < startBoundary ? new Date(startBoundary) : effectiveStart;
          const end = effectiveEnd > endBoundary ? new Date(endBoundary) : effectiveEnd;
          return { start, end };
        };
        const dateToYmd = (date: Date) => date.toISOString().slice(0, 10);
        const durationDays = (dateStart: string, dateEnd: string) => {
          const start = new Date(`${dateStart}T00:00:00.000Z`);
          const end = new Date(`${dateEnd}T00:00:00.000Z`);
          return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
        };
        const monthFromDate = (dateStart: string) => dateStart.slice(0, 7);
        const yearFromDate = (dateStart: string) => Number.parseInt(dateStart.slice(0, 4), 10);
        const isWeekendSpan = (dateStart: string, dateEnd: string) => {
          const { start, end } = clampDateRange(dateStart, dateEnd);
          const cursor = new Date(start);
          while (cursor <= end) {
            const day = cursor.getUTCDay();
            if (day === 0 || day === 6) return true;
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
          return false;
        };

        const rawRows = [
          ...(reportReservations || []).map((reservation: any) => ({
            reservation_id: reservation.id,
            source_type: 'reservation',
            room_id: reservation.room_id,
            room_name: reservation.rooms?.name ?? '',
            desk_id: reservation.cell_id,
            desk_label: reservation.room_cells?.label ?? '',
            user_id: reservation.user_id,
            user_full_name: reservation.users?.full_name ?? userMap[reservation.user_id]?.full_name ?? '',
            username: reservation.users?.username ?? userMap[reservation.user_id]?.username ?? '',
            status: reservation.status,
            reservation_type: reservation.type,
            time_segment: reservation.time_segment,
            date_start: reservation.date_start,
            date_end: reservation.date_end,
            created_at: reservation.created_at,
            approved_at: reservation.approved_at ?? '',
            approved_by: reservation.approved_by ?? '',
            approved_by_name: reservation.approved_by ? userMap[reservation.approved_by]?.full_name ?? '' : '',
            duration_days: durationDays(reservation.date_start, reservation.date_end),
            is_weekend_span: isWeekendSpan(reservation.date_start, reservation.date_end),
            month: monthFromDate(reservation.date_start),
            year: yearFromDate(reservation.date_start),
          })),
          ...(reportAssignments || []).map((assignment: any) => ({
            reservation_id: assignment.id,
            source_type: 'fixed_assignment',
            room_id: assignment.room_id,
            room_name: assignment.rooms?.name ?? '',
            desk_id: assignment.cell_id,
            desk_label: assignment.room_cells?.label ?? '',
            user_id: assignment.assigned_to,
            user_full_name: userMap[assignment.assigned_to]?.full_name ?? '',
            username: userMap[assignment.assigned_to]?.username ?? '',
            status: 'approved',
            reservation_type: 'fixed_assignment',
            time_segment: 'FULL',
            date_start: assignment.date_start,
            date_end: assignment.date_end,
            created_at: assignment.created_at ?? '',
            approved_at: assignment.created_at ?? '',
            approved_by: assignment.created_by ?? '',
            approved_by_name: assignment.created_by ? userMap[assignment.created_by]?.full_name ?? '' : '',
            duration_days: durationDays(assignment.date_start, assignment.date_end),
            is_weekend_span: isWeekendSpan(assignment.date_start, assignment.date_end),
            month: monthFromDate(assignment.date_start),
            year: yearFromDate(assignment.date_start),
          })),
        ].sort((a, b) => a.date_start.localeCompare(b.date_start) || a.room_name.localeCompare(b.room_name));

        if (data.report_type === 'raw') {
          result = {
            data: {
              report_type: 'raw',
              rows: rawRows,
              generated_at: new Date().toISOString(),
            },
            error: null,
          };
          break;
        }

        const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dailyRows = rawRows.flatMap((row) => {
          const { start, end } = clampDateRange(row.date_start, row.date_end);
          const rows = [];
          const cursor = new Date(start);

          while (cursor <= end) {
            const dayOfWeek = cursor.getUTCDay();
            rows.push({
              reservation_id: row.reservation_id,
              source_type: row.source_type,
              room_id: row.room_id,
              room_name: row.room_name,
              desk_id: row.desk_id,
              desk_label: row.desk_label,
              user_id: row.user_id,
              user_full_name: row.user_full_name,
              username: row.username,
              status: row.status,
              reservation_type: row.reservation_type,
              time_segment: row.time_segment,
              occupancy_date: dateToYmd(cursor),
              weekday_index: dayOfWeek,
              weekday_name: weekdayLabels[dayOfWeek],
              is_weekend: dayOfWeek === 0 || dayOfWeek === 6,
              month: dateToYmd(cursor).slice(0, 7),
              year: Number.parseInt(dateToYmd(cursor).slice(0, 4), 10),
              created_at: row.created_at,
              approved_at: row.approved_at,
              approved_by: row.approved_by,
              approved_by_name: row.approved_by_name,
            });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }

          return rows;
        });

        result = {
          data: {
            report_type: 'daily',
            rows: dailyRows,
            generated_at: new Date().toISOString(),
          },
          error: null,
        };
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
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request payload', details: error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in manage-reservations function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
