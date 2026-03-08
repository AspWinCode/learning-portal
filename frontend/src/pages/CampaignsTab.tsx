import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  FormControlLabel,
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
  Typography,
  Checkbox,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Edit from '@mui/icons-material/Edit';
import History from '@mui/icons-material/History';
import { campaignsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { Campaign, SchoolCampaign } from '../types';
import {
  getStagesForCampaignType,
  CAMPAIGN_TYPES,
  CAMPAIGN_FORMATS,
  CAMPAIGN_MODES,
  CAMPAIGN_STATUSES,
} from '../constants/campaignStages';
import { getInviteLabel, getParticipationLabel, getHostLabel } from '../constants/campaignEventStages';
import { CampaignEventsSubTab } from './CampaignEventsSubTab';
import { CampaignMatrixSubTab } from './CampaignMatrixSubTab';

export const CampaignsTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  });
  const [managers, setManagers] = useState<{ id: number; full_name: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<Campaign | null>(null);
  const [schoolCampaigns, setSchoolCampaigns] = useState<SchoolCampaign[]>([]);
  const [addSchoolsOpen, setAddSchoolsOpen] = useState(false);
  const [availableSchools, setAvailableSchools] = useState<{ id: number; name: string; city: string | null }[]>([]);
  const [addSchoolCity, setAddSchoolCity] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<number[]>([]);
  const [createContactTask, setCreateContactTask] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [campaignDetailSubTab, setCampaignDetailSubTab] = useState<'work' | 'events' | 'matrix'>('work');
  const [eventCounts, setEventCounts] = useState<Record<string, { events_invited_count: number; events_participated_count: number; events_hosted_count: number }>>({});
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historySchoolCampaignId, setHistorySchoolCampaignId] = useState<number | null>(null);
  const [historyData, setHistoryData] = useState<Array<{ event_title: string | null; event_date: string | null; invite_status: string; participation_status: string; participant_count: number | null; host_status: string; notes: string | null }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await campaignsApi.list();
      // Храним все кампании, фильтруем по активным/архивным в UI
      setCampaigns(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить кампании'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (createOpen) {
      import('../services/api').then(({ b2bApi }) => b2bApi.listManagers().then(setManagers).catch(() => {}));
    }
  }, [createOpen]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignDetail(null);
      setSchoolCampaigns([]);
      setEventCounts({});
      setCampaignDetailSubTab('work');
      return;
    }
    Promise.all([campaignsApi.get(selectedCampaignId), campaignsApi.listSchoolCampaigns(selectedCampaignId)])
      .then(([c, list]) => {
        setCampaignDetail(c);
        setSchoolCampaigns(list);
      })
      .catch((err: any) => setError(extractApiError(err, 'Не удалось загрузить кампанию')));
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId || campaignDetailSubTab !== 'work') return;
    campaignsApi.getCampaignSchoolEventCounts(selectedCampaignId).then(setEventCounts).catch(() => setEventCounts({}));
  }, [selectedCampaignId, campaignDetailSubTab]);

  const openHistoryDialog = (schoolCampaignId: number) => {
    setHistorySchoolCampaignId(schoolCampaignId);
    setHistoryDialogOpen(true);
    setHistoryData([]);
    setHistoryLoading(true);
    if (!selectedCampaignId) return;
    campaignsApi
      .getSchoolCampaignEventsHistory(selectedCampaignId, schoolCampaignId)
      .then((data) => setHistoryData(data))
      .catch(() => setHistoryData([]))
      .finally(() => setHistoryLoading(false));
  };

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
      });
      setCreateOpen(false);
      setCreateForm({ name: '', type: 'game_jam', format: 'offline', city: '', region: '', date_from: '', date_to: '', responsible_id: '', status: 'draft', mode: 'city' });
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
    campaignsApi.listSchoolsAvailable(selectedCampaignId, { city: addSchoolCity || undefined }).then(setAvailableSchools).catch(() => setAvailableSchools([]));
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

  const toggleSchoolSelection = (id: number) => {
    setSelectedSchoolIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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

  const stages = campaignDetail ? getStagesForCampaignType(campaignDetail.type) : [];
  const byStage = stages.map((s) => ({ ...s, items: schoolCampaigns.filter((sc) => sc.stage === s.value) }));

  const handleArchiveCampaign = async (c: Campaign) => {
    if (!window.confirm(`Отправить кампанию «${c.name}» в архив (статус «Отменена»)?`)) return;
    setError(null);
    try {
      await campaignsApi.update(c.id, { status: 'canceled' });
      await loadCampaigns();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отправить кампанию в архив'));
    }
  };

  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'draft' || c.status === 'active'),
    [campaigns]
  );
  const archivedCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'done' || c.status === 'canceled'),
    [campaigns]
  );
  const visibleCampaigns = showArchived ? archivedCampaigns : activeCampaigns;

  return (
    <>
      {selectedCampaignId ? (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Новая версия: ниже три вкладки — «Общая работа», «Джемы», «Матрица школ». Переключайте для работы с джемами и матрицей.
          </Alert>
          <Button startIcon={<ArrowBack />} onClick={() => setSelectedCampaignId(null)} sx={{ mb: 2 }}>
            К списку кампаний
          </Button>
          <Typography variant="overline" display="block" color="primary" sx={{ mb: 0.5 }}>
            Версия: джемы и матрица школ
          </Typography>
          <Box sx={{ border: '2px solid', borderColor: 'primary.main', borderRadius: 1, p: 1.5, mb: 2, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5, fontWeight: 600 }}>
              Общая работа · Джемы · Матрица школ
            </Typography>
            <Tabs value={campaignDetailSubTab} onChange={(_, v: 'work' | 'events' | 'matrix') => setCampaignDetailSubTab(v)} variant="fullWidth">
              <Tab label="Общая работа" value="work" />
              <Tab label="Джемы" value="events" />
              <Tab label="Матрица школ" value="matrix" />
            </Tabs>
          </Box>
          {campaignDetail ? (
            <>
              <Typography variant="h5" gutterBottom>
                {campaignDetail.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {CAMPAIGN_TYPES.find((t) => t.value === campaignDetail.type)?.label} · {campaignDetail.format === 'offline' ? 'Офлайн' : 'Онлайн'}
                {campaignDetail.city && ` · ${campaignDetail.city}`}
                {campaignDetail.responsible_full_name && ` · Ответственный: ${campaignDetail.responsible_full_name}`}
              </Typography>
              {campaignDetailSubTab === 'work' && (
                <>
                  <Button variant="contained" startIcon={<Add />} onClick={openAddSchools} sx={{ mb: 2 }}>
                    Добавить школы
                  </Button>
                  <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', flexWrap: 'nowrap' }}>
                    {byStage.map((col) => (
                      <Card key={col.value} variant="outlined" sx={{ minWidth: 260, flex: '0 0 auto' }}>
                        <CardContent>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            {col.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            {col.items.length} шт.
                          </Typography>
                          <Stack spacing={1}>
                            {col.items.map((sc) => {
                              const counts = eventCounts[String(sc.id)];
                              return (
                                <Card key={sc.id} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                                  <CardContent sx={{ py: 1, px: 1.5 }}>
                                    <Typography variant="body2">{sc.school_name || `Школа #${sc.b2b_school_id}`}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {sc.school_city || '—'}
                                    </Typography>
                                    {(counts?.events_invited_count !== undefined || counts?.events_participated_count !== undefined || counts?.events_hosted_count !== undefined) && (
                                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25 }}>
                                        приглаш.: {counts?.events_invited_count ?? 0} · участий: {counts?.events_participated_count ?? 0} · площадок: {counts?.events_hosted_count ?? 0}
                                      </Typography>
                                    )}
                                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                                      <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
                                        <Select
                                          value={sc.stage}
                                          onChange={(e) => handleStageChange(sc.id, e.target.value)}
                                          displayEmpty
                                        >
                                          {stages.map((s) => (
                                            <MenuItem key={s.value} value={s.value}>
                                              {s.label}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                      <Button size="small" startIcon={<History />} onClick={() => openHistoryDialog(sc.id)} title="История джемов">
                                        История
                                      </Button>
                                    </Stack>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </>
              )}
              {campaignDetailSubTab === 'events' && selectedCampaignId && (
                <CampaignEventsSubTab campaignId={selectedCampaignId} onError={setError} />
              )}
              {campaignDetailSubTab === 'matrix' && selectedCampaignId && (
                <CampaignMatrixSubTab campaignId={selectedCampaignId} onError={setError} />
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
                control={
                  <Checkbox
                    size="small"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                }
                label="Показывать архив"
              />
              <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                Создать кампанию
              </Button>
            </Stack>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
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
                        <TableCell>{CAMPAIGN_TYPES.find((t) => t.value === c.type)?.label ?? c.type}</TableCell>
                        <TableCell>{c.format === 'offline' ? 'Офлайн' : 'Онлайн'}</TableCell>
                        <TableCell>{c.city || '—'}</TableCell>
                        <TableCell>{c.responsible_full_name || '—'}</TableCell>
                        <TableCell>{CAMPAIGN_STATUSES.find((s) => s.value === c.status)?.label ?? c.status}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" startIcon={<Edit />} onClick={() => setSelectedCampaignId(c.id)}>
                              Открыть
                            </Button>
                            <Button
                              size="small"
                              color="warning"
                              onClick={() => void handleArchiveCampaign(c)}
                            >
                              В архив
                            </Button>
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

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новая кампания</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Тип</InputLabel>
              <Select
                label="Тип"
                value={createForm.type}
                onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
              >
                {CAMPAIGN_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Формат</InputLabel>
              <Select
                label="Формат"
                value={createForm.format}
                onChange={(e) => setCreateForm((f) => ({ ...f, format: e.target.value }))}
              >
                {CAMPAIGN_FORMATS.map((f) => (
                  <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Город"
              value={createForm.city}
              onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Регион"
              value={createForm.region}
              onChange={(e) => setCreateForm((f) => ({ ...f, region: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Дата начала"
              type="date"
              value={createForm.date_from}
              onChange={(e) => setCreateForm((f) => ({ ...f, date_from: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Дата окончания"
              type="date"
              value={createForm.date_to}
              onChange={(e) => setCreateForm((f) => ({ ...f, date_to: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Ответственный</InputLabel>
              <Select
                label="Ответственный"
                value={createForm.responsible_id === '' ? '' : createForm.responsible_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, responsible_id: e.target.value === '' ? '' : (e.target.value as number) }))}
              >
                <MenuItem value="">Не назначен</MenuItem>
                {managers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Режим</InputLabel>
              <Select
                label="Режим"
                value={createForm.mode}
                onChange={(e) => setCreateForm((f) => ({ ...f, mode: e.target.value }))}
              >
                {CAMPAIGN_MODES.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!createForm.name.trim()}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addSchoolsOpen} onClose={() => setAddSchoolsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить школы в кампанию</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Фильтр по городу"
              value={addSchoolCity}
              onChange={(e) => setAddSchoolCity(e.target.value)}
              onBlur={loadAvailableByCity}
              fullWidth
              size="small"
            />
            <Button size="small" variant="outlined" onClick={loadAvailableByCity}>
              Показать школы
            </Button>
            <Typography variant="body2" color="text.secondary">
              Выберите школы (уже добавленные не показываются). При добавлении можно создать задачу «Связаться со школой».
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Школы</InputLabel>
              <Select
                multiple
                label="Школы"
                value={selectedSchoolIds}
                onChange={(e) => setSelectedSchoolIds(e.target.value as number[])}
                renderValue={(ids) => `${ids.length} выбрано`}
              >
                {availableSchools.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name} {s.city ? `(${s.city})` : ''}
                  </MenuItem>
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
          <Button variant="contained" onClick={handleAddSchools} disabled={selectedSchoolIds.length === 0}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>История джемов школы</DialogTitle>
        <DialogContent>
          {historyLoading ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Загрузка…</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Джем</TableCell>
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
                      <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>Нет данных по джемам</TableCell>
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
    </>
  );
};
