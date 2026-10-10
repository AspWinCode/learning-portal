import React, { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { groupsApi } from '../services/api';
import { MaxGroupLink } from '../types';
import { extractApiError } from '../utils/extractApiError';

export default function MaxGroupDialog({ open, groupId, groupName, canManage, onClose, onChanged }: {
  open: boolean; groupId: number | null; groupName: string; canManage: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const [link, setLink] = useState<MaxGroupLink | null>(null);
  const [chatId, setChatId] = useState('');
  const [text, setText] = useState('');
  const [verified, setVerified] = useState<MaxGroupLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || groupId == null) return;
    setError(''); setChatId(''); setVerified(null); setText('');
    groupsApi.getMaxLink(groupId).then(setLink).catch((e) => setError(extractApiError(e, 'Не удалось загрузить статус MAX')));
  }, [open, groupId]);

  const verify = async () => {
    if (!groupId || !chatId.trim()) return;
    setBusy(true); setError('');
    try { setVerified(await groupsApi.verifyMax(groupId, chatId.trim())); }
    catch (e) { setError(extractApiError(e, 'Чат не найден или бот не имеет доступа')); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    if (!groupId || !verified) return;
    setBusy(true); setError('');
    try { setLink(await groupsApi.connectMax(groupId, verified.chat_id)); setVerified(null); setChatId(''); onChanged?.(); }
    catch (e) { setError(extractApiError(e, 'Не удалось подключить чат')); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!groupId || !window.confirm(`Отключить чат MAX от группы «${groupName}»?`)) return;
    setBusy(true); setError('');
    try { await groupsApi.disconnectMax(groupId); setLink(null); onChanged?.(); }
    catch (e) { setError(extractApiError(e, 'Не удалось отключить чат')); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!groupId || !text.trim()) return;
    if (!window.confirm(`Отправить сообщение в чат «${link?.chat_title || groupName}»?`)) return;
    setBusy(true); setError('');
    try { await groupsApi.sendMax(groupId, text.trim()); setText(''); }
    catch (e) { setError(extractApiError(e, 'Не удалось отправить сообщение')); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>MAX — {groupName}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary">Сначала создайте чат в MAX и добавьте туда бота.</Typography>
        {link?.connected ? <>
          <Alert severity="success">MAX подключён: {link.chat_title || link.chat_id}</Alert>
          <TextField label="Сообщение в MAX" value={text} onChange={(e) => setText(e.target.value.slice(0, 4000))} multiline rows={4} fullWidth helperText={`${text.length} / 4000`} />
          <Button variant="contained" onClick={send} disabled={busy || !text.trim()}>Отправить сообщение</Button>
          {canManage && <Button color="error" variant="outlined" onClick={disconnect} disabled={busy}>Отключить MAX</Button>}
        </> : canManage ? <>
          <TextField label="ID чата MAX" value={chatId} onChange={(e) => setChatId(e.target.value)} fullWidth />
          {verified && <Alert severity="success">Найден чат: {verified.chat_title || verified.chat_id}</Alert>}
          <Stack direction="row" spacing={1}><Button variant="outlined" onClick={verify} disabled={busy || !chatId.trim()}>Проверить</Button><Button variant="contained" onClick={connect} disabled={busy || !verified}>Подключить</Button></Stack>
        </> : <Alert severity="info">MAX-чат не подключён.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Закрыть</Button></DialogActions>
  </Dialog>;
}
