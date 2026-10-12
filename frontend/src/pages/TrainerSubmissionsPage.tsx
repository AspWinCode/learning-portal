import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, LinearProgress,
  Paper, Snackbar, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { PROJECT_STATUS_LABEL, ProjectReviewDialog, Toast } from './CodelabStudioPage';
import { codelabStudioApi, CodelabTrainerSubmission } from '../services/codelabApi';
import { extractApiError } from '../utils/extractApiError';

type FilterTab = 'queue' | 'tasks' | 'projects' | 'needs_revision' | 'accepted' | 'all';
const TAB_LABEL: Record<FilterTab, string> = {
  queue: 'На проверке', tasks: 'Решённые задачи', projects: 'Проекты',
  needs_revision: 'На доработке', accepted: 'Принятые', all: 'Все',
};
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const isAcceptedTask = (row: CodelabTrainerSubmission) => ['accepted', 'ok', 'passed', 'solved'].includes(String(row.verdict || row.status).toLowerCase());

function TaskSubmissionDialog({ row, onClose }: { row: CodelabTrainerSubmission; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{row.item_title || 'Задача'} — {row.student_full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip size="small" label={`Вердикт: ${row.verdict || row.status || '—'}`} color={isAcceptedTask(row) ? 'success' : 'default'} />
            <Chip size="small" label={`Баллы: ${row.manual_score_override ?? row.score ?? '—'}`} />
            {row.group_name && <Chip size="small" label={row.group_name} />}
          </Stack>
          {row.manual_comment && <Alert severity="info">{row.manual_comment}</Alert>}
          <Typography variant="body2" color="text.secondary">{row.course_title} • {formatDate(row.created_at)} • попытка {row.attempt_number || 1}</Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.900', color: 'grey.100', overflow: 'auto' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>{row.code || 'Код не передан Codelab.'}</pre>
          </Paper>
          {row.history?.length ? <Box><Typography variant="subtitle2" sx={{ mb: 1 }}>История попыток</Typography>{row.history.map((attempt, index) => <Typography key={index} variant="body2" color="text.secondary">{JSON.stringify(attempt)}</Typography>)}</Box> : null}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

const TrainerSubmissionsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FilterTab>('queue');
  const [toast, setToast] = useState<Toast>(null);
  const [reviewing, setReviewing] = useState<CodelabTrainerSubmission | null>(null);
  const [taskDetails, setTaskDetails] = useState<CodelabTrainerSubmission | null>(null);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['trainer-submissions', 'all'], queryFn: () => codelabStudioApi.listTrainerSubmissions() });
  const rows = data || [];
  const filtered = useMemo(() => rows.filter((row) => {
    if (tab === 'tasks') return row.submission_type === 'task';
    if (tab === 'projects') return row.submission_type === 'project';
    if (tab === 'queue') return row.submission_type === 'project' && row.status === 'submitted';
    if (tab === 'needs_revision') return row.submission_type === 'project' && row.status === 'needs_revision';
    if (tab === 'accepted') return row.submission_type === 'project' && row.status === 'accepted';
    return true;
  }), [rows, tab]);
  const reload = () => { queryClient.invalidateQueries({ queryKey: ['trainer-submissions', 'all'] }); queryClient.invalidateQueries({ queryKey: ['trainer-cockpit'] }); };

  return (
    <Layout>
      <Stack spacing={2} sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto' }}>
        <Box><Typography variant="h4" sx={{ fontWeight: 800 }}>Работы учеников</Typography><Typography color="text.secondary">Задачи и проекты только учеников ваших активных групп.</Typography></Box>
        {isError && <Alert severity="error">{extractApiError(error, 'Не удалось загрузить работы')}</Alert>}
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>{(Object.keys(TAB_LABEL) as FilterTab[]).map((key) => <Tab key={key} value={key} label={TAB_LABEL[key]} />)}</Tabs>
        {isLoading ? <LinearProgress /> : <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table><TableHead><TableRow><TableCell>Тип</TableCell><TableCell>Ученик</TableCell><TableCell>Группа</TableCell><TableCell>Курс</TableCell><TableCell>Задача / проект</TableCell><TableCell>Дата</TableCell><TableCell>Попытка</TableCell><TableCell>Статус / вердикт</TableCell><TableCell align="right">Действия</TableCell></TableRow></TableHead>
            <TableBody>{filtered.map((row) => { const project = row.submission_type === 'project'; return <TableRow key={`${row.submission_type}-${row.submission_id}`} hover><TableCell>{project ? 'Проект' : 'Задача'}</TableCell><TableCell>{row.student_full_name}</TableCell><TableCell>{row.group_name || '—'}</TableCell><TableCell>{row.course_title}</TableCell><TableCell>{row.item_title || '—'}</TableCell><TableCell>{formatDate(row.submitted_at || row.created_at)}</TableCell><TableCell>{row.attempt_number || 1}</TableCell><TableCell><Chip size="small" label={project ? (PROJECT_STATUS_LABEL[row.status] || row.status) : (row.verdict || row.status)} color={project && row.status === 'accepted' ? 'success' : 'default'} /></TableCell><TableCell align="right"><Button size="small" onClick={() => project ? setReviewing(row) : setTaskDetails(row)}>Открыть</Button></TableCell></TableRow>; })}{!filtered.length && <TableRow><TableCell colSpan={9}><Typography color="text.secondary" align="center" sx={{ py: 4 }}>Ничего нет.</Typography></TableCell></TableRow>}</TableBody>
          </Table>
        </Paper>}
      </Stack>
      {reviewing && reviewing.item_id != null && <ProjectReviewDialog courseId={reviewing.course_id} itemId={reviewing.item_id} submissionId={reviewing.submission_id} onClose={() => setReviewing(null)} onSaved={reload} onToast={setToast} />}
      {taskDetails && <TaskSubmissionDialog row={taskDetails} onClose={() => setTaskDetails(null)} />}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast?.msg || ''} />
    </Layout>
  );
};
export default TrainerSubmissionsPage;
