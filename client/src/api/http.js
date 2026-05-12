const resolveApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  const apiPort = import.meta.env.VITE_API_PORT || '5000';

  if (typeof window === 'undefined') {
    return `http://localhost:${apiPort}/api`;
  }

  const { protocol, hostname } = window.location;

  if (protocol === 'https:') {
    return '/api';
  }

  return `http://${hostname}:${apiPort}/api`;
};

const API_BASE_URL = resolveApiBaseUrl();

const getToken = () => localStorage.getItem('carpooling_token');

export const apiRequest = async (path, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.message ?? 'Request failed.');
    error.status = response.status;
    throw error;
  }

  return payload;
};

export const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  delete: (path) => apiRequest(path, { method: 'DELETE' })
};
