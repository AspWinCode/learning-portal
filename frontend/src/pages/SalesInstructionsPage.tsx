import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography, Alert } from '@mui/material';
import { salesInstructionsApi, salesInstructionImagesApi } from '../services/api';
import { SalesInstruction } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { RichTextEditor } from '../components/RichTextEditor';

const SalesInstructionsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdminLike = user?.role === 'admin' || user?.role === 'owner';

  const [items, setItems] = useState<SalesInstruction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);

  const resetDraft = () => {
    setEditingId(null);
    setDraftTitle('');
    setDraftBody('');
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesInstructionsApi.list();
      setItems(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось загрузить инструкции');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleEdit = (item?: SalesInstruction) => {
    if (!item) {
      setEditingId(null);
      setDraftTitle('');
      setDraftBody('');
      return;
    }
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftBody(item.body?.includes('<') ? item.body : (item.body || '').replace(/\n/g, '<br>'));
  };

  const stripHtml = (html: string) => (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').trim();

  const handleSave = async () => {
    if (!draftTitle.trim() || !stripHtml(draftBody)) {
      setError('Заполните заголовок и текст инструкции');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await salesInstructionsApi.update(editingId, { title: draftTitle.trim(), body: draftBody.trim() });
      } else {
        await salesInstructionsApi.create({ title: draftTitle.trim(), body: draftBody.trim() });
      }
      resetDraft();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось сохранить инструкцию');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить эту инструкцию?')) return;
    setSaving(true);
    setError(null);
    try {
      await salesInstructionsApi.remove(id);
      if (editingId === id) resetDraft();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось удалить инструкцию');
    } finally {
      setSaving(false);
    }
  };

  const handlePasteImage = useCallback(async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Можно загружать только изображения');
    }
    if (file.size > 400 * 1024) {
      throw new Error('Картинка слишком тяжёлая. Ограничение ~400KB.');
    }
    const res = await salesInstructionImagesApi.upload(file);
    return res.url;
  }, []);

  const handleInsertImageFromFile = async (file: File | null) => {
    if (!file) return;
    try {
      const url = await handlePasteImage(file);
      setDraftBody((prev) => (prev ? prev + `<p><img src="${url}" alt="" style="max-width:100%;height:auto;" /></p>` : `<p><img src="${url}" alt="" style="max-width:100%;height:auto;" /></p>`));
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Не удалось загрузить картинку');
    }
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Инструкции для продаж</Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Пока нет ни одной инструкции.
            </Typography>
          )}

          {items.map((it) => (
            <Card key={it.id} variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {it.title}
                </Typography>
                <Typography
                  variant="body2"
                  component="div"
                  sx={{ '& img': { maxWidth: '100%', height: 'auto' } }}
                  dangerouslySetInnerHTML={{ __html: it.body?.includes('<') ? it.body : (it.body || '').replace(/\n/g, '<br/>') }}
                />
                {isAdminLike && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" onClick={() => handleEdit(it)}>
                      Редактировать
                    </Button>
                    <Button size="small" color="error" onClick={() => handleDelete(it.id)}>
                      Удалить
                    </Button>
                  </Stack>
                )}
              </CardContent>
            </Card>
          ))}

          {isAdminLike && (
            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {editingId ? 'Редактировать инструкцию' : 'Новая инструкция'}
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Заголовок"
                    fullWidth
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                  />
                  <RichTextEditor
                    key={editingId ?? 'new'}
                    value={draftBody}
                    onChange={setDraftBody}
                    onPasteImage={handlePasteImage}
                    minHeight={280}
                    placeholder="Введите текст инструкции. Можно вставлять картинки через Ctrl+V."
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      component="label"
                      disabled={saving}
                    >
                      Добавить картинку
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0] || null;
                          await handleInsertImageFromFile(file);
                          e.target.value = '';
                        }}
                      />
                    </Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>
                      Сохранить
                    </Button>
                    {editingId && (
                      <Button variant="text" onClick={() => resetDraft()} disabled={saving}>
                        Отмена редактирования
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}
    </Layout>
  );
};

export default SalesInstructionsPage;

