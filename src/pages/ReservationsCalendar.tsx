import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Loader2, User, MapPin, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isSameDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface Reservation {
  id: string;
  room: { id: string; name: string };
  user: { id: string; username: string; full_name: string };
  cell: { id: string; label: string | null; type: string; x: number; y: number };
  type: string;
  status: string;
  date_start: string;
  date_end: string;
  time_segment: string;
  created_at: string;
}

interface Room {
  id: string;
  name: string;
}

export default function ReservationsCalendar() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const callRoomFunction = async (operation: string, data?: any) => {
    const session = authService.getSession();
    if (!session) throw new Error('No session');

    const response = await supabase.functions.invoke('manage-rooms', {
      body: { operation, data },
      headers: {
        'x-session-token': session.token
      }
    });

    if (response.error) throw response.error;
    return response.data;
  };

  const callReservationFunction = async (operation: string, data?: any) => {
    const session = authService.getSession();
    if (!session) throw new Error('No session');

    const response = await supabase.functions.invoke('manage-reservations', {
      body: { operation, data },
      headers: {
        'x-session-token': session.token
      }
    });

    if (response.error) throw response.error;
    return response.data;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load rooms
      const roomsData = await callRoomFunction('list');
      setRooms(roomsData || []);

      // Load all reservations for rooms user has access to
      const allReservations: Reservation[] = [];
      for (const room of roomsData || []) {
        try {
          const roomReservations = await callReservationFunction('list_room_reservations', {
            roomId: room.id
          });
          // Map the data structure from edge function response
          const mappedReservations = (roomReservations || []).map((r: any) => ({
            ...r,
            room: { id: room.id, name: room.name },
            user: r.users,
            cell: r.room_cells
          }));
          allReservations.push(...mappedReservations);
        } catch (error) {
          console.error(`Failed to load reservations for room ${room.id}:`, error);
        }
      }
      setReservations(allReservations);
    } catch (error: any) {
      toast({
        title: 'Error loading data',
        description: error.message,
        variant: 'destructive'
      });
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      approved: 'default',
      rejected: 'destructive',
      cancelled: 'outline'
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const filteredReservations = reservations.filter(reservation => {
    const startDate = parseISO(reservation.date_start);
    const endDate = parseISO(reservation.date_end);
    const isInDateRange = 
      isSameDay(startDate, selectedDate) ||
      isSameDay(endDate, selectedDate) ||
      (startDate <= selectedDate && endDate >= selectedDate);

    const matchesRoom = selectedRoom === 'all' || reservation.room.id === selectedRoom;
    const matchesStatus = selectedStatus === 'all' || reservation.status === selectedStatus;

    return isInDateRange && matchesRoom && matchesStatus;
  });

  // Get dates with reservations for calendar highlighting
  const datesWithReservations = reservations
    .filter(r => selectedRoom === 'all' || r.room.id === selectedRoom)
    .filter(r => selectedStatus === 'all' || r.status === selectedStatus)
    .flatMap(reservation => {
      const start = parseISO(reservation.date_start);
      const end = parseISO(reservation.date_end);
      const dates: Date[] = [];
      const current = new Date(start);
      
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      
      return dates;
    });

  const modifiers = {
    hasReservation: datesWithReservations
  };

  const modifiersClassNames = {
    hasReservation: 'bg-primary/10 font-bold'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reservations Calendar</h1>
          <p className="text-muted-foreground">View all desk reservations across rooms</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
          {/* Left sidebar with calendar and filters */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Calendar</CardTitle>
                <CardDescription>Select a date to view reservations</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="pointer-events-auto"
                  modifiers={modifiers}
                  modifiersClassNames={modifiersClassNames}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Room</label>
                  <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Rooms</SelectItem>
                      {rooms.map(room => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelectedRoom('all');
                    setSelectedStatus('all');
                    setSelectedDate(new Date());
                  }}
                >
                  Reset Filters
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right side with reservation list */}
          <Card>
            <CardHeader>
              <CardTitle>
                Reservations for {format(selectedDate, 'MMMM d, yyyy')}
              </CardTitle>
              <CardDescription>
                {filteredReservations.length} reservation{filteredReservations.length !== 1 ? 's' : ''} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredReservations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No reservations</h3>
                  <p className="text-muted-foreground">
                    There are no reservations for the selected date and filters
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReservations.map(reservation => (
                    <Card key={reservation.id} className="border-l-4" style={{
                      borderLeftColor: reservation.status === 'approved' ? 'hsl(var(--primary))' : 
                                      reservation.status === 'pending' ? 'hsl(var(--secondary))' :
                                      reservation.status === 'rejected' ? 'hsl(var(--destructive))' :
                                      'hsl(var(--muted))'
                    }}>
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{reservation.room.name}</span>
                              </div>
                              <div className="text-sm text-muted-foreground ml-6">
                                {reservation.cell.label || `Desk at (${reservation.cell.x}, ${reservation.cell.y})`}
                              </div>
                            </div>
                            {getStatusBadge(reservation.status)}
                          </div>

                          <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                            <User className="h-4 w-4" />
                            <span>{reservation.user.full_name}</span>
                          </div>

                          <div className="text-sm text-muted-foreground ml-6">
                            <div>
                              {format(parseISO(reservation.date_start), 'MMM d')} - {format(parseISO(reservation.date_end), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs">
                              {reservation.type.replace('_', ' ')} • {reservation.time_segment}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
