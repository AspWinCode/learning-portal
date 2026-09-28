import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, DeleteOutline as DeleteOutlineIcon } from '@mui/icons-material';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

interface ChildForm {
  child_full_name: string;
  birth_date: string;
  child_phone: string;
  student_email: string;
  gender: string;
  city: string;
  school_name: string;
  school_class: string;
}

const emptyChild = (): ChildForm => ({
  child_full_name: '',
  birth_date: '',
  child_phone: '',
  student_email: '',
  gender: '',
  city: '',
  school_name: '',
  school_class: '',
});

const ProgrammerQuestionnairePage: React.FC = () => {
  const [children, setChildren] = useState<ChildForm[]>([emptyChild()]);
  const [parent, setParent] = useState({
    parent_full_name: '',
    parent_phone: '',
    parent_phone_2: '',
    parent_email: '',
    has_max: '',
    comment: '',
    source: '',
  });
  const [cities, setCities] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    salesApi.listPublicCities().then(setCities).catch(() => setCities([]));
    salesApi.listPublicClasses().then(setClasses).catch(() => setClasses([]));
    salesApi.listPublicLeadSources().then(setSources).catch(() => setSources([]));
  }, []);

  const updateChild = (index: number, field: keyof ChildForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: e.target.value } : c)));
  };

  const updateChildValue = (index: number, field: keyof ChildForm) => (value: string) => {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const handleChildSelectChange = (index: number, field: keyof ChildForm) => (e: any) => {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: e.target.value } : c)));
  };

  const handleParentChange =
    (field: keyof typeof parent) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setParent((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleParentSelectChange = (field: keyof typeof parent) => (e: any) => {
    setParent((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const addSecondChild = () => {
    setChildren((prev) => {
      if (prev.length >= 2) return prev;
      const second = emptyChild();
      // Подставляем город первого ребёнка — обычно семья живёт в одном городе
      second.city = prev[0]?.city || '';
      return [...prev, second];
    });
  };

  const removeSecondChild = () => {
    setChildren((prev) => prev.slice(0, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedChildren = children.map((c) => ({
      child_full_name: c.child_full_name.trim(),
      birth_date: c.birth_date.trim(),
      child_phone: c.child_phone.trim(),
      student_email: c.student_email.trim(),
      gender: c.gender.trim(),
      city: c.city.trim(),
      school_name: c.school_name.trim(),
      school_class: c.school_class.trim(),
    }));
    const parentName = parent.parent_full_name.trim();
    const parentPhone = parent.parent_phone.trim();
    const parentEmail = parent.parent_email.trim();

    const childInvalid = trimmedChildren.some(
      (c) =>
        !c.child_full_name ||
        !c.birth_date ||
        !c.child_phone ||
        !c.student_email ||
        !c.city ||
        !c.school_name ||
        !c.school_class
    );

    if (childInvalid || !parentName || !parentPhone || !parentEmail) {
      setError('Пожалуйста, заполните все обязательные поля.');
      void salesApi.logQuestionnaireAttempt({
        anketa_type: 'programmist',
        reason: 'validation_failed',
        payload: { children: trimmedChildren, ...parent },
      });
      return;
    }

    setSubmitting(true);
    let succeeded = 0;
    try {
      for (const child of trimmedChildren) {
        await salesApi.submitProgrammerQuestionnaire({
          child_full_name: child.child_full_name,
          birth_date: child.birth_date,
          child_phone: child.child_phone,
          student_email: child.student_email,
          gender: child.gender || undefined,
          city: child.city,
          school_name: child.school_name,
          school_class: child.school_class,
          parent_full_name: parentName,
          parent_phone: parentPhone,
          parent_phone_2: parent.parent_phone_2.trim() || undefined,
          parent_email: parentEmail,
          has_max: parent.has_max === '' ? undefined : parent.has_max === 'yes',
          comment: parent.comment.trim() || undefined,
          source: parent.source.trim() || undefined,
        });
        succeeded += 1;
      }
      setSuccess(true);
    } catch (err: any) {
      if (succeeded > 0) {
        setError(
          `Анкета на первого ребёнка отправлена, но по второму произошла ошибка: ${extractApiError(
            err,
            'попробуйте отправить его данные ещё раз или свяжитесь с менеджером.'
          )}`
        );
      } else {
        setError(extractApiError(err, 'Не удалось отправить анкету. Попробуйте ещё раз.'));
      }
      void salesApi.logQuestionnaireAttempt({
        anketa_type: 'programmist',
        reason: 'submit_error',
        payload: { children: trimmedChildren, ...parent, succeeded },
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ py: 6 }}>
          <Typography variant="h4" gutterBottom>
            Спасибо!
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {children.length > 1
              ? 'Анкеты на обоих детей успешно отправлены.'
              : 'Анкета успешно отправлена.'}{' '}
            Менеджер свяжется с вами в ближайшее время, чтобы рассказать о направлении
            «Программист» (Python) и подобрать формат обучения.
          </Typography>
        </Box>
      </Container>
    );
  }

  const renderChildBlock = (child: ChildForm, index: number) => (
    <Stack spacing={2} key={index}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: index > 0 ? 2 : 0 }}>
        <Typography variant="h6">{index === 0 ? 'Обучающийся' : 'Второй ребёнок'}</Typography>
        {index > 0 && (
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={removeSecondChild}
          >
            Убрать
          </Button>
        )}
      </Box>
      <TextField
        label="ФИО ученика"
        value={child.child_full_name}
        onChange={updateChild(index, 'child_full_name')}
        required
        fullWidth
      />
      <TextField
        label="Дата рождения"
        type="date"
        value={child.birth_date}
        onChange={updateChild(index, 'birth_date')}
        required
        fullWidth
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="Телефон ученика"
        value={child.child_phone}
        onChange={updateChild(index, 'child_phone')}
        required
        fullWidth
      />
      <TextField
        label="Email ученика"
        type="email"
        value={child.student_email}
        onChange={updateChild(index, 'student_email')}
        required
        fullWidth
      />
      <FormControl fullWidth>
        <InputLabel id={`gender-label-${index}`}>Пол</InputLabel>
        <Select
          labelId={`gender-label-${index}`}
          label="Пол"
          value={child.gender}
          onChange={handleChildSelectChange(index, 'gender')}
        >
          <MenuItem value="">
            <em>Не выбрано</em>
          </MenuItem>
          <MenuItem value="Мужской">Мужской</MenuItem>
          <MenuItem value="Женский">Женский</MenuItem>
        </Select>
      </FormControl>
      <Autocomplete
        freeSolo
        options={cities}
        value={child.city}
        onInputChange={(_, v) => updateChildValue(index, 'city')(v ?? '')}
        renderInput={(params) => (
          <TextField {...params} label="Город" required placeholder="Выберите из списка или введите свой город" />
        )}
      />
      <TextField
        label="Образовательное учреждение"
        value={child.school_name}
        onChange={updateChild(index, 'school_name')}
        required
        fullWidth
      />
      <Autocomplete
        freeSolo
        options={classes}
        value={child.school_class}
        onInputChange={(_, v) => updateChildValue(index, 'school_class')(v ?? '')}
        renderInput={(params) => (
          <TextField {...params} label="Класс" required placeholder="Выберите из списка или введите свой класс" />
        )}
      />
    </Stack>
  );

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 6 }}>
        <Typography variant="h4" gutterBottom>
          Программист
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          Заполните, пожалуйста, анкету. Это поможет нам связаться с вами и подобрать подходящий
          формат обучения по направлению «Программист» (Python). Если хотите записать сразу двоих
          детей — добавьте второго ниже, данные родителя указывать повторно не нужно.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            {children.map((child, index) => renderChildBlock(child, index))}

            {children.length === 1 && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addSecondChild}
                sx={{ alignSelf: 'flex-start' }}
              >
                Добавить второго ребёнка
              </Button>
            )}

            <Typography variant="h6" sx={{ mt: 2 }}>
              Родитель
            </Typography>
            <TextField
              label="ФИО родителя"
              value={parent.parent_full_name}
              onChange={handleParentChange('parent_full_name')}
              required
              fullWidth
            />
            <TextField
              label="Телефон родителя"
              value={parent.parent_phone}
              onChange={handleParentChange('parent_phone')}
              required
              fullWidth
            />
            <TextField
              label="Второй телефон"
              value={parent.parent_phone_2}
              onChange={handleParentChange('parent_phone_2')}
              fullWidth
            />
            <TextField
              label="Email родителя"
              type="email"
              value={parent.parent_email}
              onChange={handleParentChange('parent_email')}
              required
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="has-max-label">Есть MAX?</InputLabel>
              <Select
                labelId="has-max-label"
                label="Есть MAX?"
                value={parent.has_max}
                onChange={handleParentSelectChange('has_max')}
              >
                <MenuItem value="">
                  <em>Не выбрано</em>
                </MenuItem>
                <MenuItem value="yes">Да</MenuItem>
                <MenuItem value="no">Нет</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Комментарий (цели обучения, уровень, удобное время и т.п.)"
              value={parent.comment}
              onChange={handleParentChange('comment')}
              fullWidth
              multiline
              minRows={3}
            />
            <FormControl fullWidth>
              <InputLabel id="source-label">Откуда о нас узнали</InputLabel>
              <Select
                labelId="source-label"
                label="Откуда о нас узнали"
                value={parent.source}
                onChange={handleParentSelectChange('source')}
              >
                <MenuItem value="">
                  <em>Не выбрано</em>
                </MenuItem>
                {sources.map((source) => (
                  <MenuItem key={source} value={source}>
                    {source}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ mt: 3 }}
            disabled={submitting}
          >
            {submitting ? 'Отправка…' : 'Отправить анкету'}
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default ProgrammerQuestionnairePage;
