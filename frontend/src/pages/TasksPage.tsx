import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  RadioGroup,
  Radio,
} from '@mui/material';
import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandLess,
  ExpandMore,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { tasksApi, studentsApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { extractApiError } from '../utils/extractApiError';
import type { TaskTemplateResponse, TaskResponse, TaskSubtaskResponse, RepeatFrequency, RepeatEndType } from '../types';
import type { Student } from '../types';

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const isAdminOrOwner = user?.role === 'admin' || user?.role === 'owner';
  const isSales = user?.role === 'sales';

  const [templates, setTemplates] = useState<TaskTemplateResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | ''>('active');
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateEditId, setTemplateEditId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubtasks, setTemplateSubtasks] = useState<{ text: string; order: number }[]>([]);
  const [templateStudentIds, setTemplateStudentIds] = useState<number[]>([]);
  const [templateRepeatEnabled, setTemplateRepeatEnabled] = useState(false);
  const [templateRepeatFrequency, setTemplateRepeatFrequency] = useState<RepeatFrequency | ''>('');
  const [templateRepeatDays, setTemplateRepeatDays] = useState<number[]>([]);
  const [templateRepeatEndType, setTemplateRepeatEndType] = useState<RepeatEndType>('never');
  const [templateRepeatEndAfterCount, setTemplateRepeatEndAfterCount] = useState<number>(1);
  const [templateRepeatEndUntil, setTemplateRepeatEndUntil] = useState<string>('');
  const [templateSaving, setTemplateSaving] = useState(false);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTemplateId, setTaskTemplateId] = useState<number | ''>('');
  const [taskSubtasks, setTaskSubtasks] = useState<{ text: string; order: number }[]>([]);
  const [taskStudentIds, setTaskStudentIds] = useState<number[]>([]);
  const [taskRepeatEnabled, setTaskRepeatEnabled] = useState(false);
  const [taskRepeatFrequency, setTaskRepeatFrequency] = useState<RepeatFrequency | ''>('');
  const [taskRepeatDays, setTaskRepeatDays] = useState<number[]>([]);
  const [taskRepeatEndType, setTaskRepeatEndType] = useState<RepeatEndType>('never');
  const [taskRepeatEndAfterCount, setTaskRepeatEndAfterCount] = useState<number>(1);
  const [taskRepeatEndUntil, setTaskRepeatEndUntil] = useState<string>('');
  const [taskSaving, setTaskSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    if (!isAdminOrOwner) return;
    try {
      const data = await tasksApi.listTemplates();
      setTemplates(data);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить шаблоны'));
    }
  }, [isAdminOrOwner]);

  const loadTasks = useCallback(async () => {
    try {
      const data = await tasksApi.listTasks(statusFilter || undefined);
      setTasks(data);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить задачи'));
    }
  }, [statusFilter]);

  const loadStudents = useCallback(async () => {
    if (!isAdminOrOwner) return;
    try {
      const data = await studentsApi.getAll();
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      setStudents([]);
    }
  }, [isAdminOrOwner]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      await Promise.all([loadTasks(), loadTemplates(), loadStudents()]);
      setLoading(false);
    };
    run();
  }, [loadTasks, loadTemplates, loadStudents]);

  const handleSubtaskToggle = async (task: TaskResponse, subtask: TaskSubtaskResponse) => {
    try {
      await tasksApi.updateSubtask(task.id, subtask.id, { completed: !subtask.completed });
      await loadTasks();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось обновить подзадачу'));
    }
  };

  const openTemplateDialog = (t?: TaskTemplateResponse) => {
    setTemplateEditId(t?.id ?? null);
    setTemplateName(t?.name ?? '');
    setTemplateSubtasks(t?.subtasks?.map((s) => ({ text: s.text, order: s.order })) ?? [{ text: '', order: 0 }]);
    setTemplateStudentIds(t?.student_ids ?? []);
    setTemplateRepeatEnabled(t?.repeat_enabled ?? false);
    setTemplateRepeatFrequency((t?.repeat_frequency as RepeatFrequency) ?? '');
    setTemplateRepeatDays(t?.repeat_days ?? []);
    setTemplateRepeatEndType((t?.repeat_end_type as RepeatEndType) ?? 'never');
    setTemplateRepeatEndAfterCount(t?.repeat_end_after_count ?? 1);
    setTemplateRepeatEndUntil(t?.repeat_end_until ? t.repeat_end_until.slice(0, 10) : '');
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    setTemplateSaving(true);
    setError(null);
    try {
      const subtasks = templateSubtasks.filter((s) => s.text.trim());
      const repeatPayload = {
        repeat_enabled: templateRepeatEnabled,
        repeat_frequency: templateRepeatEnabled && templateRepeatFrequency ? templateRepeatFrequency : undefined,
        repeat_days: templateRepeatEnabled && templateRepeatDays.length > 0 ? templateRepeatDays : undefined,
        repeat_end_type: templateRepeatEnabled ? templateRepeatEndType : undefined,
        repeat_end_after_count: templateRepeatEnabled && templateRepeatEndType === 'after_count' ? templateRepeatEndAfterCount : undefined,
        repeat_end_until: templateRepeatEnabled && templateRepeatEndType === 'until_date' && templateRepeatEndUntil ? templateRepeatEndUntil : undefined,
      };
      if (templateEditId) {
        await tasksApi.updateTemplate(templateEditId, {
          name: templateName.trim(),
          subtasks: subtasks.map((s, i) => ({ text: s.text.trim(), order: i })),
          student_ids: templateStudentIds,
          ...repeatPayload,
        });
      } else {
        await tasksApi.createTemplate({
          name: templateName.trim(),
          subtasks: subtasks.map((s, i) => ({ text: s.text.trim(), order: i })),
          student_ids: templateStudentIds,
          ...repeatPayload,
        });
      }
      setTemplateDialogOpen(false);
      loadTemplates();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить шаблон'));
    } finally {
      setTemplateSaving(false);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!window.confirm('Удалить шаблон?')) return;
    try {
      await tasksApi.deleteTemplate(id);
      loadTemplates();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить шаблон'));
    }
  };

  const openTaskDialog = (task?: TaskResponse, templateId?: number) => {
    setTaskEditId(task?.id ?? null);
    setTaskTitle(task?.title ?? '');
    setTaskTemplateId(task?.template_id ?? templateId ?? '');
    setTaskSubtasks(task?.subtasks?.map((s) => ({ text: s.text, order: s.order })) ?? []);
    setTaskStudentIds(task?.student_ids ?? []);
    setTaskRepeatEnabled(task?.repeat_enabled ?? false);
    setTaskRepeatFrequency((task?.repeat_frequency as RepeatFrequency) ?? '');
    setTaskRepeatDays(task?.repeat_days ?? []);
    setTaskRepeatEndType((task?.repeat_end_type as RepeatEndType) ?? 'never');
    setTaskRepeatEndAfterCount(task?.repeat_end_after_count ?? 1);
    setTaskRepeatEndUntil(task?.repeat_end_until ? task.repeat_end_until.slice(0, 10) : '');
    setTaskDialogOpen(true);
  };

  const saveTask = async () => {
    setTaskSaving(true);
    setError(null);
    try {
      const subtasks = taskSubtasks.filter((s) => s.text.trim());
      const taskRepeatPayload = {
        repeat_enabled: taskRepeatEnabled,
        repeat_frequency: taskRepeatEnabled && taskRepeatFrequency ? taskRepeatFrequency : undefined,
        repeat_days: taskRepeatEnabled && taskRepeatDays.length > 0 ? taskRepeatDays : undefined,
        repeat_end_type: taskRepeatEnabled ? taskRepeatEndType : undefined,
        repeat_end_after_count: taskRepeatEnabled && taskRepeatEndType === 'after_count' ? taskRepeatEndAfterCount : undefined,
        repeat_end_until: taskRepeatEnabled && taskRepeatEndType === 'until_date' && taskRepeatEndUntil ? taskRepeatEndUntil : undefined,
      };
      if (taskEditId) {
        await tasksApi.updateTask(taskEditId, {
          title: taskTitle.trim(),
          student_ids: taskStudentIds,
          ...taskRepeatPayload,
        });
      } else {
        await tasksApi.createTask({
          title: taskTitle.trim() || undefined,
          template_id: taskTemplateId || undefined,
          subtasks: taskTemplateId ? undefined : (subtasks.length ? subtasks.map((s, i) => ({ text: s.text.trim(), order: i })) : undefined),
          student_ids: taskStudentIds,
          ...taskRepeatPayload,
        });
      }
      setTaskDialogOpen(false);
      loadTasks();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить задачу'));
    } finally {
      setTaskSaving(false);
    }
  };

  const archiveTask = async (id: number) => {
    try {
      await tasksApi.updateTask(id, { status: 'archived' });
      loadTasks();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось архивировать'));
    }
  };

  const deleteTask = async (id: number) => {
    if (!window.confirm('Удалить задачу?')) return;
    try {
      await tasksApi.deleteTask(id);
      loadTasks();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить задачу'));
    }
  };

  const addTemplateSubtask = () => setTemplateSubtasks((prev) => [...prev, { text: '', order: prev.length }]);
  const addTaskSubtask = () => setTaskSubtasks((prev) => [...prev, { text: '', order: prev.length }]);

  useEffect(() => {
    if (!taskDialogOpen || !taskTemplateId || taskEditId) return;
    const t = templates.find((x) => x.id === taskTemplateId);
    if (t) {
      setTaskTitle(t.name);
      setTaskStudentIds(t.student_ids ?? []);
      setTaskSubtasks(t.subtasks?.map((s) => ({ text: s.text, order: s.order })) ?? []);
      setTaskRepeatEnabled(t.repeat_enabled ?? false);
      setTaskRepeatFrequency((t.repeat_frequency as RepeatFrequency) ?? '');
      setTaskRepeatDays(t.repeat_days ?? []);
      setTaskRepeatEndType((t.repeat_end_type as RepeatEndType) ?? 'never');
      setTaskRepeatEndAfterCount(t.repeat_end_after_count ?? 1);
      setTaskRepeatEndUntil(t.repeat_end_until ? t.repeat_end_until.slice(0, 10) : '');
    }
  }, [taskTemplateId, taskDialogOpen, taskEditId, templates]);

  return (
    <Layout>
      <Stack spacing={2}>
        <Typography variant="h4">Задачи</Typography>

        {isAdminOrOwner && (
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Задачи" />
            <Tab label="Шаблоны задач" />
          </Tabs>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <Typography color="text.secondary">Загрузка...</Typography>
        ) : tab === 1 && isAdminOrOwner ? (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Шаблоны</Typography>
              <Button startIcon={<AddIcon />} variant="contained" onClick={() => openTemplateDialog()}>
                Создать шаблон
              </Button>
            </Stack>
            {templates.length === 0 ? (
              <Typography color="text.secondary">Нет шаблонов. Создайте шаблон с названием, подзадачами и учениками.</Typography>
            ) : (
              <Stack spacing={1}>
                {templates.map((t) => (
                  <Card key={t.id} variant="outlined">
                    <CardContent>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                        <Typography variant="subtitle1">{t.name}</Typography>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" onClick={() => openTemplateDialog(t)} title="Редактировать">
                            <EditIcon />
                          </IconButton>
                          <IconButton size="small" onClick={() => deleteTemplate(t.id)} color="error" title="Удалить">
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </Stack>
                      {t.subtasks?.length > 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Подзадачи: {t.subtasks.map((s) => s.text).join(', ')}
                        </Typography>
                      )}
                      {t.student_ids?.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Ученики: {t.student_ids.length}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        ) : (
          <Box>
            {isAdminOrOwner && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Button size="small" variant={statusFilter === 'active' ? 'contained' : 'outlined'} onClick={() => setStatusFilter('active')}>
                  Активные
                </Button>
                <Button size="small" variant={statusFilter === 'archived' ? 'contained' : 'outlined'} onClick={() => setStatusFilter('archived')}>
                  Архив
                </Button>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => openTaskDialog(undefined)} sx={{ ml: 2 }}>
                  Создать задачу
                </Button>
                <Button size="small" variant="outlined" onClick={() => openTaskDialog(undefined, templates[0]?.id)}>
                  Из шаблона
                </Button>
              </Stack>
            )}

            {tasks.length === 0 ? (
              <Typography color="text.secondary">Нет задач.</Typography>
            ) : (
              <Stack spacing={1}>
                {tasks.map((task) => (
                  <Card key={task.id} variant="outlined">
                    <ListItemButton
                      onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      sx={{ py: 1 }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                        {expandedTaskId === task.id ? <ExpandLess /> : <ExpandMore />}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1">{task.title}</Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Chip size="small" label={task.status === 'active' ? 'Активна' : 'Архив'} color={task.status === 'active' ? 'primary' : 'default'} />
                            <Typography variant="caption" color="text.secondary">
                              Прогресс: {task.progress}%
                            </Typography>
                            <LinearProgress variant="determinate" value={task.progress} sx={{ width: 80, height: 6, borderRadius: 1 }} />
                          </Stack>
                        </Box>
                        {isAdminOrOwner && (
                          <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                            <IconButton size="small" onClick={() => openTaskDialog(task)} title="Редактировать">
                              <EditIcon />
                            </IconButton>
                            {task.status === 'active' && (
                              <IconButton size="small" onClick={() => archiveTask(task.id)} title="В архив">
                                <ArchiveIcon />
                              </IconButton>
                            )}
                            <IconButton size="small" onClick={() => deleteTask(task.id)} color="error" title="Удалить">
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        )}
                      </Stack>
                    </ListItemButton>
                    {expandedTaskId === task.id && (
                      <CardContent sx={{ pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                          Подзадачи
                        </Typography>
                        <List dense>
                          {task.subtasks.map((st) => (
                            <ListItem key={st.id} disablePadding>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={st.completed}
                                    onChange={() => handleSubtaskToggle(task, st)}
                                    disabled={!isAdminOrOwner && !isSales}
                                  />
                                }
                                label={<ListItemText primary={st.text} sx={{ textDecoration: st.completed ? 'line-through' : 'none' }} />}
                              />
                            </ListItem>
                          ))}
                        </List>
                        {task.student_ids?.length > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Ученики: {task.student_ids.length}
                          </Typography>
                        )}
                      </CardContent>
                    )}
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Stack>

      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{templateEditId ? 'Редактировать шаблон' : 'Новый шаблон'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название шаблона"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            margin="normal"
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>Подзадачи</Typography>
          {templateSubtasks.map((s, i) => (
            <TextField
              key={i}
              fullWidth
              size="small"
              value={s.text}
              onChange={(e) => setTemplateSubtasks((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              placeholder={`Подзадача ${i + 1}`}
              margin="dense"
            />
          ))}
          <Button size="small" onClick={addTemplateSubtask} sx={{ mt: 0.5 }}>+ Подзадача</Button>

          <FormControlLabel
            control={<Checkbox checked={templateRepeatEnabled} onChange={(e) => setTemplateRepeatEnabled(e.target.checked)} />}
            label="Повторять"
            sx={{ mt: 2, display: 'block' }}
          />
          {templateRepeatEnabled && (
            <Stack spacing={1.5} sx={{ mt: 1, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Период</InputLabel>
                <Select
                  value={templateRepeatFrequency}
                  label="Период"
                  onChange={(e) => setTemplateRepeatFrequency(e.target.value as RepeatFrequency | '')}
                >
                  <MenuItem value="daily">Ежедневно</MenuItem>
                  <MenuItem value="weekly">Еженедельно</MenuItem>
                  <MenuItem value="monthly">Раз в месяц</MenuItem>
                </Select>
              </FormControl>
              {templateRepeatFrequency === 'weekly' && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Дни недели</Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                    {WEEKDAY_LABELS.map((label, i) => (
                      <FormControlLabel
                        key={i}
                        control={<Checkbox size="small" checked={templateRepeatDays.includes(i)} onChange={(e) => setTemplateRepeatDays(e.target.checked ? [...templateRepeatDays, i].sort((a, b) => a - b) : templateRepeatDays.filter((d) => d !== i))} />}
                        label={label}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {templateRepeatFrequency === 'monthly' && (
                <TextField
                  size="small"
                  fullWidth
                  label="Дни месяца (через запятую, 1–31)"
                  placeholder="1, 15, 30"
                  value={templateRepeatDays.join(', ')}
                  onChange={(e) => setTemplateRepeatDays(e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 31))}
                />
              )}
              <Typography variant="caption" color="text.secondary">Завершить повторение</Typography>
              <RadioGroup row value={templateRepeatEndType} onChange={(e) => setTemplateRepeatEndType(e.target.value as RepeatEndType)}>
                <FormControlLabel value="never" control={<Radio size="small" />} label="Бессрочно" />
                <FormControlLabel value="after_count" control={<Radio size="small" />} label="После" />
                {templateRepeatEndType === 'after_count' && (
                  <TextField type="number" size="small" sx={{ width: 64 }} value={templateRepeatEndAfterCount} onChange={(e) => setTemplateRepeatEndAfterCount(parseInt(e.target.value, 10) || 1)} inputProps={{ min: 1 }} />
                )}
                <FormControlLabel value="until_date" control={<Radio size="small" />} label="До даты" />
                {templateRepeatEndType === 'until_date' && (
                  <TextField type="date" size="small" sx={{ width: 160 }} value={templateRepeatEndUntil} onChange={(e) => setTemplateRepeatEndUntil(e.target.value)} InputLabelProps={{ shrink: true }} />
                )}
              </RadioGroup>
            </Stack>
          )}

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Ученики (ID через запятую)</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Например: 1, 2, 3"
            value={templateStudentIds.join(', ')}
            onChange={(e) => setTemplateStudentIds(e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n)))}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveTemplate} disabled={templateSaving || !templateName.trim()}>
            {templateSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={taskDialogOpen} onClose={() => setTaskDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{taskEditId ? 'Редактировать задачу' : 'Новая задача'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название задачи"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            margin="normal"
          />
          {!taskEditId && (
            <>
              <TextField
                select
                fullWidth
                label="Шаблон (опционально)"
                value={taskTemplateId}
                onChange={(e) => setTaskTemplateId(e.target.value === '' ? '' : Number(e.target.value))}
                margin="normal"
                SelectProps={{ native: true }}
              >
                <option value="">— Без шаблона —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </TextField>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Подзадачи (если без шаблона)</Typography>
              {taskSubtasks.map((s, i) => (
                <TextField
                  key={i}
                  fullWidth
                  size="small"
                  value={s.text}
                  onChange={(e) => setTaskSubtasks((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  placeholder={`Подзадача ${i + 1}`}
                  margin="dense"
                />
              ))}
              <Button size="small" onClick={addTaskSubtask} sx={{ mt: 0.5 }}>+ Подзадача</Button>
            </>
          )}

          <FormControlLabel
            control={<Checkbox checked={taskRepeatEnabled} onChange={(e) => setTaskRepeatEnabled(e.target.checked)} />}
            label="Повторять"
            sx={{ mt: 2, display: 'block' }}
          />
          {taskRepeatEnabled && (
            <Stack spacing={1.5} sx={{ mt: 1, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Период</InputLabel>
                <Select
                  value={taskRepeatFrequency}
                  label="Период"
                  onChange={(e) => setTaskRepeatFrequency(e.target.value as RepeatFrequency | '')}
                >
                  <MenuItem value="daily">Ежедневно</MenuItem>
                  <MenuItem value="weekly">Еженедельно</MenuItem>
                  <MenuItem value="monthly">Раз в месяц</MenuItem>
                </Select>
              </FormControl>
              {taskRepeatFrequency === 'weekly' && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Дни недели</Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                    {WEEKDAY_LABELS.map((label, i) => (
                      <FormControlLabel
                        key={i}
                        control={<Checkbox size="small" checked={taskRepeatDays.includes(i)} onChange={(e) => setTaskRepeatDays(e.target.checked ? [...taskRepeatDays, i].sort((a, b) => a - b) : taskRepeatDays.filter((d) => d !== i))} />}
                        label={label}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {taskRepeatFrequency === 'monthly' && (
                <TextField
                  size="small"
                  fullWidth
                  label="Дни месяца (через запятую, 1–31)"
                  placeholder="1, 15, 30"
                  value={taskRepeatDays.join(', ')}
                  onChange={(e) => setTaskRepeatDays(e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 31))}
                />
              )}
              <Typography variant="caption" color="text.secondary">Завершить повторение</Typography>
              <RadioGroup row value={taskRepeatEndType} onChange={(e) => setTaskRepeatEndType(e.target.value as RepeatEndType)}>
                <FormControlLabel value="never" control={<Radio size="small" />} label="Бессрочно" />
                <FormControlLabel value="after_count" control={<Radio size="small" />} label="После" />
                {taskRepeatEndType === 'after_count' && (
                  <TextField type="number" size="small" sx={{ width: 64 }} value={taskRepeatEndAfterCount} onChange={(e) => setTaskRepeatEndAfterCount(parseInt(e.target.value, 10) || 1)} inputProps={{ min: 1 }} />
                )}
                <FormControlLabel value="until_date" control={<Radio size="small" />} label="До даты" />
                {taskRepeatEndType === 'until_date' && (
                  <TextField type="date" size="small" sx={{ width: 160 }} value={taskRepeatEndUntil} onChange={(e) => setTaskRepeatEndUntil(e.target.value)} InputLabelProps={{ shrink: true }} />
                )}
              </RadioGroup>
            </Stack>
          )}

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Ученики (ID через запятую)</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Например: 1, 2, 3"
            value={taskStudentIds.join(', ')}
            onChange={(e) => setTaskStudentIds(e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n)))}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveTask} disabled={taskSaving}>
            {taskSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TasksPage;
