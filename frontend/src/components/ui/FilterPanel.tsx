import React from 'react';
import { Paper, Stack } from '@mui/material';

interface FilterPanelProps {
  children: React.ReactNode;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ children }) => {
  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
        {children}
      </Stack>
    </Paper>
  );
};

export default FilterPanel;
