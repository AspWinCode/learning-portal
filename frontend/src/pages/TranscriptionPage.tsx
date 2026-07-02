import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MicIcon from '@mui/icons-material/Mic';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import Layout from '../components/Layout';
import { transcriptionApi } from '../services/api';
import type { Transcription } from '../types';
import { extractApiError } from '../utils/extractApiError';

const STATUS_LABEL: Record<Transcription['status'], string> = {
  pending: 'В очереди',
  processing: 'Распознаётся…',
  done: 'Готово',
  error: 'Ошибка',
};

const STATUS_COLOR: Record<Transcription['status'], 'default' | 'info' | 'success' | 'error'> = {
  pending: 'default',
  processing: 'info',
  done: 'success',
  error: 'error',
};

function formatSize(bytes?: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function previewText(text: string, maxLength = 120): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine;
}

const TranscriptionPage: React.FC = () => {
  const [items, setItems] = useState<Transcription[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await transcriptionApi.list();
      setItems(data.items);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить список транскрибаций'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const hasActive = items.some((item) => item.status === 'pending' || item.status === 'processing');
    if (!hasActive) return;
    const timer = setInterval(loadData, 4000);
    return () => clearInterval(timer);
  }, [items, loadData]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await transcriptionApi.upload(file);
      setMessage('Файл загружен, идёт распознавание…');
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить аудио'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (item: Transcription) => {
    if (!window.confirm(`Удалить транскрибацию "${item.filename}"?`)) return;
    try {
      await transcriptionApi.remove(item.id);
      setMessage('Транскрибация удалена');
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось удалить транскрибацию'));
    }
  };

  const handleCopy = async (item: Transcription) => {
    if (!item.text) return;
    await navigator.clipboard.writeText(item.text);
    setMessage('Текст скопирован');
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(items.filter((item) => item.status === 'done').map((item) => item.id)));
  const collapseAll = () => setExpandedIds(new Set());

  return (
    <Layout>
      <Box sx={{ p: { xs: 1.5, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Транскрибация
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Загрузите аудио — система распознает речь и выведет текст.
              </Typography>
            </Box>
            <Button
              startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
              variant="contained"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              Загрузить аудио
            </Button>
            <input
              ref={inputRef}
              type="file"
              hidden
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm,.mp4,.aac"
              onChange={handleFileChange}
            />
          </Stack>

          {loading && <LinearProgress />}
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}

          {items.some((item) => item.status === 'done') && (
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" startIcon={<UnfoldMoreIcon fontSize="small" />} onClick={expandAll}>
                Развернуть все
              </Button>
              <Button size="small" startIcon={<UnfoldLessIcon fontSize="small" />} onClick={collapseAll}>
                Свернуть все
              </Button>
            </Stack>
          )}

          {!loading && items.length === 0 && (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 1 }}>
              <MicIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Пока нет транскрибаций
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Загрузите первый аудиофайл, чтобы получить текст.
              </Typography>
            </Paper>
          )}

          <Stack spacing={1}>
            {items.map((item) => {
              const isExpandable = item.status === 'done' && !!item.text;
              const isExpanded = isExpandable && expandedIds.has(item.id);
              return (
                <Paper key={item.id} variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: 1 }}>
                  <Stack spacing={0.75}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ cursor: isExpandable ? 'pointer' : 'default' }}
                      onClick={() => isExpandable && toggleExpanded(item.id)}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                        {isExpandable && (
                          <IconButton size="small" onClick={(event) => { event.stopPropagation(); toggleExpanded(item.id); }}>
                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        )}
                        <MicIcon fontSize="small" color="action" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, flexShrink: 0 }} noWrap>
                          {item.filename}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {formatSize(item.size_bytes)}
                        </Typography>
                        {isExpandable && !isExpanded && (
                          <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                            {previewText(item.text || '')}
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Chip size="small" label={STATUS_LABEL[item.status]} color={STATUS_COLOR[item.status]} />
                        {item.text && (
                          <Tooltip title="Копировать текст">
                            <IconButton size="small" onClick={(event) => { event.stopPropagation(); handleCopy(item); }}>
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Удалить">
                          <IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); handleDelete(item); }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    {(item.status === 'pending' || item.status === 'processing') && <LinearProgress />}

                    {item.status === 'error' && (
                      <Alert severity="error">{item.error_message || 'Не удалось распознать аудио'}</Alert>
                    )}

                    {isExpandable && (
                      <Collapse in={isExpanded}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', pl: 4.5, pt: 0.5 }}>
                          {item.text}
                        </Typography>
                      </Collapse>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Stack>
      </Box>
    </Layout>
  );
};

export default TranscriptionPage;
