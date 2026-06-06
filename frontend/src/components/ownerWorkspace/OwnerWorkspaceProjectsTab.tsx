import React from 'react';
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
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TaskAltIcon from '@mui/icons-material/TaskAlt';

import type { OwnerWorkspaceProject, User } from '../../types';

type ProjectSortBy = 'updated_at' | 'name' | 'active_tasks_count' | 'overdue_tasks_count' | 'contacts_count';

const PROJECT_STATUS_META: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' }> = {
  new: { label: 'Новый', color: 'primary' },
  active: { label: 'В работе', color: 'success' },
  in_progress: { label: 'В работе', color: 'success' },
  paused: { label: 'На паузе', color: 'warning' },
  on_pause: { label: 'На паузе', color: 'warning' },
  waiting: { label: 'На паузе', color: 'warning' },
  completed: { label: 'Завершен', color: 'default' },
  archived: { label: 'Завершен', color: 'default' },
};

function formatProjectUpdatedAt(value?: string | null): { relative: string; exact: string } {
  if (!value) return { relative: '—', exact: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { relative: '—', exact: '' };
  const exact = date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return { relative: exact, exact };
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return { relative: 'только что', exact };
  if (diffMs < hour) return { relative: `${Math.floor(diffMs / minute)} мин назад`, exact };
  if (diffMs < day) return { relative: `${Math.floor(diffMs / hour)} ч назад`, exact };
  if (diffMs < 7 * day) return { relative: `${Math.floor(diffMs / day)} дн назад`, exact };
  return { relative: exact, exact };
}

type OwnerWorkspaceProjectsTabProps = {
  projects: OwnerWorkspaceProject[];
  projectsCatalog: OwnerWorkspaceProject[];
  topOverdueProjects: OwnerWorkspaceProject[];
  projectStatusLabels: Record<string, string>;
  enabledProjectStatuses: string[];
  projectListStatus: string;
  projectListSearchInput: string;
  projectListOwnerId: number | '';
  projectListOverdueOnly: boolean;
  projectName: string;
  loading: boolean;
  loadError?: string | null;
  canCreateProjectUi: boolean;
  isWorkspaceFullAccess: boolean;
  userOptions: User[];
  userName: (userId?: number | null) => string;
  onProjectListStatusChange: (value: string) => void;
  onProjectListSearchInputChange: (value: string) => void;
  onProjectListOwnerIdChange: (value: number | '') => void;
  onProjectListOverdueOnlyChange: (value: boolean) => void;
  onProjectNameChange: (value: string) => void;
  onCreateProject: () => void | Promise<void>;
  onOpenProject: (project: OwnerWorkspaceProject) => void | Promise<void>;
  onEditProject: (project: OwnerWorkspaceProject) => void | Promise<void>;
  onCreateTaskForProject: (project: OwnerWorkspaceProject) => void | Promise<void>;
  onArchiveProject: (project: OwnerWorkspaceProject) => void | Promise<void>;
  onDeleteProject: (project: OwnerWorkspaceProject) => void | Promise<void>;
  onRetryLoad: () => void | Promise<void>;
  onOpenProjectOverdueTasks: (projectId: number) => void | Promise<void>;
};

export function OwnerWorkspaceProjectsTab({
  projects,
  projectsCatalog,
  topOverdueProjects,
  projectStatusLabels,
  enabledProjectStatuses,
  projectListStatus,
  projectListSearchInput,
  projectListOwnerId,
  projectListOverdueOnly,
  projectName,
  loading,
  loadError,
  canCreateProjectUi,
  isWorkspaceFullAccess,
  userOptions,
  userName,
  onProjectListStatusChange,
  onProjectListSearchInputChange,
  onProjectListOwnerIdChange,
  onProjectListOverdueOnlyChange,
  onProjectNameChange,
  onCreateProject,
  onOpenProject,
  onEditProject,
  onCreateTaskForProject,
  onArchiveProject,
  onDeleteProject,
  onRetryLoad,
  onOpenProjectOverdueTasks,
}: OwnerWorkspaceProjectsTabProps) {
  const [sortBy, setSortBy] = React.useState<ProjectSortBy>('updated_at');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [actionAnchorEl, setActionAnchorEl] = React.useState<HTMLElement | null>(null);
  const [actionProject, setActionProject] = React.useState<OwnerWorkspaceProject | null>(null);

  const subprojectsCountByProject = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const project of projectsCatalog) {
      if (project.parent_project_id == null) continue;
      map.set(project.parent_project_id, (map.get(project.parent_project_id) ?? 0) + 1);
    }
    return map;
  }, [projectsCatalog]);

  const hasActiveFilters = Boolean(
    projectListStatus || projectListSearchInput.trim() || projectListOwnerId !== '' || projectListOverdueOnly
  );

  const sortedProjects = React.useMemo(() => {
    const valueOf = (project: OwnerWorkspaceProject): string | number => {
      if (sortBy === 'name') return project.name.toLowerCase();
      if (sortBy === 'updated_at') return project.updated_at ? new Date(project.updated_at).getTime() : 0;
      return Number(project[sortBy] ?? 0);
    };
    return [...projects].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv, 'ru') : bv.localeCompare(av, 'ru');
      }
      const result = Number(av) - Number(bv);
      return sortDir === 'asc' ? result : -result;
    });
  }, [projects, sortBy, sortDir]);

  const closeActionMenu = () => {
    setActionAnchorEl(null);
    setActionProject(null);
  };

  const runProjectAction = (handler: (project: OwnerWorkspaceProject) => void | Promise<void>) => {
    if (!actionProject) return;
    const project = actionProject;
    closeActionMenu();
    void handler(project);
  };

  const submitCreateProject = async () => {
    if (!projectName.trim()) return;
    await onCreateProject();
    setCreateDialogOpen(false);
  };

  const renderProjectCard = (project: OwnerWorkspaceProject): React.ReactNode => {
    const subCount = subprojectsCountByProject.get(project.id) ?? project.subprojects_count ?? 0;
    const overdueCount = project.overdue_tasks_count ?? 0;
    const statusMeta = PROJECT_STATUS_META[String(project.status)] ?? {
      label: projectStatusLabels[project.status] ?? project.status,
      color: 'default' as const,
    };
    const updatedAt = formatProjectUpdatedAt(project.updated_at);

    return (
      <Card
        key={project.id}
        variant="outlined"
        onClick={() => void onOpenProject(project)}
        sx={{
          height: '100%',
          position: 'relative',
          cursor: 'pointer',
          borderColor: overdueCount > 0 ? 'rgba(220, 38, 38, 0.42)' : undefined,
          transition: 'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
          '&:hover': {
            borderColor: overdueCount > 0 ? 'rgba(220, 38, 38, 0.72)' : 'primary.main',
            boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
            transform: 'translateY(-1px)',
          },
        }}
      >
        {overdueCount > 0 && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: 12,
              right: 0,
              width: 4,
              height: 44,
              borderRadius: '6px 0 0 6px',
              bgcolor: 'error.main',
            }}
          />
        )}
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={800} noWrap title={project.name}>
                {project.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.15, display: 'block' }}>
                Ответственный: {userName(project.owner_id)}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.25}>
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  void onOpenProject(project);
                }}
                aria-label="Открыть"
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  setActionAnchorEl(event.currentTarget);
                  setActionProject(project);
                }}
                aria-label="Действия"
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
            <Chip size="small" color={statusMeta.color} label={statusMeta.label} />
            {overdueCount > 0 && <Chip size="small" color="error" label={`${overdueCount} просрочено`} />}
            <Chip size="small" color="success" variant="outlined" label={`Активные: ${project.active_tasks_count ?? 0}`} />
            <Chip size="small" label={`Задач всего: ${project.total_tasks_count ?? 0}`} />
            <Chip size="small" label={`Контактов: ${project.contacts_count}`} />
            <Chip size="small" variant="outlined" label={`Подпроектов: ${subCount}`} />
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.75, display: 'block' }}
            title={updatedAt.exact ? `Обновлён: ${updatedAt.exact}` : undefined}
          >
            Обновлён: {updatedAt.relative}
          </Typography>
        </CardContent>
      </Card>
    );
  };

  return (
    <Stack spacing={2}>
      {topOverdueProjects.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Проекты с самой большой просрочкой</Typography>
              <Typography variant="body2" color="text.secondary">
                Блок строится по текущей видимой выборке проектов и помогает быстро перейти к проблемным задачам.
              </Typography>
              <Grid container spacing={1.5}>
                {topOverdueProjects.map((project) => (
                  <Grid key={project.id} item xs={12} md={6} xl={4}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography variant="subtitle2">{project.name}</Typography>
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Chip size="small" color="warning" label={`Просрочено: ${project.overdue_tasks_count ?? 0}`} />
                            <Chip size="small" label={`Активных: ${project.active_tasks_count ?? 0}`} />
                            <Chip size="small" variant="outlined" label={`Всего: ${project.total_tasks_count ?? 0}`} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            Ответственный: <strong>{userName(project.owner_id)}</strong>
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Button size="small" variant="outlined" onClick={() => void onOpenProject(project)}>
                              Открыть проект
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => void onOpenProjectOverdueTasks(project.id)}
                            >
                              Просроченные задачи
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </CardContent>
        </Card>
      )}

      {loadError && !loading && (
        <Card variant="outlined">
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2">Не удалось загрузить проекты</Typography>
                <Typography variant="body2" color="text.secondary">{loadError}</Typography>
              </Box>
              <Button variant="outlined" onClick={() => void onRetryLoad()}>
                Повторить
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ md: 'center' }}>
            <TextField
              label="Поиск по названию/описанию"
              size="small"
              sx={{ minWidth: { xs: '100%', md: 320 }, flex: 1.6 }}
              value={projectListSearchInput}
              onChange={(e) => onProjectListSearchInputChange(e.target.value)}
            />
            <TextField
              select
              label="Статус"
              size="small"
              sx={{ minWidth: 160 }}
              value={projectListStatus}
              onChange={(e) => onProjectListStatusChange(e.target.value)}
            >
              <MenuItem value="">Все</MenuItem>
              {enabledProjectStatuses.map((status) => (
                <MenuItem key={status} value={status}>
                  {projectStatusLabels[status] ?? status}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Ответственный"
              size="small"
              sx={{ minWidth: 200 }}
              value={projectListOwnerId === '' ? '' : String(projectListOwnerId)}
              onChange={(e) => {
                const value = e.target.value;
                onProjectListOwnerIdChange(value === '' ? '' : Number(value));
              }}
            >
              <MenuItem value="">Все</MenuItem>
              {userOptions.map((user) => (
                <MenuItem key={user.id} value={String(user.id)}>
                  {user.full_name}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={<Checkbox checked={projectListOverdueOnly} onChange={(_, checked) => onProjectListOverdueOnlyChange(checked)} />}
              label="Только с просроченными"
              sx={{ mx: 0 }}
            />
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField
            select
            size="small"
            label="Сортировка"
            sx={{ minWidth: 220 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ProjectSortBy)}
          >
            <MenuItem value="updated_at">По дате обновления</MenuItem>
            <MenuItem value="name">По названию</MenuItem>
            <MenuItem value="active_tasks_count">По активным задачам</MenuItem>
            <MenuItem value="overdue_tasks_count">По просрочкам</MenuItem>
            <MenuItem value="contacts_count">По контактам</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Порядок"
            sx={{ minWidth: 150 }}
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
          >
            <MenuItem value="desc">По убыванию</MenuItem>
            <MenuItem value="asc">По возрастанию</MenuItem>
          </TextField>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          disabled={!canCreateProjectUi}
        >
          Создать проект
        </Button>
      </Stack>
      {!canCreateProjectUi && (
        <Alert severity="info">
          Создание новых проектов доступно только admin / owner.
        </Alert>
      )}
      {!isWorkspaceFullAccess && canCreateProjectUi && (
        <Alert severity="info">
          Создание новых проектов разрешено для ограниченных ролей текущей policy-моделью.
        </Alert>
      )}

      <Grid container spacing={1.5}>
        {sortedProjects.map((project) => (
          <Grid item xs={12} sm={6} lg={6} key={project.id}>
            {renderProjectCard(project)}
          </Grid>
        ))}
        {sortedProjects.length === 0 && !loading && (
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent sx={{ py: 4, textAlign: 'center' }}>
                {projectsCatalog.length === 0 && !hasActiveFilters ? (
                  <Stack spacing={1.5} alignItems="center">
                    <Typography variant="h6">У вас пока нет проектов</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Создайте первый проект, чтобы начать работу
                    </Typography>
                    <Button variant="contained" startIcon={<AddIcon />} disabled={!canCreateProjectUi} onClick={() => setCreateDialogOpen(true)}>
                      Создать проект
                    </Button>
                  </Stack>
                ) : (
                  <Stack spacing={1} alignItems="center">
                    <Typography variant="h6">Проекты не найдены</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Попробуйте изменить фильтры или поисковый запрос
                    </Typography>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      <Menu
        anchorEl={actionAnchorEl}
        open={Boolean(actionAnchorEl)}
        onClose={closeActionMenu}
        onClick={(event) => event.stopPropagation()}
      >
        <MenuItem onClick={() => runProjectAction(onOpenProject)}>
          <OpenInNewIcon fontSize="small" sx={{ mr: 1 }} />
          Открыть проект
        </MenuItem>
        <MenuItem onClick={() => runProjectAction(onEditProject)}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Редактировать
        </MenuItem>
        <MenuItem onClick={() => runProjectAction(onCreateTaskForProject)}>
          <TaskAltIcon fontSize="small" sx={{ mr: 1 }} />
          Создать задачу
        </MenuItem>
        <MenuItem onClick={() => runProjectAction(onArchiveProject)}>
          Архивировать
        </MenuItem>
        <MenuItem onClick={() => runProjectAction(onDeleteProject)} sx={{ color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Удалить
        </MenuItem>
      </Menu>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать проект</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Название проекта"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              disabled={!canCreateProjectUi}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void submitCreateProject()} disabled={!canCreateProjectUi || !projectName.trim()}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
