import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Armchair, Crown, DoorOpen, ChevronLeft, ChevronRight, Plus, Trash2, Edit } from 'lucide-react';
import BookDeskDialog from '@/components/BookDeskDialog';
import ReservationDetailsDialog from '@/components/ReservationDetailsDialog';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DeskType = 'desk' | 'premium_desk' | 'entrance';

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
      type: 'premium_desk',
      label: 'Premium Desk',
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 hover:bg-amber-200 border-amber-300',
      icon: Crown,
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
  const [fixedAssignments, setFixedAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [reservationDetailsOpen, setReservationDetailsOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isRoomAdmin, setIsRoomAdmin] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPosition, setCreateMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingCell, setPendingCell] = useState<{ x: number; y: number } | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [deleteMenuPosition, setDeleteMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [cellToDelete, setCellToDelete] = useState<Cell | null>(null);
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);
  const [renamingCell, setRenamingCell] = useState<Cell | null>(null);
  const [customName, setCustomName] = useState('');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuCell, setContextMenuCell] = useState<Cell | null>(null);

  useEffect(() => {
    loadRoom();

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

  const callRoomFunction = async (operation: string, data?: any) => {
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

  const loadRoom = async () => {
    if (!roomId) return;

    setLoading(true);

    try {
      const result = await callRoomFunction('get', { roomId });
      setRoom(result.room);
      setCells(result.cells || []);

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
    } catch (error: any) {
      toast({
        title: 'Error loading room',
        description: error.message,
        variant: 'destructive',
      });
      navigate('/rooms');
    }

    setLoading(false);
  };

  const loadReservations = async () => {
    if (!roomId) return;

    try {
      const data = await callReservationFunction('list_room_reservations', {
        roomId,
      });
      const mappedReservations = (data || []).map((r: any) => ({
        ...r,
        user: r.users,
        cell: r.room_cells,
      }));
      setReservations(mappedReservations);
    } catch (error: any) {
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
    } catch (error: any) {
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
      return {
        status: isMyAssignment ? 'my-reservation' : 'reserved',
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
    setHoveredCellId(cell.id);
    setTimeout(() => setHoveredCellId(null), 2000);

    const { status } = getDeskStatus(cell.id);
    if (status === 'available' || user?.role === 'admin') {
      setSelectedCell(cell);
      setBookingDialogOpen(true);
    }
  };

  const handleCellRightClick = (cell: Cell, event: React.MouseEvent) => {
    if (!isRoomAdmin) return;

    event.preventDefault();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setContextMenuCell(cell);
    setContextMenuOpen(true);
  };

  const handleRenameClick = () => {
    if (!contextMenuCell) return;
    setRenamingCell(contextMenuCell);
    setCustomName(contextMenuCell.label || '');
    setIsRenameDialogOpen(true);
    setContextMenuOpen(false);
    setContextMenuCell(null);
    setContextMenuPosition(null);
  };

  const handleSaveCustomName = async () => {
    if (!renamingCell) return;

    try {
      const updatedCell = await callRoomFunction('update_cell', {
        cellId: renamingCell.id,
        updates: { label: customName || null }
      });
      setCells(cells.map(c =>
        c.id === renamingCell.id ? updatedCell : c
      ));
      setIsRenameDialogOpen(false);
      setRenamingCell(null);
      setCustomName('');
      toast({ title: 'Desk name updated successfully' });
    } catch (error: any) {
      toast({
        title: 'Error updating desk name',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleDeleteFromContextMenu = () => {
    if (!contextMenuCell) return;
    setCellToDelete(contextMenuCell);
    setDeleteMenuOpen(true);
    setContextMenuOpen(false);
    setContextMenuCell(null);
    setContextMenuPosition(null);
  };

  const handleDeleteCell = async () => {
    if (!cellToDelete) return;

    try {
      const session = authService.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('manage-rooms', {
        body: {
          operation: 'delete_cell',
          data: {
            cellId: cellToDelete.id
          }
        },
        headers: {
          'x-session-token': session.token
        }
      });

      if (response.error) throw response.error;

      setCells(cells.filter(c => c.id !== cellToDelete.id));

      toast({
        title: 'Desk deleted',
        description: 'Desk removed successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error deleting desk',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setDeleteMenuOpen(false);
      setCellToDelete(null);
      setDeleteMenuPosition(null);
    }
  };

  const handleEmptyCellClick = (x: number, y: number, event: React.MouseEvent) => {
    if (!isRoomAdmin) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setCreateMenuPosition({ x: rect.left, y: rect.bottom + 5 });
    setPendingCell({ x, y });
    setCreateMenuOpen(true);
  };

  const handleCreateCell = async (type: DeskType) => {
    if (!pendingCell || !roomId) return;

    try {
      const session = authService.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('manage-rooms', {
        body: {
          operation: 'create_cell',
          data: {
            cell: {
              room_id: roomId,
              x: pendingCell.x,
              y: pendingCell.y,
              type
            }
          }
        },
        headers: {
          'x-session-token': session.token
        }
      });

      if (response.error) throw response.error;

      const newCell = response.data;
      setCells([...cells, newCell]);

      toast({
        title: 'Desk created',
        description: `${type === 'desk' ? 'Standard desk' : type === 'premium_desk' ? 'Premium desk' : 'Entrance'} created successfully`
      });
    } catch (error: any) {
      toast({
        title: 'Error creating desk',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setCreateMenuOpen(false);
      setPendingCell(null);
      setCreateMenuPosition(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!room) return null;

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/rooms')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
          <p className="text-sm text-muted-foreground">
            {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>
      </div>

      <Card className="p-6">
        {/* Compact Date Navigation */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedDate <= new Date(new Date().setHours(0, 0, 0, 0))}
              onClick={() => {
                const prevDay = new Date(selectedDate);
                prevDay.setDate(prevDay.getDate() - 1);
                // Only allow moving to previous day if it's not before today
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (prevDay >= today) {
                  setSelectedDate(prevDay);
                }
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[180px] text-center">
              <p className="text-sm font-medium">{format(selectedDate, 'EEEE, MMM d')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nextDay = new Date(selectedDate);
                nextDay.setDate(nextDay.getDate() + 1);
                setSelectedDate(nextDay);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant={selectedDate.toDateString() === new Date().toDateString() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8">
          {/* Left Section: Legend + Room Grid */}
          <div className="space-y-3">
            {/* Minimalist Legend */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                <span className="text-muted-foreground">Available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                <span className="text-muted-foreground">Reserved</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
                <span className="text-muted-foreground">Your Reservation</span>
              </div>
            </div>

            {/* Room Grid */}
            <div className="border-2 border-border rounded-lg p-4 bg-muted/30 overflow-auto">
              <div
                className="inline-block"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${room.grid_width}, ${CELL_SIZE}px)`,
                  gap: '3px',
                }}
              >
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
                      const isHovered = hoveredCellId === cell.id;
                      return (
                        <div
                          key={`${x}-${y}`}
                          className={`
                          border-2 transition-all rounded-md relative
                          flex items-center justify-center
                          ${cell && isBookable
                              ? getDeskBackgroundColor(status, deskInfo?.bgColor || '')
                              : cell && deskInfo
                                ? `${deskInfo.bgColor} ${deskInfo.color}`
                                : 'bg-background border-border'
                            }
                          ${isBookable && status !== 'reserved' ? 'cursor-pointer hover:scale-105 hover:brightness-110' : ''}
                          ${isHovered ? 'ring-4 ring-primary scale-110' : ''}
                        `}
                          style={{ width: CELL_SIZE, height: CELL_SIZE }}
                          onClick={() => cell && isBookable && handleCellClick(cell)}
                          onContextMenu={(e) => isRoomAdmin && handleCellRightClick(cell, e)}
                          title={
                            cell
                              ? `${deskInfo?.label || 'Desk'} - ${status === 'reserved'
                                ? assignedTo
                                  ? `Assigned to ${assignedTo}`
                                  : `Reserved by ${reservation?.user.full_name}`
                                : status === 'my-reservation'
                                  ? assignedTo
                                    ? 'Your assigned desk'
                                    : 'Your reservation'
                                  : 'Available (Click to book)'
                              }${isRoomAdmin ? ' | Right-click for options' : ''}`
                              : `${x}, ${y} - Empty`
                          }
                        >
                          {cell && Icon && (
                            <Icon className={`h-5 w-5 ${isBookable ? 'text-white' : ''}`} strokeWidth={2.5} />
                          )}
                        </div>
                      );
                    } else {
                      // Empty cell - allow admin to create desk
                      return (
                        <div
                          key={`${x}-${y}`}
                          className={`border-2 border-border rounded-md relative flex items-center justify-center group ${isRoomAdmin
                            ? 'bg-background/50 hover:bg-primary/10 cursor-pointer transition-colors'
                            : 'bg-background/50'
                            }`}
                          style={{ width: CELL_SIZE, height: CELL_SIZE }}
                          onClick={(e) => isRoomAdmin && handleEmptyCellClick(x, y, e)}
                          title={isRoomAdmin ? 'Click to add desk' : ''}
                        >
                          {isRoomAdmin && (
                            <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      );
                    }
                  }),
                )}
              </div>
            </div>
          </div>

          {/* Desk List */}
          <div className="space-y-3 overflow-y-auto max-h-[600px] bg-card p-4 rounded-lg border"
          >
            <h3 className="text-sm font-medium sticky top-0 bg-background pb-2">Available Desks</h3>
            {cells
              .filter((cell) => cell.type === 'desk' || cell.type === 'premium_desk')
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

                return (
                  <div
                    key={cell.id}
                    className={`
                      rounded-lg p-4 border-2 transition-all cursor-pointer
                      ${isAvailable
                        ? 'bg-card hover:bg-accent border-border'
                        : isMyReservation
                          ? 'bg-purple-50 border-purple-200'
                          : 'bg-muted border-muted-foreground/20'
                      }
                    `}
                    onMouseEnter={() => setHoveredCellId(cell.id)}
                    onMouseLeave={() => setHoveredCellId(null)}
                    onClick={() => handleDeskListClick(cell)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {Icon && (
                          <div className={`p-2 rounded-md ${deskInfo?.bgColor}`}>
                            <Icon className={`h-5 w-5 ${deskInfo?.color}`} />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold">
                            {cell.label || `Desk ${cell.x}-${cell.y}`}
                          </p>
                          <div className="flex items-center gap-2 text-sm">
                            <div className={`h-2 w-2 rounded-full ${isAvailable ? 'bg-blue-500' : isMyReservation ? 'bg-purple-500' : 'bg-red-500'
                              }`} />
                            <span className="text-muted-foreground">
                              {isAvailable
                                ? '7:00 - 18:00'
                                : isMyReservation
                                  ? 'Your reservation'
                                  : assignedTo
                                    ? `Assigned to ${assignedTo}`
                                    : `Reserved by ${reservation?.user.full_name}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      {(isAvailable || user?.role === 'admin') && (
                        <Button size="sm" onClick={() => handleDeskListClick(cell)}>
                          Book spot
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </Card >

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
              const optimisticReservation: Reservation = {
                ...newReservation,
                user: {
                  id: user.id,
                  username: user.username,
                  full_name: user.full_name
                }
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
            reservation={selectedReservation}
            isAdmin={isRoomAdmin}
            onDelete={
              // Show delete button if user is admin OR if it's their own reservation
              isRoomAdmin || (user && selectedReservation.user_id === user.id)
                ? async () => {
                  try {
                    // Check if it's a fixed assignment or regular reservation
                    if (selectedReservation.type === 'fixed_assignment') {
                      await callReservationFunction('delete_fixed_assignment', {
                        assignmentId: selectedReservation.id
                      });
                      toast({
                        title: 'Assegnazione eliminata',
                        description: 'L\'assegnazione fissa è stata eliminata con successo'
                      });
                    } else {
                      await callReservationFunction('cancel', {
                        reservationId: selectedReservation.id
                      });
                      toast({
                        title: 'Prenotazione eliminata',
                        description: 'La prenotazione è stata cancellata con successo'
                      });
                    }
                    setReservationDetailsOpen(false);
                    setSelectedReservation(null);
                    loadReservations();
                    loadFixedAssignments();
                  } catch (error: any) {
                    toast({
                      title: 'Errore',
                      description: error.message,
                      variant: 'destructive'
                    });
                  }
                }
                : undefined
            }
          />
        )
      }

      {/* Create Desk Menu */}
      {
        createMenuOpen && createMenuPosition && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setCreateMenuOpen(false);
                setPendingCell(null);
                setCreateMenuPosition(null);
              }}
            />
            <div
              className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-2 space-y-1 min-w-[180px]"
              style={{
                left: `${createMenuPosition.x}px`,
                top: `${createMenuPosition.y}px`
              }}
            >
              <button
                onClick={() => handleCreateCell('desk')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-accent text-left transition-colors"
              >
                <Armchair className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Standard Desk</span>
              </button>
              <button
                onClick={() => handleCreateCell('premium_desk')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-accent text-left transition-colors"
              >
                <Crown className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium">Premium Desk</span>
              </button>
              <button
                onClick={() => handleCreateCell('entrance')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-accent text-left transition-colors"
              >
                <DoorOpen className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Entrance</span>
              </button>
            </div>
          </>
        )
      }

      {/* Context Menu */}
      {
        contextMenuOpen && contextMenuPosition && contextMenuCell && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setContextMenuOpen(false);
                setContextMenuCell(null);
                setContextMenuPosition(null);
              }}
            />
            <div
              className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[160px]"
              style={{
                left: `${contextMenuPosition.x}px`,
                top: `${contextMenuPosition.y}px`
              }}
            >
              <button
                onClick={handleRenameClick}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-accent text-left transition-colors"
              >
                <Edit className="h-4 w-4" />
                <span className="text-sm font-medium">Rename</span>
              </button>
              <button
                onClick={handleDeleteFromContextMenu}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-destructive hover:text-destructive-foreground text-left transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-sm font-medium">Delete Desk</span>
              </button>
            </div>
          </>
        )
      }

      {/* Delete Confirmation Menu */}
      {
        deleteMenuOpen && cellToDelete && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setDeleteMenuOpen(false);
                setCellToDelete(null);
              }}
            />
            <Dialog open={deleteMenuOpen} onOpenChange={setDeleteMenuOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Desk</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this desk? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteMenuOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDeleteCell}>
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )
      }

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Desk</DialogTitle>
            <DialogDescription>
              Give this desk a friendly, memorable name
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {renamingCell && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">System ID</Label>
                <div className="px-3 py-2 bg-muted rounded-md font-mono text-sm">
                  {renamingCell.id.slice(0, 8)}... at ({renamingCell.x}, {renamingCell.y})
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rename-input">Custom Name</Label>
              <Input
                id="rename-input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., Alfonzina, Quiet Zone 1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveCustomName();
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCustomName}>
              Save Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
