/**
 * Хук для управления черновиком посещаемости.
 * Хранит несохранённые изменения, dirty-флаг, и предотвращает потерю данных.
 */
import { useState, useCallback } from 'react';
import type { LessonStudentItem } from '../../types';

export interface AttendanceDraftItem {
  lesson_student_id: number;
  student_id: number;
  student_name: string;
  attended: boolean | null;
  late: boolean;
  absence_reason: string | null;
  absence_comment: string | null;
  planned_absence_id: number | null;
  participation_status: string;
}

function buildDraft(students: LessonStudentItem[]): Record<number, AttendanceDraftItem> {
  const draft: Record<number, AttendanceDraftItem> = {};
  for (const s of students) {
    draft[s.id] = {
      lesson_student_id: s.id,
      student_id: s.student_id,
      student_name: s.student_name,
      attended: s.attended,
      late: s.late,
      absence_reason: s.absence_reason,
      absence_comment: s.absence_comment,
      planned_absence_id: s.planned_absence_id,
      participation_status: s.participation_status,
    };
  }
  return draft;
}

export function useLessonAttendanceDraft() {
  const [draft, setDraft] = useState<Record<number, AttendanceDraftItem>>({});
  const [isDirty, setIsDirty] = useState(false);

  /** Инициализировать черновик из данных занятия */
  const initDraft = useCallback((students: LessonStudentItem[]) => {
    setDraft(buildDraft(students));
    setIsDirty(false);
  }, []);

  /** Изменить посещаемость ученика */
  const setAttended = useCallback((lessonStudentId: number, attended: boolean) => {
    setDraft(prev => ({
      ...prev,
      [lessonStudentId]: {
        ...prev[lessonStudentId],
        attended,
        // Если отметили как присутствовал — сбрасываем причину
        absence_reason: attended ? null : prev[lessonStudentId]?.absence_reason,
        absence_comment: attended ? null : prev[lessonStudentId]?.absence_comment,
        late: attended ? false : prev[lessonStudentId]?.late,
      },
    }));
    setIsDirty(true);
  }, []);

  const setLate = useCallback((lessonStudentId: number, late: boolean) => {
    setDraft(prev => ({
      ...prev,
      [lessonStudentId]: { ...prev[lessonStudentId], late },
    }));
    setIsDirty(true);
  }, []);

  const setAbsenceReason = useCallback((lessonStudentId: number, reason: string | null) => {
    setDraft(prev => ({
      ...prev,
      [lessonStudentId]: { ...prev[lessonStudentId], absence_reason: reason },
    }));
    setIsDirty(true);
  }, []);

  const setAbsenceComment = useCallback((lessonStudentId: number, comment: string | null) => {
    setDraft(prev => ({
      ...prev,
      [lessonStudentId]: { ...prev[lessonStudentId], absence_comment: comment },
    }));
    setIsDirty(true);
  }, []);

  /** Отметить всех как присутствовали */
  const markAllPresent = useCallback(() => {
    setDraft(prev => {
      const next = { ...prev };
      for (const key in next) {
        next[key] = { ...next[key], attended: true, late: false, absence_reason: null, absence_comment: null };
      }
      return next;
    });
    setIsDirty(true);
  }, []);

  /** Отметить всех как отсутствовали */
  const markAllAbsent = useCallback(() => {
    setDraft(prev => {
      const next = { ...prev };
      for (const key in next) {
        next[key] = { ...next[key], attended: false };
      }
      return next;
    });
    setIsDirty(true);
  }, []);

  /** Получить items для отправки на сервер */
  const getItems = useCallback(() => {
    return Object.values(draft).map(item => ({
      lesson_student_id: item.lesson_student_id,
      attended: item.attended ?? false,
      late: item.late,
      absence_reason: item.absence_reason,
      absence_comment: item.absence_comment,
    }));
  }, [draft]);

  const resetDirty = useCallback(() => setIsDirty(false), []);

  return {
    draft,
    isDirty,
    initDraft,
    setAttended,
    setLate,
    setAbsenceReason,
    setAbsenceComment,
    markAllPresent,
    markAllAbsent,
    getItems,
    resetDirty,
  };
}
