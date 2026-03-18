import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import { smsApi, SmsMessageResponse, SmsTemplateResponse } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const SMS_MAX_LENGTH = 500;

export interface SendSMSModalProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  /** Номер по умолчанию (E.164 или любой) */
  phone?: string;
  /** Контекст для истории и записи */
  entityType?: 'lead' | 'event' | 'task';
  entityId?: number;
}

export const SendSMSModal: React.FC<SendSMSModalProps> = ({
  open,
  onClose,
  onSent,
  phone: initialPhone = '',
  entityType,
  entityId,
}) => {
  const [phone, setPhone] = useState(initialPhone);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<SmsTemplateResponse[]>([]);
  const [history, setHistory] = useState<SmsMessageResponse[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const list = await smsApi.listTemplates({ active_only: true });
      setTemplates(list);
    } catch {
      setTemplates([]);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const params: { entity_type?: string; entity_id?: number; phone?: string } = {};
      if (entityType) params.entity_type = entityType;
      if (entityId != null) params.entity_id = entityId;
      if (phone.trim()) params.phone = phone.trim();
      const list = await smsApi.getHistory(Object.keys(params).length ? params : undefined);
      setHistory(list);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [open, entityType, entityId, phone]);

  useEffect(() => {
    if (open) {
      setPhone(initialPhone);
      setMessage('');
      setTemplateId('');
      setScheduledAt('');
      setError(null);
      loadTemplates();
    }
  }, [open, initialPhone, loadTemplates]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (templateId && templates.length) {
      const t = templates.find((x) => x.id === templateId);
      if (t) setMessage(t.text);
    }
  }, [templateId, templates]);

  const handleSend = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError('Введите номер телефона');
      return;
    }
    if (!message.trim()) {
      setError('Введите текст сообщения');
      return;
    }
    if (message.length > SMS_MAX_LENGTH) {
      setError(`Не более ${SMS_MAX_LENGTH} символов`);
      return;
    }
    let scheduledAtIso: string | null = null;
    if (scheduledAt) {
      const dt = new Date(scheduledAt);
      if (isNaN(dt.getTime()) || dt <= new Date()) {
        setError('Время отложенной отправки должно быть в будущем');
        return;
      }
      scheduledAtIso = dt.toISOString();
    }
    setError(null);
    setSending(true);
    try {
      await smsApi.send({
        phone: trimmedPhone,
        message: message.trim(),
        entity_type: entityType,
        entity_id: entityId,
        scheduled_at: scheduledAtIso,
      });
      onSent?.();
      setMessage('');
      loadHistory();
      onClose();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось отправить SMS'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Отправить SMS</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField
            label="Номер телефона"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+79991234567"
            fullWidth
            size="small"
          />
          <FormControl fullWidth size="small">
            <InputLabel id="sms-template-label">Шаблон</InputLabel>
            <Select
              labelId="sms-template-label"
              label="Шаблон"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value === '' ? '' : (e.target.value as number))}
            >
              <MenuItem value="">Без шаблона</MenuItem>
              {templates.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Текст сообщения"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, SMS_MAX_LENGTH))}
            multiline
            rows={4}
            fullWidth
            size="small"
            helperText={`${message.length} / ${SMS_MAX_LENGTH}`}
          />
          <TextField
            label="Отложенная отправка (необязательно)"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: new Date(Date.now() + 60000).toISOString().slice(0, 16) }}
            helperText={scheduledAt ? 'Сообщение будет отправлено в указанное время' : 'Оставьте пустым для немедленной отправки'}
          />
          {error && <Alert severity="error">{error}</Alert>}

          <Typography variant="subtitle2" color="text.secondary">
            История сообщений
          </Typography>
          {loading ? (
            <Stack alignItems="center" py={2}>
              <CircularProgress size={24} />
            </Stack>
          ) : history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Нет отправленных SMS по этому контексту
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 200, overflow: 'auto', bgcolor: 'action.hover', borderRadius: 1 }}>
              {history.slice(0, 10).map((h) => (
                <ListItem key={h.id}>
                  <ListItemText
                    primary={h.message.slice(0, 80) + (h.message.length > 80 ? '…' : '')}
                    secondary={
                      <>
                        {h.phone} — {h.status === 'sent' ? 'отправлено' : h.status}{' '}
                        {h.created_at && isValid(parseISO(h.created_at))
                          ? format(parseISO(h.created_at), 'dd.MM.yyyy HH:mm')
                          : ''}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" onClick={handleSend} disabled={sending}>
          {sending ? 'Отправка…' : scheduledAt ? 'Запланировать' : 'Отправить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
