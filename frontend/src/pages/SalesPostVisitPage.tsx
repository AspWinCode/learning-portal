import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { Lead } from '../types';

const SalesPostVisitPage: React.FC = () => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stageDialog, setStageDialog] = useState<{
    lead: Lead;
    stage: 'project_agreed' | 'course_agreed' | 'declined';
  } | null>(null);
  const [review, setReview] = useState('');
  const [projectDate, setProjectDate] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [savingStage, setSavingStage] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      const data = await salesApi.listPostVisitLeads();
      setLeads(data);
      setError(null);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить лидов для дожима'));
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const stageOrder: Array<{
    id: 'new' | 'project_offer' | 'course_offer' | 'project_agreed' | 'course_agreed' | 'declined';
    title: string;
  }> = [
    { id: 'new', title: 'Новые' },
    { id: 'project_offer', title: 'Предложили до создать проект' },
    { id: 'course_offer', title: 'Предложили заниматься' },
    { id: 'project_agreed', title: 'Согласились доделать проект' },
    { id: 'course_agreed', title: 'Согласились заниматься' },
    { id: 'declined', title: 'Отказались' },
  ];

  const leadsByStage: Record<string, Lead[]> = stageOrder.reduce((acc, s) => {
    acc[s.id] = [];
    return acc;
  }, {} as Record<string, Lead[]>);

  leads.forEach((lead) => {
    const stage = (lead.post_visit_stage as typeof stageOrder[number]['id']) || 'new';
    if (!leadsByStage[stage]) leadsByStage[stage] = [];
    leadsByStage[stage].push(lead);
  });

  const openStageDialog = (lead: Lead, stage: 'project_agreed' | 'course_agreed' | 'declined') => {
    setStageDialog({ lead, stage });
    setReview(lead.post_visit_review || '');
    setProjectDate(
      lead.post_visit_project_date
        ? format(new Date(lead.post_visit_project_date), "yyyy-MM-dd'T'HH:mm")
        : ''
    );
    setDeclineReason('');
  };

  const handleMoveToStage = async (lead: Lead, stage: typeof stageOrder[number]['id']) => {
    if (stage === 'project_agreed' || stage === 'course_agreed' || stage === 'declined') {
      openStageDialog(lead, stage);
      return;
    }
    try {
      await salesApi.updatePostVisitStage(lead.id, { stage });
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось изменить этап'));
    }
  };

  const handleSaveStageDialog = async () => {
    if (!stageDialog) return;
    const { lead, stage } = stageDialog;
    setSavingStage(true);
    setError(null);
    try {
      if (stage === 'project_agreed') {
        await salesApi.updatePostVisitStage(lead.id, {
          stage,
          review: review.trim() || undefined,
          project_date: projectDate ? new Date(projectDate).toISOString() : undefined,
        });
        await loadLeads();
      } else if (stage === 'course_agreed') {
        await salesApi.updatePostVisitStage(lead.id, {
          stage,
          review: review.trim() || undefined,
        });
        await loadLeads();
        navigate('/sales/agreed');
      } else if (stage === 'declined') {
        await salesApi.updatePostVisitStage(lead.id, {
          stage,
          decline_reason: declineReason.trim() || undefined,
        });
        await loadLeads();
      }
      setStageDialog(null);
      setReview('');
      setProjectDate('');
      setDeclineReason('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить изменения по лиду'));
    } finally {
      setSavingStage(false);
    }
  };

  const leadDisplayName = (l: Lead) =>
    [l.parent_full_name || l.contact_name, l.child_full_name].filter(Boolean).join(' / ') || l.phone || `Лид #${l.id}`;
  const leadPhone = (l: Lead) => l.parent_phone || l.phone || '—';

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Дожать на обучение</Typography>
        <Button variant="outlined" onClick={() => loadLeads()}>
          Обновить
        </Button>
      </Stack>

      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Лиды, которые пришли на мероприятие (статус «Пришел на пробное») и требуют дожима до обучения.
        Переносите карточки по этапам с помощью кнопок на карточке.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', overflowX: 'auto' }}>
        {stageOrder.map((stage) => (
          <Box
            key={stage.id}
            sx={{
              minWidth: 260,
              maxWidth: 320,
              flex: '0 0 auto',
              bgcolor: 'background.paper',
              borderRadius: 2,
              p: 1.5,
              boxShadow: 1,
            }}
          >
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {stage.title}
            </Typography>
            <Stack spacing={1}>
              {leadsByStage[stage.id]?.map((lead) => (
                <Box
                  key={lead.id}
                  sx={{
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    p: 1,
                    bgcolor: 'background.default',
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate('/sales/leads?open=' + lead.id)}
                  >
                    {leadDisplayName(lead)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {leadPhone(lead)}
                  </Typography>
                  {stage.id === 'project_agreed' && lead.post_visit_project_date && (
                    <Typography variant="body2" color="text.secondary">
                      {(() => {
                        const d = parseISO(lead.post_visit_project_date as string);
                        return isValid(d)
                          ? `Дата проекта: ${format(d, 'dd.MM.yyyy HH:mm')}`
                          : `Дата проекта: ${lead.post_visit_project_date}`;
                      })()}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {stageOrder
                      .filter((s) => s.id !== stage.id)
                      .map((s) => (
                        <Button
                          key={s.id}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 11, py: 0.25 }}
                          onClick={() => handleMoveToStage(lead, s.id)}
                        >
                          {s.title}
                        </Button>
                      ))}
                  </Stack>
                </Box>
              ))}
              {(!leadsByStage[stage.id] || leadsByStage[stage.id].length === 0) && (
                <Typography variant="body2" color="text.secondary">
                  Нет лидов на этом этапе.
                </Typography>
              )}
            </Stack>
          </Box>
        ))}
      </Box>

      <Dialog open={!!stageDialog} onClose={() => !savingStage && setStageDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {stageDialog?.stage === 'project_agreed'
            ? 'Согласились доделать проект'
            : stageDialog?.stage === 'course_agreed'
            ? 'Согласились заниматься'
            : 'Отказались'}
        </DialogTitle>
        <DialogContent>
          {stageDialog?.lead && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {leadDisplayName(stageDialog.lead)} — {leadPhone(stageDialog.lead)}
            </Typography>
          )}
          {(stageDialog?.stage === 'project_agreed' || stageDialog?.stage === 'course_agreed') && (
            <>
              <TextField
                label="Отзыв"
                fullWidth
                multiline
                minRows={3}
                value={review}
                onChange={(e) => setReview(e.target.value)}
                sx={{ mt: 1 }}
              />
              {stageDialog?.stage === 'project_agreed' && (
                <TextField
                  label="Дата и время проекта"
                  type="datetime-local"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={projectDate}
                  onChange={(e) => setProjectDate(e.target.value)}
                  sx={{ mt: 2 }}
                />
              )}
            </>
          )}
          {stageDialog?.stage === 'declined' && (
            <TextField
              label="Причина отказа"
              fullWidth
              multiline
              minRows={3}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStageDialog(null)} disabled={savingStage}>
            Отмена
          </Button>
          <Button variant="contained" onClick={() => void handleSaveStageDialog()} disabled={savingStage}>
            {savingStage ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default SalesPostVisitPage;
