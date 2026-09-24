import React, { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { isValid, parseISO } from 'date-fns';
import { Lead } from '../../types';
import { isLeadOverdue, isLeadDueToday } from '../../utils/leadPipeline';

interface LeadPipelineStatsProps {
  /** Лиды активной (не архивной) воронки. */
  leads: Lead[];
}

const StatTile: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <Box sx={{ minWidth: 110, textAlign: 'center', px: 1 }}>
    <Typography variant="h6" sx={{ fontWeight: 700, color: color || 'text.primary', lineHeight: 1.2 }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
      {label}
    </Typography>
  </Box>
);

/** Компактная KPI-строка над доской воронки (п.15 ТЗ). */
export const LeadPipelineStats: React.FC<LeadPipelineStatsProps> = ({ leads }) => {
  const stats = useMemo(() => {
    const now = new Date();
    let newToday = 0;
    let contactToday = 0;
    let overdue = 0;
    let scheduled = 0;
    let demoNoDecision = 0;
    let thinking = 0;
    let readyForInvoice = 0;

    leads.forEach((lead) => {
      if (lead.status === 'new') newToday += 1;
      if (isLeadOverdue(lead)) overdue += 1;
      else if (isLeadDueToday(lead)) contactToday += 1;
      if (lead.status === 'trial_scheduled' || lead.status === 'event_registered') scheduled += 1;
      if (lead.status === 'demo') demoNoDecision += 1;
      if (lead.status === 'thinking') thinking += 1;
      if (lead.status === 'invoice_sent' || lead.status === 'decided_immediately') readyForInvoice += 1;
    });

    return {
      active: leads.length,
      newToday,
      contactToday,
      overdue,
      scheduled,
      demoNoDecision,
      thinking,
      readyForInvoice,
    };
  }, [leads]);

  return (
    <Paper variant="outlined" sx={{ p: 1, mb: 1.5 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap divider={<Box sx={{ width: '1px', bgcolor: 'divider' }} />}>
        <StatTile label="Активных лидов" value={stats.active} />
        <StatTile label="Новых" value={stats.newToday} color="info.main" />
        <StatTile label="Сегодня связаться" value={stats.contactToday} color="warning.main" />
        <StatTile label="Просрочено" value={stats.overdue} color="error.main" />
        <StatTile label="Запланировано" value={stats.scheduled} />
        <StatTile label="Состоялось без решения" value={stats.demoNoDecision} />
        <StatTile label="Думают" value={stats.thinking} />
        <StatTile label="Готовы к оформлению" value={stats.readyForInvoice} color="success.main" />
      </Stack>
    </Paper>
  );
};

export default LeadPipelineStats;
