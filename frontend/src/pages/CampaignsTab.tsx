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
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Checkbox,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import DragIndicator from '@mui/icons-material/DragIndicator';
import DriveFileRenameOutline from '@mui/icons-material/DriveFileRenameOutline';
import Edit from '@mui/icons-material/Edit';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import History from '@mui/icons-material/History';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import { useAuth } from '../contexts/AuthContext';
import { b2bApi, campaignsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { hasPermission } from '../utils/permissions';
import type { Campaign, CampaignSettings, CampaignStage, SchoolCampaign } from '../types';
import {
  CAMPAIGN_TYPES,
  CAMPAIGN_FORMATS,
  CAMPAIGN_MODES,
  CAMPAIGN_STATUSES,
} from '../constants/campaignStages';
import { getInviteLabel, getParticipationLabel, getHostLabel } from '../constants/campaignEventStages';
import { CampaignEventsSubTab } from './CampaignEventsSubTab';
import { CampaignMatrixSubTab } from './CampaignMatrixSubTab';
import { GameJamKanban } from './GameJamKanban';

// ---------------------------------------------------------------------------
// Канбан-колонка (Droppable) для обычного канбана
// ---------------------------------------------------------------------------
interface KanbanColumnProps {
  stageKey: string;
  label: string;
  isTerminal: boolean;
  count: number;
  children: React.ReactNode;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ stageKey, label, isTerminal, count, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${stageKey}` });
  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      sx={{
        minWidth: 260, flex: '0 0 auto',
        bgcolor: isOver ? 'action.selected' : undefined,
        border: isOver ? '2px solid' : undefined,
        borderColor: isOver ? 'primary.main' : undefined,
        transition: 'background-color 0.15s',
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" gap={0.5} mb={0.5}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>{label}</Typography>
          {isTerminal && <Chip label="финал" size="small" variant="outlined" />}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>{count} шт.</Typography>
        <Stack spacing={1}>{children}</Stack>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Карточка школы (Draggable) для обычного канбана
// ---------------------------------------------------------------------------
interface KanbanSchoolCardProps {
  scId: number;
  schoolName: string;
  schoolCity?: string | null;
  countLabel?: string;
  stages: { key: string; label: string }[];
  currentStage: string;
  canManage: boolean;
  onStageChange: (scId: number, stage: string) => void;
  onHistory: (scId: number) => void;
}

const KanbanSchoolCard: React.FC<KanbanSchoolCardProps> = ({
  scId, schoolName, schoolCity, countLabel, stages, currentStage, canManage, onStageChange, onHistory,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(scId) });
  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      style={transform ? { transform: `translate(${transform.x}px,${transform.y}px)`, opacity: isDragging ? 0.4 : 1 } : undefined}
      sx={{ bgcolor: 'background.paper', touchAction: 'none' }}
    >
      <CardContent sx={{ py: 1, px: 1.5 }}>
        <Stack direction="row" alignItems="flex-start" gap={0.5}>
          <Box {...attributes} {...listeners} sx={{ cursor: 'grab', pt: 0.3 }}>
            <DragIndicator fontSize="small" sx={{ color: 'text.disabled' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">{schoolName}</Typography>
            <Typography variant="caption" color="text.secondary">{schoolCity || '—'}</Typography>
            {countLabel && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25 }}>{countLabel}</Typography>
            )}
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
              <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
                <Select
                  value={currentStage}
                  onChange={(e) => onStageChange(scId, e.target.value)}
                  disabled={!canManage}
                  displayEmpty
                >
                  {stages.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
                </Select>
              </FormControl>
              <Tooltip title="История активностей">
                <IconButton size="small" onClick={() => onHistory(scId)}><History fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Диалог управления этапами
// ---------------------------------------------------------------------------
interface StagesDialogProps {
  open: boolean;
  campaignId: number;
  stages: CampaignStage[];
  canManage: boolean;
  onClose: () => void;
  onChanged: (stages: CampaignStage[]) => void;
}

const StagesDialog: React.FC<StagesDialogProps> = ({
  open, campaignId, stages, canManage, onClose, onChanged,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const updated = await campaignsApi.listStages(campaignId);
    onChanged(updated);
  }, [campaignId, onChanged]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setBusy(true);
    setError('');
    try {
      await campaignsApi.createStage(campaignId, newLabel.trim());
      setNewLabel('');
      await reload();
    } catch (e: any) {
      setError(extractApiError(e, 'Не удалось добавить этап'));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id: number) => {
    if (!editLabel.trim()) return;
    setBusy(true);
    setError('');
    try {
      await campaignsApi.updateStage(campaignId, id, { label: editLabel.trim() });
      setEditingId(null);
      await reload();
    } catch (e: any) {
      setError(extractApiError(e, 'Не удалось переименовать'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number, label: string) => {
    if (!window.confirm(`Удалить этап «${label}»? Школы на этом этапе перейдут на первый.`)) return;
    setBusy(true);
    setError('');
    try {
      await campaignsApi.deleteStage(campaignId, id);
      await reload();
    } catch (e: any) {
      setError(extractApiError(e, 'Не удалось удалить этап'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Этапы воронки</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {stages.map((s, idx) => (
            <Stack key={s.id} direction="row" alignItems="center" gap={1}>
              <Typography variant="body2" sx={{ width: 24, color: 'text.disabled', flexShrink: 0 }}>
                {idx + 1}.
              </Typography>
              {editingId === s.id ? (
                <>
                  <TextField
                    size="small"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(s.id); }}
                    autoFocus
                    sx={{ flex: 1 }}
                  />
                  <Button size="small" variant="contained" onClick={() => void handleRename(s.id)} disabled={busy}>
                    Сохранить
                  </Button>
                  <Button size="small" onClick={() => setEditingId(null)}>Отмена</Button>
                </>
              ) : (
                <>
                  <Typography sx={{ flex: 1 }}>{s.label}</Typography>
                  {s.is_terminal && (
                    <Chip label="финал" size="small" variant="outlined" color="default" />
                  )}
                  {canManage && (
                    <>
                      <Tooltip title="Переименовать">
                        <IconButton size="small" onClick={() => { setEditingId(s.id); setEditLabel(s.label); }}>
                          <DriveFileRenameOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton size="small" color="error" onClick={() => void handleDelete(s.id, s.label)} disabled={busy}>
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </>
              )}
            </Stack>
          ))}
        </Stack>
        {canManage && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Stack direction="row" gap={1}>
              <TextField
                size="small"
                label="Новый этап"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                sx={{ flex: 1 }}
              />
              <Button variant="outlined" onClick={() => void handleAdd()} disabled={busy || !newLabel.trim()}>
                Добавить
              </Button>
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------
export const CampaignsTab: React.FC = () => {
  const { user } = useAuth();
  const canManageCampaigns = hasPermission(user, 'campaigns.manage');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- create dialog ---
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    type: 'game_jam',
    format: 'offline',
    city: '',
    region: '',
    date_from: '',
    date_to: '',
    responsible_id: '' as number | '',
    status: 'draft',
    mode: 'city',
    is_game_jam: false,
  });
  const [managers, setManagers] = useState<{ id: number; full_name: string }[]>([]);
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings | null>(null);

  // --- campaign detail ---
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<Campaign | null>(null);
  const [schoolCampaigns, setSchoolCampaigns] = useState<SchoolCampaign[]>([]);
  const [stages, setStages] = useState<CampaignStage[]>([]);
  const [stagesDialogOpen, setStagesDialogOpen] = useState(false);
  const [campaignDetailSubTab, setCampaignDetailSubTab] = useState<'work' | 'events' | 'matrix'>('work');
  const [eventCounts, setEventCounts] = useState<Record<string, { events_invited_count: number; events_participated_count: number; events_hosted_count: number }>>({});

  // --- add schools dialog ---
  const [addSchoolsOpen, setAddSchoolsOpen] = useState(false);
  const [availableSchools, setAvailableSchools] = useState<{ id: number; name: string; city: string | null }[]>([]);
  const [addSchoolCity, setAddSchoolCity] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<number[]>([]);
  const [createContactTask, setCreateContactTask] = useState(true);

  // --- archive / history ---
  const [showArchived, setShowArchived] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyData, setHistoryData] = useState<Array<{
    event_title: string | null; event_date: string | null;
    invite_status: string; participation_status: string;
    participant_count: number | null; host_status: string; notes: string | null;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // campaign settings (types / formats / scales / cities)
  // ---------------------------------------------------------------------------
  const campaignTypes = useMemo(() => {
    const active = campaignSettings?.types.filter((item) => item.is_active) ?? [];
    return active.length ? active : CAMPAIGN_TYPES;
  }, [campaignSettings]);
  const campaignFormats = useMemo(() => {
    const active = campaignSettings?.formats.filter((item) => item.is_active) ?? [];
    return active.length ? active : CAMPAIGN_FORMATS;
  }, [campaignSettings]);
  const campaignScales = useMemo(() => {
    const active = campaignSettings?.scales.filter((item) => item.is_active) ?? [];
    return active.length ? active : CAMPAIGN_MODES;
  }, [campaignSettings]);
  const campaignTypeLabel = useCallback((value: string) =>
    campaignSettings?.types.find((t) => t.value === value)?.label
    ?? CAMPAIGN_TYPES.find((t) => t.value === value)?.label
    ?? value,
  [campaignSettings]);
  const campaignFormatLabel = useCallback((value: string) =>
    campaignSettings?.formats.find((f) => f.value === value)?.label
    ?? CAMPAIGN_FORMATS.find((f) => f.value === value)?.label
    ?? value,
  [campaignSettings]);

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------
  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await campaignsApi.list());
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить кампании'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    campaignsApi.getSettings().then(setCampaignSettings).catch(() => setCampaignSettings(null));
  }, []);

  useEffect(() => {
    if (createOpen) {
      b2bApi.listManagers().then(setManagers).catch(() => {});
      campaignsApi.getSettings().then((settings) => {
        setCampaignSettings(settings);
        setCreateForm((form) => ({
          ...form,
          type: form.type || settings.types.find((t) => t.is_active)?.value || 'game_jam',
          format: form.format || settings.formats.find((f) => f.is_active)?.value || 'offline',
          mode: form.mode || settings.scales.find((s) => s.is_active)?.value || 'city',
        }));
      }).catch(() => {});
    }
  }, [createOpen]);

  // Load campaign detail + school-campaigns + stages when selecting a campaign
  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignDetail(null);
      setSchoolCampaigns([]);
      setStages([]);
      setEventCounts({});
      setCampaignDetailSubTab('work');
      return;
    }
    Promise.all([
      campaignsApi.get(selectedCampaignId),
      campaignsApi.listSchoolCampaigns(selectedCampaignId),
      campaignsApi.listStages(selectedCampaignId),
    ])
      .then(([c, list, stageList]) => {
        setCampaignDetail(c);
        setSchoolCampaigns(list);
        setStages(stageList);
      })
      .catch((err: any) => setError(extractApiError(err, 'Не удалось загрузить кампанию')));
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId || campaignDetailSubTab !== 'work') return;
    campaignsApi.getCampaignSchoolEventCounts(selectedCampaignId)
      .then(setEventCounts)
      .catch(() => setEventCounts({}));
  }, [selectedCampaignId, campaignDetailSubTab]);

  // ---------------------------------------------------------------------------
  // DnD для обычного канбана
  // ---------------------------------------------------------------------------
  const [dndActiveId, setDndActiveId] = useState<string | null>(null);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const dndActiveSchool = useMemo(
    () => dndActiveId ? schoolCampaigns.find((sc) => String(sc.id) === dndActiveId) : null,
    [dndActiveId, schoolCampaigns]
  );

  const handleDndDragStart = (e: DragStartEvent) => setDndActiveId(String(e.active.id));

  const handleDndDragEnd = async (e: DragEndEvent) => {
    setDndActiveId(null);
    const { active, over } = e;
    if (!over || !selectedCampaignId) return;
    const scId = Number(active.id);
    const newStage = String(over.id).replace('col-', '');
    const sc = schoolCampaigns.find((s) => s.id === scId);
    if (!sc || sc.stage === newStage) return;
    // Optimistic update
    setSchoolCampaigns((prev) => prev.map((s) => s.id === scId ? { ...s, stage: newStage } : s));
    try {
      await campaignsApi.updateSchoolCampaign(selectedCampaignId, scId, { stage: newStage });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить стадию'));
      setSchoolCampaigns(await campaignsApi.listSchoolCampaigns(selectedCampaignId));
    }
  };

  // ---------------------------------------------------------------------------
  // Kanban derived data — используем этапы из API, а не константы
  // ---------------------------------------------------------------------------
  const byStage = useMemo(() =>
    stages.map((s) => ({
      ...s,
      items: schoolCampaigns.filter((sc) => sc.stage === s.key),
    })),
  [stages, schoolCampaigns]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setError(null);
    try {
      await campaignsApi.create({
        name: createForm.name.trim(),
        type: createForm.type,
        format: createForm.format,
        city: createForm.city.trim() || undefined,
        region: createForm.region.trim() || undefined,
        date_from: createForm.date_from || undefined,
        date_to: createForm.date_to || undefined,
        responsible_id: createForm.responsible_id === '' ? undefined : createForm.responsible_id,
        status: createForm.status,
        mode: createForm.mode,
        is_game_jam: createForm.is_game_jam,
      });
      setCreateOpen(false);
      setCreateForm({
        name: '', type: campaignTypes[0]?.value || 'game_jam',
        format: campaignFormats[0]?.value || 'offline',
        city: '', region: '', date_from: '', date_to: '',
        responsible_id: '', status: 'draft',
        mode: campaignScales[0]?.value || 'city',
        is_game_jam: false,
      });
      loadCampaigns();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать кампанию'));
    }
  };

  const openAddSchools = () => {
    if (!selectedCampaignId) return;
    setAddSchoolCity('');
    setSelectedSchoolIds([]);
    campaignsApi.listSchoolsAvailable(selectedCampaignId).then(setAvailableSchools).catch(() => setAvailableSchools([]));
    setAddSchoolsOpen(true);
  };

  const loadAvailableByCity = () => {
    if (!selectedCampaignId) return;
    campaignsApi.listSchoolsAvailable(selectedCampaignId, { city: addSchoolCity || undefined })
      .then(setAvailableSchools).catch(() => setAvailableSchools([]));
  };

  const handleAddSchools = async () => {
    if (!selectedCampaignId || selectedSchoolIds.length === 0) return;
    setError(null);
    try {
      await campaignsApi.addSchools(selectedCampaignId, { school_ids: selectedSchoolIds, create_contact_task: createContactTask });
      setAddSchoolsOpen(false);
      setSchoolCampaigns(await campaignsApi.listSchoolCampaigns(selectedCampaignId));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить школы'));
    }
  };

  const handleStageChange = async (scId: number, newStage: string) => {
    if (!selectedCampaignId) return;
    try {
      await campaignsApi.updateSchoolCampaign(selectedCampaignId, scId, { stage: newStage });
      setSchoolCampaigns(await campaignsApi.listSchoolCampaigns(selectedCampaignId));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить стадию'));
    }
  };

  const handleArchiveCampaign = async (c: Campaign) => {
    if (!window.confirm(`Отправить кампанию «${c.name}» в архив?`)) return;
    setError(null);
    try {
      await campaignsApi.update(c.id, { status: 'canceled' });
      await loadCampaigns();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отправить в архив'));
    }
  };

  const openHistoryDialog = (schoolCampaignId: number) => {
    setHistoryDialogOpen(true);
    setHistoryData([]);
    setHistoryLoading(true);
    if (!selectedCampaignId) return;
    campaignsApi
      .getSchoolCampaignEventsHistory(selectedCampaignId, schoolCampaignId)
      .then(setHistoryData)
      .catch(() => setHistoryData([]))
      .finally(() => setHistoryLoading(false));
  };

  const activeCampaigns = useMemo(() => campaigns.filter((c) => c.status === 'draft' || c.status === 'active'), [campaigns]);
  const archivedCampaigns = useMemo(() => campaigns.filter((c) => c.status === 'done' || c.status === 'canceled'), [campaigns]);
  const visibleCampaigns = showArchived ? archivedCampaigns : activeCampaigns;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {selectedCampaignId ? (
        <Box>
          <Button startIcon={<ArrowBack />} onClick={() => setSelectedCampaignId(null)} sx={{ mb: 2 }}>
            К списку кампаний
          </Button>

          <Box sx={{ border: '2px solid', borderColor: 'primary.main', borderRadius: 1, p: 1.5, mb: 2, bgcolor: 'action.hover' }}>
            <Tabs value={campaignDetailSubTab} onChange={(_, v: 'work' | 'events' | 'matrix') => setCampaignDetailSubTab(v)} variant="fullWidth">
              <Tab label="Общая работа" value="work" />
              <Tab label="Джемы" value="events" />
              <Tab label="Матрица школ" value="matrix" />
            </Tabs>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
          )}

          {campaignDetail ? (
            <>
              <Typography variant="h5" gutterBottom>{campaignDetail.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {campaignTypeLabel(campaignDetail.type)} · {campaignFormatLabel(campaignDetail.format)}
                {campaignDetail.city && ` · ${campaignDetail.city}`}
                {campaignDetail.responsible_full_name && ` · Ответственный: ${campaignDetail.responsible_full_name}`}
              </Typography>

              {campaignDetailSubTab === 'work' && campaignDetail?.is_game_jam && (
                <GameJamKanban
                  campaignId={selectedCampaignId}
                  canManage={canManageCampaigns}
                  onError={setError}
                />
              )}

              {campaignDetailSubTab === 'work' && !campaignDetail?.is_game_jam && (
                <>
                  <Stack direction="row" gap={1} sx={{ mb: 2 }} flexWrap="wrap">
                    {canManageCampaigns && (
                      <Button variant="contained" startIcon={<Add />} onClick={openAddSchools}>
                        Добавить школы
                      </Button>
                    )}
                    {canManageCampaigns && (
                      <Button
                        variant="outlined"
                        startIcon={<SettingsOutlined />}
                        onClick={() => setStagesDialogOpen(true)}
                      >
                        Этапы
                      </Button>
                    )}
                  </Stack>

                  {stages.length === 0 ? (
                    <Typography color="text.secondary">Загрузка этапов…</Typography>
                  ) : (
                    <DndContext
                      sensors={dndSensors}
                      onDragStart={handleDndDragStart}
                      onDragEnd={(e) => void handleDndDragEnd(e)}
                    >
                      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', flexWrap: 'nowrap', pb: 1 }}>
                        {byStage.map((col) => (
                          <KanbanColumn
                            key={col.key}
                            stageKey={col.key}
                            label={col.label}
                            isTerminal={col.is_terminal}
                            count={col.items.length}
                          >
                            {col.items.map((sc) => {
                              const counts = eventCounts[String(sc.id)];
                              const countLabel = counts?.events_invited_count !== undefined
                                ? `приглаш.: ${counts.events_invited_count} · участий: ${counts.events_participated_count} · площадок: ${counts.events_hosted_count}`
                                : undefined;
                              return (
                                <KanbanSchoolCard
                                  key={sc.id}
                                  scId={sc.id}
                                  schoolName={sc.school_name || `Школа #${sc.b2b_school_id}`}
                                  schoolCity={sc.school_city}
                                  countLabel={countLabel}
                                  stages={stages}
                                  currentStage={sc.stage}
                                  canManage={canManageCampaigns}
                                  onStageChange={handleStageChange}
                                  onHistory={openHistoryDialog}
                                />
                              );
                            })}
                          </KanbanColumn>
                        ))}
                      </Box>
                      <DragOverlay>
                        {dndActiveSchool && (
                          <Card variant="outlined" sx={{ minWidth: 200, opacity: 0.9, boxShadow: 4 }}>
                            <CardContent sx={{ py: 1, px: 1.5 }}>
                              <Typography variant="body2">{dndActiveSchool.school_name}</Typography>
                              <Typography variant="caption" color="text.secondary">{dndActiveSchool.school_city}</Typography>
                            </CardContent>
                          </Card>
                        )}
                      </DragOverlay>
                    </DndContext>
                  )}
                </>
              )}

              {campaignDetailSubTab === 'events' && (
                <CampaignEventsSubTab campaignId={selectedCampaignId} onError={setError} canManage={canManageCampaigns} />
              )}
              {campaignDetailSubTab === 'matrix' && (
                <CampaignMatrixSubTab campaignId={selectedCampaignId} onError={setError} canManage={canManageCampaigns} />
              )}
            </>
          ) : (
            <Typography color="text.secondary">Загрузка данных кампании…</Typography>
          )}
        </Box>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">
              Кампании {showArchived ? '(архив)' : ''}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControlLabel
                control={<Checkbox size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
                label="Показывать архив"
              />
              {canManageCampaigns && (
                <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                  Создать кампанию
                </Button>
              )}
            </Stack>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
          )}
          {loading ? (
            <Typography color="text.secondary">Загрузка…</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Название</TableCell>
                    <TableCell>Тип</TableCell>
                    <TableCell>Формат</TableCell>
                    <TableCell>Город</TableCell>
                    <TableCell>Ответственный</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleCampaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        {showArchived ? 'Нет кампаний в архиве.' : 'Нет кампаний. Создайте первую.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleCampaigns.map((c) => (
                      <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedCampaignId(c.id)}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{campaignTypeLabel(c.type)}</TableCell>
                        <TableCell>{campaignFormatLabel(c.format)}</TableCell>
                        <TableCell>{c.city || '—'}</TableCell>
                        <TableCell>{c.responsible_full_name || '—'}</TableCell>
                        <TableCell>{CAMPAIGN_STATUSES.find((s) => s.value === c.status)?.label ?? c.status}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" startIcon={<Edit />} onClick={() => setSelectedCampaignId(c.id)}>
                              Открыть
                            </Button>
                            {canManageCampaigns && (
                              <Button size="small" color="warning" onClick={() => void handleArchiveCampaign(c)}>
                                В архив
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ---- Диалог создания кампании ---- */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новая кампания</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название" value={createForm.name} fullWidth required
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            />
            <FormControl fullWidth>
              <InputLabel>Тип</InputLabel>
              <Select label="Тип" value={createForm.type} onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}>
                {campaignTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Формат</InputLabel>
              <Select
                label="Формат"
                value={createForm.format}
                onChange={(e) => setCreateForm((f) => ({ ...f, format: e.target.value }))}
              >
                {campaignFormats.map((f) => (
                  <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              options={campaignSettings?.cities ?? []}
              value={createForm.city || null}
              onChange={(_, value) => setCreateForm((f) => ({ ...f, city: value || '' }))}
              onInputChange={(_, value, reason) => {
                if (reason === 'input' || reason === 'clear') {
                  setCreateForm((f) => ({ ...f, city: value }));
                }
              }}
              renderInput={(params) => <TextField {...params} label="Город" fullWidth />}
              noOptionsText="Город не найден"
              clearText="Очистить"
              openText="Открыть"
              closeText="Закрыть"
              autoHighlight
            />
            <FormControl fullWidth>
              <InputLabel>Регион</InputLabel>
              <Select label="Регион" value={createForm.region} onChange={(e) => setCreateForm((f) => ({ ...f, region: e.target.value }))}>
                <MenuItem value="">Не выбран</MenuItem>
                {(campaignSettings?.regions ?? []).map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Дата начала" type="date" value={createForm.date_from} fullWidth InputLabelProps={{ shrink: true }}
              onChange={(e) => setCreateForm((f) => ({ ...f, date_from: e.target.value }))} />
            <TextField label="Дата окончания" type="date" value={createForm.date_to} fullWidth InputLabelProps={{ shrink: true }}
              onChange={(e) => setCreateForm((f) => ({ ...f, date_to: e.target.value }))} />
            <FormControl fullWidth>
              <InputLabel>Ответственный</InputLabel>
              <Select label="Ответственный" value={createForm.responsible_id === '' ? '' : createForm.responsible_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, responsible_id: e.target.value === '' ? '' : (e.target.value as number) }))}>
                <MenuItem value="">Не назначен</MenuItem>
                {managers.map((m) => <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Масштаб</InputLabel>
              <Select label="Масштаб" value={createForm.mode} onChange={(e) => setCreateForm((f) => ({ ...f, mode: e.target.value }))}>
                {campaignScales.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={createForm.is_game_jam}
                  onChange={(e) => setCreateForm((f) => ({ ...f, is_game_jam: e.target.checked }))}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>Режим Game Jam</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Двухуровневый канбан: пул школ + отдельные джемы с внутренними этапами
                  </Typography>
                </Box>
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!createForm.name.trim()}>Создать</Button>
        </DialogActions>
      </Dialog>

      {/* ---- Диалог добавления школ ---- */}
      <Dialog open={addSchoolsOpen} onClose={() => setAddSchoolsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить школы в кампанию</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Фильтр по городу" value={addSchoolCity} fullWidth size="small"
              onChange={(e) => setAddSchoolCity(e.target.value)}
              onBlur={loadAvailableByCity}
            />
            <Button size="small" variant="outlined" onClick={loadAvailableByCity}>Показать школы</Button>
            <Typography variant="body2" color="text.secondary">
              Выберите школы (уже добавленные не показываются). При добавлении можно создать задачу «Связаться со школой».
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Школы</InputLabel>
              <Select multiple label="Школы" value={selectedSchoolIds}
                onChange={(e) => setSelectedSchoolIds(e.target.value as number[])}
                renderValue={(ids) => `${ids.length} выбрано`}>
                {availableSchools.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name} {s.city ? `(${s.city})` : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Checkbox checked={createContactTask} onChange={(e) => setCreateContactTask(e.target.checked)} />}
              label="Создать задачу «Связаться со школой» для каждой"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddSchoolsOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleAddSchools} disabled={selectedSchoolIds.length === 0}>Добавить</Button>
        </DialogActions>
      </Dialog>

      {/* ---- Диалог истории активностей ---- */}
      <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>История активностей школы</DialogTitle>
        <DialogContent>
          {historyLoading ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Загрузка…</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Активность</TableCell>
                    <TableCell>Дата</TableCell>
                    <TableCell>Приглашение</TableCell>
                    <TableCell>Участие</TableCell>
                    <TableCell>Площадка</TableCell>
                    <TableCell>Дети</TableCell>
                    <TableCell>Комментарий</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>Нет данных</TableCell>
                    </TableRow>
                  ) : (
                    historyData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{row.event_title ?? '—'}</TableCell>
                        <TableCell>{row.event_date ?? '—'}</TableCell>
                        <TableCell>{getInviteLabel(row.invite_status)}</TableCell>
                        <TableCell>{getParticipationLabel(row.participation_status)}</TableCell>
                        <TableCell>{getHostLabel(row.host_status)}</TableCell>
                        <TableCell>{row.participant_count ?? '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 200 }}>{row.notes ?? '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialogOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* ---- Диалог управления этапами ---- */}
      {selectedCampaignId && (
        <StagesDialog
          open={stagesDialogOpen}
          campaignId={selectedCampaignId}
          stages={stages}
          canManage={canManageCampaigns}
          onClose={() => setStagesDialogOpen(false)}
          onChanged={setStages}
        />
      )}
    </>
  );
};
