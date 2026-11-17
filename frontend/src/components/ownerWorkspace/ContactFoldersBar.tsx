import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { ownerWorkspaceApi } from '../../services/api';
import type { OwnerWorkspaceContactFolder } from '../../types';
import { extractApiError } from '../../utils/extractApiError';

type ContactFoldersBarProps = {
  selectedFolderId: number | null | 'unassigned';
  onSelectFolder: (folderId: number | null | 'unassigned') => void;
  onFoldersLoaded?: (folders: OwnerWorkspaceContactFolder[]) => void;
  unassignedCount: number;
  totalCount: number;
};

export const ContactFoldersBar: React.FC<ContactFoldersBarProps> = ({
  selectedFolderId,
  onSelectFolder,
  onFoldersLoaded,
  unassignedCount,
  totalCount,
}) => {
  const [folders, setFolders] = React.useState<OwnerWorkspaceContactFolder[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editFolder, setEditFolder] = React.useState<OwnerWorkspaceContactFolder | 'new' | null>(null);
  const [editName, setEditName] = React.useState('');
  const [deleteConfirm, setDeleteConfirm] = React.useState<OwnerWorkspaceContactFolder | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await ownerWorkspaceApi.listContactFolders();
      setFolders(data);
      onFoldersLoaded?.(data);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось загрузить папки'));
    }
  }, [onFoldersLoaded]);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditName('');
    setEditFolder('new');
  };

  const openRename = (folder: OwnerWorkspaceContactFolder) => {
    setEditName(folder.name);
    setEditFolder(folder);
  };

  const saveFolder = async () => {
    const name = editName.trim();
    if (!name) return;
    try {
      if (editFolder === 'new') {
        const created = await ownerWorkspaceApi.createContactFolder({ name });
        await load();
        onSelectFolder(created.id);
      } else if (editFolder) {
        await ownerWorkspaceApi.updateContactFolder(editFolder.id, { name });
        await load();
      }
      setEditFolder(null);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сохранить папку'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await ownerWorkspaceApi.deleteContactFolder(deleteConfirm.id);
      if (selectedFolderId === deleteConfirm.id) onSelectFolder(null);
      await load();
    } catch (e) {
      setError(extractApiError(e, 'Не удалось удалить папку'));
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <Box sx={{ mb: 1.5 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        <Chip
          label={`Все (${totalCount})`}
          size="small"
          color={selectedFolderId === null ? 'primary' : 'default'}
          onClick={() => onSelectFolder(null)}
        />
        <Chip
          label={`Без папки (${unassignedCount})`}
          size="small"
          variant={selectedFolderId === 'unassigned' ? 'filled' : 'outlined'}
          color={selectedFolderId === 'unassigned' ? 'primary' : 'default'}
          onClick={() => onSelectFolder('unassigned')}
        />
        {folders.map((folder) => (
          <Chip
            key={folder.id}
            label={`${folder.name} (${folder.contacts_count})`}
            size="small"
            color={selectedFolderId === folder.id ? 'primary' : 'default'}
            onClick={() => onSelectFolder(folder.id)}
            onDelete={() => openRename(folder)}
            deleteIcon={
              <Tooltip title="Переименовать">
                <EditIcon fontSize="small" />
              </Tooltip>
            }
          />
        ))}
        <Tooltip title="Новая папка">
          <IconButton size="small" onClick={openCreate}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {selectedFolderId !== null && selectedFolderId !== 'unassigned' && (
          <Tooltip title="Удалить папку (контакты останутся, просто без папки)">
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                const folder = folders.find((f) => f.id === selectedFolderId);
                if (folder) setDeleteConfirm(folder);
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Dialog open={editFolder !== null} onClose={() => setEditFolder(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{editFolder === 'new' ? 'Новая папка' : 'Переименовать папку'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Название"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveFolder();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditFolder(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveFolder()} disabled={!editName.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить папку «{deleteConfirm?.name}»?</DialogTitle>
        <DialogContent>
          Контакты из неё не удаляются, просто останутся без папки ({deleteConfirm?.contacts_count ?? 0} шт.).
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Отмена</Button>
          <Button variant="contained" color="error" onClick={() => void confirmDelete()}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ContactFoldersBar;
