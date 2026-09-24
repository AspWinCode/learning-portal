import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Lead, LeadScheduledEventType, LeadThinkingReason } from '../../types';
import { SCHEDULED_EVENT_TYPE_LABELS, THINKING_REASON_LABELS } from '../../utils/leadPipeline';

export type TransitionMode =
  | 'trial_scheduled'
  | 'thinking'
  | 'refused'
  | 'invoice_sent'
  | 'demo_outcome'
  | 'convert_to_student'
  | 'later_confirm';

export interface TransitionResultPayload {
  status?: Lead['status'];
  next_contact_at?: string;
  scheduled_event_type?: string;
  thinking_reason?: string;
  lost_reason?: string;
  child_full_name?: string;
  parent_full_name?: string;
  parent_phone?: string;
  email?: string;
  city?: string;
  school_class?: string;
}

interface LeadStageTransitionDialogProps {
  open: boolean;
  mode: TransitionMode | null;
  lead: Lead | null;
  refusedReasons: string[];
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (payload: TransitionResultPayload) => void | Promise<void>;
  /** Для demo_outcome — выбор следующего этапа (запускает следующий диалог у родителя). */
  onPickDemoOutcome?: (outcome: 'thinking' | 'invoice_sent' | 'refused') => void;
  /** Для won — родитель открывает существующий флоу конвертации в ученика. */
  onConvertToStudent?: () => void;
}

const toLocalInputValue = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const REQUIRED_INVOICE_FIELDS: { key: keyof TransitionResultPayload; label: string }[] = [
  { key: 'child_full_name', label: 'ФИО ученика' },
  { key: 'parent_full_name', label: 'ФИО родителя' },
  { key: 'parent_phone', label: 'Телефон родителя' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'Город' },
  { key: 'school_class', label: 'Класс' },
];

export const LeadStageTransitionDialog: React.FC<LeadStageTransitionDialogProps> = ({
  open,
  mode,
  lead,
  refusedReasons,
  submitting,
  error,
  onClose,
  onConfirm,
  onPickDemoOutcome,
  onConvertToStudent,
}) => {
  const [nextContactAt, setNextContactAt] = useState('');
  const [scheduledEventType, setScheduledEventType] = useState<LeadScheduledEventType | ''>('trial');
  const [thinkingReason, setThinkingReason] = useState<LeadThinkingReason | ''>('');
  const [refusedReason, setRefusedReason] = useState('');
  const [refusedReasonOther, setRefusedReasonOther] = useState('');
  const [invoiceFields, setInvoiceFields] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !lead) return;
    setLocalError(null);
    setNextContactAt(toLocalInputValue(lead.next_contact_at));
    setScheduledEventType((lead.scheduled_event_type as LeadScheduledEventType) || 'trial');
    setThinkingReason((lead.thinking_reason as LeadThinkingReason) || '');
    setRefusedReason(lead.lost_reason || '');
    setRefusedReasonOther('');
    setInvoiceFields({
      child_full_name: lead.child_full_name || '',
      parent_full_name: lead.parent_full_name || lead.contact_name || '',
      parent_phone: lead.parent_phone || lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      school_class: lead.school_class || '',
    });
  }, [open, lead, mode]);

  const hasReasonList = refusedReasons.length > 0;
  const otherOptionInList = refusedReasons.some((r) => r.trim().toLowerCase() === 'другое');
  const needsOtherText = !hasReasonList || refusedReason === 'Другое' || (!otherOptionInList && !!refusedReason);

  const missingInvoiceFields = useMemo(() => {
    if (mode !== 'invoice_sent') return [];
    return REQUIRED_INVOICE_FIELDS.filter((f) => !(invoiceFields[f.key as string] || '').trim());
  }, [mode, invoiceFields]);

  const title = useMemo(() => {
    switch (mode) {
      case 'trial_scheduled':
        return 'Запланировать';
      case 'thinking':
        return 'Лид думает';
      case 'refused':
        return 'Причина отказа';
      case 'invoice_sent':
        return 'Готовы заниматься / Оформление';
      case 'demo_outcome':
        return 'Чем закончилось «Состоялось»?';
      case 'convert_to_student':
        return 'Создать ученика';
      case 'later_confirm':
        return 'Перевести в «Возможно позже»?';
      default:
        return '';
    }
  }, [mode]);

  const handleConfirm = async () => {
    setLocalError(null);
    if (mode === 'trial_scheduled') {
      if (!scheduledEventType) {
        setLocalError('Выберите тип мероприятия');
        return;
      }
      if (!nextContactAt) {
        setLocalError('Укажите дату и время');
        return;
      }
      const d = new Date(nextContactAt);
      if (Number.isNaN(d.getTime())) {
        setLocalError('Некорректная дата');
        return;
      }
      await onConfirm({
        status: 'trial_scheduled',
        scheduled_event_type: scheduledEventType,
        next_contact_at: d.toISOString(),
      });
      return;
    }
    if (mode === 'thinking') {
      if (!nextContactAt) {
        setLocalError('Укажите дату следующего контакта');
        return;
      }
      if (!thinkingReason) {
        setLocalError('Укажите причину');
        return;
      }
      const d = new Date(nextContactAt);
      if (Number.isNaN(d.getTime())) {
        setLocalError('Некорректная дата');
        return;
      }
      await onConfirm({
        status: 'thinking',
        next_contact_at: d.toISOString(),
        thinking_reason: thinkingReason,
      });
      return;
    }
    if (mode === 'refused') {
      const finalReason = needsOtherText ? refusedReasonOther.trim() : refusedReason.trim();
      if (!finalReason) {
        setLocalError('Укажите причину отказа');
        return;
      }
      await onConfirm({ status: 'refused', lost_reason: finalReason });
      return;
    }
    if (mode === 'invoice_sent') {
      if (missingInvoiceFields.length > 0) {
        setLocalError(`Заполните обязательные поля: ${missingInvoiceFields.map((f) => f.label).join(', ')}`);
        return;
      }
      await onConfirm({ status: 'invoice_sent', ...invoiceFields });
      return;
    }
    if (mode === 'later_confirm') {
      await onConfirm({ status: 'later' });
      return;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {(error || localError) && <Alert severity="error">{error || localError}</Alert>}

          {mode === 'trial_scheduled' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel id="scheduled-event-type-label">Тип</InputLabel>
                <Select
                  labelId="scheduled-event-type-label"
                  label="Тип"
                  value={scheduledEventType}
                  onChange={(e) => setScheduledEventType(e.target.value as LeadScheduledEventType)}
                >
                  {Object.entries(SCHEDULED_EVENT_TYPE_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                type="datetime-local"
                label="Дата и время"
                size="small"
                value={nextContactAt}
                onChange={(e) => setNextContactAt(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}

          {mode === 'thinking' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel id="thinking-reason-label">Причина</InputLabel>
                <Select
                  labelId="thinking-reason-label"
                  label="Причина"
                  value={thinkingReason}
                  onChange={(e) => setThinkingReason(e.target.value as LeadThinkingReason)}
                >
                  {Object.entries(THINKING_REASON_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                type="datetime-local"
                label="Следующий контакт"
                size="small"
                value={nextContactAt}
                onChange={(e) => setNextContactAt(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}

          {mode === 'refused' && (
            <>
              {hasReasonList ? (
                <FormControl fullWidth size="small">
                  <InputLabel id="refused-reason-label">Причина отказа</InputLabel>
                  <Select
                    labelId="refused-reason-label"
                    label="Причина отказа"
                    value={refusedReason}
                    onChange={(e) => setRefusedReason(e.target.value as string)}
                  >
                    {refusedReasons.map((r) => (
                      <MenuItem key={r} value={r}>
                        {r}
                      </MenuItem>
                    ))}
                    {!otherOptionInList && <MenuItem value="Другое">Другое</MenuItem>}
                  </Select>
                </FormControl>
              ) : null}
              {needsOtherText && (
                <TextField
                  fullWidth
                  size="small"
                  label={hasReasonList ? 'Уточните причину' : 'Причина отказа'}
                  multiline
                  rows={2}
                  value={refusedReasonOther}
                  onChange={(e) => setRefusedReasonOther(e.target.value)}
                />
              )}
            </>
          )}

          {mode === 'invoice_sent' && (
            <>
              <Typography variant="body2" color="text.secondary">
                Перед оформлением проверьте контактные данные — они понадобятся для создания ученика.
              </Typography>
              {REQUIRED_INVOICE_FIELDS.map((f) => (
                <TextField
                  key={f.key as string}
                  fullWidth
                  size="small"
                  label={f.label}
                  value={invoiceFields[f.key as string] || ''}
                  onChange={(e) => setInvoiceFields((prev) => ({ ...prev, [f.key as string]: e.target.value }))}
                />
              ))}
            </>
          )}

          {mode === 'demo_outcome' && (
            <>
              <DialogContentText>
                Отметьте, чем закончилась встреча/пробное — чтобы лид не завис в статусе «Состоялось».
              </DialogContentText>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={() => onPickDemoOutcome?.('thinking')}>
                  Думают
                </Button>
                <Button variant="outlined" onClick={() => onPickDemoOutcome?.('invoice_sent')}>
                  Готовы к оформлению
                </Button>
                <Button variant="outlined" color="error" onClick={() => onPickDemoOutcome?.('refused')}>
                  Отказ
                </Button>
              </Stack>
            </>
          )}

          {mode === 'convert_to_student' && (
            <DialogContentText>
              Лид будет переведён в ученики через существующий сценарий конвертации. Проверьте, что заполнены ФИО
              ученика, ФИО родителя, телефон, email, город и класс.
            </DialogContentText>
          )}

          {mode === 'later_confirm' && (
            <DialogContentText>
              Лид не дозвонился 3 раза подряд. Перевести его в «Возможно позже сами выйдут на связь»? Это не отказ —
              при обращении лид можно будет вернуть обратно в воронку.
            </DialogContentText>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Отмена
        </Button>
        {mode === 'convert_to_student' ? (
          <Button variant="contained" onClick={onConvertToStudent} disabled={submitting}>
            Создать ученика
          </Button>
        ) : mode === 'demo_outcome' ? null : (
          <Button variant="contained" onClick={handleConfirm} disabled={submitting}>
            Сохранить
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default LeadStageTransitionDialog;
