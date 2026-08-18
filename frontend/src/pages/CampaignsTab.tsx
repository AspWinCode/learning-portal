import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
import Phone from '@mui/icons-material/Phone';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewKanban from '@mui/icons-material/ViewKanban';
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
import Email from '@mui/icons-material/Email';
import LinkOff from '@mui/icons-material/LinkOff';
import Sync from '@mui/icons-material/Sync';
import { useAuth } from '../contexts/AuthContext';
import { b2bApi, campaignsApi, emailBroadcastsApi, emailTemplatesApi, settingsApi } from '../services/api';
import type { EmailBroadcast as EmailBroadcastItem, EmailTemplate } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { hasPermission } from '../utils/permissions';
import type { B2BSchool, Campaign, CampaignSettings, CampaignStage, SchoolCampaign, SchoolCampaignLog } from '../types';
import SchoolCardDialog from '../components/SchoolCardDialog';
import {
  CAMPAIGN_TYPES,
  CAMPAIGN_FORMATS,
  CAMPAIGN_MODES,
  CAMPAIGN_STATUSES,
} from '../constants/campaignStages';
import { getInviteLabel, getParticipationLabel, getHostLabel } from '../constants/campaignEventStages';
import { GameJamKanban } from './GameJamKanban';

type AvailableCampaignSchool = { id: number; name: string; city: string | null; district?: string | null };

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
    <Box
      ref={setNodeRef}
      sx={{
        width: 260, flex: '0 0 260px',
        scrollSnapAlign: 'start',
        display: 'flex', flexDirection: 'column',
        borderRadius: 2,
        border: '1px solid',
        borderColor: isOver ? 'primary.light' : 'divider',
        bgcolor: isOver ? 'primary.50' : 'grey.50',
        transition: 'border-color 0.15s, background-color 0.15s',
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 270px)',
      }}
    >
      <Box sx={{
        px: 1.5, py: 1.25, flexShrink: 0,
        bgcolor: isTerminal ? '#f0fdf4' : 'background.paper',
        borderBottom: '1px solid', borderBottomColor: isTerminal ? '#bbf7d0' : 'divider',
      }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={0.75}>
          <Typography
            variant="subtitle2"
            fontWeight={600}
            sx={{ flex: 1, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {label}
          </Typography>
          <Box sx={{
            minWidth: 24, height: 20, px: 0.75, borderRadius: 10, flexShrink: 0,
            bgcolor: isTerminal ? '#bbf7d0' : 'grey.200',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: isTerminal ? '#15803d' : 'text.secondary' }}>
              {count}
            </Typography>
          </Box>
        </Stack>
        {isTerminal && (
          <Typography variant="caption" sx={{ color: 'success.main', fontSize: 10, display: 'block', mt: 0.25 }}>
            финальный этап
          </Typography>
        )}
      </Box>
      <Box sx={{ p: 0.75, overflowY: 'auto', flex: 1 }}>
        <Stack spacing={0.75}>{children}</Stack>
      </Box>
    </Box>
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
  b2bSchoolId?: number | null;
  hasFollowUp?: boolean;
  followUpOverdue?: boolean;
  onStageChange: (scId: number, stage: string) => void;
  onHistory: (scId: number) => void;
  onOpenSchool?: (b2bSchoolId: number) => void;
  onSendEmail?: (b2bSchoolId: number, schoolName: string, scId?: number) => void;
  onOpenCRM?: (scId: number, schoolName: string) => void;
}

const KanbanSchoolCard: React.FC<KanbanSchoolCardProps> = ({
  scId, schoolName, schoolCity, countLabel, stages, currentStage, canManage, b2bSchoolId,
  hasFollowUp, followUpOverdue, onStageChange, onHistory, onOpenSchool, onSendEmail, onOpenCRM,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(scId) });
  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      style={transform ? { transform: `translate(${transform.x}px,${transform.y}px)`, opacity: isDragging ? 0.4 : 1 } : undefined}
      sx={{
        bgcolor: 'background.paper',
        touchAction: 'none',
        borderRadius: 1.5,
        borderColor: 'grey.200',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderColor: 'grey.300' },
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      <CardContent sx={{ py: 1, px: 1.25, '&:last-child': { pb: 1 } }}>
        <Stack direction="row" alignItems="flex-start" gap={0.5}>
          <Box {...attributes} {...listeners} sx={{ cursor: isDragging ? 'grabbing' : 'grab', pt: 0.25, flexShrink: 0 }}>
            <DragIndicator sx={{ color: 'text.disabled', fontSize: 16 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={600}
              title={schoolName}
              onClick={b2bSchoolId && onOpenSchool ? (e) => { e.stopPropagation(); onOpenSchool(b2bSchoolId); } : undefined}
              sx={{
                lineHeight: 1.3, mb: 0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13,
                ...(b2bSchoolId && onOpenSchool ? { cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } } : {}),
              }}
            >
              {schoolName}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: countLabel ? 0.2 : 0.75, fontSize: 11 }}>
              {schoolCity || '—'}
            </Typography>
            {countLabel && (
              <Typography variant="caption" sx={{ display: 'block', mb: 0.75, fontSize: 10, color: 'text.disabled' }}>
                {countLabel}
              </Typography>
            )}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
                <Select
                  value={currentStage}
                  onChange={(e) => onStageChange(scId, e.target.value)}
                  disabled={!canManage}
                  displayEmpty
                  sx={{ fontSize: 12, '& .MuiSelect-select': { py: '3px', px: '8px' } }}
                >
                  {stages.map((s) => <MenuItem key={s.key} value={s.key} sx={{ fontSize: 12 }}>{s.label}</MenuItem>)}
                </Select>
              </FormControl>
              {onOpenCRM && (
                <Tooltip title={followUpOverdue ? 'CRM (просрочен перезвон!)' : hasFollowUp ? 'CRM (есть запланированный перезвон)' : 'CRM — звонки и заметки'}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onOpenCRM(scId, schoolName); }} sx={{ flexShrink: 0 }}>
                    <Badge
                      variant="dot"
                      color={followUpOverdue ? 'error' : 'warning'}
                      invisible={!hasFollowUp && !followUpOverdue}
                    >
                      <Phone sx={{ fontSize: 15 }} />
                    </Badge>
                  </IconButton>
                </Tooltip>
              )}
              {b2bSchoolId && onSendEmail && (
                <Tooltip title="Отправить шаблон на почту">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onSendEmail(b2bSchoolId, schoolName, scId); }} sx={{ flexShrink: 0 }}>
                    <Email sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="История активностей">
                <IconButton size="small" onClick={() => onHistory(scId)} sx={{ flexShrink: 0 }}>
                  <History sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// CRM-диалог звонков и заметок
// ---------------------------------------------------------------------------

const LOG_TYPE_LABELS: Record<string, string> = { call: 'Звонок', note: 'Заметка', meeting: 'Встреча', email: 'Письмо' };
const LOG_RESULT_OPTIONS = [
  { value: 'answered', label: 'Дозвонились' },
  { value: 'no_answer', label: 'Не берут трубку' },
  { value: 'callback', label: 'Просят перезвонить' },
  { value: 'busy', label: 'Занято' },
  { value: 'refused', label: 'Отказались' },
  { value: 'scheduled', label: 'Договорились о встрече' },
  { value: 'wrong_number', label: 'Неверный номер' },
];

interface CRMDialogProps {
  open: boolean;
  scId: number | null;
  schoolName: string;
  onClose: () => void;
  onLogsChanged?: (scId: number, logs: SchoolCampaignLog[]) => void;
}

const CRMDialog: React.FC<CRMDialogProps> = ({ open, scId, schoolName, onClose, onLogsChanged }) => {
  const [logs, setLogs] = useState<SchoolCampaignLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ type: 'call', result: '', text: '', follow_up_at: '' });

  const loadLogs = useCallback(async () => {
    if (!scId) return;
    setLoading(true);
    try {
      const data = await campaignsApi.listSchoolCampaignLogs(scId);
      setLogs(data);
      if (onLogsChanged) onLogsChanged(scId, data);
    } catch (e: any) {
      setError(extractApiError(e, 'Не удалось загрузить историю'));
    } finally {
      setLoading(false);
    }
  }, [scId]);

  useEffect(() => {
    if (open && scId) {
      setForm({ type: 'call', result: '', text: '', follow_up_at: '' });
      setError('');
      void loadLogs();
    }
  }, [open, scId, loadLogs]);

  const handleSave = async () => {
    if (!scId || (!form.text.trim() && !form.result)) return;
    setSaving(true);
    setError('');
    try {
      const created = await campaignsApi.createSchoolCampaignLog(scId, {
        type: form.type,
        result: form.result || null,
        text: form.text.trim() || null,
        follow_up_at: form.follow_up_at ? new Date(form.follow_up_at).toISOString() : null,
      });
      setLogs((prev) => {
        const next = [created, ...prev];
        if (onLogsChanged && scId) onLogsChanged(scId, next);
        return next;
      });
      setForm({ type: 'call', result: '', text: '', follow_up_at: '' });
    } catch (e: any) {
      setError(extractApiError(e, 'Не удалось сохранить запись'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId: number) => {
    if (!scId) return;
    try {
      await campaignsApi.deleteSchoolCampaignLog(scId, logId);
      setLogs((prev) => {
        const next = prev.filter((l) => l.id !== logId);
        if (onLogsChanged && scId) onLogsChanged(scId, next);
        return next;
      });
    } catch (e: any) {
      setError(extractApiError(e, 'Не удалось удалить запись'));
    }
  };

  const formatDateTime = (val?: string | null) =>
    val ? new Date(val).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const resultLabel = (r?: string | null) => LOG_RESULT_OPTIONS.find((o) => o.value === r)?.label ?? r ?? '';

  const followUpOverdue = (log: SchoolCampaignLog) =>
    log.follow_up_at && new Date(log.follow_up_at) < new Date();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" gap={1}>
          <Phone sx={{ fontSize: 20, color: 'primary.main' }} />
          <Typography variant="h6">CRM — {schoolName}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Форма добавления */}
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="subtitle2" mb={1}>Новая запись</Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" gap={1}>
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel id="crm-type-label">Тип</InputLabel>
                <Select labelId="crm-type-label" label="Тип" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <MenuItem value="call">Звонок</MenuItem>
                  <MenuItem value="note">Заметка</MenuItem>
                  <MenuItem value="meeting">Встреча</MenuItem>
                </Select>
              </FormControl>
              {form.type === 'call' && (
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel id="crm-result-label">Результат звонка</InputLabel>
                  <Select labelId="crm-result-label" label="Результат звонка" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
                    <MenuItem value=""><em>Не указан</em></MenuItem>
                    {LOG_RESULT_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </Stack>
            <TextField
              size="small"
              multiline
              minRows={2}
              label="Заметка"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="Что сказали, договорённости, детали..."
            />
            <TextField
              size="small"
              type="datetime-local"
              label="Перезвонить / напомнить"
              value={form.follow_up_at}
              onChange={(e) => setForm({ ...form, follow_up_at: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <Button
              variant="contained"
              disabled={saving || (!form.text.trim() && !form.result)}
              onClick={handleSave}
              size="small"
            >
              {saving ? 'Сохранение...' : 'Добавить запись'}
            </Button>
          </Stack>
        </Paper>

        {/* Лента активностей */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : logs.length === 0 ? (
          <Typography color="text.secondary" variant="body2" align="center" sx={{ py: 2 }}>
            Записей ещё нет
          </Typography>
        ) : (
          <Stack spacing={1}>
            {logs.map((log) => (
              <Paper
                key={log.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderLeft: '3px solid',
                  borderColor: log.type === 'call' ? 'primary.main' : log.type === 'email' ? 'info.main' : log.type === 'meeting' ? 'success.main' : 'grey.400',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Chip size="small" label={LOG_TYPE_LABELS[log.type] ?? log.type} variant="outlined"
                      color={log.type === 'email' ? 'info' : 'default'} />
                    {log.type === 'email' && log.result && (() => {
                      const sm = EMAIL_DELIVERY_STATUS[log.result] ?? { label: log.result, color: 'default' as const };
                      return <Chip size="small" label={sm.label} color={sm.color} />;
                    })()}
                    {log.type !== 'email' && log.result && (
                      <Chip
                        size="small"
                        label={resultLabel(log.result)}
                        color={log.result === 'answered' || log.result === 'scheduled' ? 'success' : log.result === 'refused' ? 'error' : 'default'}
                      />
                    )}
                  </Stack>
                  <Tooltip title="Удалить">
                    <IconButton size="small" onClick={() => handleDelete(log.id)}>
                      <DeleteOutline sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
                {log.text && (
                  <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{log.text}</Typography>
                )}
                {log.follow_up_at && (
                  <Typography
                    variant="caption"
                    sx={{ mt: 0.5, display: 'block', color: followUpOverdue(log) ? 'error.main' : 'warning.main', fontWeight: 600 }}
                  >
                    {followUpOverdue(log) ? '⚠ Просрочено:' : '🔔 Перезвонить:'} {formatDateTime(log.follow_up_at)}
                  </Typography>
                )}
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                  {log.created_by_name ?? 'Вы'} · {formatDateTime(log.created_at)}
                </Typography>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Диалог отправки шаблона письма школе
// ---------------------------------------------------------------------------
const EMAIL_DELIVERY_STATUS: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  pending:  { label: 'Ожидает отправки', color: 'default' },
  sending:  { label: 'Отправляется...', color: 'info' },
  sent:     { label: 'Доставлено', color: 'success' },
  failed:   { label: 'Ошибка доставки', color: 'error' },
  opened:   { label: 'Прочитано ✓', color: 'success' },
  clicked:  { label: 'Перешли по ссылке ✓', color: 'success' },
};

interface SendSchoolEmailDialogProps {
  open: boolean;
  scId: number | null;
  b2bSchoolId: number | null;
  schoolName: string;
  onClose: () => void;
}

const SendSchoolEmailDialog: React.FC<SendSchoolEmailDialogProps> = ({ open, scId, b2bSchoolId, schoolName, onClose }) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [toEmail, setToEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sentLogId, setSentLogId] = useState<number | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<null | {
    status: string; sent_at: string | null; opened_at: string | null;
    open_count: number; clicked_at: string | null; click_count: number; error_message: string | null;
  }>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  useEffect(() => {
    if (!open || !b2bSchoolId) return;
    setSentLogId(null);
    setDeliveryStatus(null);
    setError('');
    setSelectedId('');
    setShowPreview(false);
    stopPolling();
    setLoading(true);
    Promise.all([
      emailTemplatesApi.list(),
      b2bApi.getSchool(b2bSchoolId),
    ]).then(([tmps, school]) => {
      setTemplates(tmps);
      setToEmail(school.email ?? '');
    }).catch((e) => {
      setError(extractApiError(e, 'Не удалось загрузить данные'));
    }).finally(() => setLoading(false));
    return stopPolling;
  }, [open, b2bSchoolId]);

  useEffect(() => () => stopPolling(), []);

  const startPolling = (logId: number) => {
    stopPolling();
    if (!scId) return;
    const fetchStatus = async () => {
      try {
        const s = await campaignsApi.getLogEmailStatus(scId, logId);
        setDeliveryStatus(s);
        if (s.status === 'opened' || s.status === 'clicked' || s.status === 'failed' || s.status === 'sent') {
          stopPolling();
        }
      } catch { /* ignore */ }
    };
    void fetchStatus();
    pollRef.current = setInterval(fetchStatus, 5000);
  };

  const handleSend = async () => {
    if (!selectedId || !toEmail.trim() || !scId) return;
    setSending(true);
    setError('');
    try {
      const result = await campaignsApi.sendTemplateToSchool(scId, {
        template_id: selectedId as number,
        to_email: toEmail.trim(),
      });
      setSentLogId(result.log_id);
      setDeliveryStatus({ status: result.status, sent_at: null, opened_at: null, open_count: 0, clicked_at: null, click_count: 0, error_message: null });
      setShowPreview(false);
      startPolling(result.log_id);
    } catch (e: any) {
      setError(extractApiError(e, 'Не удалось отправить письмо'));
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  const previewHtml = React.useMemo(() => {
    if (!selectedTemplate?.html_body) return '';
    const vars: Record<string, string> = { school_name: schoolName, recipient_email: toEmail };
    return selectedTemplate.html_body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }, [selectedTemplate, schoolName, toEmail]);

  const statusMeta = deliveryStatus ? (EMAIL_DELIVERY_STATUS[deliveryStatus.status] ?? { label: deliveryStatus.status, color: 'default' as const }) : null;
  const isFinalStatus = deliveryStatus && ['sent', 'opened', 'clicked', 'failed'].includes(deliveryStatus.status);

  return (
    <Dialog open={open} onClose={onClose} maxWidth={showPreview ? 'lg' : 'sm'} fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Отправить письмо — {schoolName}</Typography>
          {selectedTemplate && !sentLogId && (
            <Button size="small" variant={showPreview ? 'contained' : 'outlined'} onClick={() => setShowPreview((v) => !v)} sx={{ ml: 2, flexShrink: 0 }}>
              {showPreview ? 'Настройки' : 'Предпросмотр'}
            </Button>
          )}
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: showPreview ? 0 : undefined }}>
        {loading && <Typography color="text.secondary" sx={{ p: 2 }}>Загрузка...</Typography>}
        {!loading && error && <Alert severity="error" sx={{ m: showPreview ? 2 : 0, mb: 2 }}>{error}</Alert>}

        {/* Статус доставки после отправки */}
        {sentLogId && deliveryStatus && (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" gap={1} mb={1}>
                <Email sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography variant="subtitle2">Статус отправки</Typography>
                {!isFinalStatus && <CircularProgress size={14} sx={{ ml: 'auto' }} />}
              </Stack>
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Chip size="small" label={statusMeta?.label} color={statusMeta?.color} />
                {deliveryStatus.opened_at && (
                  <Chip size="small" color="success" label={`Прочитано: ${new Date(deliveryStatus.opened_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`} />
                )}
                {deliveryStatus.open_count > 1 && (
                  <Chip size="small" color="info" label={`Открытий: ${deliveryStatus.open_count}`} />
                )}
                {deliveryStatus.clicked_at && (
                  <Chip size="small" color="success" label={`Клик по ссылке`} />
                )}
              </Stack>
              {deliveryStatus.error_message && (
                <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>{deliveryStatus.error_message}</Typography>
              )}
              {!isFinalStatus && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Статус обновляется каждые 5 секунд...
                </Typography>
              )}
            </Paper>
            <Typography variant="body2" color="text.secondary">
              Письмо отправлено на <strong>{toEmail}</strong>. Когда получатель откроет его, статус изменится на «Прочитано».
            </Typography>
          </Stack>
        )}

        {/* Форма (до отправки) */}
        {!loading && !sentLogId && !showPreview && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="email-template-label">Шаблон письма</InputLabel>
              <Select labelId="email-template-label" label="Шаблон письма" value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value as number); setShowPreview(false); }}>
                {templates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{t.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{t.subject}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedTemplate && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">Тема письма: </Typography>
                <Typography variant="caption" fontWeight={600}>{selectedTemplate.subject}</Typography>
              </Paper>
            )}
            <TextField size="small" label="Email получателя" value={toEmail}
              onChange={(e) => setToEmail(e.target.value)} helperText="Адрес из карточки школы, можно изменить" />
          </Stack>
        )}

        {/* Предпросмотр */}
        {!loading && !sentLogId && showPreview && selectedTemplate && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '75vh' }}>
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Typography variant="caption" color="text.secondary">Кому: </Typography>
              <Typography variant="caption" fontWeight={600}>{toEmail || '—'}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>Тема: </Typography>
              <Typography variant="caption" fontWeight={600}>{selectedTemplate.subject}</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <iframe title="preview" sandbox="allow-same-origin" srcDoc={previewHtml}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{sentLogId ? 'Закрыть' : 'Отмена'}</Button>
        {!sentLogId && (
          <Button variant="contained" disabled={!selectedId || !toEmail.trim() || sending || loading || !scId}
            onClick={handleSend} startIcon={<Email sx={{ fontSize: 16 }} />}>
            {sending ? 'Отправка...' : 'Отправить'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
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
  const [eventCounts, setEventCounts] = useState<Record<string, { events_invited_count: number; events_participated_count: number; events_hosted_count: number }>>({});

  // --- add schools dialog ---
  const [addSchoolsOpen, setAddSchoolsOpen] = useState(false);
  const [availableSchools, setAvailableSchools] = useState<AvailableCampaignSchool[]>([]);
  const [schoolFilterCities, setSchoolFilterCities] = useState<string[]>([]);
  const [schoolFilterDistricts, setSchoolFilterDistricts] = useState<string[]>([]);
  const [selectedSchoolCities, setSelectedSchoolCities] = useState<string[]>([]);
  const [selectedSchoolDistricts, setSelectedSchoolDistricts] = useState<string[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<number[]>([]);
  const [addSchoolsLoading, setAddSchoolsLoading] = useState(false);
  const [createContactTask, setCreateContactTask] = useState(true);

  // --- schools loading ---
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  // Per-column render limit (key = stage key → how many cards to show)
  const [colLimits, setColLimits] = useState<Record<string, number>>({});

  // --- view mode + table state ---
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [stageFilter, setStageFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [tablePage, setTablePage] = useState(0);

  // --- CRM dialog ---
  const [crmOpen, setCrmOpen] = useState(false);
  const [crmScId, setCrmScId] = useState<number | null>(null);
  const [crmSchoolName, setCrmSchoolName] = useState('');
  // follow-up indicators: map scId → { hasFollowUp, followUpOverdue }
  const [followUpMap, setFollowUpMap] = useState<Record<number, { hasFollowUp: boolean; followUpOverdue: boolean }>>({});

  const openCRM = useCallback((scId: number, name: string) => {
    setCrmScId(scId);
    setCrmSchoolName(name);
    setCrmOpen(true);
  }, []);

  const handleCrmLogsChanged = useCallback((scId: number, logs: SchoolCampaignLog[]) => {
    const now = new Date();
    const withFollowUp = logs.filter((l) => l.follow_up_at);
    const overdue = withFollowUp.some((l) => new Date(l.follow_up_at!) < now);
    setFollowUpMap((prev) => ({
      ...prev,
      [scId]: { hasFollowUp: withFollowUp.length > 0, followUpOverdue: overdue },
    }));
  }, []);

  // --- send email dialog ---
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [sendEmailScId, setSendEmailScId] = useState<number | null>(null);
  const [sendEmailSchoolId, setSendEmailSchoolId] = useState<number | null>(null);
  const [sendEmailSchoolName, setSendEmailSchoolName] = useState('');

  const openSendEmail = useCallback((b2bSchoolId: number, name: string, scId?: number) => {
    setSendEmailSchoolId(b2bSchoolId);
    setSendEmailSchoolName(name);
    setSendEmailScId(scId ?? null);
    setSendEmailOpen(true);
  }, []);

  // --- school card dialog ---
  const [schoolCardOpen, setSchoolCardOpen] = useState(false);
  const [schoolCardData, setSchoolCardData] = useState<B2BSchool | null>(null);
  const [schoolCardLoading, setSchoolCardLoading] = useState(false);

  const openSchoolCard = useCallback(async (b2bSchoolId: number) => {
    setSchoolCardOpen(true);
    setSchoolCardData(null);
    setSchoolCardLoading(true);
    try {
      const school = await b2bApi.getSchool(b2bSchoolId);
      setSchoolCardData(school);
    } finally {
      setSchoolCardLoading(false);
    }
  }, []);
  const TABLE_ROWS_PER_PAGE = 50;

  // --- broadcasts ---
  type LinkedBroadcast = { id: number; name: string; subject: string; status: string; sent_at: string | null; total_recipients: number; sent_count: number; opened_count: number; clicked_count: number };
  const [linkedBroadcasts, setLinkedBroadcasts] = useState<LinkedBroadcast[]>([]);
  const [allBroadcasts, setAllBroadcasts] = useState<EmailBroadcastItem[]>([]);
  const [linkBroadcastOpen, setLinkBroadcastOpen] = useState(false);
  const [syncingBroadcastId, setSyncingBroadcastId] = useState<number | null>(null);

  // --- archive / history ---
  const [kanbanSearch, setKanbanSearch] = useState('');
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

  useEffect(() => {
    if (!addSchoolsOpen) return;
    let cancelled = false;
    Promise.all([
      b2bApi.listCities(),
      settingsApi.getB2BDistricts(),
    ]).then(([cities, districts]) => {
      if (cancelled) return;
      setSchoolFilterCities(cities);
      setSchoolFilterDistricts(districts.items);
    }).catch((err: any) => {
      if (!cancelled) setError(extractApiError(err, 'Не удалось загрузить фильтры школ'));
    });
    return () => { cancelled = true; };
  }, [addSchoolsOpen]);

  useEffect(() => {
    if (!addSchoolsOpen || !selectedCampaignId) return;
    let cancelled = false;
    setAddSchoolsLoading(true);
    campaignsApi.listSchoolsAvailable(selectedCampaignId, {
      cities: selectedSchoolCities,
      districts: selectedSchoolDistricts,
      search: schoolSearch.trim() || undefined,
    }).then((rows) => {
      if (cancelled) return;
      setAvailableSchools(rows);
      setSelectedSchoolIds((prev) => prev.filter((id) => rows.some((school) => school.id === id)));
    }).catch((err: any) => {
      if (!cancelled) setError(extractApiError(err, 'Не удалось загрузить список школ'));
    }).finally(() => {
      if (!cancelled) setAddSchoolsLoading(false);
    });
    return () => { cancelled = true; };
  }, [addSchoolsOpen, selectedCampaignId, selectedSchoolCities, selectedSchoolDistricts, schoolSearch]);

  // Load campaign detail + school-campaigns + stages when selecting a campaign
  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignDetail(null);
      setSchoolCampaigns([]);
      setStages([]);
      setEventCounts({});
      setColLimits({});
      setLinkedBroadcasts([]);
      return;
    }
    setCampaignDetail(null);
    setSchoolCampaigns([]);
    setStages([]);
    setEventCounts({});
    setColLimits({});
    setLinkedBroadcasts([]);
    setSchoolsLoading(true);

    // Load campaign metadata + stages first, then kick off heavy requests after page renders
    Promise.all([
      campaignsApi.get(selectedCampaignId),
      campaignsApi.listStages(selectedCampaignId),
    ])
      .then(([c, stageList]) => {
        setCampaignDetail(c);
        setStages(stageList);

        // Defer heavy requests so metadata renders first (avoids competing for DB connections)
        const cid = selectedCampaignId;
        setSchoolsLoading(true);
        campaignsApi.listSchoolCampaigns(cid)
          .then(setSchoolCampaigns)
          .catch((err: any) => setError(extractApiError(err, 'Не удалось загрузить школы кампании')))
          .finally(() => setSchoolsLoading(false));

        campaignsApi.listCampaignBroadcasts(cid)
          .then(setLinkedBroadcasts)
          .catch(() => setLinkedBroadcasts([]));

        campaignsApi.getCampaignSchoolEventCounts(cid)
          .then(setEventCounts)
          .catch(() => setEventCounts({}));
      })
      .catch((err: any) => setError(extractApiError(err, 'Не удалось загрузить кампанию')));
  }, [selectedCampaignId]);

  // Reset table page when search or filter changes
  useEffect(() => { setTablePage(0); }, [kanbanSearch, stageFilter, cityFilter]);

  const uniqueCities = useMemo(() =>
    Array.from(new Set(schoolCampaigns.map((sc) => sc.school_city).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')),
  [schoolCampaigns]);

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
  const COLUMN_RENDER_LIMIT = 50; // начальный лимит карточек на колонку
  const COLUMN_LOAD_MORE = 50;    // сколько добавлять при каждом нажатии
  const kanbanSearchLower = kanbanSearch.toLowerCase().trim();
  const byStage = useMemo(() =>
    stages.map((s) => {
      const allItems = schoolCampaigns.filter((sc) =>
        sc.stage === s.key &&
        (!kanbanSearchLower || (sc.school_name || '').toLowerCase().includes(kanbanSearchLower)) &&
        (!cityFilter || sc.school_city === cityFilter)
      );
      // При активном поиске — показываем все совпадения (их обычно мало)
      const limit = (kanbanSearchLower.length > 0 || cityFilter) ? Infinity : (colLimits[s.key] ?? COLUMN_RENDER_LIMIT);
      return {
        ...s,
        items: allItems.slice(0, limit),
        totalItems: allItems.length,
        hasMore: allItems.length > limit,
      };
    }),
  [stages, schoolCampaigns, kanbanSearchLower, cityFilter, colLimits]);

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
    setSelectedSchoolCities([]);
    setSelectedSchoolDistricts([]);
    setSchoolSearch('');
    setSelectedSchoolIds([]);
    setAddSchoolsOpen(true);
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
    if (!selectedCampaignId || selectedSchoolIds.length === 0) return;
    setError(null);
    setAddSchoolsLoading(true);
    try {
      await campaignsApi.addSchools(selectedCampaignId, { school_ids: selectedSchoolIds, create_contact_task: createContactTask });
      setAddSchoolsOpen(false);
      setSelectedSchoolIds([]);
      setSchoolCampaigns(await campaignsApi.listSchoolCampaigns(selectedCampaignId));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить школы'));
    } finally {
      setAddSchoolsLoading(false);
    }
  };

  const handleStageChange = async (scId: number, newStage: string) => {
    if (!selectedCampaignId) return;
    // Optimistic update — не перезагружаем все школы
    setSchoolCampaigns((prev) => prev.map((s) => s.id === scId ? { ...s, stage: newStage } : s));
    try {
      await campaignsApi.updateSchoolCampaign(selectedCampaignId, scId, { stage: newStage });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить стадию'));
      // Откат при ошибке
      setSchoolCampaigns(await campaignsApi.listSchoolCampaigns(selectedCampaignId));
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

  const openLinkBroadcastDialog = () => {
    setLinkBroadcastOpen(true);
    emailBroadcastsApi.list().then(setAllBroadcasts).catch(() => {});
  };

  const handleLinkBroadcast = async (broadcastId: number) => {
    if (!selectedCampaignId) return;
    try {
      await campaignsApi.linkBroadcastToCampaign(selectedCampaignId, broadcastId);
      setLinkedBroadcasts(await campaignsApi.listCampaignBroadcasts(selectedCampaignId));
      // Reload stages — new email_sent/email_opened stages may have been created
      campaignsApi.listStages(selectedCampaignId).then(setStages).catch(() => {});
      setLinkBroadcastOpen(false);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось привязать рассылку'));
    }
  };

  const handleUnlinkBroadcast = async (broadcastId: number) => {
    if (!selectedCampaignId) return;
    try {
      await campaignsApi.unlinkBroadcastFromCampaign(selectedCampaignId, broadcastId);
      setLinkedBroadcasts(await campaignsApi.listCampaignBroadcasts(selectedCampaignId));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отвязать рассылку'));
    }
  };

  const handleSyncBroadcast = async (broadcastId: number) => {
    if (!selectedCampaignId) return;
    setSyncingBroadcastId(broadcastId);
    try {
      const result = await campaignsApi.syncBroadcastCampaignStages(selectedCampaignId, broadcastId);
      // Reload schools after sync
      setSchoolCampaigns(await campaignsApi.listSchoolCampaigns(selectedCampaignId));
      setError(null);
      alert(`Синхронизировано: ${result.advanced_sent} писем отправлено, ${result.advanced_opened} писем открыто`);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось синхронизировать'));
    } finally {
      setSyncingBroadcastId(null);
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

  // Table-view filtered list
  const filteredSchools = useMemo(() => {
    return schoolCampaigns.filter((sc) => {
      const matchSearch = !kanbanSearchLower || (sc.school_name || '').toLowerCase().includes(kanbanSearchLower);
      const matchStage = !stageFilter || sc.stage === stageFilter;
      const matchCity = !cityFilter || sc.school_city === cityFilter;
      return matchSearch && matchStage && matchCity;
    });
  }, [schoolCampaigns, kanbanSearchLower, stageFilter, cityFilter]);

  const paginatedSchools = useMemo(() =>
    filteredSchools.slice(tablePage * TABLE_ROWS_PER_PAGE, (tablePage + 1) * TABLE_ROWS_PER_PAGE),
  [filteredSchools, tablePage]);

  const activeCampaigns = useMemo(() => campaigns.filter((c) => c.status === 'draft' || c.status === 'active'), [campaigns]);
  const archivedCampaigns = useMemo(() => campaigns.filter((c) => c.status === 'done' || c.status === 'canceled'), [campaigns]);
  const visibleCampaigns = showArchived ? archivedCampaigns : activeCampaigns;
  const allFilteredSchoolsSelected = availableSchools.length > 0
    && availableSchools.every((school) => selectedSchoolIds.includes(school.id));
  const someFilteredSchoolsSelected = availableSchools.some((school) => selectedSchoolIds.includes(school.id));

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

              {campaignDetail.is_game_jam && (
                <GameJamKanban
                  campaignId={selectedCampaignId}
                  canManage={canManageCampaigns}
                  onError={setError}
                />
              )}

              {!campaignDetail.is_game_jam && (
                <>
                  {/* Toolbar */}
                  <Stack direction="row" gap={1} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
                    {canManageCampaigns && (
                      <Button variant="contained" size="small" startIcon={<Add />} onClick={openAddSchools}>
                        Добавить школы
                      </Button>
                    )}
                    {canManageCampaigns && (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<SettingsOutlined />}
                        onClick={() => setStagesDialogOpen(true)}
                      >
                        Этапы
                      </Button>
                    )}
                    <TextField
                      size="small"
                      placeholder={schoolsLoading ? 'Загрузка школ…' : `Поиск по ${schoolCampaigns.length} школам…`}
                      value={kanbanSearch}
                      onChange={(e) => setKanbanSearch(e.target.value)}
                      sx={{ flex: '1 1 200px', maxWidth: 320 }}
                    />
                    {uniqueCities.length > 0 && (
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <Select
                          value={cityFilter}
                          onChange={(e) => setCityFilter(e.target.value)}
                          displayEmpty
                          renderValue={(v) => v || 'Все города'}
                        >
                          <MenuItem value="">Все города</MenuItem>
                          {uniqueCities.map((city) => (
                            <MenuItem key={city} value={city}>
                              <Stack direction="row" alignItems="center" gap={1} sx={{ width: '100%' }}>
                                <Typography variant="body2" sx={{ flex: 1 }}>{city}</Typography>
                                <Chip
                                  label={schoolCampaigns.filter((sc) => sc.school_city === city).length}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 18, fontSize: 11 }}
                                />
                              </Stack>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <Select
                        value={stageFilter}
                        onChange={(e) => setStageFilter(e.target.value)}
                        displayEmpty
                        renderValue={(v) => v ? (stages.find((s) => s.key === v)?.label ?? v) : 'Все этапы'}
                      >
                        <MenuItem value="">Все этапы</MenuItem>
                        {stages.map((s) => (
                          <MenuItem key={s.key} value={s.key}>
                            <Stack direction="row" alignItems="center" gap={1} sx={{ width: '100%' }}>
                              <Typography variant="body2" sx={{ flex: 1 }}>{s.label}</Typography>
                              <Chip
                                label={schoolCampaigns.filter((sc) => sc.stage === s.key).length}
                                size="small"
                                variant="outlined"
                                sx={{ height: 18, fontSize: 11 }}
                              />
                            </Stack>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <ToggleButtonGroup
                      value={viewMode}
                      exclusive
                      onChange={(_, v) => { if (v) setViewMode(v); }}
                      size="small"
                    >
                      <ToggleButton value="table" aria-label="таблица">
                        <Tooltip title="Таблица"><TableRowsIcon fontSize="small" /></Tooltip>
                      </ToggleButton>
                      <ToggleButton value="kanban" aria-label="канбан">
                        <Tooltip title="Канбан"><ViewKanban fontSize="small" /></Tooltip>
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>

                  {/* Loading bar */}
                  {schoolsLoading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}

                  {/* ── TABLE VIEW ── */}
                  {viewMode === 'table' && (
                    <Paper variant="outlined">
                      <TableContainer>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ width: 48, color: 'text.disabled' }}>#</TableCell>
                              <TableCell>Школа</TableCell>
                              <TableCell sx={{ width: 160 }}>Город</TableCell>
                              <TableCell sx={{ width: 200 }}>Этап</TableCell>
                              <TableCell sx={{ width: 48 }} />
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {paginatedSchools.length === 0 && !schoolsLoading ? (
                              <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                  {kanbanSearch || stageFilter ? 'Нет совпадений' : 'Нет школ в кампании'}
                                </TableCell>
                              </TableRow>
                            ) : (
                              paginatedSchools.map((sc, idx) => (
                                <TableRow key={sc.id} hover>
                                  <TableCell sx={{ color: 'text.disabled', fontSize: 12 }}>
                                    {tablePage * TABLE_ROWS_PER_PAGE + idx + 1}
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={500}>
                                      {sc.school_name || `Школа #${sc.b2b_school_id}`}
                                    </Typography>
                                    {sc.school_district && (
                                      <Typography variant="caption" color="text.secondary">{sc.school_district}</Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">{sc.school_city || '—'}</Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={sc.stage}
                                      onChange={(e) => void handleStageChange(sc.id, e.target.value)}
                                      disabled={!canManageCampaigns}
                                      size="small"
                                      fullWidth
                                      variant="outlined"
                                      sx={{ fontSize: 13 }}
                                    >
                                      {stages.map((s) => (
                                        <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>
                                      ))}
                                    </Select>
                                  </TableCell>
                                  <TableCell align="center" sx={{ pr: 1 }}>
                                    <Tooltip title="История активностей">
                                      <IconButton size="small" onClick={() => openHistoryDialog(sc.id)}>
                                        <History fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <TablePagination
                        component="div"
                        count={filteredSchools.length}
                        page={tablePage}
                        onPageChange={(_, p) => setTablePage(p)}
                        rowsPerPage={TABLE_ROWS_PER_PAGE}
                        rowsPerPageOptions={[TABLE_ROWS_PER_PAGE]}
                        labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
                      />
                    </Paper>
                  )}

                  {/* ── KANBAN VIEW ── */}
                  {viewMode === 'kanban' && (
                    stages.length === 0 ? (
                      <Typography color="text.secondary">Загрузка этапов…</Typography>
                    ) : (
                      <DndContext
                        sensors={dndSensors}
                        onDragStart={handleDndDragStart}
                        onDragEnd={(e) => void handleDndDragEnd(e)}
                      >
                        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', flexWrap: 'nowrap', pb: 2, alignItems: 'flex-start', scrollSnapType: 'x proximity' }}>
                          {byStage.map((col) => (
                            <KanbanColumn
                              key={col.key}
                              stageKey={col.key}
                              label={col.label}
                              isTerminal={col.is_terminal}
                              count={col.totalItems}
                            >
                              {schoolsLoading ? (
                                <Box sx={{ py: 1 }}>
                                  {[0, 1, 2].map((i) => (
                                    <Box key={i} sx={{ mb: 0.75, borderRadius: 1.5, bgcolor: 'grey.200', height: 72, opacity: 1 - i * 0.25 }} />
                                  ))}
                                </Box>
                              ) : col.items.length === 0 ? (
                                <Typography variant="caption" color="text.disabled" align="center" sx={{ display: 'block', py: 2 }}>
                                  Нет школ
                                </Typography>
                              ) : (
                                <>
                                  {col.items.map((sc) => {
                                    const counts = eventCounts[String(sc.id)];
                                    const countLabel = counts?.events_invited_count !== undefined
                                      ? `приглаш.: ${counts.events_invited_count} · участий: ${counts.events_participated_count} · площадок: ${counts.events_hosted_count}`
                                      : undefined;
                                    return (
                                      <KanbanSchoolCard
                                        key={sc.id}
                                        scId={sc.id}
                                        schoolName={sc.school_name?.trim() || `Школа #${sc.b2b_school_id}`}
                                        schoolCity={sc.school_city}
                                        countLabel={countLabel}
                                        stages={stages}
                                        currentStage={sc.stage}
                                        canManage={canManageCampaigns}
                                        b2bSchoolId={sc.b2b_school_id}
                                        hasFollowUp={followUpMap[sc.id]?.hasFollowUp}
                                        followUpOverdue={followUpMap[sc.id]?.followUpOverdue}
                                        onStageChange={handleStageChange}
                                        onHistory={openHistoryDialog}
                                        onOpenSchool={openSchoolCard}
                                        onSendEmail={openSendEmail}
                                        onOpenCRM={openCRM}
                                      />
                                    );
                                  })}
                                  {col.hasMore && (
                                    <Button
                                      size="small"
                                      variant="text"
                                      fullWidth
                                      onClick={() => setColLimits((prev) => ({
                                        ...prev,
                                        [col.key]: (prev[col.key] ?? COLUMN_RENDER_LIMIT) + COLUMN_LOAD_MORE,
                                      }))}
                                      sx={{ mt: 0.5 }}
                                    >
                                      Ещё 50 из {col.totalItems}
                                    </Button>
                                  )}
                                </>
                              )}
                            </KanbanColumn>
                          ))}
                        </Box>
                        <DragOverlay>
                          {dndActiveSchool && (
                            <Card variant="outlined" sx={{ width: 240, opacity: 0.9, boxShadow: 4 }}>
                              <CardContent sx={{ py: 1, px: 1.5 }}>
                                <Typography variant="body2">{dndActiveSchool.school_name}</Typography>
                                <Typography variant="caption" color="text.secondary">{dndActiveSchool.school_city}</Typography>
                              </CardContent>
                            </Card>
                          )}
                        </DragOverlay>
                      </DndContext>
                    )
                  )}
                  {/* ── РАССЫЛКИ КАМПАНИИ ── */}
                  <Box sx={{ mt: 3 }}>
                    <Divider sx={{ mb: 2 }} />
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Email fontSize="small" color="action" />
                        <Typography variant="subtitle1" fontWeight={600}>
                          Рассылки кампании
                        </Typography>
                        {linkedBroadcasts.length > 0 && (
                          <Chip label={linkedBroadcasts.length} size="small" variant="outlined" />
                        )}
                      </Stack>
                      {canManageCampaigns && (
                        <Button size="small" variant="outlined" startIcon={<Add />} onClick={openLinkBroadcastDialog}>
                          Привязать рассылку
                        </Button>
                      )}
                    </Stack>
                    {linkedBroadcasts.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        Нет привязанных рассылок
                      </Typography>
                    ) : (
                      <Stack gap={1.5}>
                        {linkedBroadcasts.map((b) => (
                          <Paper key={b.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                            <Stack direction="row" alignItems="flex-start" gap={1.5} flexWrap="wrap">
                              <Box sx={{ flex: 1, minWidth: 160 }}>
                                <Typography variant="body2" fontWeight={500}>{b.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{b.subject}</Typography>
                              </Box>
                              <Stack direction="row" gap={0.5} flexWrap="wrap" alignItems="center">
                                <Chip
                                  label={b.status === 'done' ? 'Отправлена' : b.status === 'draft' ? 'Черновик' : b.status === 'sending' ? 'Отправка…' : b.status}
                                  size="small"
                                  color={b.status === 'done' ? 'success' : b.status === 'sending' ? 'warning' : 'default'}
                                  variant="outlined"
                                />
                                <Chip label={`Отправлено: ${b.sent_count}`} size="small" variant="outlined" />
                                <Chip label={`Открыто: ${b.opened_count}`} size="small" variant="outlined" color="info" />
                              </Stack>
                              {canManageCampaigns && (
                                <Stack direction="row" gap={0.5}>
                                  <Tooltip title="Синхронизировать этапы со школами">
                                    <span>
                                      <IconButton
                                        size="small"
                                        disabled={syncingBroadcastId === b.id}
                                        onClick={() => void handleSyncBroadcast(b.id)}
                                      >
                                        <Sync fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Отвязать рассылку">
                                    <IconButton size="small" onClick={() => void handleUnlinkBroadcast(b.id)}>
                                      <LinkOff fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              )}
                            </Stack>
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Box>

                  {/* ── DIALOG: привязать рассылку ── */}
                  <Dialog open={linkBroadcastOpen} onClose={() => setLinkBroadcastOpen(false)} maxWidth="sm" fullWidth>
                    <DialogTitle>Привязать рассылку к кампании</DialogTitle>
                    <DialogContent dividers>
                      {allBroadcasts.filter((b) => !linkedBroadcasts.some((lb) => lb.id === b.id)).length === 0 ? (
                        <Typography color="text.secondary">Нет доступных рассылок для привязки</Typography>
                      ) : (
                        <Stack gap={1}>
                          {allBroadcasts
                            .filter((b) => !linkedBroadcasts.some((lb) => lb.id === b.id))
                            .map((b) => (
                              <Stack
                                key={b.id}
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                                sx={{
                                  px: 2, py: 1.5, border: '1px solid', borderColor: 'divider',
                                  borderRadius: 2, cursor: 'pointer',
                                  '&:hover': { bgcolor: 'action.hover' },
                                }}
                                onClick={() => void handleLinkBroadcast(b.id)}
                              >
                                <Box>
                                  <Typography variant="body2" fontWeight={500}>{b.name}</Typography>
                                  <Chip
                                    label={b.status === 'done' ? 'Отправлена' : b.status === 'draft' ? 'Черновик' : b.status === 'sending' ? 'Отправка…' : b.status}
                                    size="small"
                                    color={b.status === 'done' ? 'success' : b.status === 'sending' ? 'warning' : 'default'}
                                    variant="outlined"
                                    sx={{ mt: 0.5 }}
                                  />
                                </Box>
                                <Add fontSize="small" color="action" />
                              </Stack>
                            ))}
                        </Stack>
                      )}
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setLinkBroadcastOpen(false)}>Закрыть</Button>
                    </DialogActions>
                  </Dialog>
                </>
              )}
            </>
          ) : (
            <Box sx={{ mt: 2 }}>
              <LinearProgress sx={{ borderRadius: 1, mb: 1 }} />
              <Typography variant="body2" color="text.secondary">Загрузка данных кампании…</Typography>
            </Box>
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
      <Dialog open={addSchoolsOpen} onClose={() => setAddSchoolsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Добавить школы в кампанию</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={schoolFilterCities}
                value={selectedSchoolCities}
                onChange={(_, value) => setSelectedSchoolCities(value)}
                renderInput={(params) => <TextField {...params} label="Города" />}
                sx={{ flex: 1 }}
              />
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={schoolFilterDistricts}
                value={selectedSchoolDistricts}
                onChange={(_, value) => setSelectedSchoolDistricts(value)}
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
                checked={allFilteredSchoolsSelected}
                indeterminate={!allFilteredSchoolsSelected && someFilteredSchoolsSelected}
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
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{school.name}</Typography>
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
            <FormControlLabel
              control={<Checkbox checked={createContactTask} onChange={(e) => setCreateContactTask(e.target.checked)} />}
              label="Создать задачу «Связаться со школой» для каждой"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddSchoolsOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleAddSchools} disabled={selectedSchoolIds.length === 0 || addSchoolsLoading}>Добавить</Button>
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

      {/* ---- CRM: звонки и заметки ---- */}
      <CRMDialog
        open={crmOpen}
        scId={crmScId}
        schoolName={crmSchoolName}
        onClose={() => setCrmOpen(false)}
        onLogsChanged={handleCrmLogsChanged}
      />

      {/* ---- Отправка шаблона письма школе ---- */}
      <SendSchoolEmailDialog
        open={sendEmailOpen}
        scId={sendEmailScId}
        b2bSchoolId={sendEmailSchoolId}
        schoolName={sendEmailSchoolName}
        onClose={() => setSendEmailOpen(false)}
      />

      {/* ---- Карточка школы (открывается по клику с канбана) ---- */}
      <SchoolCardDialog
        open={schoolCardOpen}
        school={schoolCardLoading ? null : schoolCardData}
        onClose={() => { setSchoolCardOpen(false); setSchoolCardData(null); }}
        onSaved={(updated) => setSchoolCardData(updated)}
      />
    </>
  );
};
