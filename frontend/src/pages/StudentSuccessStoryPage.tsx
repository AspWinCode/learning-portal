import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { studentSuccessStoriesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

type Question = { key: string; label: string; required?: boolean };
const sections: Array<{ title: string; questions: Question[] }> = [
  { title: '1. Знакомство и достижение', questions: [
    { key: 'student_info', label: 'Как тебя зовут, сколько тебе лет и в каком классе ты сейчас учишься (или какой класс окончил)?', required: true },
    { key: 'achievements', label: 'Каких результатов тебе удалось добиться за последнее время? Расскажи обо всех достижениях, которыми гордишься.', required: true },
    { key: 'most_important_achievement', label: 'Какое своё достижение ты считаешь самым важным и почему?', required: true },
    { key: 'admission', label: 'Куда ты поступил или куда планируешь поступать? Почему выбрал это учебное заведение?' },
  ]},
  { title: '2. С чего всё начиналось', questions: [
    { key: 'started_when', label: 'Когда ты начал заниматься в нашей школе и в каком классе тогда учился?', required: true },
    { key: 'before_start', label: 'Какие у тебя были знания и результаты до начала занятий?', required: true },
    { key: 'goal', label: 'Какую цель ты ставил перед собой, когда начинал заниматься?', required: true },
    { key: 'initial_difficulties', label: 'Что в начале казалось самым сложным? Были ли темы, которые не получались?' },
  ]},
  { title: '3. Как проходила подготовка', questions: [
    { key: 'why_school', label: 'Почему ты решил заниматься именно в нашей школе?' },
    { key: 'training_format', label: 'Как проходили твои занятия? Что тебе особенно нравилось в формате обучения?', required: true },
    { key: 'what_helped', label: 'Что из занятий помогло тебе больше всего?', required: true },
    { key: 'breakthrough', label: 'Вспомни момент, когда благодаря занятиям ты разобрался в сложной теме или решил задачу, которая раньше не получалась.', required: true },
    { key: 'wanted_to_quit', label: 'Были ли моменты, когда хотелось всё бросить? Что помогло справиться?' },
    { key: 'teacher_role', label: 'Какую роль в подготовке сыграл преподаватель? Что запомнилось?' },
    { key: 'school_difference', label: 'Что отличало занятия в нашей школе от обычных уроков или самостоятельной подготовки?' },
  ]},
  { title: '4. Результаты и эмоции', questions: [
    { key: 'result_story', label: 'Расскажи, как ты узнал о своём результате. Где ты был, что почувствовал и кому рассказал первым?', required: true },
    { key: 'expectations', label: 'Насколько результат соответствовал ожиданиям? Что особенно удивило?' },
    { key: 'school_role', label: 'Что больше всего помогло добиться результата? Какую роль сыграли занятия в нашей школе?', required: true },
    { key: 'new_opportunities', label: 'Какие новые возможности открыл для тебя этот результат?', required: true },
    { key: 'feelings', label: 'Что ты сейчас чувствуешь, оглядываясь на пройденный путь?' },
  ]},
  { title: '5. Советы другим ученикам', questions: [
    { key: 'advice', label: 'Что бы ты посоветовал ученику, который готовится к похожей цели, но боится, что не получится?', required: true },
    { key: 'top_tips', label: 'Какие две-три вещи действительно помогают добиться высоких результатов?' },
    { key: 'recommendation', label: 'Если бы друг спросил, стоит ли заниматься в нашей школе, что бы ты ответил?', required: true },
    { key: 'advice_to_self', label: 'Если бы мог вернуться в начало обучения, какой совет дал бы себе?' },
  ]},
  { title: '6. Материалы для публикации', questions: [
    { key: 'achievement_proofs', label: 'Есть ли подтверждения достижений, которые можно показать в публикации: дипломы, результаты экзаменов, приглашение или сведения о зачислении? Персональные данные можно скрыть.' },
    { key: 'publication_consent', label: 'Есть ли что-то ещё, о чём мы не спросили, но тебе хотелось бы рассказать?' },
  ]},
];

const StudentSuccessStoryPage: React.FC = () => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState('');
  const [proofs, setProofs] = useState<Array<{ name: string; data: string }>>([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const questions = useMemo(() => sections.flatMap((section) => section.questions), []);

  const changePhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Прикрепите файл изображения.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Фотография должна быть не больше 8 МБ.'); return; }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const addProofs = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files);
    if (proofs.length + selected.length > 10) { setError('Можно прикрепить не больше 10 подтверждений.'); return; }
    if (selected.some((file) => !file.type.startsWith('image/') && file.type !== 'application/pdf')) { setError('Подтверждения должны быть изображениями или PDF-файлами.'); return; }
    if (selected.some((file) => file.size > 8 * 1024 * 1024)) { setError('Каждый файл подтверждения должен быть не больше 8 МБ.'); return; }
    Promise.all(selected.map((file) => new Promise<{ name: string; data: string }>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, data: String(reader.result || '') }); reader.onerror = reject; reader.readAsDataURL(file);
    }))).then((loaded) => setProofs((prev) => [...prev, ...loaded])).catch(() => setError('Не удалось прочитать файл.'));
  };

  const submit = async () => {
    const missing = questions.filter((question) => question.required && !answers[question.key]?.trim());
    if (missing.length) { setError('Заполните обязательные поля — они отмечены звёздочкой.'); return; }
    setSaving(true);
    try {
      await studentSuccessStoriesApi.submit({ ...answers, photo_data_url: photo || null, proof_data_urls: proofs });
      setSubmitted(true); setError('');
    } catch (err) { setError(extractApiError(err, 'Не удалось отправить анкету')); }
    finally { setSaving(false); }
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7fb', py: { xs: 2, md: 6 }, px: 2 }}>
    <Paper sx={{ maxWidth: 880, mx: 'auto', p: { xs: 2, md: 5 }, borderRadius: 4 }}>
      {submitted ? <Alert severity="success">Спасибо! История отправлена. Мы свяжемся с тобой, если понадобятся уточнения.</Alert> : <Stack spacing={3}>
        <Box><Typography variant="h3" sx={{ fontSize: { xs: 28, md: 42 }, fontWeight: 800 }}>История моего успеха</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Расскажи о своём пути — это поможет другим ученикам поверить в себя.</Typography></Box>
        {error && <Alert severity="error">{error}</Alert>}
        {sections.map((section) => <Box key={section.title}><Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>{section.title}</Typography><Stack spacing={2.2}>{section.questions.map((question) => <TextField key={question.key} fullWidth multiline minRows={question.key === 'student_info' ? 1 : 3} label={question.label} required={question.required} value={answers[question.key] || ''} onChange={(event) => setAnswers((prev) => ({ ...prev, [question.key]: event.target.value }))} />)}</Stack><Divider sx={{ mt: 3 }} /></Box>)}
        <Box><Typography variant="h6" sx={{ fontWeight: 700 }}>Материалы для публикации</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Можно прикрепить несколько дипломов, сертификатов или подтверждений в формате PDF/изображения. До 10 файлов по 8 МБ.</Typography><Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap"><Button component="label" variant="outlined">{photo ? 'Фотография прикреплена' : 'Прикрепить фотографию'}<input hidden type="file" accept="image/*" onChange={(event) => changePhoto(event.target.files?.[0])} /></Button><Button component="label" variant="outlined">Прикрепить дипломы и подтверждения<input hidden type="file" multiple accept="image/*,application/pdf" onChange={(event) => addProofs(event.target.files)} /></Button></Stack>{photo && <Typography variant="body2" color="success.main">Фото готово</Typography>}{proofs.length > 0 && <Typography variant="body2" color="success.main">Прикреплено подтверждений: {proofs.length}</Typography>}</Box>
        <Button variant="contained" size="large" onClick={() => void submit()} disabled={saving}>{saving ? 'Отправка...' : 'Отправить историю'}</Button>
      </Stack>}
    </Paper>
  </Box>;
};

export default StudentSuccessStoryPage;
