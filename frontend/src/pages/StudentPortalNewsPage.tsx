import React, { useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { api as apiClient } from '../services/api/client';
import type { StudentNewsItem } from '../services/studentPortalApi';
import {
  Alert, Box, Button, Checkbox, Divider, FormControlLabel, IconButton, Paper, Stack, TextField, Typography,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';

const emptyHtml = '<p>Напишите новость для учеников…</p>';

const StudentPortalNewsPage: React.FC = () => {
  const [items, setItems] = useState<StudentNewsItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📣');
  const [published, setPublished] = useState(true);
  const [html, setHtml] = useState(emptyHtml);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Placeholder.configure({ placeholder: 'Текст новости…' })],
    content: html,
    onUpdate: ({ editor: current }) => setHtml(current.getHTML()),
  });

  const selectItem = (item: StudentNewsItem) => {
    setSelectedId(item.id); setTitle(item.title); setEmoji(item.emoji); setPublished(item.is_published); setHtml(item.content_html);
    editor?.commands.setContent(item.content_html);
  };
  const newItem = () => {
    setSelectedId(null); setTitle(''); setEmoji('📣'); setPublished(true); setHtml(emptyHtml); editor?.commands.setContent(emptyHtml);
  };
  useEffect(() => {
    apiClient.get('/api/student-portal/admin/news').then((r) => setItems(r.data)).catch(() => setMessage('Не удалось загрузить новости')).finally(() => setLoading(false));
  }, []);
  const currentItems = useMemo(() => items.filter((item) => item.id !== selectedId), [items, selectedId]);

  const save = async () => {
    if (!title.trim() || !editor) return;
    setSaving(true); setMessage(null);
    const next: StudentNewsItem = { id: selectedId ?? Date.now(), title: title.trim(), emoji: emoji || '📣', content_html: editor.getHTML(), published_at: selectedId ? (items.find((i) => i.id === selectedId)?.published_at ?? new Date().toISOString()) : new Date().toISOString(), is_published: published };
    try {
      const response = await apiClient.put('/api/student-portal/admin/news', { items: [next, ...currentItems] });
      setItems(response.data); selectItem(response.data.find((item: StudentNewsItem) => item.id === next.id)); setMessage('Новость сохранена');
    } catch { setMessage('Не удалось сохранить новость'); } finally { setSaving(false); }
  };
  const remove = async (id: number) => {
    const response = await apiClient.put('/api/student-portal/admin/news', { items: items.filter((item) => item.id !== id) });
    setItems(response.data); if (selectedId === id) newItem();
  };

  return <Box sx={{ maxWidth: 1180, mx: 'auto', p: { xs: 2, md: 4 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}>
      <Box><Typography variant="h4">Новости для учеников</Typography><Typography color="text.secondary">Публикации появятся в правой ленте кабинета ученика — свежие сверху.</Typography></Box>
      <Button startIcon={<AddIcon />} variant="contained" onClick={newItem}>Новая новость</Button>
    </Stack>
    {message && <Alert sx={{ mb: 2 }} severity={message.includes('сохранена') ? 'success' : 'error'}>{message}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 1.5, alignSelf: 'start' }}>
        <Typography variant="subtitle2" sx={{ px: 1, pb: 1 }}>Опубликованные и черновики</Typography>
        {loading ? <Typography color="text.secondary" sx={{ p: 1 }}>Загрузка…</Typography> : items.length === 0 ? <Typography color="text.secondary" sx={{ p: 1 }}>Новостей пока нет</Typography> : items.map((item) => <Stack key={item.id} direction="row" alignItems="center" gap={.5} sx={{ p: 1, borderRadius: 1, bgcolor: selectedId === item.id ? 'action.selected' : 'transparent' }}><Button fullWidth sx={{ justifyContent: 'flex-start', textAlign: 'left', color: 'text.primary' }} onClick={() => selectItem(item)}><span style={{ marginRight: 8 }}>{item.emoji}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Без заголовка'}</span></Button><IconButton size="small" aria-label="Удалить" onClick={() => remove(item.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Stack>)}
      </Paper>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction="row" gap={1.5} alignItems="center"><TextField label="Эмодзи" value={emoji} onChange={(e) => setEmoji(e.target.value)} sx={{ width: 110 }} /><TextField label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required /></Stack>
        <Stack direction="row" gap={.5} sx={{ mt: 2, p: .5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <IconButton size="small" onClick={() => editor?.chain().focus().toggleBold().run()}><FormatBoldIcon /></IconButton><IconButton size="small" onClick={() => editor?.chain().focus().toggleItalic().run()}><FormatItalicIcon /></IconButton><IconButton size="small" onClick={() => editor?.chain().focus().toggleBulletList().run()}><FormatListBulletedIcon /></IconButton>
        </Stack>
        <Box sx={{ mt: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 2, minHeight: 220, '& .ProseMirror': { outline: 'none', minHeight: 180, '& p': { my: 1 }, '& h2, & h3': { mt: 1.5, mb: .75 } } }}><EditorContent editor={editor} /></Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}><FormControlLabel control={<Checkbox checked={published} onChange={(e) => setPublished(e.target.checked)} />} label="Показывать ученикам" /><Button variant="contained" onClick={save} disabled={saving || !title.trim()}>{saving ? 'Сохраняем…' : 'Сохранить новость'}</Button></Stack>
      </Paper>
    </Box>
  </Box>;
};

export default StudentPortalNewsPage;
