import React from 'react';
import { Chip, ChipProps } from '@mui/material';

const COLOR_MAP: Record<string, ChipProps['color']> = {
  active: 'success',
  approved: 'success',
  paid: 'success',
  archived: 'default',
  draft: 'default',
  pending: 'warning',
  overdue: 'error',
  rejected: 'error',
  cancelled: 'error',
};

interface StatusChipProps {
  status: string;
  label?: React.ReactNode;
}

const StatusChip: React.FC<StatusChipProps> = ({ status, label }) => {
  return <Chip size="small" color={COLOR_MAP[status] || 'default'} label={label || status} />;
};

export default StatusChip;
