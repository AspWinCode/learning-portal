import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Link,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { diskApi } from '../services/api';
import { DiskItem } from '../types';
import { extractApiError } from '../utils/extractApiError';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

const DiskPage: React.FC = () => {
  const [parentId, setParentId] = useState<number | null>(null);
  const [items, setItems] = useState<DiskItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<DiskItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameItem, setRenameItem] = useState<DiskItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menuItem, setMenuItem] = useState<DiskItem | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await diskApi.listItems({ parent_id: parentId, search: search || undefined });
      setItems(response.items);
      setBreadcrumbs(response.breadcrumbs);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить диск'));
    } finally {
      setLoading(false);
    }
  }, [parentId, search]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => {
      if (a.item_type !== b.item_type) return a.item_type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru');
    }),
    [items]
  );

  const openMenu = (event: React.MouseEvent<HTMLElement>, item: DiskItem) => {
    setMenuAnchor(event.currentTarget);
    setMenuItem(item);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuItem(null);
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await diskApi.createFolder({ name, parent_id: parentId });
      setFolderName('');
      setFolderDialogOpen(false);
      await loadItems();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось создать папку'));
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await diskApi.uploadFile(file, parentId);
      }
      await loadItems();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить файл'));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadFile = async (item: DiskItem) => {
    setBusy(true);
    try {
      const { blob, filename } = await diskApi.downloadFile(item.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || item.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось скачать файл'));
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (item: DiskItem) => {
    if (!window.confirm(`Удалить "${item.name}"?`)) return;
    setBusy(true);
    try {
      await diskApi.deleteItem(item.id);
      await loadItems();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось удалить'));
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    if (!renameItem || !renameValue.trim()) return;
    setBusy(true);
    try {
      await diskApi.updateItem(renameItem.id, { name: renameValue.trim() });
      setRenameItem(null);
      setRenameValue('');
      await loadItems();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось переименовать'));
    } finally {
      setBusy(false);
    }
  };

  const openFolder = (item: DiskItem) => {
    if (item.item_type !== 'folder') return;
    setSearchInput('');
    setSearch('');
    setParentId(item.id);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Диск
          </Typography>
          <Typography color="text.secondary">
            Общее хранилище файлов и документов.
          </Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {(loading || busy) && <LinearProgress />}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField
              size="small"
              label="Поиск по диску"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              sx={{ flex: 1, minWidth: 240 }}
            />
            <Button variant="outlined" startIcon={<CreateNewFolderIcon />} onClick={() => setFolderDialogOpen(true)}>
              Папка
            </Button>
            <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => fileInputRef.current?.click()}>
              Загрузить
            </Button>
            <input
              ref={fileInputRef}
              hidden
              multiple
              type="file"
              onChange={(event) => void uploadFiles(event.target.files)}
            />
          </Stack>
        </Paper>

        <Breadcrumbs>
          <Link component="button" underline="hover" onClick={() => setParentId(null)}>
            Мой диск
          </Link>
          {!search && breadcrumbs.map((crumb) => (
            <Link key={crumb.id} component="button" underline="hover" onClick={() => setParentId(crumb.id)}>
              {crumb.name}
            </Link>
          ))}
          {search && <Typography color="text.secondary">Поиск: {search}</Typography>}
        </Breadcrumbs>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Размер</TableCell>
                <TableCell>Владелец</TableCell>
                <TableCell>Обновлено</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Button
                      variant="text"
                      onClick={() => item.item_type === 'folder' ? openFolder(item) : void downloadFile(item)}
                      startIcon={item.item_type === 'folder' ? <FolderIcon /> : <InsertDriveFileIcon />}
                      sx={{ justifyContent: 'flex-start', textTransform: 'none', fontWeight: 700 }}
                    >
                      {item.name}
                    </Button>
                  </TableCell>
                  <TableCell>{item.item_type === 'folder' ? '—' : formatBytes(item.size_bytes ?? 0)}</TableCell>
                  <TableCell>{item.owner_name || '—'}</TableCell>
                  <TableCell>{formatDate(item.updated_at || item.created_at)}</TableCell>
                  <TableCell align="right">
                    {item.item_type === 'file' && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => window.open(diskApi.viewFileUrl(item.id), '_blank')}
                          aria-label="Открыть онлайн"
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => void downloadFile(item)} aria-label="Скачать">
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    <IconButton size="small" onClick={(event) => openMenu(event, item)} aria-label="Меню">
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {sortedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                      {search ? 'Ничего не найдено.' : 'В этой папке пока нет файлов.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (!menuItem) return;
            setRenameItem(menuItem);
            setRenameValue(menuItem.name);
            closeMenu();
          }}
        >
          <DriveFileMoveIcon fontSize="small" style={{ marginRight: 8 }} />
          Переименовать
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!menuItem) return;
            const item = menuItem;
            closeMenu();
            void deleteItem(item);
          }}
        >
          <DeleteIcon fontSize="small" style={{ marginRight: 8 }} />
          Удалить
        </MenuItem>
      </Menu>

      <Dialog open={folderDialogOpen} onClose={() => setFolderDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новая папка</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Название папки"
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createFolder();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFolderDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={busy || !folderName.trim()} onClick={() => void createFolder()}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(renameItem)} onClose={() => setRenameItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Переименовать</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Название"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void saveRename();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameItem(null)}>Отмена</Button>
          <Button variant="contained" disabled={busy || !renameValue.trim()} onClick={() => void saveRename()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DiskPage;
