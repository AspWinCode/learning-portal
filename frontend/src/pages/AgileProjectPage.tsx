import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Drawer, Grid, IconButton, InputAdornment, LinearProgress, List, ListItem,
  ListItemAvatar, ListItemText, MenuItem, Paper,
  Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack,
  BugReport,
  CheckCircleOutline,
  Close as CloseIcon,
  Delete as DeleteIcon,
  EditNote as EditNoteIcon,
  Flag as FlagIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  PersonAdd as PersonAddIcon,
  PlayArrow,
  RocketLaunch,
  Search as SearchIcon,
  Send as SendIcon,
  SportsScore,
  Timeline,
  ViewKanban,
} from '@mui/icons-material';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import Layout from '../components/Layout';
import { agileApi } from '../services/api/agile';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';
import type {
  ItAnalytics, ItBacklog, ItBoard, ItEpic, ItIssue,
  ItIssueShort, ItIssueStatus, ItIssueType, ItMemberRole, ItProject, ItSprint,
} from '../types';
import {
  IT_EPIC_STATUS_LABELS, IT_ISSUE_PRIORITY_LABELS,
  IT_ISSUE_STATUS_LABELS, IT_ISSUE_TYPE_LABELS,
  IT_MEMBER_ROLE_LABELS, IT_SPRINT_STATUS_LABELS,
} from '../types';
import { api } from '../services/api/client';

// ─── Константы ────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#d32f2f',
  high: '#f57c00',
  medium: '#1976d2',
  low: '#757575',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  story: <RocketLaunch sx={{ fontSize: 14 }} />,
  bug: <BugReport sx={{ fontSize: 14 }} />,
  task: <CheckCircleOutline sx={{ fontSize: 14 }} />,
  chore: <EditNoteIcon sx={{ fontSize: 14 }} />,
};

const STATUS_COLORS_CHIP: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  todo: 'default',
  in_progress: 'info',
  review: 'warning',
  done: 'success',
};

// ─── Карточка задачи на доске ─────────────────────────────────────────────

const IssueCard: React.FC<{ issue: ItIssueShort; projectKey: string; onClick: () => void }> = ({ issue, projectKey, onClick }) => (
  <Card
    variant="outlined"
    sx={{
      mb: 1, cursor: 'pointer',
      '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
      transition: 'all 0.15s',
    }}
    onClick={onClick}
  >
    <CardContent sx={{ p: '10px !important' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Box sx={{ color: PRIORITY_COLORS[issue.priority] }}>{TYPE_ICONS[issue.type]}</Box>
        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
          {projectKey}-{issue.number}
        </Typography>
        {issue.story_points != null && (
          <Chip label={issue.story_points} size="small" sx={{ ml: 'auto', fontSize: 11, height: 18, minWidth: 24 }} />
        )}
      </Box>
      <Typography variant="body2" fontWeight={500} sx={{ lineHeight: 1.35, mb: 0.5 }}>
        {issue.title}
      </Typography>
      {issue.epic_title && (
        <Chip
          label={issue.epic_title}
          size="small"
          sx={{ fontSize: 10, height: 16, bgcolor: issue.epic_color || '#7c3aed', color: '#fff', mb: 0.5 }}
        />
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        {issue.assignee_name && (
          <Chip
            icon={<PersonIcon sx={{ fontSize: 12 }} />}
            label={issue.assignee_name.split(' ')[0]}
            size="small"
            variant="outlined"
            sx={{ fontSize: 10, height: 18 }}
          />
        )}
        {issue.checklist_total > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            ✓ {issue.checklist_done}/{issue.checklist_total}
          </Typography>
        )}
      </Box>
    </CardContent>
  </Card>
);

// ─── Главный компонент ────────────────────────────────────────────────────

const AgileProjectPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState<ItProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);

  const [board, setBoard] = useState<ItBoard | null>(null);
  const [backlog, setBacklog] = useState<ItBacklog | null>(null);
  const [sprints, setSprints] = useState<ItSprint[]>([]);
  const [epics, setEpics] = useState<ItEpic[]>([]);
  const [analytics, setAnalytics] = useState<ItAnalytics | null>(null);

  const [members, setMembers] = useState<any[]>([]);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [addMemberRole, setAddMemberRole] = useState<ItMemberRole>('member');

  const [selectedIssue, setSelectedIssue] = useState<ItIssue | null>(null);
  const [issueDrawerOpen, setIssueDrawerOpen] = useState(false);

  // Создание задачи
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [createIssueForm, setCreateIssueForm] = useState<{
    title: string; type: ItIssueType; priority: string;
    epic_id: string; sprint_id: string; story_points: string; description: string;
  }>({ title: '', type: 'task', priority: 'medium', epic_id: '', sprint_id: '', story_points: '', description: '' });
  const [createIssueErr, setCreateIssueErr] = useState('');

  // Создание спринта
  const [createSprintOpen, setCreateSprintOpen] = useState(false);
  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', start_date: '', end_date: '' });

  // Создание эпика
  const [createEpicOpen, setCreateEpicOpen] = useState(false);
  const [epicForm, setEpicForm] = useState({ title: '', description: '', color: '#7c3aed', start_date: '', end_date: '' });

  // Комментарий в drawer
  const [commentText, setCommentText] = useState('');

  const isAdmin = hasPermission(user, '*') || hasPermission(user, 'agile.admin');
  const canManage = isAdmin || hasPermission(user, 'agile.manage');

  // ── загрузка данных ─────────────────────────────────────────────────────

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = await agileApi.getProject(id);
      setProject(p);
    } catch {
      setError('Проект не найден или нет доступа');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadBoard = useCallback(async () => {
    try { setBoard(await agileApi.getBoard(id)); } catch {}
  }, [id]);

  const loadBacklog = useCallback(async () => {
    try { setBacklog(await agileApi.getBacklog(id)); } catch {}
  }, [id]);

  const loadSprints = useCallback(async () => {
    try { setSprints(await agileApi.listSprints(id)); } catch {}
  }, [id]);

  const loadEpics = useCallback(async () => {
    try { setEpics(await agileApi.listEpics(id)); } catch {}
  }, [id]);

  const loadAnalytics = useCallback(async () => {
    try { setAnalytics(await agileApi.getAnalytics(id)); } catch {}
  }, [id]);

  const loadMembers = useCallback(async () => {
    try { setMembers(await agileApi.listMembers(id)); } catch {}
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  useEffect(() => {
    if (!project) return;
    if (tab === 0) loadBoard();
    if (tab === 1) { loadBacklog(); loadEpics(); }
    if (tab === 2) loadSprints();
    if (tab === 3) loadEpics();
    if (tab === 4) loadAnalytics();
    if (tab === 5) loadMembers();
  }, [tab, project]);

  // ── действия со спринтом ────────────────────────────────────────────────

  const handleStartSprint = async (sprintId: number) => {
    try {
      await agileApi.startSprint(id, sprintId);
      loadSprints();
      if (tab === 0) loadBoard();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Ошибка запуска спринта');
    }
  };

  const handleCompleteSprint = async (sprintId: number) => {
    if (!window.confirm('Завершить спринт? Незакрытые задачи вернутся в бэклог.')) return;
    try {
      await agileApi.completeSprint(id, sprintId, true);
      loadSprints();
      if (tab === 0) loadBoard();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Ошибка завершения спринта');
    }
  };

  // ── создание задачи ─────────────────────────────────────────────────────

  const handleCreateIssue = async () => {
    if (!createIssueForm.title.trim()) { setCreateIssueErr('Введите название задачи'); return; }
    setCreateIssueErr('');
    try {
      await agileApi.createIssue(id, {
        title: createIssueForm.title.trim(),
        type: createIssueForm.type,
        priority: createIssueForm.priority,
        description: createIssueForm.description.trim() || undefined,
        epic_id: createIssueForm.epic_id ? Number(createIssueForm.epic_id) : undefined,
        sprint_id: createIssueForm.sprint_id ? Number(createIssueForm.sprint_id) : undefined,
        story_points: createIssueForm.story_points ? Number(createIssueForm.story_points) : undefined,
      });
      setCreateIssueOpen(false);
      setCreateIssueForm({ title: '', type: 'task', priority: 'medium', epic_id: '', sprint_id: '', story_points: '', description: '' });
      if (tab === 0) loadBoard();
      if (tab === 1) loadBacklog();
    } catch (e: any) {
      setCreateIssueErr(e?.response?.data?.detail || 'Ошибка создания задачи');
    }
  };

  // ── создание спринта ────────────────────────────────────────────────────

  const handleCreateSprint = async () => {
    if (!sprintForm.name.trim()) return;
    try {
      await agileApi.createSprint(id, {
        name: sprintForm.name.trim(),
        goal: sprintForm.goal.trim() || undefined,
        start_date: sprintForm.start_date || undefined,
        end_date: sprintForm.end_date || undefined,
      } as any);
      setCreateSprintOpen(false);
      setSprintForm({ name: '', goal: '', start_date: '', end_date: '' });
      loadSprints();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Ошибка создания спринта');
    }
  };

  // ── создание эпика ──────────────────────────────────────────────────────

  const handleCreateEpic = async () => {
    if (!epicForm.title.trim()) return;
    try {
      await agileApi.createEpic(id, {
        title: epicForm.title.trim(),
        description: epicForm.description.trim() || undefined,
        color: epicForm.color,
        start_date: epicForm.start_date || undefined,
        end_date: epicForm.end_date || undefined,
      } as any);
      setCreateEpicOpen(false);
      setEpicForm({ title: '', description: '', color: '#7c3aed', start_date: '', end_date: '' });
      loadEpics();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Ошибка создания эпика');
    }
  };

  // ── смена статуса задачи ────────────────────────────────────────────────

  const handleMoveIssue = async (issueId: number, newStatus: ItIssueStatus) => {
    try {
      await agileApi.moveIssue(id, issueId, { status: newStatus });
      loadBoard();
    } catch {}
  };

  // ── открытие задачи ─────────────────────────────────────────────────────

  const openIssue = async (issueId: number) => {
    try {
      const issue = await agileApi.getIssue(id, issueId);
      setSelectedIssue(issue);
      setIssueDrawerOpen(true);
    } catch {}
  };

  // ── добавить комментарий ────────────────────────────────────────────────

  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedIssue) return;
    try {
      await agileApi.addComment(id, selectedIssue.id, commentText.trim());
      setCommentText('');
      const updated = await agileApi.getIssue(id, selectedIssue.id);
      setSelectedIssue(updated);
    } catch {}
  };

  // ── участники ────────────────────────────────────────────────────────────

  const [allUsers, setAllUsers] = useState<any[]>([]);

  const handleOpenAddMember = async () => {
    setAddMemberOpen(true);
    if (allUsers.length === 0) {
      setMemberSearchLoading(true);
      try {
        const res = await api.get('/api/users/', { params: { limit: 200 } });
        setAllUsers(res.data?.items || res.data || []);
      } catch {
        setAllUsers([]);
      } finally {
        setMemberSearchLoading(false);
      }
    }
  };

  const handleMemberSearchChange = (value: string) => {
    setMemberSearch(value);
    if (!value.trim()) { setMemberSearchResults([]); return; }
    const q = value.toLowerCase();
    const existing = new Set(members.map((m: any) => m.user_id));
    setMemberSearchResults(
      allUsers.filter((u: any) =>
        !existing.has(u.id) &&
        ((u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      ).slice(0, 10)
    );
  };

  const handleAddMember = async (userId: number) => {
    try {
      await agileApi.addMember(id, userId, addMemberRole);
      setAddMemberOpen(false);
      setMemberSearch('');
      setMemberSearchResults([]);
      setAddMemberRole('member');
      loadMembers();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Ошибка добавления участника');
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!window.confirm('Удалить участника из проекта?')) return;
    try {
      await agileApi.removeMember(id, userId);
      loadMembers();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Ошибка удаления участника');
    }
  };

  const handleUpdateMemberRole = async (userId: number, role: ItMemberRole) => {
    try {
      await agileApi.updateMember(id, userId, role);
      loadMembers();
    } catch {}
  };

  // ── чеклист ─────────────────────────────────────────────────────────────

  const handleChecklistToggle = async (itemId: number, completed: boolean) => {
    if (!selectedIssue) return;
    try {
      await agileApi.updateChecklistItem(id, selectedIssue.id, itemId, { completed });
      const updated = await agileApi.getIssue(id, selectedIssue.id);
      setSelectedIssue(updated);
      if (tab === 0) loadBoard();
    } catch {}
  };

  if (loading) return <Layout><Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box></Layout>;
  if (error) return <Layout><Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box></Layout>;
  if (!project) return null;

  const projectKey = project.key;

  // ── Вкладка: Доска ───────────────────────────────────────────────────────

  const BoardTab = () => (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        {board?.sprint ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={board.sprint.name} color="info" />
            <Typography variant="body2" color="text.secondary">
              {board.sprint.start_date} — {board.sprint.end_date}
            </Typography>
            {board.sprint.total_points != null && (
              <Typography variant="body2" color="text.secondary">
                {board.sprint.done_points}/{board.sprint.total_points} SP
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">Нет активного спринта — показан бэклог</Typography>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          {canManage && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateIssueOpen(true)}>
              Задача
            </Button>
          )}
        </Box>
      </Box>
      {!board ? (
        <CircularProgress />
      ) : (
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, minHeight: 400 }}>
          {board.columns.map(col => (
            <Box key={col.status} sx={{ minWidth: 260, flex: '0 0 260px' }}>
              <Box sx={{
                p: 1.5, mb: 1, borderRadius: 1,
                bgcolor: col.status === 'done' ? 'success.50' : 'grey.100',
                display: 'flex', alignItems: 'center', gap: 1,
              }}>
                <Typography variant="subtitle2" fontWeight={700}>{col.label}</Typography>
                <Chip label={col.issues.length} size="small" sx={{ ml: 'auto', height: 20, fontSize: 11 }} />
              </Box>
              <Box>
                {col.issues.map(issue => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    projectKey={projectKey}
                    onClick={() => openIssue(issue.id)}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  // ── Вкладка: Бэклог ──────────────────────────────────────────────────────

  const BacklogTab = () => (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {canManage && (
          <>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateIssueOpen(true)}>Задача</Button>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateEpicOpen(true)}>Эпик</Button>
          </>
        )}
      </Box>
      {!backlog ? <CircularProgress /> : backlog.groups.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
          <Typography>Бэклог пуст</Typography>
        </Box>
      ) : (
        backlog.groups.map((group, gi) => (
          <Box key={gi} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, pb: 1, borderBottom: '2px solid', borderColor: group.epic_color || 'divider' }}>
              {group.epic_title ? (
                <>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: group.epic_color || '#7c3aed' }} />
                  <Typography variant="subtitle2" fontWeight={700}>{group.epic_title}</Typography>
                </>
              ) : (
                <Typography variant="subtitle2" color="text.secondary">Без эпика</Typography>
              )}
              <Chip label={group.issues.length} size="small" sx={{ ml: 'auto', height: 20 }} />
            </Box>
            {group.issues.map(issue => (
              <Box
                key={issue.id}
                onClick={() => openIssue(issue.id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  p: 1, mb: 0.5, borderRadius: 1, cursor: 'pointer',
                  border: '1px solid transparent',
                  '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
                }}
              >
                <Box sx={{ color: PRIORITY_COLORS[issue.priority] }}>{TYPE_ICONS[issue.type]}</Box>
                <Typography variant="caption" color="text.secondary" fontFamily="monospace" sx={{ minWidth: 55 }}>
                  {projectKey}-{issue.number}
                </Typography>
                <Typography variant="body2" sx={{ flex: 1 }}>{issue.title}</Typography>
                <Chip label={IT_ISSUE_STATUS_LABELS[issue.status]} size="small" color={STATUS_COLORS_CHIP[issue.status]} sx={{ fontSize: 10 }} />
                {issue.story_points != null && (
                  <Chip label={`${issue.story_points} SP`} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                )}
                {issue.assignee_name && (
                  <Typography variant="caption" color="text.secondary">{issue.assignee_name.split(' ')[0]}</Typography>
                )}
              </Box>
            ))}
          </Box>
        ))
      )}
    </Box>
  );

  // ── Вкладка: Спринты ─────────────────────────────────────────────────────

  const SprintsTab = () => (
    <Box>
      {canManage && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateSprintOpen(true)} sx={{ mb: 2 }}>
          Новый спринт
        </Button>
      )}
      {sprints.length === 0 ? (
        <Typography color="text.secondary">Спринтов ещё нет</Typography>
      ) : (
        sprints.map(sprint => (
          <Card key={sprint.id} variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="h6" fontWeight={600}>{sprint.name}</Typography>
                    <Chip
                      label={IT_SPRINT_STATUS_LABELS[sprint.status]}
                      size="small"
                      color={sprint.status === 'active' ? 'success' : sprint.status === 'planning' ? 'info' : 'default'}
                    />
                  </Box>
                  {sprint.goal && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>🎯 {sprint.goal}</Typography>}
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {sprint.start_date && <Typography variant="caption" color="text.secondary">Начало: {sprint.start_date}</Typography>}
                    {sprint.end_date && <Typography variant="caption" color="text.secondary">Конец: {sprint.end_date}</Typography>}
                    <Typography variant="caption" color="text.secondary">{sprint.issue_count ?? 0} задач</Typography>
                    {sprint.total_points != null && (
                      <Typography variant="caption" color="text.secondary">
                        {sprint.done_points}/{sprint.total_points} SP
                      </Typography>
                    )}
                  </Box>
                  {sprint.total_points != null && sprint.total_points > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={Math.round(100 * (sprint.done_points || 0) / sprint.total_points)}
                      sx={{ mt: 1, height: 6, borderRadius: 3 }}
                    />
                  )}
                </Box>
                {canManage && (
                  <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                    {sprint.status === 'planning' && (
                      <Button size="small" variant="outlined" color="success" startIcon={<PlayArrow />}
                        onClick={() => handleStartSprint(sprint.id)}>
                        Запустить
                      </Button>
                    )}
                    {sprint.status === 'active' && (
                      <Button size="small" variant="outlined" color="warning" startIcon={<SportsScore />}
                        onClick={() => handleCompleteSprint(sprint.id)}>
                        Завершить
                      </Button>
                    )}
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );

  // ── Вкладка: Эпики ───────────────────────────────────────────────────────

  const EpicsTab = () => (
    <Box>
      {canManage && (
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateEpicOpen(true)} sx={{ mb: 2 }}>
          Новый эпик
        </Button>
      )}
      {epics.length === 0 ? (
        <Typography color="text.secondary">Эпиков ещё нет</Typography>
      ) : (
        <Grid container spacing={2}>
          {epics.map(epic => {
            const pct = epic.issue_count ? Math.round(100 * (epic.done_count || 0) / epic.issue_count) : 0;
            return (
              <Grid item xs={12} sm={6} md={4} key={epic.id}>
                <Card variant="outlined" sx={{ borderLeft: `4px solid ${epic.color}` }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: epic.color, mt: 0.5, flexShrink: 0 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" fontWeight={600}>{epic.title}</Typography>
                        {epic.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{epic.description}</Typography>
                        )}
                      </Box>
                      <Chip label={IT_EPIC_STATUS_LABELS[epic.status]} size="small" variant="outlined" />
                    </Box>
                    {epic.start_date && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {epic.start_date} — {epic.end_date || '…'}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <LinearProgress
                        variant="determinate" value={pct}
                        sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: `${epic.color}30`, '& .MuiLinearProgress-bar': { bgcolor: epic.color } }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {epic.done_count}/{epic.issue_count}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );

  // ── Вкладка: Аналитика ───────────────────────────────────────────────────

  const AnalyticsTab = () => {
    if (!analytics) return <CircularProgress />;
    const typeLabels = { story: 'Истории', bug: 'Баги', task: 'Задачи', chore: 'Техдолг' };
    const prioLabels = { critical: 'Критич.', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
    const typeData = Object.entries(analytics.by_type).map(([k, v]) => ({ name: (typeLabels as any)[k] || k, value: v }));
    const prioData = Object.entries(analytics.by_priority).map(([k, v]) => ({ name: (prioLabels as any)[k] || k, value: v }));

    return (
      <Box>
        {/* Итоги */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Средн. время выполнения', value: analytics.cycle_time_avg_days != null ? `${analytics.cycle_time_avg_days} дн.` : '—' },
            { label: 'Задач в спринте', value: analytics.sprint?.issue_count ?? '—' },
            { label: 'Story Points выполнено', value: analytics.sprint ? `${analytics.sprint.done_points}/${analytics.sprint.total_points}` : '—' },
          ].map(item => (
            <Grid item xs={12} sm={4} key={item.label}>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5" fontWeight={700}>{item.value}</Typography>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* Burndown */}
        {analytics.burndown.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Burndown chart</Typography>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={analytics.burndown}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip />
                <Legend />
                <Line type="monotone" dataKey="planned" stroke="#9e9e9e" name="План" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="actual" stroke="#1976d2" name="Факт" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* Velocity */}
        {analytics.velocity.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Velocity (последние спринты)</Typography>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={analytics.velocity}>
                <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="done_points" name="SP выполнено" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* По типу и приоритету */}
        <Grid container spacing={2}>
          {typeData.length > 0 && (
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>По типу</Typography>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={typeData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Bar dataKey="value" name="Задач" fill="#1976d2" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Grid>
          )}
          {prioData.length > 0 && (
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>По приоритету</Typography>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={prioData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Bar dataKey="value" name="Задач" fill="#f57c00" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Grid>
          )}
        </Grid>
      </Box>
    );
  };

  // ── Вкладка: Команда ─────────────────────────────────────────────────────

  const TeamTab = () => (
    <Box>
      {canManage && (
        <Button size="small" startIcon={<PersonAddIcon />} onClick={handleOpenAddMember} sx={{ mb: 2 }}>
          Добавить участника
        </Button>
      )}
      {members.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
          <GroupIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
          <Typography>Участников пока нет</Typography>
        </Box>
      ) : (
        <List disablePadding>
          {members.map((m: any) => (
            <ListItem
              key={m.user_id}
              disableGutters
              sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
              secondaryAction={
                canManage && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                      select size="small" value={m.role}
                      onChange={e => handleUpdateMemberRole(m.user_id, e.target.value as ItMemberRole)}
                      sx={{ minWidth: 130 }}
                    >
                      {(Object.entries(IT_MEMBER_ROLE_LABELS) as [ItMemberRole, string][]).map(([k, v]) => (
                        <MenuItem key={k} value={k}>{v}</MenuItem>
                      ))}
                    </TextField>
                    <Tooltip title="Удалить из проекта">
                      <IconButton size="small" color="error" onClick={() => handleRemoveMember(m.user_id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )
              }
            >
              <ListItemAvatar>
                <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
                  {(m.full_name || m.email || '?').charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={m.full_name || m.email}
                secondary={m.full_name ? m.email : undefined}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              {!canManage && (
                <Chip label={IT_MEMBER_ROLE_LABELS[m.role as ItMemberRole] || m.role} size="small" variant="outlined" sx={{ mr: 1 }} />
              )}
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        {/* Шапка проекта */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <IconButton size="small" onClick={() => navigate('/agile')}><ArrowBack /></IconButton>
          <Chip label={project.key} color="primary" sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
          <Typography variant="h5" fontWeight={700}>{project.name}</Typography>
          {project.status === 'archived' && <Chip label="Архив" size="small" />}
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            {canManage && (
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreateIssueOpen(true)}>
                Задача
              </Button>
            )}
          </Box>
        </Box>

        {/* Вкладки */}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<ViewKanban />} iconPosition="start" label="Доска" />
          <Tab icon={<CheckCircleOutline />} iconPosition="start" label="Бэклог" />
          <Tab icon={<PlayArrow />} iconPosition="start" label="Спринты" />
          <Tab icon={<FlagIcon />} iconPosition="start" label="Эпики" />
          <Tab icon={<Timeline />} iconPosition="start" label="Аналитика" />
          <Tab icon={<GroupIcon />} iconPosition="start" label="Команда" />
        </Tabs>

        {tab === 0 && <BoardTab />}
        {tab === 1 && <BacklogTab />}
        {tab === 2 && <SprintsTab />}
        {tab === 3 && <EpicsTab />}
        {tab === 4 && <AnalyticsTab />}
        {tab === 5 && <TeamTab />}
      </Box>

      {/* ── Drawer: детали задачи ── */}
      <Drawer
        anchor="right"
        open={issueDrawerOpen}
        onClose={() => setIssueDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 0 } }}
      >
        {selectedIssue && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Заголовок drawer */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: PRIORITY_COLORS[selectedIssue.priority] }}>{TYPE_ICONS[selectedIssue.type]}</Box>
              <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                {projectKey}-{selectedIssue.number}
              </Typography>
              <IconButton size="small" sx={{ ml: 'auto' }} onClick={() => setIssueDrawerOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{selectedIssue.title}</Typography>

              {/* Метаданные */}
              <Grid container spacing={1} sx={{ mb: 2 }}>
                {[
                  { label: 'Тип', value: IT_ISSUE_TYPE_LABELS[selectedIssue.type] },
                  { label: 'Приоритет', value: IT_ISSUE_PRIORITY_LABELS[selectedIssue.priority] },
                  { label: 'Исполнитель', value: selectedIssue.assignee_name || '—' },
                  { label: 'Story Points', value: selectedIssue.story_points ?? '—' },
                  ...(selectedIssue.epic_title ? [{ label: 'Эпик', value: selectedIssue.epic_title }] : []),
                  ...(selectedIssue.due_date ? [{ label: 'Срок', value: selectedIssue.due_date }] : []),
                ].map(({ label, value }) => (
                  <Grid item xs={6} key={label}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2">{value}</Typography>
                  </Grid>
                ))}
              </Grid>

              {/* Статус */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Статус</Typography>
                <TextField
                  select size="small"
                  value={selectedIssue.status}
                  onChange={async e => {
                    const newStatus = e.target.value as ItIssueStatus;
                    await handleMoveIssue(selectedIssue.id, newStatus);
                    setSelectedIssue(s => s ? { ...s, status: newStatus } : s);
                  }}
                  fullWidth
                >
                  {Object.entries(IT_ISSUE_STATUS_LABELS).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v}</MenuItem>
                  ))}
                </TextField>
              </Box>

              {/* Описание */}
              {selectedIssue.description && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Описание</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selectedIssue.description}</Typography>
                </Box>
              )}

              {/* Чеклист */}
              {selectedIssue.checklist.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Чеклист ({selectedIssue.checklist.filter(c => c.completed).length}/{selectedIssue.checklist.length})
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.round(100 * selectedIssue.checklist.filter(c => c.completed).length / selectedIssue.checklist.length)}
                    sx={{ mb: 1, height: 4, borderRadius: 2 }}
                  />
                  {selectedIssue.checklist.map(item => (
                    <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={e => handleChecklistToggle(item.id, e.target.checked)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                      <Typography variant="body2" sx={{ textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'text.secondary' : 'text.primary' }}>
                        {item.text}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Комментарии */}
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Комментарии ({selectedIssue.comments.length})
              </Typography>
              {selectedIssue.comments.map(cm => (
                <Box key={cm.id} sx={{ mb: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={700}>{cm.author_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(cm.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{cm.text}</Typography>
                </Box>
              ))}

              {/* Поле ввода комментария */}
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                <TextField
                  size="small" fullWidth multiline maxRows={3}
                  placeholder="Написать комментарий..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddComment(); }}
                />
                <IconButton color="primary" onClick={handleAddComment} disabled={!commentText.trim()}>
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          </Box>
        )}
      </Drawer>

      {/* ── Диалог создания задачи ── */}
      <Dialog open={createIssueOpen} onClose={() => setCreateIssueOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новая задача</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {createIssueErr && <Alert severity="error">{createIssueErr}</Alert>}
          <TextField
            label="Название" required autoFocus fullWidth
            value={createIssueForm.title}
            onChange={e => setCreateIssueForm(f => ({ ...f, title: e.target.value }))}
          />
          <TextField
            label="Описание" fullWidth multiline rows={2}
            value={createIssueForm.description}
            onChange={e => setCreateIssueForm(f => ({ ...f, description: e.target.value }))}
          />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField select label="Тип" fullWidth value={createIssueForm.type}
                onChange={e => setCreateIssueForm(f => ({ ...f, type: e.target.value as ItIssueType }))}>
                {Object.entries(IT_ISSUE_TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField select label="Приоритет" fullWidth value={createIssueForm.priority}
                onChange={e => setCreateIssueForm(f => ({ ...f, priority: e.target.value }))}>
                {Object.entries(IT_ISSUE_PRIORITY_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField select label="Эпик" fullWidth value={createIssueForm.epic_id}
                onChange={e => setCreateIssueForm(f => ({ ...f, epic_id: e.target.value }))}>
                <MenuItem value="">Без эпика</MenuItem>
                {epics.map(e => <MenuItem key={e.id} value={String(e.id)}>{e.title}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField select label="Спринт" fullWidth value={createIssueForm.sprint_id}
                onChange={e => setCreateIssueForm(f => ({ ...f, sprint_id: e.target.value }))}>
                <MenuItem value="">Бэклог</MenuItem>
                {sprints.filter(s => s.status !== 'completed').map(s => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField label="Story Points" type="number" fullWidth value={createIssueForm.story_points}
                onChange={e => setCreateIssueForm(f => ({ ...f, story_points: e.target.value }))}
                inputProps={{ min: 1 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateIssueOpen(false)}>Отмена</Button>
          <Button onClick={handleCreateIssue} variant="contained">Создать</Button>
        </DialogActions>
      </Dialog>

      {/* ── Диалог создания спринта ── */}
      <Dialog open={createSprintOpen} onClose={() => setCreateSprintOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новый спринт</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Название" required autoFocus fullWidth value={sprintForm.name}
            onChange={e => setSprintForm(f => ({ ...f, name: e.target.value }))} />
          <TextField label="Цель спринта" fullWidth multiline rows={2} value={sprintForm.goal}
            onChange={e => setSprintForm(f => ({ ...f, goal: e.target.value }))} />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Дата начала" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={sprintForm.start_date} onChange={e => setSprintForm(f => ({ ...f, start_date: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Дата окончания" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={sprintForm.end_date} onChange={e => setSprintForm(f => ({ ...f, end_date: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateSprintOpen(false)}>Отмена</Button>
          <Button onClick={handleCreateSprint} variant="contained">Создать</Button>
        </DialogActions>
      </Dialog>

      {/* ── Диалог добавления участника ── */}
      <Dialog
        open={addMemberOpen}
        onClose={() => { setAddMemberOpen(false); setMemberSearch(''); setMemberSearchResults([]); setAllUsers([]); }}
        maxWidth="sm" fullWidth
      >
        <DialogTitle>Добавить участника</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Поиск по имени или email" fullWidth autoFocus
            value={memberSearch}
            onChange={e => handleMemberSearchChange(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: memberSearchLoading ? <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment> : null,
            }}
          />
          {memberSearchResults.length > 0 && (
            <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 260, overflow: 'auto' }}>
              {memberSearchResults.map((u: any) => (
                <ListItem
                  key={u.id}
                  button
                  onClick={() => handleAddMember(u.id)}
                  sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'secondary.main' }}>
                      {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={u.full_name || u.email}
                    secondary={u.full_name ? u.email : undefined}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Chip label={u.role} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                </ListItem>
              ))}
            </List>
          )}
          {memberSearch.trim() && !memberSearchLoading && memberSearchResults.length === 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center">Пользователи не найдены</Typography>
          )}
          <TextField
            select label="Роль в проекте" value={addMemberRole}
            onChange={e => setAddMemberRole(e.target.value as ItMemberRole)}
          >
            {(Object.entries(IT_MEMBER_ROLE_LABELS) as [ItMemberRole, string][]).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddMemberOpen(false); setMemberSearch(''); setMemberSearchResults([]); setAllUsers([]); }}>
            Отмена
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Диалог создания эпика ── */}
      <Dialog open={createEpicOpen} onClose={() => setCreateEpicOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новый эпик</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Название" required autoFocus fullWidth value={epicForm.title}
            onChange={e => setEpicForm(f => ({ ...f, title: e.target.value }))} />
          <TextField label="Описание" fullWidth multiline rows={2} value={epicForm.description}
            onChange={e => setEpicForm(f => ({ ...f, description: e.target.value }))} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">Цвет:</Typography>
            <input type="color" value={epicForm.color} onChange={e => setEpicForm(f => ({ ...f, color: e.target.value }))}
              style={{ width: 48, height: 36, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Дата начала" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={epicForm.start_date} onChange={e => setEpicForm(f => ({ ...f, start_date: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Дата окончания" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={epicForm.end_date} onChange={e => setEpicForm(f => ({ ...f, end_date: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateEpicOpen(false)}>Отмена</Button>
          <Button onClick={handleCreateEpic} variant="contained">Создать</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default AgileProjectPage;
