export const extractApiError = (err: any, fallback: string): string => {
  const detail = err?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && typeof item.msg === 'string') return item.msg;
        return null;
      })
      .filter(Boolean) as string[];
    if (messages.length) return messages.join('; ');
  }

  if (detail && typeof detail === 'object' && typeof detail.msg === 'string') {
    return detail.msg;
  }

  if (typeof err?.message === 'string' && err.message.trim()) {
    if (err.message === 'Network Error') {
      return 'Нет соединения с API. Проверьте, что бэкенд запущен на http://127.0.0.1:8000';
    }
    return err.message;
  }

  return fallback;
};
