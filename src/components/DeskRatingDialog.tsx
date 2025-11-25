import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';

interface DeskRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: {
    id: string;
    room_id: string;
    cell_id: string;
    cell: { label: string | null; type: string };
    room: { name: string };
  } | null;
  onRatingSubmitted?: () => void;
}

export default function DeskRatingDialog({
  open,
  onOpenChange,
  reservation,
  onRatingSubmitted
}: DeskRatingDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!reservation || rating === 0) {
      toast({
        title: 'Rating required',
        description: 'Please select a star rating',
        variant: 'destructive'
      });
      return;
    }

    const session = authService.getSession();
    if (!session) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to submit a rating',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);

    try {
      // Get the current user ID from session
      const userId = session.user.id;

      // Insert the rating
      const { error } = await supabase
        .from('ratings')
        .insert({
          stars: rating,
          comment: comment.trim() || null,
          room_id: reservation.room_id,
          cell_id: reservation.cell_id,
          from_user_id: userId,
          to_user_id: userId, // Self-rating for desk experience
          reservation_id: reservation.id
        });

      if (error) throw error;

      toast({
        title: 'Rating submitted',
        description: 'Thank you for your feedback!'
      });

      // Reset form
      setRating(0);
      setComment('');
      onOpenChange(false);
      onRatingSubmitted?.();
    } catch (error: any) {
      toast({
        title: 'Error submitting rating',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setRating(0);
    setHoveredRating(0);
    setComment('');
    onOpenChange(false);
  };

  if (!reservation) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Your Desk Experience</DialogTitle>
          <DialogDescription>
            How was your experience with {reservation.cell.label || `${reservation.cell.type} desk`} at {reservation.room.name}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="space-y-2">
            <Label>Rating *</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {rating} {rating === 1 ? 'star' : 'stars'}
                </span>
              )}
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="comment">Additional Comments (Optional)</Label>
            <Textarea
              id="comment"
              placeholder="Share your thoughts about the desk, location, comfort, noise level, etc."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {comment.length}/500 characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
