import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LinkIcon from '@mui/icons-material/Link';
import LogoutIcon from '@mui/icons-material/Logout';
import { studentPortalApi, StudentUsefulLink } from '../services/studentPortalApi';

const StudentPortalUsefulLinksPage: React.FC = () => {
  const navigate = useNavigate();
  const [links, setLinks] = useState<StudentUsefulLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentPortalApi.getToken()) { navigate('/student-portal/login', { replace: true }); return; }
    studentPortalApi.getUsefulLinks()
      .then(setLinks)
      .catch((err: any) => setError(err.response?.data?.detail || err.message || 'Не удалось загрузить ссылки'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const logout = () => { studentPortalApi.logout(); navigate('/student-portal/login', { replace: true }); };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#211B3B', backgroundImage: 'radial-gradient(ellipse 60% 50% at 80% -10%, rgba(127,35,204,0.3) 0%, transparent 70%)', color: '#fff', fontFamily: '"Nunito", "Rubik", sans-serif', px: { xs: 2, sm: 4 }, py: { xs: 3, sm: 5 } }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ mb: 4 }}>
          <Box><Typography sx={{ color: '#fff', fontSize: { xs: '1.8rem', sm: '2.4rem' }, fontWeight: 900 }}>Полезные ссылки</Typography><Typography sx={{ color: 'rgba(255,255,255,.55)', mt: .5 }}>Материалы и сервисы, которые помогут в обучении</Typography></Box>
          <Stack direction="row" gap={1}><Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student-portal')} sx={{ color: 'rgba(255,255,255,.75)', borderColor: 'rgba(255,255,255,.2)' }} variant="outlined">В кабинет</Button><Button startIcon={<LogoutIcon />} onClick={logout} sx={{ color: 'rgba(255,255,255,.75)', borderColor: 'rgba(255,255,255,.2)' }} variant="outlined">Выйти</Button></Stack>
        </Stack>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress sx={{ color: '#AB67E5' }} /></Box> : links.length === 0 ? <Box sx={{ p: 5, textAlign: 'center', border: '1px solid rgba(255,255,255,.1)', borderRadius: 4, bgcolor: 'rgba(255,255,255,.04)' }}><Typography sx={{ color: 'rgba(255,255,255,.55)' }}>Полезные ссылки пока не добавлены.</Typography></Box> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>{links.map((link) => <Box key={link.id} component="a" href={link.url} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', flexDirection: 'column', minHeight: 150, p: 2.5, borderRadius: 4, bgcolor: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', textDecoration: 'none', transition: 'all .2s', '&:hover': { transform: 'translateY(-3px)', bgcolor: 'rgba(127,35,204,.22)', borderColor: 'rgba(171,103,229,.55)', boxShadow: '0 12px 30px rgba(0,0,0,.2)' } }}><LinkIcon sx={{ color: '#C084FC', fontSize: 28, mb: 2 }} /><Typography sx={{ fontWeight: 900, fontSize: '1.05rem' }}>{link.title}</Typography>{link.description && <Typography sx={{ color: 'rgba(255,255,255,.55)', fontSize: '.82rem', lineHeight: 1.45, mt: .75 }}>{link.description}</Typography>}<Typography sx={{ color: '#C084FC', fontSize: '.75rem', fontWeight: 800, mt: 'auto', pt: 2 }}>Открыть ссылку →</Typography></Box>)}</Box>}
      </Box>
    </Box>
  );
};

export default StudentPortalUsefulLinksPage;
