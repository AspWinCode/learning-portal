import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, CardActionArea,
  Chip, Grid, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, CircularProgress, IconButton, Tooltip,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Add as AddIcon,
  RocketLaunch,
  Archive as ArchiveIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  BugReport,
  CheckBox,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { agileApi } from '../services/api/agile';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';
import type { ItProject, AgileRoleAccessItem } from '../types';

const STATUS_COLORS: Record<string, 'success' | 'default'> = {
  active: 'success',
  archived: 'default',
};

const ROLE_LABELS: Record<string, string> = {
  trainer: 'Тренер',
  sales: 'Менеджер продаж',
  methodist: 'Методист',
  seo_manager: 'SEO-менеджер',
};

const AgileProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<ItProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');

  // Диалог создания
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', key: '', description: '', visibility: 'internal' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Диалог настройки доступа по ролям
  const [accessOpen, setAccessOpen] = useState(false);
  const [roleAccess, setRoleAccess] = useState<AgileRoleAccessItem[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);

  const isAdmin = hasPermission(user, 'agile.admin') || hasPermission(user, '*');
  const canCreate = isAdmin || hasPermission(user, 'agile.manage');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await agileApi.listProjects(statusFilter);
      setProjects(data);
    } catch {
      setError('Не удалось загрузить проекты');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.key.trim()) {
      setCreateError('Название и ключ обязательны');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const p = await agileApi.createProject({
        name: form.name.trim(),
        key: form.key.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        visibility: form.visibility,
      });
      setCreateOpen(false);
      setForm({ name: '', key: '', description: '', visibility: 'internal' });
      navigate(`/agile/${p.id}`);
    } catch (e: any) {
      setCreateError(e?.response?.data?.detail || 'Ошибка создания проекта');
    } finally {
      setCreating(false);
    }
  };

  const openAccessSettings = async () => {
    setAccessOpen(true);
    setAccessLoading(true);
    try {
      const data = await agileApi.getRoleAccess();
      setRoleAccess(data.items);
    } catch {
      setRoleAccess([]);
    } finally {
      setAccessLoading(false);
    }
  };

  const toggleRoleAccess = async (role: string, enabled: boolean, access_level: string) => {
    try {
      const updated = await agileApi.updateRoleAccess({ role, enabled, access_level });
      setRoleAccess(prev => prev.map(r => r.role === role ? updated : r));
    } catch {}
  };

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        {/* Шапка */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <RocketLaunch sx={{ color: 'primary.main', fontSize: 32 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={700}>IT-проекты</Typography>
            <Typography variant="body2" color="text.secondary">Agile-трекер для разработки</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Обновить">
              <IconButton onClick={load} size="small"><RefreshIcon /></IconButton>
            </Tooltip>
            {isAdmin && (
              <Tooltip title="Доступ по ролям">
                <IconButton onClick={openAccessSettings} size="small"><SettingsIcon /></IconButton>
              </Tooltip>
            )}
            {canCreate && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
                Новый проект
              </Button>
            )}
          </Box>
        </Box>

        {/* Фильтр статусов */}
        <ToggleButtonGroup
          size="small"
          value={statusFilter}
          exclusive
          onChange={(_, v) => v && setStatusFilter(v)}
          sx={{ mb: 3 }}
        >
          <ToggleButton value="active">Активные</ToggleButton>
          <ToggleButton value="archived">Архив</ToggleButton>
        </ToggleButtonGroup>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        ) : projects.length === 0 ? (
          <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
            <RocketLaunch sx={{ fontSize: 56, mb: 2, opacity: 0.3 }} />
            <Typography variant="h6">Проектов пока нет</Typography>
            {canCreate && (
              <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={() => setCreateOpen(true)}>
                Создать первый проект
              </Button>
            )}
          </Box>
        ) : (
          <Grid container spacing={2}>
            {projects.map(p => (
              <Grid item xs={12} sm={6} md={4} key={p.id}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardActionArea onClick={() => navigate(`/agile/${p.id}`)} sx={{ height: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                        <Chip label={p.key} size="small" color="primary" sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
                        <Chip
                          label={p.status === 'active' ? 'Активный' : 'Архив'}
                          size="small"
                          color={STATUS_COLORS[p.status] || 'default'}
                          variant="outlined"
                        />
                      </Box>
                      <Typography variant="h6" fontWeight={600} sx={{ mt: 1, mb: 0.5 }}>
                        {p.name}
                      </Typography>
                      {p.description && (
                        <Typography variant="body2" color="text.secondary" sx={{
                          mb: 1.5, overflow: 'hidden',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {p.description}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                          <CheckBox sx={{ fontSize: 16 }} />
                          <Typography variant="caption">{p.issue_count ?? 0} задач</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                          <BugReport sx={{ fontSize: 16 }} />
                          <Typography variant="caption">{p.member_count ?? 0} участников</Typography>
                        </Box>
                        {p.open_sprint_name && (
                          <Chip label={`🏃 ${p.open_sprint_name}`} size="small" color="info" variant="outlined" />
                        )}
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Диалог создания проекта */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новый IT-проект</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {createError && <Alert severity="error">{createError}</Alert>}
          <TextField
            label="Название проекта"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            fullWidth required autoFocus
          />
          <TextField
            label="Ключ проекта (например: LP, DEV)"
            value={form.key}
            onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))}
            fullWidth required
            helperText="Латинские буквы, используется в номерах задач: LP-42"
            inputProps={{ style: { fontFamily: 'monospace', fontWeight: 700 } }}
          />
          <TextField
            label="Описание"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            fullWidth multiline rows={2}
          />
          <TextField
            select label="Видимость"
            value={form.visibility}
            onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
            fullWidth
          >
            <MenuItem value="internal">Для участников проекта</MenuItem>
            <MenuItem value="private">Только владелец</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained" disabled={creating}>
            {creating ? 'Создание...' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог доступа по ролям */}
      <Dialog open={accessOpen} onClose={() => setAccessOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon /> Доступ к Agile по ролям
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Owner и Admin всегда имеют полный доступ. Для остальных ролей можно включить доступ к просмотру или управлению.
          </Typography>
          {accessLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {roleAccess.map(item => (
                <Box key={item.role} sx={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
                }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2">{ROLE_LABELS[item.role] || item.role}</Typography>
                  </Box>
                  <TextField
                    select size="small"
                    value={item.enabled ? item.access_level : 'disabled'}
                    onChange={e => {
                      const val = e.target.value;
                      toggleRoleAccess(item.role, val !== 'disabled', val === 'disabled' ? 'access' : val);
                    }}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="disabled">Нет доступа</MenuItem>
                    <MenuItem value="access">Просмотр</MenuItem>
                    <MenuItem value="manage">Управление</MenuItem>
                  </TextField>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccessOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default AgileProjectsPage;
