import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Loader2, Circle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Reservation {
  id: string;
  room_id: string;
  cell_id: string;
  room: { id: string; name: string };
  user: { id: string; username: string; full_name: string };
  cell: { id: string; label: string | null; type: string };
  type: string;
  status: string;
  date_start: string;
  date_end: string;
  time_segment: string;
  created_at: string;
}

export default function MyReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadReservations();
  }, []);

  const callReservationFunction = async (operation: string, data?: any) => {
    const session = authService.getSession();
    if (!session) throw new Error('No session');

    const response = await supabase.functions.invoke('manage-reservations', {
      body: { operation, data },
      headers: {
        'x-session-token': session.token,
      },
    });

    if (response.error) throw response.error;
    return response.data;
  };

  const loadReservations = async () => {
    setLoading(true);
    try {
      const data = await callReservationFunction('list_my_reservations');
      const mappedReservations = (data || [])
        .filter((r: any) => r.rooms && r.room_cells)
        .map((r: any) => ({
          ...r,
          room_id: r.room_id,
          cell_id: r.cell_id,
          room: r.rooms,
          cell: r.room_cells,
        }));
      setReservations(mappedReservations);
    } catch (error: any) {
      toast({
        title: 'Error loading reservations',
        description: error.message,
        variant: 'destructive',
      });
    }
    setLoading(false);
  };

  const getReservationsForDay = (day: Date) => {
    return reservations.filter((reservation) => {
      if (reservation.status === 'cancelled' || reservation.status === 'rejected') return false;
      const startDate = parseISO(reservation.date_start);
      const endDate = parseISO(reservation.date_end);
      return day >= startDate && day <= endDate;
    });
  };

  const handleDayClick = (day: Date) => {
    const dayReservations = getReservationsForDay(day);
    if (dayReservations.length > 0) {
      setSelectedDay(day);
      setIsDialogOpen(true);
    }
  };

  const handleCancelReservation = async (e: React.MouseEvent, reservationId: string, reservationType?: string) => {
    e.stopPropagation();

    if (!confirm('Are you sure you want to cancel this reservation?')) return;

    try {
      if (reservationType === 'fixed_assignment') {
        await callReservationFunction('delete_fixed_assignment', { assignmentId: reservationId });
        toast({
          title: 'Assignment cancelled',
          description: 'Your fixed desk assignment has been cancelled'
        });
      } else {
        await callReservationFunction('cancel', { reservationId });
        toast({
          title: 'Reservation cancelled',
          description: 'Your desk reservation has been cancelled'
        });
      }
      loadReservations();
    } catch (error: any) {
      toast({
        title: 'Error cancelling reservation',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calculate days to show from previous and next month
  const startDayOfWeek = monthStart.getDay();
  const daysFromPrevMonth = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const allDays = [];
  for (let i = daysFromPrevMonth; i > 0; i--) {
    const day = new Date(monthStart);
    day.setDate(day.getDate() - i);
    allDays.push(day);
  }
  allDays.push(...daysInMonth);

  const remainingDays = 42 - allDays.length; // 6 weeks * 7 days
  for (let i = 1; i <= remainingDays; i++) {
    const day = new Date(monthEnd);
    day.setDate(day.getDate() + i);
    allDays.push(day);
  }

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedDayReservations = selectedDay ? getReservationsForDay(selectedDay) : [];

  return (
    <div className="h-full flex flex-col space-y-3 overflow-hidden px-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">My Reservations</h1>
          <p className="text-xs text-muted-foreground mt-1">View your desk bookings in calendar format</p>
        </div>
        <Button
          onClick={goToToday}
          className="rounded-full px-6 self-start sm:self-auto"
          size="sm"
        >
          Today
        </Button>
      </div>

      {/* Calendar Card */}
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="p-3 md:p-4 flex-1 flex flex-col overflow-hidden">
          {/* Month Navigation */}
          <div className="flex items-center justify-center gap-4 mb-4 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={previousMonth}
              className="h-9 w-9 rounded-full hover:bg-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg md:text-xl font-semibold min-w-[180px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              className="h-9 w-9 rounded-full hover:bg-accent"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="text-center text-xs md:text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {allDays.map((day, index) => {
              const dayReservations = getReservationsForDay(day);
              const hasReservation = dayReservations.length > 0;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);

              return (
                <button
                  key={index}
                  onClick={() => handleDayClick(day)}
                  disabled={!hasReservation}
                  className={cn(
                    'min-h-[80px] md:min-h-[100px] p-2 md:p-3 bg-background border border-border rounded-md transition-all relative',
                    'flex flex-col items-start',
                    isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
                    hasReservation && 'cursor-pointer hover:bg-accent/30 hover:border-primary/40',
                    !hasReservation && 'cursor-default',
                    isTodayDate && 'ring-2 ring-primary ring-offset-0'
                  )}
                >
                  {/* Date Number */}
                  <div className={cn(
                    'text-sm md:text-base font-medium mb-auto',
                    isTodayDate && isCurrentMonth && 'text-primary font-bold'
                  )}>
                    {format(day, 'd')}
                  </div>

                  {/* Event Chips */}
                  {hasReservation && (
                    <div className="w-full space-y-1 mt-1">
                      {dayReservations.slice(0, 2).map((reservation) => (
                        <div
                          key={reservation.id}
                          className="flex items-center gap-1 text-[10px] md:text-xs"
                          title={`${reservation.room?.name} - ${reservation.status}`}
                        >
                          <Circle
                            className={cn(
                              "h-2 w-2 flex-shrink-0 fill-current",
                              reservation.status === 'approved' && 'text-primary',
                              reservation.status === 'pending' && 'text-muted-foreground'
                            )}
                          />
                          <span className={cn(
                            "truncate",
                            reservation.status === 'approved' && 'text-primary',
                            reservation.status === 'pending' && 'text-muted-foreground'
                          )}>
                            {reservation.room?.name}
                          </span>
                        </div>
                      ))}
                      {dayReservations.length > 2 && (
                        <div className="text-[10px] text-muted-foreground">...</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 pt-6 mt-6 border-t">
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 fill-primary text-primary" />
              <span className="text-xs md:text-sm text-muted-foreground">You have bookings</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
              <span className="text-xs md:text-sm text-muted-foreground">No bookings</span>
            </div>
          </div>
        </div>
      </div>

      {/* Day Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reservations for {selectedDay && format(selectedDay, 'MMMM d, yyyy')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedDayReservations.map((reservation) => (
              <div
                key={reservation.id}
                className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="font-semibold">{reservation.room?.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {reservation.cell?.label || `Desk ${reservation.cell?.type}`}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full",
                        reservation.status === 'approved' && 'bg-primary/10 text-primary',
                        reservation.status === 'pending' && 'bg-secondary text-secondary-foreground'
                      )}>
                        {reservation.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {reservation.time_segment}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigate(`/rooms/${reservation.room_id}/view`);
                      setIsDialogOpen(false);
                    }}
                    className="flex-1"
                  >
                    View Room
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      handleCancelReservation(e, reservation.id, reservation.type);
                      setIsDialogOpen(false);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
