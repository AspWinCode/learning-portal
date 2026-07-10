import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import NotesEditor from '../components/NotesEditor';
import { notesApi, Note } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const AUTOSAVE_DELAY_MS = 1200;

const NotesPage: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ title: string; content: string } | null>(null);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  const loadNotes = useCallback(async (q?: string) => {
    try {
      const data = await notesApi.list(q);
      setNotes(data);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setAccessDenied(true);
      } else {
        setError(extractApiError(err, 'Не удалось загрузить заметки'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // When selected note changes — populate editor fields
  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content ?? '');
    }
  }, [selectedNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const flushSave = useCallback(async (noteId: number, title: string, content: string) => {
    setSaving(true);
    try {
      const updated = await notesApi.update(noteId, { title, content });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить заметку'));
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (noteId: number, title: string, content: string) => {
      pendingSave.current = { title, content };
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        if (pendingSave.current) {
          flushSave(noteId, pendingSave.current.title, pendingSave.current.content);
          pendingSave.current = null;
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [flushSave],
  );

  const handleTitleChange = (value: string) => {
    setEditTitle(value);
    if (selectedId !== null) scheduleSave(selectedId, value, editContent);
  };

  const handleContentChange = useCallback(
    (html: string) => {
      setEditContent(html);
      if (selectedId !== null) scheduleSave(selectedId, editTitle, html);
    },
    [selectedId, editTitle, scheduleSave],
  );

  const handleCreate = async () => {
    try {
      const note = await notesApi.create({ title: 'Новая заметка', content: '' });
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать заметку'));
    }
  };

  const handleDelete = async (noteId: number) => {
    try {
      await notesApi.delete(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedId === noteId) setSelectedId(null);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить заметку'));
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    loadNotes(value || undefined);
  };

  const handleSelectNote = (noteId: number) => {
    // Flush any pending save before switching
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (selectedId !== null && pendingSave.current) {
      flushSave(selectedId, pendingSave.current.title, pendingSave.current.content);
      pendingSave.current = null;
    }
    setSelectedId(noteId);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  if (accessDenied) {
    return (
      <Layout>
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" gap={2}>
          <NotesIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary">
            Заметки недоступны для вашей роли
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Обратитесь к владельцу для включения этой функции в настройках.
          </Typography>
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 140px)', minHeight: 500 }}>
        {/* Left panel – notes list */}
        <Paper
          sx={{
            width: 280,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search + New */}
          <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.2,
                  py: 0.5,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.default',
                }}
              >
                <SearchIcon fontSize="small" sx={{ color: 'text.disabled', mr: 0.75 }} />
                <InputBase
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Поиск…"
                  sx={{ fontSize: '0.85rem', flex: 1 }}
                />
              </Box>
              <Tooltip title="Новая заметка">
                <IconButton size="small" onClick={handleCreate} color="primary">
                  <AddIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          {/* List */}
          <List sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
            {notes.length === 0 && (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.disabled">
                  {search ? 'Ничего не найдено' : 'Нет заметок'}
                </Typography>
                {!search && (
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleCreate}
                    sx={{ mt: 1 }}
                  >
                    Создать первую
                  </Button>
                )}
              </Box>
            )}
            {notes.map((note) => (
              <ListItemButton
                key={note.id}
                selected={note.id === selectedId}
                onClick={() => handleSelectNote(note.id)}
                sx={{ py: 0.75, px: 1.5, borderRadius: 1, mx: 0.5 }}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      fontWeight={note.id === selectedId ? 600 : 400}
                      noWrap
                      sx={{ maxWidth: 190 }}
                    >
                      {note.title || 'Без названия'}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.disabled" noWrap>
                      {formatDate(note.updated_at ?? note.created_at)}
                    </Typography>
                  }
                />
                <Tooltip title="Удалить">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(note.id);
                    }}
                    sx={{ opacity: 0, '.MuiListItemButton-root:hover &': { opacity: 1 }, ml: 0.5 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))}
          </List>
        </Paper>

        <Divider orientation="vertical" flexItem />

        {/* Right panel – editor */}
        {selectedNote ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Title row */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
              <InputBase
                value={editTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Название заметки"
                fullWidth
                sx={{
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: 'text.primary',
                  '& input': { p: 0 },
                }}
              />
              {saving && (
                <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                  Сохраняется…
                </Typography>
              )}
            </Box>
            <Divider sx={{ mb: 1.5 }} />

            {/* Rich text editor */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <NotesEditor
                value={editContent}
                onChange={handleContentChange}
              />
            </Box>
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.disabled',
              gap: 2,
            }}
          >
            <NotesIcon sx={{ fontSize: 72, opacity: 0.3 }} />
            <Typography variant="body1">Выберите заметку или создайте новую</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleCreate}>
              Новая заметка
            </Button>
          </Box>
        )}
      </Box>
    </Layout>
  );
};

export default NotesPage;
