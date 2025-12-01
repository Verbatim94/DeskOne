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
  const totalSpent = totalBookings * 25; // Dummy value: $25 per booking

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full overflow-hidden">
      {/* Left Column - Main Content */}
      <div className="lg:col-span-2 space-y-4 overflow-y-auto pr-2">
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
          totalSpent={totalSpent}
        />

        <DashboardChart data={chartData} />
      </div>

      {/* Right Column - Widgets */}
      <div className="space-y-4 overflow-y-auto pr-2">
        <DashboardCalendar bookedDates={bookedDates} />

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
