import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import Layout from '../../components/Layout';
import { siteSettingsApi, SiteSettings } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

const EMPTY: SiteSettings = {
  site_title: '',
  site_description: '',
  contact_phone: '',
  contact_email: '',
  vk_url: '',
  tg_url: '',
  inst_url: '',
  ga_measurement_id: '',
  ym_counter_id: '',
  vk_pixel_id: '',
  updated_at: null,
};

const SiteSettingsPage: React.FC = () => {
  const [form, setForm] = useState<SiteSettings>(EMPTY);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    siteSettingsApi
      .get()
      .then((data) => setForm({ ...EMPTY, ...data }))
      .catch(() => setError('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, []);

  const f = (key: keyof SiteSettings) => ({
    value: (form[key] as string) || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value })),
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { updated_at, ...payload } = form;
      const saved = await siteSettingsApi.update(payload);
      setForm({ ...EMPTY, ...saved });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сохранить настройки'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ maxWidth: 720, mx: 'auto', p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            Настройки сайта
          </Typography>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
            disabled={saving}
            onClick={handleSave}
          >
            Сохранить
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Настройки сохранены. Примените при следующей публикации сайта.
          </Alert>
        )}

        <Paper sx={{ p: 0, mb: 2 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
            <Tab label="Аналитика" />
            <Tab label="Мета и контакты" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {tab === 0 && (
              <Stack spacing={3}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Google Analytics 4
                  </Typography>
                  <TextField
                    label="Measurement ID"
                    placeholder="G-XXXXXXXXXX"
                    {...f('ga_measurement_id')}
                    fullWidth
                    helperText="Найдёте в Google Analytics → Администратор → Потоки данных → ID измерения"
                    InputProps={{
                      startAdornment: <InputAdornment position="start">GA4</InputAdornment>,
                    }}
                  />
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Яндекс.Метрика
                  </Typography>
                  <TextField
                    label="Номер счётчика"
                    placeholder="12345678"
                    {...f('ym_counter_id')}
                    fullWidth
                    helperText="8-значный номер из кода счётчика Яндекс.Метрики"
                    InputProps={{
                      startAdornment: <InputAdornment position="start">YM</InputAdornment>,
                    }}
                  />
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    VK Pixel
                  </Typography>
                  <TextField
                    label="Pixel ID"
                    placeholder="VK-RTRG-000000-00000"
                    {...f('vk_pixel_id')}
                    fullWidth
                    helperText="ID пикселя из рекламного кабинета ВКонтакте"
                    InputProps={{
                      startAdornment: <InputAdornment position="start">VK</InputAdornment>,
                    }}
                  />
                </Box>

                <Alert severity="info" sx={{ mt: 1 }}>
                  Скрипты аналитики вставляются в <code>&lt;head&gt;</code> при публикации сайта. После сохранения нажмите «Опубликовать сайт».
                </Alert>
              </Stack>
            )}

            {tab === 1 && (
              <Stack spacing={2}>
                <Typography variant="subtitle2">Мета-информация сайта</Typography>
                <TextField
                  label="Название сайта"
                  placeholder="TirSkix Academy — онлайн-школа программирования"
                  {...f('site_title')}
                  fullWidth
                  helperText="Используется в тэге <title> и футере"
                />
                <TextField
                  label="Описание сайта (meta description)"
                  placeholder="Онлайн-школа программирования для детей 10–18 лет..."
                  {...f('site_description')}
                  fullWidth
                  multiline
                  minRows={2}
                  inputProps={{ maxLength: 300 }}
                  helperText={`${(form.site_description || '').length}/300 — показывается в поисковой выдаче`}
                />

                <Divider sx={{ my: 1 }} />

                <Typography variant="subtitle2">Контакты</Typography>
                <TextField
                  label="Телефон"
                  placeholder="+7 (999) 123-45-67"
                  {...f('contact_phone')}
                  fullWidth
                />
                <TextField
                  label="Email"
                  placeholder="info@tirskix.space"
                  {...f('contact_email')}
                  fullWidth
                />

                <Divider sx={{ my: 1 }} />

                <Typography variant="subtitle2">Социальные сети (ссылки в футере)</Typography>
                <TextField label="ВКонтакте" placeholder="https://vk.com/tirskix" {...f('vk_url')} fullWidth />
                <TextField label="Telegram" placeholder="https://t.me/tirskix" {...f('tg_url')} fullWidth />
                <TextField label="Instagram" placeholder="https://instagram.com/tirskix" {...f('inst_url')} fullWidth />
              </Stack>
            )}
          </Box>
        </Paper>
      </Box>
    </Layout>
  );
};

export default SiteSettingsPage;
