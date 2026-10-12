import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import {
  Add as AddIcon,
  DoneAll,
  ExpandLess,
  ExpandMore,
  Payments,
  ReceiptLong,
} from '@mui/icons-material';
import { ownerCalculationsApi, type TrainerCalculationRow, type TrainerGroupCalculationRow } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const getDefaultMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const getMonthRange = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0);
  return {
    dateFrom: formatDateInput(start),
    dateTo: formatDateInput(end),
  };
};

const formatDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDecimal = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value || 0);

const formatRange = (dateFrom: string, dateTo: string) => {
  if (!dateFrom || !dateTo) return 'выбранный период';
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `${dateFrom} — ${dateTo}`;
  const formatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${formatter.format(from)} — ${formatter.format(to)}`;
};

const getPeriodKey = (dateFrom: string, dateTo: string) => {
  if (dateFrom && dateTo) {
    const month = dateFrom.slice(0, 7);
    const range = getMonthRange(month);
    if (dateFrom === range.dateFrom && dateTo === range.dateTo) return month;
  }
  return `${dateFrom}_${dateTo}`;
};

type RateFieldProps = {
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  onCommit: (value: number | null) => void;
  saveStatus?: RateSaveStatus;
  label: string;
};

type RateSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type RatePayload = {
  rate_per_lesson: number | null;
  rate_per_hour: number | null;
};

type RateSaveEntry = {
  desired: RatePayload;
  saved: RatePayload | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
};

const sameRatePayload = (left: RatePayload | null, right: RatePayload | null) =>
  !!left && !!right && left.rate_per_lesson === right.rate_per_lesson && left.rate_per_hour === right.rate_per_hour;

const rateValueFromInput = (value: string): number | null => {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const RateField: React.FC<RateFieldProps> = ({ value, disabled, onChange, onCommit, saveStatus = 'idle', label }) => {
  if (disabled) {
    return (
      <Typography variant="body2" color="text.secondary">
        Не применяется
      </Typography>
    );
  }

  const statusLabel = {
    saving: 'Сохранение...',
    saved: 'Сохранено',
    error: 'Ошибка сохранения',
  }[saveStatus];

  return (
    <Stack spacing={0.25}>
      <TextField
        size="small"
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(rateValueFromInput(e.target.value))}
        onBlur={(e) => onCommit(rateValueFromInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit(rateValueFromInput((e.target as HTMLInputElement).value));
          }
        }}
        inputProps={{ min: 0, step: 0.01 }}
        aria-label={label}
        sx={{
          width: { xs: '100%', sm: 132 },
          '& .MuiOutlinedInput-root': {
            bgcolor: '#fff',
            borderRadius: 2,
          },
        }}
      />
      {statusLabel && (
        <Typography
          variant="caption"
          color={saveStatus === 'error' ? 'error.main' : saveStatus === 'saved' ? 'success.main' : 'text.secondary'}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {statusLabel}
        </Typography>
      )}
    </Stack>
  );
};

type GroupRatesTableProps = {
  groups: TrainerGroupCalculationRow[];
  onChange: (groupId: number, patch: Partial<TrainerGroupCalculationRow>) => void;
  onCommit: (groupId: number, payload: { rate_per_lesson?: number | null; rate_per_hour?: number | null }) => void;
  getSaveStatus: (groupId: number) => RateSaveStatus;
};

const GroupRatesTable: React.FC<GroupRatesTableProps> = ({ groups, onChange, onCommit, getSaveStatus }) => (
  <Box sx={{ px: { xs: 0, md: 2 }, py: 1.5, bgcolor: 'rgba(248, 250, 252, 0.6)' }}>
    <Typography variant="caption" color="text.secondary" sx={{ px: { xs: 1.5, md: 0 }, display: 'block', mb: 0.5 }}>
      Ставка задаётся по каждой группе отдельно — разные группы одного тренера могут стоить по-разному.
    </Typography>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Группа</TableCell>
          <TableCell sx={{ width: 150 }}>Ставка за урок</TableCell>
          <TableCell sx={{ width: 150 }}>Ставка за час</TableCell>
          <TableCell align="right">Нагрузка</TableCell>
          <TableCell align="right">Сумма</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {groups.map((g) => (
          <TableRow key={g.group_id}>
            <TableCell>
              <Typography variant="body2" fontWeight={700}>
                {g.group_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {g.is_individual_format ? 'Индивидуальный формат' : 'Групповой формат'}
              </Typography>
            </TableCell>
            <TableCell>
              <RateField
                label="Ставка за урок для группы"
                disabled={g.is_individual_format}
                value={g.rate_per_lesson}
                onChange={(value) => onChange(g.group_id, { rate_per_lesson: value })}
                onCommit={(value) => onCommit(g.group_id, { rate_per_lesson: value })}
                saveStatus={getSaveStatus(g.group_id)}
              />
            </TableCell>
            <TableCell>
              <RateField
                label="Ставка за час для группы"
                disabled={!g.is_individual_format}
                value={g.rate_per_hour}
                onChange={(value) => onChange(g.group_id, { rate_per_hour: value })}
                onCommit={(value) => onCommit(g.group_id, { rate_per_hour: value })}
                saveStatus={getSaveStatus(g.group_id)}
              />
            </TableCell>
            <TableCell align="right">
              {g.is_individual_format ? `${formatDecimal(g.hours_count)} ч` : `${g.lessons_count} уроков`}
            </TableCell>
            <TableCell align="right">{formatCurrency(g.subtotal)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Box>
);

const CalculationsPage: React.FC = () => {
  const defaultRange = useMemo(() => getMonthRange(getDefaultMonth()), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [rows, setRows] = useState<TrainerCalculationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bonusDialog, setBonusDialog] = useState<{ trainerId: number; fullName: string } | null>(null);
  const [bonusAmount, setBonusAmount] = useState<string>('');
  const [bonusSaving, setBonusSaving] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [cancelDialog, setCancelDialog] = useState<{ trainerId: number; fullName: string } | null>(null);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [expandedTrainerId, setExpandedTrainerId] = useState<number | null>(null);
  const rowsRef = useRef<TrainerCalculationRow[]>([]);
  const rateSavesRef = useRef<Map<number, RateSaveEntry>>(new Map());
  const rateRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const [rateSaveStatuses, setRateSaveStatuses] = useState<Record<number, RateSaveStatus>>({});
  const periodKey = useMemo(() => getPeriodKey(dateFrom, dateTo), [dateFrom, dateTo]);
  const periodLabel = useMemo(() => formatRange(dateFrom, dateTo), [dateFrom, dateTo]);

  const setRowsData = useCallback((nextRows: TrainerCalculationRow[]) => {
    rowsRef.current = nextRows;
    setRows(nextRows);
  }, []);

  const setRateSaveStatus = useCallback((groupId: number, status: RateSaveStatus) => {
    if (!mountedRef.current) return;
    setRateSaveStatuses((previous) => ({ ...previous, [groupId]: status }));
  }, []);

  const summary = useMemo(
    () => ({
      trainers: rows.length,
      lessons: rows.reduce((acc, row) => acc + (row.is_individual_format ? 0 : row.lessons_count), 0),
      hours: rows.reduce((acc, row) => acc + (row.is_individual_format ? row.hours_count : 0), 0),
      bonus: rows.reduce((acc, row) => acc + row.bonus, 0),
      total: rows.reduce((acc, row) => acc + row.total_payment, 0),
      unpaid: rows.reduce((acc, row) => acc + (row.already_paid ? 0 : row.total_payment), 0),
      paid: rows.filter((row) => row.already_paid).length,
      groupPayment: rows.reduce(
        (acc, row) =>
          acc + row.groups.reduce((sum, g) => sum + (g.is_individual_format ? 0 : g.subtotal), 0),
        0,
      ),
      individualPayment: rows.reduce(
        (acc, row) =>
          acc + row.groups.reduce((sum, g) => sum + (g.is_individual_format ? g.subtotal : 0), 0),
        0,
      ),
    }),
    [rows],
  );

  const load = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      setRowsData([]);
      setError('Выберите дату начала и дату окончания');
      setLoading(false);
      return;
    }
    if (dateFrom > dateTo) {
      setRowsData([]);
      setError('Дата начала не должна быть позже даты окончания');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const revisionAtRequest = rateRevisionRef.current;
    try {
      const data = await ownerCalculationsApi.getTrainers({ period: periodKey, date_from: dateFrom, date_to: dateTo });
      if (rateRevisionRef.current === revisionAtRequest) setRowsData(data);
    } catch (err: any) {
      if (rateRevisionRef.current === revisionAtRequest) {
        setError(extractApiError(err, 'Не удалось загрузить расчёты'));
        setRowsData([]);
      }
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, periodKey, setRowsData]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddBonus = async () => {
    if (!bonusDialog || bonusAmount === '' || Number.isNaN(Number(bonusAmount))) return;
    setBonusSaving(true);
    setError(null);
    try {
      await ownerCalculationsApi.addBonus(bonusDialog.trainerId, periodKey, Number(bonusAmount));
      setBonusDialog(null);
      setBonusAmount('');
      load();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить премию'));
    } finally {
      setBonusSaving(false);
    }
  };

  const handlePay = async (trainerId: number) => {
    setPayingId(trainerId);
    setError(null);
    try {
      await ownerCalculationsApi.pay(trainerId, { period: periodKey, date_from: dateFrom, date_to: dateTo });
      load();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось оформить выплату'));
    } finally {
      setPayingId(null);
    }
  };

  const handleCancelPay = async () => {
    if (!cancelDialog) return;
    setCancelSaving(true);
    setError(null);
    try {
      await ownerCalculationsApi.cancelPay(cancelDialog.trainerId, { period: periodKey, date_from: dateFrom, date_to: dateTo });
      setCancelDialog(null);
      load();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отменить выплату'));
    } finally {
      setCancelSaving(false);
    }
  };

  const updateGroupRow = (trainerId: number, groupId: number, patch: Partial<TrainerGroupCalculationRow>) => {
    const nextRows = rowsRef.current.map((row) =>
      row.trainer_id === trainerId
        ? { ...row, groups: row.groups.map((g) => (g.group_id === groupId ? { ...g, ...patch } : g)) }
        : row,
    );
    setRowsData(nextRows);
  };

  const flushGroupRate = useCallback(async (groupId: number) => {
    const entry = rateSavesRef.current.get(groupId);
    if (!entry || entry.inFlight) return;

    if (entry.saved && sameRatePayload(entry.saved, entry.desired)) {
      setRateSaveStatus(groupId, 'saved');
      return;
    }

    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    const payload = { ...entry.desired };
    const revisionAtRequest = rateRevisionRef.current;
    entry.inFlight = true;
    setRateSaveStatus(groupId, 'saving');
    let requestFailed = false;

    try {
      const persisted = await ownerCalculationsApi.updateGroupRate(groupId, payload);
      const persistedPayload = {
        rate_per_lesson: persisted.rate_per_lesson === undefined ? payload.rate_per_lesson : persisted.rate_per_lesson,
        rate_per_hour: persisted.rate_per_hour === undefined ? payload.rate_per_hour : persisted.rate_per_hour,
      };
      if (!sameRatePayload(persistedPayload, payload)) {
        throw new Error('Сервер вернул другое значение ставки');
      }
      entry.saved = persistedPayload;

      // Refresh the calculated subtotal/payment after the newest PUT. A GET
      // started for an older edit must not overwrite a newer local draft.
      const data = await ownerCalculationsApi.getTrainers({ period: periodKey, date_from: dateFrom, date_to: dateTo });
      if (mountedRef.current && rateRevisionRef.current === revisionAtRequest) {
        setRowsData(data.map((row) => ({
          ...row,
          groups: row.groups.map((group) => group.group_id === groupId ? {
            ...group,
            rate_per_lesson: persistedPayload.rate_per_lesson,
            rate_per_hour: persistedPayload.rate_per_hour,
          } : group),
        })));
      }
    } catch (err: any) {
      requestFailed = true;
      if (mountedRef.current) {
        setRateSaveStatus(groupId, 'error');
        setError(extractApiError(err, 'Не удалось сохранить ставку группы'));
      }
    } finally {
      entry.inFlight = false;
      if (!mountedRef.current) return;

      // A newer value may have been typed while the previous PUT/GET was in
      // flight. Never let the older response mark that newer value as saved.
      if (!sameRatePayload(entry.saved, entry.desired)) {
        setRateSaveStatus(groupId, 'saving');
        void flushGroupRate(groupId);
      } else if (!requestFailed) {
        setRateSaveStatus(groupId, 'saved');
      }
    }
  }, [dateFrom, dateTo, periodKey, setRateSaveStatus, setRowsData]);

  const scheduleGroupRateSave = useCallback((
    groupId: number,
    patch: { rate_per_lesson?: number | null; rate_per_hour?: number | null },
    immediate = false,
  ) => {
    const group = rowsRef.current.flatMap((row) => row.groups).find((candidate) => candidate.group_id === groupId);
    if (!group) return;

    const existing = rateSavesRef.current.get(groupId);
    const entry: RateSaveEntry = existing || {
      desired: { rate_per_lesson: group.rate_per_lesson, rate_per_hour: group.rate_per_hour },
      saved: { rate_per_lesson: group.rate_per_lesson, rate_per_hour: group.rate_per_hour },
      timer: null,
      inFlight: false,
    };
    entry.desired = {
      rate_per_lesson: patch.rate_per_lesson === undefined ? entry.desired.rate_per_lesson : patch.rate_per_lesson,
      rate_per_hour: patch.rate_per_hour === undefined ? entry.desired.rate_per_hour : patch.rate_per_hour,
    };
    rateSavesRef.current.set(groupId, entry);
    rateRevisionRef.current += 1;
    setRateSaveStatus(groupId, 'saving');

    if (entry.timer) clearTimeout(entry.timer);
    if (immediate) {
      entry.timer = null;
      void flushGroupRate(groupId);
    } else {
      entry.timer = setTimeout(() => {
        entry.timer = null;
        void flushGroupRate(groupId);
      }, 600);
    }
  }, [flushGroupRate, setRateSaveStatus]);

  const getRateSaveStatus = useCallback(
    (groupId: number): RateSaveStatus => rateSaveStatuses[groupId] || 'idle',
    [rateSaveStatuses],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      rateSavesRef.current.forEach((entry) => {
        if (entry.timer) clearTimeout(entry.timer);
      });
    };
  }, []);

  const handleGroupRateCommit = (
    groupId: number,
    payload: { rate_per_lesson?: number | null; rate_per_hour?: number | null },
  ) => scheduleGroupRateSave(groupId, payload, true);

  const handleGroupRateChange = (trainerId: number, groupId: number, patch: Partial<TrainerGroupCalculationRow>) => {
    scheduleGroupRateSave(groupId, {
      ...(patch.rate_per_lesson !== undefined ? { rate_per_lesson: patch.rate_per_lesson } : {}),
      ...(patch.rate_per_hour !== undefined ? { rate_per_hour: patch.rate_per_hour } : {}),
    });
    updateGroupRow(trainerId, groupId, patch);
  };

  const renderActions = (row: TrainerCalculationRow) => (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setBonusDialog({ trainerId: row.trainer_id, fullName: row.full_name })}
        sx={{ whiteSpace: 'nowrap' }}
      >
        Премия
      </Button>
      {row.already_paid ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip color="success" icon={<DoneAll />} label="Выплачено" variant="outlined" />
          <Button
            size="small"
            color="error"
            variant="text"
            onClick={() => setCancelDialog({ trainerId: row.trainer_id, fullName: row.full_name })}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Отменить
          </Button>
        </Stack>
      ) : (
        <Button
          size="small"
          variant="contained"
          color="primary"
          disabled={payingId === row.trainer_id}
          onClick={() => handlePay(row.trainer_id)}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {payingId === row.trainer_id ? 'Оформление...' : 'Выплатить'}
        </Button>
      )}
    </Stack>
  );

  return (
    <Layout>
      <Stack spacing={2.5}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 2.5 },
            borderRadius: 3,
            borderColor: 'rgba(15, 23, 42, 0.08)',
            boxShadow: '0 14px 35px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h6" fontWeight={900}>
                Расчёты за {periodLabel}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ставки, премии и выплаты тренерам за выбранный период.
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
              <TextField
                label="С даты"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{
                  width: { xs: '100%', sm: 180 },
                  '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 },
                }}
              />
              <TextField
                label="До даты"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{
                  width: { xs: '100%', sm: 180 },
                  '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 },
                }}
              />
            </Stack>
          </Stack>

          <Box
            sx={{
              mt: 2,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 1.25,
            }}
          >
            {[
              { label: 'К выплате', value: formatCurrency(summary.total), icon: <Payments color="primary" /> },
              { label: 'Не выплачено', value: formatCurrency(summary.unpaid), icon: <ReceiptLong color="warning" /> },
              { label: 'Премии', value: formatCurrency(summary.bonus), icon: <AddIcon color="success" /> },
              { label: 'Тренеры', value: `${summary.trainers}`, icon: <DoneAll color="action" /> },
              {
                label: 'Оплата групповые занятия',
                value: formatCurrency(summary.groupPayment),
                icon: <Payments color="primary" />,
              },
              {
                label: 'Оплата индивидуальные',
                value: formatCurrency(summary.individualPayment),
                icon: <Payments color="primary" />,
              },
            ].map((item) => (
              <Paper
                key={item.label}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  bgcolor: 'rgba(248, 250, 252, 0.78)',
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: '#fff',
                      boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)',
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {item.label}
                    </Typography>
                    <Typography variant="h6" fontWeight={900} noWrap>
                      {item.value}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Paper
          variant="outlined"
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            borderColor: 'rgba(15, 23, 42, 0.08)',
            boxShadow: '0 14px 35px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            sx={{ px: 2, py: 1.75, bgcolor: '#fff' }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={900}>
                Тренеры
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Проведено: {summary.lessons} уроков, {formatDecimal(summary.hours)} часов. Выплачено: {summary.paid} из {summary.trainers}.
              </Typography>
            </Box>
          </Stack>
          <Divider />

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : rows.length === 0 ? (
            <Box sx={{ px: 2, py: 6, textAlign: 'center' }}>
              <Typography fontWeight={800}>Нет тренеров для расчёта</Typography>
              <Typography variant="body2" color="text.secondary">
                Выберите другой период или проверьте настройки тренеров.
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
                <Table>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': {
                          bgcolor: 'rgba(248, 250, 252, 0.95)',
                          color: 'text.secondary',
                          fontWeight: 800,
                          borderBottomColor: 'rgba(15, 23, 42, 0.08)',
                        },
                      }}
                    >
                      <TableCell sx={{ width: 44 }} />
                      <TableCell sx={{ width: 56 }}>№</TableCell>
                      <TableCell>Тренер</TableCell>
                      <TableCell align="right">Нагрузка</TableCell>
                      <TableCell align="right">Оплата</TableCell>
                      <TableCell align="right">Премия</TableCell>
                      <TableCell align="right">Итого</TableCell>
                      <TableCell sx={{ width: 220 }}>Действия</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <React.Fragment key={row.trainer_id}>
                      <TableRow hover sx={{ '& td': { py: 1.5 } }}>
                        <TableCell>
                          {row.groups.length > 0 && (
                            <IconButton
                              size="small"
                              onClick={() =>
                                setExpandedTrainerId((prev) => (prev === row.trainer_id ? null : row.trainer_id))
                              }
                            >
                              {expandedTrainerId === row.trainer_id ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                          )}
                        </TableCell>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={800}>
                            {row.full_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.is_individual_format ? 'Индивидуальный формат' : 'Групповой формат'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={800}>
                            {row.is_individual_format ? `${formatDecimal(row.hours_count)} ч` : `${row.lessons_count} уроков`}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{formatCurrency(row.base_payment)}</TableCell>
                        <TableCell align="right">{formatCurrency(row.bonus)}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={900}>{formatCurrency(row.total_payment)}</Typography>
                        </TableCell>
                        <TableCell>{renderActions(row)}</TableCell>
                      </TableRow>
                      {row.groups.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={7} sx={{ p: 0, borderBottom: expandedTrainerId === row.trainer_id ? undefined : 'none' }}>
                            <Collapse in={expandedTrainerId === row.trainer_id} unmountOnExit>
                              <GroupRatesTable
                                groups={row.groups}
                                onChange={(groupId, patch) => handleGroupRateChange(row.trainer_id, groupId, patch)}
                                onCommit={handleGroupRateCommit}
                                getSaveStatus={getRateSaveStatus}
                              />
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' }, p: 1.25 }}>
                {rows.map((row, idx) => (
                  <Paper key={row.trainer_id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack spacing={1.25}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" color="text.secondary">
                            № {idx + 1}
                          </Typography>
                          <Typography fontWeight={900}>{row.full_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.is_individual_format ? 'Индивидуальный формат' : 'Групповой формат'}
                          </Typography>
                        </Box>
                        {row.already_paid ? <Chip color="success" size="small" label="Выплачено" /> : null}
                      </Stack>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Оплата
                          </Typography>
                          <Typography fontWeight={800}>{formatCurrency(row.base_payment)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Итого
                          </Typography>
                          <Typography fontWeight={900}>{formatCurrency(row.total_payment)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Нагрузка
                          </Typography>
                          <Typography fontWeight={800}>
                            {row.is_individual_format ? `${formatDecimal(row.hours_count)} ч` : `${row.lessons_count} уроков`}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Премия
                          </Typography>
                          <Typography fontWeight={800}>{formatCurrency(row.bonus)}</Typography>
                        </Box>
                      </Box>

                      {row.groups.length > 0 && (
                        <>
                          <Button
                            size="small"
                            onClick={() =>
                              setExpandedTrainerId((prev) => (prev === row.trainer_id ? null : row.trainer_id))
                            }
                            endIcon={expandedTrainerId === row.trainer_id ? <ExpandLess /> : <ExpandMore />}
                          >
                            Ставки по группам ({row.groups.length})
                          </Button>
                          <Collapse in={expandedTrainerId === row.trainer_id} unmountOnExit>
                            <GroupRatesTable
                              groups={row.groups}
                              onChange={(groupId, patch) => handleGroupRateChange(row.trainer_id, groupId, patch)}
                              onCommit={handleGroupRateCommit}
                              getSaveStatus={getRateSaveStatus}
                            />
                          </Collapse>
                        </>
                      )}
                      {renderActions(row)}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </>
          )}
        </Paper>
      </Stack>

      <Dialog open={!!bonusDialog} onClose={() => setBonusDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Добавить премию</DialogTitle>
        <DialogContent>
          {bonusDialog && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Тренер: {bonusDialog.fullName}
            </Typography>
          )}
          <TextField
            fullWidth
            label="Сумма премии, ₽"
            type="number"
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
            inputProps={{ min: 0, step: 0.01 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBonusDialog(null)}>Отмена</Button>
          <Button onClick={handleAddBonus} variant="contained" disabled={bonusSaving || !bonusAmount}>
            {bonusSaving ? 'Сохранение...' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!cancelDialog} onClose={() => setCancelDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Отменить выплату?</DialogTitle>
        <DialogContent>
          {cancelDialog && (
            <Typography variant="body2" color="text.secondary">
              Выплата тренеру «{cancelDialog.fullName}» за {periodLabel} будет удалена вместе со связанной записью в
              финансовом журнале. Период снова станет доступен для выплаты.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialog(null)}>Отмена</Button>
          <Button onClick={handleCancelPay} variant="contained" color="error" disabled={cancelSaving}>
            {cancelSaving ? 'Отмена выплаты...' : 'Отменить выплату'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default CalculationsPage;
