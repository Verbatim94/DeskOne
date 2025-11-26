import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, LayoutGrid, Building2, BookCheck, Users, Settings } from 'lucide-react';
import deskOneLogo from '@/assets/deskone-logo.png';

export function Sidebar() {
    const { user, logout } = useAuth();
    const location = useLocation();

    if (!user) return null;

    const navigation = user.role === 'admin'
        ? [
            { name: 'Manage Rooms', href: '/rooms', icon: Building2, roles: ['admin'] },
            { name: 'Users', href: '/users', icon: Users, roles: ['admin'] },
        ]
        : [
            { name: 'Dashboard', href: '/', icon: LayoutGrid, roles: ['user'] },
            { name: 'My Reservations', href: '/reservations', icon: BookCheck, roles: ['user'] },
        ];

    const filteredNav = navigation.filter(item =>
        item.roles.includes(user.role)
    );

    return (
        <div className="hidden border-r bg-card lg:block w-64 min-h-screen flex flex-col">
            <div className="h-16 flex items-center px-6 border-b">
                <Link to="/" className="flex items-center gap-2">
                    <img
                        src={deskOneLogo}
                        alt="DeskOne"
                        className="h-8 w-auto object-contain"
                    />
                    <span className="font-bold text-xl">DeskOne</span>
                </Link>
            </div>

            <div className="flex-1 py-6 px-3 space-y-1">
                {filteredNav.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.href;
                    return (
                        <Link key={item.name} to={item.href}>
                            <Button
                                variant={isActive ? 'secondary' : 'ghost'}
                                className={cn(
                                    'w-full justify-start gap-3 mb-1',
                                    isActive && 'bg-secondary'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {item.name}
                            </Button>
                        </Link>
                    );
                })}
            </div>

            <div className="p-4 border-t space-y-4">
                <div className="flex items-center gap-3 px-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                        {user.full_name.charAt(0)}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground capitalize truncate">{user.role.replace('_', ' ')}</p>
                    </div>
                </div>

                <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
                    <LogOut className="h-4 w-4" />
                    Logout
                </Button>
            </div>
        </div>
    );
}
