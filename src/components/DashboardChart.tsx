import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface DashboardChartProps {
    data: Array<{ date: string; bookings: number }>;
}

export function DashboardChart({ data }: DashboardChartProps) {
    return (
        <Card className="col-span-4 border-slate-100 bg-white shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Booking Activity</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Reservation trend over the last six months.
                </p>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                            <XAxis
                                dataKey="date"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                contentStyle={{ background: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="bookings"
                                stroke="#2563eb"
                                strokeWidth={3}
                                dot={{ r: 4, fill: "#2563eb", strokeWidth: 2, stroke: "#fff" }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
