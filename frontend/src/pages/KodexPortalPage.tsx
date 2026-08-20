import React from 'react';
import { Box } from '@mui/material';
import Layout from '../components/Layout';
import KodexStudioPage from './KodexStudioPage';

export default function KodexPortalPage() {
  return (
    <Layout>
      {/* Negative margins cancel Layout's p:3 padding, height fills remaining viewport */}
      <Box sx={{ m: { xs: -2, sm: -3 }, height: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, overflow: 'hidden' }}>
        <KodexStudioPage embedded />
      </Box>
    </Layout>
  );
}
