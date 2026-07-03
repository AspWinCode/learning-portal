import axios from 'axios';

// Отдельный клиент для кабинета ученика — своя авторизация (token отличается
// от основного localStorage['token'] User-аккаунтов), свой редирект при 401.
const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const STUDENT_PORTAL_TOKEN_KEY = 'student_portal_token';

export const studentPortalClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 45000,
});

studentPortalClient.interceptors.request.use((config) => {
  if (typeof config.url === 'string' && config.url.startsWith('/api/') && !config.url.startsWith('/api/v1/')) {
    config.url = config.url.slice(4);
  }
  const token = localStorage.getItem(STUDENT_PORTAL_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

studentPortalClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STUDENT_PORTAL_TOKEN_KEY);
      if (!window.location.pathname.startsWith('/student-portal/login')) {
        window.location.href = '/student-portal/login';
      }
    }
    return Promise.reject(error);
  }
);
