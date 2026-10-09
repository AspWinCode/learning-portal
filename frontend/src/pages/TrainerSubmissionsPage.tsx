import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { PROJECT_STATUS_LABEL, ProjectReviewDialog, Toast } from './CodelabStudioPage';
import { codelabStudioApi, CodelabPendingReview } from '../services/codelabApi';
import { extractApiError } from '../utils/extractApiError';

type FilterTab = 'queue' | 'needs_revision' | 'accepted' | 'all';

const TAB_LABEL: Record<FilterTab, string> = {
  queue: 'На проверке',
  needs_revision: 'На доработке',
  accepted: 'Принятые',
  all: 'Все',
};

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const TrainerSubmissionsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FilterTab>('queue');
  const [toast, setToast] = useState<Toast>(null);
  const [reviewing, setReviewing] = useState<CodelabPendingReview | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['trainer-submissions', 'pending-reviews'],
    queryFn: () => codelabStudioApi.listPendingReviews(),
  });

  const rows = data || [];

  const filtered = useMemo(() => {
    switch (tab) {
      case 'queue':
        return rows.filter((r) => r.status === 'submitted');
      case 'needs_revision':
        return rows.filter((r) => r.status === 'needs_revision');
      case 'accepted':
        return rows.filter((r) => r.status === 'accepted');
      default:
        return rows;
    }
  }, [rows, tab]);

  const reload = () => queryClient.invalidateQueries({ queryKey: ['trainer-submissions', 'pending-reviews'] });

  return (
    <Layout>
      <Stack spacing={2} sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Работы учеников
          </Typography>
          <Typography color="text.secondary">
            Сдачи проектов с ручной проверкой по вашим группам.
          </Typography>
        </Box>

        {isError && <Alert severity="error">{extractApiError(error, 'Не удалось загрузить работы')}</Alert>}

        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {(Object.keys(TAB_LABEL) as FilterTab[]).map((key) => (
            <Tab key={key} value={key} label={TAB_LABEL[key]} />
          ))}
        </Tabs>

        {isLoading ? (
          <LinearProgress />
        ) : (
          <Paper variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Ученик</TableCell>
                  <TableCell>Курс</TableCell>
                  <TableCell>Проект</TableCell>
                  <TableCell>Дата отправки</TableCell>
                  <TableCell>Попытка</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.student_full_name}</TableCell>
                    <TableCell>{row.course_title}</TableCell>
                    <TableCell>{row.item_title}</TableCell>
                    <TableCell>{formatDate(row.submitted_at)}</TableCell>
                    <TableCell>
                      {row.attempt_number}
                      {row.attempt_number > 1 && row.status === 'submitted' && (
                        <Chip size="small" label="повторно" sx={{ ml: 1 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={PROJECT_STATUS_LABEL[row.status] || row.status}
                        color={row.status === 'accepted' ? 'success' : row.status === 'needs_revision' ? 'warning' : 'default'}
                      />
                      {row.is_overdue && <Chip size="small" color="error" label="Просрочено" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setReviewing(row)}>
                        Открыть
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                        Ничего нет.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Stack>

      {reviewing && (
        <ProjectReviewDialog
          courseId={reviewing.course_id}
          itemId={reviewing.item_id}
          submissionId={reviewing.id}
          onClose={() => setReviewing(null)}
          onSaved={reload}
          onToast={setToast}
        />
      )}

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast?.msg || ''} />
    </Layout>
  );
};

export default TrainerSubmissionsPage;
