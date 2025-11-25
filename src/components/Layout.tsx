import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Users, LayoutGrid, Building2, BookCheck, CheckSquare } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import deskOneLogo from '@/assets/deskone-logo.png';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return <>{children}</>;

  // Different navigation for admin vs user
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-card">
        <div className="container flex h-16 items-center gap-4 px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img 
              src={deskOneLogo} 
              alt="DeskOne" 
              className="h-10 w-auto object-contain"
            />
          </Link>
          
          <nav className="flex flex-1 items-center gap-1 ml-6">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link key={item.name} to={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'gap-2',
                      isActive && 'bg-secondary'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.name}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            <div className="text-sm text-right hidden md:block">
              <div className="font-medium">{user.full_name}</div>
              <div className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      
      <main className="container py-6 px-4 md:px-6">
        {children}
      </main>
    </div>
  );
}
