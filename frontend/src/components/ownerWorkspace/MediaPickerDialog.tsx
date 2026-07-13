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
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import UploadIcon from '@mui/icons-material/Upload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { mediaApi, type MediaFile } from '../../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPickerDialog({ open, onClose, onSelect }: Props) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const all = await mediaApi.list();
      setFiles(all.filter(f => f.mime_type.startsWith('image/')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setSearch('');
      loadFiles();
    }
  }, [open, loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const uploaded = await mediaApi.upload(file);
      setFiles(prev => [uploaded, ...prev]);
      setSelected(uploaded.url);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = () => {
    if (selected) onSelect(selected);
  };

  const filtered = files.filter(f =>
    f.original_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>Медиатека</Typography>
        <Tooltip title="Загрузить новое изображение">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={uploading ? <CircularProgress size={14} /> : <UploadIcon />}
              onClick={() => uploadRef.current?.click()}
              disabled={uploading}
            >
              Загрузить
            </Button>
          </span>
        </Tooltip>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Поиск по имени файла…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary" variant="body2">
              {search ? 'Ничего не найдено' : 'Медиатека пуста. Загрузите первое изображение.'}
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 1.5,
            }}
          >
            {filtered.map(f => {
              const isSelected = selected === f.url;
              return (
                <Box
                  key={f.id}
                  onClick={() => setSelected(f.url)}
                  onDoubleClick={() => { setSelected(f.url); onSelect(f.url); }}
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1.5,
                    border: '2px solid',
                    borderColor: isSelected ? 'primary.main' : 'transparent',
                    overflow: 'hidden',
                    position: 'relative',
                    '&:hover': { borderColor: isSelected ? 'primary.main' : 'action.selected' },
                    transition: 'border-color 0.15s',
                  }}
                >
                  <Box
                    component="img"
                    src={f.url}
                    alt={f.original_name}
                    sx={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      display: 'block',
                      bgcolor: 'action.hover',
                    }}
                  />
                  {isSelected && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        bgcolor: 'primary.main',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 14, color: 'white' }} />
                    </Box>
                  )}
                  <Box sx={{ p: 0.75 }}>
                    <Typography
                      variant="caption"
                      noWrap
                      display="block"
                      title={f.original_name}
                    >
                      {f.original_name}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" display="block">
                      {formatSize(f.size)}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {selected ? 'Дважды кликните для быстрого выбора' : 'Выберите изображение из списка'}
        </Typography>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!selected}
        >
          Вставить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
