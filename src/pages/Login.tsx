import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import deskOneLogo from '@/assets/deskone-logo.png';
import { StatusPopup } from '@/components/StatusPopup';

interface PopupState {
  isOpen: boolean;
  status: 'success' | 'error';
  title: string;
  message: string;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [popup, setPopup] = useState<PopupState>({
    isOpen: false,
    status: 'success',
    title: '',
    message: ''
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const closePopup = () => {
    setPopup(prev => ({ ...prev, isOpen: false }));
    if (popup.status === 'success') {
      navigate('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setPopup({
        isOpen: true,
        status: 'error',
        title: 'Oooops!',
        message: 'Please enter both username and password'
      });
      return;
    }

    setLoading(true);
    const success = await login(username, password);
    setLoading(false);

    if (success) {
      setPopup({
        isOpen: true,
        status: 'success',
        title: 'Success!',
        message: 'You have successfully logged in'
      });
    } else {
      setPopup({
        isOpen: true,
        status: 'error',
        title: 'Oooops!',
        message: 'Invalid username or password'
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <StatusPopup
        isOpen={popup.isOpen}
        onClose={closePopup}
        status={popup.status}
        title={popup.title}
        message={popup.message}
      />

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img
              src={deskOneLogo}
              alt="DeskOne"
              className="h-32 w-auto object-contain"
            />
          </div>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>

            {/* DEV ONLY: Quick Login Button */}
            {import.meta.env.DEV && (
              <Button
                type="button"
                variant="outline"
                className="w-full mt-2 border-dashed"
                onClick={() => {
                  localStorage.setItem('desk_booking_session', JSON.stringify({
                    token: 'fake-token',
                    user: {
                      id: 'fake-admin-id',
                      username: 'admin',
                      full_name: 'Dev Admin',
                      role: 'admin',
                      is_active: true
                    },
                    expiresAt: new Date(Date.now() + 86400000).toISOString()
                  }));
                  window.location.href = '/';
                }}
              >
                ⚡ Dev Login (Bypass Auth)
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
      <div className="text-center text-xs text-muted-foreground mt-4">
        v1.1 - Deployment Check
      </div>
    </div>
  );
}
