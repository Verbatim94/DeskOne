import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameMonth, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Activity, ArrowRight, BrainCircuit, Building2, CalendarDays, Flame, Gauge, Sparkles, TrendingUp, Users2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';

interface RoomStructure {
  id: string;
  name: string;
  desks: Array<{
    id: string;
    label: string;
    room_id: string;
  }>;
}

interface DailyOccupancyRow {
  reservation_id: string;
  source_type: 'reservation' | 'fixed_assignment';
  room_id: string;
  room_name: string;
  desk_id: string;
  desk_label: string;
  user_id: string;
  user_full_name: string;
  username: string;
  status: string;
  reservation_type: string;
  time_segment: string;
  occupancy_date: string;
  weekday_index: number;
  weekday_name: string;
  is_weekend: boolean;
  month: string;
  year: number;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
}

type InsightPayload = {
  rooms: RoomStructure[];
  rows: DailyOccupancyRow[];
  generatedAt: string;
};

const MIX_COLORS = ['#3b82f6', '#8b5cf6'];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function buildDailyUniqueRows(rows: DailyOccupancyRow[]) {
  const uniqueMap = new Map<string, DailyOccupancyRow>();

  rows.forEach((row) => {
    const key = `${row.desk_id}-${row.occupancy_date}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, row);
    }
  });

  return Array.from(uniqueMap.values());
}

function InsightMetric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <Card className="border-white/60 bg-white/90 shadow-sm backdrop-blur">
      <CardContent className="p-5">
        <div className={`mb-4 inline-flex rounded-2xl px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}>
          {label}
        </div>
        <div className="text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function Insight() {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery<InsightPayload>({
    queryKey: ['admin-insight-dashboard'],
    queryFn: async () => {
      const session = authService.getSession();
      if (!session) throw new Error('No session');

      const today = new Date();
      const rangeStart = startOfMonth(subMonths(today, 5));
      const rangeEnd = endOfMonth(today);

      const [roomsResponse, reportResponse] = await Promise.all([
        supabase.functions.invoke('manage-rooms', {
          body: { operation: 'list_all_desks' },
          headers: { 'x-session-token': session.token },
        }),
        supabase.functions.invoke('manage-reservations', {
          body: {
            operation: 'export_bi_report',
            data: {
              date_start: format(rangeStart, 'yyyy-MM-dd'),
              date_end: format(rangeEnd, 'yyyy-MM-dd'),
              report_type: 'daily',
            },
          },
          headers: { 'x-session-token': session.token },
        }),
      ]);

      if (roomsResponse.error) throw roomsResponse.error;
      if (reportResponse.error) throw reportResponse.error;

      return {
        rooms: roomsResponse.data || [],
        rows: reportResponse.data?.rows || [],
        generatedAt: reportResponse.data?.generated_at || new Date().toISOString(),
      };
    },
    enabled: !!user && user.role === 'admin',
  });

  const insight = useMemo(() => {
    const rooms = data?.rooms || [];
    const uniqueRows = buildDailyUniqueRows(data?.rows || []);
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const monthStart = startOfMonth(today);
    const monthLabel = format(today, 'MMMM yyyy');
    const totalDesks = rooms.reduce((sum, room) => sum + room.desks.length, 0);
    const thisMonthRows = uniqueRows.filter((row) => isSameMonth(parseISO(row.occupancy_date), today));
    const todayRows = uniqueRows.filter((row) => row.occupancy_date === todayStr);
    const uniqueBookersThisMonth = new Set(thisMonthRows.map((row) => row.user_id).filter(Boolean)).size;
    const occupiedToday = todayRows.length;
    const availabilityToday = totalDesks > 0 ? ((totalDesks - occupiedToday) / totalDesks) * 100 : 0;
    const occupancyToday = totalDesks > 0 ? (occupiedToday / totalDesks) * 100 : 0;

    const roomDeskCount = new Map(rooms.map((room) => [room.id, room.desks.length]));
    const roomNameMap = new Map(rooms.map((room) => [room.id, room.name]));

    const todayRoomMap = new Map<string, number>();
    todayRows.forEach((row) => {
      todayRoomMap.set(row.room_id, (todayRoomMap.get(row.room_id) || 0) + 1);
    });

    const todayRooms = rooms
      .map((room) => {
        const occupied = todayRoomMap.get(room.id) || 0;
        const capacity = room.desks.length;
        const free = Math.max(capacity - occupied, 0);
        const utilization = capacity > 0 ? (occupied / capacity) * 100 : 0;
        return {
          id: room.id,
          name: room.name,
          occupied,
          capacity,
          free,
          utilization,
        };
      })
      .sort((a, b) => b.utilization - a.utilization);

    const monthlyTrend = Array.from({ length: 6 }).map((_, index) => {
      const date = addMonths(startOfMonth(subMonths(today, 5)), index);
      const label = format(date, 'MMM');
      const monthRows = uniqueRows.filter((row) => isSameMonth(parseISO(row.occupancy_date), date));
      const segmentEnd = isSameMonth(date, today) ? today : endOfMonth(date);
      const days = eachDayOfInterval({ start: startOfMonth(date), end: segmentEnd }).length;
      const capacity = totalDesks * days;
      const uniqueUsers = new Set(monthRows.map((row) => row.user_id).filter(Boolean)).size;

      return {
        label,
        deskDays: monthRows.length,
        utilization: capacity > 0 ? Math.round((monthRows.length / capacity) * 100) : 0,
        users: uniqueUsers,
      };
    });

    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const rangeStart = startOfMonth(subMonths(today, 5));
    const allDays = eachDayOfInterval({ start: rangeStart, end: today });
    const weekdayOccurrences = allDays.reduce<Record<number, number>>((acc, day) => {
      const weekday = day.getDay();
      acc[weekday] = (acc[weekday] || 0) + 1;
      return acc;
    }, {});

    const weekdayDemandMap = uniqueRows.reduce<Record<number, number>>((acc, row) => {
      const weekday = parseISO(row.occupancy_date).getDay();
      acc[weekday] = (acc[weekday] || 0) + 1;
      return acc;
    }, {});

    const weekdayData = weekdayLabels.map((label, weekday) => {
      const avgDeskDays = (weekdayDemandMap[weekday] || 0) / Math.max(weekdayOccurrences[weekday] || 1, 1);
      return {
        label,
        averageDeskDays: Math.round(avgDeskDays * 10) / 10,
      };
    });

    const busiestWeekday = [...weekdayData].sort((a, b) => b.averageDeskDays - a.averageDeskDays)[0];

    const sourceMixMap = uniqueRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.source_type] = (acc[row.source_type] || 0) + 1;
      return acc;
    }, {});

    const sourceMix = [
      { name: 'Flexible bookings', value: sourceMixMap.reservation || 0 },
      { name: 'Fixed assignments', value: sourceMixMap.fixed_assignment || 0 },
    ];

    const roomMonthMap = new Map<string, number>();
    thisMonthRows.forEach((row) => {
      roomMonthMap.set(row.room_id, (roomMonthMap.get(row.room_id) || 0) + 1);
    });

    const elapsedMonthDays = eachDayOfInterval({ start: monthStart, end: today }).length;
    const topRooms = rooms
      .map((room) => {
        const deskDays = roomMonthMap.get(room.id) || 0;
        const capacity = room.desks.length * elapsedMonthDays;
        return {
          id: room.id,
          name: room.name,
          deskDays,
          utilization: capacity > 0 ? (deskDays / capacity) * 100 : 0,
          avgDailyBooked: elapsedMonthDays > 0 ? deskDays / elapsedMonthDays : 0,
        };
      })
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 5);

    const dailyLoadMap = new Map<string, number>();
    uniqueRows.forEach((row) => {
      dailyLoadMap.set(row.occupancy_date, (dailyLoadMap.get(row.occupancy_date) || 0) + 1);
    });

    const peakDay = Array.from(dailyLoadMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.count - a.count)[0];

    const pressureRooms = todayRooms.filter((room) => room.utilization >= 80).length;
    const activeRoomsToday = todayRooms.filter((room) => room.occupied > 0).length;
    const averageDailyDemand = elapsedMonthDays > 0 ? thisMonthRows.length / elapsedMonthDays : 0;
    const primaryRoom = topRooms[0];
    const todayPulse = todayRooms.slice(0, 4);

    return {
      totalDesks,
      occupiedToday,
      availabilityToday,
      occupancyToday,
      uniqueBookersThisMonth,
      deskDaysThisMonth: thisMonthRows.length,
      pressureRooms,
      activeRoomsToday,
      monthlyTrend,
      weekdayData,
      busiestWeekday,
      sourceMix,
      topRooms,
      peakDay,
      todayPulse,
      primaryRoom,
      averageDailyDemand,
      roomNameMap,
      generatedAt: data?.generatedAt || new Date().toISOString(),
      monthLabel,
    };
  }, [data]);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-slate-500">Loading insight dashboard...</div>
      </div>
    );
  }

  if (isError || !insight) {
    return (
      <Card className="border-red-100 bg-red-50">
        <CardContent className="p-6">
          <h1 className="text-lg font-semibold text-red-900">Insight unavailable</h1>
          <p className="mt-2 text-sm text-red-700">
            The admin insight dashboard could not be loaded right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <Card className="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.22),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(34,197,94,0.16),_transparent_20%),linear-gradient(135deg,#0f172a_0%,#1d4ed8_45%,#7c3aed_100%)] text-white shadow-xl">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-50 backdrop-blur">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Admin Insight
                </div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                  Turn desk usage into decisions, not just reports.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-50/88 md:text-base">
                  This view surfaces the healthiest signals for workspace planning: occupancy pressure, adoption,
                  demand rhythm, and the rooms that are running hottest right now.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full bg-white/15 px-3 py-1 text-white hover:bg-white/20">
                    Updated {format(parseISO(insight.generatedAt), 'dd MMM yyyy, HH:mm')}
                  </Badge>
                  <Badge className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-50 hover:bg-emerald-400/20">
                    {insight.monthLabel} focus
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-100/75">Busiest pattern</p>
                  <div className="mt-2 text-2xl font-semibold">{insight.busiestWeekday?.label || 'N/A'}</div>
                  <p className="mt-2 text-sm text-blue-50/80">
                    averages {insight.busiestWeekday?.averageDeskDays || 0} occupied desks per day.
                  </p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-100/75">Peak pressure day</p>
                  <div className="mt-2 text-2xl font-semibold">
                    {insight.peakDay ? format(parseISO(insight.peakDay.date), 'dd MMM') : 'N/A'}
                  </div>
                  <p className="mt-2 text-sm text-blue-50/80">
                    hit {insight.peakDay ? `${insight.peakDay.count} occupied desks` : 'no data yet'}.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="rounded-full bg-white text-slate-900 hover:bg-blue-50">
                <Link to="/planner">
                  Open Planner
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/15">
                <Link to="/rooms">Manage Rooms</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-lg">
              Today Pulse
              <Gauge className="h-5 w-5 text-slate-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-slate-500">Occupancy</p>
                  <p className="text-4xl font-semibold tracking-tight text-slate-950">
                    {formatPercent(insight.occupancyToday)}
                  </p>
                </div>
                <div className="rounded-2xl bg-blue-50 px-3 py-2 text-right">
                  <p className="text-xs uppercase tracking-[0.16em] text-blue-700">Open seats</p>
                  <p className="text-lg font-semibold text-blue-950">
                    {Math.max(insight.totalDesks - insight.occupiedToday, 0)}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)]"
                  style={{ width: `${Math.min(insight.occupancyToday, 100)}%` }}
                />
              </div>
            </div>

            <div className="grid gap-3">
              {insight.todayPulse.map((room) => (
                <div key={room.id} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{room.name}</p>
                      <p className="text-xs text-slate-500">{room.occupied} occupied, {room.free} free</p>
                    </div>
                    <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                      {formatPercent(room.utilization)}
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#f59e0b_55%,#ef4444_100%)]"
                      style={{ width: `${Math.min(room.utilization, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InsightMetric
          label="Desk-days this month"
          value={compactNumber(insight.deskDaysThisMonth)}
          detail="Total occupied desk-days across reservations and fixed assignments this month."
          accent="bg-blue-50 text-blue-700"
        />
        <InsightMetric
          label="Unique bookers"
          value={String(insight.uniqueBookersThisMonth)}
          detail="How many distinct people used at least one desk day during the current month."
          accent="bg-emerald-50 text-emerald-700"
        />
        <InsightMetric
          label="Busy rooms today"
          value={String(insight.pressureRooms)}
          detail="Rooms currently at or above 80% utilization and likely to require admin attention."
          accent="bg-amber-50 text-amber-700"
        />
        <InsightMetric
          label="Active rooms"
          value={String(insight.activeRoomsToday)}
          detail="Rooms with at least one occupied desk today, useful to spot concentration vs spread."
          accent="bg-violet-50 text-violet-700"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg text-slate-950">Occupancy momentum</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Six-month trend of occupied desk-days and utilization level.
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={insight.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                    }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="deskDays"
                    stroke="#2563eb"
                    fill="url(#insightAreaFill)"
                    strokeWidth={3}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="utilization"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#8b5cf6' }}
                  />
                  <defs>
                    <linearGradient id="insightAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-lg">
              Occupancy mix
              <Sparkles className="h-5 w-5 text-slate-400" />
            </CardTitle>
            <p className="text-sm text-slate-500">
              Flexible demand versus structurally assigned desks.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={insight.sourceMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={4}
                  >
                    {insight.sourceMix.map((entry, index) => (
                      <Cell key={entry.name} fill={MIX_COLORS[index % MIX_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3">
              {insight.sourceMix.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: MIX_COLORS[index % MIX_COLORS.length] }} />
                    <span className="text-sm font-medium text-slate-700">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-950">{compactNumber(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_360px]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-lg">
              Weekly demand shape
              <CalendarDays className="h-5 w-5 text-slate-400" />
            </CardTitle>
            <p className="text-sm text-slate-500">
              Average occupied desks by weekday across the last six months.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insight.weekdayData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                    }}
                  />
                  <Bar dataKey="averageDeskDays" radius={[10, 10, 4, 4]} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-lg">
              Top rooms this month
              <Flame className="h-5 w-5 text-slate-400" />
            </CardTitle>
            <p className="text-sm text-slate-500">
              Rooms with the strongest month-to-date utilization.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {insight.topRooms.map((room, index) => (
              <div key={room.id} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-900">{room.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {room.deskDays} desk-days, {room.avgDailyBooked.toFixed(1)} avg booked desks/day
                    </p>
                  </div>
                  <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                    {formatPercent(room.utilization)}
                  </Badge>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#8b5cf6_100%)]"
                    style={{ width: `${Math.min(room.utilization, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                Planning cues
                <Activity className="h-5 w-5 text-slate-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <div className="rounded-2xl bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Primary signal</p>
                <p className="mt-2 leading-6 text-blue-950">
                  {insight.primaryRoom
                    ? `${insight.primaryRoom.name} is your hottest room this month at ${formatPercent(insight.primaryRoom.utilization)} utilization.`
                    : 'No room signal available yet.'}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Adoption cue</p>
                <p className="mt-2 leading-6 text-emerald-950">
                  {insight.uniqueBookersThisMonth} people used desks in {insight.monthLabel.toLowerCase()}, with an average daily demand of {insight.averageDailyDemand.toFixed(1)} desk-days.
                </p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pressure cue</p>
                <p className="mt-2 leading-6 text-amber-950">
                  {insight.pressureRooms > 0
                    ? `${insight.pressureRooms} rooms are already above the 80% pressure threshold today.`
                    : 'No room has crossed the 80% pressure threshold today.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                Footprint
                <Building2 className="h-5 w-5 text-slate-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Total desks</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{insight.totalDesks}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Availability today</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{formatPercent(insight.availabilityToday)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Occupied today</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{insight.occupiedToday}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Monthly adoption</p>
                <div className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-950">
                  {insight.uniqueBookersThisMonth}
                  <Users2 className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
