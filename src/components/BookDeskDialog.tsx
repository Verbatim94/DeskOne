import { useEffect, useState } from 'react';
import { differenceInDays, addYears, format } from 'date-fns';
import { AlertCircle, CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { createReservation } from '@/features/reservations/api';
import { listRoomUsers } from '@/features/rooms/api';
import type { ReservationMutationResult } from '@/features/reservations/types';
import type { RoomUserSummary } from '@/features/rooms/types';
import { getEdgeErrorMessage, getSessionOrThrow } from '@/lib/edge-functions';

type Reservation = ReservationMutationResult;

interface BookDeskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  cellId: string;
  cellLabel: string | null;
  initialDate?: Date;
  onBookingComplete?: (reservation?: Reservation) => void;
}

function isOneDeskPerDayError(message: string) {
  return (
    message.includes("That's two!") ||
    message.includes('limit reservations to one') ||
    message.includes('Non puoi prenotare') ||
    message.includes('Hai gi') ||
    message.includes('nello stesso periodo')
  );
}

export default function BookDeskDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  cellId,
  cellLabel,
  initialDate,
  onBookingComplete,
}: BookDeskDialogProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [users, setUsers] = useState<RoomUserSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'booking' | 'assignment'>('booking');
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');

  useEffect(() => {
    if (open && initialDate) {
      setSelectedDate(initialDate);
      setStartDate(initialDate);
      setEndDate(initialDate);
    }

    if (open && isAdmin) {
      loadUsers();
    }
  }, [open, initialDate, isAdmin]);

  const loadUsers = async () => {
    try {
      const data = await listRoomUsers(roomId);

      const mappedUsers = (data || [])
        .map((item) => item.users)
        .filter((roomUser): roomUser is RoomUserSummary & { is_active?: boolean } => !!roomUser && roomUser.is_active !== false)
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

      setUsers(mappedUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      setUsers([]);
    }
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate) {
      toast({
        title: 'Missing date',
        description: 'Please select a date',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const newReservation = await createReservation({
        room_id: roomId,
        cell_id: cellId,
        type: 'day',
        date_start: format(selectedDate, 'yyyy-MM-dd'),
        date_end: format(selectedDate, 'yyyy-MM-dd'),
        time_segment: 'FULL',
      });

      toast({
        title: 'Desk booked',
        description: `${cellLabel || 'Desk'} booked for ${format(selectedDate, 'EEEE, MMMM d, yyyy')}.`,
      });

      onOpenChange(false);
      onBookingComplete?.(newReservation);
      setSelectedDate(new Date());
    } catch (error: unknown) {
      const message = getEdgeErrorMessage(error);

      if (isOneDeskPerDayError(message)) {
        setErrorDialogMessage('You already have a desk for this date. Cancel the existing booking before reserving another one.');
        setShowErrorDialog(true);
        onOpenChange(false);
        return;
      }

      if (message.includes('already reserved') || message.includes('fixed assignment')) {
        toast({
          title: 'Desk unavailable',
          description: message || 'This desk is no longer available for the selected date.',
          variant: 'destructive',
        });
        onBookingComplete?.();
      } else {
        toast({
          title: 'Booking failed',
          description: message || 'We could not complete the booking. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate || !endDate) {
      toast({
        title: 'Missing dates',
        description: 'Please select start and end dates',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedUserId) {
      toast({
        title: 'Missing user',
        description: 'Please select a user to assign the desk to',
        variant: 'destructive',
      });
      return;
    }

    const daysDiff = differenceInDays(endDate, startDate);
    if (daysDiff < 0) {
      toast({
        title: 'Invalid date range',
        description: 'End date must be after start date',
        variant: 'destructive',
      });
      return;
    }

    if (daysDiff > 365) {
      toast({
        title: 'Period too long',
        description: 'Assignment period cannot exceed 1 year',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const session = getSessionOrThrow();

      const { data: newAssignment, error } = await supabase
        .from('fixed_assignments')
        .insert({
          room_id: roomId,
          cell_id: cellId,
          assigned_to: selectedUserId,
          created_by: session.user.id,
          date_start: format(startDate, 'yyyy-MM-dd'),
          date_end: format(endDate, 'yyyy-MM-dd'),
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const assignedUser = users.find((roomUser) => roomUser.id === selectedUserId);
      toast({
        title: 'Desk assigned',
        description: `Desk successfully assigned to ${assignedUser?.full_name} from ${format(startDate, 'PP')} to ${format(endDate, 'PP')}`,
      });

      onOpenChange(false);
      if (onBookingComplete && assignedUser) {
        onBookingComplete({
          id: newAssignment.id,
          room_id: roomId,
          cell_id: cellId,
          user_id: selectedUserId,
          date_start: format(startDate, 'yyyy-MM-dd'),
          date_end: format(endDate, 'yyyy-MM-dd'),
          status: 'approved',
          type: 'fixed_assignment',
        });
      }

      setStartDate(new Date());
      setEndDate(new Date());
      setSelectedUserId('');
    } catch (error: unknown) {
      toast({
        title: 'Assignment failed',
        description: getEdgeErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const maxEndDate = addYears(startDate, 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isAdmin ? 'Book or Assign Desk' : 'Book Desk'}</DialogTitle>
          <DialogDescription>
            {cellLabel || 'Desk'} in {roomName}
          </DialogDescription>
        </DialogHeader>

        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'booking' | 'assignment')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="booking">Book Desk</TabsTrigger>
              <TabsTrigger value="assignment">Assign Desk</TabsTrigger>
            </TabsList>

            <TabsContent value="booking" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create a one-day booking for this desk on the selected date.
              </p>
              <form onSubmit={handleBooking} className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={selectedDate <= new Date(new Date().setHours(0, 0, 0, 0))}
                      onClick={() => {
                        const prevDay = new Date(selectedDate);
                        prevDay.setDate(prevDay.getDate() - 1);
                        if (prevDay >= new Date(new Date().setHours(0, 0, 0, 0))) {
                          setSelectedDate(prevDay);
                        }
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            'min-w-[240px] justify-start text-left font-normal',
                            !selectedDate && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => date && setSelectedDate(date)}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const nextDay = new Date(selectedDate);
                        nextDay.setDate(nextDay.getDate() + 1);
                        setSelectedDate(nextDay);
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Full day reservation for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Booking...' : 'Book Desk'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="assignment" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Reserve this desk for one user across a date range.
              </p>
              <form onSubmit={handleAssignment} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Assign to User</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.length > 0 ? (
                          users.map((roomUser) => (
                            <SelectItem key={roomUser.id} value={roomUser.id}>
                              {roomUser.full_name} (@{roomUser.username})
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            No users have access to this room
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !startDate && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, 'PPP') : 'Pick start date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => {
                            if (date) {
                              setStartDate(date);
                              if (endDate < date) {
                                setEndDate(date);
                              }
                            }
                          }}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !endDate && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, 'PPP') : 'Pick end date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => date && setEndDate(date)}
                          disabled={(date) =>
                            date < startDate ||
                            date > maxEndDate ||
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {startDate && endDate && (
                    <p className="text-sm text-muted-foreground">
                      Assignment period: {differenceInDays(endDate, startDate) + 1} days
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Assigning...' : 'Assign Desk'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        ) : (
          <form onSubmit={handleBooking} className="space-y-6">
            <p className="text-sm text-muted-foreground">
              This booking reserves the desk for the full selected day.
            </p>
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const prevDay = new Date(selectedDate);
                    prevDay.setDate(prevDay.getDate() - 1);
                    setSelectedDate(prevDay);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'min-w-[240px] justify-start text-left font-normal',
                        !selectedDate && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const nextDay = new Date(selectedDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    setSelectedDate(nextDay);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                Full day reservation for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Booking...' : 'Book Desk'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>

      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent className="sm:max-w-[425px] text-center top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-red-100 text-red-600">
              <AlertCircle className="h-8 w-8" />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-semibold text-center">Booking Limit Reached</AlertDialogTitle>
              <AlertDialogDescription className="text-center text-base">
                {errorDialogMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction className="w-full sm:w-auto min-w-[120px]">
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
