import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { campaignsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { SchoolCampaignEvent } from '../types';
import {
  INVITE_STATUSES,
  PARTICIPATION_STATUSES,
  HOST_STATUSES,
  getInviteLabel,
  getParticipationLabel,
  getHostLabel,
} from '../constants/campaignEventStages';
import type { SchoolsEventsMatrix } from '../types';

interface CampaignMatrixSubTabProps {
  campaignId: number;
  onError: (msg: string | null) => void;
  canManage: boolean;
}

export const CampaignMatrixSubTab: React.FC<CampaignMatrixSubTabProps> = ({ campaignId, onError, canManage }) => {
  const [matrix, setMatrix] = useState<SchoolsEventsMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [cellEditOpen, setCellEditOpen] = useState(false);
  const [cellEditEventId, setCellEditEventId] = useState<number | null>(null);
  const [cellEditSchoolCampaignId, setCellEditSchoolCampaignId] = useState<number | null>(null);
  const [cellEditSchoolName, setCellEditSchoolName] = useState<string>('');
  const [cellEditEventTitle, setCellEditEventTitle] = useState<string>('');
  const [cellEditForm, setCellEditForm] = useState({
    invite_status: 'not_invited',
    participation_status: 'not_planned',
    host_status: 'not_host',
    participant_count: '' as number | '',
    notes: '',
  });
  const [cellEditSaving, setCellEditSaving] = useState(false);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const data = await campaignsApi.getSchoolsEventsMatrix(campaignId);
      setMatrix(data);
    } catch (err: any) {
      onError(extractApiError(err, 'Не удалось загрузить матрицу'));
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId, onError]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const sceMap = useMemo(() => {
    if (!matrix) return new Map<string, SchoolCampaignEvent>();
    const m = new Map<string, SchoolCampaignEvent>();
    matrix.school_campaign_events.forEach((sce) => {
      m.set(`${sce.school_campaign_id}:${sce.campaign_event_id}`, sce);
    });
    return m;
  }, [matrix]);

  const getCellData = (schoolId: number, eventId: number) => {
    return sceMap.get(`${schoolId}:${eventId}`) ?? null;
  };

  const openCellEdit = (schoolCampaignId: number, eventId: number, schoolName: string, eventTitle: string) => {
    const sce = getCellData(schoolCampaignId, eventId);
    setCellEditEventId(eventId);
    setCellEditSchoolCampaignId(schoolCampaignId);
    setCellEditSchoolName(schoolName);
    setCellEditEventTitle(eventTitle);
    setCellEditForm({
      invite_status: sce?.invite_status ?? 'not_invited',
      participation_status: sce?.participation_status ?? 'not_planned',
      host_status: sce?.host_status ?? 'not_host',
      participant_count: sce?.participant_count ?? '',
      notes: sce?.notes ?? '',
    });
    setCellEditOpen(true);
  };

  const handleSaveCellEdit = async () => {
    if (cellEditEventId == null || cellEditSchoolCampaignId == null) return;
    setCellEditSaving(true);
    onError(null);
    try {
      await campaignsApi.upsertSchoolCampaignEvent(campaignId, cellEditEventId, cellEditSchoolCampaignId, {
        invite_status: cellEditForm.invite_status,
        participation_status: cellEditForm.participation_status,
        host_status: cellEditForm.host_status,
        participant_count: cellEditForm.participant_count === '' ? undefined : Number(cellEditForm.participant_count),
        notes: cellEditForm.notes.trim() || undefined,
      });
      setCellEditOpen(false);
      setCellEditEventId(null);
      setCellEditSchoolCampaignId(null);
      await loadMatrix();
    } catch (err: any) {
      onError(extractApiError(err, 'Не удалось сохранить'));
    } finally {
      setCellEditSaving(false);
    }
  };

  if (loading || !matrix) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography color="text.secondary">{loading ? 'Загрузка матрицы…' : 'Нет данных'}</Typography>
      </Box>
    );
  }

  const { schools, events } = matrix;
  if (schools.length === 0) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography color="text.secondary">В кампании пока нет школ. Добавьте школы во вкладке «Общая работа».</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Строки — школы, столбцы — джемы. Клик по ячейке открывает редактирование записи школы в джеме.
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 800 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 160, position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }}>Школа</TableCell>
              <TableCell sx={{ minWidth: 100, position: 'sticky', left: 160, bgcolor: 'background.paper', zIndex: 1 }}>Город</TableCell>
              <TableCell sx={{ minWidth: 120, position: 'sticky', left: 260, bgcolor: 'background.paper', zIndex: 1 }}>Общая стадия</TableCell>
              <TableCell sx={{ minWidth: 80, position: 'sticky', left: 380, bgcolor: 'background.paper', zIndex: 1 }} align="center">Участий</TableCell>
              <TableCell sx={{ minWidth: 80, position: 'sticky', left: 460, bgcolor: 'background.paper', zIndex: 1 }} align="center">Площадок</TableCell>
              {events.map((ev) => (
                <TableCell key={ev.id} align="center" sx={{ minWidth: 140 }}>
                  <Typography variant="caption" display="block" fontWeight="medium">{ev.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{ev.event_date ? format(parseISO(ev.event_date), 'dd.MM.yy') : ''}</Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {schools.map((school) => {
              const invitedCount = matrix.school_campaign_events.filter(
                (sce) => sce.school_campaign_id === school.id && ['invited', 'awaiting_reply', 'accepted', 'declined'].includes(sce.invite_status)
              ).length;
              const participatedCount = matrix.school_campaign_events.filter(
                (sce) => sce.school_campaign_id === school.id && sce.participation_status === 'participated'
              ).length;
              const hostedCount = matrix.school_campaign_events.filter(
                (sce) => sce.school_campaign_id === school.id && ['host_proposed', 'host_confirmed', 'hosted'].includes(sce.host_status)
              ).length;
              return (
                <TableRow key={school.id} hover>
                  <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper' }}>{school.school_name ?? `#${school.b2b_school_id}`}</TableCell>
                  <TableCell sx={{ position: 'sticky', left: 160, bgcolor: 'background.paper' }}>{school.school_city ?? '—'}</TableCell>
                  <TableCell sx={{ position: 'sticky', left: 260, bgcolor: 'background.paper' }}>{school.stage}</TableCell>
                  <TableCell sx={{ position: 'sticky', left: 380, bgcolor: 'background.paper' }} align="center">{participatedCount}</TableCell>
                  <TableCell sx={{ position: 'sticky', left: 460, bgcolor: 'background.paper' }} align="center">{hostedCount}</TableCell>
                  {events.map((ev) => {
                    const sce = getCellData(school.id, ev.id);
                    const hasInvite = sce && sce.invite_status !== 'not_invited';
                    const hasPart = sce && sce.participation_status !== 'not_planned';
                    const hasHost = sce && sce.host_status !== 'not_host';
                    const hasDecline = sce && (sce.invite_status === 'declined' || sce.participation_status === 'declined' || sce.host_status === 'host_declined');
                    const hasNoShow = sce && sce.participation_status === 'no_show';
                    return (
                      <TableCell
                        key={ev.id}
                        align="center"
                        onClick={() => {
                          if (canManage) openCellEdit(school.id, ev.id, school.school_name ?? '', ev.title);
                        }}
                        sx={{
                          cursor: canManage ? 'pointer' : 'default',
                          verticalAlign: 'top',
                          minWidth: 140,
                          borderLeft: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Stack direction="column" spacing={0.25} alignItems="center">
                          {hasInvite && <Chip size="small" label="Пригл." sx={{ fontSize: '0.7rem' }} color="default" />}
                          {hasPart && <Chip size="small" label="Участв." sx={{ fontSize: '0.7rem' }} color="primary" />}
                          {hasHost && <Chip size="small" label="Площадка" sx={{ fontSize: '0.7rem' }} color="secondary" />}
                          {hasDecline && <Chip size="small" label="Отказ" sx={{ fontSize: '0.7rem' }} color="error" />}
                          {hasNoShow && <Chip size="small" label="No-show" sx={{ fontSize: '0.7rem' }} />}
                          {!hasInvite && !hasPart && !hasHost && !hasDecline && !hasNoShow && (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </Stack>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={cellEditOpen} onClose={() => setCellEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Ячейка: {cellEditSchoolName} · {cellEditEventTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Приглашение</InputLabel>
              <Select
                value={cellEditForm.invite_status}
                label="Приглашение"
                onChange={(e) => setCellEditForm((f) => ({ ...f, invite_status: e.target.value }))}
              >
                {INVITE_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Участие</InputLabel>
              <Select
                value={cellEditForm.participation_status}
                label="Участие"
                onChange={(e) => setCellEditForm((f) => ({ ...f, participation_status: e.target.value }))}
              >
                {PARTICIPATION_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Площадка</InputLabel>
              <Select
                value={cellEditForm.host_status}
                label="Площадка"
                onChange={(e) => setCellEditForm((f) => ({ ...f, host_status: e.target.value }))}
              >
                {HOST_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Кол-во детей"
              type="number"
              size="small"
              value={cellEditForm.participant_count}
              onChange={(e) => setCellEditForm((f) => ({ ...f, participant_count: e.target.value === '' ? '' : Number(e.target.value) }))}
              fullWidth
              InputProps={{ inputProps: { min: 0 } }}
            />
            <TextField
              label="Комментарий"
              value={cellEditForm.notes}
              onChange={(e) => setCellEditForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCellEditOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveCellEdit} disabled={cellEditSaving}>{cellEditSaving ? 'Сохранение…' : 'Сохранить'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
