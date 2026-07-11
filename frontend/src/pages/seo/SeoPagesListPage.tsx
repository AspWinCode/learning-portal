import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../../components/Layout';
import { seoApi, SeoPage } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

const SeoPagesListPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<SeoPage[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await seoApi.listPages(q ? { q } : undefined);
      setItems(data.items);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить список страниц'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleDelete = async (page: SeoPage) => {
    if (!window.confirm(`Удалить страницу «${page.title}»?`)) return;
    try {
      await seoApi.deletePage(page.id);
      setItems((prev) => prev.filter((item) => item.id !== page.id));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить страницу'));
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    const d = parseISO(value);
    return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : value;
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Страницы сайта</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/seo/pages/new')}>
          Новая страница
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSearchSubmit} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Поиск по названию или slug"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: 320 }}
        />
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>URL</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Изменена</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((page) => (
              <TableRow key={page.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/seo/pages/${page.id}`)}>
                <TableCell>{page.title}</TableCell>
                <TableCell>/{page.slug}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={page.status === 'published' ? 'Опубликована' : 'Черновик'}
                    color={page.status === 'published' ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>{page.seo_title || '—'}</TableCell>
                <TableCell>{formatDate(page.updated_at)}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(page);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
                    Страниц пока нет
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Layout>
  );
};

export default SeoPagesListPage;
