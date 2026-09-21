import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, List, ListItemButton, ListItemText, MenuItem, Paper, Select,
  Snackbar, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { Publish as PublishIcon, UnpublishedOutlined as UnpublishIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole, hasPermission } from '../utils/permissions';
import {
  CodelabCourse, CodelabCourseAnalytics, CodelabLearningItem, CodelabSubmissionReview,
  CodelabSystemStatus, codelabStudioApi as api,
} from '../services/codelabApi';

type Toast = { msg: string; err?: boolean } | null;
type TabKey = 'courses' | 'submissions' | 'analytics' | 'status';

/** Студия методиста (создание/публикация курсов), кабинет преподавателя
 * (просмотр и оценка посылок), аналитика курса и эксплуатационный статус
 * (ADM-004, только admin/owner) — всё через прокси в Codelab, из своего
 * аккаунта портала, по образцу PixelForge/Kodex (см. README интеграции). */
export default function CodelabStudioPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'codelab.manage');
  const isAdmin = ['admin', 'owner'].includes(getEffectiveRole(user) || '');
  const [tab, setTab] = useState<TabKey>(canManage ? 'courses' : 'submissions');
  const [toast, setToast] = useState<Toast>(null);

  return (
    <Layout>
      <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Codelab</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          {canManage && <Tab value="courses" label="Курсы" />}
          <Tab value="submissions" label="Посылки учеников" />
          <Tab value="analytics" label="Аналитика" />
          {isAdmin && <Tab value="status" label="Статус" />}
        </Tabs>
        {tab === 'courses' && canManage && <CoursesTab onToast={setToast} />}
        {tab === 'submissions' && <SubmissionsTab onToast={setToast} />}
        {tab === 'analytics' && <AnalyticsTab onToast={setToast} />}
        {tab === 'status' && isAdmin && <StatusTab onToast={setToast} />}
      </Box>
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.err ? 'error' : 'success'}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Layout>
  );
}

// ─────────────────────────── Курсы (методист) ───────────────────────────

function CoursesTab({ onToast }: { onToast: (t: Toast) => void }) {
  const [courses, setCourses] = useState<CodelabCourse[]>([]);
  const [selected, setSelected] = useState<CodelabCourse | null>(null);
  const [tree, setTree] = useState<CodelabLearningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [itemDialog, setItemDialog] = useState<'theory' | 'task' | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemContent, setItemContent] = useState('');
  const [testsText, setTestsText] = useState('2 3=>5');

  const loadCourses = () => api.listCourses().then(setCourses).catch((e) => onToast({ msg: e.message, err: true }));

  useEffect(() => { loadCourses(); }, []);

  const selectCourse = async (c: CodelabCourse) => {
    setSelected(c);
    setLoading(true);
    try {
      setTree(await api.getTree(c.id));
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    } finally {
      setLoading(false);
    }
  };

  const createCourse = async () => {
    try {
      const course = await api.createCourse({ title: newTitle });
      setCreateOpen(false);
      setNewTitle('');
      onToast({ msg: 'Курс создан' });
      await loadCourses();
      selectCourse(course);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const addTheoryItem = async () => {
    if (!selected) return;
    try {
      await api.createItem(selected.id, { type: 'theory', title: itemTitle, content: itemContent, position: tree.length });
      setItemDialog(null);
      setItemTitle('');
      setItemContent('');
      onToast({ msg: 'Материал добавлен' });
      selectCourse(selected);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const addTaskItem = async () => {
    if (!selected) return;
    try {
      const tests = testsText.split('\n').filter(Boolean).map((line) => {
        const [input, expected] = line.split('=>');
        return { input: `${(input || '').trim()}\n`, expected: `${(expected || '').trim()}\n` };
      });
      const task = await api.createTask(selected.id, { title: itemTitle, tests });
      await api.createItem(selected.id, { type: 'task', title: itemTitle, problem_revision_id: task.id, position: tree.length });
      setItemDialog(null);
      setItemTitle('');
      setTestsText('2 3=>5');
      onToast({ msg: 'Задача добавлена' });
      selectCourse(selected);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const publish = async () => {
    if (!selected) return;
    try {
      const updated = await api.publishCourse(selected.id);
      onToast({ msg: 'Курс опубликован' });
      setSelected(updated);
      await loadCourses();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const unpublish = async () => {
    if (!selected) return;
    try {
      const updated = await api.unpublishCourse(selected.id);
      onToast({ msg: 'Курс снят с публикации' });
      setSelected(updated);
      await loadCourses();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  return (
    <Stack direction="row" spacing={3}>
      <Paper variant="outlined" sx={{ width: 260, flexShrink: 0, p: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2">Курсы</Typography>
          <Button size="small" onClick={() => setCreateOpen(true)}>+ Новый</Button>
        </Stack>
        <List dense>
          {courses.map((c) => (
            <ListItemButton key={c.id} selected={selected?.id === c.id} onClick={() => selectCourse(c)}>
              <ListItemText
                primary={c.title}
                secondary={<Chip size="small" label={c.status} color={c.status === 'published' ? 'success' : 'default'} />}
              />
            </ListItemButton>
          ))}
          {courses.length === 0 && <Typography variant="caption" color="text.secondary">Пока нет курсов</Typography>}
        </List>
      </Paper>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {!selected && <Typography color="text.secondary">Выберите курс слева или создайте новый.</Typography>}
        {selected && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">{selected.title}</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => setItemDialog('theory')}>+ Материал</Button>
                <Button size="small" variant="outlined" onClick={() => setItemDialog('task')}>+ Задача</Button>
                {selected.status === 'published' ? (
                  <Button size="small" startIcon={<UnpublishIcon />} onClick={unpublish}>Снять с публикации</Button>
                ) : (
                  <Button size="small" variant="contained" startIcon={<PublishIcon />} onClick={publish}>Опубликовать</Button>
                )}
              </Stack>
            </Stack>

            {loading ? <CircularProgress size={24} /> : (
              <Stack spacing={1}>
                {tree.map((item) => (
                  <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Chip size="small" label={item.type} sx={{ mr: 1 }} />
                    {item.title}
                  </Paper>
                ))}
                {tree.length === 0 && <Typography variant="caption" color="text.secondary">В черновике пока пусто.</Typography>}
              </Stack>
            )}
          </>
        )}
      </Box>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogTitle>Новый курс</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Название" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={!newTitle.trim()} onClick={createCourse}>Создать</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={itemDialog === 'theory'} onClose={() => setItemDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Новый материал</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Заголовок" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth multiline rows={6} label="Текст (Markdown)" value={itemContent} onChange={(e) => setItemContent(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!itemTitle.trim()} onClick={addTheoryItem}>Добавить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={itemDialog === 'task'} onClose={() => setItemDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Новая задача (Python, stdin/stdout)</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Название" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <TextField
            fullWidth multiline rows={5} label="Тесты — по одному на строку: вход=>ожидаемый вывод"
            value={testsText} onChange={(e) => setTestsText(e.target.value)} helperText="Пример: 2 3=>5"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!itemTitle.trim()} onClick={addTaskItem}>Добавить</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ────────────────────── Посылки учеников (преподаватель) ──────────────────────

function SubmissionsTab({ onToast }: { onToast: (t: Toast) => void }) {
  const { user } = useAuth();
  const canRerun = hasPermission(user, 'codelab.manage'); // TASK-007 — авторское действие, не тренеру
  const [courses, setCourses] = useState<CodelabCourse[]>([]);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [submissions, setSubmissions] = useState<CodelabSubmissionReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState<CodelabSubmissionReview | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeComment, setGradeComment] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.listCourses()
      .then((cs) => setCourses(cs.filter((c) => c.status === 'published')))
      .catch((e) => onToast({ msg: e.message, err: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSubmissions = async (id: number) => {
    setLoading(true);
    setSelected(new Set());
    try {
      setSubmissions(await api.listSubmissions(id));
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const rerunSelected = async () => {
    if (!courseId || selected.size === 0) return;
    try {
      const res = await api.rerunSubmissions(courseId, Array.from(selected));
      onToast({ msg: `Поставлено в очередь: ${res.requeued}` });
      loadSubmissions(courseId);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const submitGrade = async () => {
    if (!grading || !courseId) return;
    try {
      await api.gradeSubmission(courseId, grading.submission_id, Number(gradeScore), gradeComment);
      onToast({ msg: 'Оценка сохранена' });
      setGrading(null);
      if (courseId) loadSubmissions(courseId);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  return (
    <Box>
      <Select
        size="small"
        displayEmpty
        value={courseId}
        onChange={(e) => {
          const id = e.target.value as number;
          setCourseId(id);
          loadSubmissions(id);
        }}
        sx={{ minWidth: 260, mb: 2 }}
      >
        <MenuItem value="" disabled>Выберите опубликованный курс</MenuItem>
        {courses.map((c) => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
      </Select>

      {canRerun && courseId && (
        <Button
          size="small"
          variant="outlined"
          disabled={selected.size === 0}
          onClick={rerunSelected}
          sx={{ ml: 2, mb: 2 }}
        >
          Перепроверить выбранные ({selected.size})
        </Button>
      )}

      {loading ? <CircularProgress size={24} /> : courseId && (
        <Table size="small">
          <TableHead>
            <TableRow>
              {canRerun && <TableCell padding="checkbox" />}
              <TableCell>Ученик</TableCell>
              <TableCell>Задача</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Балл</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {submissions.map((s) => (
              <TableRow key={s.submission_id}>
                {canRerun && (
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(s.submission_id)} onChange={() => toggleSelected(s.submission_id)} />
                  </TableCell>
                )}
                <TableCell>{s.student_full_name}</TableCell>
                <TableCell>{s.item_title}</TableCell>
                <TableCell>{s.verdict || s.status}</TableCell>
                <TableCell>
                  {s.manual_score_override !== null ? `${s.manual_score_override} (ручная)` : s.score ?? '—'}
                  {s.manual_comment && (
                    <Typography variant="caption" color="text.secondary" display="block">{s.manual_comment}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Button size="small" onClick={() => { setGrading(s); setGradeScore(String(s.score ?? '')); setGradeComment(''); }}>
                    Оценить
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {submissions.length === 0 && (
              <TableRow><TableCell colSpan={canRerun ? 6 : 5}><Typography variant="caption" color="text.secondary">Посылок пока нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!grading} onClose={() => setGrading(null)} fullWidth maxWidth="sm">
        <DialogTitle>Ручная оценка — {grading?.student_full_name}</DialogTitle>
        <DialogContent>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, maxHeight: 200, overflow: 'auto' }}>
            <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {grading?.code}
            </Typography>
          </Paper>
          <TextField
            fullWidth type="number" label="Балл" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} sx={{ mb: 2 }}
          />
          <TextField
            fullWidth multiline rows={3} label="Комментарий (обязателен)" value={gradeComment}
            onChange={(e) => setGradeComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGrading(null)}>Отмена</Button>
          <Button variant="contained" disabled={!gradeComment.trim() || gradeScore === ''} onClick={submitGrade}>Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─────────────────────────── Аналитика (ANA-001/002/005) ───────────────────────

function AnalyticsTab({ onToast }: { onToast: (t: Toast) => void }) {
  const [courses, setCourses] = useState<CodelabCourse[]>([]);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [data, setData] = useState<CodelabCourseAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listCourses()
      .then((cs) => setCourses(cs.filter((c) => c.status === 'published')))
      .catch((e) => onToast({ msg: e.message, err: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id: number) => {
    setCourseId(id);
    setLoading(true);
    try {
      setData(await api.getAnalytics(id));
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Select
        size="small"
        displayEmpty
        value={courseId}
        onChange={(e) => load(e.target.value as number)}
        sx={{ minWidth: 260, mb: 2 }}
      >
        <MenuItem value="" disabled>Выберите опубликованный курс</MenuItem>
        {courses.map((c) => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
      </Select>

      {loading && <CircularProgress size={24} />}

      {data && !loading && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Данные на {new Date(data.generated_at).toLocaleString('ru-RU')}
          </Typography>

          <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 3 }}>
            {[
              ['Зачислено', data.overview.enrolled_count],
              ['Завершили', `${data.overview.completed_count} (${data.overview.completion_percent}%)`],
              ['Средний балл', data.overview.avg_score],
              ['Медианный балл', data.overview.median_score],
              ['Всего попыток', data.overview.total_attempts],
              ['Просрочено', data.overview.overdue_count],
            ].map(([label, value]) => (
              <Paper key={label as string} variant="outlined" sx={{ p: 1.5, minWidth: 140 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h6">{value}</Typography>
              </Paper>
            ))}
          </Stack>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Рейтинг задач по сложности</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Задача</TableCell>
                <TableCell>Пытались</TableCell>
                <TableCell>Решили</TableCell>
                <TableCell>Отказались</TableCell>
                <TableCell>Доля ошибок</TableCell>
                <TableCell>Ср. попыток до решения</TableCell>
                <TableCell>Частая ошибка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.tasks.map((t) => (
                <TableRow key={t.item_id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell>{t.students_attempted}</TableCell>
                  <TableCell>{t.students_solved}</TableCell>
                  <TableCell>{t.students_not_attempted}</TableCell>
                  <TableCell>{t.failure_rate_percent}%</TableCell>
                  <TableCell>{t.avg_attempts_to_solve ?? '—'}</TableCell>
                  <TableCell>{t.most_common_failure_verdict ?? '—'}</TableCell>
                </TableRow>
              ))}
              {data.tasks.length === 0 && (
                <TableRow><TableCell colSpan={7}><Typography variant="caption" color="text.secondary">Нет задач или посылок</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </Box>
  );
}

// ─────────────────────────── Статус (ADM-004, admin/owner) ─────────────────────

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} ГБ`;
  return `${(bytes / (1024 ** 2)).toFixed(1)} МБ`;
}

function StatusTab({ onToast }: { onToast: (t: Toast) => void }) {
  const [status, setStatus] = useState<CodelabSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getSystemStatus()
      .then(setStatus)
      .catch((e) => onToast({ msg: e.message, err: true }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <CircularProgress size={24} />;
  if (!status) return null;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Данные на {new Date(status.generated_at).toLocaleString('ru-RU')}
        </Typography>
        <Button size="small" onClick={load}>Обновить</Button>
      </Stack>

      {status.queue.worker_likely_stalled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Самая старая посылка в очереди ждёт больше 5 минут — похоже, воркер (`python -m app.worker`) не запущен или завис.
        </Alert>
      )}
      {status.errors.system_errors_last_24h > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Системных ошибок проверки за 24 часа: {status.errors.system_errors_last_24h}.
        </Alert>
      )}

      <Stack direction="row" spacing={2} flexWrap="wrap">
        {[
          ['В очереди', status.queue.queued_count],
          ['Выполняется', status.queue.running_count],
          ['Ожидание самой старой (сек)', status.queue.oldest_queued_age_seconds ?? '—'],
          ['Ошибок за 24ч', status.errors.system_errors_last_24h],
          ['Загрузки на диске', formatBytes(status.storage.uploads_size_bytes)],
          ['Свободно места', formatBytes(status.storage.disk_free_bytes)],
        ].map(([label, value]) => (
          <Paper key={label as string} variant="outlined" sx={{ p: 1.5, minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h6">{value}</Typography>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
