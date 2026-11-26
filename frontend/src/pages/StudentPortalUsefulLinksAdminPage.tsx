import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import SaveIcon from '@mui/icons-material/Save';
import { studentPortalAdminApi } from '../services/api';

type LinkItem = { id: number; title: string; url: string; description?: string | null };

const StudentPortalUsefulLinksAdminPage: React.FC = () => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [draft, setDraft] = useState({ title: '', url: '', description: '' });
  const [showAbonement, setShowAbonement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { studentPortalAdminApi.getPortalSettings().then((settings) => { setLinks(settings.useful_links || []); setShowAbonement(settings.show_abonement); }).catch(() => setMessage('Не удалось загрузить ссылки')).finally(() => setLoading(false)); }, []);
  const update = (index: number, field: keyof LinkItem, value: string) => setLinks((items) => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  const add = () => { if (!draft.title.trim() || !/^https?:\/\//i.test(draft.url.trim())) { setMessage('Укажите название и URL в формате https://...'); return; } setLinks((items) => [...items, { id: Date.now(), title: draft.title.trim(), url: draft.url.trim(), description: draft.description.trim() || null }]); setDraft({ title: '', url: '', description: '' }); setMessage(null); };
  const save = async () => { setSaving(true); setMessage(null); try { await studentPortalAdminApi.updatePortalSettings({ show_abonement: showAbonement, useful_links: links }); setMessage('Ссылки сохранены — они появились у всех учеников.'); } catch { setMessage('Не удалось сохранить ссылки'); } finally { setSaving(false); } };

  return <Box sx={{ maxWidth: 1180, mx: 'auto', p: { xs: 2, md: 4 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}><Box><Typography variant="h4" sx={{ fontWeight: 800 }}>Полезные ссылки ученикам</Typography><Typography color="text.secondary">Одна общая витрина для всех учеников. Добавьте ссылку один раз — она появится у каждого в кабинете.</Typography></Box><Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={loading || saving}>{saving ? 'Сохраняем…' : 'Сохранить изменения'}</Button></Stack>{message && <Alert sx={{ mb: 2 }} severity={message.includes('сохранены') ? 'success' : 'error'}>{message}</Alert>}{loading ? <CircularProgress /> : <Stack spacing={2}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Добавить новую ссылку</Typography><Stack direction={{ xs: 'column', md: 'row' }} spacing={1}><TextField size="small" label="Название" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} sx={{ flex: 1 }} /><TextField size="small" label="URL (https://...)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} sx={{ flex: 1.4 }} /><TextField size="small" label="Описание" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} sx={{ flex: 1 }} /><Button startIcon={<AddIcon />} onClick={add}>Добавить</Button></Stack></Paper><Stack spacing={1}>{links.map((link, index) => <Paper key={link.id} variant="outlined" sx={{ p: 1.5 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><LinkIcon color="action" /><TextField size="small" label="Название" value={link.title} onChange={(e) => update(index, 'title', e.target.value)} sx={{ flex: 1 }} /><TextField size="small" label="URL" value={link.url} onChange={(e) => update(index, 'url', e.target.value)} sx={{ flex: 1.4 }} /><TextField size="small" label="Описание" value={link.description || ''} onChange={(e) => update(index, 'description', e.target.value)} sx={{ flex: 1 }} /><IconButton color="error" aria-label="Удалить ссылку" onClick={() => setLinks((items) => items.filter((item) => item.id !== link.id))}><DeleteOutlineIcon /></IconButton></Stack></Paper>)}{links.length === 0 && <Typography color="text.secondary">Ссылок пока нет.</Typography>}</Stack></Stack>}</Box>;
};

export default StudentPortalUsefulLinksAdminPage;
