import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import Layout from '../../components/Layout';
import api from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

interface SiteStatus {
  status: 'never' | 'published' | 'queued';
  message: string;
  built_at?: string | null;
}

const SitePublishPage: React.FC = () => {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const r = await api.get('/public-site/status');
      setStatus(r.data);
    } catch {
      // silent — status endpoint may not respond before first publish
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/public-site/publish');
      setSuccess('Генерация сайта запущена. Обычно занимает несколько секунд.');
      // Poll status after short delay
      setTimeout(() => loadStatus(), 3000);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось запустить генерацию сайта'));
    } finally {
      setPublishing(false);
    }
  };

  const statusColor = status?.status === 'published' ? 'success' : status?.status === 'queued' ? 'warning' : 'default';
  const statusLabel = status?.status === 'published' ? 'Опубликован' : status?.status === 'queued' ? 'Генерируется…' : 'Не публиковался';

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Публикация сайта</Typography>
        <Chip
          icon={status?.status === 'published' ? <CheckCircleIcon /> : <ScheduleIcon />}
          label={statusLabel}
          color={statusColor as any}
          variant="outlined"
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* Publish action */}
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Опубликовать сайт</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Генерирует статический HTML из всех опубликованных страниц и постов блога и обновляет публичный сайт академии.
          </Typography>
          {status?.built_at && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Последняя публикация: <strong>{new Date(status.built_at).toLocaleString('ru-RU')}</strong>
            </Typography>
          )}
          <Button
            variant="contained"
            size="large"
            startIcon={publishing ? <CircularProgress size={18} color="inherit" /> : <RocketLaunchIcon />}
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? 'Запускаем…' : 'Опубликовать сайт'}
          </Button>
        </Paper>

        <Divider />

        {/* What gets published */}
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Что публикуется</Typography>
          <Stack spacing={1.5}>
            {[
              { label: 'Главная страница', desc: 'Лендинг с треками, отзывами, блогом и формой записи' },
              { label: 'SEO-страницы', desc: 'Все страницы со статусом «Опубликована» (slug → /slug.html)' },
              { label: 'Блог', desc: 'Список постов (/blog/) и каждый пост (/blog/slug.html)' },
              { label: 'Статические ресурсы', desc: 'Логотипы, фавикон (/static/)' },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', gap: 1 }}>
                <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18, mt: 0.3, flexShrink: 0 }} />
                <Box>
                  <Typography variant="body2" fontWeight={600}>{item.label}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>

        {/* Tip */}
        <Alert severity="info">
          После публикации изменения появятся на сайте мгновенно — Caddy отдаёт обновлённые файлы без перезапуска.
        </Alert>
      </Stack>
    </Layout>
  );
};

export default SitePublishPage;
