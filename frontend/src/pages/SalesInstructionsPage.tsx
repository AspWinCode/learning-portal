import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography, Alert } from '@mui/material';
import { salesInstructionsApi } from '../services/api';
import { SalesInstruction } from '../types';
import { useAuth } from '../contexts/AuthContext';

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
    setDraftBody(item.body);
  };

  const handleSave = async () => {
    if (!draftTitle.trim() || !draftBody.trim()) {
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
                <Typography variant="body2" whiteSpace="pre-wrap">
                  {it.body}
                </Typography>
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
                  <TextField
                    label="Текст инструкции"
                    fullWidth
                    multiline
                    minRows={6}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                  />
                  <Stack direction="row" spacing={1}>
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

