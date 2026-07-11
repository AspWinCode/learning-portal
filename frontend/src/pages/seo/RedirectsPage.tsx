import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import Layout from '../../components/Layout';
import { seoRedirectsApi, SeoRedirect } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

const EMPTY_FORM = { from_path: '', to_url: '', status_code: 301 };

const RedirectsPage: React.FC = () => {
  const [redirects, setRedirects] = useState<SeoRedirect[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seoRedirectsApi
      .list()
      .then(setRedirects)
      .catch(() => setError('Не удалось загрузить редиректы'))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!form.from_path.trim() || !form.to_url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await seoRedirectsApi.create(form);
      setRedirects((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сохранить редирект'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r: SeoRedirect) => {
    try {
      const updated = await seoRedirectsApi.update(r.id, { is_active: !r.is_active });
      setRedirects((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    } catch {
      setError('Не удалось изменить статус');
    }
  };

  const handleDelete = async (r: SeoRedirect) => {
    if (!window.confirm(`Удалить редирект ${r.from_path}?`)) return;
    try {
      await seoRedirectsApi.delete(r.id);
      setRedirects((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      setError('Не удалось удалить редирект');
    }
  };

  return (
    <Layout>
      <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}>
        <Typography variant="h5" fontWeight={700} mb={3}>
          Редиректы
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Add form */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" mb={2}>
            Добавить редирект
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
            <TextField
              label="Откуда (путь)"
              placeholder="/old-page"
              value={form.from_path}
              onChange={(e) => setForm((p) => ({ ...p, from_path: e.target.value }))}
              size="small"
              sx={{ flex: 2 }}
            />
            <TextField
              label="Куда (URL)"
              placeholder="/new-page или https://..."
              value={form.to_url}
              onChange={(e) => setForm((p) => ({ ...p, to_url: e.target.value }))}
              size="small"
              sx={{ flex: 2 }}
            />
            <FormControl size="small" sx={{ minWidth: 90 }}>
              <InputLabel>Код</InputLabel>
              <Select
                label="Код"
                value={form.status_code}
                onChange={(e) => setForm((p) => ({ ...p, status_code: Number(e.target.value) }))}
              >
                <MenuItem value={301}>301</MenuItem>
                <MenuItem value={302}>302</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
              disabled={saving || !form.from_path.trim() || !form.to_url.trim()}
              onClick={handleAdd}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Добавить
            </Button>
          </Stack>
        </Paper>

        {/* Table */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : redirects.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={6}>
            Редиректов пока нет
          </Typography>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Откуда</TableCell>
                  <TableCell>Куда</TableCell>
                  <TableCell align="center">Код</TableCell>
                  <TableCell align="center">Активен</TableCell>
                  <TableCell align="center" />
                </TableRow>
              </TableHead>
              <TableBody>
                {redirects.map((r) => (
                  <TableRow key={r.id} sx={{ opacity: r.is_active ? 1 : 0.5 }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {r.from_path}
                    </TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                        fontSize: 13,
                      }}
                    >
                      <Tooltip title={r.to_url}>
                        <span>{r.to_url}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={r.status_code}
                        size="small"
                        color={r.status_code === 301 ? 'primary' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={r.is_active}
                        onChange={() => handleToggle(r)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" color="error" onClick={() => handleDelete(r)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Typography variant="caption" color="text.secondary" mt={2} display="block">
          Редиректы применяются при следующей публикации сайта (meta-refresh + JS redirect).
          После добавления перейдите в «Публикация сайта» и нажмите «Опубликовать».
        </Typography>
      </Box>
    </Layout>
  );
};

export default RedirectsPage;
