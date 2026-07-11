import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import PermMediaIcon from '@mui/icons-material/PermMedia';
import Layout from '../../components/Layout';
import NotesEditor from '../../components/NotesEditor';
import MediaLibraryDialog from '../../components/MediaLibraryDialog';
import { seoApi, SeoPage, SeoPagePayload, SeoPageStatus } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const EMPTY_FORM: SeoPagePayload = {
  title: '',
  slug: '',
  status: 'draft',
  h1: '',
  content: '',
  seo_title: '',
  seo_description: '',
  canonical: '',
  robots: '',
  og_title: '',
  og_description: '',
  og_image: '',
};

const SeoPageEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { pageId } = useParams<{ pageId: string }>();
  const isNew = !pageId || pageId === 'new';

  const [form, setForm] = useState<SeoPagePayload>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      return;
    }
    const load = async () => {
      try {
        const page: SeoPage = await seoApi.getPage(Number(pageId));
        setForm({
          title: page.title,
          slug: page.slug,
          status: page.status,
          h1: page.h1 || '',
          content: page.content || '',
          seo_title: page.seo_title || '',
          seo_description: page.seo_description || '',
          canonical: page.canonical || '',
          robots: page.robots || '',
          og_title: page.og_title || '',
          og_description: page.og_description || '',
          og_image: page.og_image || '',
        });
        setSlugTouched(true);
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось загрузить страницу'));
      }
    };
    load();
  }, [pageId, isNew]);

  const handleTitleChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  };

  const handleSave = async (status?: SeoPageStatus) => {
    setSaving(true);
    setError(null);
    try {
      const payload: SeoPagePayload = { ...form, slug: slugify(form.slug), status: status || form.status };
      if (isNew) {
        const created = await seoApi.createPage(payload);
        navigate(`/seo/pages/${created.id}`, { replace: true });
      } else {
        await seoApi.updatePage(Number(pageId), payload);
        setForm((prev) => ({ ...prev, status: payload.status }));
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить страницу'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">{isNew ? 'Новая страница' : 'Редактирование страницы'}</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => navigate('/seo/pages')}>
            Назад
          </Button>
          <Button variant="outlined" disabled={saving} onClick={() => handleSave('draft')}>
            Сохранить черновик
          </Button>
          <Button variant="contained" disabled={saving} onClick={() => handleSave('published')}>
            Опубликовать
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Название страницы"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            fullWidth
          />
          <TextField
            label="URL (slug)"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setForm((prev) => ({ ...prev, slug: e.target.value }));
            }}
            helperText="Только латиница, цифры и дефис, например: o-shkole"
            fullWidth
          />
        </Stack>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Контент" />
          <Tab label="SEO-настройки" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <TextField
              label="H1"
              value={form.h1 || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, h1: e.target.value }))}
              fullWidth
              sx={{ mb: 2 }}
            />
            <NotesEditor
              value={form.content || ''}
              onChange={(html) => setForm((prev) => ({ ...prev, content: html }))}
              placeholder="Содержимое страницы…"
            />
          </Box>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            <TextField
              label="SEO Title"
              value={form.seo_title || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, seo_title: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Meta Description"
              value={form.seo_description || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, seo_description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Canonical URL"
              value={form.canonical || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, canonical: e.target.value }))}
              fullWidth
            />
            <TextField
              select
              label="Robots"
              value={form.robots || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, robots: e.target.value }))}
              fullWidth
            >
              <MenuItem value="">По умолчанию</MenuItem>
              <MenuItem value="index, follow">index, follow</MenuItem>
              <MenuItem value="noindex, follow">noindex, follow</MenuItem>
              <MenuItem value="noindex, nofollow">noindex, nofollow</MenuItem>
            </TextField>
            <TextField
              label="OG Title"
              value={form.og_title || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, og_title: e.target.value }))}
              fullWidth
            />
            <TextField
              label="OG Description"
              value={form.og_description || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, og_description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                label="OG Image URL"
                value={form.og_image || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, og_image: e.target.value }))}
                fullWidth
              />
              <Button
                variant="outlined"
                startIcon={<PermMediaIcon />}
                sx={{ mt: '2px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => setMediaOpen(true)}
              >
                Галерея
              </Button>
            </Box>
          </Stack>
        )}
      </Paper>

      <MediaLibraryDialog
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(url) => setForm((prev) => ({ ...prev, og_image: url }))}
      />
    </Layout>
  );
};

export default SeoPageEditPage;
