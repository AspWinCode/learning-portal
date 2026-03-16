import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Alert,
} from '@mui/material';
import { maxApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const MAX_MESSAGE_LIMIT = 4000;

export interface SendMaxModalProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  /** ID лида (для сохранения max_user_id и контекста) */
  leadId?: number;
  /** MAX user_id получателя (из лида или ввод вручную) */
  initialMaxUserId?: number | null;
  /** Телефон получателя (для отправки по номеру в GREEN-API) */
  initialPhone?: string | null;
}

export const SendMaxModal: React.FC<SendMaxModalProps> = ({
  open,
  onClose,
  onSent,
  leadId,
  initialMaxUserId,
  initialPhone,
}) => {
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [maxUserId, setMaxUserId] = useState(
    initialMaxUserId != null ? String(initialMaxUserId) : '',
  );
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [personalMode, setPersonalMode] = useState(false);
  const [personalProvider, setPersonalProvider] = useState<'greenapi' | 'api_messenger' | null>(null);

  useEffect(() => {
    if (open) {
      setPhone(initialPhone ?? '');
      setMaxUserId(initialMaxUserId != null ? String(initialMaxUserId) : '');
      setMessage('');
      setError(null);
      maxApi.isConfigured().then((r) => {
        setNotConfigured(!r.configured);
        setPersonalMode(!!r.personal);
        setPersonalProvider(r.personal_provider ?? null);
      }).catch(() => setNotConfigured(true));
    }
  }, [open, initialMaxUserId, initialPhone]);

  const handleSend = async () => {
    const phoneTrim = phone.trim();
    const uid = maxUserId.trim();
    const num = uid ? parseInt(uid, 10) : undefined;
    const canSendByPhone = personalProvider === 'greenapi' && phoneTrim.length >= 10;

    if (!message.trim()) {
      setError('Введите текст сообщения');
      return;
    }
    if (message.length > MAX_MESSAGE_LIMIT) {
      setError(`Не более ${MAX_MESSAGE_LIMIT} символов`);
      return;
    }
    if (!canSendByPhone && (!num || Number.isNaN(num))) {
      setError(
        personalProvider === 'greenapi'
          ? 'Введите номер телефона получателя или MAX user_id'
          : 'Введите MAX user_id получателя (число из профиля в MAX)',
      );
      return;
    }
    setError(null);
    setSending(true);
    try {
      await maxApi.send({
        lead_id: leadId,
        ...(canSendByPhone ? { phone: phoneTrim } : { max_user_id: num }),
        message: message.trim(),
      });
      onSent?.();
      setMessage('');
      onClose();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось отправить в MAX'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Отправить в MAX</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {notConfigured && (
            <Alert severity="warning">MAX не настроен (токен бота или личного аккаунта в настройках сервера).</Alert>
          )}
          {!notConfigured && personalMode && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Сообщения отправляются от вашего личного аккаунта (получатель видит вас, а не бота). QR для привязки — в Настройках.
            </Alert>
          )}
          {personalProvider === 'greenapi' && (
            <TextField
              label="Телефон получателя"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 999 123-45-67"
              fullWidth
              size="small"
              helperText="Для GREEN-API можно отправить по номеру (РФ/РБ)"
            />
          )}
          <TextField
            label={personalProvider === 'greenapi' ? 'MAX user_id (если известен)' : 'MAX user_id получателя'}
            value={maxUserId}
            onChange={(e) => setMaxUserId(e.target.value)}
            placeholder="Число из профиля пользователя в MAX"
            fullWidth
            size="small"
            type="number"
            inputProps={{ min: 1 }}
            helperText={leadId ? 'Можно указать один раз — сохранится в карточке лида' : undefined}
          />
          <TextField
            label="Текст сообщения"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LIMIT))}
            multiline
            rows={4}
            fullWidth
            size="small"
            helperText={`${message.length} / ${MAX_MESSAGE_LIMIT}`}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" onClick={handleSend} disabled={sending || notConfigured}>
          {sending ? 'Отправка…' : 'Отправить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
