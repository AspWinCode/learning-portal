import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { blogApi, BlogPost, BlogPostPayload, BlogCategory, BlogTag } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const EMPTY_FORM: BlogPostPayload = {
  title: '',
  slug: '',
  status: 'draft',
  excerpt: '',
  content: '',
  cover_image: '',
  seo_title: '',
  seo_description: '',
  og_title: '',
  og_description: '',
  og_image: '',
  canonical: '',
  category_id: null,
  tag_ids: [],
};

const BlogPostEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const isNew = !postId || postId === 'new';

  const [form, setForm] = useState<BlogPostPayload>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<'cover_image' | 'og_image'>('cover_image');

  useEffect(() => {
    blogApi.listCategories().then(setCategories).catch(() => {});
    blogApi.listTags().then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      return;
    }
    const load = async () => {
      try {
        const post: BlogPost = await blogApi.getPost(Number(postId));
        setForm({
          title: post.title,
          slug: post.slug,
          status: post.status,
          excerpt: post.excerpt || '',
          content: post.content || '',
          cover_image: post.cover_image || '',
          seo_title: post.seo_title || '',
          seo_description: post.seo_description || '',
          og_title: post.og_title || '',
          og_description: post.og_description || '',
          og_image: post.og_image || '',
          canonical: post.canonical || '',
          category_id: post.category_id ?? null,
          tag_ids: post.tags.map((t) => t.id),
        });
        setSlugTouched(true);
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось загрузить пост'));
      }
    };
    load();
  }, [postId, isNew]);

  const handleTitleChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  };

  const handleSave = async (status?: 'draft' | 'published') => {
    setSaving(true);
    setError(null);
    try {
      const payload: BlogPostPayload = {
        ...form,
        slug: slugify(form.slug),
        status: status || form.status,
      };
      if (isNew) {
        const created = await blogApi.createPost(payload);
        navigate(`/blog/posts/${created.id}`, { replace: true });
      } else {
        await blogApi.updatePost(Number(postId), payload);
        setForm((prev) => ({ ...prev, status: payload.status }));
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить пост'));
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (tagId: number) => {
    setForm((prev) => {
      const current = prev.tag_ids || [];
      return {
        ...prev,
        tag_ids: current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
      };
    });
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">{isNew ? 'Новый пост' : 'Редактирование поста'}</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => navigate('/blog/posts')}>
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
            label="Заголовок"
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
            helperText="Только латиница, цифры и дефис, например: pochemu-matematika-vazna"
            fullWidth
          />
        </Stack>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Контент" />
          <Tab label="SEO-настройки" />
          <Tab label="Категория и теги" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <TextField
              label="Краткое описание (excerpt)"
              value={form.excerpt || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              sx={{ mb: 2 }}
              inputProps={{ maxLength: 500 }}
              helperText={`${(form.excerpt || '').length}/500`}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
              <TextField
                label="URL обложки"
                value={form.cover_image || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, cover_image: e.target.value }))}
                fullWidth
              />
              <Button
                variant="outlined"
                startIcon={<PermMediaIcon />}
                sx={{ mt: '2px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => { setMediaTarget('cover_image'); setMediaOpen(true); }}
              >
                Галерея
              </Button>
            </Box>
            {form.cover_image && (
              <Box sx={{ mb: 2 }}>
                <img
                  src={form.cover_image}
                  alt="preview"
                  style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 4, objectFit: 'cover' }}
                />
              </Box>
            )}
            <NotesEditor
              value={form.content || ''}
              onChange={(html) => setForm((prev) => ({ ...prev, content: html }))}
              placeholder="Текст поста…"
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
              inputProps={{ maxLength: 255 }}
            />
            <TextField
              label="Meta Description"
              value={form.seo_description || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, seo_description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              inputProps={{ maxLength: 500 }}
            />
            <TextField
              label="Canonical URL"
              value={form.canonical || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, canonical: e.target.value }))}
              fullWidth
            />
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
                onClick={() => { setMediaTarget('og_image'); setMediaOpen(true); }}
              >
                Галерея
              </Button>
            </Box>
          </Stack>
        )}

        {tab === 2 && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Категория
              </Typography>
              <TextField
                select
                value={form.category_id ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    category_id: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                fullWidth
                size="small"
              >
                <MenuItem value="">Без категории</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Теги
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {tags.map((tag) => {
                  const selected = (form.tag_ids || []).includes(tag.id);
                  return (
                    <Chip
                      key={tag.id}
                      label={tag.name}
                      onClick={() => toggleTag(tag.id)}
                      color={selected ? 'primary' : 'default'}
                      variant={selected ? 'filled' : 'outlined'}
                      size="small"
                    />
                  );
                })}
                {tags.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Теги не созданы
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
        )}
      </Paper>

      <MediaLibraryDialog
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(url) => setForm((prev) => ({ ...prev, [mediaTarget]: url }))}
      />
    </Layout>
  );
};

export default BlogPostEditPage;
