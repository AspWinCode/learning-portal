import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { authApi } from '../services/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVE_SESSION_WINDOW_MS = 20 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef(Date.now());
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity));
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const refreshIfActive = async () => {
      const isRecentlyActive = Date.now() - lastActivityRef.current <= ACTIVE_SESSION_WINDOW_MS;
      if (!isRecentlyActive || refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      try {
        const response = await authApi.refreshSession();
        setToken(response.access_token);
        localStorage.setItem('token', response.access_token);
      } catch {
        // The normal 401 interceptor will clear expired sessions.
      } finally {
        refreshInFlightRef.current = false;
      }
    };
    const intervalId = window.setInterval(refreshIfActive, SESSION_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [token]);

  const loadUser = async () => {
    try {
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (error) {
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setToken(response.access_token);
    localStorage.setItem('token', response.access_token);
    await loadUser();
  };

  const loginAsGuest = async () => {
    const response = await authApi.guestLogin();
    setToken(response.access_token);
    localStorage.setItem('token', response.access_token);
    await loadUser();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        loginAsGuest,
        logout,
        isAuthenticated: !!token && !!user,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

