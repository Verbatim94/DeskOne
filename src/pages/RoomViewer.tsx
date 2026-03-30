import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Armchair, Crown, DoorOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import BookDeskDialog from '@/components/BookDeskDialog';
import ReservationDetailsDialog from '@/components/ReservationDetailsDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { format, parseISO, isWithinInterval, addDays, isEqual } from 'date-fns';


type DeskType = 'desk';

interface Cell {
  id: string;
  x: number;
  y: number;
  type: DeskType;
  label: string | null;
}

interface Room {
  id: string;
  name: string;
  grid_width: number;
  grid_height: number;
}

interface Reservation {
  id: string;
  cell_id: string;
  user_id: string;
  status: string;
  date_start: string;
  date_end: string;
  time_segment: string;
  user: { id: string; username: string; full_name: string };
  type: string;
  room?: { id: string; name: string };
  cell?: { id: string; label: string | null; type: string; x?: number; y?: number };
  created_at: string;
}

interface FixedAssignment {
  id: string;
  cell_id: string;
  assigned_to: string;
  date_start: string;
  date_end: string;
  assigned_user: {
    id: string;
    username: string;
    full_name: string;
  } | null;
  created_at?: string;
}

interface Wall {
  id: string;
  room_id: string;
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
  orientation: 'horizontal' | 'vertical';
  type: 'wall' | 'entrance';
}

type DeskStatus = 'available' | 'reserved' | 'my-reservation';
type DeskStatusDetails = { status: DeskStatus; reservation?: Reservation; assignedTo?: string };

const CELL_SIZE = 50;

const DESK_TYPES: {
  type: DeskType;
  label: string;
  color: string;
  bgColor: string;
  icon: typeof Armchair;
}[] = [
    {
      type: 'desk',
      label: 'Standard Desk',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 hover:bg-blue-200 border-blue-300',
      icon: Armchair,
    },
  ];

export default function RoomViewer() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [fixedAssignments, setFixedAssignments] = useState<FixedAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [reservationDetailsOpen, setReservationDetailsOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isRoomAdmin, setIsRoomAdmin] = useState(false);


  const [walls, setWalls] = useState<Wall[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeTab, setActiveTab] = useState<'desks' | 'rooms'>('desks');
  const [refreshingColors, setRefreshingColors] = useState(false);
  const [deskSearch, setDeskSearch] = useState('');
  const [deskFilter, setDeskFilter] = useState<'all' | 'available' | 'reserved' | 'mine'>('all');
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const latestAvailabilityRequestRef = useRef(0);
  const selectedDateRef = useRef(selectedDate);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);



  useEffect(() => {
    loadRoom();
    loadRooms();

    const channel = supabase
      .channel(`room-viewer-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          console.log('Reservation changed, reloading...');
          loadAvailabilityState();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fixed_assignments',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          console.log('Fixed assignment changed, reloading...');
          loadAvailabilityState();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (room) {
      loadAvailabilityState();
    }
  }, [selectedDate, room]);

  useEffect(() => {
    if (!roomId) return;

    const intervalId = window.setInterval(() => {
      loadAvailabilityState();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAvailabilityState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomId, selectedDate]);

  useEffect(() => {
    if (!selectedDeskId && cells.length > 0) {
      setSelectedDeskId(cells[0].id);
    }
  }, [cells, selectedDeskId]);

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

  const callReservationFunction = async (operation: string, data?: Record<string, unknown>) => {
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

  const loadRoom = async () => {
    if (!roomId) return;

    setLoading(true);

    try {
      const result = await callRoomFunction('get', { roomId });
      setRoom(result.room);
      setCells(result.cells || []);
      setWalls(result.walls || []);
      setIsRoomAdmin(false);

      // Check if user is room admin
      const session = authService.getSession();
      if (session?.user.role === 'admin' || session?.user.role === 'super_admin') {
        setIsRoomAdmin(true);
      } else {
        const { data: access } = await supabase
          .from('room_access')
          .select('role')
          .eq('room_id', roomId)
          .eq('user_id', session?.user.id)
          .single();

        if (access?.role === 'admin') {
          setIsRoomAdmin(true);
        }
      }
      await loadAvailabilityState();
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error loading room',
        description: message,
        variant: 'destructive',
      });
      navigate('/rooms');
    }

    setLoading(false);
  };

  const loadRooms = async () => {
    try {
      const result = await callRoomFunction('list');
      setRooms(result || []);
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  };

  const loadAvailabilityState = async () => {
    if (!roomId) return;
    const requestId = ++latestAvailabilityRequestRef.current;

    try {
      const roomDayState = await callReservationFunction('get_room_day_state', {
        roomId,
        date: format(selectedDateRef.current, 'yyyy-MM-dd'),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedReservations = (roomDayState?.reservations || []).map((r: any): Reservation => ({
        id: r.id,
        cell_id: r.cell_id,
        user_id: r.user_id,
        status: r.status,
        date_start: r.date_start,
        date_end: r.date_end,
        time_segment: r.time_segment,
        user: r.users,
        type: 'reservation',
        created_at: r.created_at
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedAssignments = (roomDayState?.fixed_assignments || []).map((assignment: any): FixedAssignment => ({
        id: assignment.id,
        cell_id: assignment.cell_id,
        assigned_to: assignment.assigned_to,
        date_start: assignment.date_start,
        date_end: assignment.date_end,
        created_at: assignment.created_at,
        assigned_user: assignment.assigned_user
          ? {
              id: assignment.assigned_user.id,
              full_name: assignment.assigned_user.full_name,
              username: assignment.assigned_user.username,
            }
          : null,
      }));

      if (requestId === latestAvailabilityRequestRef.current) {
        setReservations(mappedReservations);
        setFixedAssignments(mappedAssignments);
        setAvailabilityError(null);
      }
    } catch (error: unknown) {
      if (requestId === latestAvailabilityRequestRef.current) {
        console.error('Error loading room availability:', error);
        setAvailabilityError('Availability could not be synchronized. Showing the latest loaded state.');
      }
    }
  };

  const handleAdminRefresh = async () => {
    setRefreshingColors(true);

    try {
      await Promise.all([
        loadRoom(),
        loadRooms(),
        loadAvailabilityState(),
      ]);

      toast({
        title: 'Colors refreshed',
        description: 'Room availability was synchronized successfully.',
      });
    } catch (error: unknown) {
      let message = 'Unable to refresh room availability.';
      if (error instanceof Error && error.message) {
        message = error.message;
      }

      toast({
        title: 'Refresh failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setRefreshingColors(false);
    }
  };

  const getReservationDisplayName = (reservation?: Reservation | null, assignedTo?: string) => {
    const fullName = reservation?.user?.full_name?.trim();
    const username = reservation?.user?.username?.trim();
    const assignedName = assignedTo?.trim();

    return fullName || username || assignedName || 'another user';
  };

  const buildDeskStatus = (cellId: string, dayToCheck: Date): DeskStatusDetails => {
    // Check for fixed assignments first
    const activeAssignment = fixedAssignments.find((a) => {
      if (a.cell_id !== cellId) return false;

      try {
        const startDate = parseISO(a.date_start);
        const endDate = parseISO(a.date_end);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

        return isWithinInterval(dayToCheck, { start: startDate, end: endDate });
      } catch (e) {
        console.error('Error parsing date for assignment:', a, e);
        return false;
      }
    });

    if (activeAssignment) {
      const isMyAssignment = activeAssignment.assigned_to === user?.id;
      // Convert fixed assignment to reservation format for consistent handling
      const assignmentAsReservation: Reservation = {
        id: activeAssignment.id,
        cell_id: activeAssignment.cell_id,
        user_id: activeAssignment.assigned_to,
        status: 'approved',
        date_start: activeAssignment.date_start,
        date_end: activeAssignment.date_end,
        time_segment: 'FULL',
        type: 'fixed_assignment', // Mark as fixed assignment for proper deletion
        user: activeAssignment.assigned_user || { id: activeAssignment.assigned_to, username: '', full_name: 'Unknown User' },
        created_at: activeAssignment.created_at || new Date().toISOString()
      };
      return {
        status: isMyAssignment ? 'my-reservation' : 'reserved',
        reservation: assignmentAsReservation,
        assignedTo: activeAssignment.assigned_user?.full_name || 'Unknown User',
      };
    }

    // Check for regular reservations
    const activeReservations = reservations.filter((r) => {
      if (r.cell_id !== cellId) return false;
      if (r.status === 'cancelled' || r.status === 'rejected') return false;

      try {
        const startDate = parseISO(r.date_start);
        const endDate = parseISO(r.date_end);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

        return isWithinInterval(dayToCheck, { start: startDate, end: endDate });
      } catch (e) {
        console.error('Error parsing date for reservation:', r, e);
        return false;
      }
    });

    const activeReservation = activeReservations[0];
    if (activeReservation) {
      const isMyReservation = activeReservation.user_id === user?.id;
      return {
        status: isMyReservation ? 'my-reservation' : 'reserved',
        reservation: activeReservation,
      };
    }

    return { status: 'available' };
  };

  const getDeskBackgroundColor = (status: DeskStatus, baseColor: string) => {
    switch (status) {
      case 'reserved':
        return 'bg-red-500/80 border-red-600';
      case 'my-reservation':
        return 'bg-purple-500/80 border-purple-600';
      case 'available':
        return 'bg-blue-500/80 border-blue-600';
    }
  };

  const getCellAt = (x: number, y: number): Cell | undefined => {
    return cells.find((c) => c.x === x && c.y === y);
  };

  const handleCellClick = (cell: Cell) => {
    setSelectedDeskId(cell.id);
    const { status, reservation, assignedTo } = getDeskStatus(cell.id);
    const canManageReservedDesk = user?.role === 'admin' || user?.role === 'super_admin';

    // Show reservation details for my own reservations
    if (status === 'my-reservation' && reservation) {
      setSelectedReservation({
        ...reservation,
        room: { id: roomId!, name: room?.name || '' },
        cell: { id: cell.id, label: cell.label, type: cell.type, x: cell.x, y: cell.y }
      });
      setReservationDetailsOpen(true);
      return;
    }

    // If admin clicks on reserved desk, show reservation details
    if (status === 'reserved' && isRoomAdmin && reservation) {
      setSelectedReservation({
        ...reservation,
        room: { id: roomId!, name: room?.name || '' },
        cell: { id: cell.id, label: cell.label, type: cell.type, x: cell.x, y: cell.y }
      });
      setReservationDetailsOpen(true);
      return;
    }

    // Only block non-admins from booking reserved desks
    if (status === 'reserved' && !canManageReservedDesk) {
      toast({
        title: 'Desk unavailable',
        description: `This desk is ${assignedTo ? `assigned to ${assignedTo}` : `reserved by ${getReservationDisplayName(reservation, assignedTo)}`}`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedCell(cell);
    setBookingDialogOpen(true);
  };

  const handleDeskListClick = (cell: Cell) => {
    setSelectedDeskId(cell.id);
    const canManageReservedDesk = user?.role === 'admin' || user?.role === 'super_admin';
    const { status } = getDeskStatus(cell.id);
    if (status === 'available' || canManageReservedDesk) {
      setSelectedCell(cell);
      setBookingDialogOpen(true);
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!room) return null;

  // Safety check for grid dimensions
  if (typeof room.grid_width !== 'number' || typeof room.grid_height !== 'number') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="p-8 text-center bg-white rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-destructive mb-2">Error: Invalid Room Configuration</h2>
          <p className="text-muted-foreground mb-4">The room data is incomplete (missing grid dimensions).</p>
          <Button variant="outline" onClick={() => navigate('/rooms')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Rooms
          </Button>
        </div>
      </div>
    );
  }

  // Safety checks for arrays
  const safeWalls = Array.isArray(walls) ? walls : [];
  const safeCells = Array.isArray(cells) ? cells : [];
  const dayToCheck = new Date(selectedDate);
  dayToCheck.setHours(0, 0, 0, 0);

  const deskStatuses = safeCells.reduce<Record<string, DeskStatusDetails>>((acc, cell) => {
    acc[cell.id] = buildDeskStatus(cell.id, dayToCheck);
    return acc;
  }, {});

  const getDeskStatus = (cellId: string): DeskStatusDetails => deskStatuses[cellId] || { status: 'available' };

  const sortedCells = [...safeCells].sort((a, b) => {
    const aLabel = a.label || `${a.x}-${a.y}`;
    const bLabel = b.label || `${b.x}-${b.y}`;
    return aLabel.localeCompare(bLabel);
  });

  const availableDeskCount = sortedCells.reduce((count, cell) => {
    return count + (getDeskStatus(cell.id).status === 'available' ? 1 : 0);
  }, 0);
  const reservedDeskCount = sortedCells.reduce((count, cell) => {
    return count + (getDeskStatus(cell.id).status === 'reserved' ? 1 : 0);
  }, 0);
  const myDeskCount = sortedCells.reduce((count, cell) => {
    return count + (getDeskStatus(cell.id).status === 'my-reservation' ? 1 : 0);
  }, 0);
  const selectedDateLabel = format(selectedDate, 'EEEE, MMMM d, yyyy');
  const selectedDesk = sortedCells.find((cell) => cell.id === selectedDeskId) || null;
  const selectedDeskStatus = selectedDesk ? getDeskStatus(selectedDesk.id) : null;
  const normalizedDeskSearch = deskSearch.trim().toLowerCase();
  const visibleCells = sortedCells.filter((cell) => {
    const matchesSearch = !normalizedDeskSearch
      || (cell.label || `Desk ${cell.x}-${cell.y}`).toLowerCase().includes(normalizedDeskSearch);
    if (!matchesSearch) return false;

    const status = getDeskStatus(cell.id).status;
    if (deskFilter === 'all') return true;
    if (deskFilter === 'available') return status === 'available';
    if (deskFilter === 'reserved') return status === 'reserved';
    return status === 'my-reservation';
  });
  const visibleDeskCount = visibleCells.length;

  return (
    <TooltipProvider>
      <div className="lg:h-full min-h-screen bg-gray-50/50 p-4 flex flex-col space-y-4 lg:overflow-hidden">
        {/* Google-style Header */}
        <div className="flex flex-col md:flex-row items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100 flex-shrink-0 gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/rooms')}
              className="rounded-full hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Button>
            <div>
              <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-blue-700">
                Room Availability
              </div>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{room.name}</h1>
              <p className="text-sm text-slate-500">
                {format(selectedDate, 'MMMM d, yyyy')}
              </p>
              <p className="text-sm text-slate-400">
                Showing availability for {selectedDateLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            {/* Date Navigation Pills */}
            <div className="flex items-center justify-between w-full sm:w-auto bg-gray-100/80 p-1 rounded-full">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-white hover:shadow-sm transition-all"
                disabled={selectedDate <= new Date(new Date().setHours(0, 0, 0, 0))}
                onClick={() => {
                  const prevDay = new Date(selectedDate);
                  prevDay.setDate(prevDay.getDate() - 1);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (prevDay >= today) setSelectedDate(prevDay);
                }}
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="px-4 text-sm font-medium text-gray-700 min-w-[120px] text-center flex-1 sm:flex-none hover:bg-gray-200 rounded-md py-1 transition-colors"
                  >
                    {format(selectedDate, 'EEE, MMM d')}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-white hover:shadow-sm transition-all"
                onClick={() => {
                  const nextDay = new Date(selectedDate);
                  nextDay.setDate(nextDay.getDate() + 1);
                  setSelectedDate(nextDay);
                }}
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </Button>
            </div>

            <Button
              variant={selectedDate.toDateString() === new Date().toDateString() ? 'default' : 'ghost'}
              onClick={() => setSelectedDate(new Date())}
              className={`rounded-full px-6 w-full sm:w-auto ${selectedDate.toDateString() === new Date().toDateString()
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              Today
            </Button>
            {isRoomAdmin && (
              <Button
                variant="outline"
                onClick={handleAdminRefresh}
                disabled={refreshingColors}
                className="rounded-full px-4 w-full sm:w-auto"
              >
                {refreshingColors ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Sync Availability
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 lg:flex-1 lg:overflow-hidden">
          {/* Main Content: Grid */}
          <div className="flex flex-col space-y-3 lg:overflow-hidden">
            {availabilityError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {availabilityError}
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-shrink-0">
              <Card className="rounded-2xl border-blue-100 bg-blue-50/70 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Available</p>
                <p className="mt-1 text-2xl font-semibold text-blue-900">{availableDeskCount}</p>
                <p className="text-xs text-blue-700">Open for {selectedDateLabel}</p>
              </Card>
              <Card className="rounded-2xl border-red-100 bg-red-50/70 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-red-700">Reserved</p>
                <p className="mt-1 text-2xl font-semibold text-red-900">{reservedDeskCount}</p>
                <p className="text-xs text-red-700">Booked or assigned to others</p>
              </Card>
              <Card className="rounded-2xl border-purple-100 bg-purple-50/70 px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-purple-700">Your Spot</p>
                <p className="mt-1 text-2xl font-semibold text-purple-900">{myDeskCount}</p>
                <p className="text-xs text-purple-700">Desks held by you on this date</p>
              </Card>
            </div>

            {/* Floating Legend */}
            <div className="bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 inline-flex items-center gap-6 text-sm flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></div>
                <span className="text-gray-600 font-medium">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div>
                <span className="text-gray-600 font-medium">Reserved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500 shadow-sm"></div>
                <span className="text-gray-600 font-medium">Your Spot</span>
              </div>
            </div>

            {/* Room Grid Container */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 lg:flex-1 flex flex-col relative overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Interactive Map</p>
                  <p className="mt-1 text-sm text-slate-600">Select a desk to inspect or book it for the chosen date.</p>
                </div>
                <Badge variant="secondary" className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  {room.grid_width} x {room.grid_height} layout
                </Badge>
              </div>
              <div className="overflow-auto touch-pan-x touch-pan-y w-full h-[60vh] lg:h-full p-10 flex bg-[linear-gradient(0deg,rgba(226,232,240,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(226,232,240,0.2)_1px,transparent_1px)] bg-[size:36px_36px]">
                <div
                  className="inline-block relative flex-shrink-0 m-auto"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${room.grid_width}, ${CELL_SIZE}px)`,
                    gap: '8px', // Increased gap for airy feel
                  }}
                >
                  {/* Render Walls as SVG with Connected Paths and Rounded Corners */}
                  <svg
                    className="absolute top-0 left-0 pointer-events-none z-10"
                    style={{
                      width: room.grid_width * (CELL_SIZE + 8),
                      height: room.grid_height * (CELL_SIZE + 8),
                      overflow: 'visible',
                    }}
                  >
                    {safeWalls.map(wall => {
                      if (!wall) return null;
                      const x = wall.orientation === 'vertical'
                        ? (wall.start_col * (CELL_SIZE + 8)) - 2
                        : (wall.start_col * (CELL_SIZE + 8));
                      const y = wall.orientation === 'horizontal'
                        ? (wall.start_row * (CELL_SIZE + 8)) - 2
                        : (wall.start_row * (CELL_SIZE + 8));
                      const width = wall.orientation === 'vertical' ? 4 : (wall.end_col - wall.start_col) * (CELL_SIZE + 8);
                      const height = wall.orientation === 'horizontal' ? 4 : (wall.end_row - wall.start_row) * (CELL_SIZE + 8);

                      if (wall.type === 'entrance') {
                        // Google-Style Entrance Drawing
                        const midX = x + width / 2;
                        const midY = y + height / 2;
                        const isHorizontal = wall.orientation === 'horizontal';

                        // Create unique gradient ID for this entrance
                        const gradientId = `entrance-gradient-${wall.id}`;
                        const patternId = `entrance-pattern-${wall.id}`;

                        return (
                          <g key={wall.id}>
                            {/* Define gradient */}
                            <defs>
                              <linearGradient
                                id={gradientId}
                                x1="0%"
                                y1="0%"
                                x2={isHorizontal ? "100%" : "0%"}
                                y2={isHorizontal ? "0%" : "100%"}
                              >
                                <stop offset="0%" style={{ stopColor: '#4285f4', stopOpacity: 0.9 }} />
                                <stop offset="100%" style={{ stopColor: '#1967d2', stopOpacity: 0.9 }} />
                              </linearGradient>

                              {/* Diagonal stripe pattern for entrance effect */}
                              <pattern
                                id={patternId}
                                patternUnits="userSpaceOnUse"
                                width="8"
                                height="8"
                                patternTransform={`rotate(${isHorizontal ? 45 : -45})`}
                              >
                                <rect width="8" height="8" fill={`url(#${gradientId})`} />
                                <line x1="0" y1="0" x2="0" y2="8" stroke="white" strokeWidth="1" opacity="0.3" />
                              </pattern>
                            </defs>

                            {/* Shadow/Glow effect */}
                            <rect
                              x={x - 1}
                              y={y - 1}
                              width={width + 2}
                              height={height + 2}
                              fill="#4285f4"
                              opacity="0.2"
                              rx="4"
                              ry="4"
                            />

                            {/* Main entrance rectangle with gradient */}
                            <rect
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              fill={`url(#${patternId})`}
                              rx="3"
                              ry="3"
                            />

                            {/* Border accent */}
                            <rect
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              fill="none"
                              stroke="#1967d2"
                              strokeWidth="0.5"
                              rx="3"
                              ry="3"
                            />

                            {/* Text Label with modern Google font style */}
                            <text
                              x={midX}
                              y={midY}
                              fill="white"
                              fontSize="9"
                              fontWeight="600"
                              fontFamily="'Google Sans', 'Roboto', sans-serif"
                              textAnchor="middle"
                              alignmentBaseline="middle"
                              transform={`rotate(${isHorizontal ? 0 : -90}, ${midX}, ${midY})`}
                              style={{
                                pointerEvents: 'none',
                                userSelect: 'none',
                                letterSpacing: '0.5px',
                                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                              }}
                            >
                              ENTRANCE
                            </text>
                          </g>
                        );
                      }

                      return (
                        <rect
                          key={wall.id}
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill="#1e3a8a"
                          rx="2"
                          ry="2"
                        />
                      );
                    })}
                  </svg>

                  {Array.from({ length: room.grid_height }, (_, y) =>
                    Array.from({ length: room.grid_width }, (_, x) => {
                      const cell = getCellAt(x, y);
                      const deskInfo = DESK_TYPES.find((d) => d.type === cell?.type);
                      const Icon = deskInfo?.icon;
                      const isBookable = !!cell;
                      const { status, reservation, assignedTo } = cell
                        ? getDeskStatus(cell.id)
                        : ({ status: 'available' as DeskStatus } as { status: DeskStatus; reservation?: Reservation; assignedTo?: string });

                      if (cell) {
                        const isSelected = selectedDeskId === cell.id;

                        // Custom Google-like styling
                        let bgClass = 'bg-white border-2 border-slate-200';
                        let iconColor = 'text-gray-400';

                        if (status === 'available') {
                          bgClass = 'bg-blue-50 border-2 border-blue-100 hover:border-blue-300 hover:shadow-md';
                          iconColor = 'text-blue-500';
                        } else if (status === 'reserved') {
                          bgClass = 'bg-red-50 border-2 border-red-200';
                          iconColor = 'text-red-500';
                        } else if (status === 'my-reservation') {
                          bgClass = 'bg-purple-50 border-2 border-purple-200 shadow-sm';
                          iconColor = 'text-purple-500';
                        }



                        return (
                          <div
                            key={`${x}-${y}`}
                            className={`
                          relative rounded-2xl transition-all duration-300 ease-out
                          flex flex-col items-center justify-center
                          ${bgClass}
                          ${isSelected ? 'ring-2 ring-offset-2 ring-blue-500 scale-105 shadow-lg' : ''}
                          ${isBookable && status !== 'reserved' ? 'cursor-pointer hover:-translate-y-1' : ''}
                        `}
                            style={{ width: CELL_SIZE, height: CELL_SIZE }}
                            onClick={() => cell && isBookable && handleCellClick(cell)}
                            title={cell.label || 'Desk'}
                          >
                            {cell && Icon && (
                              <Icon className={`h-5 w-5 ${iconColor} transition-colors mb-0.5`} strokeWidth={2} />
                            )}
                            <span className={`text-[9px] font-bold truncate max-w-full px-1 ${status === 'reserved' ? 'text-gray-400' : 'text-gray-600'}`}>
                              {cell.label}
                            </span>
                            {/* Status Dot */}
                            {isBookable && (
                              <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${status === 'available' ? 'bg-blue-400' :
                                status === 'my-reservation' ? 'bg-purple-400' : 'bg-red-300'
                                }`} />
                            )}
                          </div>
                        );
                      } else {
                        // Empty cell
                        return (
                          <div
                            key={`${x}-${y}`}
                            className="rounded-xl relative flex items-center justify-center transition-all duration-200"
                            style={{ width: CELL_SIZE, height: CELL_SIZE }}
                          >
                          </div>
                        );
                      }
                    }),
                  )}

                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Available Desks */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col lg:h-full lg:overflow-hidden">
            {/* Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-xl mb-4 flex-shrink-0">
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'desks'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
                onClick={() => setActiveTab('desks')}
              >
                Desks
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'rooms'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
                onClick={() => setActiveTab('rooms')}
              >
                Rooms
              </button>
            </div>

            {activeTab === 'desks' ? (
              <>
                <div className="space-y-4 flex-shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      Desk Directory
                      <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100">
                        {visibleDeskCount}
                      </Badge>
                    </h3>
                    <p className="text-xs text-gray-500">for {format(selectedDate, 'MMM d')}</p>
                  </div>

                  <Input
                    value={deskSearch}
                    onChange={(e) => setDeskSearch(e.target.value)}
                    placeholder="Search desk label..."
                    className="rounded-xl border-gray-200"
                  />

                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'available', label: 'Available' },
                      { value: 'reserved', label: 'Reserved' },
                      { value: 'mine', label: 'Mine' },
                    ].map((filter) => (
                      <Button
                        key={filter.value}
                        type="button"
                        variant={deskFilter === filter.value ? 'default' : 'outline'}
                        size="sm"
                        className="rounded-full"
                        onClick={() => setDeskFilter(filter.value as 'all' | 'available' | 'reserved' | 'mine')}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>

                  {selectedDesk && selectedDeskStatus && (
                    <Card className="rounded-2xl border-gray-100 bg-gray-50/80 p-4 shadow-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Selected Desk</p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {selectedDesk.label || `Desk ${selectedDesk.x}-${selectedDesk.y}`}
                          </p>
                          <p className="text-sm text-gray-500">
                            {selectedDeskStatus.status === 'available'
                              ? `Available on ${selectedDateLabel}`
                              : selectedDeskStatus.status === 'my-reservation'
                                ? 'Booked by you for this date'
                                : `Reserved by ${getReservationDisplayName(selectedDeskStatus.reservation, selectedDeskStatus.assignedTo)}`}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'rounded-full',
                            selectedDeskStatus.status === 'available' && 'bg-blue-50 text-blue-700',
                            selectedDeskStatus.status === 'reserved' && 'bg-red-50 text-red-700',
                            selectedDeskStatus.status === 'my-reservation' && 'bg-purple-50 text-purple-700',
                          )}
                        >
                          {selectedDeskStatus.status === 'my-reservation'
                            ? 'Your Spot'
                            : selectedDeskStatus.status === 'reserved'
                              ? 'Reserved'
                              : 'Available'}
                        </Badge>
                      </div>
                    </Card>
                  )}
                </div>

                <div className="space-y-3 lg:overflow-y-auto lg:pr-2 custom-scrollbar lg:flex-1">
                  {visibleCells.map((cell) => {
                      const deskInfo = DESK_TYPES.find((d) => d.type === cell.type);
                      const Icon = deskInfo?.icon;
                      const { status, reservation, assignedTo } = getDeskStatus(cell.id);
                      const isAvailable = status === 'available';
                      const isMyReservation = status === 'my-reservation';
                      const isSelected = selectedDeskId === cell.id;

                      return (
                        <div
                          key={cell.id}
                          className={`
                        group rounded-2xl p-4 transition-all duration-200 cursor-pointer border
                        ${isSelected ? 'ring-2 ring-blue-500 border-blue-200 shadow-md' : ''}
                        ${isAvailable
                              ? 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                              : isMyReservation
                                ? 'bg-purple-50 border-purple-100'
                                : 'bg-gray-50 border-transparent opacity-70'
                            }
                      `}
                          onClick={() => {
                            setSelectedDeskId(cell.id);
                            if (status !== 'reserved' || user?.role === 'admin' || user?.role === 'super_admin') {
                              handleDeskListClick(cell);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`
                            p-3 rounded-xl 
                            ${isAvailable ? 'bg-blue-50 text-blue-600' : isMyReservation ? 'bg-purple-100 text-purple-600' : 'bg-red-100 text-red-600'}
                          `}>
                                {Icon && <Icon className="h-5 w-5" />}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {cell.label || `Desk ${cell.x}-${cell.y}`}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {isAvailable
                                    ? `Available on ${format(selectedDate, 'MMM d')}`
                                    : isMyReservation
                                      ? 'Booked by you for this date'
                                      : `Reserved by ${getReservationDisplayName(reservation, assignedTo)}`}
                                </p>
                              </div>
                            </div>

                            {(isAvailable || user?.role === 'admin' || user?.role === 'super_admin') && (
                              <Button
                                size="sm"
                                className={`
                              rounded-full px-4 opacity-0 group-hover:opacity-100 transition-all
                              ${isAvailable ? 'bg-blue-600 hover:bg-blue-700' : ''}
                            `}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDeskId(cell.id);
                                  handleDeskListClick(cell);
                                }}
                              >
                                {isAvailable ? 'Book' : 'View'}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {visibleDeskCount === 0 && (
                    <div className="text-center py-10 text-gray-400">
                      <Armchair className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No desks match the current filters.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  All Rooms
                  <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100">
                    {rooms.length}
                  </Badge>
                </h3>

                <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                  {rooms.map((r) => (
                    <div
                      key={r.id}
                      className={`
                      group rounded-2xl p-4 transition-all duration-200 cursor-pointer border 
                      ${r.id === roomId
                          ? 'bg-blue-50 border-blue-200 shadow-sm'
                          : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                        }
                    `}
                      onClick={() => navigate(`/rooms/${r.id}/view`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`
                          p-3 rounded-xl flex-shrink-0
                          ${r.id === roomId ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}
                        `}>
                            <Armchair className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className={`font-semibold truncate w-full block ${r.id === roomId ? 'text-blue-900' : 'text-gray-900'}`}>
                                  {r.name}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p>{r.name}</p>
                              </TooltipContent>
                            </Tooltip>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {r.grid_width} × {r.grid_height} Grid
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {rooms.length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                      <Armchair className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No rooms found.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div >

        {selectedCell && room && (
          <BookDeskDialog
            open={bookingDialogOpen}
            onOpenChange={setBookingDialogOpen}
            roomId={room.id}
            roomName={room.name}
            cellId={selectedCell.id}
            cellLabel={selectedCell.label}
            initialDate={selectedDate}
            onBookingComplete={(newReservation) => {
              if (newReservation && user) {
                const nr = newReservation as unknown as Reservation;
                const optimisticReservation: Reservation = {
                  ...nr,
                  time_segment: nr.time_segment || 'FULL',
                  created_at: nr.created_at || new Date().toISOString(),
                  user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name
                  },
                  type: 'reservation'
                };
                setReservations(prev => [...prev, optimisticReservation]);
              }
              loadAvailabilityState();
              setBookingDialogOpen(false);
            }}
          />
        )
        }

        {
          selectedReservation && (
            <ReservationDetailsDialog
              open={reservationDetailsOpen}
              onOpenChange={setReservationDetailsOpen}
              reservation={selectedReservation as unknown as (Reservation & { room: { id: string; name: string }; cell: { id: string; label: string | null; type: string; x?: number; y?: number }; })}
              isAdmin={isRoomAdmin}
              onDelete={
                isRoomAdmin || (user && selectedReservation.user_id === user.id)
                  ? async () => {
                    try {
                      if (selectedReservation.type === 'fixed_assignment') {
                        // Smart Partial Cancellation Logic
                        const assignment = fixedAssignments.find(a => a.id === selectedReservation.id);
                        if (!assignment) throw new Error('Assignment not found locally');

                        const targetDateStr = format(selectedDate, 'yyyy-MM-dd');
                        const start = parseISO(assignment.date_start);
                        const end = parseISO(assignment.date_end);
                        const target = parseISO(targetDateStr);
                        start.setHours(0, 0, 0, 0);
                        end.setHours(0, 0, 0, 0);
                        target.setHours(0, 0, 0, 0);

                        if (isEqual(start, end)) {
                          // Case 1: Single day -> Delete
                          const { error } = await supabase.from('fixed_assignments').delete().eq('id', assignment.id);
                          if (error) throw error;
                        } else if (isEqual(target, start)) {
                          // Case 2: First day -> Update Start
                          const newStart = addDays(start, 1);
                          const { error } = await supabase.from('fixed_assignments')
                            .update({ date_start: format(newStart, 'yyyy-MM-dd') })
                            .eq('id', assignment.id);
                          if (error) throw error;
                        } else if (isEqual(target, end)) {
                          // Case 3: Last day -> Update End
                          const newEnd = addDays(end, -1);
                          const { error } = await supabase.from('fixed_assignments')
                            .update({ date_end: format(newEnd, 'yyyy-MM-dd') })
                            .eq('id', assignment.id);
                          if (error) throw error;
                        } else {
                          // Case 4: Middle day -> Split
                          const firstPartEnd = addDays(target, -1);
                          const secondPartStart = addDays(target, 1);

                          // Update first part
                          const { error: updateError } = await supabase.from('fixed_assignments')
                            .update({ date_end: format(firstPartEnd, 'yyyy-MM-dd') })
                            .eq('id', assignment.id);
                          if (updateError) throw updateError;

                          // Insert second part
                          const { error: insertError } = await supabase.from('fixed_assignments').insert({
                            room_id: roomId,
                            cell_id: assignment.cell_id,
                            assigned_to: assignment.assigned_to,
                            created_by: user?.id,
                            date_start: format(secondPartStart, 'yyyy-MM-dd'),
                            date_end: format(end, 'yyyy-MM-dd')
                          });
                          if (insertError) throw insertError;
                        }

                        toast({ title: 'Availability updated', description: 'Selected day removed from assignment.' });
                      } else {
                        await callReservationFunction('cancel', {
                          reservationId: selectedReservation.id
                        });
                        toast({
                          title: 'Reservation cancelled',
                          description: 'Reservation cancelled successfully'
                        });
                      }
                      setReservationDetailsOpen(false);
                      setSelectedReservation(null);
                      loadAvailabilityState();
                    } catch (error: unknown) {
                      let message = 'Unknown error';
                      if (error instanceof Error) message = error.message;
                      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
                      toast({
                        title: 'Error',
                        description: message,
                        variant: 'destructive'
                      });
                    }
                  }
                  : undefined
              }
            />
          )
        }
      </div >
    </TooltipProvider>
  );
}
