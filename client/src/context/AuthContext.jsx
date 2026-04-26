import { createContext, useContext, useMemo, useState } from 'react';
import { api } from '../api/http.js';

const AuthContext = createContext(null);

const storedUser = () => {
  const rawUser = localStorage.getItem('carpooling_user');
  return rawUser ? JSON.parse(rawUser) : null;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(storedUser);

  const saveSession = ({ token, user: nextUser }) => {
    localStorage.setItem('carpooling_token', token);
    localStorage.setItem('carpooling_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const login = async (credentials) => {
    const result = await api.post('/auth/login', credentials);
    saveSession(result);
    return result.user;
  };

  const registerPassenger = async (payload) => {
    const result = await api.post('/auth/register/passenger', payload);
    saveSession(result);
    return result.user;
  };

  const registerDriver = async (payload) => {
    const result = await api.post('/auth/register/driver', payload);
    saveSession(result);
    return result.user;
  };

  const logout = () => {
    localStorage.removeItem('carpooling_token');
    localStorage.removeItem('carpooling_user');
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      registerPassenger,
      registerDriver
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
};
