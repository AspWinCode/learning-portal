import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Book as BookIcon, People as PeopleIcon } from '@mui/icons-material';
import { format, addDays, subDays, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { trainerLessonsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { TrainerLessonSlot, AbsenceReason } from '../types';

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const ABSENCE_REASONS: { value: AbsenceReason; label: string }[] = [
  { value: 'was', label: 'Был' },
  { value: 'not_was', label: 'Не был' },
  { value: 'sick', label: 'Болел' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'event', label: 'Мероприятие' },
  { value: 'other', label: 'Другое' },
];

const TrainerLessonsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [viewDate, setViewDate] = useState(() => format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [slots, setSlots] = useState<TrainerLessonSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TrainerLessonSlot | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<number, boolean>>({});
  const [lateDraft, setLateDraft] = useState<Record<number, boolean>>({});
  const [absenceReasonDraft, setAbsenceReasonDraft] = useState<Record<number, AbsenceReason>>({});
  const [absenceCommentDraft, setAbsenceCommentDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setViewDate(dateParam);
    }
  }, [searchParams]);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await trainerLessonsApi.getForDate(viewDate);
      setSlots(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить занятия'));
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [viewDate]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handlePrevDay = () => setViewDate((d) => format(subDays(new Date(d), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setViewDate((d) => format(addDays(new Date(d), 1), 'yyyy-MM-dd'));
  const handleToday = () => setViewDate(format(startOfDay(new Date()), 'yyyy-MM-dd'));

  const openPopup = (slot: TrainerLessonSlot) => {
    setSelectedSlot(slot);
    const draft: Record<number, boolean> = {};
    const late: Record<number, boolean> = {};
    const reasonDraft: Record<number, AbsenceReason> = {};
    const commentDraft: Record<number, string> = {};
    slot.students.forEach((s) => {
      const attended = s.attended ?? true;
      draft[s.id] = attended;
      late[s.id] = !!s.late;
      reasonDraft[s.id] = (s.absence_reason as AbsenceReason) || (attended ? 'was' : 'not_was');
      commentDraft[s.id] = s.absence_comment || '';
    });
    setAttendanceDraft(draft);
    setLateDraft(late);
    setAbsenceReasonDraft(reasonDraft);
    setAbsenceCommentDraft(commentDraft);
    setPopupOpen(true);
  };

  const handleSaveAttendance = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);
    try {
      const reason = absenceReasonDraft;
      await trainerLessonsApi.saveAttendance({
        group_id: selectedSlot.group_id,
        lesson_date: selectedSlot.lesson_date,
        attendances: selectedSlot.students.map((s) => {
          const r = reason[s.id] ?? 'was';
          const attended = r === 'was';
          return {
            student_id: s.id,
            attended,
            late: lateDraft[s.id] ?? false,
            absence_reason: r,
            absence_comment: r === 'other' ? (absenceCommentDraft[s.id] || undefined) : undefined,
          };
        }),
      });
      setPopupOpen(false);
      setSelectedSlot(null);
      loadSlots();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить посещаемость'));
    } finally {
      setSaving(false);
    }
  };

  const displayDate = viewDate ? (() => {
    const d = new Date(viewDate + 'T12:00:00');
    return format(d, 'd MMMM yyyy г.', { locale: ru });
  })() : '';
  const displayWeekday = viewDate ? WEEKDAY_NAMES[(new Date(viewDate + 'T12:00:00').getDay() + 6) % 7] : '';

  return (
    <Layout>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="h4">Уроки</Typography>
          <Typography component="span" variant="caption" sx={{ color: 'text.secondary', alignSelf: 'flex-end', pb: 0.5 }}>
            (обновлено 19.02.2026)
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
          <Button size="small" onClick={handlePrevDay}>{'<'}</Button>
          <Button size="small" onClick={handleToday}>Сегодня</Button>
          <Button size="small" onClick={handleNextDay}>{'>'}</Button>
          <Typography variant="h6">{displayDate} ({displayWeekday})</Typography>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Typography color="text.secondary">Загрузка...</Typography>
        ) : slots.length === 0 ? (
          <Typography color="text.secondary">
            На эту дату нет занятий по расписанию. Добавьте расписание в карточке группы (Группы → группа → расписание).
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {slots.map((slot) => (
              <Card
                key={`${slot.group_id}-${slot.start_time}`}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  borderLeft: '4px solid',
                  borderLeftColor: 'primary.main',
                }}
                onClick={() => openPopup(slot)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="subtitle2" color="primary">
                      {(slot.start_time || '').slice(0, 5)} – {(slot.end_time || '').slice(0, 5)}
                    </Typography>
                    {slot.program_name && (
                      <>
                        <BookIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {slot.program_name}
                        </Typography>
                      </>
                    )}
                  </Stack>
                  <Typography variant="subtitle1" sx={{ mt: 0.5 }}>
                    {slot.group_name}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap">
                    <PeopleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      {slot.students.map((s) => (s.freeze_badge ? `${s.full_name} (${s.freeze_badge})` : s.full_name)).join(', ')}
                    </Typography>
                  </Stack>
                  {slot.students.some((s) => s.attended !== null && s.attended !== undefined) && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Отмечено: {slot.students.filter((s) => s.attended === true).length}/{slot.students.length}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Stack>

      <Dialog open={popupOpen} onClose={() => setPopupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Занятие: {selectedSlot?.group_name} — {selectedSlot?.lesson_date && format(new Date(selectedSlot.lesson_date + 'T12:00:00'), 'd.MM.yyyy')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Статус каждого ученика: Был / причина отсутствия (ТЗ п.3.1)
          </Typography>
          <Stack spacing={1.5}>
            {selectedSlot?.students.map((student) => {
              const reason = absenceReasonDraft[student.id] ?? 'was';
              const isPresent = reason === 'was';
              return (
                <Stack key={student.id} spacing={0.5}>
                  <Stack direction="row" alignItems="center" flexWrap="wrap" spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel>Статус</InputLabel>
                      <Select
                        value={reason}
                        label="Статус"
                        onChange={(e) => {
                          const v = e.target.value as AbsenceReason;
                          setAbsenceReasonDraft((p) => ({ ...p, [student.id]: v }));
                          setAttendanceDraft((p) => ({ ...p, [student.id]: v === 'was' }));
                        }}
                      >
                        {ABSENCE_REASONS.map((r) => (
                          <MenuItem key={r.value} value={r.value}>
                            {r.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography variant="body2">{student.full_name}</Typography>
                    {student.freeze_badge && (
                      <Typography variant="caption" color="info.main">
                        {student.freeze_badge}
                      </Typography>
                    )}
                  </Stack>
                  {!isPresent && (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={lateDraft[student.id] ?? false}
                            onChange={(e) =>
                              setLateDraft((prev) => ({ ...prev, [student.id]: e.target.checked }))
                            }
                          />
                        }
                        label="Опоздает / в пути"
                      />
                      {reason === 'other' && (
                        <TextField
                          size="small"
                          placeholder="Комментарий"
                          value={absenceCommentDraft[student.id] ?? ''}
                          onChange={(e) =>
                            setAbsenceCommentDraft((p) => ({ ...p, [student.id]: e.target.value }))
                          }
                          sx={{ minWidth: 200 }}
                        />
                      )}
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPopupOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveAttendance} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TrainerLessonsPage;
