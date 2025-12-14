import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface User {
  id: string;
  username: string;
  full_name: string;
  password: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'user' as 'admin' | 'user',
    is_active: true
  });

  useEffect(() => {
    loadUsers();
  }, []);

  /* Removed callUserFunction - using direct DB access */

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('full_name', { ascending: true }); // Default DB sort

      if (error) throw error;
      setUsers(data || []);
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

  const filteredUsers = users
    .filter(user =>
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      // Update user
      try {
        const { error } = await supabase
          .from('users')
          .update({
            username: formData.username,
            password: formData.password,
            full_name: formData.full_name,
            role: formData.role,
            is_active: formData.is_active
          })
          .eq('id', editingUser.id);

        if (error) throw error;

        toast({ title: 'User updated successfully' });
        setDialogOpen(false);
        loadUsers();
        resetForm();
      } catch (error: unknown) {
        let message = 'Unknown error';
        if (error instanceof Error) message = error.message;
        else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
        toast({
          title: 'Error updating user',
          description: message,
          variant: 'destructive'
        });
      }
    } else {
      // Create new user
      try {
        const { error } = await supabase
          .from('users')
          .insert({
            id: crypto.randomUUID(),
            username: formData.username,
            password: formData.password,
            full_name: formData.full_name,
            role: formData.role,
            is_active: formData.is_active
          });

        if (error) throw error;

        toast({ title: 'User created successfully' });
        setDialogOpen(false);
        loadUsers();
        resetForm();
      } catch (error: unknown) {
        let message = 'Unknown error';
        if (error instanceof Error) message = error.message;
        else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
        toast({
          title: 'Error creating user',
          description: message,
          variant: 'destructive'
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      // Manual cleanup of related records (Belt & Suspenders approach)

      // 1. Try to delete from fixed_assignments (Legacy table)
      try {
        await supabase.from('fixed_assignments').delete().eq('assigned_to', id);
      } catch (e) {
        console.warn('Could not clean fixed_assignments (table might not exist)', e);
      }

      // 2. Delete reservations
      const { error: resError } = await supabase
        .from('reservations')
        .delete()
        .eq('user_id', id);

      if (resError) console.warn('Error cleaning reservations:', resError);

      // 3. Delete room access
      const { error: accessError } = await supabase
        .from('room_access')
        .delete()
        .eq('user_id', id);

      if (accessError) console.warn('Error cleaning room access:', accessError);

      // 4. Delete the user
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'User and all associated data deleted successfully' });
      loadUsers();
    } catch (error: unknown) {
      let message = 'Unknown error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
      toast({
        title: 'Error deleting user',
        description: message,
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      full_name: '',
      role: 'user',
      is_active: true
    });
    setEditingUser(null);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: user.password,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  if (!currentUser || currentUser.role !== 'admin') {
    return <div>Access denied</div>;
  }

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground text-sm">Create and manage user accounts</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex-shrink-0">
          <CardTitle>All Users</CardTitle>
          <CardDescription>Manage user accounts and permissions</CardDescription>
          <div className="pt-4">
            <Input
              placeholder="Search users by name or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" title="Sorted alphabetically by default">
                    Full Name (A-Z)
                  </TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-sm">{user.username}</TableCell>
                    <TableCell>{user.full_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {showPasswords[user.id] ? user.password : '••••••••'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePasswordVisibility(user.id)}
                        >
                          {showPasswords[user.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'destructive'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {user.id !== currentUser.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(user.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update user account details and permissions'
                : 'Create a new user account'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as 'admin' | 'user' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is_active">Active account</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingUser ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
