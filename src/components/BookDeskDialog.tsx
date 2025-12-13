import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { format, differenceInDays, addYears } from 'date-fns';
import { cn } from '@/lib/utils';

interface Reservation {
  id: string;
  room_id: string;
  cell_id: string;
  user_id: string;
  date_start: string;
  date_end: string;
  status: string;
  type: string;
}

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

interface User {
  id: string;
  username: string;
  full_name: string;
}

export default function BookDeskDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  cellId,
  cellLabel,
  initialDate,
  onBookingComplete
}: BookDeskDialogProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
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

  const callRoomFunction = async (operation: string, data?: Record<string, unknown>) => {
    const session = authService.getSession();
    if (!session) throw new Error('No session');

    const response = await supabase.functions.invoke('manage-rooms', {
      body: { operation, data },
      headers: {
        'x-session-token': session.token,
      },
    });

    if (response.error) throw response.error;
    return response.data;
  };

  const loadUsers = async () => {
    try {
      // Use Edge Function to bypass client-side RLS limitations
      const data = await callRoomFunction('list_room_users', { roomId });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedUsers = (data || [])
        .map((item: any) => item.users)
        .filter((u: any) => !!u && u.is_active !== false) // Basic filtering, though edge function usually handles this
        .sort((a: any, b: any) => (a.full_name || '').localeCompare(b.full_name || ''));

      setUsers(mappedUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      setUsers([]);
    }
  };

  const callReservationFunction = async (operation: string, data?: Record<string, unknown>) => {
    const session = authService.getSession();
    if (!session) throw new Error('No session');

    const response = await supabase.functions.invoke('manage-reservations', {
      body: { operation, data },
      headers: {
        'x-session-token': session.token
      }
    });

    // When Edge Functions return HTTP errors, the actual error message is in response.data
    if (response.error) {
      let errorMessage = '';

      // FIRST: Check response.data for the actual backend error message (most common)
      if (response.data && typeof response.data === 'object') {
        const dataError = response.data as { error?: string; message?: string };
        errorMessage = dataError.error || dataError.message || '';
      }

      // FALLBACK: Check response.error if nothing in response.data
      if (!errorMessage) {
        if (typeof response.error === 'string') {
          errorMessage = response.error;
        } else if (response.error && typeof response.error === 'object') {
          const errorData = response.error as { message?: string; error?: string; msg?: string };
          errorMessage = errorData.message || errorData.error || errorData.msg || JSON.stringify(errorData);
        }
      }

      console.log('Error from backend:', errorMessage);

      // Check for "one desk per day" rule violation in both English and Italian
      if (errorMessage.includes("That's two!") ||
        errorMessage.includes('limit reservations to one') ||
        errorMessage.includes('Non puoi prenotare più di una scrivania') ||
        errorMessage.includes('Hai già una scrivania assegnata') ||
        errorMessage.includes('nello stesso periodo')) {
        throw new Error('ONE_PER_DAY:' + errorMessage);
      }

      throw new Error(errorMessage || 'Unknown error');
    }
    return response.data;
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate) {
      toast({
        title: 'Missing date',
        description: 'Please select a date',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const newReservation = await callReservationFunction('create', {
        room_id: roomId,
        cell_id: cellId,
        type: 'day',
        date_start: format(selectedDate, 'yyyy-MM-dd'),
        date_end: format(selectedDate, 'yyyy-MM-dd'),
        time_segment: 'FULL'
      });

      toast({
        title: 'Desk booked',
        description: 'Your desk reservation is confirmed'
      });

      onOpenChange(false);
      if (onBookingComplete) onBookingComplete(newReservation);

      setSelectedDate(new Date());
      setSelectedDate(new Date());
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const e = error as { message?: string; error?: string };
        message = e.message || e.error || 'Unknown error';
      }

      if (message.startsWith('ONE_PER_DAY:')) {
        setErrorDialogMessage("You cannot book more than one desk per day.");
        setShowErrorDialog(true);
        onOpenChange(false);
        return;
      }

      if (message.includes('already reserved') || message.includes('fixed assignment')) {
        toast({
          title: 'Desk unavailable',
          description: message,
          variant: 'destructive',
        });
        if (onBookingComplete) onBookingComplete();
      } else {
        toast({
          title: 'Booking failed',
          description: message,
          variant: 'destructive',
        });
      }
    }
    setSubmitting(false);
  };

  const handleAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate || !endDate) {
      toast({
        title: 'Missing dates',
        description: 'Please select start and end dates',
        variant: 'destructive'
      });
      return;
    }

    if (!selectedUserId) {
      toast({
        title: 'Missing user',
        description: 'Please select a user to assign the desk to',
        variant: 'destructive'
      });
      return;
    }

    // Validate date range
    const daysDiff = differenceInDays(endDate, startDate);
    if (daysDiff < 0) {
      toast({
        title: 'Invalid date range',
        description: 'End date must be after start date',
        variant: 'destructive'
      });
      return;
    }

    if (daysDiff > 365) {
      toast({
        title: 'Period too long',
        description: 'Assignment period cannot exceed 1 year',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      await callReservationFunction('create_fixed_assignment', {
        room_id: roomId,
        cell_id: cellId,
        assigned_to: selectedUserId,
        date_start: format(startDate, 'yyyy-MM-dd'),
        date_end: format(endDate, 'yyyy-MM-dd')
      });

      const assignedUser = users.find(u => u.id === selectedUserId);
      toast({
        title: 'Desk assigned',
        description: `Desk successfully assigned to ${assignedUser?.full_name} from ${format(startDate, 'PP')} to ${format(endDate, 'PP')}`
      });

      onOpenChange(false);
      if (onBookingComplete) onBookingComplete();

      setStartDate(new Date());
      setEndDate(new Date());
      setSelectedUserId('');
      setSelectedUserId('');
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const e = error as { message?: string; error?: string };
        message = e.message || e.error || 'Unknown error';
      }
      toast({
        title: 'Assignment failed',
        description: message,
        variant: 'destructive',
      });
    }
    setSubmitting(false);
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
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'booking' | 'assignment')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="booking">Book Desk</TabsTrigger>
              <TabsTrigger value="assignment">Assign Desk</TabsTrigger>
            </TabsList>

            <TabsContent value="booking" className="space-y-4">
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
                            !selectedDate && 'text-muted-foreground'
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
                          users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.full_name} (@{user.username})
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
                            !startDate && 'text-muted-foreground'
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
                              // If end date is before new start date, adjust it
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
                            !endDate && 'text-muted-foreground'
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
                        !selectedDate && 'text-muted-foreground'
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
