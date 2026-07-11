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
import { blogApi, BlogPost } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

const BlogPostsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<BlogPost[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (q?: string) => {
    setLoading(true);
    try {
      const data = await blogApi.listPosts(q ? { search: q } : undefined);
      setItems(data.items);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить список постов'));
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
    load(search);
  };

  const handleDelete = async (post: BlogPost) => {
    if (!window.confirm(`Удалить пост «${post.title}»?`)) return;
    try {
      await blogApi.deletePost(post.id);
      setItems((prev) => prev.filter((item) => item.id !== post.id));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить пост'));
    }
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—';
    const d = parseISO(value);
    return isValid(d) ? format(d, 'dd.MM.yyyy') : value;
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Блог</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/blog/posts/new')}>
          Новый пост
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
          label="Поиск по заголовку"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 320 }}
        />
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Заголовок</TableCell>
              <TableCell>URL</TableCell>
              <TableCell>Категория</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Дата публикации</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((post) => (
              <TableRow
                key={post.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/blog/posts/${post.id}`)}
              >
                <TableCell>{post.title}</TableCell>
                <TableCell>/{post.slug}</TableCell>
                <TableCell>{post.category?.name ?? '—'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={post.status === 'published' ? 'Опубликован' : 'Черновик'}
                    color={post.status === 'published' ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>{formatDate(post.published_at)}</TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(post);
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
                    Постов пока нет
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

export default BlogPostsListPage;
