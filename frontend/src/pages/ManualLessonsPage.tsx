import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  Stack,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { salesApi, studentsApi } from '../services/api';
import { Student } from '../types';
import { extractApiError } from '../utils/extractApiError';
import type { AbsenceFollowUp } from '../types';

const REASON_LABELS: Record<string, string> = {
  was: 'Был',
  not_was: 'Не был',
  sick: 'Болел',
  olympiad: 'Олимпиада',
  event: 'Мероприятие',
  other: 'Другое',
};

type ManualLessonType = 'makeup' | 'paid_extra' | 'free_trial';

const LESSON_TYPE_LABELS: Record<ManualLessonType, string> = {
  makeup: 'Отработка',
  paid_extra: 'Дополнительное платное',
  free_trial: 'Бесплатное / пробное',
};

const ManualLessonsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [title, setTitle] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [trainerId, setTrainerId] = useState<string>('');
  const [lessonType, setLessonType] = useState<ManualLessonType>('makeup');
  const [comment, setComment] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentOptions, setStudentOptions] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  /** Для типа «Отработка»: какой пропуск закрыть по каждому ученику (id пропуска или null = самый ранний). */
  const [plannedAbsenceByStudentId, setPlannedAbsenceByStudentId] = useState<Record<number, number | null>>({});
  /** Открытые пропуски по student_id (missed, missed_makeup) для выбора. */
  const [openAbsencesByStudentId, setOpenAbsencesByStudentId] = useState<Record<number, AbsenceFollowUp[]>>({});

  const loadLessons = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.listCustomLessons({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setLessons(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить ручные уроки'));
      setLessons([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Открыть форму создания с предзаполнением из Пропусков (absence_id + student_id)
  useEffect(() => {
    const create = searchParams.get('create');
    const absenceId = searchParams.get('absence_id');
    const studentIdParam = searchParams.get('student_id');
    if (create !== '1' || !studentIdParam) return;
    const sid = parseInt(studentIdParam, 10);
    if (isNaN(sid)) return;
    setCreateOpen(true);
    setLessonType('makeup');
    if (absenceId) {
      const aid = parseInt(absenceId, 10);
      if (!isNaN(aid)) setPlannedAbsenceByStudentId((prev) => ({ ...prev, [sid]: aid }));
    }
    studentsApi
      .getById(sid)
      .then((student) => {
        setSelectedStudents((prev) => (prev.some((s) => s.id === student.id) ? prev : [...prev, student]));
      })
      .catch(() => {});
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!studentQuery.trim()) {
      setStudentOptions([]);
      return;
    }
    const t = setTimeout(() => {
      studentsApi
        .getAll({ q: studentQuery.trim(), limit: 20 })
        .then((data) => setStudentOptions(data))
        .catch(() => setStudentOptions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [studentQuery]);

  // Загрузить открытые пропуски для выбранных учеников при типе «Отработка»
  useEffect(() => {
    if (lessonType !== 'makeup' || selectedStudents.length === 0) {
      setOpenAbsencesByStudentId({});
      return;
    }
    const load = async () => {
      const byId: Record<number, AbsenceFollowUp[]> = {};
      await Promise.all(
        selectedStudents.map(async (s) => {
          const list = await salesApi.getAbsences({ student_id: s.id }).catch(() => []);
          const open = (list as AbsenceFollowUp[]).filter((a) => a.stage === 'missed' || a.stage === 'missed_makeup');
          byId[s.id] = open.sort(
            (a, b) => new Date(a.lesson_date).getTime() - new Date(b.lesson_date).getTime()
          );
        })
      );
      setOpenAbsencesByStudentId((prev) => ({ ...prev, ...byId }));
    };
    void load();
  }, [lessonType, selectedStudents]);

  const resetCreateForm = () => {
    setTitle('');
    setLessonDate('');
    setStartTime('');
    setEndTime('');
    setTrainerId('');
    setLessonType('makeup');
    setComment('');
    setStudentQuery('');
    setStudentOptions([]);
    setSelectedStudents([]);
    setPlannedAbsenceByStudentId({});
    setOpenAbsencesByStudentId({});
  };

  const handleCreate = async () => {
    if (!title.trim() || !lessonDate || !startTime || !trainerId || selectedStudents.length === 0) {
      setError('Заполните все обязательные поля и выберите хотя бы одного ученика');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await salesApi.createCustomLesson({
        title: title.trim(),
        lesson_date: lessonDate,
        start_time: startTime,
        end_time: endTime || null,
        trainer_id: parseInt(trainerId, 10),
        lesson_type: lessonType,
        comment: comment || null,
        students: selectedStudents.map((s) => ({
          student_id: s.id,
          planned_absence_id: plannedAbsenceByStudentId[s.id] ?? null,
        })),
      });
      setCreateOpen(false);
      resetCreateForm();
      await loadLessons();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать урок'));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      return format(parseISO(d), 'd MMM yyyy', { locale: ru });
    } catch {
      return d;
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Ручные уроки
        </Typography>

        {error && (
          <Box sx={{ mb: 2 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            type="date"
            label="С даты"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            label="По дату"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="outlined" onClick={() => void loadLessons()} disabled={loading}>
            Обновить
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Создать урок
          </Button>
        </Box>

        <Card variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Время</TableCell>
                <TableCell>Название</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell>Тренер</TableCell>
                <TableCell>Ученики</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lessons.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell>{formatDate(l.lesson_date)}</TableCell>
                  <TableCell>
                    {l.start_time}
                    {l.end_time ? ` – ${l.end_time}` : ''}
                  </TableCell>
                  <TableCell>{l.title}</TableCell>
                  <TableCell>
                    <Chip size="small" label={LESSON_TYPE_LABELS[l.lesson_type as ManualLessonType] || l.lesson_type} />
                  </TableCell>
                  <TableCell>{l.trainer_name || l.trainer_id}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {l.students.map((s: any) => (
                        <Chip key={s.id} size="small" label={s.student_name || s.student_id} sx={{ mr: 0.5, mb: 0.5 }} />
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {lessons.length === 0 && (
            <CardContent>
              <Typography color="text.secondary">Пока нет ручных уроков за выбранный период.</Typography>
            </CardContent>
          )}
        </Card>

        <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Создать ручной урок</DialogTitle>
          <DialogContent>
            <TextField
              label="Название урока *"
              fullWidth
              sx={{ mt: 1 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
              <TextField
                type="date"
                label="Дата *"
                size="small"
                value={lessonDate}
                onChange={(e) => setLessonDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="time"
                label="Время начала *"
                size="small"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="time"
                label="Время окончания"
                size="small"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
              <TextField
                label="ID тренера *"
                size="small"
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
              />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Тип урока</InputLabel>
                <Select
                  label="Тип урока"
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value as ManualLessonType)}
                >
                  <MenuItem value="makeup">Отработка</MenuItem>
                  <MenuItem value="paid_extra">Дополнительное платное</MenuItem>
                  <MenuItem value="free_trial">Бесплатное / пробное</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <TextField
              label="Комментарий"
              fullWidth
              multiline
              minRows={2}
              sx={{ mt: 2 }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Ученики *
              </Typography>
              <TextField
                label="Поиск ученика по ФИО"
                fullWidth
                size="small"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
              />
              {studentOptions.length > 0 && (
                <Box sx={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #eee', borderRadius: 1, p: 1, mt: 1 }}>
                  {studentOptions.map((s) => (
                    <Typography
                      key={s.id}
                      variant="body2"
                      sx={{
                        py: 0.5,
                        px: 1,
                        borderRadius: 1,
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: '#f5f5f5' },
                      }}
                      onClick={() => {
                        if (!selectedStudents.find((x) => x.id === s.id)) {
                          setSelectedStudents((prev) => [...prev, s]);
                        }
                      }}
                    >
                      {s.full_name || s.id}
                    </Typography>
                  ))}
                </Box>
              )}
              {selectedStudents.length > 0 && (
                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selectedStudents.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.full_name || s.id}
                      onDelete={() => {
                        setSelectedStudents((prev) => prev.filter((x) => x.id !== s.id));
                        setPlannedAbsenceByStudentId((prev) => {
                          const next = { ...prev };
                          delete next[s.id];
                          return next;
                        });
                      }}
                    />
                  ))}
                </Box>
              )}
              {lessonType === 'makeup' && selectedStudents.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Какой пропуск закрыть (по умолчанию — самый ранний)
                  </Typography>
                  {selectedStudents.map((s) => {
                    const openList = openAbsencesByStudentId[s.id] || [];
                    const raw = plannedAbsenceByStudentId[s.id];
                    const value = raw == null ? 'earliest' : raw;
                    return (
                      <Box key={s.id} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ minWidth: 120 }}>
                          {s.full_name || s.id}
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 260 }}>
                          <Select
                            value={value}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPlannedAbsenceByStudentId((prev) => ({
                                ...prev,
                                [s.id]: v === 'earliest' ? null : Number(v),
                              }));
                            }}
                            displayEmpty
                          >
                            <MenuItem value="earliest">Самый ранний</MenuItem>
                            {openList.map((a) => (
                              <MenuItem key={a.id} value={a.id}>
                                {formatDate(a.lesson_date)} ({REASON_LABELS[a.absence_reason || ''] || a.absence_reason || '—'})
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button variant="contained" onClick={() => void handleCreate()} disabled={loading}>
              Создать
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
};

export default ManualLessonsPage;

