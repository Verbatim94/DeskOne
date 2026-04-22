import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Loader2, Calendar, User, Clock, Filter, X } from 'lucide-react';
import { format, isAfter, isBefore, startOfDay } from 'date-fns';
import { getEdgeErrorMessage } from '@/lib/edge-functions';
import { approveReservation, listPendingApprovals, rejectReservation } from '@/features/reservations/api';
import type { ReservationRecord } from '@/features/reservations/types';

export default function PendingApprovals() {
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  // Filter and sorting state
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortBy, setSortBy] = useState<'requested' | 'start_date' | 'user'>('requested');

  useEffect(() => {
    loadPendingReservations();
  }, []);

  const loadPendingReservations = async () => {
    setLoading(true);
    try {
      const data = await listPendingApprovals();
      setReservations(data);
    } catch (error: unknown) {
      toast({
        title: 'Error loading pending reservations',
        description: getEdgeErrorMessage(error),
        variant: 'destructive'
      });
    }
    setLoading(false);
  };

  const handleApprove = async (reservationId: string) => {
    try {
      await approveReservation(reservationId);
      toast({ title: 'Reservation approved' });
      loadPendingReservations();
    } catch (error: unknown) {
      toast({
        title: 'Error approving reservation',
        description: getEdgeErrorMessage(error),
        variant: 'destructive'
      });
    }
  };

  const handleReject = async (reservationId: string) => {
    if (!confirm('Are you sure you want to reject this reservation?')) return;

    try {
      await rejectReservation(reservationId);
      toast({ title: 'Reservation rejected' });
      loadPendingReservations();
    } catch (error: unknown) {
      toast({
        title: 'Error rejecting reservation',
        description: getEdgeErrorMessage(error),
        variant: 'destructive'
      });
    }
  };

  // Get unique rooms for filter
  const rooms = useMemo(() => {
    const uniqueRooms = new Map<string, string>();
    reservations.forEach(r => {
      if (!uniqueRooms.has(r.room.id)) {
        uniqueRooms.set(r.room.id, r.room.name);
      }
    });
    return Array.from(uniqueRooms, ([id, name]) => ({ id, name }));
  }, [reservations]);

  // Apply filters and sorting
  const filteredAndSortedReservations = useMemo(() => {
    let filtered = [...reservations];

    // Filter by room
    if (selectedRoom !== 'all') {
      filtered = filtered.filter(r => r.room.id === selectedRoom);
    }

    // Filter by date range
    if (dateFrom) {
      const fromDate = startOfDay(new Date(dateFrom));
      filtered = filtered.filter(r => !isBefore(new Date(r.date_start), fromDate));
    }
    if (dateTo) {
      const toDate = startOfDay(new Date(dateTo));
      filtered = filtered.filter(r => !isAfter(new Date(r.date_start), toDate));
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'requested':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'start_date':
          return new Date(a.date_start).getTime() - new Date(b.date_start).getTime();
        case 'user':
          return a.user.full_name.localeCompare(b.user.full_name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [reservations, selectedRoom, dateFrom, dateTo, sortBy]);

  const clearFilters = () => {
    setSelectedRoom('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('requested');
  };

  const hasActiveFilters = selectedRoom !== 'all' || dateFrom || dateTo || sortBy !== 'requested';

  // Check if user has permission to view this page
  if (!user || user.role !== 'admin') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <XCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-muted-foreground text-center">
            Only room administrators can view pending approvals
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pending Approvals</h1>
          <p className="text-muted-foreground">Review and approve desk reservations</p>
        </div>
      </div>

      {/* Filters Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              <CardTitle>Filters & Sorting</CardTitle>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                <SelectTrigger>
                  <SelectValue placeholder="All rooms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rooms</SelectItem>
                  {rooms.map(room => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Start Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Sort By</Label>
              <Select value={sortBy} onValueChange={(value: 'requested' | 'start_date' | 'user') => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requested">Date Requested</SelectItem>
                  <SelectItem value="start_date">Start Date</SelectItem>
                  <SelectItem value="user">User Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredAndSortedReservations.length} of {reservations.length} pending reservations
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : reservations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
            <p className="text-muted-foreground text-center">
              There are no pending reservations to review
            </p>
          </CardContent>
        </Card>
      ) : filteredAndSortedReservations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Filter className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No matching reservations</h3>
            <p className="text-muted-foreground text-center mb-4">
              Try adjusting your filters to see more results
            </p>
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAndSortedReservations.map((reservation) => (
            <Card key={reservation.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{reservation.room.name}</CardTitle>
                    <CardDescription>
                      {reservation.cell.label || `Desk ${reservation.cell.type}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(reservation.id)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(reservation.id)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{reservation.user.full_name} (@{reservation.user.username})</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {format(new Date(reservation.date_start), 'PPP')} - {format(new Date(reservation.date_end), 'PPP')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      {reservation.type.replace('_', ' ')} • {reservation.time_segment}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-2">
                    Requested: {format(new Date(reservation.created_at), 'PPP')}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
