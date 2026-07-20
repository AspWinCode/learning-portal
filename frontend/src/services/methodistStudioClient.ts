import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const METHODIST_STUDIO_TOKEN_KEY = 'methodist_studio_token';

export const methodistStudioClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 45000,
});

methodistStudioClient.interceptors.request.use((config) => {
  if (typeof config.url === 'string' && config.url.startsWith('/api/') && !config.url.startsWith('/api/v1/')) {
    config.url = config.url.slice(4);
  }
  const token = localStorage.getItem(METHODIST_STUDIO_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

methodistStudioClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(METHODIST_STUDIO_TOKEN_KEY);
      if (!window.location.pathname.startsWith('/methodist-studio/login')) {
        window.location.href = '/methodist-studio/login';
      }
    }
    return Promise.reject(error);
  }
);
