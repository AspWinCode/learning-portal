import React, { useCallback, useEffect, useState } from 'react';
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
  TextField,
  Typography,
  Checkbox,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Edit from '@mui/icons-material/Edit';
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

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await campaignsApi.list();
      // В списке кампаний показываем только «активные» проекты:
      // черновики и кампании «в работе». Завершённые/отменённые считаются архивом.
      const visible = data.filter((c) => c.status === 'draft' || c.status === 'active');
      setCampaigns(visible);
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
      return;
    }
    Promise.all([campaignsApi.get(selectedCampaignId), campaignsApi.listSchoolCampaigns(selectedCampaignId)])
      .then(([c, list]) => {
        setCampaignDetail(c);
        setSchoolCampaigns(list);
      })
      .catch((err: any) => setError(extractApiError(err, 'Не удалось загрузить кампанию')));
  }, [selectedCampaignId]);

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

  return (
    <>
      {selectedCampaignId ? (
        <Box>
          <Button startIcon={<ArrowBack />} onClick={() => setSelectedCampaignId(null)} sx={{ mb: 2 }}>
            К списку кампаний
          </Button>
          {campaignDetail && (
            <>
              <Typography variant="h5" gutterBottom>
                {campaignDetail.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {CAMPAIGN_TYPES.find((t) => t.value === campaignDetail.type)?.label} · {campaignDetail.format === 'offline' ? 'Офлайн' : 'Онлайн'}
                {campaignDetail.city && ` · ${campaignDetail.city}`}
                {campaignDetail.responsible_full_name && ` · Ответственный: ${campaignDetail.responsible_full_name}`}
              </Typography>
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
                        {col.items.map((sc) => (
                          <Card key={sc.id} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                            <CardContent sx={{ py: 1, px: 1.5 }}>
                              <Typography variant="body2">{sc.school_name || `Школа #${sc.b2b_school_id}`}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {sc.school_city || '—'}
                              </Typography>
                              <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
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
                            </CardContent>
                          </Card>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </>
          )}
        </Box>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">Кампании</Typography>
            <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
              Создать кампанию
            </Button>
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
                  {campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        Нет кампаний. Создайте первую.
                      </TableCell>
                    </TableRow>
                  ) : (
                    campaigns.map((c) => (
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
    </>
  );
};
