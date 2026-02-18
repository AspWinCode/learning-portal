import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Layout from '../components/Layout';
import { b2bApi, ownerFunnelsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type {
  B2BSchool,
  OwnerFunnelTypeInfo,
  OwnerFunnelEvent,
  OwnerFunnelItem,
  OwnerFunnelCardData,
} from '../types';

const FUNNEL_EVENTS = 'events';

/** ╨н╤В╨░╨┐╤Л ╨▓╨╛╤А╨╛╨╜╨║╨╕ ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П, ╨┐╤А╨╕ ╨┐╨╡╤А╨╡╤Е╨╛╨┤╨╡ ╨╜╨░ ╨║╨╛╤В╨╛╤А╤Л╨╡ ╨┐╨╛╨║╨░╨╖╤Л╨▓╨░╨╡╤В╤Б╤П popup */
const EVENTS_POPUP_STAGES: Record<string, 'contact' | 'reply' | 'meeting' | 'trip' | 'leads'> = {
  contact_found: 'contact',
  reply_received: 'reply',
  meeting_agreed: 'meeting',
  trip_agreed: 'trip',
  leads_collected: 'leads',
};

const OwnerFunnelsPage: React.FC = () => {
  const navigate = useNavigate();
  const [funnelTypes, setFunnelTypes] = useState<OwnerFunnelTypeInfo[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>('');
  const [events, setEvents] = useState<OwnerFunnelEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [items, setItems] = useState<OwnerFunnelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addSchoolsOpen, setAddSchoolsOpen] = useState(false);
  const [cardDetailItem, setCardDetailItem] = useState<OwnerFunnelItem | null>(null);
  const [cardDetailSchool, setCardDetailSchool] = useState<B2BSchool | null>(null);
  const [cardDetailSchoolLoading, setCardDetailSchoolLoading] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [addSchoolsLoading, setAddSchoolsLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventDates, setNewEventDates] = useState('');
  const [newCardTitle, setNewCardTitle] = useState('');
  const [movingId, setMovingId] = useState<number | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [stagePopup, setStagePopup] = useState<{
    item: OwnerFunnelItem;
    newStage: string;
    kind: 'contact' | 'reply' | 'meeting' | 'trip' | 'leads';
  } | null>(null);
  const [stageForm, setStageForm] = useState<{
    contact_fio: string;
    contact_phone: string;
    contact_comment: string;
    reply_comment: string;
    meeting_date: string;
    trip_date: string;
    leads_count: string;
  }>({
    contact_fio: '',
    contact_phone: '',
    contact_comment: '',
    reply_comment: '',
    meeting_date: '',
    trip_date: '',
    leads_count: '',
  });

  const selectedFunnel = funnelTypes.find((f) => f.id === selectedFunnelId);
  const itemsByStage = selectedFunnel
    ? selectedFunnel.stages.map((stage) => ({
        ...stage,
        items: items.filter((i) => i.stage === stage.value),
      }))
    : [];

  const loadTypes = useCallback(async () => {
    try {
      const data = await ownerFunnelsApi.listTypes();
      setFunnelTypes(data);
      if (data.length && !selectedFunnelId) setSelectedFunnelId(data[0].id);
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╤В╨╕╨┐╤Л ╨▓╨╛╤А╨╛╨╜╨╛╨║'));
    }
  }, [selectedFunnelId]);

  const loadEvents = useCallback(async () => {
    try {
      const data = await ownerFunnelsApi.listEvents();
      setEvents(data);
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П'));
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (!selectedFunnelId) return;
    if (selectedFunnelId === FUNNEL_EVENTS && selectedEventId == null) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data =
        selectedFunnelId === FUNNEL_EVENTS && selectedEventId != null
          ? await ownerFunnelsApi.listItems(selectedFunnelId, { eventId: selectedEventId })
          : await ownerFunnelsApi.listItems(selectedFunnelId);
      setItems(data);
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╤Н╨╗╨╡╨╝╨╡╨╜╤В╤Л'));
    } finally {
      setLoading(false);
    }
  }, [selectedFunnelId, selectedEventId]);

  const loadCities = useCallback(async () => {
    try {
      const data = await b2bApi.listCities();
      setCities(data);
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╨│╨╛╤А╨╛╨┤╨░'));
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (selectedFunnelId === FUNNEL_EVENTS) loadEvents();
  }, [selectedFunnelId, loadEvents]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (addSchoolsOpen) loadCities();
  }, [addSchoolsOpen, loadCities]);

  useEffect(() => {
    const b2bId = cardDetailItem?.card_data &&
      typeof cardDetailItem.card_data === 'object' &&
      (cardDetailItem.card_data as Record<string, unknown>).b2b_school_id;
    const id = typeof b2bId === 'number' ? b2bId : null;
    if (!id) {
      setCardDetailSchool(null);
      return;
    }
    setCardDetailSchoolLoading(true);
    setCardDetailSchool(null);
    b2bApi
      .getSchool(id)
      .then(setCardDetailSchool)
      .catch(() => setCardDetailSchool(null))
      .finally(() => setCardDetailSchoolLoading(false));
  }, [cardDetailItem?.id, cardDetailItem?.card_data]);

  const handleFunnelChange = (funnelId: string) => {
    setSelectedFunnelId(funnelId);
    if (funnelId !== FUNNEL_EVENTS) setSelectedEventId(null);
    // ╨Я╤А╨╕ ╨▓╤Л╨▒╨╛╤А╨╡ ┬л╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П┬╗ ╤Б╤А╨░╨╖╤Г ╨╛╤В╨║╤А╤Л╨▓╨░╨╡╨╝ popup ╤Б╨╛╨╖╨┤╨░╨╜╨╕╤П ╨▓╨╛╤А╨╛╨╜╨║╨╕ (╨╜╨░╨╖╨▓╨░╨╜╨╕╨╡ + ╨┤╨░╤В╤Л)
    if (funnelId === FUNNEL_EVENTS) {
      setCreateOpen(true);
    }
  };

  const isEventsFunnel = selectedFunnelId === FUNNEL_EVENTS;

  const handleCreate = async () => {
    if (!selectedFunnelId || !selectedFunnel) return;
    if (isEventsFunnel && !newEventName.trim()) return;
    setError(null);
    try {
      if (isEventsFunnel) {
        const created = await ownerFunnelsApi.createEvent({
          event_name: newEventName.trim(),
          event_dates: newEventDates.trim() || undefined,
        });
        setNewEventName('');
        setNewEventDates('');
        setCreateOpen(false);
        await loadEvents();
        setSelectedEventId(created.id);
        loadItems();
      } else {
        await ownerFunnelsApi.createItem({
          funnel_type: selectedFunnelId,
          stage: 'new',
          title: newTitle.trim() || undefined,
          comment: newComment.trim() || undefined,
        });
        setNewTitle('');
        setNewComment('');
        setCreateOpen(false);
        loadItems();
      }
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨╛╨╖╨┤╨░╤В╤М'));
    }
  };

  const handleAddCard = async () => {
    if (selectedEventId == null) return;
    setError(null);
    try {
      await ownerFunnelsApi.createItem({
        funnel_type: FUNNEL_EVENTS,
        stage: 'new',
        event_id: selectedEventId,
        title: newCardTitle.trim() || undefined,
      });
      setNewCardTitle('');
      setAddCardOpen(false);
      loadItems();
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨┤╨╛╨▒╨░╨▓╨╕╤В╤М ╨║╨░╤А╤В╨╛╤З╨║╤Г'));
    }
  };

  const handleAddSchools = async () => {
    if (selectedEventId == null || !selectedCity.trim()) return;
    setAddSchoolsLoading(true);
    setError(null);
    try {
      const result = await ownerFunnelsApi.addSchoolsByCity(selectedEventId, selectedCity.trim());
      setAddSchoolsOpen(false);
      setSelectedCity('');
      loadItems();
      if (result.added > 0) {
        setError(null);
        // ╨Ь╨╛╨╢╨╜╨╛ ╨┐╨╛╨║╨░╨╖╨░╤В╤М ╤Г╤Б╨┐╨╡╤Е: ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╛ result.added ╨╕╨╖ result.total_in_city
      }
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨┤╨╛╨▒╨░╨▓╨╕╤В╤М ╤И╨║╨╛╨╗╤Л'));
    } finally {
      setAddSchoolsLoading(false);
    }
  };

  const openMoveOrPopup = (item: OwnerFunnelItem, newStage: string) => {
    const kind = isEventsFunnel ? EVENTS_POPUP_STAGES[newStage] : undefined;
    if (kind) {
      setStagePopup({ item, newStage, kind });
      setStageForm({
        contact_fio: (item.card_data as OwnerFunnelCardData)?.contact_fio ?? '',
        contact_phone: (item.card_data as OwnerFunnelCardData)?.contact_phone ?? '',
        contact_comment: (item.card_data as OwnerFunnelCardData)?.contact_comment ?? '',
        reply_comment: (item.card_data as OwnerFunnelCardData)?.reply_comment ?? '',
        meeting_date: (item.card_data as OwnerFunnelCardData)?.meeting_date ?? '',
        trip_date: (item.card_data as OwnerFunnelCardData)?.trip_date ?? '',
        leads_count: String((item.card_data as OwnerFunnelCardData)?.leads_count ?? ''),
      });
    } else {
      handleMove(item, newStage, {});
    }
  };

  const handleMove = async (
    item: OwnerFunnelItem,
    newStage: string,
    payload: {
      contact_fio?: string;
      contact_phone?: string;
      contact_comment?: string;
      reply_comment?: string;
      meeting_date?: string;
      trip_date?: string;
      leads_count?: number;
    }
  ) => {
    setMovingId(item.id);
    setError(null);
    try {
      await ownerFunnelsApi.updateItem(item.id, { stage: newStage, ...payload });
      setStagePopup(null);
      loadItems();
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨┐╨╡╤А╨╡╨╜╨╡╤Б╤В╨╕'));
    } finally {
      setMovingId(null);
    }
  };

  const submitStagePopup = () => {
    if (!stagePopup) return;
    const { item, newStage, kind } = stagePopup;
    if (kind === 'contact') {
      handleMove(item, newStage, {
        contact_fio: stageForm.contact_fio.trim() || undefined,
        contact_phone: stageForm.contact_phone.trim() || undefined,
        contact_comment: stageForm.contact_comment.trim() || undefined,
      });
    } else if (kind === 'reply') {
      handleMove(item, newStage, { reply_comment: stageForm.reply_comment.trim() || undefined });
    } else if (kind === 'meeting') {
      handleMove(item, newStage, { meeting_date: stageForm.meeting_date.trim() || undefined });
    } else if (kind === 'trip') {
      handleMove(item, newStage, { trip_date: stageForm.trip_date.trim() || undefined });
    } else if (kind === 'leads') {
      const n = parseInt(stageForm.leads_count, 10);
      handleMove(item, newStage, { leads_count: isNaN(n) ? undefined : n });
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('╨г╨┤╨░╨╗╨╕╤В╤М ╤Н╨╗╨╡╨╝╨╡╨╜╤В?')) return;
    setError(null);
    try {
      await ownerFunnelsApi.deleteItem(id);
      loadItems();
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Г╨┤╨░╨╗╨╕╤В╤М'));
    }
  };

  const handleDragStart = (e: React.DragEvent, item: OwnerFunnelItem) => {
    setDraggedItemId(item.id);
    e.dataTransfer.setData('application/funnel-item-id', String(item.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stageValue: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageValue);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    setDraggedItemId(null);
    const itemId =
      draggedItemId != null
        ? String(draggedItemId)
        : e.dataTransfer.getData('application/funnel-item-id') || e.dataTransfer.getData('text/plain');
    if (!itemId) return;
    const item = items.find((i) => i.id === Number(itemId));
    if (!item || item.stage === targetStage) return;
    const kind = isEventsFunnel ? EVENTS_POPUP_STAGES[targetStage] : undefined;
    if (kind) {
      setStagePopup({ item, newStage: targetStage, kind });
      setStageForm({
        contact_fio: (item.card_data as OwnerFunnelCardData)?.contact_fio ?? '',
        contact_phone: (item.card_data as OwnerFunnelCardData)?.contact_phone ?? '',
        contact_comment: (item.card_data as OwnerFunnelCardData)?.contact_comment ?? '',
        reply_comment: (item.card_data as OwnerFunnelCardData)?.reply_comment ?? '',
        meeting_date: (item.card_data as OwnerFunnelCardData)?.meeting_date ?? '',
        trip_date: (item.card_data as OwnerFunnelCardData)?.trip_date ?? '',
        leads_count: String((item.card_data as OwnerFunnelCardData)?.leads_count ?? ''),
      });
    } else {
      handleMove(item, targetStage, {});
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          ╨Т╨╛╤А╨╛╨╜╨║╨╕
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>╨Т╨╛╤А╨╛╨╜╨║╨░</InputLabel>
            <Select
              value={selectedFunnelId}
              label="╨Т╨╛╤А╨╛╨╜╨║╨░"
              onChange={(e) => handleFunnelChange(e.target.value)}
            >
              {funnelTypes.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {isEventsFunnel && events.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <InputLabel>╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡</InputLabel>
              <Select
                value={selectedEventId ?? ''}
                label="╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡"
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
              >
                {events.map((ev) => (
                  <MenuItem key={ev.id} value={ev.id}>
                    {ev.event_name}
                    {ev.event_dates ? ` (${ev.event_dates})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {selectedFunnelId && !isEventsFunnel && (
            <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          )}
          {isEventsFunnel && selectedEventId != null && (
            <>
              <Button variant="contained" startIcon={<Add />} onClick={() => setAddCardOpen(true)}>
                ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╨║╨░╤А╤В╨╛╤З╨║╤Г
              </Button>
              <Button variant="outlined" startIcon={<Add />} onClick={() => setAddSchoolsOpen(true)}>
                ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╤И╨║╨╛╨╗╤Л
              </Button>
            </>
          )}
        </Stack>

        {!selectedFunnelId && funnelTypes.length === 0 && !loading && (
          <Typography color="text.secondary">╨Ч╨░╨│╤А╤Г╨╖╨║╨░ ╤В╨╕╨┐╨╛╨▓ ╨▓╨╛╤А╨╛╨╜╨╛╨║...</Typography>
        )}

        {isEventsFunnel && selectedEventId != null && selectedFunnel && (
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            {events.find((e) => e.id === selectedEventId)?.event_name}
            {events.find((e) => e.id === selectedEventId)?.event_dates &&
              ` тАФ ${events.find((e) => e.id === selectedEventId)?.event_dates}`}
          </Typography>
        )}

        {selectedFunnelId && selectedFunnel && (isEventsFunnel ? selectedEventId != null : true) && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${selectedFunnel.stages.length}, minmax(200px, 1fr))`,
              gap: 2,
              overflowX: 'auto',
            }}
          >
            {itemsByStage.map((col) => (
              <Card
                key={col.value}
                variant="outlined"
                sx={{
                  minHeight: 200,
                  ...(dragOverStage === col.value && draggedItemId
                    ? { backgroundColor: (theme) => theme.palette.action.hover, transition: 'background-color 0.2s' }
                    : {}),
                }}
                onDragOver={(e) => handleDragOver(e, col.value)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.value)}
              >
                <CardContent>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    {col.label}
                  </Typography>
                  <Stack spacing={1}>
                    {col.items.map((item) => (
                      <Card
                        key={item.id}
                        variant="outlined"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setCardDetailItem(item)}
                        sx={{
                          p: 1,
                          cursor: movingId === item.id ? 'wait' : draggedItemId === item.id ? 'grabbing' : 'pointer',
                          opacity: movingId === item.id ? 0.7 : draggedItemId === item.id ? 0.6 : 1,
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 0.5 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap>
                              {item.title || `#${item.id}`}
                            </Typography>
                            {isEventsFunnel && (item.card_data as OwnerFunnelCardData)?.contact_fio && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {(item.card_data as OwnerFunnelCardData).contact_fio}
                                {(item.card_data as OwnerFunnelCardData).contact_phone &&
                                  ` тАв ${(item.card_data as OwnerFunnelCardData).contact_phone}`}
                              </Typography>
                            )}
                            {!isEventsFunnel && item.comment && (
                              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                                {item.comment}
                              </Typography>
                            )}
                          </Box>
                          <Button
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                            sx={{ minWidth: 32 }}
                          >
                            <Delete fontSize="small" />
                          </Button>
                        </Box>
                      </Card>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        {loading && (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            ╨Ч╨░╨│╤А╤Г╨╖╨║╨░...
          </Typography>
        )}
      </Box>

      <Dialog
        open={!!cardDetailItem}
        onClose={() => {
          setCardDetailItem(null);
          setCardDetailSchool(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{cardDetailItem ? (cardDetailItem.title || `╨Ъ╨░╤А╤В╨╛╤З╨║╨░ #${cardDetailItem.id}`) : ''}</DialogTitle>
        <DialogContent>
          {cardDetailItem && selectedFunnel && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">╨н╤В╨░╨┐ ╨▓╨╛╤А╨╛╨╜╨║╨╕</Typography>
                <Typography variant="body1">
                  {selectedFunnel.stages.find((s) => s.value === cardDetailItem.stage)?.label ?? cardDetailItem.stage}
                </Typography>
              </Box>

              {cardDetailSchoolLoading && (
                <Typography variant="body2" color="text.secondary">╨Ч╨░╨│╤А╤Г╨╖╨║╨░ ╨┤╨░╨╜╨╜╤Л╤Е ╤И╨║╨╛╨╗╤Л...</Typography>
              )}
              {cardDetailSchool && (
                <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>╨Ф╨░╨╜╨╜╤Л╨╡ ╤И╨║╨╛╨╗╤Л (B2B)</Typography>
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</Typography>
                      <Typography variant="body2">{cardDetailSchool.name}</Typography>
                    </Box>
                    {cardDetailSchool.director && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Ф╨╕╤А╨╡╨║╤В╨╛╤А</Typography>
                        <Typography variant="body2">{cardDetailSchool.director}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.city && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨У╨╛╤А╨╛╨┤</Typography>
                        <Typography variant="body2">{cardDetailSchool.city}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.address && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Р╨┤╤А╨╡╤Б</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{cardDetailSchool.address}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.student_count != null && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛ ╤Г╤З╨╡╨╜╨╕╨║╨╛╨▓</Typography>
                        <Typography variant="body2">{cardDetailSchool.student_count}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.friendship_degree && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨б╤В╨╡╨┐╨╡╨╜╤М ╨┤╤А╤Г╨╢╨╡╨╗╤О╨▒╨╕╤П</Typography>
                        <Typography variant="body2">{cardDetailSchool.friendship_degree}</Typography>
                      </Box>
                    )}
                    <Box>
                      <Typography variant="caption" color="text.secondary">╨н╤В╨░╨┐ ╨▓ B2B</Typography>
                      <Typography variant="body2">{cardDetailSchool.pipeline_stage}</Typography>
                    </Box>
                    {cardDetailSchool.leads_count != null && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Ы╨╕╨┤╨╛╨▓ / ╨║╨╛╨╜╨▓╨╡╤А╤Б╨╕╤П</Typography>
                        <Typography variant="body2">
                          {cardDetailSchool.leads_count}
                          {cardDetailSchool.conversion_percent != null && ` (${cardDetailSchool.conversion_percent}%)`}
                        </Typography>
                      </Box>
                    )}
                    {cardDetailSchool.meeting_scheduled_at && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Т╤Б╤В╤А╨╡╤З╨░ ╨╖╨░╨┐╨╗╨░╨╜╨╕╤А╨╛╨▓╨░╨╜╨░</Typography>
                        <Typography variant="body2">{new Date(cardDetailSchool.meeting_scheduled_at).toLocaleString('ru-RU')}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.meeting_outcomes && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Ш╤В╨╛╨│╨╕ ╨▓╤Б╤В╤А╨╡╤З╨╕</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{cardDetailSchool.meeting_outcomes}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.walkthrough_scheduled_at && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Я╨╛╤Е╨╛╨┤ ╨╖╨░╨┐╨╗╨░╨╜╨╕╤А╨╛╨▓╨░╨╜</Typography>
                        <Typography variant="body2">{new Date(cardDetailSchool.walkthrough_scheduled_at).toLocaleString('ru-RU')}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.contacts && cardDetailSchool.contacts.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">╨Ъ╨╛╨╜╤В╨░╨║╤В╤Л</Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {cardDetailSchool.contacts.map((c) => (
                            <Typography key={c.id} variant="body2">
                              {c.full_name}
                              {c.position ? `, ${c.position}` : ''} тАФ {c.phone}
                              {c.phone_extra ? `, ${c.phone_extra}` : ''}
                            </Typography>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                </Box>
              )}

              {!isEventsFunnel && cardDetailItem.comment && (
                <Box>
                  <Typography variant="caption" color="text.secondary">╨Ъ╨╛╨╝╨╝╨╡╨╜╤В╨░╤А╨╕╨╣</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{cardDetailItem.comment}</Typography>
                </Box>
              )}
              {isEventsFunnel && cardDetailItem.card_data && (
                <>
                  {(cardDetailItem.card_data as OwnerFunnelCardData).contact_fio && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">╨Ъ╨╛╨╜╤В╨░╨║╤В (╨╕╨╖ ╨▓╨╛╤А╨╛╨╜╨║╨╕)</Typography>
                      <Typography variant="body2">
                        {(cardDetailItem.card_data as OwnerFunnelCardData).contact_fio}
                        {(cardDetailItem.card_data as OwnerFunnelCardData).contact_phone &&
                          ` тАв ${(cardDetailItem.card_data as OwnerFunnelCardData).contact_phone}`}
                      </Typography>
                      {(cardDetailItem.card_data as OwnerFunnelCardData).contact_comment && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {(cardDetailItem.card_data as OwnerFunnelCardData).contact_comment}
                        </Typography>
                      )}
                    </Box>
                  )}
                  {(cardDetailItem.card_data as OwnerFunnelCardData).reply_comment && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">╨Ю╤В╨▓╨╡╤В╨╜╨╛╨╡ ╨┐╨╕╤Б╤М╨╝╨╛ (╨║╨╛╨╝╨╝╨╡╨╜╤В╨░╤А╨╕╨╣)</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {(cardDetailItem.card_data as OwnerFunnelCardData).reply_comment}
                      </Typography>
                    </Box>
                  )}
                  {(cardDetailItem.card_data as OwnerFunnelCardData).meeting_date && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">╨Ф╨░╤В╨░ ╨▓╤Б╤В╤А╨╡╤З╨╕</Typography>
                      <Typography variant="body2">{(cardDetailItem.card_data as OwnerFunnelCardData).meeting_date}</Typography>
                    </Box>
                  )}
                  {(cardDetailItem.card_data as OwnerFunnelCardData).trip_date && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">╨Ф╨░╤В╨░ ╨┐╨╛╤Е╨╛╨┤╨░</Typography>
                      <Typography variant="body2">{(cardDetailItem.card_data as OwnerFunnelCardData).trip_date}</Typography>
                    </Box>
                  )}
                  {(cardDetailItem.card_data as OwnerFunnelCardData).leads_count != null && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">╨б╨╛╨▒╤А╨░╨╜╨╛ ╨╗╨╕╨┤╨╛╨▓ (╨▓╨╛╤А╨╛╨╜╨║╨░)</Typography>
                      <Typography variant="body2">{(cardDetailItem.card_data as OwnerFunnelCardData).leads_count}</Typography>
                    </Box>
                  )}
                  {(cardDetailItem.card_data as Record<string, unknown>)?.b2b_school_id != null && (
                    <Box>
                      <Button
                        size="small"
                        startIcon={<OpenInNew />}
                        onClick={() => {
                          setCardDetailItem(null);
                          setCardDetailSchool(null);
                          navigate('/b2b-schools');
                        }}
                      >
                        ╨Я╨╡╤А╨╡╨╣╤В╨╕ ╨║ ╤Б╨┐╨╕╤Б╨║╤Г B2B ╤И╨║╨╛╨╗
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardDetailItem(null)}>╨Ч╨░╨║╤А╤Л╤В╤М</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addCardOpen} onClose={() => setAddCardOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╨║╨░╤А╤В╨╛╤З╨║╤Г</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡ (╤И╨║╨╛╨╗╨░ / ╨║╨╛╨╜╤В╨░╨║╤В)"
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            sx={{ mt: 1 }}
            placeholder="╨Э╨░╨┐╤А╨╕╨╝╨╡╤А: ╨и╨║╨╛╨╗╨░ тДЦ1"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCardOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
          <Button variant="contained" onClick={handleAddCard}>
            ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addSchoolsOpen} onClose={() => setAddSchoolsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╤И╨║╨╛╨╗╤Л ╨┐╨╛ ╨│╨╛╤А╨╛╨┤╤Г</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>╨У╨╛╤А╨╛╨┤</InputLabel>
            <Select
              value={selectedCity}
              label="╨У╨╛╤А╨╛╨┤"
              onChange={(e) => setSelectedCity(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">
                <em>╨Т╤Л╨▒╨╡╤А╨╕╤В╨╡ ╨│╨╛╤А╨╛╨┤</em>
              </MenuItem>
              {cities.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            ╨Т ╨▓╨╛╤А╨╛╨╜╨║╤Г ╨▒╤Г╨┤╤Г╤В ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╤Л ╨▓╤Б╨╡ B2B ╤И╨║╨╛╨╗╤Л ╨╕╨╖ ╨▓╤Л╨▒╤А╨░╨╜╨╜╨╛╨│╨╛ ╨│╨╛╤А╨╛╨┤╨░ (╨▓ ╤Н╤В╨░╨┐ ┬л╨Э╨╛╨▓╤Л╨╡┬╗). ╨г╨╢╨╡ ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╜╤Л╨╡ ╤И╨║╨╛╨╗╤Л ╨┐╤А╨╛╨┐╤Г╤Б╨║╨░╤О╤В╤Б╤П.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddSchoolsOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
          <Button
            variant="contained"
            onClick={handleAddSchools}
            disabled={!selectedCity.trim() || addSchoolsLoading}
          >
            {addSchoolsLoading ? '╨Ф╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╨╡...' : '╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╤И╨║╨╛╨╗╤Л'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{isEventsFunnel ? '╨Э╨╛╨▓╨╛╨╡ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡' : '╨Э╨╛╨▓╤Л╨╣ ╤Н╨╗╨╡╨╝╨╡╨╜╤В'}</DialogTitle>
        <DialogContent>
          {isEventsFunnel ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                required
                label="╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="╨Э╨░╨┐╤А╨╕╨╝╨╡╤А: ╨Ф╨╡╨╜╤М ╨╛╤В╨║╤А╤Л╤В╤Л╤Е ╨┤╨▓╨╡╤А╨╡╨╣"
              />
              <TextField
                fullWidth
                label="╨Ф╨░╤В╤Л ╨┐╤А╨╛╨▓╨╡╨┤╨╡╨╜╨╕╤П"
                value={newEventDates}
                onChange={(e) => setNewEventDates(e.target.value)}
                placeholder="╨Э╨░╨┐╤А╨╕╨╝╨╡╤А: 15.03.2026 тАУ 20.03.2026"
              />
            </Stack>
          ) : (
            <>
              <TextField
                fullWidth
                label="╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                sx={{ mt: 1 }}
                placeholder="╨Э╨░╨┐╤А╨╕╨╝╨╡╤А: ╤И╨║╨╛╨╗╨░ тДЦ1"
              />
              <TextField
                fullWidth
                label="╨Ъ╨╛╨╝╨╝╨╡╨╜╤В╨░╤А╨╕╨╣"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                multiline
                rows={2}
                sx={{ mt: 2 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={isEventsFunnel && !newEventName.trim()}
          >
            ╨б╨╛╨╖╨┤╨░╤В╤М
          </Button>
        </DialogActions>
      </Dialog>

      {/* Popup ╨┐╤А╨╕ ╨┐╨╡╤А╨╡╤Е╨╛╨┤╨╡ ╨╜╨░ ╤Н╤В╨░╨┐ ╨▓╨╛╤А╨╛╨╜╨║╨╕ ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П */}
      <Dialog
        open={!!stagePopup}
        onClose={() => setStagePopup(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {stagePopup?.kind === 'contact' && '╨Ъ╨╛╨╜╤В╨░╨║╤В ╨╜╨░╨╣╨┤╨╡╨╜'}
          {stagePopup?.kind === 'reply' && '╨Я╨╛╨╗╤Г╤З╨╕╨╗╨╕ ╨╛╤В╨▓╨╡╤В╨╜╨╛╨╡ ╨┐╨╕╤Б╤М╨╝╨╛'}
          {stagePopup?.kind === 'meeting' && '╨Ф╨╛╨│╨╛╨▓╨╛╤А╨╕╨╗╨╕╤Б╤М ╨╜╨░ ╨▓╤Б╤В╤А╨╡╤З╤Г'}
          {stagePopup?.kind === 'trip' && '╨Ф╨╛╨│╨╛╨▓╨╛╤А╨╕╨╗╨╕╤Б╤М ╨╜╨░ ╨┐╨╛╤Е╨╛╨┤'}
          {stagePopup?.kind === 'leads' && '╨б╨╛╨▒╤А╨░╨╗╨╕ ╨╗╨╕╨┤╨╛╨▓'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {stagePopup?.kind === 'contact' && (
              <>
                <TextField
                  fullWidth
                  label="╨д╨Ш╨Ю"
                  value={stageForm.contact_fio}
                  onChange={(e) => setStageForm((f) => ({ ...f, contact_fio: e.target.value }))}
                />
                <TextField
                  fullWidth
                  label="╨Э╨╛╨╝╨╡╤А ╤В╨╡╨╗╨╡╤Д╨╛╨╜╨░"
                  value={stageForm.contact_phone}
                  onChange={(e) => setStageForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
                <TextField
                  fullWidth
                  label="╨Ъ╨╛╨╝╨╝╨╡╨╜╤В╨░╤А╨╕╨╣"
                  value={stageForm.contact_comment}
                  onChange={(e) => setStageForm((f) => ({ ...f, contact_comment: e.target.value }))}
                  multiline
                  rows={2}
                />
              </>
            )}
            {stagePopup?.kind === 'reply' && (
              <TextField
                fullWidth
                label="╨Ъ╨╛╨╝╨╝╨╡╨╜╤В╨░╤А╨╕╨╣"
                value={stageForm.reply_comment}
                onChange={(e) => setStageForm((f) => ({ ...f, reply_comment: e.target.value }))}
                multiline
                rows={3}
                placeholder="╨в╨╡╨║╤Б╤В ╨╛╤В╨▓╨╡╤В╨░ ╨╕╨╗╨╕ ╨╖╨░╨╝╨╡╤В╨║╨░"
              />
            )}
            {stagePopup?.kind === 'meeting' && (
              <TextField
                fullWidth
                label="╨Ф╨░╤В╨░ ╨▓╤Б╤В╤А╨╡╤З╨╕"
                value={stageForm.meeting_date}
                onChange={(e) => setStageForm((f) => ({ ...f, meeting_date: e.target.value }))}
                placeholder="╨Э╨░╨┐╤А╨╕╨╝╨╡╤А: 25.03.2026 ╨▓ 14:00"
              />
            )}
            {stagePopup?.kind === 'trip' && (
              <TextField
                fullWidth
                label="╨Ф╨░╤В╨░ ╨┐╨╛╤Е╨╛╨┤╨░"
                value={stageForm.trip_date}
                onChange={(e) => setStageForm((f) => ({ ...f, trip_date: e.target.value }))}
                placeholder="╨Э╨░╨┐╤А╨╕╨╝╨╡╤А: 01.04.2026"
              />
            )}
            {stagePopup?.kind === 'leads' && (
              <TextField
                fullWidth
                type="number"
                inputProps={{ min: 0 }}
                label="╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛ ╨╗╨╕╨┤╨╛╨▓"
                value={stageForm.leads_count}
                onChange={(e) => setStageForm((f) => ({ ...f, leads_count: e.target.value }))}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStagePopup(null)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
          <Button variant="contained" onClick={submitStagePopup}>
            ╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default OwnerFunnelsPage;
