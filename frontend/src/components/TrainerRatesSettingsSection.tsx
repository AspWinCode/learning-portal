import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
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
import { ownerCalculationsApi, type TrainerGroupRateRow, type TrainerRateRow } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

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

type RateFieldProps = {
  value: number | null;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
  saveStatus?: RateSaveStatus;
  label: string;
};

const RateField: React.FC<RateFieldProps> = ({ value, disabled, onCommit, saveStatus = 'idle', label }) => {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));

  useEffect(() => {
    setText(value === null || value === undefined ? '' : String(value));
  }, [value]);

  if (disabled) {
    return (
      <Typography variant="body2" color="text.secondary">
        Не применяется
      </Typography>
    );
  }

  const statusLabel = ({
    idle: '',
    saving: 'Сохранение...',
    saved: 'Сохранено',
    error: 'Ошибка сохранения',
  } satisfies Record<RateSaveStatus, string>)[saveStatus];

  return (
    <Stack spacing={0.25}>
      <TextField
        size="small"
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(rateValueFromInput(text))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit(rateValueFromInput(text));
          }
        }}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        inputProps={{ min: 0, step: 0.01 }}
        aria-label={label}
        sx={{
          width: { xs: '100%', sm: 132 },
          '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 },
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

const TrainerRatesSettingsSection: React.FC = () => {
  const [rows, setRows] = useState<TrainerRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef<TrainerRateRow[]>([]);
  const rateSavesRef = useRef<Map<number, RateSaveEntry>>(new Map());
  const mountedRef = useRef(true);
  const [rateSaveStatuses, setRateSaveStatuses] = useState<Record<number, RateSaveStatus>>({});

  const setRowsData = useCallback((next: TrainerRateRow[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  const setRateSaveStatus = useCallback((groupId: number, status: RateSaveStatus) => {
    if (!mountedRef.current) return;
    setRateSaveStatuses((prev) => ({ ...prev, [groupId]: status }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ownerCalculationsApi.getTrainerRates();
      setRowsData(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить ставки тренеров'));
    } finally {
      setLoading(false);
    }
  }, [setRowsData]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      rateSavesRef.current.forEach((entry) => {
        if (entry.timer) clearTimeout(entry.timer);
      });
    };
  }, [load]);

  const flushGroupRate = useCallback(async (groupId: number) => {
    const entry = rateSavesRef.current.get(groupId);
    if (!entry || entry.inFlight) return;

    if (entry.saved && sameRatePayload(entry.saved, entry.desired)) {
      setRateSaveStatus(groupId, 'saved');
      return;
    }

    const payload = { ...entry.desired };
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

      if (mountedRef.current) {
        setRowsData(
          rowsRef.current.map((row) => ({
            ...row,
            groups: row.groups.map((g) =>
              g.group_id === groupId
                ? { ...g, rate_per_lesson: persistedPayload.rate_per_lesson, rate_per_hour: persistedPayload.rate_per_hour }
                : g,
            ),
          })),
        );
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

      if (!sameRatePayload(entry.saved, entry.desired)) {
        setRateSaveStatus(groupId, 'saving');
        void flushGroupRate(groupId);
      } else if (!requestFailed) {
        setRateSaveStatus(groupId, 'saved');
      }
    }
  }, [setRateSaveStatus, setRowsData]);

  const handleCommit = (groupId: number, patch: { rate_per_lesson?: number | null; rate_per_hour?: number | null }) => {
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
    setRateSaveStatus(groupId, 'saving');
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    void flushGroupRate(groupId);
  };

  const getRateSaveStatus = (groupId: number): RateSaveStatus => rateSaveStatuses[groupId] || 'idle';

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Ставки задаются на уровне группы и не зависят от выбранного периода в «Расчётах» — там они только
        отображаются. Новые группы появляются здесь автоматически по мере создания.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Typography color="text.secondary">Нет активных тренеров.</Typography>
      ) : (
        <Stack spacing={2.5}>
          {rows.map((row) => (
            <Box key={row.trainer_id}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
                {row.full_name}
              </Typography>
              {row.groups.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Нет активных групп.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Группа</TableCell>
                        <TableCell sx={{ width: 160 }}>Ставка за урок</TableCell>
                        <TableCell sx={{ width: 160 }}>Ставка за час</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {row.groups.map((g: TrainerGroupRateRow) => (
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
                              label={`Ставка за урок — ${g.group_name}`}
                              disabled={g.is_individual_format}
                              value={g.rate_per_lesson}
                              onCommit={(value) => handleCommit(g.group_id, { rate_per_lesson: value })}
                              saveStatus={getRateSaveStatus(g.group_id)}
                            />
                          </TableCell>
                          <TableCell>
                            <RateField
                              label={`Ставка за час — ${g.group_name}`}
                              disabled={!g.is_individual_format}
                              value={g.rate_per_hour}
                              onCommit={(value) => handleCommit(g.group_id, { rate_per_hour: value })}
                              saveStatus={getRateSaveStatus(g.group_id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
};

export default TrainerRatesSettingsSection;
