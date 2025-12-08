import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Trash2, Loader2, Armchair, Crown, DoorOpen, X, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
      icon: Armchair
    },
    {
      type: 'entrance',
      label: 'Entrance',
      color: 'text-green-600',
      bgColor: 'bg-green-100 hover:bg-green-200 border-green-300',
      icon: DoorOpen
    }
  ];

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


export default function RoomEditor() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<DeskType>('desk');
  const [isRoomAdmin, setIsRoomAdmin] = useState(false);
  const [renamingCell, setRenamingCell] = useState<Cell | null>(null);
  const [customName, setCustomName] = useState('');
  const [cellOperationInProgress, setCellOperationInProgress] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [wallOperationInProgress, setWallOperationInProgress] = useState(false);

  const [isWallMode, setIsWallMode] = useState(false);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeTab, setActiveTab] = useState<'desks' | 'rooms'>('desks');


  const [wallType, setWallType] = useState<'wall' | 'entrance'>('wall');



  useEffect(() => {
    loadRoom();
    loadRooms();
  }, [roomId]);

  const callRoomFunction = async (operation: string, data?: Record<string, unknown>) => {
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

  const loadRoom = async () => {
    if (!roomId) return;

    setLoading(true);

    try {
      const result = await callRoomFunction('get', { roomId });
      setRoom(result.room);
      setCells(result.cells || []);
      setWalls(result.walls || []);

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
        } else {
          toast({
            title: 'Access Denied',
            description: 'Only room admins can edit the layout',
            variant: 'destructive'
          });
          navigate('/rooms');
        }
      }
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error loading room',
        description: message,
        variant: 'destructive'
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

  const getCellAt = (x: number, y: number): Cell | undefined => {
    return cells.find(c => c.x === x && c.y === y);
  };

  const handleCellClick = async (x: number, y: number) => {
    if (cellOperationInProgress) return;
    if (isWallMode) return; // Disable cell selection in wall mode

    const existingCell = getCellAt(x, y);

    if (existingCell) {
      // If clicking an existing cell, select it for editing (e.g. walls)
      // If we are in "rename" mode or similar, we might want to do something else
      // For now, let's just set it as the "renamingCell" effectively selecting it
      // But we want a "selectedCell" state that doesn't necessarily open the dialog immediately
      // However, the current UI uses context menu for rename.
      // Let's use `renamingCell` as the "selected" cell for the sidebar context.
      // Or better, introduce `selectedCell` state.
      setSelectedCell(existingCell);
      return;
    }

    try {
      if (!existingCell) {
        setCellOperationInProgress(true);
        const newCell = await callRoomFunction('create_cell', {
          cell: {
            room_id: roomId!,
            x,
            y,
            type: selectedType
          }
        });
        setCells([...cells, newCell]);
        setSelectedCell(newCell);
      }
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error creating cell',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setCellOperationInProgress(false);
    }
  };

  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, type: DeskType, source: 'palette' | 'grid', cell?: Cell) => {
    e.dataTransfer.setData('type', type);
    e.dataTransfer.setData('source', source);
    if (cell) {
      e.dataTransfer.setData('cellId', cell.id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Allow drop
  };

  const handleDrop = async (e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('type') as DeskType;
    const source = e.dataTransfer.getData('source');
    const cellId = e.dataTransfer.getData('cellId');

    const existingCell = getCellAt(x, y);
    if (existingCell) return; // Cannot drop on existing cell

    if (source === 'palette') {
      // Create new cell
      try {
        setCellOperationInProgress(true);
        const newCell = await callRoomFunction('create_cell', {
          cell: {
            room_id: roomId!,
            x,
            y,
            type
          }
        });
        setCells([...cells, newCell]);
      } catch (error: unknown) {
        let message = 'Unknown error';
        if (error instanceof Error) message = error.message;
        else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
        toast({
          title: 'Error creating cell',
          description: message,
          variant: 'destructive'
        });
      } finally {
        setCellOperationInProgress(false);
      }
    } else if (source === 'grid' && cellId) {
      // Move existing cell
      try {
        setCellOperationInProgress(true);
        // Optimistic update
        const movedCell = cells.find(c => c.id === cellId);
        if (movedCell) {
          const updatedCells = cells.map(c => c.id === cellId ? { ...c, x, y } : c);
          setCells(updatedCells);

          await callRoomFunction('update_cell', {
            cellId,
            updates: { x, y }
          });
        }
      } catch (error: unknown) {
        // Revert on error
        loadRoom();
        let message = 'Unknown error';
        if (error instanceof Error) message = error.message;
        else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
        toast({
          title: 'Error moving cell',
          description: message,
          variant: 'destructive'
        });
      } finally {
        setCellOperationInProgress(false);
      }
    }
  };

  const handleRenameClick = (cell: Cell) => {
    setRenamingCell(cell);
    setCustomName(cell.label || '');
    setIsRenameDialogOpen(true);
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
      setCustomName('');
      toast({ title: 'Desk name updated successfully' });
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error updating desk name',
        description: message,
        variant: 'destructive'
      });
    }
  };

  const handleDeleteCell = async (cell: Cell) => {
    if (!confirm('Are you sure you want to delete this desk?')) return;

    try {
      await callRoomFunction('delete_cell', { cellId: cell.id });
      setCells(cells.filter(c => c.id !== cell.id));
      setCells(cells.filter(c => c.id !== cell.id));
      if (selectedCell?.id === cell.id) setSelectedCell(null);
      toast({ title: 'Desk deleted successfully' });
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error deleting desk',
        description: message,
        variant: 'destructive'
      });
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all cells?')) return;

    try {
      await callRoomFunction('delete_all_cells', { roomId: roomId! });
      setCells([]);
      setWalls([]);
      setWalls([]);
      setSelectedCell(null);
      toast({ title: 'All cells cleared' });
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error clearing cells',
        description: message,
        variant: 'destructive'
      });
    }
  };

  const handleToggleWall = async (start_row: number, start_col: number, end_row: number, end_col: number, orientation: 'horizontal' | 'vertical') => {
    // Prevent concurrent operations
    if (wallOperationInProgress) return;

    // Check if wall exists
    const existingWall = walls.find(w =>
      w.start_row === start_row &&
      w.start_col === start_col &&
      w.end_row === end_row &&
      w.end_col === end_col
    );

    // Generate unique temp ID for this specific wall
    const tempId = `temp-${start_row}-${start_col}-${end_row}-${end_col}-${Date.now()}`;

    // Store previous state for rollback
    const previousWalls = [...walls];

    // Optimistic update logic
    if (existingWall) {
      // If wall exists, check if it's the same type
      if (existingWall.type === wallType) {
        // Same type, delete it
        setWalls(walls.filter(w => w.id !== existingWall.id));
      } else {
        // Different type, update it (optimistically delete + create new local one for now)
        // Ideally we'd map it to a new type, but since we treat ID as immutable usually, let's just swap properly
        setWalls(prev => prev.map(w => w.id === existingWall.id ? { ...w, type: wallType } : w));
      }
    } else {
      // Create new wall
      const tempWall: Wall = {
        id: tempId,
        room_id: roomId!,
        start_row,
        start_col,
        end_row,
        end_col,
        orientation,
        type: wallType
      };
      setWalls([...walls, tempWall]);
    }

    setWallOperationInProgress(true);

    try {
      if (existingWall) {
        if (existingWall.type === wallType) {
          // Delete exactly
          await callRoomFunction('delete_wall', { wallId: existingWall.id });
        } else {
          // Update type essentially means delete and recreate in this simple model if backend doesn't support update_wall
          // Or we can delete old and create new. Let's assume delete then create.
          await callRoomFunction('delete_wall', { wallId: existingWall.id });
          const newWall = await callRoomFunction('create_wall', {
            wall: {
              room_id: roomId!,
              start_row,
              start_col,
              end_row,
              end_col,
              orientation,
              type: wallType
            }
          });
          setWalls(prev => prev.map(w => w.id === existingWall.id ? newWall : w)); // Assuming we updated the local object in place previously
        }
      } else {
        // Create wall
        const newWall = await callRoomFunction('create_wall', {
          wall: {
            room_id: roomId!,
            start_row,
            start_col,
            end_row,
            end_col,
            orientation,
            type: wallType
          }
        });
        // Replace the specific temp wall with real one
        setWalls(prev => prev.map(w => w.id === tempId ? newWall : w));
      }
    } catch (error: unknown) {
      // Revert to previous state instead of reloading entire room
      console.error('Error toggling wall:', error);
      setWalls(previousWalls);

      let message = 'Failed to update wall. Please try again.';
      if (error instanceof Error) message = error.message || message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || message;

      toast({
        title: 'Error updating wall',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setWallOperationInProgress(false);
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
    <div className="h-full flex flex-col space-y-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/rooms')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
            <p className="text-muted-foreground text-sm">
              Grid: {room.grid_width} × {room.grid_height}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isWallMode && (
            <div className="flex items-center bg-gray-100 p-1 rounded-md mr-2">
              <Button
                variant={wallType === 'wall' ? 'secondary' : 'ghost'}
                size="sm"
                className={wallType === 'wall' ? 'shadow-sm' : 'text-gray-500'}
                onClick={() => setWallType('wall')}
              >
                Wall
              </Button>
              <Button
                variant={wallType === 'entrance' ? 'secondary' : 'ghost'}
                size="sm"
                className={wallType === 'entrance' ? 'shadow-sm text-blue-600' : 'text-gray-500'}
                onClick={() => setWallType('entrance')}
              >
                Entrance
              </Button>
            </div>
          )}
          <Button
            variant={isWallMode ? "default" : "outline"}
            onClick={() => {
              setIsWallMode(!isWallMode);
              setSelectedCell(null); // Deselect cell when entering wall mode
            }}
            className={isWallMode ? "bg-blue-600 hover:bg-blue-700" : ""}
          >
            <div className="mr-2 h-4 w-4 border-2 border-current rounded-sm" />
            {isWallMode ? "Exit Wall Mode" : "Edit Walls"}
          </Button>
          <Button variant="outline" onClick={handleClearAll}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 lg:flex-1 lg:overflow-hidden">
        <Card className="p-4 flex flex-col overflow-hidden">
          <div className="mb-4 flex-shrink-0">
            <h3 className="text-sm font-medium mb-2">Drag items to the grid</h3>
            <div className="flex flex-wrap gap-2">
              {DESK_TYPES.map(({ type, label, color, bgColor, icon: Icon }) => (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, type, 'palette')}
                  onClick={() => setSelectedType(type)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing ${selectedType === type
                    ? `${bgColor} border-current shadow-md`
                    : 'bg-background border-border hover:border-muted-foreground'
                    }`}
                >
                  <Icon className={`h-5 w-5 ${selectedType === type ? color : 'text-muted-foreground'}`} />
                  <span className={`font-medium ${selectedType === type ? color : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-2 border-border rounded-lg p-4 lg:flex-1 flex items-start justify-center" style={{ backgroundColor: 'rgba(66, 133, 244, 0.08)' }}>
            <div
              className="inline-block relative"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${room.grid_width}, ${CELL_SIZE}px)`,
                gap: '4px'
              }}
            >
              {/* Render Walls as SVG with Connected Paths and Rounded Corners */}
              <svg
                className="absolute top-0 left-0 pointer-events-none z-10"
                style={{
                  width: room.grid_width * (CELL_SIZE + 4),
                  height: room.grid_height * (CELL_SIZE + 4),
                  overflow: 'visible'
                }}
              >
                {walls.map(wall => {
                  const x = wall.orientation === 'vertical'
                    ? (wall.start_col * (CELL_SIZE + 4)) - 2
                    : (wall.start_col * (CELL_SIZE + 4));
                  const y = wall.orientation === 'horizontal'
                    ? (wall.start_row * (CELL_SIZE + 4)) - 2
                    : (wall.start_row * (CELL_SIZE + 4));
                  const width = wall.orientation === 'vertical' ? 4 : (wall.end_col - wall.start_col) * (CELL_SIZE + 4);
                  const height = wall.orientation === 'horizontal' ? 4 : (wall.end_row - wall.start_row) * (CELL_SIZE + 4);

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

              {/* Wall Hitboxes (Only in Wall Mode) */}
              {isWallMode && Array.from({ length: room.grid_height + 1 }, (_, row) =>
                Array.from({ length: room.grid_width + 1 }, (_, col) => (
                  <>
                    {/* Horizontal Hitbox */}
                    {col < room.grid_width && (
                      <div
                        key={`h-${row}-${col}`}
                        className="absolute z-20 cursor-pointer hover:bg-blue-400/50 transition-colors"
                        style={{
                          left: col * (CELL_SIZE + 4),
                          top: (row * (CELL_SIZE + 4)) - 6,
                          width: CELL_SIZE + 4,
                          height: 12,
                        }}
                        onClick={() => handleToggleWall(row, col, row, col + 1, 'horizontal')}
                      />
                    )}
                    {/* Vertical Hitbox */}
                    {row < room.grid_height && (
                      <div
                        key={`v-${row}-${col}`}
                        className="absolute z-20 cursor-pointer hover:bg-blue-400/50 transition-colors"
                        style={{
                          left: (col * (CELL_SIZE + 4)) - 6,
                          top: row * (CELL_SIZE + 4),
                          width: 12,
                          height: CELL_SIZE + 4,
                        }}
                        onClick={() => handleToggleWall(row, col, row + 1, col, 'vertical')}
                      />
                    )}
                  </>
                ))
              )}

              {Array.from({ length: room.grid_height }, (_, y) =>
                Array.from({ length: room.grid_width }, (_, x) => {
                  const cell = getCellAt(x, y);
                  const deskInfo = DESK_TYPES.find(d => d.type === cell?.type);
                  const Icon = deskInfo?.icon;
                  const isSelected = selectedCell?.x === x && selectedCell?.y === y;

                  const cellContent = (
                    <div
                      className={`
                        border-2 transition-all rounded-md
                        flex items-center justify-center relative
                        ${cell && deskInfo
                          ? `${deskInfo.bgColor} ${deskInfo.color} cursor-grab active:cursor-grabbing`
                          : 'bg-background border-border hover:bg-muted cursor-pointer'
                        }
                        ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
                      `}
                      style={{ width: CELL_SIZE, height: CELL_SIZE }}
                      onClick={() => handleCellClick(x, y)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, x, y)}
                      draggable={!!cell}
                      onDragStart={(e) => cell && handleDragStart(e, cell.type, 'grid', cell)}
                      title={cell ? `${x}, ${y} - ${deskInfo?.label}` : `${x}, ${y} - Empty`}
                    >
                      {cell && Icon && (
                        <Icon className="h-6 w-6" strokeWidth={2.5} />
                      )}
                      {cell?.label && (
                        <div className="absolute bottom-1 right-1 text-xs font-mono bg-background/80 px-1 rounded">
                          {cell.label}
                        </div>
                      )}
                    </div>
                  );

                  return cell ? (
                    <ContextMenu key={`${x}-${y}`}>
                      <ContextMenuTrigger>
                        {cellContent}
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => handleRenameClick(cell)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleDeleteCell(cell)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ) : (
                    <div key={`${x}-${y}`}>{cellContent}</div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        {/* Right Sidebar */}
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
            selectedCell ? (
              <div className="mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Selected Desk</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCell(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="font-medium text-blue-900">{selectedCell.label || `Desk ${selectedCell.x}-${selectedCell.y}`}</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Type: {DESK_TYPES.find(d => d.type === selectedCell.type)?.label}
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleRenameClick(selectedCell)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Rename Desk
                </Button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  All Desks
                  <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100">
                    {cells.filter(c => c.type !== 'entrance').length}
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

                      return (
                        <div
                          key={cell.id}
                          className="group rounded-2xl p-4 transition-all duration-200 cursor-pointer border bg-white border-gray-100 hover:border-blue-200 hover:shadow-md"
                          onClick={() => setSelectedCell(cell)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                                {Icon && <Icon className="h-5 w-5" />}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {cell.label || `Desk ${cell.x}-${cell.y}`}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Click to edit
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                  {cells.filter(c => c.type === 'desk').length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                      <Armchair className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No desks created yet.</p>
                    </div>
                  )}
                </div>
              </>
            )
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
                    onClick={() => navigate(`/rooms/${r.id}/edit`)}
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
      </div>

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
              <Save className="mr-2 h-4 w-4" />
              Save Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
