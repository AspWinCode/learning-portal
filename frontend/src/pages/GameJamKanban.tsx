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
import { campaignsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { CampaignEvent, CampaignEventStage, CampaignStage, SchoolCampaign } from '../types';

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
      sx={{ bgcolor: 'background.paper', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
    >
      <CardContent sx={{ py: 1, px: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <DragIndicator fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0 }} {...attributes} {...listeners} />
          <Box>
            <Typography variant="body2">{schoolName}</Typography>
            {schoolCity && <Typography variant="caption" color="text.secondary">{schoolCity}</Typography>}
            {extraLabel && <Typography variant="caption" display="block" color="text.secondary">{extraLabel}</Typography>}
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
        minWidth: 240,
        flex: '0 0 auto',
        bgcolor: isOver ? 'action.selected' : highlight ? 'action.hover' : undefined,
        transition: 'background-color 0.15s',
        border: isOver ? '2px solid' : undefined,
        borderColor: isOver ? 'primary.main' : undefined,
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" gap={0.5} mb={0.5}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>{label}</Typography>
          {isTerminal && <Chip label="финал" size="small" variant="outlined" />}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {count} шт.
        </Typography>
        <Stack spacing={1}>{children}</Stack>
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

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const scId = Number(active.id);
    const newStage = String(over.id).replace('col-', '');
    const sc = schools.find((s) => s.school_campaign_id === scId);
    if (!sc || sc.jam_stage === newStage) return;
    // Optimistic update
    setSchools((prev) => prev.map((s) => s.school_campaign_id === scId ? { ...s, jam_stage: newStage } : s));
    try {
      await campaignsApi.updateSchoolJamStage(campaignId, event.active.data?.current?.eventId ?? event.over?.id, scId, newStage);
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
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', flexWrap: 'nowrap', pb: 1 }}>
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
              <Card variant="outlined" sx={{ minWidth: 200, opacity: 0.9, boxShadow: 4 }}>
                <CardContent sx={{ py: 1, px: 1.5 }}>
                  <Typography variant="body2">{activeSchool.school_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{activeSchool.school_city}</Typography>
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
}

const JamEventColumn: React.FC<JamEventColumnProps> = ({ event, schoolCount, onOpen }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `jam-${event.id}` });
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
          <Typography variant="subtitle2" sx={{ flex: 1 }} fontWeight={700}>{event.title}</Typography>
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
  const [campaignStages, setCampaignStages] = useState<CampaignStage[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CampaignEvent | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', event_date: '' });
  const [loading, setLoading] = useState(false);
  const [jamSchoolCounts, setJamSchoolCounts] = useState<Record<number, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadData = useCallback(async () => {
    setLoading(true); onError(null);
    try {
      const [evs, pool, stages] = await Promise.all([
        campaignsApi.listCampaignEvents(campaignId),
        campaignsApi.listSchoolCampaigns(campaignId),
        campaignsApi.listStages(campaignId),
      ]);
      setEvents(evs); setSchoolPool(pool); setCampaignStages(stages);
      const counts: Record<number, number> = {};
      await Promise.all(evs.map(async (ev) => {
        try { counts[ev.id] = (await campaignsApi.listEventSchools(campaignId, ev.id)).length; }
        catch { counts[ev.id] = 0; }
      }));
      setJamSchoolCounts(counts);
    } catch (e: any) { onError(extractApiError(e, 'Не удалось загрузить данные')); }
    finally { setLoading(false); }
  }, [campaignId, onError]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeSchool = useMemo(
    () => activeId ? schoolPool.find((sc) => String(sc.id) === activeId) : null,
    [activeId, schoolPool]
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const scId = Number(active.id);
    const overId = String(over.id);
    if (!overId.startsWith('jam-')) return;
    const eventId = Number(overId.replace('jam-', ''));
    if (!eventId) return;
    try {
      await campaignsApi.upsertSchoolCampaignEvent(campaignId, eventId, scId, {});
      setJamSchoolCounts((prev) => ({ ...prev, [eventId]: (prev[eventId] ?? 0) + 1 }));
    } catch (ex: any) { onError(extractApiError(ex, 'Не удалось добавить школу в джем')); }
  };

  const handleCreateEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.event_date) return;
    onError(null);
    try {
      await campaignsApi.createCampaignEvent(campaignId, { title: eventForm.title.trim(), event_date: eventForm.event_date });
      setCreateEventOpen(false);
      setEventForm({ title: '', event_date: '' });
      await loadData();
    } catch (ex: any) { onError(extractApiError(ex, 'Не удалось создать джем')); }
  };

  if (loading) return <Typography color="text.secondary">Загрузка…</Typography>;

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
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateEventOpen(true)}>
            Создать джем
          </Button>
        </Stack>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', flexWrap: 'nowrap', alignItems: 'flex-start', pb: 1 }}>
          {/* Пул школ — draggable */}
          <Card variant="outlined" sx={{ minWidth: 280, flex: '0 0 auto', bgcolor: 'action.hover' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Пул школ</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                {schoolPool.length} школ · перетащите в джем
              </Typography>
              <Stack spacing={1}>
                {schoolPool.map((sc) => (
                  <DraggableCard
                    key={sc.id}
                    id={String(sc.id)}
                    schoolName={sc.school_name || `Школа #${sc.b2b_school_id}`}
                    schoolCity={sc.school_city}
                    extraLabel={campaignStages.find((s) => s.key === sc.stage)?.label}
                  />
                ))}
                {schoolPool.length === 0 && (
                  <Typography variant="caption" color="text.secondary">Школы не добавлены</Typography>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* Колонки-джемы — droppable */}
          {events.map((ev) => (
            <JamEventColumn
              key={ev.id}
              event={ev}
              schoolCount={jamSchoolCounts[ev.id] ?? 0}
              onOpen={setSelectedEvent}
            />
          ))}

          {events.length === 0 && (
            <Card variant="outlined" sx={{ minWidth: 220, bgcolor: 'action.selected' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" align="center">
                  Нет джемов. Создайте первый.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Box>

        <DragOverlay>
          {activeSchool && (
            <Card variant="outlined" sx={{ minWidth: 200, opacity: 0.9, boxShadow: 4 }}>
              <CardContent sx={{ py: 1, px: 1.5 }}>
                <Typography variant="body2">{activeSchool.school_name || `#${activeSchool.id}`}</Typography>
                <Typography variant="caption" color="text.secondary">{activeSchool.school_city}</Typography>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      <Dialog open={createEventOpen} onClose={() => setCreateEventOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новый джем</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Название" required fullWidth value={eventForm.title}
              onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} />
            <TextField label="Дата" type="date" required fullWidth InputLabelProps={{ shrink: true }} value={eventForm.event_date}
              onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateEventOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleCreateEvent()}
            disabled={!eventForm.title.trim() || !eventForm.event_date}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
