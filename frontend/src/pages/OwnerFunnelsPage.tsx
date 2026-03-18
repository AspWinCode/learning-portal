import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { SendSMSModal } from '../components/SendSMSModal';
import { SendMaxModal } from '../components/SendMaxModal';
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

/** Этап воронки Мероприятия, при переходе на которую показывается popup */
const EVENTS_POPUP_STAGES: Record<string, 'contact' | 'reply' | 'meeting' | 'trip' | 'leads'> = {
  contact_found: 'contact',
  reply_received: 'reply',
  meeting_agreed: 'meeting',
  trip_agreed: 'trip',
  leads_collected: 'leads',
};

const OwnerFunnelsPage: React.FC = () => {
  const navigate = useNavigate();
  const prefetchedItemsRef = useRef<{ funnelId: string; items: OwnerFunnelItem[] } | null>(null);
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
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [maxModalOpen, setMaxModalOpen] = useState(false);
  const [modalPhone, setModalPhone] = useState('');
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
      if (data.length && !selectedFunnelId) {
        const firstId = data[0].id;
        // Префетч карточек параллельно с установкой selectedFunnelId — eliminates waterfall
        if (firstId !== FUNNEL_EVENTS) {
          prefetchedItemsRef.current = null;
          setLoading(true);
          ownerFunnelsApi.listItems(firstId)
            .then((fetched) => { prefetchedItemsRef.current = { funnelId: firstId, items: fetched }; })
            .catch(() => {})
            .finally(() => setLoading(false));
        }
        setSelectedFunnelId(firstId);
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить типы воронок'));
    }
  }, [selectedFunnelId]);

  const loadEvents = useCallback(async () => {
    try {
      const data = await ownerFunnelsApi.listEvents();
      setEvents(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить мероприятия'));
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (!selectedFunnelId) return;
    if (selectedFunnelId === FUNNEL_EVENTS && selectedEventId == null) {
      setItems([]);
      return;
    }
    // Если данные уже пришли через префетч — используем их без повторного запроса
    if (prefetchedItemsRef.current?.funnelId === selectedFunnelId) {
      setItems(prefetchedItemsRef.current.items);
      prefetchedItemsRef.current = null;
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
      setError(extractApiError(err, 'Не удалось загрузить элементы'));
    } finally {
      setLoading(false);
    }
  }, [selectedFunnelId, selectedEventId]);

  const loadCities = useCallback(async () => {
    try {
      const data = await b2bApi.listCities();
      setCities(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить город'));
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
    // При выборе «Мероприятие» сразу открываем popup создания воронки (название + даты)
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
      setError(extractApiError(err, 'Не удалось создать'));
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
      setError(extractApiError(err, 'Не удалось добавить карточку'));
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
        // Можно показать успех: добавили result.added из result.total_in_city
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить школы'));
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
      setError(extractApiError(err, 'Не удалось перенести'));
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
    if (!window.confirm('Удалить элемент')) return;
    setError(null);
    try {
      await ownerFunnelsApi.deleteItem(id);
      loadItems();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить'));
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
          Воронки
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>Воронка</InputLabel>
            <Select
              value={selectedFunnelId}
              label="Воронка"
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
              <InputLabel>Мероприятие</InputLabel>
              <Select
                value={selectedEventId ?? ''}
                label="Мероприятие"
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
              Добавить
            </Button>
          )}
          {isEventsFunnel && selectedEventId != null && (
            <>
              <Button variant="contained" startIcon={<Add />} onClick={() => setAddCardOpen(true)}>
                Добавить карточку
              </Button>
              <Button variant="outlined" startIcon={<Add />} onClick={() => setAddSchoolsOpen(true)}>
                Добавить школы
              </Button>
            </>
          )}
        </Stack>

        {!selectedFunnelId && funnelTypes.length === 0 && !loading && (
          <Typography color="text.secondary">Загрузка типов воронок...</Typography>
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
            Загрузка...
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
        <DialogTitle>{cardDetailItem ? (cardDetailItem.title || `Карточка #${cardDetailItem.id}`) : ''}</DialogTitle>
        <DialogContent>
          {cardDetailItem && selectedFunnel && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Этап воронки</Typography>
                <Typography variant="body1">
                  {selectedFunnel.stages.find((s) => s.value === cardDetailItem.stage)?.label ?? cardDetailItem.stage}
                </Typography>
              </Box>

              {cardDetailSchoolLoading && (
                <Typography variant="body2" color="text.secondary">Загрузка данных школы...</Typography>
              )}
              {cardDetailSchool && (
                <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Данные школы (B2B)</Typography>
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Название</Typography>
                      <Typography variant="body2">{cardDetailSchool.name}</Typography>
                    </Box>
                    {cardDetailSchool.director && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Директор</Typography>
                        <Typography variant="body2">{cardDetailSchool.director}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.city && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Город</Typography>
                        <Typography variant="body2">{cardDetailSchool.city}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.address && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Адрес</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{cardDetailSchool.address}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.student_count != null && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Количество учеников</Typography>
                        <Typography variant="body2">{cardDetailSchool.student_count}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.friendship_degree && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Степень дружбы</Typography>
                        <Typography variant="body2">{cardDetailSchool.friendship_degree}</Typography>
                      </Box>
                    )}
                    <Box>
                      <Typography variant="caption" color="text.secondary">Этап в B2B  B2B</Typography>
                      <Typography variant="body2">{cardDetailSchool.pipeline_stage}</Typography>
                    </Box>
                    {cardDetailSchool.leads_count != null && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Лидов / Конверсия</Typography>
                        <Typography variant="body2">
                          {cardDetailSchool.leads_count}
                          {cardDetailSchool.conversion_percent != null && ` (${cardDetailSchool.conversion_percent}%)`}
                        </Typography>
                      </Box>
                    )}
                    {cardDetailSchool.meeting_scheduled_at && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Встреча запланирована</Typography>
                        <Typography variant="body2">{new Date(cardDetailSchool.meeting_scheduled_at).toLocaleString('ru-RU')}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.meeting_outcomes && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Итоги встречи </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{cardDetailSchool.meeting_outcomes}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.walkthrough_scheduled_at && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Поход запланирован</Typography>
                        <Typography variant="body2">{new Date(cardDetailSchool.walkthrough_scheduled_at).toLocaleString('ru-RU')}</Typography>
                      </Box>
                    )}
                    {cardDetailSchool.contacts && cardDetailSchool.contacts.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Контакты</Typography>
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
                  <Typography variant="caption" color="text.secondary">Комментарий</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{cardDetailItem.comment}</Typography>
                </Box>
              )}
              {isEventsFunnel && cardDetailItem.card_data && (
                <>
                  {(cardDetailItem.card_data as OwnerFunnelCardData).contact_fio && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Контакт (из воронки)</Typography>
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
                      <Typography variant="caption" color="text.secondary">Ответным письмом (комментарий)</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {(cardDetailItem.card_data as OwnerFunnelCardData).reply_comment}
                      </Typography>
                    </Box>
                  )}
                  {(cardDetailItem.card_data as OwnerFunnelCardData).meeting_date && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Дата встречи</Typography>
                      <Typography variant="body2">{(cardDetailItem.card_data as OwnerFunnelCardData).meeting_date}</Typography>
                    </Box>
                  )}
                  {(cardDetailItem.card_data as OwnerFunnelCardData).trip_date && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Дата похода</Typography>
                      <Typography variant="body2">{(cardDetailItem.card_data as OwnerFunnelCardData).trip_date}</Typography>
                    </Box>
                  )}
                  {(cardDetailItem.card_data as OwnerFunnelCardData).leads_count != null && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Собрано лидов (воронка)</Typography>
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
                        Перейти к списку B2B школ
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            size="small"
            onClick={() => {
              const phone =
                (cardDetailItem?.card_data as OwnerFunnelCardData | null)?.contact_phone ||
                cardDetailSchool?.contacts?.[0]?.phone ||
                '';
              setModalPhone(phone);
              setSmsModalOpen(true);
            }}
          >
            SMS
          </Button>
          <Button
            size="small"
            onClick={() => {
              const phone =
                (cardDetailItem?.card_data as OwnerFunnelCardData | null)?.contact_phone ||
                cardDetailSchool?.contacts?.[0]?.phone ||
                '';
              setModalPhone(phone);
              setMaxModalOpen(true);
            }}
          >
            MAX
          </Button>
          <Button onClick={() => setCardDetailItem(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addCardOpen} onClose={() => setAddCardOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить карточку</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название (школа / контакт)"
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            sx={{ mt: 1 }}
            placeholder="Например: Школа №1"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCardOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleAddCard}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addSchoolsOpen} onClose={() => setAddSchoolsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить школы по городу</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Город</InputLabel>
            <Select
              value={selectedCity}
              label="Город"
              onChange={(e) => setSelectedCity(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">
                <em>Выберите город</em>
              </MenuItem>
              {cities.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            В воронку будут добавлены все B2B школы из выбранного города (в этап «Новые»). Или добавьте школы пропуском.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddSchoolsOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleAddSchools}
            disabled={!selectedCity.trim() || addSchoolsLoading}
          >
            {addSchoolsLoading ? 'Добавление...' : 'Добавить школы'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{isEventsFunnel ? 'Новое мероприятие' : 'Новый элемент'}</DialogTitle>
        <DialogContent>
          {isEventsFunnel ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                required
                label="Название Название мероприятия"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="Например: День открытых дверей"
              />
              <TextField
                fullWidth
                label="Название мероприятия"
                value={newEventDates}
                onChange={(e) => setNewEventDates(e.target.value)}
                placeholder=": 15.03.2026 тАУ 20.03.2026"
              />
            </Stack>
          ) : (
            <>
              <TextField
                fullWidth
                label="Название"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                sx={{ mt: 1 }}
                placeholder="Например: Школа №1"
              />
              <TextField
                fullWidth
                label="Название"
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
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={isEventsFunnel && !newEventName.trim()}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Popup смены этапа */}
      <Dialog
        open={!!stagePopup}
        onClose={() => setStagePopup(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {stagePopup?.kind === 'contact' && 'Контакт'}
          {stagePopup?.kind === 'reply' && 'Ответ'}
          {stagePopup?.kind === 'meeting' && 'Встреча'}
          {stagePopup?.kind === 'trip' && 'Поход'}
          {stagePopup?.kind === 'leads' && 'Лиды'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {stagePopup?.kind === 'contact' && (
              <>
                <TextField
                  fullWidth
                  label=""
                  value={stageForm.contact_fio}
                  onChange={(e) => setStageForm((f) => ({ ...f, contact_fio: e.target.value }))}
                />
                <TextField
                  fullWidth
                  label="Телефон"
                  value={stageForm.contact_phone}
                  onChange={(e) => setStageForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
                <TextField
                  fullWidth
                  label="Название"
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
                label="Название"
                value={stageForm.reply_comment}
                onChange={(e) => setStageForm((f) => ({ ...f, reply_comment: e.target.value }))}
                multiline
                rows={3}
                placeholder="Комментарий"
              />
            )}
            {stagePopup?.kind === 'meeting' && (
              <TextField
                fullWidth
                label="Дата встречи"
                value={stageForm.meeting_date}
                onChange={(e) => setStageForm((f) => ({ ...f, meeting_date: e.target.value }))}
                placeholder=": 25.03.2026  14:00"
              />
            )}
            {stagePopup?.kind === 'trip' && (
              <TextField
                fullWidth
                label="Дата похода"
                value={stageForm.trip_date}
                onChange={(e) => setStageForm((f) => ({ ...f, trip_date: e.target.value }))}
                placeholder=": 01.04.2026"
              />
            )}
            {stagePopup?.kind === 'leads' && (
              <TextField
                fullWidth
                type="number"
                inputProps={{ min: 0 }}
                label="Количество лидов"
                value={stageForm.leads_count}
                onChange={(e) => setStageForm((f) => ({ ...f, leads_count: e.target.value }))}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStagePopup(null)}>Отмена</Button>
          <Button variant="contained" onClick={submitStagePopup}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <SendSMSModal
        open={smsModalOpen}
        onClose={() => setSmsModalOpen(false)}
        phone={modalPhone}
      />
      <SendMaxModal
        open={maxModalOpen}
        onClose={() => setMaxModalOpen(false)}
        initialPhone={modalPhone}
      />
    </Layout>
  );
};

export default OwnerFunnelsPage;
