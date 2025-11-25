import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, User, Session } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for existing session on mount
    const existingSession = authService.getSession();
    if (existingSession) {
      setSession(existingSession);
      setUser(existingSession.user);
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    const newSession = await authService.login(username, password);
    if (newSession) {
      setSession(newSession);
      setUser(newSession.user);
      return true;
    }
    return false;
  };

  const logout = async () => {
    await authService.logout();
    setSession(null);
    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        login,
        logout,
        isAuthenticated: !!session
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
