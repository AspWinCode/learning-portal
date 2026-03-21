import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Checkbox,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Layout from '../components/Layout';
import { ownerWorkspaceApi, usersApi } from '../services/api';
import type {
  OwnerWorkspaceContact,
  OwnerWorkspaceConversation,
  OwnerWorkspaceMessage,
  OwnerWorkspaceProject,
  OwnerWorkspaceTask,
  OwnerWorkspaceTaskComment,
  User,
} from '../types';
import { extractApiError } from '../utils/extractApiError';

function isTaskOverdue(t: OwnerWorkspaceTask): boolean {
  if (!t.deadline_at || t.status === 'completed' || t.status === 'cancelled') return false;
  return new Date(t.deadline_at).getTime() < Date.now();
}

function deadlineToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

type OwnerWorkspaceTaskStatus = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
type OwnerWorkspaceTaskPriority = 'low' | 'medium' | 'high' | 'critical';

const OWNER_WS_STATUSES: OwnerWorkspaceTaskStatus[] = ['new', 'in_progress', 'waiting', 'completed', 'cancelled'];
const OWNER_WS_PRIORITIES: OwnerWorkspaceTaskPriority[] = ['low', 'medium', 'high', 'critical'];

function coerceTaskStatus(v: string): OwnerWorkspaceTaskStatus {
  return OWNER_WS_STATUSES.includes(v as OwnerWorkspaceTaskStatus) ? (v as OwnerWorkspaceTaskStatus) : 'new';
}

function coerceTaskPriority(v: string): OwnerWorkspaceTaskPriority {
  return OWNER_WS_PRIORITIES.includes(v as OwnerWorkspaceTaskPriority) ? (v as OwnerWorkspaceTaskPriority) : 'medium';
}

const OwnerWorkspacePage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<OwnerWorkspaceProject[]>([]);
  const [contacts, setContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [tasks, setTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [messages, setMessages] = useState<OwnerWorkspaceMessage[]>([]);
  const [conversations, setConversations] = useState<OwnerWorkspaceConversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [projectName, setProjectName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | ''>('');
  const [newTaskContactId, setNewTaskContactId] = useState<number | ''>('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<number | ''>('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('');
  const [taskProjectFilter, setTaskProjectFilter] = useState<number | ''>('');
  const [taskContactFilter, setTaskContactFilter] = useState<number | ''>('');
  const [taskOverdueOnly, setTaskOverdueOnly] = useState(false);
  const [taskActiveOnly, setTaskActiveOnly] = useState(false);

  const [projectDialog, setProjectDialog] = useState<OwnerWorkspaceProject | null>(null);
  const [subprojectName, setSubprojectName] = useState('');
  const [linkContactId, setLinkContactId] = useState<OwnerWorkspaceContact | null>(null);

  const [contactDialog, setContactDialog] = useState<OwnerWorkspaceContact | null>(null);
  const [contactLinkProjectId, setContactLinkProjectId] = useState<OwnerWorkspaceProject | null>(null);
  const [contactMessages, setContactMessages] = useState<OwnerWorkspaceMessage[]>([]);
  const [newContactMessage, setNewContactMessage] = useState('');

  const [taskDialog, setTaskDialog] = useState<OwnerWorkspaceTask | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState('');
  const [taskEditDescription, setTaskEditDescription] = useState('');
  const [taskEditStatus, setTaskEditStatus] = useState<OwnerWorkspaceTaskStatus>('new');
  const [taskEditPriority, setTaskEditPriority] = useState<OwnerWorkspaceTaskPriority>('medium');
  const [taskEditDeadline, setTaskEditDeadline] = useState('');
  const [taskEditProjectId, setTaskEditProjectId] = useState<number | ''>('');
  const [taskEditContactId, setTaskEditContactId] = useState<number | ''>('');
  const [taskEditAssigneeId, setTaskEditAssigneeId] = useState<number | ''>('');
  const [taskComments, setTaskComments] = useState<OwnerWorkspaceTaskComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  const [completeDialogTask, setCompleteDialogTask] = useState<OwnerWorkspaceTask | null>(null);
  const [completeMode, setCompleteMode] = useState<'close' | 'close_and_create_next'>('close');
  const [nextTaskTitle, setNextTaskTitle] = useState('');

  const [commsContactId, setCommsContactId] = useState<number | null>(null);
  const [commsMessages, setCommsMessages] = useState<OwnerWorkspaceMessage[]>([]);
  const [messageTaskDialog, setMessageTaskDialog] = useState<{ message: OwnerWorkspaceMessage } | null>(null);
  const [messageTaskTitle, setMessageTaskTitle] = useState('');

  const loadProjectsAndContacts = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([ownerWorkspaceApi.listProjects(), ownerWorkspaceApi.listContacts()]);
      setProjects(p);
      setContacts(c);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить проекты/контакты'));
    }
  }, []);

  const loadTasksFiltered = useCallback(async () => {
    try {
      const t = await ownerWorkspaceApi.listTasks({
        search: taskSearch.trim() || undefined,
        status_filter: taskStatusFilter || undefined,
        priority: taskPriorityFilter || undefined,
        project_id: taskProjectFilter === '' ? undefined : taskProjectFilter,
        contact_id: taskContactFilter === '' ? undefined : taskContactFilter,
        overdue_only: taskOverdueOnly || undefined,
        active_only: taskActiveOnly || undefined,
      });
      setTasks(t);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить задачи'));
    }
  }, [
    taskSearch,
    taskStatusFilter,
    taskPriorityFilter,
    taskProjectFilter,
    taskContactFilter,
    taskOverdueOnly,
    taskActiveOnly,
  ]);

  const loadMeta = useCallback(async () => {
    try {
      const [m, conv, u] = await Promise.all([
        ownerWorkspaceApi.listMessages(),
        ownerWorkspaceApi.listConversations(),
        usersApi.getAll(),
      ]);
      setMessages(m);
      setConversations(conv);
      setUsers(Array.isArray(u) ? u : []);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить вспомогательные данные'));
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadProjectsAndContacts(), loadTasksFiltered(), loadMeta()]);
    } finally {
      setLoading(false);
    }
  }, [loadProjectsAndContacts, loadTasksFiltered, loadMeta]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (tab === 2) {
      loadTasksFiltered();
    }
  }, [tab, loadTasksFiltered]);

  const createProject = async () => {
    if (!projectName.trim()) return;
    try {
      await ownerWorkspaceApi.createProject({ name: projectName.trim() });
      setProjectName('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать проект'));
    }
  };

  const createContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    try {
      await ownerWorkspaceApi.createContact({ full_name: contactName.trim(), phone: contactPhone.trim() });
      setContactName('');
      setContactPhone('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать контакт'));
    }
  };

  const createTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      await ownerWorkspaceApi.createTask({
        title: taskTitle.trim(),
        priority: taskPriority,
        project_id: newTaskProjectId === '' ? null : newTaskProjectId,
        contact_id: newTaskContactId === '' ? null : newTaskContactId,
        assignee_id: newTaskAssigneeId === '' ? null : newTaskAssigneeId,
        deadline_at: localInputToIso(newTaskDeadline),
      });
      setTaskTitle('');
      setTaskPriority('medium');
      setNewTaskProjectId('');
      setNewTaskContactId('');
      setNewTaskAssigneeId('');
      setNewTaskDeadline('');
      await loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать задачу'));
    }
  };

  const openTaskDialog = async (t: OwnerWorkspaceTask) => {
    setTaskDialog(t);
    setTaskEditTitle(t.title);
    setTaskEditDescription(t.description || '');
    setTaskEditStatus(coerceTaskStatus(String(t.status)));
    setTaskEditPriority(coerceTaskPriority(String(t.priority)));
    setTaskEditDeadline(deadlineToLocalInput(t.deadline_at));
    setTaskEditProjectId(t.project_id ?? '');
    setTaskEditContactId(t.contact_id ?? '');
    setTaskEditAssigneeId(t.assignee_id ?? '');
    setNewCommentText('');
    try {
      const cm = await ownerWorkspaceApi.getTaskComments(t.id);
      setTaskComments(cm);
    } catch {
      setTaskComments([]);
    }
  };

  const saveTaskDialog = async () => {
    if (!taskDialog) return;
    try {
      await ownerWorkspaceApi.updateTask(taskDialog.id, {
        title: taskEditTitle.trim(),
        description: taskEditDescription.trim() || null,
        status: taskEditStatus,
        priority: taskEditPriority,
        deadline_at: localInputToIso(taskEditDeadline),
        project_id: taskEditProjectId === '' ? null : taskEditProjectId,
        contact_id: taskEditContactId === '' ? null : taskEditContactId,
        assignee_id: taskEditAssigneeId === '' ? null : taskEditAssigneeId,
      });
      setTaskDialog(null);
      await loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить задачу'));
    }
  };

  const addComment = async () => {
    if (!taskDialog || !newCommentText.trim()) return;
    try {
      await ownerWorkspaceApi.addTaskComment(taskDialog.id, newCommentText.trim());
      setNewCommentText('');
      const cm = await ownerWorkspaceApi.getTaskComments(taskDialog.id);
      setTaskComments(cm);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось добавить комментарий'));
    }
  };

  const submitComplete = async () => {
    if (!completeDialogTask) return;
    try {
      if (completeMode === 'close') {
        await ownerWorkspaceApi.completeTask(completeDialogTask.id, { action: 'close' });
      } else {
        await ownerWorkspaceApi.completeTask(completeDialogTask.id, {
          action: 'close_and_create_next',
          next_task: {
            title: nextTaskTitle.trim() || `Следующий шаг: ${completeDialogTask.title}`,
            description: null,
            project_id: completeDialogTask.project_id,
            contact_id: completeDialogTask.contact_id,
            assignee_id: completeDialogTask.assignee_id,
            priority: completeDialogTask.priority as 'low' | 'medium' | 'high' | 'critical',
          },
        });
      }
      setCompleteDialogTask(null);
      setNextTaskTitle('');
      await loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось завершить задачу'));
    }
  };

  const openProjectDialog = (p: OwnerWorkspaceProject) => {
    setProjectDialog(p);
    setSubprojectName('');
    setLinkContactId(null);
  };

  const createSubproject = async () => {
    if (!projectDialog || !subprojectName.trim()) return;
    try {
      await ownerWorkspaceApi.createProject({
        name: subprojectName.trim(),
        parent_project_id: projectDialog.id,
      });
      setSubprojectName('');
      await loadProjectsAndContacts();
      const refreshed = await ownerWorkspaceApi.listProjects();
      const updated = refreshed.find((x) => x.id === projectDialog.id);
      if (updated) setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать подпроект'));
    }
  };

  const linkContactToProject = async () => {
    if (!projectDialog || !linkContactId) return;
    try {
      await ownerWorkspaceApi.addProjectContact(projectDialog.id, linkContactId.id);
      setLinkContactId(null);
      await loadProjectsAndContacts();
      const refreshed = await ownerWorkspaceApi.listProjects();
      const updated = refreshed.find((x) => x.id === projectDialog.id);
      if (updated) setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось привязать контакт'));
    }
  };

  const openContactDialog = async (c: OwnerWorkspaceContact) => {
    setContactDialog(c);
    setContactLinkProjectId(null);
    setNewContactMessage('');
    try {
      const msgs = await ownerWorkspaceApi.getContactMessages(c.id);
      setContactMessages(msgs.slice().reverse());
    } catch {
      setContactMessages([]);
    }
  };

  const linkContactToSelectedProject = async () => {
    if (!contactDialog || !contactLinkProjectId) return;
    try {
      await ownerWorkspaceApi.addProjectContact(contactLinkProjectId.id, contactDialog.id);
      setContactLinkProjectId(null);
      await loadProjectsAndContacts();
      const list = await ownerWorkspaceApi.listContacts();
      const updated = list.find((x) => x.id === contactDialog.id);
      if (updated) setContactDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось добавить в проект'));
    }
  };

  const sendContactMessage = async () => {
    if (!contactDialog || !newContactMessage.trim()) return;
    try {
      await ownerWorkspaceApi.createMessage({
        contact_id: contactDialog.id,
        text: newContactMessage.trim(),
        direction: 'outgoing',
      });
      setNewContactMessage('');
      const msgs = await ownerWorkspaceApi.getContactMessages(contactDialog.id);
      setContactMessages(msgs.slice().reverse());
      await loadMeta();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить сообщение'));
    }
  };

  const selectCommsContact = async (contactId: number) => {
    setCommsContactId(contactId);
    try {
      const msgs = await ownerWorkspaceApi.getContactMessages(contactId);
      setCommsMessages(msgs.slice().reverse());
    } catch {
      setCommsMessages([]);
    }
  };

  const submitMessageTask = async () => {
    if (!messageTaskDialog || !messageTaskTitle.trim()) return;
    try {
      await ownerWorkspaceApi.createTaskFromMessage(messageTaskDialog.message.id, {
        title: messageTaskTitle.trim(),
        description: messageTaskDialog.message.text,
      });
      setMessageTaskDialog(null);
      setMessageTaskTitle('');
      await loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать задачу из сообщения'));
    }
  };

  const userOptions = useMemo(
    () => users.filter((u) => ['admin', 'owner', 'sales', 'trainer'].includes(u.role)),
    [users]
  );

  return (
    <Layout>
      <Typography variant="h4" gutterBottom>
        Owner: задачник
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Проекты, контакты, задачи с фильтрами, комментарии и завершение с созданием следующей задачи.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Проекты (${projects.length})`} />
        <Tab label={`Контакты (${contacts.length})`} />
        <Tab label={`Задачи (${tasks.length})`} />
        <Tab label="Коммуникации" />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  fullWidth
                  label="Название проекта"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
                <Button variant="contained" onClick={createProject}>
                  Создать
                </Button>
              </Stack>
            </CardContent>
          </Card>
          <Grid container spacing={2}>
            {projects.map((p) => (
              <Grid item xs={12} md={6} key={p.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="h6">{p.name}</Typography>
                      <IconButton size="small" onClick={() => openProjectDialog(p)} aria-label="Открыть">
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                      <Chip size="small" label={p.status} />
                      <Chip size="small" label={`Задач активн.: ${p.active_tasks_count}`} />
                      <Chip size="small" label={`Контактов: ${p.contacts_count}`} />
                      {p.subprojects_count > 0 && <Chip size="small" label={`Подпроектов: ${p.subprojects_count}`} />}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField fullWidth label="ФИО" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                <TextField fullWidth label="Телефон" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                <Button variant="contained" onClick={createContact}>
                  Создать
                </Button>
              </Stack>
            </CardContent>
          </Card>
          <Grid container spacing={2}>
            {contacts.map((c) => (
              <Grid item xs={12} md={6} key={c.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="h6">{c.full_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {c.phone}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Chip size="small" label={`Активн. задач: ${c.active_tasks_count}`} />
                          {c.linked_project_ids.length > 0 && (
                            <Chip size="small" label={`Проектов: ${c.linked_project_ids.length}`} />
                          )}
                        </Stack>
                      </Box>
                      <IconButton size="small" onClick={() => openContactDialog(c)}>
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Новая задача
              </Typography>
              <Stack spacing={1}>
                <TextField fullWidth label="Название" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    select
                    label="Приоритет"
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as typeof taskPriority)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="low">Низкий</MenuItem>
                    <MenuItem value="medium">Средний</MenuItem>
                    <MenuItem value="high">Высокий</MenuItem>
                    <MenuItem value="critical">Критический</MenuItem>
                  </TextField>
                  <Autocomplete
                    options={projects}
                    getOptionLabel={(o) => o.name}
                    value={projects.find((p) => p.id === newTaskProjectId) || null}
                    onChange={(_, v) => setNewTaskProjectId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Проект (необяз.)" />}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={contacts}
                    getOptionLabel={(o) => `${o.full_name} · ${o.phone}`}
                    value={contacts.find((c) => c.id === newTaskContactId) || null}
                    onChange={(_, v) => setNewTaskContactId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Контакт (необяз.)" />}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={userOptions}
                    getOptionLabel={(o) => o.full_name}
                    value={userOptions.find((u) => u.id === newTaskAssigneeId) || null}
                    onChange={(_, v) => setNewTaskAssigneeId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Исполнитель" />}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <TextField
                  label="Дедлайн"
                  type="datetime-local"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ maxWidth: 280 }}
                />
                <Button variant="contained" onClick={createTask} sx={{ alignSelf: 'flex-start' }}>
                  Создать задачу
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Фильтры
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Поиск"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    onBlur={() => loadTasksFiltered()}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Статус"
                    value={taskStatusFilter}
                    onChange={(e) => setTaskStatusFilter(e.target.value)}
                  >
                    <MenuItem value="">Все</MenuItem>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <MenuItem key={k} value={k}>
                        {v}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Приоритет"
                    value={taskPriorityFilter}
                    onChange={(e) => setTaskPriorityFilter(e.target.value)}
                  >
                    <MenuItem value="">Все</MenuItem>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <MenuItem key={k} value={k}>
                        {v}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={projects}
                    getOptionLabel={(o) => o.name}
                    value={projects.find((p) => p.id === taskProjectFilter) || null}
                    onChange={(_, v) => setTaskProjectFilter(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Проект" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={contacts}
                    getOptionLabel={(o) => `${o.full_name}`}
                    value={contacts.find((c) => c.id === taskContactFilter) || null}
                    onChange={(_, v) => setTaskContactFilter(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Контакт" />}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <FormControlLabel
                      control={<Checkbox checked={taskOverdueOnly} onChange={(e) => setTaskOverdueOnly(e.target.checked)} />}
                      label="Только просроченные"
                    />
                    <FormControlLabel
                      control={<Checkbox checked={taskActiveOnly} onChange={(e) => setTaskActiveOnly(e.target.checked)} />}
                      label="Только активные"
                    />
                    <Button size="small" variant="outlined" onClick={() => loadTasksFiltered()}>
                      Применить
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Stack spacing={1}>
            {tasks.map((t) => (
              <Card
                key={t.id}
                sx={{
                  borderLeft: isTaskOverdue(t) ? '4px solid' : undefined,
                  borderColor: isTaskOverdue(t) ? 'error.main' : undefined,
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ cursor: 'pointer' }} onClick={() => openTaskDialog(t)}>
                      <Typography variant="subtitle1">{t.title}</Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                        <Chip size="small" label={STATUS_LABELS[t.status] || t.status} />
                        <Chip
                          size="small"
                          label={PRIORITY_LABELS[t.priority] || t.priority}
                          color={t.priority === 'critical' ? 'error' : t.priority === 'high' ? 'warning' : 'default'}
                        />
                        {t.deadline_at && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={new Date(t.deadline_at).toLocaleString('ru-RU')}
                            color={isTaskOverdue(t) ? 'error' : 'default'}
                          />
                        )}
                        {t.project_id && (
                          <Chip size="small" label={`Проект #${t.project_id}`} variant="outlined" />
                        )}
                        {t.contact_id && (
                          <Chip size="small" label={`Контакт #${t.contact_id}`} variant="outlined" />
                        )}
                      </Stack>
                    </Box>
                    {t.status !== 'completed' && t.status !== 'cancelled' && (
                      <Button variant="outlined" onClick={() => setCompleteDialogTask(t)}>
                        Завершить…
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Stack>
      )}

      {tab === 3 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Диалоги
                </Typography>
                <Stack spacing={1}>
                  {conversations.map((c) => (
                    <Box
                      key={c.contact_id}
                      onClick={() => selectCommsContact(c.contact_id)}
                      sx={{
                        p: 1,
                        border: '1px solid',
                        borderColor: commsContactId === c.contact_id ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        cursor: 'pointer',
                      }}
                    >
                      <Typography variant="subtitle2">{c.contact_name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {c.last_message_text || '—'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {commsContactId ? `Переписка · контакт #${commsContactId}` : 'Выберите диалог слева'}
                </Typography>
                <Stack spacing={1} sx={{ maxHeight: 420, overflow: 'auto' }}>
                  {commsMessages.map((m) => (
                    <Box
                      key={m.id}
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        bgcolor: m.direction === 'outgoing' ? 'action.hover' : 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {m.direction} · {m.created_at ? new Date(m.created_at).toLocaleString('ru-RU') : ''}
                      </Typography>
                      <Typography variant="body2">{m.text}</Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          setMessageTaskTitle(m.text.slice(0, 80) + (m.text.length > 80 ? '…' : ''));
                          setMessageTaskDialog({ message: m });
                        }}
                      >
                        Задача из сообщения
                      </Button>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {loading && <Typography sx={{ mt: 2 }}>Загрузка…</Typography>}

      <Dialog open={Boolean(projectDialog)} onClose={() => setProjectDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Проект: {projectDialog?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Подпроекты: {projectDialog?.subprojects_count ?? 0} · Контакты: {projectDialog?.contacts_count ?? 0} · Активные
              задачи: {projectDialog?.active_tasks_count ?? 0}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                label="Название подпроекта"
                value={subprojectName}
                onChange={(e) => setSubprojectName(e.target.value)}
              />
              <Button variant="contained" onClick={createSubproject}>
                Создать подпроект
              </Button>
            </Stack>
            <Autocomplete
              options={contacts}
              getOptionLabel={(o) => `${o.full_name} · ${o.phone}`}
              value={linkContactId}
              onChange={(_, v) => setLinkContactId(v)}
              renderInput={(params) => <TextField {...params} label="Добавить контакт в проект" />}
            />
            <Button variant="outlined" onClick={linkContactToProject} disabled={!linkContactId}>
              Привязать контакт
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectDialog(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(contactDialog)} onClose={() => setContactDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{contactDialog?.full_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">{contactDialog?.phone}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Autocomplete
                sx={{ flex: 1 }}
                options={projects}
                getOptionLabel={(o) => o.name}
                value={contactLinkProjectId}
                onChange={(_, v) => setContactLinkProjectId(v)}
                renderInput={(params) => <TextField {...params} label="Добавить в проект" />}
              />
              <Button variant="contained" onClick={linkContactToSelectedProject} disabled={!contactLinkProjectId}>
                Добавить
              </Button>
            </Stack>
            <Typography variant="subtitle2">Переписка (ручной ввод для MVP)</Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Сообщение"
              value={newContactMessage}
              onChange={(e) => setNewContactMessage(e.target.value)}
            />
            <Button variant="outlined" onClick={sendContactMessage}>
              Сохранить как исходящее
            </Button>
            <Stack spacing={1} sx={{ maxHeight: 240, overflow: 'auto' }}>
              {contactMessages.map((m) => (
                <Box key={m.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="caption">{m.direction}</Typography>
                  <Typography variant="body2">{m.text}</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialog(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(taskDialog)} onClose={() => setTaskDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Задача #{taskDialog?.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Название" fullWidth value={taskEditTitle} onChange={(e) => setTaskEditTitle(e.target.value)} />
            <TextField
              label="Описание"
              fullWidth
              multiline
              minRows={3}
              value={taskEditDescription}
              onChange={(e) => setTaskEditDescription(e.target.value)}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                select
                label="Статус"
                fullWidth
                value={taskEditStatus}
                onChange={(e) => setTaskEditStatus(coerceTaskStatus(e.target.value))}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Приоритет"
                fullWidth
                value={taskEditPriority}
                onChange={(e) => setTaskEditPriority(coerceTaskPriority(e.target.value))}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              label="Дедлайн"
              type="datetime-local"
              value={taskEditDeadline}
              onChange={(e) => setTaskEditDeadline(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <Autocomplete
              options={projects}
              getOptionLabel={(o) => o.name}
              value={projects.find((p) => p.id === taskEditProjectId) || null}
              onChange={(_, v) => setTaskEditProjectId(v ? v.id : '')}
              renderInput={(params) => <TextField {...params} label="Проект" />}
            />
            <Autocomplete
              options={contacts}
              getOptionLabel={(o) => o.full_name}
              value={contacts.find((c) => c.id === taskEditContactId) || null}
              onChange={(_, v) => setTaskEditContactId(v ? v.id : '')}
              renderInput={(params) => <TextField {...params} label="Контакт" />}
            />
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) => o.full_name}
              value={userOptions.find((u) => u.id === taskEditAssigneeId) || null}
              onChange={(_, v) => setTaskEditAssigneeId(v ? v.id : '')}
              renderInput={(params) => <TextField {...params} label="Исполнитель" />}
            />
            <Typography variant="subtitle2">Комментарии</Typography>
            <Stack spacing={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
              {taskComments.map((c) => (
                <Box key={c.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {c.created_at ? new Date(c.created_at).toLocaleString('ru-RU') : ''}
                  </Typography>
                  <Typography variant="body2">{c.text}</Typography>
                </Box>
              ))}
            </Stack>
            <TextField
              fullWidth
              label="Новый комментарий"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
            />
            <Button variant="outlined" onClick={addComment}>
              Добавить комментарий
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialog(null)}>Отмена</Button>
          <Button variant="contained" onClick={saveTaskDialog}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(completeDialogTask)} onClose={() => setCompleteDialogTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Завершить задачу</DialogTitle>
        <DialogContent>
          <RadioGroup value={completeMode} onChange={(e) => setCompleteMode(e.target.value as typeof completeMode)}>
            <FormControlLabel value="close" control={<Radio />} label="Просто закрыть" />
            <FormControlLabel
              value="close_and_create_next"
              control={<Radio />}
              label="Закрыть и создать следующую"
            />
          </RadioGroup>
          {completeMode === 'close_and_create_next' && (
            <TextField
              fullWidth
              sx={{ mt: 2 }}
              label="Название следующей задачи"
              value={nextTaskTitle}
              onChange={(e) => setNextTaskTitle(e.target.value)}
              placeholder="Оставьте пустым — подставится автоматически"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteDialogTask(null)}>Отмена</Button>
          <Button variant="contained" onClick={submitComplete}>
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(messageTaskDialog)} onClose={() => setMessageTaskDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Задача из сообщения</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            sx={{ mt: 1 }}
            label="Название задачи"
            value={messageTaskTitle}
            onChange={(e) => setMessageTaskTitle(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageTaskDialog(null)}>Отмена</Button>
          <Button variant="contained" onClick={submitMessageTask}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default OwnerWorkspacePage;
