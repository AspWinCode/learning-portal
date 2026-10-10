import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { groupsApi, maxApi } from '../services/api';
import { Group, MaxBroadcast } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';

export default function MaxBroadcastsSubTab() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]); const [selected, setSelected] = useState<number[]>([]);
  const [text, setText] = useState(''); const [scope, setScope] = useState<'active_groups' | 'selected_groups'>('active_groups');
  const [history, setHistory] = useState<MaxBroadcast[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const canBroadcast = hasPermission(user, 'communications.broadcast');
  const load = async () => { try { const [gs, hs] = await Promise.all([groupsApi.getAll(), maxApi.listBroadcasts()]); setGroups(gs.filter((g) => g.status === 'active')); setHistory(hs); } catch (e) { setError(extractApiError(e, 'Не удалось загрузить MAX')); } };
  useEffect(() => { load(); }, []);
  const send = async () => {
    const ids = scope === 'selected_groups' ? selected : undefined; const count = scope === 'selected_groups' ? selected.length : groups.length;
    if (!text.trim() || !count) return;
    if (!window.confirm(`Вы собираетесь отправить сообщение в ${count} MAX-чатов.`)) return;
    setBusy(true); setError('');
    try { await maxApi.createBroadcast({ scope, group_ids: ids, text: text.trim() }); setText(''); await load(); }
    catch (e) { setError(extractApiError(e, 'Не удалось создать рассылку')); } finally { setBusy(false); }
  };
  if (!canBroadcast) return <Alert severity="info">У вас нет права на массовые рассылки в MAX.</Alert>;
  return <Stack spacing={2}>
    <Typography variant="h6">Рассылка в MAX</Typography>
    <Stack direction="row" spacing={2}>
      <FormControlLabel control={<Checkbox checked={scope === 'active_groups'} onChange={() => setScope('active_groups')} />} label={`Все активные группы (${groups.length})`} />
      <FormControlLabel control={<Checkbox checked={scope === 'selected_groups'} onChange={() => setScope('selected_groups')} />} label="Выбранные группы" />
    </Stack>
    {scope === 'selected_groups' && <Box>{groups.map((g) => <FormControlLabel key={g.id} control={<Checkbox checked={selected.includes(g.id)} onChange={(e) => setSelected((v) => e.target.checked ? [...v, g.id] : v.filter((id) => id !== g.id))} />} label={g.name} />)}</Box>}
    <TextField label="Сообщение" value={text} onChange={(e) => setText(e.target.value.slice(0, 4000))} multiline rows={4} fullWidth helperText={`${text.length} / 4000`} />
    <Button variant="contained" onClick={send} disabled={busy || !text.trim()}>Отправить</Button>
    {error && <Alert severity="error">{error}</Alert>}
    <Typography variant="h6" sx={{ mt: 2 }}>История</Typography>
    {history.map((h) => <Box key={h.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Typography>{new Date(h.created_at).toLocaleString('ru-RU')} — {h.total_targets} чатов</Typography><Typography variant="body2">Успешно: {h.success_count}, ошибок: {h.failed_count}, статус: {h.status}</Typography><Typography variant="body2" color="text.secondary">{h.text}</Typography>{h.failed_count > 0 && <Button size="small" onClick={async () => { await maxApi.retryFailed(h.id); await load(); }}>Повторить только ошибки</Button>}</Box>)}
  </Stack>;
}
