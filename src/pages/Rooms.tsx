import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Grid3x3, Loader2, Users, Settings } from 'lucide-react';
import RoomAccessDialog from '@/components/RoomAccessDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Room {
  id: string;
  name: string;
  description: string | null;
  grid_width: number;
  grid_height: number;
  created_at: string;
  created_by: string;
}

export default function Rooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [selectedRoomForAccess, setSelectedRoomForAccess] = useState<{ id: string; name: string } | null>(null);
  const [roomAdminMap, setRoomAdminMap] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    grid_width: 10,
    grid_height: 10
  });

  useEffect(() => {
    loadRooms();
  }, []);

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

  const loadRooms = async () => {
    setLoading(true);
    try {
      const data = await callRoomFunction('list');
      setRooms(data || []);

      // Load room access permissions
      if (user && user.role !== 'admin') {
        const { data: accessData } = await supabase
          .from('room_access')
          .select('room_id, role')
          .eq('user_id', user.id);

        const adminMap: Record<string, boolean> = {};
        accessData?.forEach(access => {
          adminMap[access.room_id] = access.role === 'admin';
        });
        setRoomAdminMap(adminMap);
      } else if (user?.role === 'admin') {
        // Admin has admin rights on all rooms
        const adminMap: Record<string, boolean> = {};
        data?.forEach((room: Room) => {
          adminMap[room.id] = true;
        });
        setRoomAdminMap(adminMap);
      }
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error loading rooms',
        description: message,
        variant: 'destructive'
      });
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingRoom) {
      // Update room
      try {
        await callRoomFunction('update', {
          id: editingRoom.id,
          updates: {
            name: formData.name,
            description: formData.description || null,
            grid_width: formData.grid_width,
            grid_height: formData.grid_height
          }
        });
        toast({ title: 'Room updated successfully' });
        setDialogOpen(false);
        loadRooms();
        resetForm();
      } catch (error: unknown) {
        let message = 'Unknown error';
        if (error instanceof Error) message = error.message;
        else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
        toast({
          title: 'Error updating room',
          description: message,
          variant: 'destructive'
        });
      }
    } else {
      // Create new room
      try {
        await callRoomFunction('create', {
          name: formData.name,
          description: formData.description || null,
          grid_width: formData.grid_width,
          grid_height: formData.grid_height
        });
        toast({ title: 'Room created successfully' });
        setDialogOpen(false);
        loadRooms();
        resetForm();
      } catch (error: unknown) {
        let message = 'Unknown error';
        if (error instanceof Error) message = error.message;
        else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
        toast({
          title: 'Error creating room',
          description: message,
          variant: 'destructive'
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;

    try {
      await callRoomFunction('delete', { id });
      toast({ title: 'Room deleted successfully' });
      loadRooms();
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error deleting room',
        description: message,
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      grid_width: 10,
      grid_height: 10
    });
    setEditingRoom(null);
  };

  const openEditDialog = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      description: room.description || '',
      grid_width: room.grid_width,
      grid_height: room.grid_height
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openRoomEditor = (roomId: string) => {
    navigate(`/rooms/${roomId}/edit`);
  };

  const openAccessDialog = (room: Room) => {
    setSelectedRoomForAccess({ id: room.id, name: room.name });
    setAccessDialogOpen(true);
  };

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage Rooms</h1>
          <p className="text-muted-foreground text-sm">Create and share office spaces with users</p>
        </div>
        {user && user.role === 'admin' && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Room
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : rooms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Grid3x3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rooms yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first room to start managing desk bookings
            </p>
            {user && user.role === 'admin' && (
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Create Room
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 overflow-y-auto pr-2">
          {rooms.map((room) => (
            <Card key={room.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 overflow-hidden">
                  <Grid3x3 className="h-5 w-5 flex-shrink-0" />
                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <span className="truncate text-lg cursor-default">{room.name}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{room.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
                {room.description && (
                  <CardDescription>{room.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Grid size: {room.grid_width} × {room.grid_height}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/rooms/${room.id}/view`)}
                    >
                      <Grid3x3 className="mr-2 h-4 w-4" />
                      View & Book
                    </Button>
                    {roomAdminMap[room.id] && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRoomEditor(room.id)}
                          title="Edit Layout"
                        >
                          <Grid3x3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(room)}
                          title="Edit Room Details"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAccessDialog(room)}
                          title="Manage Access"
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(room.id)}
                          title="Delete Room"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Edit Room' : 'Create Room'}</DialogTitle>
            <DialogDescription>
              {editingRoom
                ? 'Update room details'
                : 'Create a new office space'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Room Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main Office"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grid_width">Grid Width</Label>
                <Input
                  id="grid_width"
                  type="number"
                  min="5"
                  max="12"
                  value={formData.grid_width}
                  onChange={(e) => setFormData({ ...formData, grid_width: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grid_height">Grid Height</Label>
                <Input
                  id="grid_height"
                  type="number"
                  min="5"
                  max="8"
                  value={formData.grid_height}
                  onChange={(e) => setFormData({ ...formData, grid_height: parseInt(e.target.value) })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingRoom ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedRoomForAccess && (
        <RoomAccessDialog
          roomId={selectedRoomForAccess.id}
          roomName={selectedRoomForAccess.name}
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
        />
      )}
    </div>
  );
}
