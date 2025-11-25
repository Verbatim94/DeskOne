import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface DeskRatingsViewProps {
  cellId: string;
  roomId: string;
}

interface Rating {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  from_user: {
    username: string;
    full_name: string;
  };
}

export default function DeskRatingsView({ cellId, roomId }: DeskRatingsViewProps) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageRating, setAverageRating] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadRatings();
  }, [cellId]);

  const loadRatings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ratings')
        .select(`
          id,
          stars,
          comment,
          created_at,
          from_user:users!ratings_from_user_id_fkey(username, full_name)
        `)
        .eq('cell_id', cellId)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedRatings = (data || []).map((r: any) => ({
        ...r,
        from_user: r.from_user || { username: 'Unknown', full_name: 'Unknown User' }
      }));

      setRatings(mappedRatings);

      // Calculate average rating
      if (mappedRatings.length > 0) {
        const avg = mappedRatings.reduce((sum, r) => sum + r.stars, 0) / mappedRatings.length;
        setAverageRating(Math.round(avg * 10) / 10);
      } else {
        setAverageRating(0);
      }
    } catch (error: any) {
      toast({
        title: 'Error loading ratings',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (stars: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= stars ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Average Rating Summary */}
      {ratings.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold">{averageRating}</div>
                <div>
                  {renderStars(Math.round(averageRating))}
                  <p className="text-sm text-muted-foreground mt-1">
                    {ratings.length} {ratings.length === 1 ? 'review' : 'reviews'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual Ratings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ratings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No reviews yet. Be the first to rate this desk!
            </p>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {ratings.map((rating) => (
                  <div
                    key={rating.id}
                    className="border-b last:border-0 pb-4 last:pb-0"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{rating.from_user.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          @{rating.from_user.username}
                        </p>
                      </div>
                      <div className="text-right">
                        {renderStars(rating.stars)}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(rating.created_at), 'PP')}
                        </p>
                      </div>
                    </div>
                    {rating.comment && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {rating.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
