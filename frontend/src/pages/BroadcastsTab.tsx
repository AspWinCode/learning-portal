import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Checkbox,
  IconButton,
  InputAdornment,
  Paper,
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import type { B2BSchool } from '../types';
import { b2bApi, emailBroadcastsApi, type EmailBroadcast, type EmailBroadcastRecipient } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

// ─── Status helpers ───────────────────────────────────────────────────────────

const BROADCAST_STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  sending: 'Отправляется',
  done: 'Готово',
  failed: 'Ошибка',
};
const BROADCAST_STATUS_COLOR: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  draft: 'default',
  sending: 'warning',
  done: 'success',
  failed: 'error',
};

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  sending: 'Отправляется',
  sent: 'Доставлено',
  failed: 'Ошибка',
  opened: 'Прочитано',
};
const RECIPIENT_STATUS_COLOR: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  pending: 'default',
  sending: 'warning',
  sent: 'info',
  failed: 'error',
  opened: 'success',
};

const fmt = (dt: string | null) =>
  dt ? new Date(dt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ─── BroadcastFormDialog ──────────────────────────────────────────────────────

type BroadcastFormDialogProps = {
  open: boolean;
  existing: EmailBroadcast | null;
  onClose: () => void;
  onSaved: (b: EmailBroadcast) => void;
};

const PLACEHOLDER_HELP = 'Доступные токены: {{school_name}}, {{director_name}}';

const BroadcastFormDialog: React.FC<BroadcastFormDialogProps> = ({ open, existing, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '');
      setSubject(existing?.subject ?? '');
      setHtmlBody(existing?.html_body ?? '');
      setError('');
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !htmlBody.trim()) {
      setError('Заполните все поля');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let saved: EmailBroadcast;
      if (existing) {
        saved = await emailBroadcastsApi.update(existing.id, { name, subject, html_body: htmlBody });
      } else {
        saved = await emailBroadcastsApi.create({ name, subject, html_body: htmlBody });
      }
      onSaved(saved);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{existing ? 'Редактировать рассылку' : 'Новая рассылка'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Название рассылки" value={name} onChange={e => setName(e.target.value)} fullWidth size="small" />
          <TextField
            label="Тема письма"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            fullWidth
            size="small"
            helperText={PLACEHOLDER_HELP}
          />
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              HTML-тело письма &nbsp;·&nbsp; {PLACEHOLDER_HELP}
            </Typography>
            <TextField
              value={htmlBody}
              onChange={e => setHtmlBody(e.target.value)}
              fullWidth
              multiline
              minRows={12}
              maxRows={28}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
              placeholder={'<p>Уважаемый директор {{director_name}},</p>\n<p>Школа {{school_name}}, ...</p>'}
            />
          </Box>
          {htmlBody && (
            <Box>
              <Typography variant="caption" color="text.secondary">Предпросмотр</Typography>
              <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
                <div dangerouslySetInnerHTML={{ __html: htmlBody }} />
              </Paper>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── SendDialog: school picker + test send ───────────────────────────────────

type SendDialogProps = {
  open: boolean;
  broadcast: EmailBroadcast | null;
  onClose: () => void;
  onSent: (b: EmailBroadcast) => void;
};

const SendDialog: React.FC<SendDialogProps> = ({ open, broadcast, onClose, onSent }) => {
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch('');
    setError('');
    setTestOk(false);
    setLoading(true);
    b2bApi.listSchools()
      .then(data => {
        setSchools(data.filter(s => s.email));
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = schools.filter(s => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q);
  });

  const allSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(s => next.add(s.id));
        return next;
      });
    }
  };

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleTestSend = async () => {
    if (!broadcast || !testEmail.trim()) return;
    setTestSending(true);
    setError('');
    try {
      await emailBroadcastsApi.testSend(broadcast.id, testEmail.trim());
      setTestOk(true);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка тестовой отправки'));
    } finally {
      setTestSending(false);
    }
  };

  const handleSend = async () => {
    if (!broadcast || selected.size === 0) return;
    setSending(true);
    setError('');
    try {
      const result = await emailBroadcastsApi.send(broadcast.id, Array.from(selected));
      onSent(result);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка запуска рассылки'));
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Отправить рассылку: «{broadcast?.name}»</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Test send */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Тестовая отправка</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                label="E-mail для теста"
                value={testEmail}
                onChange={e => { setTestEmail(e.target.value); setTestOk(false); }}
                sx={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                onClick={handleTestSend}
                disabled={!testEmail.trim() || testSending}
                startIcon={testSending ? <CircularProgress size={14} /> : <SendIcon />}
              >
                Отправить тест
              </Button>
            </Stack>
            {testOk && <Alert severity="success" sx={{ mt: 1 }}>Тестовое письмо отправлено!</Alert>}
          </Paper>

          {/* School picker */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle2">
                Выбрать получателей ({selected.size} выбрано из {schools.length} школ с e-mail)
              </Typography>
            </Stack>
            <TextField
              size="small"
              fullWidth
              placeholder="Поиск по названию или городу..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ mb: 1 }}
            />
            {loading ? (
              <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress /></Box>
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
                    {filtered.map(school => (
                      <TableRow
                        key={school.id}
                        hover
                        selected={selected.has(school.id)}
                        onClick={() => toggle(school.id)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox checked={selected.has(school.id)} size="small" onChange={() => toggle(school.id)} onClick={e => e.stopPropagation()} />
                        </TableCell>
                        <TableCell>{school.name}</TableCell>
                        <TableCell>{school.city ?? '—'}</TableCell>
                        <TableCell>{school.email}</TableCell>
                        <TableCell>{school.director ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>Отмена</Button>
        <Button
          variant="contained"
          color="primary"
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

// ─── AnalyticsDialog ──────────────────────────────────────────────────────────

type AnalyticsDialogProps = {
  open: boolean;
  broadcast: EmailBroadcast | null;
  onClose: () => void;
  onRetry: (b: EmailBroadcast) => void;
};

const AnalyticsDialog: React.FC<AnalyticsDialogProps> = ({ open, broadcast, onClose, onRetry }) => {
  const [recipients, setRecipients] = useState<EmailBroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (id: number) => {
    try {
      const data = await emailBroadcastsApi.listRecipients(id);
      setRecipients(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!open || !broadcast) return;
    setLoading(true);
    setError('');
    load(broadcast.id).finally(() => setLoading(false));

    if (broadcast.status === 'sending') {
      pollingRef.current = setInterval(() => load(broadcast.id), 4000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [open, broadcast, load]);

  const handleRetry = async () => {
    if (!broadcast) return;
    setRetrying(true);
    setError('');
    try {
      const updated = await emailBroadcastsApi.retryFailed(broadcast.id);
      onRetry(updated);
      await load(updated.id);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка повторной отправки'));
    } finally {
      setRetrying(false);
    }
  };

  if (!broadcast) return null;

  const failedCount = recipients.filter(r => r.status === 'failed').length;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        Аналитика: «{broadcast.name}»
        <Chip
          label={BROADCAST_STATUS_LABEL[broadcast.status] ?? broadcast.status}
          color={BROADCAST_STATUS_COLOR[broadcast.status] ?? 'default'}
          size="small"
          sx={{ ml: 1 }}
        />
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Summary cards */}
          <Stack direction="row" spacing={2} flexWrap="wrap">
            {[
              { label: 'Всего получателей', value: broadcast.total_recipients, color: 'text.primary' },
              { label: 'Доставлено', value: broadcast.sent_count, color: 'info.main' },
              { label: 'Прочитано', value: broadcast.opened_count, color: 'success.main' },
              { label: 'Ошибок', value: broadcast.failed_count, color: 'error.main' },
            ].map(stat => (
              <Paper key={stat.label} variant="outlined" sx={{ px: 3, py: 2, minWidth: 140, textAlign: 'center' }}>
                <Typography variant="h4" color={stat.color}>{stat.value}</Typography>
                <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
              </Paper>
            ))}
            {broadcast.total_recipients > 0 && (
              <Paper variant="outlined" sx={{ px: 3, py: 2, minWidth: 140, textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {Math.round((broadcast.opened_count / broadcast.total_recipients) * 100)}%
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

          {/* Recipients table */}
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
                    <TableCell>Кол-во открытий</TableCell>
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
                          label={RECIPIENT_STATUS_LABEL[r.status] ?? r.status}
                          color={RECIPIENT_STATUS_COLOR[r.status] ?? 'default'}
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

// ─── BroadcastsTab ────────────────────────────────────────────────────────────

const BroadcastsTab: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<EmailBroadcast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmailBroadcast | null>(null);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<EmailBroadcast | null>(null);

  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsTarget, setAnalyticsTarget] = useState<EmailBroadcast | null>(null);

  const [deleting, setDeleting] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBroadcasts(await emailBroadcastsApi.list());
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить рассылки'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const upsert = (b: EmailBroadcast) =>
    setBroadcasts(prev => {
      const idx = prev.findIndex(x => x.id === b.id);
      return idx >= 0 ? prev.map(x => x.id === b.id ? b : x) : [b, ...prev];
    });

  const handleFormSaved = (b: EmailBroadcast) => {
    upsert(b);
    setFormOpen(false);
    setEditTarget(null);
  };

  const handleSent = (b: EmailBroadcast) => {
    upsert(b);
    setSendOpen(false);
    setSendTarget(null);
    setAnalyticsTarget(b);
    setAnalyticsOpen(true);
  };

  const handleDelete = async (b: EmailBroadcast) => {
    if (!window.confirm(`Удалить рассылку «${b.name}»?`)) return;
    setDeleting(b.id);
    try {
      await emailBroadcastsApi.delete(b.id);
      setBroadcasts(prev => prev.filter(x => x.id !== b.id));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Рассылки</Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Обновить">
            <IconButton onClick={loadAll} disabled={loading} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setEditTarget(null); setFormOpen(true); }}
            size="small"
          >
            Новая рассылка
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && broadcasts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
      ) : broadcasts.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">Нет рассылок. Создайте первую!</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Тема</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Дата создания</TableCell>
                <TableCell>Получатели</TableCell>
                <TableCell>Доставлено</TableCell>
                <TableCell>Прочитано</TableCell>
                <TableCell>Ошибок</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {broadcasts.map(b => (
                <TableRow key={b.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{b.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                      {b.subject}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={BROADCAST_STATUS_LABEL[b.status] ?? b.status}
                      color={BROADCAST_STATUS_COLOR[b.status] ?? 'default'}
                      size="small"
                    />
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
                        <>
                          <Tooltip title="Редактировать">
                            <IconButton size="small" onClick={() => { setEditTarget(b); setFormOpen(true); }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Отправить">
                            <IconButton size="small" color="primary" onClick={() => { setSendTarget(b); setSendOpen(true); }}>
                              <SendIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
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

      <BroadcastFormDialog
        open={formOpen}
        existing={editTarget}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        onSaved={handleFormSaved}
      />
      <SendDialog
        open={sendOpen}
        broadcast={sendTarget}
        onClose={() => { setSendOpen(false); setSendTarget(null); }}
        onSent={handleSent}
      />
      <AnalyticsDialog
        open={analyticsOpen}
        broadcast={analyticsTarget}
        onClose={() => { setAnalyticsOpen(false); setAnalyticsTarget(null); }}
        onRetry={b => { upsert(b); setAnalyticsTarget(b); }}
      />
    </Box>
  );
};

export default BroadcastsTab;
