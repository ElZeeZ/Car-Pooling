import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';

const AuthContext = createContext(null);

const storedUser = () => {
  const rawUser = localStorage.getItem('carpooling_user');
  return rawUser ? JSON.parse(rawUser) : null;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(storedUser);

  const saveSession = useCallback(({ token, user: nextUser }) => {
    localStorage.setItem('carpooling_token', token);
    localStorage.setItem('carpooling_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const saveUser = useCallback((nextUser) => {
    localStorage.setItem('carpooling_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const login = async (credentials) => {
    const result = await api.post('/auth/login', credentials);
    if (result.requiresRoleSelection) {
      return result;
    }

    saveSession(result);
    return result.user;
  };

  const registerPassenger = async (payload) => {
    const result = await api.post('/auth/register/passenger', payload);
    saveSession(result);
    return result;
  };

  const registerDriver = async (payload) => {
    const result = await api.post('/auth/register/driver', payload);
    if (result.token) {
      saveSession(result);
    }
    return result;
  };

  const logout = useCallback(() => {
    localStorage.removeItem('carpooling_token');
    localStorage.removeItem('carpooling_user');
    setUser(null);
  }, []);

  const refreshAccount = useCallback(async () => {
    const result = await api.get('/account');

    if (result.user) {
      saveUser(result.user);
    }

    return result;
  }, [saveUser]);

  const updateAccountProfile = useCallback(
    async (payload) => {
      const result = await api.patch('/account/profile', payload);

      if (result.user) {
        saveUser(result.user);
      }

      return result;
    },
    [saveUser]
  );

  const updateAccountPassword = useCallback((payload) => api.patch('/account/password', payload), []);

  const addDriverVehicle = useCallback(
    async (payload) => {
      const result = await api.post('/account/vehicles', payload);

      if (result.user) {
        saveUser(result.user);
      }

      return result;
    },
    [saveUser]
  );

  const selectDriverVehicle = useCallback(
    async (vehicleId) => {
      const result = await api.patch(`/account/vehicles/${vehicleId}/active`, {});

      if (result.user) {
        saveUser(result.user);
      }

      return result;
    },
    [saveUser]
  );

  const deleteDriverVehicle = useCallback(
    async (vehicleId) => {
      const result = await api.delete(`/account/vehicles/${vehicleId}`);

      if (result.user) {
        saveUser(result.user);
      }

      return result;
    },
    [saveUser]
  );

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let cancelled = false;

    const checkAccountStatus = async () => {
      try {
        const result = await api.get('/auth/me');
        if (!cancelled && result.user) {
          localStorage.setItem('carpooling_user', JSON.stringify(result.user));
          setUser(result.user);
        }
      } catch (requestError) {
        if (!cancelled && [401, 403, 404].includes(requestError.status)) {
          logout();
        }
      }
    };

    const intervalId = window.setInterval(checkAccountStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [logout, user?.id, user?.role]);

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      registerPassenger,
      registerDriver,
      refreshAccount,
      updateAccountProfile,
      updateAccountPassword,
      addDriverVehicle,
      selectDriverVehicle,
      deleteDriverVehicle
    }),
    [
      addDriverVehicle,
      deleteDriverVehicle,
      logout,
      refreshAccount,
      selectDriverVehicle,
      updateAccountPassword,
      updateAccountProfile,
      user
    ]
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
