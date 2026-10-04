import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Chip, Divider, Paper, Stack, Switch, Typography } from '@mui/material';
import { LegoShell } from './LegoShell';
import { cancelLesson, formatDate, getLesson, LegoLessonDetail, saveAttendance } from './legoApi';

interface Mark {
  attended: boolean;
  comment: string;
}

const LegoLessonPage: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const id = Number(lessonId);

  const [lesson, setLesson] = useState<LegoLessonDetail | null>(null);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getLesson(id)
      .then((data) => {
        setLesson(data);
        const initial: Record<number, Mark> = {};
        data.roster.forEach((r) => {
          // Новые отметки стартуют как «не пришёл»: тренер нажимает «Отметить всех» и снимает отсутствующих.
          initial[r.student_id] = { attended: r.attended ?? false, comment: r.comment ?? '' };
        });
        setMarks(initial);
      })
      .catch(() => setError('Занятие не найдено или недоступно'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const attendedCount = useMemo(() => Object.values(marks).filter((m) => m.attended).length, [marks]);
  const isCancelled = lesson?.status === 'cancelled';

  const setAll = (value: boolean) => {
    setMarks((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, attended: value }])));
  };

  const toggle = (studentId: number, attended: boolean) => {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], attended } }));
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const records = Object.entries(marks).map(([studentId, m]) => ({
        student_id: Number(studentId),
        attended: m.attended,
        comment: m.comment || null,
      }));
      const res = await saveAttendance(id, records);
      setMessage(res.message);
      load();
    } catch {
      setError('Не удалось сохранить посещаемость');
    } finally {
      setSaving(false);
    }
  };

  const onCancel = async () => {
    if (!window.confirm('Отменить занятие?')) return;
    await cancelLesson(id);
    load();
  };

  return (
    <LegoShell title={lesson ? `${lesson.group_name} · ${formatDate(lesson.lesson_date)}` : 'Занятие'}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {lesson && (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Chip
              label={isCancelled ? 'Отменено' : lesson.status === 'completed' ? 'Отмечено' : 'Запланировано'}
              color={isCancelled ? 'default' : lesson.status === 'completed' ? 'success' : 'primary'}
            />
            {lesson.start_time && <Typography variant="body2">Время: {lesson.start_time.slice(0, 5)}</Typography>}
            <Typography variant="body2" color="text.secondary">
              Пришли {attendedCount} из {lesson.roster.length}
            </Typography>
          </Stack>

          {!isCancelled && (
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
              <Button variant="outlined" onClick={() => setAll(true)} disabled={saving}>Отметить всех пришедшими</Button>
              <Button variant="outlined" onClick={() => setAll(false)} disabled={saving}>Снять все отметки</Button>
            </Stack>
          )}

          {lesson.roster.length === 0 ? (
            <Typography color="text.secondary">В составе группы на эту дату нет детей.</Typography>
          ) : (
            <Paper variant="outlined">
              {lesson.roster.map((r, index) => {
                const mark = marks[r.student_id];
                return (
                  <React.Fragment key={r.student_id}>
                    {index > 0 && <Divider />}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, gap: 2, flexWrap: 'wrap' }}>
                      <Button
                        variant="text"
                        onClick={() => navigate(`/lego/students/${r.student_id}`)}
                        sx={{ textTransform: 'none', fontSize: 16, justifyContent: 'flex-start' }}
                      >
                        {r.full_name}
                      </Button>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" color={mark?.attended ? 'success.main' : 'text.secondary'} sx={{ minWidth: 110 }}>
                          {mark?.attended ? 'Пришёл' : 'Не пришёл'}
                        </Typography>
                        <Switch
                          checked={!!mark?.attended}
                          disabled={isCancelled || saving}
                          onChange={(e) => toggle(r.student_id, e.target.checked)}
                          inputProps={{ 'aria-label': `Пришёл: ${r.full_name}` }}
                        />
                      </Stack>
                    </Stack>
                  </React.Fragment>
                );
              })}
            </Paper>
          )}

          {!isCancelled && lesson.roster.length > 0 && (
            <Stack direction="row" spacing={2} sx={{ mt: 3, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" size="large" onClick={onSave} disabled={saving}>
                Сохранить посещаемость
              </Button>
              <Button color="inherit" onClick={onCancel}>Отменить занятие</Button>
            </Stack>
          )}
        </>
      )}
    </LegoShell>
  );
};

export default LegoLessonPage;
