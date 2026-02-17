import React, { useCallback, useEffect, useState } from 'react';
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
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { Book as BookIcon, People as PeopleIcon } from '@mui/icons-material';
import { format, addDays, subDays, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { trainerLessonsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { TrainerLessonSlot } from '../types';

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const TrainerLessonsPage: React.FC = () => {
  const [viewDate, setViewDate] = useState(() => format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [slots, setSlots] = useState<TrainerLessonSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TrainerLessonSlot | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);

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
    slot.students.forEach((s) => {
      draft[s.id] = s.attended ?? true;
    });
    setAttendanceDraft(draft);
    setPopupOpen(true);
  };

  const handleSaveAttendance = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);
    try {
      await trainerLessonsApi.saveAttendance({
        group_id: selectedSlot.group_id,
        lesson_date: selectedSlot.lesson_date,
        attendances: selectedSlot.students.map((s) => ({
          student_id: s.id,
          attended: attendanceDraft[s.id] ?? true,
        })),
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

  // Занятие считается заполненным, если у всех учеников проставлена посещаемость
  const isSlotFilled = (slot: TrainerLessonSlot) =>
    slot.students.length > 0 && slot.students.every((s) => s.attended !== null && s.attended !== undefined);
  // Ближайшее к заполнению — первое по времени среди незаполненных за день
  const slotsNeedingFill = slots.filter((s) => !isSlotFilled(s));
  const nearestToFillSlot =
    slotsNeedingFill.length > 0
      ? slotsNeedingFill.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))[0]
      : null;
  const getSlotCardVariant = (slot: TrainerLessonSlot) => {
    const key = `${slot.group_id}-${slot.start_time}`;
    if (nearestToFillSlot && `${nearestToFillSlot.group_id}-${nearestToFillSlot.start_time}` === key)
      return 'nearestToFill';
    if (isSlotFilled(slot)) return 'filled';
    return 'default';
  };

  return (
    <Layout>
      <Stack spacing={2}>
        <Typography variant="h4">Уроки</Typography>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
          <Button size="small" onClick={handlePrevDay}>←</Button>
          <Button size="small" onClick={handleToday}>Сегодня</Button>
          <Button size="small" onClick={handleNextDay}>→</Button>
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
            {slots.map((slot) => {
              const variant = getSlotCardVariant(slot);
              const slotKey = `${slot.group_id}-${slot.start_time}`;
              const isNearestToFill = variant === 'nearestToFill';
              const isFilled = variant === 'filled';
              return (
              <Card
                key={slotKey}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  borderLeft: '4px solid',
                  ...(isNearestToFill && {
                    borderLeftColor: 'warning.main',
                    bgcolor: (t) => (t.palette.mode === 'light' ? 'rgba(255, 167, 38, 0.12)' : 'rgba(255, 167, 38, 0.15)'),
                    '&:hover': { bgcolor: (t) => (t.palette.mode === 'light' ? 'rgba(255, 167, 38, 0.18)' : 'rgba(255, 167, 38, 0.22)' ) },
                  }),
                  ...(isFilled && {
                    borderLeftColor: 'success.main',
                    bgcolor: (t) => t.palette.mode === 'light' ? 'rgba(46, 125, 50, 0.06)' : 'rgba(102, 187, 106, 0.12)',
                    '&:hover': { bgcolor: (t) => t.palette.mode === 'light' ? 'rgba(46, 125, 50, 0.1)' : 'rgba(102, 187, 106, 0.18)' },
                  }),
                  ...(!isNearestToFill && !isFilled && {
                    borderLeftColor: 'primary.main',
                    '&:hover': { bgcolor: 'action.hover' },
                  }),
                }}
                onClick={() => openPopup(slot)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    {isNearestToFill && (
                      <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
                        Нужно заполнить
                      </Typography>
                    )}
                    {isFilled && (
                      <Typography variant="caption" sx={{ color: 'success.dark', fontWeight: 600 }}>
                        Заполнено
                      </Typography>
                    )}
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
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                    <PeopleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      {slot.students.map((s) => s.full_name).join(', ')}
                    </Typography>
                  </Stack>
                  {slot.students.some((s) => s.attended !== null && s.attended !== undefined) && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Отмечено: {slot.students.filter((s) => s.attended === true).length}/{slot.students.length}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            );
            })}
          </Box>
        )}
      </Stack>

      <Dialog open={popupOpen} onClose={() => setPopupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Занятие: {selectedSlot?.group_name} — {selectedSlot?.lesson_date && format(new Date(selectedSlot.lesson_date + 'T12:00:00'), 'd.MM.yyyy')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Отметьте, кто был на занятии
          </Typography>
          <Stack spacing={0.5}>
            {selectedSlot?.students.map((student) => (
              <FormControlLabel
                key={student.id}
                control={
                  <Checkbox
                    checked={attendanceDraft[student.id] ?? true}
                    onChange={(e) =>
                      setAttendanceDraft((prev) => ({ ...prev, [student.id]: e.target.checked }))
                    }
                  />
                }
                label={student.full_name}
              />
            ))}
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
