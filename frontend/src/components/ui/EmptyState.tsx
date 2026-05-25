import React from 'react';
import { Box, Typography } from '@mui/material';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon }) => {
  return (
    <Box sx={{ py: 6, textAlign: 'center' }}>
      {icon ? <Box sx={{ mb: 1 }}>{icon}</Box> : null}
      <Typography variant="h6">{title}</Typography>
      {description ? <Typography color="text.secondary">{description}</Typography> : null}
    </Box>
  );
};

export default EmptyState;
