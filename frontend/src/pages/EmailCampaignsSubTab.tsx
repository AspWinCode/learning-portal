import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import type { B2BSchool } from '../types';
import {
  b2bApi,
  emailBroadcastsApi,
  emailTemplatesApi,
  type EmailBroadcast,
  type EmailBroadcastRecipient,
  type EmailTemplate,
} from '../services/api';
import { extractApiError } from '../utils/extractApiError';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  sending: 'Отправляется',
  done: 'Готово',
  failed: 'Ошибка',
};
const STATUS_COLOR: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  draft: 'default',
  sending: 'warning',
  done: 'success',
  failed: 'error',
};

const RCPT_STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает', sending: 'Отправляется', sent: 'Доставлено', failed: 'Ошибка', opened: 'Прочитано',
};
const RCPT_STATUS_COLOR: Record<string, 'default' | 'warning' | 'info' | 'error' | 'success'> = {
  pending: 'default', sending: 'warning', sent: 'info', failed: 'error', opened: 'success',
};

const fmt = (dt: string | null) =>
  dt ? new Date(dt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ─── Create campaign dialog ───────────────────────────────────────────────────

type CreateDialogProps = {
  open: boolean;
  templates: EmailTemplate[];
  onClose: () => void;
  onCreated: (b: EmailBroadcast) => void;
};

const CreateCampaignDialog: React.FC<CreateDialogProps> = ({ open, templates, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setName(''); setTemplateId(''); setError(''); }
  }, [open]);

  const selectedTemplate = templates.find(t => t.id === templateId);

  const handleCreate = async () => {
    if (!name.trim() || !selectedTemplate) {
      setError('Укажите название и выберите шаблон');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const campaign = await emailBroadcastsApi.create({
        name: name.trim(),
        subject: selectedTemplate.subject,
        html_body: selectedTemplate.html_body,
        plain_body: selectedTemplate.plain_body ?? undefined,
      });
      onCreated(campaign);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать кампанию'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Новая кампания рассылки</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Название кампании"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            size="small"
            placeholder="Приглашение школ — январь 2026"
          />
          <FormControl fullWidth size="small">
            <InputLabel>Шаблон письма</InputLabel>
            <Select
              label="Шаблон письма"
              value={templateId}
              onChange={e => setTemplateId(e.target.value as number)}
            >
              {templates.length === 0 && (
                <MenuItem value="" disabled>Нет шаблонов — создайте во вкладке «Шаблоны»</MenuItem>
              )}
              {templates.map(t => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>— {t.subject}</Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedTemplate && (
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary" display="block">Тема: {selectedTemplate.subject}</Typography>
              <Box
                sx={{ mt: 1, maxHeight: 160, overflow: 'auto', bgcolor: '#fff', p: 1.5, borderRadius: 1, fontSize: 13, color: '#000' }}
                dangerouslySetInnerHTML={{ __html: selectedTemplate.html_body }}
              />
            </Paper>
          )}

          <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
            После создания кампании выберите школы-получателей и нажмите «Отправить».
            Токены <code>{'{{school_name}}'}</code> и <code>{'{{director_name}}'}</code> заменятся данными каждой школы автоматически.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
        <Button onClick={handleCreate} variant="contained" disabled={saving || !name.trim() || !templateId}>
          {saving ? <CircularProgress size={18} /> : 'Создать'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Send dialog (school picker) ──────────────────────────────────────────────

type SendDialogProps = {
  open: boolean;
  campaign: EmailBroadcast | null;
  onClose: () => void;
  onSent: (b: EmailBroadcast) => void;
};

const SendDialog: React.FC<SendDialogProps> = ({ open, campaign, onClose, onSent }) => {
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(new Set()); setSearch(''); setCityFilter(''); setError('');
    setLoading(true);
    b2bApi.listSchools()
      .then(data => setSchools(data.filter(s => s.email)))
      .catch(err => setError(extractApiError(err, 'Не удалось загрузить школы')))
      .finally(() => setLoading(false));
  }, [open]);

  const cities = Array.from(new Set(schools.map(s => s.city).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru'));

  const filtered = schools.filter(s => {
    if (cityFilter && s.city !== cityFilter) return false;
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q);
  });

  const allSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      allSelected ? filtered.forEach(s => next.delete(s.id)) : filtered.forEach(s => next.add(s.id));
      return next;
    });
  };

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSend = async () => {
    if (!campaign || selected.size === 0) return;
    setSending(true); setError('');
    try {
      const result = await emailBroadcastsApi.send(campaign.id, Array.from(selected));
      onSent(result);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка запуска рассылки'));
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Выбрать получателей: «{campaign?.name}»</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
            Список включает только школы с указанным e-mail. Токены персонализации заменятся данными каждой школы.
          </Alert>

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2">
              Выбрано: {selected.size} из {schools.length} школ с e-mail
              {cityFilter && ` · показано ${filtered.length} в «${cityFilter}»`}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              placeholder="Поиск по названию или городу..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Город</InputLabel>
              <Select
                value={cityFilter}
                label="Город"
                onChange={e => setCityFilter(e.target.value)}
              >
                <MenuItem value="">Все города</MenuItem>
                {cities.map(c => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {loading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={selected.size > 0 && !allSelected}
                        onChange={toggleAll}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>Школа</TableCell>
                    <TableCell>Город</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell>Директор</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="text.secondary">
                          {schools.length === 0 ? 'Нет школ с e-mail' : 'Ничего не найдено'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(s => (
                    <TableRow key={s.id} hover selected={selected.has(s.id)} onClick={() => toggle(s.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={selected.has(s.id)} size="small" onChange={() => toggle(s.id)} onClick={e => e.stopPropagation()} />
                      </TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.city ?? '—'}</TableCell>
                      <TableCell>{s.email}</TableCell>
                      <TableCell>{s.director ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>Отмена</Button>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={selected.size === 0 || sending}
          startIcon={sending ? <CircularProgress size={16} /> : <SendIcon />}
        >
          Отправить {selected.size > 0 ? `(${selected.size})` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Analytics dialog ─────────────────────────────────────────────────────────

type AnalyticsDialogProps = {
  open: boolean;
  campaign: EmailBroadcast | null;
  onClose: () => void;
  onRetry: (b: EmailBroadcast) => void;
};

const AnalyticsDialog: React.FC<AnalyticsDialogProps> = ({ open, campaign, onClose, onRetry }) => {
  const [recipients, setRecipients] = useState<EmailBroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (id: number) => {
    try { setRecipients(await emailBroadcastsApi.listRecipients(id)); } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!open || !campaign) return;
    setLoading(true); setError('');
    load(campaign.id).finally(() => setLoading(false));
    if (campaign.status === 'sending') {
      pollRef.current = setInterval(() => void load(campaign.id), 4000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, campaign, load]);

  const handleRetry = async () => {
    if (!campaign) return;
    setRetrying(true); setError('');
    try {
      const updated = await emailBroadcastsApi.retryFailed(campaign.id);
      onRetry(updated);
      await load(updated.id);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка повторной отправки'));
    } finally {
      setRetrying(false);
    }
  };

  if (!campaign) return null;
  const failedCount = recipients.filter(r => r.status === 'failed').length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Аналитика: «{campaign.name}»
        <Chip
          label={STATUS_LABEL[campaign.status] ?? campaign.status}
          color={STATUS_COLOR[campaign.status] ?? 'default'}
          size="small"
          sx={{ ml: 1 }}
        />
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={2} flexWrap="wrap">
            {[
              { label: 'Всего', value: campaign.total_recipients, color: 'text.primary' },
              { label: 'Доставлено', value: campaign.sent_count, color: 'info.main' },
              { label: 'Прочитано', value: campaign.opened_count, color: 'success.main' },
              { label: 'Ошибок', value: campaign.failed_count, color: 'error.main' },
            ].map(stat => (
              <Paper key={stat.label} variant="outlined" sx={{ px: 3, py: 2, minWidth: 130, textAlign: 'center' }}>
                <Typography variant="h4" color={stat.color}>{stat.value}</Typography>
                <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
              </Paper>
            ))}
            {campaign.total_recipients > 0 && (
              <Paper variant="outlined" sx={{ px: 3, py: 2, minWidth: 130, textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {Math.round((campaign.opened_count / campaign.total_recipients) * 100)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">Open rate</Typography>
              </Paper>
            )}
          </Stack>

          {failedCount > 0 && (
            <Alert
              severity="warning"
              action={
                <Button
                  size="small"
                  onClick={handleRetry}
                  disabled={retrying}
                  startIcon={retrying ? <CircularProgress size={14} /> : <ReplayIcon />}
                >
                  Повторить
                </Button>
              }
            >
              {failedCount} писем не доставлено. Можно отправить повторно.
            </Alert>
          )}

          {loading ? (
            <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Школа</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell>Директор</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Отправлено</TableCell>
                    <TableCell>Прочитано</TableCell>
                    <TableCell>Открытий</TableCell>
                    <TableCell>Ошибка</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recipients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography variant="body2" color="text.secondary">Нет данных</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {recipients.map(r => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.school_name ?? '—'}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.director_name ?? '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={RCPT_STATUS_LABEL[r.status] ?? r.status}
                          color={RCPT_STATUS_COLOR[r.status] ?? 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{fmt(r.sent_at)}</TableCell>
                      <TableCell>{r.opened_at ? fmt(r.opened_at) : '—'}</TableCell>
                      <TableCell>{r.open_count > 0 ? r.open_count : '—'}</TableCell>
                      <TableCell>
                        {r.error_message
                          ? <Tooltip title={r.error_message}><Typography variant="caption" color="error" sx={{ cursor: 'help' }}>Подробнее</Typography></Tooltip>
                          : '—'
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── EmailCampaignsSubTab ─────────────────────────────────────────────────────

const EmailCampaignsSubTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<EmailBroadcast[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<EmailBroadcast | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsTarget, setAnalyticsTarget] = useState<EmailBroadcast | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [camps, tmpl] = await Promise.all([emailBroadcastsApi.list(), emailTemplatesApi.list()]);
      setCampaigns(camps);
      setTemplates(tmpl);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить кампании'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const upsert = (b: EmailBroadcast) =>
    setCampaigns(prev => {
      const idx = prev.findIndex(x => x.id === b.id);
      return idx >= 0 ? prev.map(x => x.id === b.id ? b : x) : [b, ...prev];
    });

  const handleDelete = async (b: EmailBroadcast) => {
    if (!window.confirm(`Удалить кампанию «${b.name}»?`)) return;
    setDeleting(b.id);
    try {
      await emailBroadcastsApi.delete(b.id);
      setCampaigns(prev => prev.filter(x => x.id !== b.id));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Кампании рассылки</Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Обновить">
            <IconButton onClick={load} disabled={loading} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="small"
            onClick={() => setCreateOpen(true)}
          >
            Новая кампания
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {templates.length === 0 && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Нет шаблонов писем. Перейдите во вкладку «Шаблоны» и создайте хотя бы один шаблон перед запуском кампании.
        </Alert>
      )}

      {loading && campaigns.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
      ) : campaigns.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">Нет кампаний. Создайте первую!</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Тема</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Создана</TableCell>
                <TableCell>Получатели</TableCell>
                <TableCell>Доставлено</TableCell>
                <TableCell>Прочитано</TableCell>
                <TableCell>Ошибок</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map(b => (
                <TableRow key={b.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{b.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>{b.subject}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={STATUS_LABEL[b.status] ?? b.status} color={STATUS_COLOR[b.status] ?? 'default'} size="small" />
                  </TableCell>
                  <TableCell>{fmt(b.created_at)}</TableCell>
                  <TableCell>{b.total_recipients || '—'}</TableCell>
                  <TableCell>{b.status !== 'draft' ? b.sent_count : '—'}</TableCell>
                  <TableCell>
                    {b.status !== 'draft' && b.total_recipients > 0
                      ? `${b.opened_count} (${Math.round((b.opened_count / b.total_recipients) * 100)}%)`
                      : '—'
                    }
                  </TableCell>
                  <TableCell>
                    {b.status !== 'draft' && b.failed_count > 0
                      ? <Typography variant="body2" color="error">{b.failed_count}</Typography>
                      : '—'
                    }
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {b.status === 'draft' && (
                        <Tooltip title="Выбрать школы и отправить">
                          <IconButton size="small" color="primary" onClick={() => { setSendTarget(b); setSendOpen(true); }}>
                            <SendIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {b.status !== 'draft' && (
                        <Tooltip title="Аналитика">
                          <IconButton size="small" color="info" onClick={() => { setAnalyticsTarget(b); setAnalyticsOpen(true); }}>
                            <AnalyticsIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {b.status === 'draft' && (
                        <Tooltip title="Удалить">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(b)}
                            disabled={deleting === b.id}
                          >
                            {deleting === b.id ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateCampaignDialog
        open={createOpen}
        templates={templates}
        onClose={() => setCreateOpen(false)}
        onCreated={b => { upsert(b); setCreateOpen(false); setSendTarget(b); setSendOpen(true); }}
      />
      <SendDialog
        open={sendOpen}
        campaign={sendTarget}
        onClose={() => { setSendOpen(false); setSendTarget(null); }}
        onSent={b => {
          upsert(b);
          setSendOpen(false);
          setSendTarget(null);
          setAnalyticsTarget(b);
          setAnalyticsOpen(true);
        }}
      />
      <AnalyticsDialog
        open={analyticsOpen}
        campaign={analyticsTarget}
        onClose={() => { setAnalyticsOpen(false); setAnalyticsTarget(null); }}
        onRetry={b => { upsert(b); setAnalyticsTarget(b); }}
      />
    </Box>
  );
};

export default EmailCampaignsSubTab;
