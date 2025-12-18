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

interface Room {
  id: string;
  name: string;
  description: string | null;
  totalDesks: number;
  activeReservations: number;
}

interface Reservation {
  id: string;
  room_id: string;
  date_start: string;
  date_end: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export default function Dashboard() {
  const { user } = useAuth();

  // Fetch user's rooms and reservations
  const { data: userRooms = [] } = useQuery({
    queryKey: ['user-rooms', user?.id, user?.role],
    queryFn: async () => {
      if (!user) return [];
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
    enabled: !!user,
  });

  const { data: allReservations = [] } = useQuery({
    queryKey: ['all-reservations', user?.id],
    queryFn: async () => {
      if (!user) return [];
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
      return reservations.filter((r: Reservation) =>
        r.status === 'approved' || r.status === 'pending'
      );
    },
    enabled: !!user,
  });

  // Calculate Stats
  const totalBookings = allReservations.length;
  const upcomingBookings = allReservations.filter((r: Reservation) =>
    isAfter(new Date(r.date_start), startOfDay(new Date()))
  ).length;

  // Calculate Availability
  const totalDesks = userRooms.reduce((acc: number, room: Room) => acc + (room.totalDesks || 0), 0);
  const totalReserved = userRooms.reduce((acc: number, room: Room) => acc + (room.activeReservations || 0), 0);

  // Avoid division by zero
  const availabilityPercentage = totalDesks > 0
    ? Math.round(((totalDesks - totalReserved) / totalDesks) * 100)
    : 0;

  // Prepare Chart Data (Last 6 months)
  const chartData = Array.from({ length: 6 }).map((_, i) => {
    const date = subMonths(new Date(), 5 - i);
    const monthName = format(date, 'MMM');
    const bookingsInMonth = allReservations.filter((r: Reservation) =>
      isSameMonth(new Date(r.date_start), date)
    ).length;

    return { date: monthName, bookings: bookingsInMonth };
  });

  // Expand reservations to include all dates in the range for Calendar
  const bookedDates = allReservations.flatMap((r: Reservation) => {
    const startDate = new Date(r.date_start);
    const endDate = new Date(r.date_end);
    const dates = eachDayOfInterval({ start: startDate, end: endDate });
    return dates;
  });

  // Calculate availability for next 60 days
  const { data: availabilityData = { available: [], unavailable: [] } } = useQuery({
    queryKey: ['desk-availability', user?.id, userRooms.map((r: Room) => r.id)],
    queryFn: async () => {
      if (!user) return { available: [], unavailable: [] };
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
      const roomIds = userRooms.map((r: Room) => r.id);
      if (roomIds.length === 0) return { available: [], unavailable: [] };

      const startDateStr = format(daysToCheck[0], 'yyyy-MM-dd');
      const endDateStr = format(daysToCheck[daysToCheck.length - 1], 'yyyy-MM-dd');

      // Fetch ALL reservations and assignments in parallel
      const [reservationsRes, assignmentsRes] = await Promise.all([
        supabase
          .from('reservations')
          .select('room_id, date_start, date_end')
          .in('room_id', roomIds)
          .lte('date_start', endDateStr)
          .gte('date_end', startDateStr)
          .neq('status', 'cancelled')
          .neq('status', 'rejected'),
        supabase
          .from('fixed_assignments')
          .select('room_id, date_start, date_end')
          .in('room_id', roomIds)
          .lte('date_start', endDateStr)
          .gte('date_end', startDateStr)
      ]);

      const allReservations = reservationsRes.data || [];
      const allAssignments = assignmentsRes.data || [];

      // OPTIMIZATION: Build a Lookup Map for Occupancy
      // Key: `${roomId}-${dateStr}` -> Value: Number of occupied desks
      const occupancyMap = new Map<string, number>();

      // 1. Process Reservations
      allReservations.forEach((r: { room_id: string; date_start: string; date_end: string }) => {
        const start = new Date(r.date_start);
        const end = new Date(r.date_end);
        // Clamp dates to our check range to avoid unnecessary iterations
        const effectiveStart = start < startDate ? startDate : start;
        const effectiveEnd = end > endDate ? endDate : end;

        if (effectiveStart > effectiveEnd) return;

        const interval = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
        interval.forEach(date => {
          const key = `${r.room_id}-${format(date, 'yyyy-MM-dd')}`;
          occupancyMap.set(key, (occupancyMap.get(key) || 0) + 1);
        });
      });

      // 2. Process Fixed Assignments
      allAssignments.forEach((a: { room_id: string; date_start: string; date_end: string }) => {
        const start = new Date(a.date_start);
        const end = new Date(a.date_end);
        const effectiveStart = start < startDate ? startDate : start;
        const effectiveEnd = end > endDate ? endDate : end;

        if (effectiveStart > effectiveEnd) return;

        const interval = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
        interval.forEach(date => {
          const key = `${a.room_id}-${format(date, 'yyyy-MM-dd')}`;
          occupancyMap.set(key, (occupancyMap.get(key) || 0) + 1);
        });
      });

      // 3. Check Availability using the Map (O(1) lookup per room per day)
      // Pre-calculate user booked dates string set for O(1) lookup
      const userBookedDatesSet = new Set(bookedDates.map(d => format(d, 'yyyy-MM-dd')));

      for (const day of daysToCheck) {
        const dayStr = format(day, 'yyyy-MM-dd');

        // Skip if user already has a reservation
        if (userBookedDatesSet.has(dayStr)) continue;

        let hasAvailableDesk = false;

        for (const room of userRooms) {
          const totalDesks = room.totalDesks || 0;
          if (totalDesks === 0) continue;

          const occupiedCount = occupancyMap.get(`${room.id}-${dayStr}`) || 0;

          if (occupiedCount < totalDesks) {
            hasAvailableDesk = true;
            break; // Found one available room, no need to check others for this day
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
    enabled: !!user && userRooms.length > 0 && user.role !== 'admin',
  });

  if (!user) return null;

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
            {userRooms.slice(0, 3).map((room: Room) => (
              <Card key={room.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium truncate">{room.name}</h3>
                    <span className="text-xs text-white bg-blue-600 px-2 py-1 rounded-full whitespace-nowrap shrink-0 ml-2">
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
