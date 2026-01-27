import React from 'react';
import Layout from '../components/Layout';
import { Box, Typography, Paper } from '@mui/material';

const FinancialModelPage: React.FC = () => {
  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Финансовая модель
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography>
            Раздел для владельца. Здесь будет финансовая модель проекта.
          </Typography>
        </Paper>
      </Box>
    </Layout>
  );
};

export default FinancialModelPage;

