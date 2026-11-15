import React, { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CloseIcon from '@mui/icons-material/Close';

interface StudentKodikProps {
  coursesCount: number;
  scheduleCount: number;
  progress: number;
}

const StudentKodik: React.FC<StudentKodikProps> = ({ coursesCount, scheduleCount, progress }) => {
  const messages = useMemo(() => {
    if (coursesCount === 0) return ['Пока курсов нет, но это ненадолго! Я рядом, если нужна помощь.'];
    if (scheduleCount > 0) return ['У тебя есть ближайшее занятие. Не забудь заглянуть в расписание!'];
    if (progress >= 80) return ['Вау, почти финиш! Ещё немного — и все задачи будут покорены.'];
    if (progress > 0) return ['Отличный старт! Давай продолжим с того курса, где остановились.'];
    return ['Привет! Выбери курс — я помогу не потеряться в обучении.'];
  }, [coursesCount, progress, scheduleCount]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [open, setOpen] = useState(true);

  useEffect(() => setMessageIndex(0), [messages]);

  useEffect(() => {
    if (messages.length < 2) return undefined;
    const timer = window.setInterval(() => setMessageIndex((index) => (index + 1) % messages.length), 12000);
    return () => window.clearInterval(timer);
  }, [messages]);

  return (
    <Box sx={{ position: 'fixed', left: { xs: 10, sm: 24 }, bottom: { xs: 10, sm: 24 }, zIndex: 1190 }}>
      {open && (
        <Box sx={{ position: 'absolute', left: 0, bottom: { xs: 66, sm: 76 }, width: { xs: 240, sm: 285 }, p: 1.5, borderRadius: '16px 16px 16px 4px', bgcolor: '#302650', border: '1px solid rgba(171,103,229,0.45)', boxShadow: '0 12px 32px rgba(10,5,30,0.35)' }}>
          <IconButton onClick={() => setOpen(false)} size="small" aria-label="Скрыть сообщение" sx={{ position: 'absolute', right: 4, top: 4, color: 'rgba(255,255,255,0.45)' }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Typography sx={{ color: '#AB67E5', fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.45 }}>Кодик</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.82rem', lineHeight: 1.4, pr: 1.5 }}>{messages[messageIndex]}</Typography>
        </Box>
      )}
      <Box sx={{ position: 'relative', width: { xs: 58, sm: 70 }, height: { xs: 58, sm: 70 } }}>
        <Box component="img" src="/kodik-mascot.png" alt="Кодик — помощник ученика" onClick={() => setOpen((value) => !value)} sx={{ position: 'absolute', width: { xs: 88, sm: 108 }, height: { xs: 88, sm: 108 }, objectFit: 'contain', left: { xs: -14, sm: -18 }, bottom: -7, cursor: 'pointer', filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.35))', transition: 'transform 0.2s ease', '&:hover': { transform: 'translateY(-4px) scale(1.03)' } }} />
        {!open && <IconButton aria-label="Открыть сообщение Кодика" onClick={() => setOpen(true)} sx={{ position: 'absolute', right: -4, top: -4, width: 24, height: 24, bgcolor: '#7F23CC', color: '#fff', '&:hover': { bgcolor: '#AB67E5' } }}><ChatBubbleOutlineIcon sx={{ fontSize: 14 }} /></IconButton>}
      </Box>
    </Box>
  );
};

export default StudentKodik;
