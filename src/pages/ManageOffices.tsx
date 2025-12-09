import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Loader2, MapPin, Calendar, Share2 } from 'lucide-react';
import { Office } from '@/types/office';
import { Switch } from '@/components/ui/switch';

export default function ManageOffices() {
    const [offices, setOffices] = useState<Office[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingOffice, setEditingOffice] = useState<Office | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        name: '',
        location: '',
        is_shared: false
    });

    useEffect(() => {
        loadOffices();
    }, []);

    const callOfficeFunction = async (operation: string, data?: Record<string, unknown>) => {
        const session = authService.getSession();
        if (!session) throw new Error('No session');

        const response = await supabase.functions.invoke('manage-offices', {
            body: { operation, data },
            headers: {
                'x-session-token': session.token
            }
        });

        if (response.error) throw response.error;
        return response.data;
    };

    const loadOffices = async () => {
        setLoading(true);
        try {
            const data = await callOfficeFunction('list');
            setOffices(data || []);
        } catch (error: unknown) {
            let message = 'Unknown error';
            if (error instanceof Error) message = error.message;
            else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
            toast({
                title: 'Error loading offices',
                description: message,
                variant: 'destructive'
            });
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingOffice) {
            // Update office
            try {
                await callOfficeFunction('update', {
                    officeId: editingOffice.id,
                    updates: {
                        name: formData.name,
                        location: formData.location,
                        is_shared: formData.is_shared
                    }
                });
                toast({ title: 'Office updated successfully' });
                setDialogOpen(false);
                loadOffices();
                resetForm();
            } catch (error: unknown) {
                let message = 'Unknown error';
                if (error instanceof Error) message = error.message;
                else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
                toast({
                    title: 'Error updating office',
                    description: message,
                    variant: 'destructive'
                });
            }
        } else {
            // Create new office
            try {
                await callOfficeFunction('create', {
                    name: formData.name,
                    location: formData.location,
                    is_shared: formData.is_shared
                });
                toast({ title: 'Office created successfully' });
                setDialogOpen(false);
                loadOffices();
                resetForm();
            } catch (error: unknown) {
                let message = 'Unknown error';
                if (error instanceof Error) message = error.message;
                else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
                toast({
                    title: 'Error creating office',
                    description: message,
                    variant: 'destructive'
                });
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this office? All bookings will be lost.')) return;

        try {
            await callOfficeFunction('delete', { officeId: id });
            toast({ title: 'Office deleted successfully' });
            loadOffices();
        } catch (error: unknown) {
            let message = 'Unknown error';
            if (error instanceof Error) message = error.message;
            else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
            toast({
                title: 'Error deleting office',
                description: message,
                variant: 'destructive'
            });
        }
    };

    const handleToggleShare = async (office: Office) => {
        try {
            await callOfficeFunction('toggle_share', {
                officeId: office.id,
                is_shared: !office.is_shared
            });
            toast({
                title: office.is_shared ? 'Office hidden from users' : 'Office shared with users'
            });
            loadOffices();
        } catch (error: unknown) {
            let message = 'Unknown error';
            if (error instanceof Error) message = error.message;
            else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
            toast({
                title: 'Error toggling share status',
                description: message,
                variant: 'destructive'
            });
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            location: '',
            is_shared: false
        });
        setEditingOffice(null);
    };

    const openEditDialog = (office: Office) => {
        setEditingOffice(office);
        setFormData({
            name: office.name,
            location: office.location,
            is_shared: office.is_shared
        });
        setDialogOpen(true);
    };

    const openCreateDialog = () => {
        resetForm();
        setDialogOpen(true);
    };

    return (
        <div className="h-full flex flex-col space-y-4 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Manage Offices</h1>
                    <p className="text-muted-foreground text-sm">Create and manage bookable office spaces</p>
                </div>
                {user && user.role === 'admin' && (
                    <Button onClick={openCreateDialog}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Office
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : offices.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No offices yet</h3>
                        <p className="text-muted-foreground text-center mb-4">
                            Create your first office to start managing time-based bookings
                        </p>
                        {user && user.role === 'admin' && (
                            <Button onClick={openCreateDialog}>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Office
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 overflow-y-auto pr-2">
                    {offices.map((office) => (
                        <Card key={office.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MapPin className="h-5 w-5" />
                                    {office.name}
                                </CardTitle>
                                <CardDescription className="flex items-center gap-2">
                                    <span>{office.location}</span>
                                    {office.is_shared && (
                                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                            <Share2 className="h-3 w-3" />
                                            Shared
                                        </span>
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Visible to users</span>
                                        <Switch
                                            checked={office.is_shared}
                                            onCheckedChange={() => handleToggleShare(office)}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => navigate(`/manage-offices/${office.id}/calendar`)}
                                        >
                                            <Calendar className="mr-2 h-4 w-4" />
                                            Manage Schedule
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openEditDialog(office)}
                                            title="Edit Office Details"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(office.id)}
                                            title="Delete Office"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
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
                        <DialogTitle>{editingOffice ? 'Edit Office' : 'Create Office'}</DialogTitle>
                        <DialogDescription>
                            {editingOffice
                                ? 'Update office details'
                                : 'Create a new bookable office space'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Office Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Meeting Room A"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input
                                id="location"
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                placeholder="e.g., 2nd Floor, East Wing"
                                required
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="is_shared">Share with users</Label>
                            <Switch
                                id="is_shared"
                                checked={formData.is_shared}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_shared: checked })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">
                                {editingOffice ? 'Update' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
