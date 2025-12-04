import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, eachDayOfInterval, isAfter, startOfDay, subMonths, isSameMonth } from 'date-fns';
import { authService } from '@/lib/auth';
import { DashboardStats } from '@/components/DashboardStats';
import { DashboardChart } from '@/components/DashboardChart';
import { DashboardCalendar } from '@/components/DashboardCalendar';
import { Grid3x3, ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  // Fetch user's rooms and reservations
  const { data: userRooms = [] } = useQuery({
    queryKey: ['user-rooms', user.id, user.role],
    queryFn: async () => {
      const session = authService.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('manage-rooms', {
        body: { operation: 'list' },
        headers: {
          'x-session-token': session.token,
        },
      });

      if (response.error) {
        throw response.error;
      }

      return response.data || [];
    },
  });

  const { data: allReservations = [] } = useQuery({
    queryKey: ['all-reservations', user.id],
    queryFn: async () => {
      // Admins don't need reservations
      if (user.role === 'admin') return [];

      const session = authService.getSession();
      if (!session) return [];

      const response = await supabase.functions.invoke('manage-reservations', {
        body: {
          operation: 'list_my_reservations'
        },
        headers: {
          'x-session-token': session.token,
        },
      });

      if (response.error) {
        return [];
      }

      const reservations = response.data || [];
      return reservations.filter((r: any) =>
        r.status === 'approved' || r.status === 'pending'
      );
    },
  });

  // Calculate Stats
  const totalBookings = allReservations.length;
  const upcomingBookings = allReservations.filter((r: any) =>
    isAfter(new Date(r.date_start), startOfDay(new Date()))
  ).length;

  // Calculate Availability
  const totalDesks = userRooms.reduce((acc: number, room: any) => acc + (room.totalDesks || 0), 0);
  const totalReserved = userRooms.reduce((acc: number, room: any) => acc + (room.activeReservations || 0), 0);

  // Avoid division by zero
  const availabilityPercentage = totalDesks > 0
    ? Math.round(((totalDesks - totalReserved) / totalDesks) * 100)
    : 0;

  // Prepare Chart Data (Last 6 months)
  const chartData = Array.from({ length: 6 }).map((_, i) => {
    const date = subMonths(new Date(), 5 - i);
    const monthName = format(date, 'MMM');
    const bookingsInMonth = allReservations.filter((r: any) =>
      isSameMonth(new Date(r.date_start), date)
    ).length;

    return { date: monthName, bookings: bookingsInMonth };
  });

  // Expand reservations to include all dates in the range for Calendar
  const bookedDates = allReservations.flatMap((r: any) => {
    const startDate = new Date(r.date_start);
    const endDate = new Date(r.date_end);
    const dates = eachDayOfInterval({ start: startDate, end: endDate });
    return dates;
  });

  // Calculate availability for next 60 days
  const { data: availabilityData = { available: [], unavailable: [] } } = useQuery({
    queryKey: ['desk-availability', user.id, userRooms.map((r: any) => r.id)],
    queryFn: async () => {
      if (user.role === 'admin' || userRooms.length === 0) {
        return { available: [], unavailable: [] };
      }

      const session = authService.getSession();
      if (!session) return { available: [], unavailable: [] };

      // Get date range for visible calendar (current month + next 2 months)
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1); // First day of current month
      const endDate = new Date(today.getFullYear(), today.getMonth() + 3, 0); // Last day of 2 months ahead
      const daysToCheck = eachDayOfInterval({ start: startDate, end: endDate });

      const availableDates: Date[] = [];
      const unavailableDates: Date[] = [];

      // Get all room IDs
      const roomIds = userRooms.map((r: any) => r.id);
      if (roomIds.length === 0) return { available: [], unavailable: [] };

      const startDateStr = format(daysToCheck[0], 'yyyy-MM-dd');
      const endDateStr = format(daysToCheck[daysToCheck.length - 1], 'yyyy-MM-dd');

      // Fetch ALL reservations for the date range in one query
      const { data: allReservations } = await supabase
        .from('reservations')
        .select('room_id, date_start, date_end')
        .in('room_id', roomIds)
        .lte('date_start', endDateStr)
        .gte('date_end', startDateStr)
        .neq('status', 'cancelled')
        .neq('status', 'rejected');

      // Fetch ALL fixed assignments for the date range in one query
      const { data: allAssignments } = await supabase
        .from('fixed_assignments')
        .select('room_id, date_start, date_end')
        .in('room_id', roomIds)
        .lte('date_start', endDateStr)
        .gte('date_end', startDateStr);

      // For each day, check if there are available desks
      for (const day of daysToCheck) {
        const dayStr = format(day, 'yyyy-MM-dd');

        // Skip if user already has a reservation on this day
        const hasUserReservation = bookedDates.some(
          bookedDate => format(bookedDate, 'yyyy-MM-dd') === dayStr
        );
        if (hasUserReservation) continue;

        // Check availability across all user's rooms
        let hasAvailableDesk = false;

        for (const room of userRooms) {
          const totalDesks = room.totalDesks || 0;
          if (totalDesks === 0) continue;

          // Count reservations for this room on this day (from cached data)
          const reservedCount = (allReservations || []).filter((r: any) =>
            r.room_id === room.id &&
            r.date_start <= dayStr &&
            r.date_end >= dayStr
          ).length;

          // Count fixed assignments for this room on this day (from cached data)
          const assignedCount = (allAssignments || []).filter((a: any) =>
            a.room_id === room.id &&
            a.date_start <= dayStr &&
            a.date_end >= dayStr
          ).length;

          const totalOccupied = reservedCount + assignedCount;

          if (totalOccupied < totalDesks) {
            hasAvailableDesk = true;
            break;
          }
        }

        if (hasAvailableDesk) {
          availableDates.push(day);
        } else {
          unavailableDates.push(day);
        }
      }

      return { available: availableDates, unavailable: unavailableDates };
    },
    enabled: userRooms.length > 0 && user.role !== 'admin',
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-full lg:overflow-hidden">
      {/* Left Column - Main Content */}
      <div className="lg:col-span-2 space-y-4 lg:overflow-y-auto lg:pr-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hello {user.full_name}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your desk bookings.
          </p>
        </div>

        <DashboardStats
          totalBookings={totalBookings}
          upcomingBookings={upcomingBookings}
          availabilityPercentage={availabilityPercentage}
        />

        <DashboardChart data={chartData} />
      </div>

      {/* Right Column - Widgets */}
      <div className="space-y-4 lg:overflow-y-auto lg:pr-2">
        <DashboardCalendar
          bookedDates={bookedDates}
          availableDates={availabilityData.available}
          unavailableDates={availabilityData.unavailable}
        />

        {/* Shared Rooms Widget */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Shared Rooms</h2>
            {userRooms.length > 3 && (
              <Link to="/rooms" className="text-sm text-primary hover:underline">
                View All
              </Link>
            )}
          </div>

          <div className="space-y-3">
            {userRooms.slice(0, 3).map((room: any) => (
              <Card key={room.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium truncate">{room.name}</h3>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                      {room.totalDesks} desks
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {room.description || 'No description available'}
                  </p>
                  <Link to={`/rooms/${room.id}/view`}>
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs">
                      View Room <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}

            {userRooms.length === 0 && (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Grid3x3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No rooms available</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
