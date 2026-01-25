import React from 'react';
import Layout from '../components/Layout';
import { Typography, Box, Grid, Paper } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <Layout>
      <Box>
        <Typography variant="h4" gutterBottom>
          Добро пожаловать, {user?.full_name}!
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Роль: {user?.role === 'admin' ? 'Администратор' : 
                 user?.role === 'trainer' ? 'Тренер' : 
                 user?.role === 'parent' ? 'Родитель' : 'Гость'}
        </Typography>
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">Быстрый доступ</Typography>
              <Typography variant="body2" color="text.secondary">
                Используйте меню для навигации по разделам системы
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
};

export default DashboardPage;

