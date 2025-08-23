'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => void;
  signOut: () => void;
  refreshAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
  refreshAuth: async () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Use the public auth check endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/check`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          // Token is invalid or user not authorized
          localStorage.removeItem('access_token');
          setUser(null);
        }
      } else {
        // Request failed, remove token
        const errorText = await response.text();
        console.error('Auth check failed:', response.status, errorText);
        localStorage.removeItem('access_token');
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('access_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/callback`;
    const scope = 'email profile';
    
    if (!clientId) {
      console.error('Google Client ID not configured');
      return;
    }
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${redirectUri}&` +
      `response_type=token&` +
      `scope=${scope}`;
    
    window.location.href = authUrl;
  };

  const signOut = async () => {
    localStorage.removeItem('access_token');
    setUser(null);
    router.push('/login');
  };

  const refreshAuth = async (): Promise<boolean> => {
    try {
      await checkAuth();
      return user !== null;
    } catch (error) {
      console.error('Failed to refresh auth:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 