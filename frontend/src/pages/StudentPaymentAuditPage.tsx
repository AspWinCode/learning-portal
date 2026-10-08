import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useQuery } from '@tanstack/react-query';

import Layout from '../components/Layout';
import { extractApiError } from '../utils/extractApiError';
import {
  studentPaymentAuditApi,
  type StudentPaymentAuditEntry,
} from '../services/api/studentPaymentAudit';

type FilterKey = 'all' | 'no_payments' | 'group' | 'individual' | 'eight_plus' | 'warnings' | 'duplicates';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'no_payments', label: 'Без оплат' },
  { key: 'group', label: 'Групповые' },
  { key: 'individual', label: 'Индивидуальные' },
  { key: 'eight_plus', label: '8+ занятий' },
  { key: 'warnings', label: 'Проблемы данных' },
  { key: 'duplicates', label: 'Возможные дубли' },
];

const WARNING_LABELS: Record<string, string> = {
  no_payment_but_lessons: 'Есть занятия без оплаты',
  missing_period_start: 'Не задано начало периода',
  period_overflow: 'Период не переведён (8+ занятий)',
  payment_without_lessons: 'Оплата без занятий',
  format_mismatch: 'Формат не совпадает с группой',
  payment_format_mismatch: 'Смешанный формат исторических оплат',
  possible_duplicate: 'Возможный дубль ученика',
};

const rub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

function rowSeverity(entry: StudentPaymentAuditEntry): 'ok' | 'warning' | 'error' {
  if (entry.warnings.includes('no_payment_but_lessons') || entry.possible_duplicate) return 'error';
  if (entry.warnings.length > 0) return 'warning';
  return 'ok';
}

const SEVERITY_BG: Record<'ok' | 'warning' | 'error', string> = {
  ok: 'transparent',
  warning: 'rgba(255, 193, 7, 0.12)',
  error: 'rgba(244, 67, 54, 0.12)',
};

function matchesFilter(entry: StudentPaymentAuditEntry, filter: FilterKey): boolean {
  switch (filter) {
    case 'no_payments':
      return !entry.on_grant && entry.payment_count === 0;
    case 'group':
      return entry.learning_format === 'group';
    case 'individual':
      return entry.learning_format === 'individual';
    case 'eight_plus':
      return (entry.lessons_passed ?? 0) >= 8;
    case 'warnings':
      return entry.warnings.length > 0;
    case 'duplicates':
      return entry.possible_duplicate;
    default:
      return true;
  }
}

const PaymentsList: React.FC<{ entry: StudentPaymentAuditEntry }> = ({ entry }) => {
  if (entry.payments.length === 0) {
    return <Typography variant="body2" color="text.secondary">Платежей нет</Typography>;
  }
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Дата</TableCell>
          <TableCell align="right">Сумма</TableCell>
          <TableCell>Счёт</TableCell>
          <TableCell>Формат</TableCell>
          <TableCell>Finance TX</TableCell>
          <TableCell>Комментарий</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entry.payments.map((p) => (
          <TableRow key={p.transaction_id}>
            <TableCell>{p.date || '—'}</TableCell>
            <TableCell align="right">{rub(p.amount)}</TableCell>
            <TableCell>{p.account_id}</TableCell>
            <TableCell>{p.payment_format || '—'}</TableCell>
            <TableCell>{p.finance_transaction_id ?? '—'}</TableCell>
            <TableCell>{p.note || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

const AuditRow: React.FC<{ entry: StudentPaymentAuditEntry }> = ({ entry }) => {
  const [open, setOpen] = useState(false);
  const severity = rowSeverity(entry);

  return (
    <>
      <TableRow sx={{ backgroundColor: SEVERITY_BG[severity] }}>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen((v) => !v)}>
            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          {entry.student_name}
          {entry.possible_duplicate && (
            <Chip size="small" color="error" label="дубль?" sx={{ ml: 1 }} />
          )}
        </TableCell>
        <TableCell>{entry.learning_format === 'individual' ? 'Индивидуальный' : 'Групповой'}</TableCell>
        <TableCell>{entry.active_group_names.join(', ') || '—'}</TableCell>
        <TableCell align="right">{entry.payment_count}</TableCell>
        <TableCell align="right">{rub(entry.payment_total)}</TableCell>
        <TableCell>{entry.learning_period_start || '—'}</TableCell>
        <TableCell align="right">
          {entry.learning_format === 'individual'
            ? entry.lifetime_lessons_passed ?? '—'
            : entry.period_state === 'missing'
              ? `${entry.lifetime_lessons_count ?? 0} (история)`
              : entry.lessons_passed ?? '—'}
        </TableCell>
        <TableCell align="right">
          {entry.learning_format === 'individual' ? '—' : entry.lessons_remaining ?? '—'}
        </TableCell>
        <TableCell>
          {entry.warnings.length === 0 ? (
            <Chip size="small" color="success" label="ок" />
          ) : (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {entry.warnings.map((w) => (
                <Chip key={w} size="small" color="warning" label={WARNING_LABELS[w] || w} />
              ))}
            </Stack>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={10} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2 }}>
              {entry.data_warning && (
                <Alert severity="warning" sx={{ mb: 1 }}>{entry.data_warning}</Alert>
              )}
              {entry.possible_duplicate && entry.duplicate_student_ids.length > 0 && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  Возможный дубль с id: {entry.duplicate_student_ids.join(', ')}
                </Alert>
              )}
              <PaymentsList entry={entry} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const StudentPaymentAuditPage: React.FC = () => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-payment-audit'],
    queryFn: studentPaymentAuditApi.getAudit,
  });

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.students.filter((e) => {
      if (!matchesFilter(e, filter)) return false;
      if (q && !e.student_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, search]);

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Сверка оплат и занятий</Typography>

        {isLoading && <CircularProgress />}
        {error && <Alert severity="error">{extractApiError(error, 'Не удалось загрузить сверку')}</Alert>}

        {data && (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6} sm={3}>
                <Card><CardContent>
                  <Typography variant="body2" color="text.secondary">Всего учеников</Typography>
                  <Typography variant="h5">{data.summary.students_total}</Typography>
                </CardContent></Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card><CardContent>
                  <Typography variant="body2" color="text.secondary">Есть оплаты</Typography>
                  <Typography variant="h5" color="success.main">{data.summary.with_payments}</Typography>
                </CardContent></Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card><CardContent>
                  <Typography variant="body2" color="text.secondary">Нет ни одной оплаты</Typography>
                  <Typography variant="h5" color="error.main">{data.summary.without_payments}</Typography>
                </CardContent></Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card><CardContent>
                  <Typography variant="body2" color="text.secondary">На гранте</Typography>
                  <Typography variant="h5">{data.summary.grant_students}</Typography>
                </CardContent></Card>
              </Grid>
            </Grid>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  color={filter === f.key ? 'primary' : 'default'}
                  onClick={() => setFilter(f.key)}
                />
              ))}
              <TextField
                size="small"
                placeholder="Поиск по имени"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ ml: 'auto', minWidth: 240 }}
              />
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Ученик</TableCell>
                  <TableCell>Формат</TableCell>
                  <TableCell>Группа</TableCell>
                  <TableCell align="right">Оплат</TableCell>
                  <TableCell align="right">Сумма оплат</TableCell>
                  <TableCell>Начало периода</TableCell>
                  <TableCell align="right">Занятий прошло</TableCell>
                  <TableCell align="right">Осталось из 8</TableCell>
                  <TableCell>Статус данных</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStudents.map((entry) => (
                  <AuditRow key={entry.student_id} entry={entry} />
                ))}
              </TableBody>
            </Table>

            {data.possible_duplicate_payments.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Возможные дубли платежей</Typography>
                {data.possible_duplicate_payments.map((group) => (
                  <Alert key={group.finance_transaction_id} severity="warning" sx={{ mb: 1 }}>
                    finance_transaction_id={group.finance_transaction_id}: {group.transactions.length} проводок
                    {group.transactions.map((t) => ` #${t.transaction_id} (${rub(t.amount)})`).join(', ')}
                  </Alert>
                ))}
              </Box>
            )}

            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Данилова Дарья</Typography>
              {data.danilova_daria.length === 0 && (
                <Typography variant="body2" color="text.secondary">Совпадений не найдено.</Typography>
              )}
              {data.danilova_daria.length > 1 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  Найдено {data.danilova_daria.length} совпадений — записи НЕ объединены автоматически.
                </Alert>
              )}
              {data.danilova_daria.length > 0 && (
                <Table size="small">
                  <TableBody>
                    {data.danilova_daria.map((entry) => (
                      <AuditRow key={entry.student_id} entry={entry} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          </>
        )}
      </Box>
    </Layout>
  );
};

export default StudentPaymentAuditPage;
