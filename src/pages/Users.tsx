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

  const callUserFunction = async (operation: string, data?: any) => {
    const session = authService.getSession();
    if (!session) throw new Error('No session');

    const response = await supabase.functions.invoke('manage-users', {
      body: { operation, data },
      headers: {
        'x-session-token': session.token
      }
    });

    if (response.error) throw response.error;
    return response.data;
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await callUserFunction('list');
      setUsers(data || []);
    } catch (error: any) {
      toast({
        title: 'Error loading users',
        description: error.message,
        variant: 'destructive'
      });
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      // Update user
      try {
        await callUserFunction('update', {
          id: editingUser.id,
          updates: {
            username: formData.username,
            password: formData.password,
            full_name: formData.full_name,
            role: formData.role,
            is_active: formData.is_active
          }
        });
        toast({ title: 'User updated successfully' });
        setDialogOpen(false);
        loadUsers();
        resetForm();
      } catch (error: any) {
        toast({
          title: 'Error updating user',
          description: error.message,
          variant: 'destructive'
        });
      }
    } else {
      // Create new user
      try {
        await callUserFunction('create', {
          username: formData.username,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
          is_active: formData.is_active
        });
        toast({ title: 'User created successfully' });
        setDialogOpen(false);
        loadUsers();
        resetForm();
      } catch (error: any) {
        toast({
          title: 'Error creating user',
          description: error.message,
          variant: 'destructive'
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await callUserFunction('delete', { id });
      toast({ title: 'User deleted successfully' });
      loadUsers();
    } catch (error: any) {
      toast({
        title: 'Error deleting user',
        description: error.message,
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Create and manage user accounts</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>Manage user accounts and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
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
                onValueChange={(value: any) => setFormData({ ...formData, role: value })}
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
