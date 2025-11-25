import { supabase } from "@/integrations/supabase/client";

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'user';
  is_active: boolean;
}

export interface Session {
  token: string;
  user: User;
  expiresAt: Date;
}

const SESSION_KEY = 'desk_booking_session';

export const authService = {
  async login(username: string, password: string): Promise<Session | null> {
    try {
      // Query users table for matching credentials
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .eq('is_active', true)
        .limit(1);

      if (error || !users || users.length === 0) {
        return null;
      }

      const user = users[0];

      // Create session token
      const sessionToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8); // 8 hour session

      // Store session in database
      const { error: sessionError } = await supabase
        .from('user_sessions')
        .insert({
          user_id: user.id,
          session_token: sessionToken,
          expires_at: expiresAt.toISOString()
        });

      if (sessionError) {
        console.error('Failed to create session:', sessionError);
        return null;
      }

      const session: Session = {
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active
        },
        expiresAt
      };

      // Store in localStorage
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));

      return session;
    } catch (error) {
      console.error('Login error:', error);
      return null;
    }
  },

  async logout(): Promise<void> {
    const session = this.getSession();
    if (session) {
      // Delete session from database
      await supabase
        .from('user_sessions')
        .delete()
        .eq('session_token', session.token);
    }
    localStorage.removeItem(SESSION_KEY);
  },

  getSession(): Session | null {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    try {
      const session: Session = JSON.parse(stored);
      session.expiresAt = new Date(session.expiresAt);

      // Check if expired
      if (session.expiresAt < new Date()) {
        this.logout();
        return null;
      }

      return session;
    } catch {
      return null;
    }
  },

  isAuthenticated(): boolean {
    return this.getSession() !== null;
  },

  getCurrentUser(): User | null {
    const session = this.getSession();
    return session?.user || null;
  },

  hasRole(role: 'admin' | 'user'): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    if (role === 'user') return true; // All roles can access user features
    return user.role === 'admin';
  }
};
