import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, eachDayOfInterval, isAfter, startOfDay, subMonths, isSameMonth } from 'date-fns';
import { authService } from '@/lib/auth';
import { invokeReservationFunction, invokeRoomFunction } from '@/lib/edge-functions';
import { DashboardStats } from '@/components/DashboardStats';
import { DashboardChart } from '@/components/DashboardChart';
import { DashboardCalendar } from '@/components/DashboardCalendar';
import { Grid3x3, ArrowRight, CalendarDays, LayoutGrid, Sparkles } from 'lucide-react';

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
      return await invokeRoomFunction<Room[]>('list');
    },
    enabled: !!user,
  });

  const { data: allReservations = [] } = useQuery({
    queryKey: ['all-reservations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Admins don't need reservations
      if (user.role === 'admin') return [];

      try {
        const reservations = await invokeReservationFunction<Reservation[]>('list_my_reservations');
        return reservations.filter((r: Reservation) =>
          r.status === 'approved' || r.status === 'pending'
        );
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  // Calculate Stats
  const totalBookings = allReservations.length;
  const upcomingBookings = allReservations.filter((r: Reservation) =>
    isAfter(new Date(r.date_start), startOfDay(new Date()))
  ).length;
  const nextBooking = [...allReservations]
    .filter((r: Reservation) => !isAfter(startOfDay(new Date()), new Date(r.date_end)))
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())[0];

  // Calculate Availability
  const totalDesks = userRooms.reduce((acc: number, room: Room) => acc + (room.totalDesks || 0), 0);
  const totalReserved = userRooms.reduce((acc: number, room: Room) => acc + (room.activeReservations || 0), 0);

  // Avoid division by zero
  const availabilityPercentage = totalDesks > 0
    ? Math.round(((totalDesks - totalReserved) / totalDesks) * 100)
    : 0;
  const busyRooms = [...userRooms]
    .sort((a: Room, b: Room) => (b.activeReservations || 0) - (a.activeReservations || 0))
    .slice(0, 3);

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
        <Card className="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.2),_transparent_35%),linear-gradient(135deg,#0f172a_0%,#1d4ed8_55%,#60a5fa_100%)] text-white shadow-lg">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide text-blue-50 backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" />
                  Workspace overview
                </div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Hello {user.full_name}
                </h1>
                <p className="mt-3 max-w-xl text-sm text-blue-50/90 md:text-base">
                  Keep an eye on room capacity, upcoming reservations, and your next actions from one place.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link to={user.role === 'admin' ? '/rooms' : '/shared-rooms'}>
                  <Button className="w-full justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-6 text-white shadow-none backdrop-blur hover:bg-white/20">
                    <span className="flex items-center gap-3">
                      <LayoutGrid className="h-4 w-4" />
                      {user.role === 'admin' ? 'Manage rooms' : 'Browse rooms'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to={user.role === 'admin' ? '/planner' : '/reservations'}>
                  <Button className="w-full justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-6 text-white shadow-none backdrop-blur hover:bg-white/20">
                    <span className="flex items-center gap-3">
                      <CalendarDays className="h-4 w-4" />
                      {user.role === 'admin' ? 'Open planner' : 'My reservations'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <DashboardStats
          totalBookings={totalBookings}
          upcomingBookings={upcomingBookings}
          availabilityPercentage={availabilityPercentage}
        />

        <DashboardChart data={chartData} />

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-100 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next up</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    {nextBooking ? format(new Date(nextBooking.date_start), 'EEEE, MMMM d') : 'No upcoming bookings'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {nextBooking
                      ? 'Your next reservation is already on the calendar.'
                      : 'You do not have future bookings yet. It could be a good time to reserve a desk.'}
                  </p>
                </div>
                <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                  <CalendarDays className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5">
                <Link to={user.role === 'admin' ? '/planner' : '/shared-rooms'}>
                  <Button variant="outline" className="rounded-full">
                    {user.role === 'admin' ? 'Review room schedule' : 'Book a desk'}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-100 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Capacity signal</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    {availabilityPercentage}% desks available today
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Based on current reservations and fixed assignments across the rooms visible to you.
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                  <Grid3x3 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
                  style={{ width: `${Math.max(availabilityPercentage, 4)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
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
            <h2 className="text-base font-semibold">Room Snapshot</h2>
            {userRooms.length > 3 && (
              <Link to="/rooms" className="text-sm text-primary hover:underline">
                View All
              </Link>
            )}
          </div>

          <div className="space-y-3">
            {busyRooms.map((room: Room) => (
              <Card key={room.id} className="overflow-hidden border-slate-100 bg-white transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="truncate font-medium">{room.name}</h3>
                    <span className="ml-2 shrink-0 whitespace-nowrap rounded-full bg-blue-600 px-2 py-1 text-xs text-white">
                      {room.totalDesks} desks
                    </span>
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                    {room.description || 'No description available'}
                  </p>
                  <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{room.activeReservations || 0} occupied now</span>
                    <span>{Math.max((room.totalDesks || 0) - (room.activeReservations || 0), 0)} free</span>
                  </div>
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                      style={{
                        width: `${room.totalDesks > 0 ? Math.min(100, Math.round(((room.activeReservations || 0) / room.totalDesks) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                  <Link to={`/rooms/${room.id}/view`}>
                    <Button variant="outline" size="sm" className="h-8 w-full text-xs">
                      View Room <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}

            {userRooms.length === 0 && (
              <Card className="border-dashed bg-muted/50">
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
