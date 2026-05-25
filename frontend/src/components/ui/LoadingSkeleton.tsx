import React from 'react';
import { Paper, Skeleton, Stack } from '@mui/material';

interface LoadingSkeletonProps {
  rows?: number;
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 5 }) => {
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} variant="rounded" height={48} />
        ))}
      </Stack>
    </Paper>
  );
};

export default LoadingSkeleton;
