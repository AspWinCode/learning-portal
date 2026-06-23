import React from 'react';
import {
  Alert,
  Autocomplete,
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
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';

import type { OwnerWorkspaceContact, OwnerWorkspaceProject, User } from '../../types';
import { applyPhoneMask, isValidPhone } from '../../utils/phoneMask';

type ContactViewMode = 'table' | 'cards';
type ContactSortBy = 'full_name' | 'company' | 'projects' | 'active_tasks' | 'last_interaction' | 'owner';
type ActivityFilter = 'all' | 'active' | 'stale_30' | 'stale_90';
type ActiveTaskFilter = 'all' | 'has' | 'none';

type ContactCreatePayload = {
  full_name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  tags?: string[];
  comment?: string | null;
  project_ids?: number[];
};

type OwnerWorkspaceContactsTabProps = {
  contacts: OwnerWorkspaceContact[];
  contactsCatalog: OwnerWorkspaceContact[];
  projectsCatalogSorted: OwnerWorkspaceProject[];
  contactListTagOptions: string[];
  contactListSearchInput: string;
  contactListProjectId: number | '';
  contactListTag: string;
  contactListActiveTasksOnly: boolean;
  contactName: string;
  contactPhone: string;
  newContactProjectId: number | '';
  loading: boolean;
  loadError?: string | null;
  canCreateContactUi: boolean;
  isWorkspaceFullAccess: boolean;
  userOptions: User[];
  userName: (userId?: number | null) => string;
  onContactListSearchInputChange: (value: string) => void;
  onContactListProjectIdChange: (value: number | '') => void;
  onContactListTagChange: (value: string) => void;
  onContactListActiveTasksOnlyChange: (value: boolean) => void;
  onContactNameChange: (value: string) => void;
  onContactPhoneChange: (value: string) => void;
  onNewContactProjectIdChange: (value: number | '') => void;
  onCreateContact: () => void | Promise<void>;
  onCreateContactDraft: (payload: ContactCreatePayload) => void | Promise<void>;
  onOpenContact: (contact: OwnerWorkspaceContact) => void | Promise<void>;
  onEditContact: (contact: OwnerWorkspaceContact) => void | Promise<void>;
  onCreateTaskForContact: (contact: OwnerWorkspaceContact) => void | Promise<void>;
  onAddCommentToContact: (contact: OwnerWorkspaceContact) => void | Promise<void>;
  onOpenContactComms: (contactId: number) => void | Promise<void>;
  onOpenContactTasks: (contactId: number) => void | Promise<void>;
  onDeleteContact: (contact: OwnerWorkspaceContact) => void | Promise<void>;
  onBulkAddTag: (contacts: OwnerWorkspaceContact[], tag: string) => Promise<void>;
  onBulkDelete: (contacts: OwnerWorkspaceContact[]) => Promise<void>;
  onRetryLoad: () => void | Promise<void>;
};

function formatInteraction(value?: string | null): { relative: string; exact: string; staleDays: number | null } {
  if (!value) return { relative: 'Нет взаимодействий', exact: '', staleDays: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { relative: 'Нет взаимодействий', exact: '', staleDays: null };
  const exact = date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return { relative: 'только что', exact, staleDays: 0 };
  if (diffMs < hour) return { relative: `${Math.floor(diffMs / minute)} мин назад`, exact, staleDays: 0 };
  if (diffMs < day) return { relative: `${Math.floor(diffMs / hour)} ч назад`, exact, staleDays: 0 };
  const days = Math.floor(diffMs / day);
  if (days < 30) return { relative: `${days} дн назад`, exact, staleDays: days };
  return { relative: exact, exact, staleDays: days };
}

function cleanPhone(phone?: string | null): string {
  return String(phone || '').replace(/[^\d+]/g, '');
}

export function OwnerWorkspaceContactsTab({
  contacts,
  contactsCatalog,
  projectsCatalogSorted,
  contactListTagOptions,
  contactListSearchInput,
  contactListProjectId,
  contactListTag,
  contactListActiveTasksOnly,
  contactName,
  contactPhone,
  newContactProjectId,
  loading,
  loadError,
  canCreateContactUi,
  isWorkspaceFullAccess,
  userOptions,
  userName,
  onContactListSearchInputChange,
  onContactListProjectIdChange,
  onContactListTagChange,
  onContactListActiveTasksOnlyChange,
  onContactNameChange,
  onContactPhoneChange,
  onNewContactProjectIdChange,
  onCreateContact,
  onCreateContactDraft,
  onOpenContact,
  onEditContact,
  onCreateTaskForContact,
  onAddCommentToContact,
  onOpenContactComms,
  onOpenContactTasks,
  onDeleteContact,
  onBulkAddTag,
  onBulkDelete,
  onRetryLoad,
}: OwnerWorkspaceContactsTabProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const defaultView = isMobile ? 'cards' : 'table';
  const [viewMode, setViewMode] = React.useState<ContactViewMode>(() => {
    const saved = localStorage.getItem('ow_contacts_view_mode');
    return saved === 'table' || saved === 'cards' ? saved : defaultView;
  });
  const [sortBy, setSortBy] = React.useState<ContactSortBy>('last_interaction');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(25);
  const [projectFilterIds, setProjectFilterIds] = React.useState<number[]>(contactListProjectId === '' ? [] : [contactListProjectId]);
  const [managerFilterIds, setManagerFilterIds] = React.useState<number[]>([]);
  const [tagFilters, setTagFilters] = React.useState<string[]>(contactListTag ? [contactListTag] : []);
  const [activityFilter, setActivityFilter] = React.useState<ActivityFilter>('all');
  const [activeTaskFilter, setActiveTaskFilter] = React.useState<ActiveTaskFilter>(contactListActiveTasksOnly ? 'has' : 'all');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [actionAnchorEl, setActionAnchorEl] = React.useState<HTMLElement | null>(null);
  const [actionContact, setActionContact] = React.useState<OwnerWorkspaceContact | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<OwnerWorkspaceContact | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [bulkTag, setBulkTag] = React.useState('');
  const [assignManagerId, setAssignManagerId] = React.useState<number | ''>('');
  const [draft, setDraft] = React.useState<ContactCreatePayload>({ full_name: '', phone: '', email: '', company: '', tags: [], comment: '' });

  React.useEffect(() => {
    const saved = localStorage.getItem('ow_contacts_view_mode');
    if (saved !== 'table' && saved !== 'cards') setViewMode(defaultView);
  }, [defaultView]);

  const projectsById = React.useMemo(() => new Map(projectsCatalogSorted.map((project) => [project.id, project])), [projectsCatalogSorted]);
  const contactsSource = contactsCatalog.length > 0 ? contactsCatalog : contacts;

  const ownerIdForContact = React.useCallback(
    (contact: OwnerWorkspaceContact): number | null => {
      for (const projectId of contact.linked_project_ids || []) {
        const ownerId = projectsById.get(projectId)?.owner_id;
        if (ownerId != null) return ownerId;
      }
      return null;
    },
    [projectsById]
  );

  const visibleContacts = React.useMemo(() => {
    const q = contactListSearchInput.trim().toLowerCase();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const valueOf = (contact: OwnerWorkspaceContact): string | number => {
      if (sortBy === 'full_name') return contact.full_name.toLowerCase();
      if (sortBy === 'company') return String(contact.company || '').toLowerCase();
      if (sortBy === 'projects') return contact.linked_project_ids?.length ?? contact.projects_count ?? 0;
      if (sortBy === 'active_tasks') return contact.active_tasks_count ?? 0;
      if (sortBy === 'owner') return userName(ownerIdForContact(contact)).toLowerCase();
      return contact.last_interaction_at ? new Date(contact.last_interaction_at).getTime() : 0;
    };

    return contactsSource
      .filter((contact) => {
        const tags = contact.tags ?? [];
        if (q) {
          const haystack = [
            contact.full_name,
            contact.phone,
            contact.email,
            contact.company,
            ...tags,
          ].join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (projectFilterIds.length > 0 && !projectFilterIds.some((id) => contact.linked_project_ids.includes(id))) return false;
        if (managerFilterIds.length > 0) {
          const ownerId = ownerIdForContact(contact);
          if (ownerId == null || !managerFilterIds.includes(ownerId)) return false;
        }
        if (tagFilters.length > 0 && !tagFilters.every((tag) => tags.includes(tag))) return false;
        if (activeTaskFilter === 'has' && (contact.active_tasks_count ?? 0) <= 0) return false;
        if (activeTaskFilter === 'none' && (contact.active_tasks_count ?? 0) > 0) return false;
        if (activityFilter !== 'all') {
          if (!contact.last_interaction_at) {
            if (activityFilter === 'active') return false;
          } else {
            const ageDays = Math.floor((now - new Date(contact.last_interaction_at).getTime()) / day);
            if (activityFilter === 'active' && ageDays > 30) return false;
            if (activityFilter === 'stale_30' && ageDays <= 30) return false;
            if (activityFilter === 'stale_90' && ageDays <= 90) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const av = valueOf(a);
        const bv = valueOf(b);
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortDir === 'asc' ? av.localeCompare(bv, 'ru') : bv.localeCompare(av, 'ru');
        }
        const result = Number(av) - Number(bv);
        return sortDir === 'asc' ? result : -result;
      });
  }, [
    activeTaskFilter,
    activityFilter,
    contactListSearchInput,
    contactsSource,
    managerFilterIds,
    ownerIdForContact,
    projectFilterIds,
    sortBy,
    sortDir,
    tagFilters,
    userName,
  ]);

  React.useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [contactListSearchInput, projectFilterIds, managerFilterIds, tagFilters, activityFilter, activeTaskFilter, sortBy, sortDir]);

  const selectedContacts = React.useMemo(
    () => visibleContacts.filter((contact) => selectedIds.includes(contact.id)),
    [selectedIds, visibleContacts]
  );
  const pagedContacts = visibleContacts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const hasAnyContacts = contactsSource.length > 0;
  const hasActiveFilters = Boolean(
    contactListSearchInput.trim() || projectFilterIds.length || managerFilterIds.length || tagFilters.length || activityFilter !== 'all' || activeTaskFilter !== 'all'
  );
  const draftPhoneInvalid = draft.phone.trim().length > 0 && !isValidPhone(draft.phone);
  const canSubmitCreateContact = canCreateContactUi
    && draft.full_name.trim().length > 0
    && isValidPhone(draft.phone)
    && (isWorkspaceFullAccess || newContactProjectId !== '');

  const setView = (_: React.MouseEvent<HTMLElement>, next: ContactViewMode | null) => {
    if (!next) return;
    setViewMode(next);
    localStorage.setItem('ow_contacts_view_mode', next);
  };

  const changeSort = (column: ContactSortBy) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'full_name' || column === 'company' || column === 'owner' ? 'asc' : 'desc');
    }
  };

  const closeActionMenu = () => {
    setActionAnchorEl(null);
    setActionContact(null);
  };

  const runContactAction = (handler: (contact: OwnerWorkspaceContact) => void | Promise<void>) => {
    if (!actionContact) return;
    const contact = actionContact;
    closeActionMenu();
    void handler(contact);
  };

  const submitCreateContact = async () => {
    if (!draft.full_name.trim() || !isValidPhone(draft.phone)) return;
    await onCreateContactDraft({
      full_name: draft.full_name.trim(),
      phone: applyPhoneMask(draft.phone),
      email: draft.email?.trim() || null,
      company: draft.company?.trim() || null,
      tags: draft.tags ?? [],
      comment: draft.comment?.trim() || null,
      project_ids: !isWorkspaceFullAccess && newContactProjectId !== '' ? [newContactProjectId] : undefined,
    });
    setDraft({ full_name: '', phone: '', email: '', company: '', tags: [], comment: '' });
    setCreateDialogOpen(false);
  };

  const exportSelected = () => {
    const rows = selectedContacts.length > 0 ? selectedContacts : visibleContacts;
    const header = ['ФИО', 'Телефон', 'Email', 'Компания', 'Проекты', 'Активные задачи', 'Последнее взаимодействие', 'Ответственный', 'Теги'];
    const csv = [
      header.join(';'),
      ...rows.map((contact) => [
        contact.full_name,
        contact.phone || '',
        contact.email || '',
        contact.company || '',
        String(contact.linked_project_ids?.length ?? 0),
        String(contact.active_tasks_count ?? 0),
        contact.last_interaction_at || '',
        userName(ownerIdForContact(contact)),
        (contact.tags ?? []).join(', '),
      ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderTags = (contact: OwnerWorkspaceContact) => {
    const tags = contact.tags ?? [];
    if (tags.length === 0) return <Typography variant="caption" color="text.secondary">—</Typography>;
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {tags.slice(0, 3).map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />)}
        {tags.length > 3 && <Chip size="small" variant="outlined" label={`+${tags.length - 3}`} />}
      </Stack>
    );
  };

  const renderActionMenuButton = (contact: OwnerWorkspaceContact) => (
    <IconButton
      size="small"
      onClick={(event) => {
        event.stopPropagation();
        setActionAnchorEl(event.currentTarget);
        setActionContact(contact);
      }}
      aria-label="Действия"
    >
      <MoreVertIcon fontSize="small" />
    </IconButton>
  );

  const renderCard = (contact: OwnerWorkspaceContact) => {
    const interaction = formatInteraction(contact.last_interaction_at);
    const ownerId = ownerIdForContact(contact);
    return (
      <Card key={contact.id} variant="outlined" onClick={() => void onOpenContact(contact)} sx={{ cursor: 'pointer' }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={800} noWrap title={contact.full_name}>
                  {contact.full_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">{contact.phone || '—'}</Typography>
                <Typography variant="body2" color="text.secondary">{contact.email || '—'}</Typography>
                {contact.company && <Typography variant="body2" color="text.secondary">{contact.company}</Typography>}
              </Box>
              {renderActionMenuButton(contact)}
            </Stack>
            {renderTags(contact)}
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Chip size="small" color={(contact.active_tasks_count ?? 0) > 0 ? 'success' : 'default'} label={(contact.active_tasks_count ?? 0) > 0 ? 'Активен' : 'Без активных задач'} />
              <Chip size="small" label={`Проекты: ${contact.linked_project_ids?.length ?? 0}`} />
              <Chip size="small" label={`Активные задачи: ${contact.active_tasks_count ?? 0}`} />
            </Stack>
            <Typography variant="caption" color="text.secondary">Ответственный: {userName(ownerId)}</Typography>
            <Typography variant="caption" color="text.secondary" title={interaction.exact || undefined}>
              Последнее взаимодействие: {interaction.relative}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  const filtersBlock = (
    <Grid container columnSpacing={1.25} rowSpacing={1.75} alignItems="flex-start">
      <Grid item xs={12} sm={6} lg={2.4}>
        <Autocomplete
          multiple
          size="small"
          fullWidth
          options={projectsCatalogSorted}
          getOptionLabel={(option) => option.name}
          value={projectsCatalogSorted.filter((project) => projectFilterIds.includes(project.id))}
          onChange={(_, value) => {
            const ids = value.map((project) => project.id);
            setProjectFilterIds(ids);
            onContactListProjectIdChange(ids.length === 1 ? ids[0] : '');
          }}
          renderInput={(params) => <TextField {...params} label="Проекты" />}
        />
      </Grid>
      <Grid item xs={12} sm={6} lg={2.4}>
        <Autocomplete
          multiple
          size="small"
          fullWidth
          options={userOptions}
          getOptionLabel={(option) => option.full_name}
          value={userOptions.filter((manager) => managerFilterIds.includes(manager.id))}
          onChange={(_, value) => setManagerFilterIds(value.map((manager) => manager.id))}
          renderInput={(params) => <TextField {...params} label="Ответственный" />}
        />
      </Grid>
      <Grid item xs={12} sm={6} lg={2.4}>
        <Autocomplete
          multiple
          freeSolo
          size="small"
          fullWidth
          options={contactListTagOptions}
          value={tagFilters}
          onChange={(_, value) => {
            const tags = value.map(String);
            setTagFilters(tags);
            onContactListTagChange(tags.length === 1 ? tags[0] : '');
          }}
          renderInput={(params) => <TextField {...params} label="Теги" />}
        />
      </Grid>
      <Grid item xs={12} sm={6} lg={2.4}>
        <TextField
          select
          fullWidth
          size="small"
          label="Активность"
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
        >
          <MenuItem value="all">Все</MenuItem>
          <MenuItem value="active">Активные</MenuItem>
          <MenuItem value="stale_30">Без активности более 30 дней</MenuItem>
          <MenuItem value="stale_90">Без активности более 90 дней</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={6} lg={2.4}>
        <TextField
          select
          fullWidth
          size="small"
          label="Активные задачи"
          value={activeTaskFilter}
          onChange={(e) => {
            const value = e.target.value as ActiveTaskFilter;
            setActiveTaskFilter(value);
            onContactListActiveTasksOnlyChange(value === 'has');
          }}
        >
          <MenuItem value="all">Все</MenuItem>
          <MenuItem value="has">Есть активные задачи</MenuItem>
          <MenuItem value="none">Нет активных задач</MenuItem>
        </TextField>
      </Grid>
    </Grid>
  );

  return (
    <Stack spacing={2}>
      {loadError && !loading && (
        <Card variant="outlined">
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2">Не удалось загрузить контакты</Typography>
                <Typography variant="body2" color="text.secondary">{loadError}</Typography>
              </Box>
              <Button variant="outlined" onClick={() => void onRetryLoad()}>Повторить</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="h6">Контакты</Typography>
          <ToggleButtonGroup size="small" exclusive value={viewMode} onChange={setView}>
            <ToggleButton value="table">Таблица</ToggleButton>
            <ToggleButton value="cards">Карточки</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} disabled={!canCreateContactUi} onClick={() => setCreateDialogOpen(true)}>
          Создать контакт
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack spacing={1.25}>
            <Stack spacing={1.75}>
              <TextField
                fullWidth
                size="small"
                label="Поиск по ФИО, телефону, email, компании, тегам"
                value={contactListSearchInput}
                onChange={(e) => onContactListSearchInputChange(e.target.value)}
              />
              {isMobile ? (
                <Button fullWidth variant="outlined" startIcon={<FilterListIcon />} onClick={() => setFiltersOpen(true)}>
                  Фильтры
                </Button>
              ) : (
                filtersBlock
              )}
            </Stack>
            {!isWorkspaceFullAccess && !canCreateContactUi && (
              <Alert severity="info">Создание контактов для ограниченных ролей сейчас отключено policy-моделью.</Alert>
            )}
            {!isWorkspaceFullAccess && canCreateContactUi && (
              <Alert severity="info">Для sales / trainer новый контакт создаётся только вместе с привязкой к доступному проекту.</Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.25 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Typography variant="subtitle2">Выбрано: {selectedIds.length}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                select
                size="small"
                label="Назначить ответственного"
                sx={{ minWidth: 230 }}
                value={assignManagerId === '' ? '' : String(assignManagerId)}
                onChange={(e) => setAssignManagerId(e.target.value === '' ? '' : Number(e.target.value))}
                helperText="Поле владельца контакта пока отсутствует"
              >
                <MenuItem value="">Не выбран</MenuItem>
                {userOptions.map((user) => <MenuItem key={user.id} value={String(user.id)}>{user.full_name}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Добавить тег" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} />
              <Button variant="outlined" disabled={!bulkTag.trim()} onClick={() => void onBulkAddTag(selectedContacts, bulkTag.trim()).then(() => setBulkTag(''))}>
                Добавить тег
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportSelected}>Экспортировать</Button>
              <Button color="error" variant="outlined" onClick={() => setBulkDeleteOpen(true)}>Удалить</Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {viewMode === 'table' && !isMobile ? (
        <Card variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={pagedContacts.length > 0 && pagedContacts.every((contact) => selectedIds.includes(contact.id))}
                      indeterminate={pagedContacts.some((contact) => selectedIds.includes(contact.id)) && !pagedContacts.every((contact) => selectedIds.includes(contact.id))}
                      onChange={(_, checked) => {
                        const ids = pagedContacts.map((contact) => contact.id);
                        setSelectedIds((prev) => checked ? Array.from(new Set([...prev, ...ids])) : prev.filter((id) => !ids.includes(id)));
                      }}
                    />
                  </TableCell>
                  {[
                    ['full_name', 'Контакт'],
                    ['company', 'Компания'],
                    ['projects', 'Проекты'],
                    ['active_tasks', 'Активные задачи'],
                    ['last_interaction', 'Последнее взаимодействие'],
                    ['owner', 'Ответственный'],
                  ].map(([key, label]) => (
                    <TableCell key={key}>
                      <TableSortLabel active={sortBy === key} direction={sortBy === key ? sortDir : 'asc'} onClick={() => changeSort(key as ContactSortBy)}>
                        {label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell>Телефон</TableCell>
                  <TableCell>Теги</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedContacts.map((contact) => {
                  const interaction = formatInteraction(contact.last_interaction_at);
                  const ownerId = ownerIdForContact(contact);
                  return (
                    <TableRow key={contact.id} hover selected={selectedIds.includes(contact.id)} onDoubleClick={() => void onOpenContact(contact)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.includes(contact.id)}
                          onChange={(_, checked) => setSelectedIds((prev) => checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id))}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{contact.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{contact.email || '—'}</Typography>
                      </TableCell>
                      <TableCell>{contact.company || '—'}</TableCell>
                      <TableCell>{contact.linked_project_ids?.length ?? 0}</TableCell>
                      <TableCell>{contact.active_tasks_count ?? 0}</TableCell>
                      <TableCell>
                        <Tooltip title={interaction.exact || ''}>
                          <span>{interaction.relative}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{userName(ownerId)}</TableCell>
                      <TableCell>{contact.phone || '—'}</TableCell>
                      <TableCell>{renderTags(contact)}</TableCell>
                      <TableCell align="right">{renderActionMenuButton(contact)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={visibleContacts.length}
            page={page}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100, 200]}
            labelRowsPerPage="На странице:"
          />
        </Card>
      ) : (
        <Grid container spacing={1.5}>
          {pagedContacts.map((contact) => (
            <Grid item xs={12} md={6} key={contact.id}>{renderCard(contact)}</Grid>
          ))}
          {visibleContacts.length > rowsPerPage && (
            <Grid item xs={12}>
              <TablePagination
                component="div"
                count={visibleContacts.length}
                page={page}
                onPageChange={(_, nextPage) => setPage(nextPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[25, 50, 100, 200]}
                labelRowsPerPage="На странице:"
              />
            </Grid>
          )}
        </Grid>
      )}

      {visibleContacts.length === 0 && !loading && (
        <Card variant="outlined">
          <CardContent sx={{ py: 4, textAlign: 'center' }}>
            {!hasAnyContacts && !hasActiveFilters ? (
              <Stack spacing={1.5} alignItems="center">
                <Typography variant="h6">Контактов пока нет</Typography>
                <Typography variant="body2" color="text.secondary">Создайте первый контакт для начала работы</Typography>
                <Button variant="contained" disabled={!canCreateContactUi} startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>Создать контакт</Button>
              </Stack>
            ) : (
              <Stack spacing={1} alignItems="center">
                <Typography variant="h6">Контакты не найдены</Typography>
                <Typography variant="body2" color="text.secondary">Попробуйте изменить фильтры или поисковый запрос</Typography>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      <Menu anchorEl={actionAnchorEl} open={Boolean(actionAnchorEl)} onClose={closeActionMenu}>
        <MenuItem onClick={() => runContactAction(onOpenContact)}><OpenInNewIcon fontSize="small" sx={{ mr: 1 }} />Открыть контакт</MenuItem>
        <MenuItem onClick={() => runContactAction(onEditContact)}><EditIcon fontSize="small" sx={{ mr: 1 }} />Редактировать</MenuItem>
        <MenuItem onClick={() => runContactAction(onCreateTaskForContact)}><AssignmentIcon fontSize="small" sx={{ mr: 1 }} />Создать задачу</MenuItem>
        <MenuItem onClick={() => runContactAction(onAddCommentToContact)}><EditIcon fontSize="small" sx={{ mr: 1 }} />Добавить комментарий</MenuItem>
        <MenuItem disabled={!actionContact?.phone} component="a" href={actionContact?.phone ? `tel:${cleanPhone(actionContact.phone)}` : undefined}>
          <PhoneIphoneIcon fontSize="small" sx={{ mr: 1 }} />Позвонить
        </MenuItem>
        <MenuItem onClick={() => actionContact && runContactAction((contact) => onOpenContactComms(contact.id))}><ChatBubbleOutlineIcon fontSize="small" sx={{ mr: 1 }} />Написать сообщение</MenuItem>
        <Divider />
        <MenuItem sx={{ color: 'error.main' }} onClick={() => {
          if (actionContact) setDeleteTarget(actionContact);
          closeActionMenu();
        }}><DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Удалить контакт</MenuItem>
      </Menu>

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Фильтры</DialogTitle>
        <DialogContent><Box sx={{ pt: 1 }}>{filtersBlock}</Box></DialogContent>
        <DialogActions><Button onClick={() => setFiltersOpen(false)}>Готово</Button></DialogActions>
      </Dialog>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать контакт</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="ФИО" value={draft.full_name} onChange={(e) => setDraft((prev) => ({ ...prev, full_name: e.target.value }))} autoFocus />
            <TextField
              label="Телефон"
              value={draft.phone}
              onChange={(e) => setDraft((prev) => ({ ...prev, phone: applyPhoneMask(e.target.value) }))}
              onBlur={() => setDraft((prev) => ({ ...prev, phone: applyPhoneMask(prev.phone) }))}
              placeholder="+7(999) 123-45-67"
              error={draftPhoneInvalid}
              helperText={draftPhoneInvalid ? 'Введите 10 цифр номера' : ''}
            />
            <TextField label="Email" value={draft.email || ''} onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))} />
            <TextField label="Компания" value={draft.company || ''} onChange={(e) => setDraft((prev) => ({ ...prev, company: e.target.value }))} />
            <Autocomplete
              multiple
              freeSolo
              options={contactListTagOptions}
              value={draft.tags || []}
              onChange={(_, value) => setDraft((prev) => ({ ...prev, tags: value.map(String) }))}
              renderInput={(params) => <TextField {...params} label="Теги" />}
            />
            {!isWorkspaceFullAccess && (
              <Autocomplete
                options={projectsCatalogSorted}
                getOptionLabel={(option) => option.name}
                value={projectsCatalogSorted.find((project) => project.id === newContactProjectId) || null}
                onChange={(_, value) => onNewContactProjectIdChange(value ? value.id : '')}
                renderInput={(params) => <TextField {...params} label="Проект для привязки" />}
              />
            )}
            <TextField label="Комментарий" minRows={3} multiline value={draft.comment || ''} onChange={(e) => setDraft((prev) => ({ ...prev, comment: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={!canSubmitCreateContact} onClick={() => void submitCreateContact()}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить контакт?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Контакт «{deleteTarget?.full_name}» будет удалён из базы. Связанные задачи останутся без контакта.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={() => {
            if (!deleteTarget) return;
            const contact = deleteTarget;
            setDeleteTarget(null);
            void onDeleteContact(contact);
          }}>Удалить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить выбранные контакты?</DialogTitle>
        <DialogContent><Typography variant="body2">Будет удалено контактов: {selectedContacts.length}.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteOpen(false)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={() => {
            setBulkDeleteOpen(false);
            void onBulkDelete(selectedContacts).then(() => setSelectedIds([]));
          }}>Удалить</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
