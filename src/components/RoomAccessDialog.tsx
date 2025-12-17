import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, UserPlus, Loader2, Shield, User } from 'lucide-react';

interface RoomUser {
  id: string;
  role: 'admin' | 'member';
  user_id: string;
  users: {
    id: string;
    username: string;
    full_name: string;
  };
}

interface AvailableUser {
  id: string;
  username: string;
  full_name: string;
}

interface RoomAccessDialogProps {
  roomId: string;
  roomName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RoomAccessDialog({ roomId, roomName, open, onOpenChange }: RoomAccessDialogProps) {
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'member'>('member');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadRoomUsers();
      loadAvailableUsers();
    }
  }, [open, roomId]);

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

  const loadRoomUsers = async () => {
    setLoading(true);
    try {
      const data = await callRoomFunction('list_room_users', { roomId });
      if (data) {
        data.sort((a: RoomUser, b: RoomUser) =>
          a.users.full_name.localeCompare(b.users.full_name)
        );
      }
      setRoomUsers(data || []);
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error loading users',
        description: message,
        variant: 'destructive'
      });
    }
    setLoading(false);
  };

  const loadAvailableUsers = async () => {
    try {
      const data = await callRoomFunction('list_available_users', { roomId });
      if (data) {
        data.sort((a: AvailableUser, b: AvailableUser) =>
          a.full_name.localeCompare(b.full_name)
        );
      }
      setAvailableUsers(data || []);
    } catch (error: unknown) {
      console.error('Error loading available users:', error);
    }
  };

  const handleAddUser = async () => {
    if (!selectedUserId) {
      toast({
        title: 'No user selected',
        description: 'Please select a user to add',
        variant: 'destructive'
      });
      return;
    }

    setAdding(true);
    try {
      await callRoomFunction('add_room_user', {
        roomId,
        userId: selectedUserId,
        role: selectedRole
      });

      toast({ title: 'User added successfully' });
      setSelectedUserId('');
      setSelectedRole('member');
      loadRoomUsers();
      loadAvailableUsers();
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error adding user',
        description: message,
        variant: 'destructive'
      });
    }
    setAdding(false);
  };

  const handleRemoveUser = async (accessId: string, userName: string) => {
    if (!confirm(`Remove ${userName} from this room?`)) return;

    try {
      await callRoomFunction('remove_room_user', {
        roomId,
        accessId
      });

      toast({ title: 'User removed successfully' });
      loadRoomUsers();
      loadAvailableUsers();
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error removing user',
        description: message,
        variant: 'destructive'
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Access - {roomName}</DialogTitle>
          <DialogDescription>
            Add or remove users who can access this room
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add User Section */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add User
            </h3>
            <div className="flex gap-3">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No available users
                    </div>
                  ) : (
                    availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name} (@{user.username})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Select value={selectedRole} onValueChange={(v: 'admin' | 'member') => setSelectedRole(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={handleAddUser} disabled={adding || !selectedUserId}>
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Users List */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Users with Access ({roomUsers.length})</h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : roomUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No users have access yet
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {roomUsers.map((roomUser) => (
                  <div
                    key={roomUser.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {roomUser.role === 'admin' ? (
                          <Shield className="h-5 w-5 text-primary" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{roomUser.users.full_name}</div>
                        <div className="text-sm text-muted-foreground">@{roomUser.users.username}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={roomUser.role === 'admin' ? 'default' : 'secondary'}>
                        {roomUser.role}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveUser(roomUser.id, roomUser.users.full_name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
