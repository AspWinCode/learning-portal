/**
 * GameJamKanban — двухуровневый режим Game Jam с DnD.
 *
 * Внешний уровень: пул всех школ кампании + колонки-джемы.
 *   DnD: перетащить карточку школы из пула → в колонку джема → добавляет её в джем.
 *
 * Внутренний уровень: при клике «Открыть» — внутренний канбан школ по этапам джема.
 *   DnD: перетащить карточку между этапами → меняет jam_stage.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ArrowBack from '@mui/icons-material/ArrowBack';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import DragIndicator from '@mui/icons-material/DragIndicator';
import DriveFileRenameOutline from '@mui/icons-material/DriveFileRenameOutline';
import OpenInNew from '@mui/icons-material/OpenInNew';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
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
import { b2bApi, campaignsApi, settingsApi, usersApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { CampaignEvent, CampaignEventStage, SchoolCampaign, User } from '../types';

type AvailableSchool = { id: number; name: string; city: string | null; district?: string | null };

const emptyEventForm = {
  title: '',
  description: '',
  event_date: '',
  start_time: '',
  end_time: '',
  trainer_id: '',
  location: '',
};

const toEventDateTime = (date: string, time: string) => (
  date && time ? `${date}T${time}:00` : null
);

const toTimeValue = (value?: string | null) => {
  if (!value) return '';
  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '';
};

// ---------------------------------------------------------------------------
// Draggable school card
// ---------------------------------------------------------------------------
interface DraggableCardProps {
  id: string;
  schoolName: string;
  schoolCity?: string | null;
  extraLabel?: string;
}

const DraggableCard: React.FC<DraggableCardProps> = ({ id, schoolName, schoolCity, extraLabel }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      variant="outlined"
      sx={{
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 74,
        bgcolor: 'background.paper',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
        <Stack direction="row" alignItems="flex-start" gap={1}>
          <DragIndicator fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0, mt: 0.25 }} {...attributes} {...listeners} />
          <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere', lineHeight: 1.35, fontWeight: 600 }}>{schoolName}</Typography>
            {schoolCity && <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>{schoolCity}</Typography>}
            {extraLabel && <Typography variant="caption" display="block" color="text.secondary" sx={{ overflowWrap: 'anywhere', mt: 0.25 }}>{extraLabel}</Typography>}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Droppable column
// ---------------------------------------------------------------------------
interface DroppableColumnProps {
  id: string;
  label: string;
  count: number;
  isTerminal?: boolean;
  children: React.ReactNode;
  highlight?: boolean;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({ id, label, count, isTerminal, children, highlight }) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      sx={{
        width: 320,
        minWidth: 320,
        maxWidth: 320,
        flex: '0 0 320px',
        boxSizing: 'border-box',
        bgcolor: isOver ? 'action.selected' : highlight ? 'action.hover' : undefined,
        transition: 'background-color 0.15s, box-shadow 0.15s',
        boxShadow: isOver ? 'inset 0 0 0 2px var(--mui-palette-primary-main)' : undefined,
      }}
    >
      <CardContent sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap={0.5} mb={0.5}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>{label}</Typography>
          {isTerminal && <Chip label="финал" size="small" variant="outlined" />}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {count} шт.
        </Typography>
        <Stack spacing={1} sx={{ minWidth: 0 }}>{children}</Stack>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Диалог управления этапами джема
// ---------------------------------------------------------------------------
interface JamStagesDialogProps {
  open: boolean;
  campaignId: number;
  eventId: number;
  stages: CampaignEventStage[];
  onClose: () => void;
  onChanged: (stages: CampaignEventStage[]) => void;
}

const JamStagesDialog: React.FC<JamStagesDialogProps> = ({
  open, campaignId, eventId, stages, onClose, onChanged,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const updated = await campaignsApi.listJamStages(campaignId, eventId);
    onChanged(updated);
  }, [campaignId, eventId, onChanged]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setBusy(true); setError('');
    try { await campaignsApi.createJamStage(campaignId, eventId, newLabel.trim()); setNewLabel(''); await reload(); }
    catch (e: any) { setError(extractApiError(e, 'Не удалось добавить этап')); }
    finally { setBusy(false); }
  };

  const handleRename = async (id: number) => {
    if (!editLabel.trim()) return;
    setBusy(true); setError('');
    try { await campaignsApi.updateJamStage(campaignId, eventId, id, { label: editLabel.trim() }); setEditingId(null); await reload(); }
    catch (e: any) { setError(extractApiError(e, 'Не удалось переименовать')); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id: number, label: string) => {
    if (!window.confirm(`Удалить этап «${label}»? Школы перейдут на первый этап.`)) return;
    setBusy(true); setError('');
    try { await campaignsApi.deleteJamStage(campaignId, eventId, id); await reload(); }
    catch (e: any) { setError(extractApiError(e, 'Не удалось удалить этап')); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Этапы джема</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {stages.map((s, idx) => (
            <Stack key={s.id} direction="row" alignItems="center" gap={1}>
              <Typography variant="body2" sx={{ width: 24, color: 'text.disabled', flexShrink: 0 }}>{idx + 1}.</Typography>
              {editingId === s.id ? (
                <>
                  <TextField size="small" autoFocus sx={{ flex: 1 }} value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(s.id); }} />
                  <Button size="small" variant="contained" onClick={() => void handleRename(s.id)} disabled={busy}>Сохранить</Button>
                  <Button size="small" onClick={() => setEditingId(null)}>Отмена</Button>
                </>
              ) : (
                <>
                  <Typography sx={{ flex: 1 }}>{s.label}</Typography>
                  {s.is_terminal && <Chip label="финал" size="small" variant="outlined" />}
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
            </Stack>
          ))}
        </Stack>
        <Divider sx={{ mb: 2 }} />
        <Stack direction="row" gap={1}>
          <TextField size="small" label="Новый этап" sx={{ flex: 1 }} value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }} />
          <Button variant="outlined" onClick={() => void handleAdd()} disabled={busy || !newLabel.trim()}>Добавить</Button>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Закрыть</Button></DialogActions>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Внутренний канбан джема (школы → этапы джема) с DnD
// ---------------------------------------------------------------------------
type JamSchoolRow = {
  school_campaign_id: number;
  school_name: string | null;
  school_city: string | null;
  stage: string;
  jam_stage?: string | null;
  [key: string]: unknown;
};

interface JamInnerKanbanProps {
  campaignId: number;
  event: CampaignEvent;
  canManage: boolean;
  onBack: () => void;
  onError: (msg: string | null) => void;
}

const JamInnerKanban: React.FC<JamInnerKanbanProps> = ({ campaignId, event, canManage, onBack, onError }) => {
  const [jamStages, setJamStages] = useState<CampaignEventStage[]>([]);
  const [schools, setSchools] = useState<JamSchoolRow[]>([]);
  const [stagesDialogOpen, setStagesDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadData = useCallback(async () => {
    setLoading(true); onError(null);
    try {
      const [stages, rows] = await Promise.all([
        campaignsApi.listJamStages(campaignId, event.id),
        campaignsApi.listEventSchools(campaignId, event.id),
      ]);
      setJamStages(stages);
      setSchools(rows as JamSchoolRow[]);
    } catch (e: any) { onError(extractApiError(e, 'Не удалось загрузить джем')); }
    finally { setLoading(false); }
  }, [campaignId, event.id, onError]);

  useEffect(() => { loadData(); }, [loadData]);

  const byStage = useMemo(() =>
    jamStages.map((s) => ({ ...s, items: schools.filter((sc) => sc.jam_stage === s.key) })),
  [jamStages, schools]);

  const activeSchool = useMemo(
    () => activeId ? schools.find((sc) => String(sc.school_campaign_id) === activeId) : null,
    [activeId, schools]
  );

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = async (dragEvent: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = dragEvent;
    if (!over || active.id === over.id) return;
    const scId = Number(active.id);
    const newStage = String(over.id).replace('col-', '');
    const sc = schools.find((s) => s.school_campaign_id === scId);
    if (!sc || sc.jam_stage === newStage) return;
    // Optimistic update
    setSchools((prev) => prev.map((s) => s.school_campaign_id === scId ? { ...s, jam_stage: newStage } : s));
    try {
      await campaignsApi.updateSchoolJamStage(campaignId, event.id, scId, newStage);
    } catch (e: any) {
      onError(extractApiError(e, 'Не удалось обновить этап'));
      loadData(); // revert
    }
  };

  if (loading) return <Typography color="text.secondary">Загрузка…</Typography>;

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={onBack}>К джемам</Button>
        <Typography variant="h6" sx={{ flex: 1 }}>{event.title}</Typography>
        {canManage && (
          <Button variant="outlined" size="small" startIcon={<SettingsOutlined />} onClick={() => setStagesDialogOpen(true)}>
            Этапы
          </Button>
        )}
      </Stack>

      {jamStages.length === 0 ? (
        <Alert severity="info">Этапы джема не настроены. Нажмите «Этапы» чтобы добавить.</Alert>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', flexWrap: 'nowrap', pb: 1, alignItems: 'flex-start' }}>
            {byStage.map((col) => (
              <DroppableColumn key={col.key} id={`col-${col.key}`} label={col.label} count={col.items.length} isTerminal={col.is_terminal}>
                {col.items.map((sc) => (
                  <DraggableCard
                    key={sc.school_campaign_id}
                    id={String(sc.school_campaign_id)}
                    schoolName={sc.school_name || `#${sc.school_campaign_id}`}
                    schoolCity={sc.school_city}
                  />
                ))}
              </DroppableColumn>
            ))}
          </Box>
          <DragOverlay>
            {activeSchool && (
              <Card variant="outlined" sx={{ width: 300, maxWidth: 300, opacity: 0.9, boxShadow: 4, overflow: 'hidden' }}>
                <CardContent sx={{ py: 1, px: 1.5 }}>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere', lineHeight: 1.35 }}>{activeSchool.school_name}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>{activeSchool.school_city}</Typography>
                </CardContent>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <JamStagesDialog
        open={stagesDialogOpen}
        campaignId={campaignId}
        eventId={event.id}
        stages={jamStages}
        onClose={() => setStagesDialogOpen(false)}
        onChanged={(updated) => { setJamStages(updated); void loadData(); }}
      />
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Droppable колонка-джем для внешнего канбана
// ---------------------------------------------------------------------------
interface JamEventColumnProps {
  event: CampaignEvent;
  schoolCount: number;
  onOpen: (ev: CampaignEvent) => void;
  canManage: boolean;
  onEdit: (ev: CampaignEvent) => void;
  onArchive: (ev: CampaignEvent) => void;
  onDelete: (ev: CampaignEvent) => void;
}

const JamEventColumn: React.FC<JamEventColumnProps> = ({ event, schoolCount, onOpen, canManage, onEdit, onArchive, onDelete }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `event-${event.id}` });

  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      sx={{
        width: 390,
        maxWidth: '100%',
        bgcolor: isOver ? 'action.selected' : 'background.paper',
        borderColor: isOver ? 'primary.main' : undefined,
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" gap={0.5} mb={0.5}>
          <Typography variant="subtitle2" sx={{ flex: 1 }} fontWeight={700}>{event.title}</Typography>
          {canManage && (
            <>
              <Tooltip title="Редактировать джем">
                <IconButton size="small" onClick={() => onEdit(event)}><DriveFileRenameOutline fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Архивировать джем">
                <IconButton size="small" onClick={() => onArchive(event)}><ArchiveOutlined fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Удалить джем">
                <IconButton size="small" color="error" onClick={() => onDelete(event)}><DeleteOutline fontSize="small" /></IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip title="Открыть канбан джема">
            <IconButton size="small" onClick={() => onOpen(event)}><OpenInNew fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block">
          {event.event_date}{event.location && ` · ${event.location}`}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {schoolCount} школ добавлено
        </Typography>
        <Button size="small" variant="outlined" fullWidth onClick={() => onOpen(event)}>
          Открыть канбан →
        </Button>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Внешний канбан Game Jam: пул школ + колонки-джемы с DnD
// ---------------------------------------------------------------------------
interface GameJamKanbanProps {
  campaignId: number;
  canManage: boolean;
  onError: (msg: string | null) => void;
}

export const GameJamKanban: React.FC<GameJamKanbanProps> = ({ campaignId, canManage, onError }) => {
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [schoolPool, setSchoolPool] = useState<SchoolCampaign[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CampaignEvent | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CampaignEvent | null>(null);
  const [addSchoolsOpen, setAddSchoolsOpen] = useState(false);
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [trainers, setTrainers] = useState<User[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [availableSchools, setAvailableSchools] = useState<AvailableSchool[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<number[]>([]);
  const [addSchoolsLoading, setAddSchoolsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jamSchoolCounts, setJamSchoolCounts] = useState<Record<number, number>>({});
  const [activePoolSchoolId, setActivePoolSchoolId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadData = useCallback(async () => {
    setLoading(true); onError(null);
    try {
      const [allEvents, pool] = await Promise.all([
        campaignsApi.listCampaignEvents(campaignId),
        campaignsApi.listSchoolCampaigns(campaignId),
      ]);
      const evs = allEvents.filter((event) => event.status !== 'archived');
      setEvents(evs);
      const counts: Record<number, number> = {};
      const assignedSchoolIds = new Set<number>();
      await Promise.all(evs.map(async (ev) => {
        try {
          const rows = await campaignsApi.listEventSchools(campaignId, ev.id) as Array<{ school_campaign_id: number; school_campaign_event_id?: number | null }>;
          const assignedRows = rows.filter((row) => row.school_campaign_event_id);
          assignedRows.forEach((row) => assignedSchoolIds.add(row.school_campaign_id));
          counts[ev.id] = assignedRows.length;
        }
        catch { counts[ev.id] = 0; }
      }));
      setSchoolPool(pool.filter((school) => !assignedSchoolIds.has(school.id)));
      setJamSchoolCounts(counts);
    } catch (e: any) { onError(extractApiError(e, 'Не удалось загрузить данные')); }
    finally { setLoading(false); }
  }, [campaignId, onError]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!addSchoolsOpen) return;
    let cancelled = false;
    const loadDictionaries = async () => {
      try {
        const [cityItems, districtItems] = await Promise.all([
          b2bApi.listCities(),
          settingsApi.getB2BDistricts(),
        ]);
        if (!cancelled) {
          setCities(cityItems);
          setDistricts(districtItems.items);
        }
      } catch (e: any) {
        if (!cancelled) onError(extractApiError(e, 'Не удалось загрузить фильтры школ'));
      }
    };
    void loadDictionaries();
    return () => { cancelled = true; };
  }, [addSchoolsOpen, onError]);

  useEffect(() => {
    if (!addSchoolsOpen) return;
    let cancelled = false;
    const loadAvailableSchools = async () => {
      setAddSchoolsLoading(true);
      try {
        const rows = await campaignsApi.listSchoolsAvailable(campaignId, {
          cities: selectedCities,
          districts: selectedDistricts,
          search: schoolSearch.trim() || undefined,
        });
        if (!cancelled) {
          setAvailableSchools(rows);
          setSelectedSchoolIds((prev) => prev.filter((id) => rows.some((school) => school.id === id)));
        }
      } catch (e: any) {
        if (!cancelled) onError(extractApiError(e, 'Не удалось загрузить список школ'));
      } finally {
        if (!cancelled) setAddSchoolsLoading(false);
      }
    };
    void loadAvailableSchools();
    return () => { cancelled = true; };
  }, [addSchoolsOpen, campaignId, onError, schoolSearch, selectedCities, selectedDistricts]);

  useEffect(() => {
    if (!createEventOpen) return;
    let cancelled = false;
    const loadTrainers = async () => {
      try {
        const rows = await usersApi.getAll('trainer');
        if (!cancelled) setTrainers(rows);
      } catch (e: any) {
        if (!cancelled) onError(extractApiError(e, 'Не удалось загрузить тренеров'));
      }
    };
    void loadTrainers();
    return () => { cancelled = true; };
  }, [createEventOpen, onError]);

  const openAddSchools = () => {
    setSelectedCities([]);
    setSelectedDistricts([]);
    setSchoolSearch('');
    setSelectedSchoolIds([]);
    setAddSchoolsOpen(true);
  };

  const openCreateEvent = () => {
    setEditingEvent(null);
    setEventForm(emptyEventForm);
    setCreateEventOpen(true);
  };

  const openEditEvent = (event: CampaignEvent) => {
    setEditingEvent(event);
    setEventForm({
      title: event.title || '',
      description: event.description || event.notes || '',
      event_date: event.event_date || '',
      start_time: toTimeValue(event.starts_at),
      end_time: toTimeValue(event.ends_at),
      trainer_id: event.trainer_id ? String(event.trainer_id) : '',
      location: event.location || '',
    });
    setCreateEventOpen(true);
  };

  const toggleSchoolSelection = (schoolId: number) => {
    setSelectedSchoolIds((prev) => (
      prev.includes(schoolId) ? prev.filter((id) => id !== schoolId) : [...prev, schoolId]
    ));
  };

  const toggleAllFilteredSchools = () => {
    const visibleIds = availableSchools.map((school) => school.id);
    const selectedVisibleCount = visibleIds.filter((id) => selectedSchoolIds.includes(id)).length;
    setSelectedSchoolIds((prev) => {
      if (selectedVisibleCount === visibleIds.length) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const handleAddSchools = async () => {
    if (!selectedSchoolIds.length) return;
    setAddSchoolsLoading(true); onError(null);
    try {
      await campaignsApi.addSchools(campaignId, { school_ids: selectedSchoolIds });
      setAddSchoolsOpen(false);
      setSelectedSchoolIds([]);
      await loadData();
    } catch (ex: any) { onError(extractApiError(ex, 'Не удалось добавить школы')); }
    finally { setAddSchoolsLoading(false); }
  };

  const handleSaveEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.event_date) return;
    onError(null);
    const payload = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || null,
      event_date: eventForm.event_date,
      starts_at: toEventDateTime(eventForm.event_date, eventForm.start_time),
      ends_at: toEventDateTime(eventForm.event_date, eventForm.end_time),
      trainer_id: eventForm.trainer_id ? Number(eventForm.trainer_id) : null,
      location: eventForm.location.trim() || null,
    };
    try {
      if (editingEvent) {
        await campaignsApi.updateCampaignEvent(campaignId, editingEvent.id, payload);
      } else {
        await campaignsApi.createCampaignEvent(campaignId, payload);
      }
      setCreateEventOpen(false);
      setEditingEvent(null);
      setEventForm(emptyEventForm);
      await loadData();
    } catch (ex: any) { onError(extractApiError(ex, editingEvent ? 'Не удалось сохранить джем' : 'Не удалось создать джем')); }
  };

  const handleArchiveEvent = async (event: CampaignEvent) => {
    if (!window.confirm(`Архивировать джем «${event.title}»?`)) return;
    onError(null);
    setEvents((prev) => prev.filter((item) => item.id !== event.id));
    try {
      await campaignsApi.updateCampaignEvent(campaignId, event.id, { status: 'archived' });
      await loadData();
    } catch (ex: any) {
      onError(extractApiError(ex, 'Не удалось архивировать джем'));
      await loadData();
    }
  };

  const handleDeleteEvent = async (event: CampaignEvent) => {
    if (!window.confirm(`Удалить джем «${event.title}»? Все школы внутри этого джема вернутся в пул.`)) return;
    onError(null);
    setEvents((prev) => prev.filter((item) => item.id !== event.id));
    try {
      await campaignsApi.deleteCampaignEvent(campaignId, event.id);
      await loadData();
    } catch (ex: any) {
      onError(extractApiError(ex, 'Не удалось удалить джем'));
      await loadData();
    }
  };

  const activePoolSchool = useMemo(
    () => activePoolSchoolId
      ? schoolPool.find((school) => String(school.id) === activePoolSchoolId)
      : null,
    [activePoolSchoolId, schoolPool]
  );

  const handlePoolDragStart = (event: DragStartEvent) => {
    setActivePoolSchoolId(String(event.active.id));
  };

  const handlePoolDragEnd = async (event: DragEndEvent) => {
    setActivePoolSchoolId(null);
    const { active, over } = event;
    if (!over || !String(over.id).startsWith('event-')) return;
    const schoolCampaignId = Number(active.id);
    const eventId = Number(String(over.id).replace('event-', ''));
    if (!schoolCampaignId || !eventId) return;

    onError(null);
    setJamSchoolCounts((prev) => ({ ...prev, [eventId]: (prev[eventId] ?? 0) + 1 }));
    setSchoolPool((prev) => prev.filter((school) => school.id !== schoolCampaignId));
    try {
      await campaignsApi.upsertSchoolCampaignEvent(campaignId, eventId, schoolCampaignId, {});
      await loadData();
    } catch (ex: any) {
      onError(extractApiError(ex, 'Не удалось добавить школу в джем'));
      await loadData();
    }
  };

  if (loading) return <Typography color="text.secondary">Загрузка…</Typography>;

  const allFilteredSelected = availableSchools.length > 0
    && availableSchools.every((school) => selectedSchoolIds.includes(school.id));
  const someFilteredSelected = availableSchools.some((school) => selectedSchoolIds.includes(school.id));

  if (selectedEvent) {
    return (
      <JamInnerKanban
        campaignId={campaignId}
        event={selectedEvent}
        canManage={canManage}
        onBack={() => { setSelectedEvent(null); void loadData(); }}
        onError={onError}
      />
    );
  }

  return (
    <Box>
      {canManage && (
        <Stack direction="row" gap={1} sx={{ mb: 2 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreateEvent}>
            Создать джем
          </Button>
          <Button variant="outlined" startIcon={<Add />} onClick={openAddSchools}>
            Добавить школы
          </Button>
        </Stack>
      )}

      <DndContext sensors={sensors} onDragStart={handlePoolDragStart} onDragEnd={(e) => void handlePoolDragEnd(e)}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', pb: 1, flexWrap: { xs: 'wrap', lg: 'nowrap' } }}>
          {/* Пул школ — draggable */}
          <Card variant="outlined" sx={{ width: 460, maxWidth: 460, flex: '0 0 460px', bgcolor: 'action.hover' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Пул школ</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                {schoolPool.length} школ в пуле кампании
              </Typography>
              <Button size="small" variant="outlined" fullWidth onClick={openAddSchools} disabled={!canManage}>
                Выбрать школы
              </Button>
              {schoolPool.length > 0 ? (
                <Stack spacing={1.25} sx={{ mt: 1.5, maxHeight: 440, overflowY: 'auto', pr: 0.75 }}>
                  {schoolPool.map((school) => (
                    <DraggableCard
                      key={school.id}
                      id={String(school.id)}
                      schoolName={school.school_name || `#${school.id}`}
                      schoolCity={school.school_city}
                      extraLabel={school.school_district ?? undefined}
                    />
                  ))}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                  Школы не добавлены
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Колонки-джемы — droppable */}
          <Stack spacing={2} sx={{ width: 420, maxWidth: '100%' }}>
            {events.map((ev) => (
              <JamEventColumn
                key={ev.id}
                event={ev}
                schoolCount={jamSchoolCounts[ev.id] ?? 0}
                onOpen={setSelectedEvent}
                canManage={canManage}
                onEdit={openEditEvent}
                onArchive={(event) => void handleArchiveEvent(event)}
                onDelete={(event) => void handleDeleteEvent(event)}
              />
            ))}

            {events.length === 0 && (
            <Card variant="outlined" sx={{ width: 390, maxWidth: '100%', bgcolor: 'action.selected' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" align="center">
                  Нет джемов. Создайте первый.
                </Typography>
              </CardContent>
            </Card>
            )}
          </Stack>
        </Box>
        <DragOverlay>
          {activePoolSchool && (
            <Card variant="outlined" sx={{ width: 300, maxWidth: 300, opacity: 0.95, boxShadow: 4, overflow: 'hidden' }}>
              <CardContent sx={{ py: 1, px: 1.5 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere', lineHeight: 1.35 }}>{activePoolSchool.school_name}</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                  {[activePoolSchool.school_city, activePoolSchool.school_district].filter(Boolean).join(' · ')}
                </Typography>
              </CardContent>
            </Card>
            )}
        </DragOverlay>
      </DndContext>

      <Dialog open={addSchoolsOpen} onClose={() => setAddSchoolsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Добавить школы в пул</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={cities}
                value={selectedCities}
                onChange={(_, value) => setSelectedCities(value)}
                renderInput={(params) => <TextField {...params} label="Города" />}
                sx={{ flex: 1 }}
              />
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={districts}
                value={selectedDistricts}
                onChange={(_, value) => setSelectedDistricts(value)}
                renderInput={(params) => <TextField {...params} label="Районы" />}
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField
              label="Поиск по названию"
              value={schoolSearch}
              onChange={(e) => setSchoolSearch(e.target.value)}
              fullWidth
            />
            <Stack direction="row" alignItems="center" gap={1}>
              <Checkbox
                checked={allFilteredSelected}
                indeterminate={!allFilteredSelected && someFilteredSelected}
                onChange={toggleAllFilteredSchools}
                disabled={availableSchools.length === 0}
              />
              <Typography variant="body2" sx={{ flex: 1 }}>
                Выбрать все отфильтрованные
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedSchoolIds.length} из {availableSchools.length}
              </Typography>
            </Stack>
            <Divider />
            <Stack spacing={0.5} sx={{ maxHeight: 360, overflowY: 'auto', pr: 0.5 }}>
              {availableSchools.map((school) => (
                <Stack
                  key={school.id}
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <Checkbox
                    checked={selectedSchoolIds.includes(school.id)}
                    onChange={() => toggleSchoolSelection(school.id)}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2">{school.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[school.city, school.district].filter(Boolean).join(' · ') || 'Город не указан'}
                    </Typography>
                  </Box>
                </Stack>
              ))}
              {!addSchoolsLoading && availableSchools.length === 0 && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                  Нет школ по выбранным фильтрам
                </Typography>
              )}
              {addSchoolsLoading && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                  Загрузка...
                </Typography>
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddSchoolsOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => void handleAddSchools()}
            disabled={selectedSchoolIds.length === 0 || addSchoolsLoading}
          >
            Добавить выбранные
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createEventOpen} onClose={() => { setCreateEventOpen(false); setEditingEvent(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingEvent ? 'Редактировать джем' : 'Новый джем'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Название" required fullWidth value={eventForm.title}
              onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} />
            <TextField
              label="Описание"
              fullWidth
              multiline
              minRows={3}
              value={eventForm.description}
              onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
            />
            <TextField label="Дата" type="date" required fullWidth InputLabelProps={{ shrink: true }} value={eventForm.event_date}
              onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField label="Начало" type="time" fullWidth InputLabelProps={{ shrink: true }} value={eventForm.start_time}
                onChange={(e) => setEventForm((f) => ({ ...f, start_time: e.target.value }))} />
              <TextField label="Окончание" type="time" fullWidth InputLabelProps={{ shrink: true }} value={eventForm.end_time}
                onChange={(e) => setEventForm((f) => ({ ...f, end_time: e.target.value }))} />
            </Stack>
            <FormControl fullWidth>
              <InputLabel id="game-jam-trainer-label">Тренер</InputLabel>
              <Select
                labelId="game-jam-trainer-label"
                label="Тренер"
                value={eventForm.trainer_id}
                onChange={(e) => setEventForm((f) => ({ ...f, trainer_id: String(e.target.value) }))}
              >
                <MenuItem value="">Не выбран</MenuItem>
                {trainers.map((trainer) => (
                  <MenuItem key={trainer.id} value={trainer.id}>{trainer.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Локация проведения (адрес)" fullWidth value={eventForm.location}
              onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateEventOpen(false); setEditingEvent(null); }}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSaveEvent()}
            disabled={!eventForm.title.trim() || !eventForm.event_date}>
            {editingEvent ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
