/**
 * LessonsPageContainer — новая страница «Уроки».
 *
 * Объединяет все типы занятий в едином списке, отсортированном по времени.
 * Декомпозирована на отдельные компоненты и хуки.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';

import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import { studentsApi, usersApi, groupsApi } from '../../services/api';

import { useLessons } from './useLessons';
import { LessonsToolbar } from './LessonsToolbar';
import { LessonCard } from './LessonCard';
import { LessonAttendanceDialog } from './LessonAttendanceDialog';
import { LessonMoveDialog } from './LessonMoveDialog';
import { LessonCancelDialog } from './LessonCancelDialog';
import { LessonCreateDialog } from './LessonCreateDialog';

import type { LessonInstance, User, Student } from '../../types';

interface GroupMin {
  id: number;
  name: string;
  status: string;
}

export default function LessonsPageContainer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const initialDate = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd');

  const {
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
  } = useLessons(initialDate);

  // Синхронизируем дату в URL
  const handleDateChange = useCallback((date: string) => {
    setViewDate(date);
    setSearchParams({ date });
  }, [setViewDate, setSearchParams]);

  // Справочники
  const [trainers, setTrainers] = useState<User[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<GroupMin[]>([]);

  useEffect(() => {
    usersApi.getAll('trainer').then(setTrainers).catch(() => {});
    studentsApi.getAll({ status: 'active', limit: 500 }).then(r => setAllStudents(Array.isArray(r) ? r : [])).catch(() => {});
    groupsApi.getAll().then(setGroups).catch(() => {});
  }, []);

  // Диалоги
  const [attendanceLesson, setAttendanceLesson] = useState<LessonInstance | null>(null);
  const [moveLesson, setMoveLesson] = useState<LessonInstance | null>(null);
  const [cancelLesson, setCancelLesson] = useState<LessonInstance | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Права
  const role = user?.role ?? '';
  const canMove = ['admin', 'owner', 'sales'].includes(role);
  const canCancel = ['admin', 'owner', 'sales'].includes(role);
  const canCreate = ['admin', 'owner', 'sales'].includes(role);
  const canChangeTrainer = ['admin', 'owner', 'sales'].includes(role);
  const canAddStudent = ['admin', 'owner', 'sales', 'trainer'].includes(role);
  const canRemoveStudent = ['admin', 'owner'].includes(role);

  const handleMoved = useCallback((newLesson: LessonInstance) => {
    refresh();  // Обновляем весь список — старый урок изменил статус, новый появился
  }, [refresh]);

  const handleCancelled = useCallback((updated: LessonInstance) => {
    updateLesson(updated);
  }, [updateLesson]);

  const handleAttendanceSaved = useCallback((updated: LessonInstance) => {
    updateLesson(updated);
  }, [updateLesson]);

  const handleCreated = useCallback((lesson: LessonInstance) => {
    addLesson(lesson);
  }, [addLesson]);

  const isEmpty = !loading && !error && lessons.length === 0;

  return (
    <Layout>
      <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Верхняя панель */}
        <LessonsToolbar
          viewDate={viewDate}
          onDateChange={handleDateChange}
          onAddLesson={() => setCreateOpen(true)}
          onRefresh={refresh}
          canAdd={canCreate}
          loading={loading}
          lastUpdated={lastUpdated}
          filterType={filterType}
          filterStatus={filterStatus}
          onFilterTypeChange={setFilterType}
          onFilterStatusChange={setFilterStatus}
        />

        {/* Ошибка */}
        {error && (
          <Alert severity="error" onClose={refresh}>{error}</Alert>
        )}

        {/* Загрузка */}
        {loading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {/* Пустой список */}
        {isEmpty && (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            py={6}
            color="text.secondary"
          >
            <Typography variant="h6">Занятий нет</Typography>
            <Typography variant="body2">
              На {viewDate} нет занятий{filterType || filterStatus ? ' (с текущими фильтрами)' : ''}
            </Typography>
          </Box>
        )}

        {/* Список занятий */}
        {!loading && lessons.length > 0 && (
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" color="text.secondary">
              {lessons.length} {lessons.length === 1 ? 'занятие' : lessons.length < 5 ? 'занятия' : 'занятий'}
            </Typography>
            {lessons.map(lesson => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                onOpenAttendance={(l: LessonInstance) => setAttendanceLesson(l)}
                onMove={(l: LessonInstance) => setMoveLesson(l)}
                onCancel={(l: LessonInstance) => setCancelLesson(l)}
                canMove={canMove}
                canCancel={canCancel}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {/* Диалоги */}
      <LessonAttendanceDialog
        open={!!attendanceLesson}
        lesson={attendanceLesson}
        onClose={() => setAttendanceLesson(null)}
        onSaved={handleAttendanceSaved}
        trainers={trainers}
        allStudents={allStudents}
        canChangeTrainer={canChangeTrainer}
        canAddStudent={canAddStudent}
        canRemoveStudent={canRemoveStudent}
      />

      <LessonMoveDialog
        open={!!moveLesson}
        lesson={moveLesson}
        onClose={() => setMoveLesson(null)}
        onMoved={handleMoved}
      />

      <LessonCancelDialog
        open={!!cancelLesson}
        lesson={cancelLesson}
        onClose={() => setCancelLesson(null)}
        onCancelled={handleCancelled}
      />

      <LessonCreateDialog
        open={createOpen}
        defaultDate={viewDate}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        trainers={trainers}
        groups={(groups as GroupMin[]).filter(g => g.status === 'active')}
        allStudents={allStudents}
      />
    </Layout>
  );
}
