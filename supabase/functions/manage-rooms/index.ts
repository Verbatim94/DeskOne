import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

interface Room {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  grid_width: number;
  grid_height: number;
  description: string | null;
}

interface RoomAccessWithRoom {
  room_id: string;
  rooms: Room | null;
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
    console.log(`User ${user.id} (${user.role}) performing operation: ${operation}`);

    // Helper function to check room admin access
    const isRoomAdmin = async (roomId: string): Promise<boolean> => {
      if (user.role === 'super_admin') return true;

      const { data: access } = await supabase
        .from('room_access')
        .select('role')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();

      return access?.role === 'admin';
    };

    // Helper function to check room access (any level)
    const hasRoomAccess = async (roomId: string): Promise<boolean> => {
      if (user.role === 'super_admin') return true;

      const { data: access } = await supabase
        .from('room_access')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();

      return !!access;
    };

    let result;
    switch (operation) {
      case 'create': {
        // Only admin/super_admin can create rooms
        if (user.role !== 'admin' && user.role !== 'super_admin') {
          return new Response(
            JSON.stringify({ error: 'Only admins can create rooms' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create room
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .insert({
            ...data,
            created_by: user.id
          })
          .select()
          .single();

        if (roomError) {
          throw roomError;
        }

        // Add room access for creator
        const { error: accessError } = await supabase
          .from('room_access')
          .insert({
            room_id: roomData.id,
            user_id: user.id,
            role: 'admin'
          });

        if (accessError) {
          console.error('Failed to create room access:', accessError);
        }

        result = { data: roomData, error: null };
        break;
      }

      case 'update':
        // Only room admin can update room details
        if (!(await isRoomAdmin(data.id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can update rooms' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('rooms')
          .update(data.updates)
          .eq('id', data.id)
          .select()
          .single();
        break;

      case 'delete':
        // Only room admin can delete room
        if (!(await isRoomAdmin(data.id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can delete rooms' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('rooms')
          .delete()
          .eq('id', data.id);
        break;

      case 'list': {
        // Get only rooms where user has access
        if (user.role === 'super_admin') {
          const { data: allRooms, error: roomsError } = await supabase
            .from('rooms')
            .select('*')
            .order('created_at', { ascending: false });

          if (roomsError) {
            result = { data: [], error: roomsError };
            break;
          }

          // Get desk counts and active reservations for each room
          const today = new Date().toISOString().split('T')[0];
          const roomsWithDesks = await Promise.all(
            (allRooms || []).map(async (room) => {
              // Get total desks
              const { data: cells } = await supabase
                .from('room_cells')
                .select('type')
                .eq('room_id', room.id)
                .in('type', ['desk']);

              // Get active reservations for today
              const { count: activeReservations } = await supabase
                .from('reservations')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', room.id)
                .lte('date_start', today)
                .gte('date_end', today)
                .neq('status', 'cancelled')
                .neq('status', 'rejected');

              return {
                ...room,
                totalDesks: cells?.length || 0,
                activeReservations: activeReservations || 0
              };
            })
          );

          result = { data: roomsWithDesks, error: null };
        } else {
          // Get rooms where user has access via room_access table
          const { data: accessibleRooms, error: roomsError } = await supabase
            .from('room_access')
            .select('room_id, rooms(*)')
            .eq('user_id', user.id);

          if (roomsError) {
            result = { data: [], error: roomsError };
            break;
          }

          const rooms = (accessibleRooms as unknown as RoomAccessWithRoom[])?.map((a) => a.rooms).filter((r): r is Room => r !== null) || [];

          // Get desk counts and active reservations for each room
          const today = new Date().toISOString().split('T')[0];
          const roomsWithDesks = await Promise.all(
            rooms.map(async (room) => {
              // Get total desks
              const { data: cells } = await supabase
                .from('room_cells')
                .select('type')
                .eq('room_id', room.id)
                .in('type', ['desk']);

              // Get active reservations for today
              const { count: activeReservations } = await supabase
                .from('reservations')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', room.id)
                .lte('date_start', today)
                .gte('date_end', today)
                .neq('status', 'cancelled')
                .neq('status', 'rejected');

              return {
                ...room,
                totalDesks: cells?.length || 0,
                activeReservations: activeReservations || 0
              };
            })
          );

          result = { data: roomsWithDesks, error: null };
        }
        break;
      }

      case 'get': {
        // Check if user has access to this room
        if (!(await hasRoomAccess(data.roomId))) {
          return new Response(
            JSON.stringify({ error: 'You do not have access to this room' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get single room with cells
        const { data: roomDetail, error: roomDetailError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', data.roomId)
          .single();

        if (roomDetailError) {
          throw roomDetailError;
        }

        const { data: cellsData, error: cellsError } = await supabase
          .from('room_cells')
          .select('*')
          .eq('room_id', data.roomId);

        const { data: wallsData, error: wallsError } = await supabase
          .from('room_walls')
          .select('*')
          .eq('room_id', data.roomId);

        result = {
          data: {
            room: roomDetail,
            cells: cellsData || [],
            walls: wallsData || []
          },
          error: cellsError || wallsError
        };
        break;
      }

      case 'create_cell':
        // Only room admin can modify layout
        if (!(await isRoomAdmin(data.cell.room_id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can modify the layout' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('room_cells')
          .insert(data.cell)
          .select()
          .single();
        break;

      case 'update_cell': {
        // Get cell to check room ownership
        const { data: cellToUpdate } = await supabase
          .from('room_cells')
          .select('room_id')
          .eq('id', data.cellId)
          .single();

        if (!cellToUpdate || !(await isRoomAdmin(cellToUpdate.room_id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can modify the layout' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('room_cells')
          .update(data.updates)
          .eq('id', data.cellId)
          .select()
          .single();
        break;
      }

      case 'delete_cell': {
        // Get cell to check room ownership
        const { data: cellToDelete } = await supabase
          .from('room_cells')
          .select('room_id')
          .eq('id', data.cellId)
          .single();

        if (!cellToDelete || !(await isRoomAdmin(cellToDelete.room_id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can modify the layout' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('room_cells')
          .delete()
          .eq('id', data.cellId);
        break;
      }

      case 'create_wall':
        // Only room admin can modify layout
        if (!(await isRoomAdmin(data.wall.room_id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can modify the layout' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('room_walls')
          .insert(data.wall)
          .select()
          .single();
        break;

      case 'delete_wall': {
        // Get wall to check room ownership
        const { data: wallToDelete } = await supabase
          .from('room_walls')
          .select('room_id')
          .eq('id', data.wallId)
          .single();

        if (!wallToDelete || !(await isRoomAdmin(wallToDelete.room_id))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can modify the layout' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('room_walls')
          .delete()
          .eq('id', data.wallId);
        break;
      }

      case 'delete_all_cells':
        // Only room admin can clear layout
        if (!(await isRoomAdmin(data.roomId))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can modify the layout' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Also delete walls
        await supabase
          .from('room_walls')
          .delete()
          .eq('room_id', data.roomId);

        result = await supabase
          .from('room_cells')
          .delete()
          .eq('room_id', data.roomId);
        break;

      case 'list_room_users': {
        // Only room admin can view access list
        if (!(await isRoomAdmin(data.roomId))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can view access list' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: roomUsers, error: usersError } = await supabase
          .from('room_access')
          .select('id, role, user_id, users(id, username, full_name)')
          .eq('room_id', data.roomId);

        result = { data: roomUsers, error: usersError };
        break;
      }

      case 'add_room_user':
        // Only room admin can add users
        if (!(await isRoomAdmin(data.roomId))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can add users' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('room_access')
          .insert({
            room_id: data.roomId,
            user_id: data.userId,
            role: data.role || 'member'
          })
          .select('id, role, user_id, users(id, username, full_name)')
          .single();
        break;

      case 'remove_room_user':
        // Only room admin can remove users
        if (!(await isRoomAdmin(data.roomId))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can remove users' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = await supabase
          .from('room_access')
          .delete()
          .eq('id', data.accessId);
        break;

      case 'list_available_users': {
        // Only room admin can view available users
        if (!(await isRoomAdmin(data.roomId))) {
          return new Response(
            JSON.stringify({ error: 'Only room admins can view users' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get all active users
        const { data: allUsers, error: allUsersError } = await supabase
          .from('users')
          .select('id, username, full_name')
          .eq('is_active', true);

        // Get users already in room
        const { data: existingAccess } = await supabase
          .from('room_access')
          .select('user_id')
          .eq('room_id', data.roomId);

        const existingUserIds = existingAccess?.map(a => a.user_id) || [];
        const availableUsers = allUsers?.filter(u => !existingUserIds.includes(u.id)) || [];

        result = { data: availableUsers, error: allUsersError };
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
      // Handle Supabase errors
      const supabaseError = error as { message?: string; error_description?: string };
      errorMessage = supabaseError.message || supabaseError.error_description || JSON.stringify(error);
    }
    console.error('Error in manage-rooms function:', errorMessage, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
