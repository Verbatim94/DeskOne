import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin, Calendar } from 'lucide-react';
import { Office } from '@/types/office';

export default function Offices() {
    const [offices, setOffices] = useState<Office[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const navigate = useNavigate();

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

    return (
        <div className="h-full flex flex-col space-y-4 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Office Booking</h1>
                    <p className="text-muted-foreground text-sm">Book office spaces by the hour</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : offices.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No offices available</h3>
                        <p className="text-muted-foreground text-center">
                            There are currently no shared offices available for booking
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 overflow-y-auto pr-2">
                    {offices.map((office) => (
                        <Card key={office.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MapPin className="h-5 w-5 text-blue-600" />
                                    {office.name}
                                </CardTitle>
                                <CardDescription>{office.location}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="default"
                                    className="w-full"
                                    onClick={() => navigate(`/offices/${office.id}/book`)}
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    View Schedule & Book
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
