import React, { useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Lead, LeadPipelineStage, LeadStatus } from '../../types';
import { salesApi } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';
import { FINAL_STATUSES } from '../../utils/leadPipeline';
import { LeadKanbanCard } from './LeadKanbanCard';
import { LeadStageTransitionDialog, TransitionMode, TransitionResultPayload } from './LeadStageTransitionDialog';

interface KanbanColumn {
  /** Уникальный ключ колонки (может отличаться от статуса — для 3 подколонок «Недозвон»). */
  key: string;
  title: string;
  color?: string | null;
  status: LeadStatus;
  /** Для подколонок «Недозвон»: конкретная попытка 1/2/3. */
  noAnswerAttempt?: 1 | 2 | 3;
  leads: Lead[];
}

interface LeadKanbanProps {
  leads: Lead[];
  pipelineStages: LeadPipelineStage[];
  mode: 'active' | 'archive';
  refusedReasons: string[];
  onLeadsChanged: () => void | Promise<void>;
  onOpenLead: (leadId: number) => void;
  onToast: (message: string, severity?: 'success' | 'info' | 'warning' | 'error') => void;
}

/** Статусы, для которых прямой drag&drop запрещён без диалога/спец-обработки. */
const DIALOG_STATUSES: LeadStatus[] = ['trial_scheduled', 'thinking', 'refused', 'invoice_sent'];

export const LeadKanban: React.FC<LeadKanbanProps> = ({
  leads,
  pipelineStages,
  mode,
  refusedReasons,
  onLeadsChanged,
  onOpenLead,
  onToast,
}) => {
  const [draggedLeadId, setDraggedLeadId] = useState<number | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);

  const [dialogMode, setDialogMode] = useState<TransitionMode | null>(null);
  const [dialogLead, setDialogLead] = useState<Lead | null>(null);
  const [dialogSubmitting, setDialogSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const columns: KanbanColumn[] = useMemo(() => {
    const sorted = [...pipelineStages].sort((a, b) => a.position - b.position);
    const relevant = sorted.filter((stage) =>
      mode === 'archive' ? FINAL_STATUSES.includes(stage.primary_status) : !FINAL_STATUSES.includes(stage.primary_status)
    );

    const cols: KanbanColumn[] = [];
    for (const stage of relevant) {
      const statusesInColumn = new Set<LeadStatus>([stage.primary_status, ...stage.grouped_statuses]);
      if (stage.primary_status === 'no_answer') {
        // Три визуальные подколонки одного статуса по no_answer_attempt (п.9 ТЗ)
        for (const attempt of [1, 2, 3] as const) {
          cols.push({
            key: `no_answer_${attempt}`,
            title: `${stage.label} ${attempt}`,
            color: stage.color,
            status: 'no_answer',
            noAnswerAttempt: attempt,
            leads: leads.filter(
              (l) => statusesInColumn.has(l.status) && (l.no_answer_attempt || 1) === attempt
            ),
          });
        }
        continue;
      }
      cols.push({
        key: stage.key,
        title: stage.label,
        color: stage.color,
        status: stage.primary_status,
        leads: leads.filter((l) => statusesInColumn.has(l.status)),
      });
    }
    return cols;
  }, [pipelineStages, leads, mode]);

  const findLead = (id: number | null) => (id ? leads.find((l) => l.id === id) || null : null);

  const closeDialog = () => {
    setDialogMode(null);
    setDialogLead(null);
    setDialogError(null);
    setDialogSubmitting(false);
  };

  const applyUpdate = async (lead: Lead, payload: TransitionResultPayload, successMessage: string) => {
    setDialogSubmitting(true);
    setDialogError(null);
    try {
      await salesApi.updateLead(lead.id, payload as any);
      await onLeadsChanged();
      onToast(successMessage, 'success');
      closeDialog();
    } catch (err: any) {
      setDialogError(extractApiError(err, 'Не удалось обновить лида'));
    } finally {
      setDialogSubmitting(false);
    }
  };

  const openDialogFor = (lead: Lead, targetStatus: LeadStatus) => {
    setDialogLead(lead);
    setDialogError(null);
    if (targetStatus === 'trial_scheduled') setDialogMode('trial_scheduled');
    else if (targetStatus === 'thinking') setDialogMode('thinking');
    else if (targetStatus === 'refused') setDialogMode('refused');
    else if (targetStatus === 'invoice_sent') setDialogMode('invoice_sent');
  };

  const handleDropOnColumn = async (col: KanbanColumn) => {
    setDragOverColumnKey(null);
    const lead = findLead(draggedLeadId);
    setDraggedLeadId(null);
    if (!lead) return;
    if (mode === 'archive') return; // архив только для просмотра

    if (col.status === 'no_answer') {
      const attempt = col.noAnswerAttempt || 1;
      if (lead.status === 'no_answer' && (lead.no_answer_attempt || 1) === attempt) return;
      if (attempt === 3) {
        // Явный шаг: после 3-й попытки предлагаем перевод в «Возможно позже», а не молча меняем статус.
        setDialogLead(lead);
        setDialogError(null);
        setDialogMode('later_confirm');
        // Заодно фиксируем 3-ю попытку до подтверждения перевода.
        try {
          await salesApi.updateLead(lead.id, { status: 'no_answer', no_answer_attempt: 3 });
          await onLeadsChanged();
        } catch (err: any) {
          onToast(extractApiError(err, 'Не удалось обновить попытку дозвона'), 'error');
        }
        return;
      }
      try {
        await salesApi.updateLead(lead.id, { status: 'no_answer', no_answer_attempt: attempt });
        await onLeadsChanged();
        onToast(`Лид "${lead.contact_name}" — недозвон, попытка ${attempt}`, 'info');
      } catch (err: any) {
        onToast(extractApiError(err, 'Не удалось обновить попытку дозвона'), 'error');
      }
      return;
    }

    if (lead.status === col.status) return;

    if (col.status === 'won') {
      setDialogLead(lead);
      setDialogError(null);
      setDialogMode('convert_to_student');
      return;
    }

    if (DIALOG_STATUSES.includes(col.status)) {
      openDialogFor(lead, col.status);
      return;
    }

    if (col.status === 'demo') {
      try {
        await salesApi.updateLead(lead.id, { status: 'demo' });
        await onLeadsChanged();
        onToast(`Лид "${lead.contact_name}" перенесён в «Состоялось»`, 'success');
        // Сразу предлагаем выбрать результат, чтобы лид не завис без решения (п.3 ТЗ).
        setDialogLead({ ...lead, status: 'demo' });
        setDialogError(null);
        setDialogMode('demo_outcome');
      } catch (err: any) {
        onToast(extractApiError(err, 'Не удалось перенести лида в «Состоялось»'), 'error');
      }
      return;
    }

    // new / messaged / contacted / later — прямой переход без доп. данных.
    try {
      await salesApi.updateLead(lead.id, { status: col.status });
      await onLeadsChanged();
      onToast(`Лид "${lead.contact_name}" перенесён в "${col.title}"`, 'success');
    } catch (err: any) {
      onToast(extractApiError(err, 'Не удалось перенести лида'), 'error');
    }
  };

  const handleConvertToStudent = async () => {
    if (!dialogLead) return;
    setDialogSubmitting(true);
    setDialogError(null);
    try {
      await salesApi.convertLeadToStudent(dialogLead.id);
      await onLeadsChanged();
      onToast(`Лид "${dialogLead.contact_name}" переведён в ученики`, 'success');
      closeDialog();
    } catch (err: any) {
      setDialogError(extractApiError(err, 'Не удалось создать ученика — проверьте обязательные поля'));
    } finally {
      setDialogSubmitting(false);
    }
  };

  const handleDemoOutcome = (outcome: 'thinking' | 'invoice_sent' | 'refused') => {
    if (!dialogLead) return;
    const lead = dialogLead;
    setDialogError(null);
    if (outcome === 'thinking') setDialogMode('thinking');
    else if (outcome === 'invoice_sent') setDialogMode('invoice_sent');
    else setDialogMode('refused');
    setDialogLead(lead);
  };

  const handleDialogConfirm = async (payload: TransitionResultPayload) => {
    if (!dialogLead) return;
    let msg = `Лид "${dialogLead.contact_name}" обновлён`;
    if (payload.status === 'trial_scheduled') msg = `Лид "${dialogLead.contact_name}" запланирован`;
    if (payload.status === 'thinking') msg = `Лид "${dialogLead.contact_name}" перенесён в «Думают»`;
    if (payload.status === 'refused') msg = `Лид "${dialogLead.contact_name}" отмечен как отказ`;
    if (payload.status === 'invoice_sent') msg = `Лид "${dialogLead.contact_name}" перенесён в «Оформление»`;
    if (payload.status === 'later') msg = `Лид "${dialogLead.contact_name}" перенесён в «Возможно позже»`;
    await applyUpdate(dialogLead, payload, msg);
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2, overflowX: 'auto', pb: 1, minHeight: 400 }}>
        {columns.map((col) => (
          <Box key={col.key} sx={{ flex: '0 0 auto', width: 280, minWidth: 280 }}>
            <Card
              variant="outlined"
              sx={{
                height: '100%',
                transition: 'background-color 0.15s, box-shadow 0.15s',
                ...(mode === 'active' && dragOverColumnKey === col.key && draggedLeadId
                  ? { bgcolor: 'action.hover', boxShadow: 2 }
                  : {}),
              }}
              onDragOver={
                mode === 'archive'
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverColumnKey(col.key);
                    }
              }
              onDragLeave={
                mode === 'archive'
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                        setDragOverColumnKey(null);
                      }
                    }
              }
              onDrop={
                mode === 'archive'
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDropOnColumn(col);
                    }
              }
            >
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {col.color && (
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: col.color, flexShrink: 0 }} />
                    )}
                    <Typography variant="subtitle1">{col.title}</Typography>
                  </Stack>
                  <Chip size="small" label={col.leads.length} />
                </Stack>
                <Stack spacing={1.5}>
                  {col.leads.map((lead) => (
                    <LeadKanbanCard
                      key={lead.id}
                      lead={lead}
                      draggable={mode === 'active'}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(lead.id));
                        setDraggedLeadId(lead.id);
                      }}
                      onDragEnd={() => {
                        setDraggedLeadId(null);
                        setDragOverColumnKey(null);
                      }}
                      onOpen={(l) => onOpenLead(l.id)}
                    />
                  ))}
                  {col.leads.length === 0 && (
                    <Typography variant="caption" color="text.disabled">
                      Пусто
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      <LeadStageTransitionDialog
        open={dialogMode !== null}
        mode={dialogMode}
        lead={dialogLead}
        refusedReasons={refusedReasons}
        submitting={dialogSubmitting}
        error={dialogError}
        onClose={closeDialog}
        onConfirm={handleDialogConfirm}
        onPickDemoOutcome={handleDemoOutcome}
        onConvertToStudent={handleConvertToStudent}
      />
    </>
  );
};

export default LeadKanban;
