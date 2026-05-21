import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { communicationsApi, settingsApi } from '../services/api';
import { CommunicationQueueItem, CommunicationTemplate } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';
import { extractApiError } from '../utils/extractApiError';

const CHANNEL_OPTIONS: CommunicationTemplate['channel'][] = ['email', 'sms', 'max', 'telegram', 'web_push'];

const EVENT_OPTIONS = [
  'student_absent',
  'lesson_cancelled',
  'payment_reminder',
  'characteristic_approved',
  'parent_weekly_digest',
];

const emptyForm = {
  name: '',
  category: '',
  event_key: 'student_absent',
  channel: 'email' as CommunicationTemplate['channel'],
  subject: '',
  text: '',
  active: true,
};

const CommunicationsSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'communications.manage');
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [queue, setQueue] = useState<CommunicationQueueItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [queueStatusFilter, setQueueStatusFilter] = useState('');
  const [digestSettings, setDigestSettings] = useState({ enabled: true, weekday: 4, send_time: '09:00' });

  const loadData = useCallback(async () => {
    try {
      const [templatesData, queueData] = await Promise.all([
        communicationsApi.getTemplates(),
        communicationsApi.getQueue({ limit: 100, status: queueStatusFilter || undefined }),
      ]);
      setTemplates(templatesData);
      setQueue(queueData);
      try {
        const digest = await settingsApi.getParentWeeklyDigest();
        setDigestSettings(digest);
      } catch (_digestError) {
        // ignore non-blocking settings load failures
      }
      setError('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить Communication Hub'));
    }
  }, [queueStatusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map<string, CommunicationTemplate[]>();
    templates.forEach((item) => {
      const key = item.category || 'Без категории';
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    });
    return Array.from(groups.entries());
  }, [templates]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (item: CommunicationTemplate) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category || '',
      event_key: item.event_key || 'student_absent',
      channel: item.channel,
      subject: item.subject || '',
      text: item.text,
      active: item.active,
    });
  };

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        category: form.category.trim() || null,
        event_key: form.event_key.trim() || null,
        subject: form.subject.trim() || null,
        text: form.text.trim(),
        name: form.name.trim(),
      };
      if (editingId) {
        await communicationsApi.updateTemplate(editingId, payload);
      } else {
        await communicationsApi.createTemplate(payload);
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить шаблон'));
    } finally {
      setSaving(false);
    }
  };

  const previewSubject = form.subject.replace('{student_name}', 'Иван').replace('{amount}', '4500');
  const previewText = form.text
    .replace('{student_name}', 'Иван')
    .replace('{group_name}', 'Математика 5Б')
    .replace('{lesson_date}', '2026-05-15')
    .replace('{lesson_time}', '18:00')
    .replace('{trainer_name}', 'Анна Петрова')
    .replace('{amount}', '4500');

  const saveDigestSettings = async () => {
    try {
      const saved = await settingsApi.setParentWeeklyDigest(digestSettings);
      setDigestSettings(saved);
      setError('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить weekly digest.'));
    }
  };

  return (
    <Layout>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4">Communication Hub</Typography>
          <Typography variant="body2" color="text.secondary">
            Шаблоны каналов и журнал очереди отправок по ТЗ 5.1.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={2}>Weekly Digest для родителей</Typography>
          <Stack spacing={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body2">Включён</Typography>
              <Switch
                checked={digestSettings.enabled}
                onChange={(event) => setDigestSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
                disabled={!canManage}
              />
            </Box>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>День недели</InputLabel>
                <Select
                  label="День недели"
                  value={digestSettings.weekday}
                  onChange={(event) => setDigestSettings((prev) => ({ ...prev, weekday: Number(event.target.value) }))}
                  disabled={!canManage}
                >
                  <MenuItem value={0}>Понедельник</MenuItem>
                  <MenuItem value={1}>Вторник</MenuItem>
                  <MenuItem value={2}>Среда</MenuItem>
                  <MenuItem value={3}>Четверг</MenuItem>
                  <MenuItem value={4}>Пятница</MenuItem>
                  <MenuItem value={5}>Суббота</MenuItem>
                  <MenuItem value={6}>Воскресенье</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Время отправки"
                value={digestSettings.send_time}
                onChange={(event) => setDigestSettings((prev) => ({ ...prev, send_time: event.target.value }))}
                disabled={!canManage}
              />
            </Stack>
            <Box display="flex" gap={1}>
              <Button variant="contained" onClick={saveDigestSettings} disabled={!canManage}>
                Сохранить weekly digest
              </Button>
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={2}>Шаблон</Typography>
          {!canManage && (
            <Alert severity="info" sx={{ mb: 2 }}>
              У текущей роли есть просмотр журнала и шаблонов, но нет права на редактирование.
            </Alert>
          )}
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Название"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                disabled={!canManage}
              />
              <TextField
                fullWidth
                label="Категория"
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                disabled={!canManage}
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Событие</InputLabel>
                <Select
                  label="Событие"
                  value={form.event_key}
                  onChange={(event) => setForm((prev) => ({ ...prev, event_key: event.target.value }))}
                  disabled={!canManage}
                >
                  {EVENT_OPTIONS.map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Канал</InputLabel>
                <Select
                  label="Канал"
                  value={form.channel}
                  onChange={(event) => setForm((prev) => ({ ...prev, channel: event.target.value as CommunicationTemplate['channel'] }))}
                  disabled={!canManage}
                >
                  {CHANNEL_OPTIONS.map((item) => (
                    <MenuItem key={item} value={item}>{item}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <TextField
              fullWidth
              label="Subject"
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              disabled={!canManage}
            />
            <TextField
              fullWidth
              multiline
              minRows={5}
              label="Текст"
              value={form.text}
              onChange={(event) => setForm((prev) => ({ ...prev, text: event.target.value }))}
              disabled={!canManage}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Превью subject</Typography>
                <Typography variant="body1">{previewSubject || '—'}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Превью текста</Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{previewText || '—'}</Typography>
              </Box>
            </Stack>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body2">Активен</Typography>
              <Switch
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                disabled={!canManage}
              />
            </Box>
            <Box display="flex" gap={1}>
              <Button variant="contained" onClick={saveTemplate} disabled={!canManage || saving || !form.name.trim() || !form.text.trim()}>
                {editingId ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="outlined" onClick={resetForm}>
                Сбросить
              </Button>
            </Box>
          </Stack>
        </Paper>

        {groupedTemplates.map(([group, items]) => (
          <Paper key={group} sx={{ p: 2 }}>
            <Typography variant="h6" mb={1}>{group}</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell>Событие</TableCell>
                  <TableCell>Канал</TableCell>
                  <TableCell>Активен</TableCell>
                  <TableCell align="right">Действие</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.event_key || '—'}</TableCell>
                    <TableCell>{item.channel}</TableCell>
                    <TableCell>{item.active ? 'Да' : 'Нет'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => startEdit(item)}>
                        Открыть
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        ))}

        <Paper sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={2} flexWrap="wrap">
            <Typography variant="h6">Журнал отправок</Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Статус</InputLabel>
              <Select
                label="Статус"
                value={queueStatusFilter}
                onChange={(event) => setQueueStatusFilter(event.target.value)}
              >
                <MenuItem value="">Все</MenuItem>
                <MenuItem value="pending">pending</MenuItem>
                <MenuItem value="sending">sending</MenuItem>
                <MenuItem value="sent">sent</MenuItem>
                <MenuItem value="failed">failed</MenuItem>
                <MenuItem value="cancelled">cancelled</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Когда</TableCell>
                <TableCell>Получатель</TableCell>
                <TableCell>Канал</TableCell>
                <TableCell>Шаблон</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Попытки</TableCell>
                <TableCell>Ошибка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {queue.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                  <TableCell>{item.recipient_type} #{item.recipient_id}</TableCell>
                  <TableCell>{item.channel}</TableCell>
                  <TableCell>{item.template_name || item.template_id || '—'}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>{item.attempt_count}</TableCell>
                  <TableCell>{item.error || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Layout>
  );
};

export default CommunicationsSettingsPage;
