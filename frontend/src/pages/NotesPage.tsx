import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ChevronRight as ChevronRightIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Delete as DeleteIcon,
  DriveFileRenameOutline as RenameIcon,
  ExpandMore as ExpandMoreIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  MoreVert as MoreVertIcon,
  NoteAdd as NoteAddIcon,
  Notes as NotesIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import NotesEditor from '../components/NotesEditor';
import { notesApi, noteFoldersApi, Note, NoteFolder } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const AUTOSAVE_DELAY_MS = 1200;

interface FolderNode {
  folder: NoteFolder;
  children: FolderNode[];
  notes: Note[];
}

const NotesPage: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // Folder tree state
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const renamingRef = useRef<HTMLInputElement | null>(null);

  // Context menus
  const [createMenuAnchor, setCreateMenuAnchor] = useState<HTMLElement | null>(null);
  const [createInFolderId, setCreateInFolderId] = useState<number | null | undefined>(undefined);
  const [folderMenuAnchor, setFolderMenuAnchor] = useState<HTMLElement | null>(null);
  const [folderMenuTarget, setFolderMenuTarget] = useState<NoteFolder | null>(null);
  const [moveMenuAnchor, setMoveMenuAnchor] = useState<HTMLElement | null>(null);
  const [moveNoteId, setMoveNoteId] = useState<number | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ title: string; content: string } | null>(null);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async (q?: string) => {
    try {
      if (q) {
        const data = await notesApi.list(q);
        setNotes(data);
      } else {
        const [notesData, foldersData] = await Promise.all([
          notesApi.list(),
          noteFoldersApi.list(),
        ]);
        setNotes(notesData);
        setFolders(foldersData);
      }
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
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content ?? '');
    }
  }, [selectedNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave ──────────────────────────────────────────────────────────────

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

  // ── Note actions ──────────────────────────────────────────────────────────

  const handleCreate = async (folderId?: number | null) => {
    try {
      const note = await notesApi.create({
        title: 'Новая заметка',
        content: '',
        folder_id: folderId ?? null,
      });
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
      if (folderId != null && !expandedIds.has(folderId)) {
        setExpandedIds((prev) => new Set([...prev, folderId]));
      }
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

  const handleMoveNote = async (noteId: number, folderId: number | null) => {
    try {
      const updated = await notesApi.update(noteId, { folder_id: folderId });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось переместить заметку'));
    }
  };

  const handleSelectNote = (noteId: number) => {
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

  const handleSearch = (value: string) => {
    setSearch(value);
    loadAll(value || undefined);
  };

  // ── Folder actions ────────────────────────────────────────────────────────

  const handleCreateFolder = async (parentId?: number | null) => {
    try {
      const folder = await noteFoldersApi.create({ name: 'Новая папка', parent_id: parentId ?? null });
      setFolders((prev) => [...prev, folder]);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (parentId != null) next.add(parentId);
        return next;
      });
      setRenamingId(folder.id);
      setRenamingName(folder.name);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать папку'));
    }
  };

  const handleRenameFolder = async (folderId: number, name: string) => {
    const trimmed = name.trim();
    setRenamingId(null);
    if (!trimmed) return;
    try {
      const updated = await noteFoldersApi.update(folderId, { name: trimmed });
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось переименовать папку'));
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    try {
      await noteFoldersApi.delete(folderId);
      // Remove from state; notes in this folder go to root (backend sets folder_id=null)
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setNotes((prev) => prev.map((n) => (n.folder_id === folderId ? { ...n, folder_id: null } : n)));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить папку'));
    }
  };

  const toggleFolder = (folderId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // ── Tree building ─────────────────────────────────────────────────────────

  const buildFolderTree = (parentId: number | null): FolderNode[] =>
    folders
      .filter((f) => f.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((f) => ({
        folder: f,
        children: buildFolderTree(f.id),
        notes: notes.filter((n) => n.folder_id === f.id).sort((a, b) =>
          new Date(b.updated_at ?? b.created_at).getTime() -
          new Date(a.updated_at ?? a.created_at).getTime(),
        ),
      }));

  const rootNotes = notes.filter((n) => n.folder_id === null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });

  const getFolderPath = (folderId: number | null): string => {
    if (folderId === null) return 'Корень';
    const f = folders.find((x) => x.id === folderId);
    if (!f) return 'Корень';
    const parent = f.parent_id ? getFolderPath(f.parent_id) : null;
    return parent ? `${parent} / ${f.name}` : f.name;
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderNoteRow = (note: Note, depth = 0) => (
    <ListItemButton
      key={note.id}
      selected={note.id === selectedId}
      onClick={() => handleSelectNote(note.id)}
      sx={{ py: 0.6, pl: 1.5 + depth * 2, pr: 1, borderRadius: 1, mx: 0.5 }}
    >
      <ListItemText
        primary={
          <Typography
            variant="body2"
            fontWeight={note.id === selectedId ? 600 : 400}
            noWrap
            sx={{ maxWidth: depth > 0 ? 160 - depth * 16 : 180 }}
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
      <Box sx={{ display: 'flex', opacity: 0, '.MuiListItemButton-root:hover &': { opacity: 1 } }}>
        <Tooltip title="Переместить">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setMoveNoteId(note.id);
              setMoveMenuAnchor(e.currentTarget);
            }}
          >
            <FolderIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Удалить">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(note.id);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </ListItemButton>
  );

  const renderFolderTree = (nodes: FolderNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      const { folder } = node;
      const isExpanded = expandedIds.has(folder.id);
      const isRenaming = renamingId === folder.id;
      return (
        <React.Fragment key={folder.id}>
          <ListItemButton
            onClick={() => { if (!isRenaming) toggleFolder(folder.id); }}
            sx={{ py: 0.5, pl: 1 + depth * 2, pr: 0.5, borderRadius: 1, mx: 0.5 }}
          >
            <Box sx={{ mr: 0.5, display: 'flex', color: 'text.secondary', flexShrink: 0 }}>
              {isExpanded ? (
                <FolderOpenIcon fontSize="small" sx={{ color: 'primary.main' }} />
              ) : (
                <FolderIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              )}
            </Box>
            {isRenaming ? (
              <InputBase
                value={renamingName}
                onChange={(e) => setRenamingName(e.target.value)}
                onBlur={() => handleRenameFolder(folder.id, renamingName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameFolder(folder.id, renamingName);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                inputRef={renamingRef}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                sx={{ flex: 1, fontSize: '0.875rem', '& input': { py: 0 } }}
              />
            ) : (
              <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 500 }}>
                {folder.name}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderMenuTarget(folder);
                  setFolderMenuAnchor(e.currentTarget);
                }}
                sx={{
                  opacity: 0,
                  '.MuiListItemButton-root:hover &': { opacity: 1 },
                  p: 0.25,
                }}
              >
                <MoreVertIcon sx={{ fontSize: 16 }} />
              </IconButton>
              {isExpanded ? (
                <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              ) : (
                <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              )}
            </Box>
          </ListItemButton>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List disablePadding>
              {renderFolderTree(node.children, depth + 1)}
              {node.notes.map((note) => renderNoteRow(note, depth + 1))}
              {node.children.length === 0 && node.notes.length === 0 && (
                <Box sx={{ pl: 3 + depth * 2, py: 0.5 }}>
                  <Typography variant="caption" color="text.disabled">
                    Пусто
                  </Typography>
                </Box>
              )}
            </List>
          </Collapse>
        </React.Fragment>
      );
    });

  // ── Early returns ─────────────────────────────────────────────────────────

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

  const tree = buildFolderTree(null);

  return (
    <Layout>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 140px)', minHeight: 500 }}>
        {/* Left panel */}
        <Paper sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
              <Tooltip title="Создать">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={(e) => {
                    setCreateInFolderId(undefined);
                    setCreateMenuAnchor(e.currentTarget);
                  }}
                >
                  <AddIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          {/* Tree / flat list */}
          <List sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
            {search ? (
              /* Search results — flat list */
              notes.length === 0 ? (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.disabled">
                    Ничего не найдено
                  </Typography>
                </Box>
              ) : (
                notes.map((note) => renderNoteRow(note, 0))
              )
            ) : (
              /* Normal mode — folder tree + root notes */
              <>
                {tree.length === 0 && rootNotes.length === 0 && (
                  <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.disabled" gutterBottom>
                      Нет заметок
                    </Typography>
                    <Button size="small" startIcon={<NoteAddIcon />} onClick={() => handleCreate(null)}>
                      Создать первую
                    </Button>
                  </Box>
                )}
                {renderFolderTree(tree)}
                {rootNotes.map((note) => renderNoteRow(note, 0))}
              </>
            )}
          </List>
        </Paper>

        <Divider orientation="vertical" flexItem />

        {/* Right panel – editor */}
        {selectedNote ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            {selectedNote.folder_id && (
              <Typography variant="caption" color="text.disabled" sx={{ mb: 1 }}>
                📁 {getFolderPath(selectedNote.folder_id)}
              </Typography>
            )}
            <Divider sx={{ mb: 1.5 }} />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <NotesEditor value={editContent} onChange={handleContentChange} />
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
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleCreate(null)}>
              Новая заметка
            </Button>
          </Box>
        )}
      </Box>

      {/* "+" create menu */}
      <Menu
        anchorEl={createMenuAnchor}
        open={Boolean(createMenuAnchor)}
        onClose={() => setCreateMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            setCreateMenuAnchor(null);
            handleCreate(createInFolderId ?? null);
          }}
        >
          <NoteAddIcon fontSize="small" sx={{ mr: 1 }} />
          Новая заметка
        </MenuItem>
        <MenuItem
          onClick={() => {
            setCreateMenuAnchor(null);
            handleCreateFolder(createInFolderId ?? null);
          }}
        >
          <CreateNewFolderIcon fontSize="small" sx={{ mr: 1 }} />
          Новая папка
        </MenuItem>
      </Menu>

      {/* Folder context menu */}
      <Menu
        anchorEl={folderMenuAnchor}
        open={Boolean(folderMenuAnchor)}
        onClose={() => setFolderMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setFolderMenuAnchor(null);
            if (folderMenuTarget) handleCreate(folderMenuTarget.id);
          }}
        >
          <NoteAddIcon fontSize="small" sx={{ mr: 1 }} />
          Новая заметка
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFolderMenuAnchor(null);
            if (folderMenuTarget) handleCreateFolder(folderMenuTarget.id);
          }}
        >
          <CreateNewFolderIcon fontSize="small" sx={{ mr: 1 }} />
          Новая подпапка
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setFolderMenuAnchor(null);
            if (folderMenuTarget) {
              setRenamingId(folderMenuTarget.id);
              setRenamingName(folderMenuTarget.name);
              setExpandedIds((prev) => new Set([...prev, folderMenuTarget.id]));
            }
          }}
        >
          <RenameIcon fontSize="small" sx={{ mr: 1 }} />
          Переименовать
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            const id = folderMenuTarget?.id;
            setFolderMenuAnchor(null);
            setFolderMenuTarget(null);
            if (id != null) handleDeleteFolder(id);
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Удалить папку
        </MenuItem>
      </Menu>

      {/* Move note menu */}
      <Menu
        anchorEl={moveMenuAnchor}
        open={Boolean(moveMenuAnchor)}
        onClose={() => setMoveMenuAnchor(null)}
      >
        <MenuItem disabled>
          <Typography variant="caption" color="text.disabled">
            Переместить в…
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMoveMenuAnchor(null);
            if (moveNoteId != null) handleMoveNote(moveNoteId, null);
          }}
        >
          <FolderIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} />
          Корень
        </MenuItem>
        {folders.map((f) => (
          <MenuItem
            key={f.id}
            onClick={() => {
              setMoveMenuAnchor(null);
              if (moveNoteId != null) handleMoveNote(moveNoteId, f.id);
            }}
          >
            <FolderIcon fontSize="small" sx={{ mr: 1 }} />
            {f.parent_id ? `  ${f.name}` : f.name}
          </MenuItem>
        ))}
      </Menu>
    </Layout>
  );
};

export default NotesPage;
