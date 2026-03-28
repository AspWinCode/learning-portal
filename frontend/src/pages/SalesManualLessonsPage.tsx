/**
 * SalesManualLessonsPage — список ручных уроков за период.
 * Показывает занятия типа: отработка, ручное, доп. платное, пробное.
 * Маршрут: /sales/manual-lessons (admin, owner, sales)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';

import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { lessonsApi, usersApi, studentsApi, groupsApi } from '../services/api';
import { LessonAttendanceDialog } from './lessons/LessonAttendanceDialog';
import { LessonCreateDialog } from './lessons/LessonCreateDialog';
import type { LessonInstance, User, Student } from '../types';
import { LESSON_TYPE_LABELS, LESSON_TYPE_COLORS } from '../types';

const MANUAL_TYPE_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: 'makeup', label: 'Отработка' },
  { value: 'manual', label: 'Ручное' },
  { value: 'paid_extra', label: 'Доп. платное' },
  { value: 'free_trial', label: 'Пробное' },
];

interface GroupMin { id: number; name: string; status: string; }

export default function SalesManualLessonsPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canCreate = ['admin', 'owner', 'sales'].includes(role);

  // Фильтры — по умолчанию текущий месяц
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [lessonType, setLessonType] = useState('');

  // Данные
  const [lessons, setLessons] = useState<LessonInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Справочники
  const [trainers, setTrainers] = useState<User[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<GroupMin[]>([]);

  useEffect(() => {
    usersApi.getAll('trainer').then(setTrainers).catch(() => {});
    studentsApi.getAll({ status: 'active', limit: 500 }).then(r => setAllStudents(Array.isArray(r) ? r : [])).catch(() => {});
    groupsApi.getAll().then(setGroups).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    try {
      const data = await lessonsApi.getManualList({
        date_from: dateFrom,
        date_to: dateTo,
        lesson_type: lessonType || undefined,
      });
      setLessons(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, lessonType]);

  useEffect(() => { load(); }, [load]);

  // Диалоги
  const [attendanceLesson, setAttendanceLesson] = useState<LessonInstance | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleAttendanceSaved = useCallback((updated: LessonInstance) => {
    setLessons(prev => prev.map(l => l.id === updated.id ? updated : l));
  }, []);

  const handleCreated = useCallback((lesson: LessonInstance) => {
    load();
  }, [load]);

  return (
    <Layout>
      <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Заголовок */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="h5" fontWeight={700}>Ручные уроки</Typography>
          {canCreate && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Создать
            </Button>
          )}
        </Stack>

        {/* Фильтры */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="flex-end">
            <TextField
              label="С даты"
              type="date"
              size="small"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="По дату"
              type="date"
              size="small"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Тип урока</InputLabel>
              <Select
                value={lessonType}
                label="Тип урока"
                onChange={e => setLessonType(e.target.value)}
              >
                {MANUAL_TYPE_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        {/* Ошибка */}
        {error && <Alert severity="error">{error}</Alert>}

        {/* Загрузка */}
        {loading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {/* Таблица */}
        {!loading && (
          <>
            <Typography variant="body2" color="text.secondary">
              Найдено: {lessons.length}
            </Typography>
            {lessons.length === 0 ? (
              <Box py={4} textAlign="center" color="text.secondary">
                <Typography>Нет уроков за выбранный период</Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'grey.50' }}>
                      <TableCell><b>Дата</b></TableCell>
                      <TableCell><b>Время</b></TableCell>
                      <TableCell><b>Тип</b></TableCell>
                      <TableCell><b>Название</b></TableCell>
                      <TableCell><b>Тренер</b></TableCell>
                      <TableCell><b>Ученики</b></TableCell>
                      <TableCell><b>Статус</b></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lessons.map(lesson => (
                      <TableRow
                        key={lesson.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => setAttendanceLesson(lesson)}
                      >
                        <TableCell>
                          {format(new Date(lesson.lesson_date), 'dd.MM.yyyy', { locale: ru })}
                          <Typography variant="caption" display="block" color="text.secondary">
                            {format(new Date(lesson.lesson_date), 'EEEE', { locale: ru })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {lesson.start_time}
                          {lesson.end_time ? ` – ${lesson.end_time}` : ''}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={LESSON_TYPE_LABELS[lesson.lesson_type] ?? lesson.lesson_type}
                            size="small"
                            sx={{
                              backgroundColor: LESSON_TYPE_COLORS[lesson.lesson_type] ?? '#757575',
                              color: '#fff',
                              fontWeight: 600,
                              fontSize: 11,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {lesson.title ?? lesson.group_name ?? '—'}
                        </TableCell>
                        <TableCell>{lesson.trainer_name ?? '—'}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {lesson.students
                              .filter(s => s.participation_status !== 'removed')
                              .map(s => (
                                <Chip
                                  key={s.student_id}
                                  label={s.student_name}
                                  size="small"
                                  variant="outlined"
                                  color={
                                    s.attended === true ? 'success'
                                    : s.attended === false ? 'error'
                                    : 'default'
                                  }
                                />
                              ))
                            }
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {lesson.status === 'completed' && (
                            <Chip label="Проведён" size="small" color="success" />
                          )}
                          {lesson.status === 'planned' && (
                            <Chip label="Запланирован" size="small" />
                          )}
                          {lesson.status === 'cancelled' && (
                            <Chip label="Отменён" size="small" color="error" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Stack>

      {/* Диалог посещаемости */}
      <LessonAttendanceDialog
        open={!!attendanceLesson}
        lesson={attendanceLesson}
        onClose={() => setAttendanceLesson(null)}
        onSaved={updated => {
          handleAttendanceSaved(updated);
          setAttendanceLesson(updated);
        }}
        trainers={trainers}
        allStudents={allStudents}
        canChangeTrainer={['admin', 'owner', 'sales'].includes(role)}
        canAddStudent={['admin', 'owner', 'sales'].includes(role)}
        canRemoveStudent={['admin', 'owner'].includes(role)}
      />

      {/* Диалог создания */}
      <LessonCreateDialog
        open={createOpen}
        defaultDate={format(today, 'yyyy-MM-dd')}
        onClose={() => setCreateOpen(false)}
        onCreated={lesson => { setCreateOpen(false); handleCreated(lesson); }}
        trainers={trainers}
        groups={(groups as GroupMin[]).filter(g => g.status === 'active')}
        allStudents={allStudents}
      />
    </Layout>
  );
}
