import React, { useEffect, useMemo, useState } from 'react';
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
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
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
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ownerWorkspaceApi } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';
import type { OwnerWorkspaceContact, OwnerWorkspaceMeeting, OwnerWorkspaceProject, User } from '../../types';

type MeetingDraft = {
  title: string;
  meeting_date: string;
  meeting_time: string;
  responsible_user_id: number | null;
  project_id: number | null;
  contact_ids: number[];
  participant_user_ids: number[];
  meeting_type: 'online' | 'offline';
  address: string;
  online_url: string;
  recurrence_type: string;
  reminder_type: string;
  agenda: string;
  meeting_result: string;
  next_steps: string;
};

type Props = {
  projects: OwnerWorkspaceProject[];
  contacts: OwnerWorkspaceContact[];
  users: User[];
  canCreate: boolean;
};

const statusLabels: Record<string, string> = {
  planned: 'Запланирована',
  completed: 'Проведена',
  cancelled: 'Отменена',
};

const statusColors: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  planned: 'primary',
  completed: 'success',
  cancelled: 'default',
};

const blankDraft = (): MeetingDraft => {
  const now = new Date();
  const nextHour = `${String(Math.min(now.getHours() + 1, 23)).padStart(2, '0')}:00`;
  return {
    title: '',
    meeting_date: now.toISOString().slice(0, 10),
    meeting_time: nextHour,
    responsible_user_id: null,
    project_id: null,
    contact_ids: [],
    participant_user_ids: [],
    meeting_type: 'online',
    address: '',
    online_url: '',
    recurrence_type: 'none',
    reminder_type: '',
    agenda: '',
    meeting_result: '',
    next_steps: '',
  };
};

function formatMeetingDate(date: string, time: string): string {
  const dt = new Date(`${date}T${time || '00:00'}`);
  if (Number.isNaN(dt.getTime())) return `${date} ${time}`;
  return format(dt, 'd MMMM yyyy, HH:mm', { locale: ru });
}

function isOverdue(meeting: OwnerWorkspaceMeeting): boolean {
  if (meeting.status !== 'planned') return false;
  return new Date(`${meeting.meeting_date}T${meeting.meeting_time || '00:00'}`).getTime() < Date.now();
}

export function OwnerWorkspaceMeetingsTab({ projects, contacts, users, canCreate }: Props) {
  const [meetings, setMeetings] = useState<OwnerWorkspaceMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [projectId, setProjectId] = useState('');
  const [contactId, setContactId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [meetingType, setMeetingType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OwnerWorkspaceMeeting | null>(null);
  const [draft, setDraft] = useState<MeetingDraft>(() => blankDraft());
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);
  const [actionMeeting, setActionMeeting] = useState<OwnerWorkspaceMeeting | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnerWorkspaceMeeting | null>(null);
  const [taskDialogMeeting, setTaskDialogMeeting] = useState<OwnerWorkspaceMeeting | null>(null);
  const [taskTitle, setTaskTitle] = useState('');

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const loadMeetings = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await ownerWorkspaceApi.listMeetings({
        search: search.trim() || undefined,
        status_filter: status || undefined,
        project_id: projectId ? Number(projectId) : undefined,
        contact_id: contactId ? Number(contactId) : undefined,
        responsible_user_id: responsibleId ? Number(responsibleId) : undefined,
        meeting_type: meetingType || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        overdue_only: overdueOnly || undefined,
        limit: 500,
      });
      setMeetings(rows);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось загрузить мероприятия'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, projectId, contactId, responsibleId, meetingType, dateFrom, dateTo, overdueOnly]);

  const openCreateDialog = () => {
    setEditing(null);
    setDraft(blankDraft());
    setDialogOpen(true);
  };

  const openEditDialog = (meeting: OwnerWorkspaceMeeting) => {
    setEditing(meeting);
    setDraft({
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      meeting_time: String(meeting.meeting_time || '').slice(0, 5),
      responsible_user_id: meeting.responsible_user_id ?? null,
      project_id: meeting.project_id ?? null,
      contact_ids: meeting.contact_ids || [],
      participant_user_ids: meeting.participant_user_ids || [],
      meeting_type: meeting.meeting_type === 'offline' ? 'offline' : 'online',
      address: meeting.address || '',
      online_url: meeting.online_url || '',
      recurrence_type: meeting.recurrence_type || 'none',
      reminder_type: meeting.reminder_type || '',
      agenda: meeting.agenda || '',
      meeting_result: meeting.meeting_result || '',
      next_steps: meeting.next_steps || '',
    });
    setDialogOpen(true);
  };

  const saveMeeting = async () => {
    const payload = {
      title: draft.title.trim(),
      meeting_date: draft.meeting_date,
      meeting_time: draft.meeting_time,
      responsible_user_id: draft.responsible_user_id,
      project_id: draft.project_id,
      contact_ids: draft.contact_ids,
      participant_user_ids: draft.participant_user_ids,
      meeting_type: draft.meeting_type,
      address: draft.meeting_type === 'offline' ? draft.address || null : null,
      online_url: draft.meeting_type === 'online' ? draft.online_url || null : null,
      recurrence_type: draft.recurrence_type,
      reminder_type: draft.reminder_type || null,
      agenda: draft.agenda || null,
      meeting_result: draft.meeting_result || null,
      next_steps: draft.next_steps || null,
    };
    if (!payload.title || !payload.meeting_date || !payload.meeting_time) return;
    try {
      if (editing) {
        await ownerWorkspaceApi.updateMeeting(editing.id, payload);
      } else {
        await ownerWorkspaceApi.createMeeting(payload);
      }
      setDialogOpen(false);
      await loadMeetings();
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сохранить мероприятие'));
    }
  };

  const runAction = async (action: 'complete' | 'cancel' | 'delete' | 'task') => {
    const meeting = actionMeeting;
    setActionAnchor(null);
    if (!meeting) return;
    if (action === 'delete') {
      setDeleteTarget(meeting);
      return;
    }
    if (action === 'task') {
      setTaskTitle(`Задача по итогам: ${meeting.title}`);
      setTaskDialogMeeting(meeting);
      return;
    }
    try {
      if (action === 'complete') {
        await ownerWorkspaceApi.closeMeeting(meeting.id, {
          meeting_result: meeting.meeting_result || 'Мероприятие проведено',
          next_steps: meeting.next_steps || null,
        });
      }
      if (action === 'cancel') {
        await ownerWorkspaceApi.cancelMeeting(meeting.id);
      }
      await loadMeetings();
    } catch (e) {
      setError(extractApiError(e, 'Не удалось выполнить действие'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await ownerWorkspaceApi.deleteMeeting(deleteTarget.id);
      setDeleteTarget(null);
      await loadMeetings();
    } catch (e) {
      setError(extractApiError(e, 'Не удалось удалить мероприятие'));
    }
  };

  const createTask = async () => {
    if (!taskDialogMeeting || !taskTitle.trim()) return;
    try {
      await ownerWorkspaceApi.createTaskFromMeeting(taskDialogMeeting.id, {
        title: taskTitle.trim(),
        description: taskDialogMeeting.meeting_result || taskDialogMeeting.next_steps || null,
        assignee_id: taskDialogMeeting.responsible_user_id ?? null,
      });
      setTaskDialogMeeting(null);
      await loadMeetings();
    } catch (e) {
      setError(extractApiError(e, 'Не удалось создать задачу'));
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardContent>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Поиск"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void loadMeetings();
                }}
                placeholder="Название, проект, контакт, адрес, итоги"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Статус</InputLabel>
                <Select label="Статус" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <MenuItem value="">Все</MenuItem>
                  <MenuItem value="planned">Запланированы</MenuItem>
                  <MenuItem value="completed">Проведены</MenuItem>
                  <MenuItem value="cancelled">Отменены</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Тип</InputLabel>
                <Select label="Тип" value={meetingType} onChange={(e) => setMeetingType(e.target.value)}>
                  <MenuItem value="">Все</MenuItem>
                  <MenuItem value="online">Онлайн</MenuItem>
                  <MenuItem value="offline">Очная</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  px: 1.5,
                  height: 56,
                  gap: 1,
                  '&:hover': { borderColor: 'text.primary' },
                  '&:focus-within': { borderColor: 'primary.main', borderWidth: 2 },
                }}
              >
                <Typography variant="caption" color="text.secondary" noWrap>С</Typography>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    color: 'inherit',
                    flex: 1,
                    minWidth: 0,
                  }}
                />
                <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', flexShrink: 0 }} />
                <Typography variant="caption" color="text.secondary" noWrap>По</Typography>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    color: 'inherit',
                    flex: 1,
                    minWidth: 0,
                  }}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Проект</InputLabel>
                <Select label="Проект" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <MenuItem value="">Все проекты</MenuItem>
                  {projects.map((project) => (
                    <MenuItem key={project.id} value={String(project.id)}>{project.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Контакт</InputLabel>
                <Select label="Контакт" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <MenuItem value="">Все контакты</MenuItem>
                  {contacts.map((contact) => (
                    <MenuItem key={contact.id} value={String(contact.id)}>{contact.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Ответственный</InputLabel>
                <Select label="Ответственный" value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                  <MenuItem value="">Все</MenuItem>
                  {users.map((user) => (
                    <MenuItem key={user.id} value={String(user.id)}>{user.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} alignItems="center" flexWrap="wrap">
                <Chip
                  label="Просроченные"
                  onClick={() => setOverdueOnly((v) => !v)}
                  color={overdueOnly ? 'warning' : 'default'}
                  variant={overdueOnly ? 'filled' : 'outlined'}
                  sx={{ fontWeight: overdueOnly ? 600 : 400, cursor: 'pointer' }}
                />
                <Button variant="outlined" onClick={() => void loadMeetings()}>Найти</Button>
                {canCreate && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
                    Создать
                  </Button>
                )}
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Дата и время</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell>Проект</TableCell>
                <TableCell>Контакты</TableCell>
                <TableCell>Ответственный</TableCell>
                <TableCell align="right">Задачи</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {meetings.map((meeting) => (
                <TableRow key={meeting.id} hover>
                  <TableCell>
                    <Typography fontWeight={800}>{meeting.title}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap maxWidth={320}>
                      {meeting.meeting_type === 'online' ? meeting.online_url : meeting.address}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {formatMeetingDate(meeting.meeting_date, meeting.meeting_time)}
                    {isOverdue(meeting) && <Chip size="small" color="warning" label="Просрочена" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={statusColors[meeting.status] || 'default'} label={statusLabels[meeting.status] || meeting.status} />
                  </TableCell>
                  <TableCell>{meeting.meeting_type === 'offline' ? 'Очная' : 'Онлайн'}</TableCell>
                  <TableCell>{meeting.project_name || (meeting.project_id ? projectById.get(meeting.project_id)?.name : '—') || '—'}</TableCell>
                  <TableCell>{meeting.contact_names?.length ? meeting.contact_names.join(', ') : meeting.contact_ids.map((id) => contactById.get(id)?.full_name || id).join(', ') || '—'}</TableCell>
                  <TableCell>{meeting.responsible_user_name || (meeting.responsible_user_id ? userById.get(meeting.responsible_user_id)?.full_name : '—') || '—'}</TableCell>
                  <TableCell align="right">{meeting.tasks_count}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      onClick={(e) => {
                        setActionMeeting(meeting);
                        setActionAnchor(e.currentTarget);
                      }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && meetings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Box py={7} textAlign="center">
                      <Typography variant="h6" fontWeight={800}>Мероприятий пока нет</Typography>
                      <Typography color="text.secondary" mt={1}>Создайте первое мероприятие или измените фильтры.</Typography>
                      {canCreate && (
                        <Button sx={{ mt: 2 }} variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
                          Создать мероприятие
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={() => setActionAnchor(null)}>
        <MenuItem onClick={() => { if (actionMeeting) openEditDialog(actionMeeting); setActionAnchor(null); }}>Открыть / редактировать</MenuItem>
        <MenuItem onClick={() => void runAction('task')}>Создать задачу по итогам</MenuItem>
        <MenuItem onClick={() => void runAction('complete')}>Завершить</MenuItem>
        <MenuItem onClick={() => void runAction('cancel')}>Отменить</MenuItem>
        <MenuItem onClick={() => void runAction('delete')} sx={{ color: 'error.main' }}>Удалить</MenuItem>
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? 'Мероприятие' : 'Создать мероприятие'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField fullWidth required label="Название" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Дата" type="date" value={draft.meeting_date} onChange={(e) => setDraft((d) => ({ ...d, meeting_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Время" type="time" value={draft.meeting_time} onChange={(e) => setDraft((d) => ({ ...d, meeting_time: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Тип</InputLabel>
                <Select label="Тип" value={draft.meeting_type} onChange={(e) => setDraft((d) => ({ ...d, meeting_type: e.target.value as 'online' | 'offline' }))}>
                  <MenuItem value="online">Онлайн</MenuItem>
                  <MenuItem value="offline">Очная</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Ответственный</InputLabel>
                <Select label="Ответственный" value={draft.responsible_user_id ? String(draft.responsible_user_id) : ''} onChange={(e) => setDraft((d) => ({ ...d, responsible_user_id: e.target.value ? Number(e.target.value) : null }))}>
                  <MenuItem value="">Не выбран</MenuItem>
                  {users.map((user) => <MenuItem key={user.id} value={String(user.id)}>{user.full_name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                options={projects}
                value={draft.project_id ? projectById.get(draft.project_id) || null : null}
                getOptionLabel={(option) => option.name}
                onChange={(_, value) => setDraft((d) => ({ ...d, project_id: value?.id ?? null }))}
                renderInput={(params) => <TextField {...params} label="Проект" />}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                options={contacts}
                value={draft.contact_ids.map((id) => contactById.get(id)).filter(Boolean) as OwnerWorkspaceContact[]}
                getOptionLabel={(option) => option.full_name}
                onChange={(_, value) => setDraft((d) => ({ ...d, contact_ids: value.map((v) => v.id) }))}
                renderInput={(params) => <TextField {...params} label="Контакты" />}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                options={users}
                value={draft.participant_user_ids.map((id) => userById.get(id)).filter(Boolean) as User[]}
                getOptionLabel={(option) => option.full_name}
                onChange={(_, value) => setDraft((d) => ({ ...d, participant_user_ids: value.map((v) => v.id) }))}
                renderInput={(params) => <TextField {...params} label="Внутренние участники" />}
              />
            </Grid>
            <Grid item xs={12}>
              {draft.meeting_type === 'online' ? (
                <TextField fullWidth label="Ссылка на онлайн-встречу" value={draft.online_url} onChange={(e) => setDraft((d) => ({ ...d, online_url: e.target.value }))} />
              ) : (
                <TextField fullWidth label="Адрес встречи" value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} />
              )}
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Периодичность</InputLabel>
                <Select label="Периодичность" value={draft.recurrence_type} onChange={(e) => setDraft((d) => ({ ...d, recurrence_type: e.target.value }))}>
                  <MenuItem value="none">Без повтора</MenuItem>
                  <MenuItem value="daily">Ежедневно</MenuItem>
                  <MenuItem value="weekly">Еженедельно</MenuItem>
                  <MenuItem value="monthly">Ежемесячно</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Напоминание</InputLabel>
                <Select label="Напоминание" value={draft.reminder_type} onChange={(e) => setDraft((d) => ({ ...d, reminder_type: e.target.value }))}>
                  <MenuItem value="">Без напоминания</MenuItem>
                  <MenuItem value="15m">За 15 минут</MenuItem>
                  <MenuItem value="30m">За 30 минут</MenuItem>
                  <MenuItem value="1h">За 1 час</MenuItem>
                  <MenuItem value="1d">За 1 день</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={2} label="Повестка" value={draft.agenda} onChange={(e) => setDraft((d) => ({ ...d, agenda: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth multiline minRows={3} label="Итоги встречи" value={draft.meeting_result} onChange={(e) => setDraft((d) => ({ ...d, meeting_result: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth multiline minRows={3} label="Следующие шаги" value={draft.next_steps} onChange={(e) => setDraft((d) => ({ ...d, next_steps: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveMeeting()} disabled={!draft.title.trim() || !draft.meeting_date || !draft.meeting_time}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Удалить мероприятие?</DialogTitle>
        <DialogContent>
          <Typography>Мероприятие будет удалено вместе со связями, историей переносов и связями с задачами.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()}>Удалить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(taskDialogMeeting)} onClose={() => setTaskDialogMeeting(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать задачу по итогам</DialogTitle>
        <DialogContent>
          <TextField sx={{ mt: 1 }} fullWidth label="Название задачи" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialogMeeting(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void createTask()} disabled={!taskTitle.trim()}>Создать</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
