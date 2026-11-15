import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { studentPortalApi } from '../services/studentPortalApi';

interface StudentKodikProps {
  coursesCount: number;
  scheduleCount: number;
  progress: number;
}

const StudentKodik: React.FC<StudentKodikProps> = ({ coursesCount, scheduleCount, progress }) => {
  const messages = useMemo(() => {
    if (coursesCount === 0) return ['Пока курсов нет, но это ненадолго! Я рядом, если нужна помощь.', 'Загляни сюда позже — я первым замечу новые материалы.', 'А пока можешь познакомиться с кабинетом и расписанием.'];
    if (scheduleCount > 0) return ['У тебя есть ближайшее занятие. Не забудь заглянуть в расписание!', 'Подготовься к занятию заранее — так будет легче стартовать.', 'Если что-то непонятно, спроси тренера на занятии.'];
    if (progress >= 80) return ['Вау, почти финиш! Ещё немного — и все задачи будут покорены.', 'Так держать! Твой прогресс уже впечатляет.', 'После завершения курса не забудь открыть следующий уровень.'];
    if (progress > 0) return ['Отличный старт! Давай продолжим с того курса, где остановились.', 'Каждая решённая задача приближает тебя к следующему уровню.', 'Попробуй сегодня решить ещё одну задачу — маленькими шагами быстрее.'];
    return ['Привет! Выбери курс — я помогу не потеряться в обучении.', 'Начни с любого курса: я буду рядом и подскажу следующий шаг.', 'Нажми «Открыть курс», чтобы начать обучение.'];
  }, [coursesCount, progress, scheduleCount]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  useEffect(() => {
    studentPortalApi.getKodikFeedbackStatus()
      .then((status) => setFeedbackOpen(status.should_prompt))
      .catch(() => undefined);
  }, []);

  const submitFeedback = async (answer: 'enjoying' | 'difficult' | 'need_help' | 'not_really') => {
    setFeedbackSubmitting(true);
    try {
      await studentPortalApi.submitKodikFeedback(answer);
      setFeedbackDone(true);
      window.setTimeout(() => setFeedbackOpen(false), 2200);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  useEffect(() => setMessageIndex(0), [messages]);

  useEffect(() => {
    if (messages.length < 2) return undefined;
    const timer = window.setInterval(() => setMessageIndex((index) => (index + 1) % messages.length), 8000);
    return () => window.clearInterval(timer);
  }, [messages]);

  const kodikImage = feedbackDone
    ? '/kodik-celebrate.png'
    : feedbackOpen
      ? '/kodik-thinking.png'
      : '/kodik-mascot.png';

  return (
    <Box sx={{ position: 'fixed', left: { xs: 10, sm: 24 }, bottom: { xs: 10, sm: 24 }, zIndex: 1190 }}>
      {open && (
        <Box sx={{ position: 'absolute', left: 0, bottom: { xs: 66, sm: 76 }, width: { xs: 240, sm: 285 }, p: 1.5, borderRadius: '16px 16px 16px 4px', bgcolor: '#302650', border: '1px solid rgba(171,103,229,0.45)', boxShadow: '0 12px 32px rgba(10,5,30,0.35)' }}>
          <IconButton onClick={() => setOpen(false)} size="small" aria-label="Скрыть сообщение" sx={{ position: 'absolute', right: 4, top: 4, color: 'rgba(255,255,255,0.45)' }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Typography sx={{ color: '#AB67E5', fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.45 }}>Кодик</Typography>
          {feedbackOpen ? (
            feedbackDone ? (
              <Typography sx={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.82rem', lineHeight: 1.4, animation: 'kodikMessageIn 260ms ease-out' }}>Спасибо! Я передам твоё мнение команде 💜</Typography>
            ) : (
              <>
                <Typography sx={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.82rem', lineHeight: 1.4, mb: 1.1 }}>Как идёт твоё обучение? Всё нравится?</Typography>
                <Stack spacing={0.65}>
                  {[
                    ['enjoying', 'Да, всё нравится'],
                    ['difficult', 'Нравится, но иногда сложно'],
                    ['need_help', 'Нужна помощь'],
                    ['not_really', 'Пока не очень'],
                  ].map(([answer, label]) => (
                    <Button key={answer} size="small" disabled={feedbackSubmitting} onClick={() => submitFeedback(answer as 'enjoying' | 'difficult' | 'need_help' | 'not_really')} sx={{ justifyContent: 'flex-start', color: 'rgba(255,255,255,0.84)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 1.5, px: 1, py: 0.35, fontSize: '0.7rem', textTransform: 'none', '&:hover': { bgcolor: 'rgba(171,103,229,0.18)', borderColor: '#AB67E5' } }}>{label}</Button>
                  ))}
                </Stack>
              </>
            )
          ) : (
            <>
              <Typography key={messageIndex} sx={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.82rem', lineHeight: 1.4, pr: 1.5, animation: 'kodikMessageIn 260ms ease-out', '@keyframes kodikMessageIn': { from: { opacity: 0, transform: 'translateY(5px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>{messages[messageIndex]}</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                <Box sx={{ display: 'flex', gap: 0.45 }}>{messages.map((_, index) => <Box key={index} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: index === messageIndex ? '#AB67E5' : 'rgba(255,255,255,0.25)' }} />)}</Box>
                <Typography component="button" onClick={() => setMessageIndex((index) => (index + 1) % messages.length)} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, border: 0, bgcolor: 'transparent', color: '#C99AF2', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800, p: 0, transition: 'transform 160ms ease, color 160ms ease', '&:hover': { color: '#fff', transform: 'translateX(3px)' } }}>Ещё <ArrowForwardIosIcon sx={{ fontSize: 9 }} /></Typography>
              </Box>
            </>
          )}
        </Box>
      )}
      <Box sx={{ position: 'relative', width: { xs: 58, sm: 70 }, height: { xs: 58, sm: 70 } }}>
        <Box component="img" src={kodikImage} alt="Кодик — помощник ученика" onClick={() => setOpen((value) => !value)} sx={{
          position: 'absolute', width: { xs: 88, sm: 108 }, height: { xs: 88, sm: 108 }, objectFit: 'contain', left: { xs: -14, sm: -18 }, bottom: -7, cursor: 'pointer', filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.35))',
          animation: feedbackDone ? 'kodikCelebrate 700ms ease-in-out 2' : feedbackOpen ? 'kodikThink 2.2s ease-in-out infinite' : 'kodikFloat 3.2s ease-in-out infinite',
          transition: 'transform 0.2s ease', '&:hover': { animation: 'none', transform: 'translateY(-5px) rotate(-3deg) scale(1.04)' },
          '@keyframes kodikFloat': { '0%, 100%': { transform: 'translateY(0) rotate(0)' }, '50%': { transform: 'translateY(-5px) rotate(1deg)' } },
          '@keyframes kodikThink': { '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' }, '35%': { transform: 'translateY(-4px) rotate(4deg)' }, '70%': { transform: 'translateY(-1px) rotate(-4deg)' } },
          '@keyframes kodikCelebrate': { '0%, 100%': { transform: 'translateY(0) scale(1) rotate(0)' }, '35%': { transform: 'translateY(-14px) scale(1.05) rotate(-5deg)' }, '70%': { transform: 'translateY(-5px) scale(1.02) rotate(5deg)' } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }} />
        {!open && <IconButton aria-label="Открыть сообщение Кодика" onClick={() => setOpen(true)} sx={{ position: 'absolute', right: -4, top: -4, width: 24, height: 24, bgcolor: '#7F23CC', color: '#fff', '&:hover': { bgcolor: '#AB67E5' } }}><ChatBubbleOutlineIcon sx={{ fontSize: 14 }} /></IconButton>}
      </Box>
    </Box>
  );
};

export default StudentKodik;
