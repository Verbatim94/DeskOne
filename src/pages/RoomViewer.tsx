import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Armchair, Crown, DoorOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import BookDeskDialog from '@/components/BookDeskDialog';
import ReservationDetailsDialog from '@/components/ReservationDetailsDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO, isWithinInterval } from 'date-fns';


type DeskType = 'desk' | 'entrance';

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
    {
      type: 'entrance',
      label: 'Entrance',
      color: 'text-green-600',
      bgColor: 'bg-green-100 hover:bg-green-200 border-green-300',
      icon: DoorOpen,
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



  useEffect(() => {
    loadRoom();
    loadRooms();

    const channel = supabase
      .channel('room-reservations')
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
          loadReservations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (room) {
      loadReservations();
      loadFixedAssignments();
    }
  }, [selectedDate, room]);

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

      // Check if user is room admin
      const session = authService.getSession();
      if (session?.user.role === 'admin') {
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
      await loadReservations();
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

  const loadReservations = async () => {
    if (!roomId) return;

    try {
      const data = await callReservationFunction('list_room_reservations', {
        roomId,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedReservations = (data || []).map((r: any): Reservation => ({
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
      setReservations(mappedReservations);
    } catch (error: unknown) {
      console.error('Error loading reservations:', error);
    }
  };

  const loadFixedAssignments = async () => {
    if (!roomId) return;

    try {
      const data = await callReservationFunction('list_fixed_assignments', {
        roomId,
      });
      setFixedAssignments(data || []);
      setFixedAssignments(data || []);
    } catch (error: unknown) {
      console.error('Error loading fixed assignments:', error);
    }
  };

  const getDeskStatus = (cellId: string): { status: DeskStatus; reservation?: Reservation; assignedTo?: string } => {
    const today = new Date(selectedDate);
    today.setHours(0, 0, 0, 0);

    // Check for fixed assignments first
    const activeAssignment = fixedAssignments.find((a) => {
      if (a.cell_id !== cellId) return false;

      const startDate = parseISO(a.date_start);
      const endDate = parseISO(a.date_end);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      return isWithinInterval(today, { start: startDate, end: endDate });
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

      const startDate = parseISO(r.date_start);
      const endDate = parseISO(r.date_end);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      return isWithinInterval(today, { start: startDate, end: endDate });
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
    if (cell.type !== 'entrance') {
      const { status, reservation, assignedTo } = getDeskStatus(cell.id);

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
      if (status === 'reserved' && user?.role !== 'admin') {
        toast({
          title: 'Desk unavailable',
          description: `This desk is ${assignedTo ? `assigned to ${assignedTo}` : `reserved by ${reservation?.user.full_name}`}`,
          variant: 'destructive',
        });
        return;
      }

      setSelectedCell(cell);
      setBookingDialogOpen(true);
    }
  };

  const handleDeskListClick = (cell: Cell) => {
    const { status } = getDeskStatus(cell.id);
    if (status === 'available' || user?.role === 'admin') {
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

  return (
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
            <h1 className="text-lg font-semibold text-gray-900">{room.name}</h1>
            <p className="text-xs text-gray-500">
              {format(selectedDate, 'MMMM d, yyyy')}
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 lg:flex-1 lg:overflow-hidden">
        {/* Main Content: Grid */}
        <div className="flex flex-col space-y-3 lg:overflow-hidden">
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
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 lg:flex-1 flex items-start justify-center">
            <div
              className="inline-block relative"
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
                {walls.map(wall => {
                  const x = wall.orientation === 'vertical'
                    ? (wall.start_col * (CELL_SIZE + 8)) - 2
                    : (wall.start_col * (CELL_SIZE + 8));
                  const y = wall.orientation === 'horizontal'
                    ? (wall.start_row * (CELL_SIZE + 8)) - 2
                    : (wall.start_row * (CELL_SIZE + 8));
                  const width = wall.orientation === 'vertical' ? 4 : (wall.end_col - wall.start_col) * (CELL_SIZE + 8);
                  const height = wall.orientation === 'horizontal' ? 4 : (wall.end_row - wall.start_row) * (CELL_SIZE + 8);

                  if (wall.type === 'entrance') {
                    // Custom Entrance Drawing
                    // Make it thicker and different color, maybe with "Entrance" label
                    // We need to support rotation for the label based on orientation
                    const midX = x + width / 2;
                    const midY = y + height / 2;

                    return (
                      <g key={wall.id}>
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill="#93c5fd" // Light blue for entrance
                          rx="2"
                          ry="2"
                        />
                        {/* Text Label */}
                        <text
                          x={midX}
                          y={midY}
                          fill="#1e3a8a"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          transform={`rotate(${wall.orientation === 'horizontal' ? 0 : -90}, ${midX}, ${midY})`}
                          style={{ pointerEvents: 'none', userSelect: 'none', letterSpacing: '1px' }}
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
                  const isBookable = cell && cell.type !== 'entrance';
                  const { status, reservation, assignedTo } = cell
                    ? getDeskStatus(cell.id)
                    : ({ status: 'available' as DeskStatus } as { status: DeskStatus; reservation?: Reservation; assignedTo?: string });

                  if (cell) {

                    // Custom Google-like styling
                    let bgClass = 'bg-white border-2 border-gray-200';
                    let iconColor = 'text-gray-400';

                    if (status === 'available') {
                      bgClass = 'bg-blue-50 border-2 border-blue-100 hover:border-blue-300 hover:shadow-md';
                      iconColor = 'text-blue-500';
                    } else if (status === 'reserved') {
                      bgClass = 'bg-gray-100 border-2 border-transparent opacity-60';
                      iconColor = 'text-gray-400';
                    } else if (status === 'my-reservation') {
                      bgClass = 'bg-purple-50 border-2 border-purple-200 shadow-sm';
                      iconColor = 'text-purple-500';
                    }

                    if (cell.type === 'entrance') {
                      bgClass = 'bg-green-50 border-2 border-green-100';
                      iconColor = 'text-green-600';
                    }

                    return (
                      <div
                        key={`${x}-${y}`}
                        className={`
                          relative rounded-2xl transition-all duration-300 ease-out
                          flex items-center justify-center
                          ${bgClass}
                          ${isBookable && status !== 'reserved' ? 'cursor-pointer hover:-translate-y-1' : ''}
                        `}
                        style={{ width: CELL_SIZE, height: CELL_SIZE }}
                        onClick={() => cell && isBookable && handleCellClick(cell)}
                        title={cell.label || 'Desk'}
                      >
                        {cell && Icon && (
                          <Icon className={`h-6 w-6 ${iconColor} transition-colors`} strokeWidth={2} />
                        )}
                        {/* Status Dot */}
                        {isBookable && (
                          <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${status === 'available' ? 'bg-blue-400' :
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
              <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2 flex-shrink-0">
                Available Desks
                <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100">
                  {cells.filter(c => getDeskStatus(c.id).status === 'available' && c.type !== 'entrance').length}
                </Badge>
              </h3>

              <div className="space-y-3 lg:overflow-y-auto lg:pr-2 custom-scrollbar lg:flex-1">
                {cells
                  .filter((cell) => cell.type === 'desk')
                  .sort((a, b) => {
                    const aLabel = a.label || `${a.x}-${a.y}`;
                    const bLabel = b.label || `${b.x}-${b.y}`;
                    return aLabel.localeCompare(bLabel);
                  })
                  .map((cell) => {
                    const deskInfo = DESK_TYPES.find((d) => d.type === cell.type);
                    const Icon = deskInfo?.icon;
                    const { status, reservation, assignedTo } = getDeskStatus(cell.id);
                    const isAvailable = status === 'available';
                    const isMyReservation = status === 'my-reservation';

                    if (!isAvailable && !isMyReservation && !isRoomAdmin) return null; // Hide reserved desks for cleaner look

                    return (
                      <div
                        key={cell.id}
                        className={`
                        group rounded-2xl p-4 transition-all duration-200 cursor-pointer border
                        ${isAvailable
                            ? 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                            : isMyReservation
                              ? 'bg-purple-50 border-purple-100'
                              : 'bg-gray-50 border-transparent opacity-70'
                          }
                      `}
                        onClick={() => handleDeskListClick(cell)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`
                            p-3 rounded-xl 
                            ${isAvailable ? 'bg-blue-50 text-blue-600' : isMyReservation ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-500'}
                          `}>
                              {Icon && <Icon className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">
                                {cell.label || `Desk ${cell.x}-${cell.y}`}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {isAvailable ? 'Available all day' : isMyReservation ? 'Reserved by you' : 'Reserved'}
                              </p>
                            </div>
                          </div>

                          {(isAvailable || user?.role === 'admin') && (
                            <Button
                              size="sm"
                              className={`
                              rounded-full px-4 opacity-0 group-hover:opacity-100 transition-all
                              ${isAvailable ? 'bg-blue-600 hover:bg-blue-700' : ''}
                            `}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeskListClick(cell);
                              }}
                            >
                              Book
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {cells.filter(c => getDeskStatus(c.id).status === 'available').length === 0 && (
                  <div className="text-center py-10 text-gray-400">
                    <Armchair className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>No desks available for this date.</p>
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
                      <div className="flex items-center gap-4">
                        <div className={`
                          p-3 rounded-xl 
                          ${r.id === roomId ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}
                        `}>
                          <Armchair className="h-5 w-5" />
                        </div>
                        <div>
                          <p className={`font-semibold ${r.id === roomId ? 'text-blue-900' : 'text-gray-900'}`}>
                            {r.name}
                          </p>
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
            loadReservations();
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
                      await callReservationFunction('delete_fixed_assignment', {
                        assignmentId: selectedReservation.id
                      });
                      toast({
                        title: 'Assignment removed',
                        description: 'Fixed assignment deleted successfully'
                      });
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
                    loadReservations();
                    loadFixedAssignments();
                    loadFixedAssignments();
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
  );
}
