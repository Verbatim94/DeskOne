import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users as UsersIcon, CalendarRange, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { WeeklyOverview } from '@/components/WeeklyOverview';
import { RoomWeeklyAvailability } from '@/components/RoomWeeklyAvailability';
import { TodayOccupancy } from '@/components/TodayOccupancy';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, eachDayOfInterval } from 'date-fns';
import { useState } from 'react';
import { authService } from '@/lib/auth';

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

  // Expand reservations to include all dates in the range
  const bookedDates = allReservations.flatMap((r: any) => {
    const startDate = new Date(r.date_start);
    const endDate = new Date(r.date_end);
    
    // Generate all dates between start and end (inclusive)
    const dates = eachDayOfInterval({ start: startDate, end: endDate });
    return dates.map(date => format(date, 'yyyy-MM-dd'));
  });

  // Default user view
  return (
    <div className="space-y-8">
      {/* Top Strip: Welcome + Weekly Overview */}
      <Card className="border-none shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between">
            {/* Left Section - Welcome */}
            <div className="flex-1 space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">
                Welcome, {user.full_name}!
              </h1>
              <p className="text-lg text-muted-foreground">
                {user.role === 'admin' ? 'Manage your rooms and desk assignments' : 'Book desks in your available rooms'}
              </p>
            </div>
            
            {/* Right Section - Weekly Overview (only for regular users) */}
            {user.role !== 'admin' && (
              <div className="lg:w-[420px]">
                <WeeklyOverview bookedDates={bookedDates} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Shared Rooms Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight mb-4">
          {user.role === 'admin' ? 'Your Rooms' : 'Shared Rooms'}
        </h2>

        {/* Room Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          {userRooms.length > 0 ? (
            userRooms.map((room: any) => {
              return (
                <Card key={room.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <h3 className="text-lg font-semibold mb-1">{room.name}</h3>
                        {room.description && (
                          <p className="text-sm text-muted-foreground mb-2">{room.description}</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {room.totalDesks} {room.totalDesks === 1 ? 'desk' : 'desks'} total
                        </p>
                        {/* Today's occupancy */}
                        {room.totalDesks > 0 && (
                          <TodayOccupancy roomId={room.id} totalDesks={room.totalDesks} />
                        )}
                      </div>
                      
                      <Link to={`/rooms/${room.id}/view`}>
                        <Button size="lg" className="min-w-[120px]">
                          Open Room
                        </Button>
                      </Link>
                    </div>
                    
                    {/* Weekly Availability Calendar */}
                    {room.totalDesks > 0 && (
                      <div className="pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Weekly availability</p>
                        <RoomWeeklyAvailability roomId={room.id} totalDesks={room.totalDesks} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-3">
                  <Grid3x3 className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <div>
                    <p className="text-lg font-medium">No shared rooms available yet</p>
                    <a 
                      href="mailto:admin@deskone.com" 
                      className="text-sm text-primary hover:underline"
                    >
                      Contact your administrator
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
