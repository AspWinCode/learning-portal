import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import LaunchIcon from '@mui/icons-material/Launch';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import { useAuth } from '../contexts/AuthContext';
import { passwordsApi } from '../services/api';
import { PasswordEntry, PasswordEntryPayload } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { hasPermission } from '../utils/permissions';

type FormState = {
  name: string;
  website_url: string;
  login: string;
  password: string;
  note: string;
};

const emptyForm: FormState = {
  name: '',
  website_url: '',
  login: '',
  password: '',
  note: '',
};

const normalizeUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

const PasswordsPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'passwords.manage');
  const canReveal = canManage || hasPermission(user, 'passwords.reveal');
  const [items, setItems] = useState<PasswordEntry[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PasswordEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [revealed, setRevealed] = useState<Record<number, string>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!Object.keys(revealed).length) return undefined;
    const timer = window.setTimeout(() => setRevealed({}), 60000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await passwordsApi.list(search || undefined);
      setItems(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить пароли'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [items],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: PasswordEntry) => {
    setEditing(item);
    setForm({
      name: item.name || '',
      website_url: item.website_url || '',
      login: item.login || '',
      password: '',
      note: item.note || '',
    });
    setDialogOpen(true);
  };

  const buildPayload = (): PasswordEntryPayload => ({
    name: form.name.trim(),
    website_url: form.website_url.trim() || null,
    login: form.login.trim() || null,
    ...(form.password ? { password: form.password } : {}),
    note: form.note.trim() || null,
  });

  const saveEntry = async () => {
    if (!form.name.trim()) return;
    if (!editing && !form.password) {
      setError('Укажите пароль для новой записи');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await passwordsApi.update(editing.id, buildPayload());
      } else {
        await passwordsApi.create({ ...buildPayload(), password: form.password });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadItems();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось сохранить запись'));
    } finally {
      setBusy(false);
    }
  };

  const revealPassword = async (item: PasswordEntry) => {
    if (revealed[item.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await passwordsApi.reveal(item.id);
      setRevealed((prev) => ({ ...prev, [item.id]: data.password }));
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось раскрыть пароль'));
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = async (item: PasswordEntry) => {
    setBusy(true);
    setError(null);
    try {
      let value = revealed[item.id];
      if (!value) {
        const data = await passwordsApi.reveal(item.id);
        value = data.password;
        setRevealed((prev) => ({ ...prev, [item.id]: value }));
      }
      await navigator.clipboard.writeText(value);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось скопировать пароль'));
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (item: PasswordEntry) => {
    if (!window.confirm(`Удалить пароль "${item.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await passwordsApi.delete(item.id);
      await loadItems();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось удалить запись'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack spacing={2}>
        <Box>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <LockIcon color="primary" />
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              Пароли
            </Typography>
          </Stack>
          <Typography color="text.secondary">
            Защищенное хранилище доступов к сайтам и порталам.
          </Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        <Alert severity="warning">
          Пароли хранятся на сервере в зашифрованном виде. Раскрывайте пароль только когда он нужен, затем закрывайте его обратно.
        </Alert>
        {(loading || busy) && <LinearProgress />}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField
              size="small"
              label="Поиск"
              placeholder="Сайт, логин, примечание"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              sx={{ flex: 1, minWidth: 240 }}
            />
            {canManage && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                Добавить
              </Button>
            )}
          </Stack>
        </Paper>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Наименование</TableCell>
                <TableCell>Сайт</TableCell>
                <TableCell>Логин</TableCell>
                <TableCell>Пароль</TableCell>
                <TableCell>Примечание</TableCell>
                <TableCell>Обновлено</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((item) => {
                const secret = revealed[item.id];
                const href = normalizeUrl(item.website_url);
                return (
                  <TableRow key={item.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{item.name}</TableCell>
                    <TableCell>
                      {href ? (
                        <Link href={href} target="_blank" rel="noreferrer" underline="hover">
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <span>{item.website_url}</span>
                            <LaunchIcon sx={{ fontSize: 14 }} />
                          </Stack>
                        </Link>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{item.login || '-'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', minWidth: 160 }}>
                      {secret || '********'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" color="text.secondary" noWrap title={item.note || ''}>
                        {item.note || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(item.updated_at || item.created_at)}</TableCell>
                    <TableCell align="right">
                      {canReveal && (
                        <>
                          <Tooltip title={secret ? 'Скрыть пароль' : 'Показать пароль'}>
                            <IconButton size="small" onClick={() => void revealPassword(item)}>
                              {secret ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Скопировать пароль">
                            <IconButton size="small" onClick={() => void copyPassword(item)}>
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {canManage && (
                        <>
                          <Tooltip title="Изменить">
                            <IconButton size="small" onClick={() => openEdit(item)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Удалить">
                            <IconButton size="small" color="error" onClick={() => void deleteEntry(item)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                      {search ? 'Ничего не найдено.' : 'Пока нет сохраненных паролей.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Изменить пароль' : 'Новый пароль'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              required
              label="Наименование"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              label="Ссылка на сайт"
              placeholder="https://example.com"
              value={form.website_url}
              onChange={(event) => setForm((prev) => ({ ...prev, website_url: event.target.value }))}
            />
            <TextField
              label="Логин"
              value={form.login}
              onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))}
            />
            <TextField
              required={!editing}
              label={editing ? 'Новый пароль' : 'Пароль'}
              type="password"
              helperText={editing ? 'Оставьте пустым, если пароль не меняется' : undefined}
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              InputProps={{ startAdornment: <KeyIcon sx={{ mr: 1, color: 'text.secondary' }} /> }}
            />
            <TextField
              label="Примечание"
              multiline
              minRows={3}
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={busy || !form.name.trim() || (!editing && !form.password)} onClick={() => void saveEntry()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PasswordsPage;
