import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { Calendar, Clock, User, MapPin, Trash2, X, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ReservationDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: {
    id: string;
    room: { id: string; name: string };
    cell: { id: string; label: string | null; type: string; x?: number; y?: number };
    type: string;
    status: string;
    date_start: string;
    date_end: string;
    time_segment: string;
    created_at: string;
    user?: { id: string; username: string; full_name: string }; // Add user info to reservation prop
  } | null;
  isAdmin?: boolean;
  onDelete?: () => void;
}

export default function ReservationDetailsDialog({
  open,
  onOpenChange,
  reservation,
  isAdmin = false,
  onDelete
}: ReservationDetailsDialogProps) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { toast } = useToast();

  if (!reservation) return null;

  const handleDeleteClick = () => {
    setShowDeleteAlert(true);
  };

  const handleConfirmDelete = () => {
    if (onDelete) {
      onDelete();
      setShowDeleteAlert(false);
      onOpenChange(false);
    }
  };

  // Determine user name to display
  const reservedBy = reservation.user?.full_name || 'Unknown User';
  const reservedByUsername = reservation.user?.username ? `@${reservation.user.username}` : '';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[450px] p-0 gap-0 overflow-hidden border-0 shadow-xl rounded-xl">
          {/* Header with Color Strip */}
          <div className={`h-3 w-full ${reservation.status === 'cancelled' ? 'bg-gray-400' : 'bg-blue-500'}`} />

          <div className="px-6 py-4">
            <div className="flex justify-between items-start mb-4">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-xl font-normal text-foreground">
                  {reservation.type === 'fixed_assignment' ? 'Desk Assignment' : 'Desk Reservation'}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {reservation.room.name}
                </p>
              </DialogHeader>
            </div>

            <div className="space-y-4">
              {/* Date & Time */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 bg-blue-50 rounded-md">
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(reservation.date_start), 'EEEE, MMMM d')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reservation.date_start !== reservation.date_end
                      ? `Until ${format(new Date(reservation.date_end), 'MMM d')}`
                      : 'Single day'}
                  </p>
                </div>
              </div>

              {/* Time Segment */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 bg-orange-50 rounded-md">
                  <Clock className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {reservation.time_segment === 'FULL' ? 'Full Day' : reservation.time_segment}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    7:00 AM - 6:00 PM
                  </p>
                </div>
              </div>

              {/* Location/Desk */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 bg-green-50 rounded-md">
                  <MapPin className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {reservation.cell.label || `Desk ${reservation.cell.type}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reservation.room.name}
                  </p>
                </div>
              </div>

              {/* User Info (if admin or viewing other's reservation) */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 bg-purple-50 rounded-md">
                  <User className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {reservedBy}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reservedByUsername}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-muted/30 px-4 py-3 flex justify-end gap-2 border-t">
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteClick}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Delete Reservation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reservation for <strong>{reservedBy}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
