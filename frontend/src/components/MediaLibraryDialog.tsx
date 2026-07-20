import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import api, { mediaApi, MediaFile } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

const API_BASE = (api.defaults.baseURL || '').replace(/\/api\/v1$/, '');

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

const MediaLibraryDialog: React.FC<Props> = ({ open, onClose, onSelect }) => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MediaFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await mediaApi.list();
      setFiles(data);
    } catch {
      setError('Не удалось загрузить медиафайлы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(null);
      load();
    }
  }, [open, load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const created = await mediaApi.upload(file);
      setFiles((prev) => [created, ...prev]);
      setSelected(created);
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setError(typeof msg === 'string' ? msg : 'Ошибка загрузки файла');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (f: MediaFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить «${f.original_name}»?`)) return;
    try {
      await mediaApi.delete(f.id);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      if (selected?.id === f.id) setSelected(null);
    } catch {
      setError('Не удалось удалить файл');
    }
  };

  const handleInsert = () => {
    if (!selected) return;
    onSelect(`${API_BASE}${selected.url}`);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Медиабиблиотека
        <Box sx={{ display: 'flex', gap: 1 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/avif"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : <CloudUploadIcon />}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            Загрузить
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ minHeight: 320 }}>
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
            <CircularProgress />
          </Box>
        ) : files.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <Typography color="text.secondary">Нет загруженных изображений</Typography>
          </Box>
        ) : (
          <ImageList cols={4} gap={8} sx={{ mt: 0 }}>
            {files.map((f) => {
              const imgSrc = `${API_BASE}${f.url}`;
              const isSelected = selected?.id === f.id;
              return (
                <ImageListItem
                  key={f.id}
                  onClick={() => setSelected(isSelected ? null : f)}
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1,
                    overflow: 'hidden',
                    outline: isSelected ? '3px solid' : '2px solid transparent',
                    outlineColor: isSelected ? 'primary.main' : 'transparent',
                    position: 'relative',
                    '&:hover': { outline: '2px solid', outlineColor: 'primary.light' },
                  }}
                >
                  <img
                    src={imgSrc}
                    alt={f.original_name ?? undefined}
                    loading="lazy"
                    style={{ objectFit: 'cover', height: 110, width: '100%' }}
                  />
                  {isSelected && (
                    <CheckCircleIcon
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        color: 'primary.main',
                        bgcolor: 'white',
                        borderRadius: '50%',
                        fontSize: 22,
                      }}
                    />
                  )}
                  <ImageListItemBar
                    title={
                      <Tooltip title={f.original_name}>
                        <span>{f.original_name}</span>
                      </Tooltip>
                    }
                    subtitle={fileSize(f.size)}
                    actionIcon={
                      <IconButton
                        size="small"
                        sx={{ color: 'rgba(255,255,255,0.7)' }}
                        onClick={(e) => handleDelete(f, e)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  />
                </ImageListItem>
              );
            })}
          </ImageList>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" disabled={!selected} onClick={handleInsert}>
          Вставить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MediaLibraryDialog;
