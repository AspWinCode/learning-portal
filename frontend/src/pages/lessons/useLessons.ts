/**
 * Хук для загрузки и управления занятиями выбранной даты.
 */
import { useState, useCallback, useEffect } from 'react';
import { lessonsApi } from '../../services/api';
import type { LessonInstance } from '../../types';

export function useLessons(initialDate: string) {
  const [viewDate, setViewDate] = useState(initialDate);
  const [lessons, setLessons] = useState<LessonInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Фильтры
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const loadLessons = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await lessonsApi.getForDate({
        date,
        lesson_type: filterType || undefined,
        status: filterStatus || undefined,
      });
      setLessons(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки занятий');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    loadLessons(viewDate);
  }, [viewDate, loadLessons]);

  const refresh = useCallback(() => loadLessons(viewDate), [viewDate, loadLessons]);

  // Обновляем конкретное занятие в списке после мутации
  const updateLesson = useCallback((updated: LessonInstance) => {
    setLessons(prev =>
      prev.map(l => l.id === updated.id ? updated : l)
    );
  }, []);

  // Добавляем новое занятие в список
  const addLesson = useCallback((lesson: LessonInstance) => {
    if (lesson.lesson_date === viewDate) {
      setLessons(prev => {
        const updated = [...prev, lesson];
        return updated.sort((a, b) => a.start_time.localeCompare(b.start_time));
      });
    }
  }, [viewDate]);

  return {
    viewDate,
    setViewDate,
    lessons,
    loading,
    error,
    lastUpdated,
    refresh,
    updateLesson,
    addLesson,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
  };
}
