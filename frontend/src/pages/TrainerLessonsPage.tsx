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

const WEEKDAY_NAMES = ['╨Я╨╜', '╨Т╤В', '╨б╤А', '╨з╤В', '╨Я╤В', '╨б╨▒', '╨Т╤Б'];

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
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╨╖╨░╨╜╤П╤В╨╕╤П'));
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
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨┐╨╛╤Б╨╡╤Й╨░╨╡╨╝╨╛╤Б╤В╤М'));
    } finally {
      setSaving(false);
    }
  };

  const displayDate = viewDate ? (() => {
    const d = new Date(viewDate + 'T12:00:00');
    return format(d, 'd MMMM yyyy ╨│.', { locale: ru });
  })() : '';
  const displayWeekday = viewDate ? WEEKDAY_NAMES[(new Date(viewDate + 'T12:00:00').getDay() + 6) % 7] : '';

  return (
    <Layout>
      <Stack spacing={2}>
        <Typography variant="h4">╨г╤А╨╛╨║╨╕</Typography>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
          <Button size="small" onClick={handlePrevDay}>тЖР</Button>
          <Button size="small" onClick={handleToday}>╨б╨╡╨│╨╛╨┤╨╜╤П</Button>
          <Button size="small" onClick={handleNextDay}>тЖТ</Button>
          <Typography variant="h6">{displayDate} ({displayWeekday})</Typography>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Typography color="text.secondary">╨Ч╨░╨│╤А╤Г╨╖╨║╨░...</Typography>
        ) : slots.length === 0 ? (
          <Typography color="text.secondary">
            ╨Э╨░ ╤Н╤В╤Г ╨┤╨░╤В╤Г ╨╜╨╡╤В ╨╖╨░╨╜╤П╤В╨╕╨╣ ╨┐╨╛ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤О. ╨Ф╨╛╨▒╨░╨▓╤М╤В╨╡ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╨╡ ╨▓ ╨║╨░╤А╤В╨╛╤З╨║╨╡ ╨│╤А╤Г╨┐╨┐╤Л (╨У╤А╤Г╨┐╨┐╤Л тЖТ ╨│╤А╤Г╨┐╨┐╨░ тЖТ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╨╡).
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
                      {(slot.start_time || '').slice(0, 5)} тАУ {(slot.end_time || '').slice(0, 5)}
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
                      ╨Ю╤В╨╝╨╡╤З╨╡╨╜╨╛: {slot.students.filter((s) => s.attended === true).length}/{slot.students.length}
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
          ╨Ч╨░╨╜╤П╤В╨╕╨╡: {selectedSlot?.group_name} тАФ {selectedSlot?.lesson_date && format(new Date(selectedSlot.lesson_date + 'T12:00:00'), 'd.MM.yyyy')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            ╨Ю╤В╨╝╨╡╤В╤М╤В╨╡, ╨║╤В╨╛ ╨▒╤Л╨╗ ╨╜╨░ ╨╖╨░╨╜╤П╤В╨╕╨╕
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
          <Button onClick={() => setPopupOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
          <Button variant="contained" onClick={handleSaveAttendance} disabled={saving}>
            {saving ? '╨б╨╛╤Е╤А╨░╨╜╨╡╨╜╨╕╨╡...' : '╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TrainerLessonsPage;
