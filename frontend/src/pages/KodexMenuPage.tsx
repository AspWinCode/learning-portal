import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import { Shield as ShieldIcon } from '@mui/icons-material';
import Layout from '../components/Layout';

const OPTIONS = [
  {
    id: 'tasks',
    route: '/kodex',
    label: 'Задачи',
    desc: 'Детективные дела на программирование. Брифинг, улики, финал.',
    icon: <ShieldIcon sx={{ fontSize: 32 }} />,
    color: 'primary.main',
    bg: 'primary.50',
  },
];

export default function KodexMenuPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <Box sx={{ maxWidth: 640, mx: 'auto' }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5">Кодэкс</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Выберите тип контента для создания
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          {OPTIONS.map((opt) => (
            <Card
              key={opt.id}
              variant="outlined"
              sx={{ flex: 1, transition: 'box-shadow 150ms', '&:hover': { boxShadow: 3 } }}
            >
              <CardActionArea
                onClick={() => navigate(opt.route)}
                sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
                  <Box
                    sx={{
                      width: 56, height: 56, borderRadius: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: 'action.hover',
                      color: opt.color,
                    }}
                  >
                    {opt.icon}
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ mb: 0.5 }}>{opt.label}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                      {opt.desc}
                    </Typography>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>
    </Layout>
  );
}
