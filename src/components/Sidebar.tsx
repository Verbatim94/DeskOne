import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, LayoutGrid, Building2, BookCheck, Users, CalendarDays, ChartColumnBig } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import deskOneLogo from '@/assets/deskone-logo.png';

export function Sidebar({ className, compact = false }: { className?: string; compact?: boolean }) {
    const { user, logout } = useAuth();
    const location = useLocation();

    if (!user) return null;

    const navigation = user.role === 'admin'
        ? [
            { name: 'Dashboard', href: '/', icon: LayoutGrid, roles: ['admin'] },
            { name: 'Insight', href: '/insight', icon: ChartColumnBig, roles: ['admin'] },
            { name: 'Planner', href: '/planner', icon: CalendarDays, roles: ['admin'] },
            { name: 'Manage Rooms', href: '/rooms', icon: Building2, roles: ['admin'] },
            { name: 'Users', href: '/users', icon: Users, roles: ['admin'] },
        ]
        : [
            { name: 'Dashboard', href: '/', icon: LayoutGrid, roles: ['user'] },
            { name: 'Rooms', href: '/shared-rooms', icon: Building2, roles: ['user'] },
            { name: 'My Reservations', href: '/reservations', icon: BookCheck, roles: ['user'] },
        ];

    const filteredNav = navigation.filter(item => item.roles.includes(user.role));

    return (
        <TooltipProvider>
            <div className={cn('border-r bg-card flex flex-col h-full', className)}>
                <div className={cn('border-b', compact ? 'h-24 flex items-center justify-center px-3' : 'h-24 flex items-center px-6')}>
                    <Link to="/" className={cn('flex items-center', compact ? 'justify-center' : 'gap-3')}>
                        <img
                            src={deskOneLogo}
                            alt="DeskOne"
                            className={cn(compact ? 'h-12 w-12 object-contain' : 'h-16 w-auto object-contain')}
                        />
                        {!compact && (
                            <span className="text-2xl font-semibold tracking-tight text-slate-800">
                                DeskOne
                            </span>
                        )}
                    </Link>
                </div>

                <div className={cn('flex-1', compact ? 'px-2 py-6' : 'px-3 py-6')}>
                    <div className="space-y-2">
                        {filteredNav.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;

                            const button = (
                                <Button
                                    variant="ghost"
                                    className={cn(
                                        compact
                                            ? 'h-12 w-12 rounded-2xl p-0'
                                            : 'w-full justify-start gap-3 rounded-2xl px-4 py-6 text-sm transition-colors',
                                        isActive
                                            ? 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white'
                                            : 'text-muted-foreground hover:bg-blue-50 hover:text-blue-700'
                                    )}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    {!compact && <span className="truncate">{item.name}</span>}
                                </Button>
                            );

                            if (compact) {
                                return (
                                    <Tooltip key={item.name}>
                                        <TooltipTrigger asChild>
                                            <Link to={item.href} className="flex justify-center">
                                                {button}
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            <p>{item.name}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            }

                            return (
                                <Link key={item.name} to={item.href}>
                                    {button}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className={cn('border-t', compact ? 'p-3' : 'space-y-4 p-4')}>
                    {compact ? (
                        <div className="flex flex-col items-center gap-3">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
                                        {user.full_name.charAt(0)}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    <p>{user.full_name}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</p>
                                </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl" onClick={logout}>
                                        <LogOut className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    <p>Logout</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 px-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
                                    {user.full_name.charAt(0)}
                                </div>
                                <div className="min-w-0 flex-1 overflow-hidden">
                                    <p className="truncate text-sm font-medium">{user.full_name}</p>
                                    <p className="truncate text-xs capitalize text-muted-foreground">{user.role.replace('_', ' ')}</p>
                                </div>
                            </div>

                            <Button variant="outline" className="w-full justify-start gap-2 rounded-2xl" onClick={logout}>
                                <LogOut className="h-4 w-4" />
                                Logout
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
}
