import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Add as AddIcon, Person as PersonIcon } from '@mui/icons-material';
import { usersApi, groupsApi } from '../services/api';
import {
  User,
  Group,
  TrainerLessonFormat,
  TRAINER_BANK_KEYS,
  TRAINER_BANK_LABELS,
  type TrainerBankKey,
} from '../types';

const toNumber = (value: string) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const LESSON_FORMAT_OPTIONS: { value: TrainerLessonFormat; label: string }[] = [
  { value: 'group', label: 'Групповой' },
  { value: 'individual', label: 'Индивидуальный' },
  { value: 'both', label: 'Групповой и индивидуальный' },
];

type TrainerProfileForm = {
  phone: string;
  phone_extra: string;
  trainer_lesson_formats: TrainerLessonFormat | '';
  trainer_banks: string[];
  city: string;
  trainer_telegram: string;
  is_self_employed: boolean;
  is_ip: boolean;
  work_schedule: string;
  qualification: string;
  trainer_comment: string;
};

const emptyProfileForm: TrainerProfileForm = {
  phone: '',
  phone_extra: '',
  trainer_lesson_formats: '',
  trainer_banks: [],
  city: '',
  trainer_telegram: '',
  is_self_employed: false,
  is_ip: false,
  work_schedule: '',
  qualification: '',
  trainer_comment: '',
};

function profileFromUser(u: User): TrainerProfileForm {
  return {
    phone: u.phone ?? '',
    phone_extra: u.phone_extra ?? '',
    trainer_lesson_formats: (u.trainer_lesson_formats as TrainerLessonFormat) ?? '',
    trainer_banks: u.trainer_banks ?? [],
    city: u.city ?? '',
    trainer_telegram: u.trainer_telegram ?? '',
    is_self_employed: u.is_self_employed ?? false,
    is_ip: u.is_ip ?? false,
    work_schedule: u.work_schedule ?? '',
    qualification: u.qualification ?? '',
    trainer_comment: u.trainer_comment ?? '',
  };
}

const TrainersPage: React.FC = () => {
  const [trainers, setTrainers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [newTrainer, setNewTrainer] = useState({
    full_name: '',
    email: '',
    password: '',
    ...emptyProfileForm,
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTrainer, setProfileTrainer] = useState<User | null>(null);
  const [profileForm, setProfileForm] = useState<TrainerProfileForm>(emptyProfileForm);
  const [trainerRates, setTrainerRates] = useState<Record<number, number>>({});
  const [trainerLessons, setTrainerLessons] = useState<Record<number, number>>({});

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data);
      setTrainerRates(
        data.reduce<Record<number, number>>((acc, trainer) => {
          acc[trainer.id] = trainer.trainer_rate ?? 0;
          return acc;
        }, {})
      );
      setTrainerLessons(
        data.reduce<Record<number, number>>((acc, trainer) => {
          acc[trainer.id] = trainer.trainer_lessons ?? 0;
          return acc;
        }, {})
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки тренеров');
    }
  };

  const loadGroups = async () => {
    try {
      const data = await groupsApi.getAll();
      setGroups(data);
    } catch (err) {
      // best-effort
    }
  };

  useEffect(() => {
    loadTrainers();
    loadGroups();
  }, []);

  const handleCreate = async () => {
    if (!newTrainer.full_name.trim() || !newTrainer.email.trim() || !newTrainer.password.trim()) {
      setError('Заполните ФИО, email и пароль');
      return;
    }
    if (newTrainer.password.length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      return;
    }
    try {
      await usersApi.create({
        full_name: newTrainer.full_name.trim(),
        email: newTrainer.email.trim(),
        password: newTrainer.password,
        role: 'trainer',
        phone: newTrainer.phone || undefined,
        phone_extra: newTrainer.phone_extra || undefined,
        trainer_lesson_formats: newTrainer.trainer_lesson_formats || undefined,
        trainer_banks: newTrainer.trainer_banks.length ? newTrainer.trainer_banks : undefined,
        city: newTrainer.city || undefined,
        trainer_telegram: newTrainer.trainer_telegram || undefined,
        is_self_employed: newTrainer.is_self_employed,
        is_ip: newTrainer.is_ip,
        work_schedule: newTrainer.work_schedule || undefined,
        qualification: newTrainer.qualification || undefined,
        trainer_comment: newTrainer.trainer_comment || undefined,
      });
      setOpen(false);
      setNewTrainer({ full_name: '', email: '', password: '', ...emptyProfileForm });
      setError('');
      loadTrainers();
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания тренера');
    }
  };

  const openProfile = (trainer: User) => {
    setProfileTrainer(trainer);
    setProfileForm(profileFromUser(trainer));
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!profileTrainer) return;
    try {
      await usersApi.update(profileTrainer.id, {
        phone: profileForm.phone || null,
        phone_extra: profileForm.phone_extra || null,
        trainer_lesson_formats: profileForm.trainer_lesson_formats || null,
        trainer_banks: profileForm.trainer_banks.length ? profileForm.trainer_banks : null,
        city: profileForm.city || null,
        trainer_telegram: profileForm.trainer_telegram || null,
        is_self_employed: profileForm.is_self_employed,
        is_ip: profileForm.is_ip,
        work_schedule: profileForm.work_schedule || null,
        qualification: profileForm.qualification || null,
        trainer_comment: profileForm.trainer_comment || null,
      });
      setProfileOpen(false);
      setProfileTrainer(null);
      loadTrainers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения профиля');
    }
  };

  const handleSaveCompensation = async (trainerId: number) => {
    try {
      await usersApi.update(trainerId, {
        trainer_rate: trainerRates[trainerId] ?? 0,
        trainer_lessons: trainerLessons[trainerId] ?? 0,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения ставки');
    }
  };

  const renderProfileFields = (
    form: TrainerProfileForm | typeof newTrainer,
    setForm: React.Dispatch<React.SetStateAction<any>>,
    isNewTrainer: boolean
  ) => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Профиль тренера (виден только owner, admin, sales)
      </Typography>
      <TextField
        fullWidth
        label="Телефон основной"
        value={form.phone}
        onChange={(e) => setForm((p: any) => ({ ...p, phone: e.target.value }))}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Телефон дополнительный"
        value={form.phone_extra}
        onChange={(e) => setForm((p: any) => ({ ...p, phone_extra: e.target.value }))}
        sx={{ mt: 1 }}
      />
      <FormControl fullWidth sx={{ mt: 1 }}>
        <InputLabel>Формат ведения занятий</InputLabel>
        <Select
          value={form.trainer_lesson_formats}
          label="Формат ведения занятий"
          onChange={(e) =>
            setForm((p: any) => ({ ...p, trainer_lesson_formats: e.target.value as TrainerLessonFormat | '' }))
          }
        >
          <MenuItem value="">Не указано</MenuItem>
          {LESSON_FORMAT_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>
        Банк для перевода
      </Typography>
      <FormGroup row>
        {TRAINER_BANK_KEYS.map((key) => (
          <FormControlLabel
            key={key}
            control={
              <Checkbox
                checked={form.trainer_banks.includes(key)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...form.trainer_banks, key]
                    : form.trainer_banks.filter((b: string) => b !== key);
                  setForm((p: any) => ({ ...p, trainer_banks: next }));
                }}
              />
            }
            label={TRAINER_BANK_LABELS[key as TrainerBankKey]}
          />
        ))}
      </FormGroup>
      <TextField
        fullWidth
        label="Город"
        value={form.city}
        onChange={(e) => setForm((p: any) => ({ ...p, city: e.target.value }))}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Телеграмм"
        value={form.trainer_telegram}
        onChange={(e) => setForm((p: any) => ({ ...p, trainer_telegram: e.target.value }))}
        sx={{ mt: 1 }}
      />
      <FormGroup row sx={{ mt: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={form.is_self_employed}
              onChange={(e) => setForm((p: any) => ({ ...p, is_self_employed: e.target.checked }))}
            />
          }
          label="Самозанятый"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.is_ip}
              onChange={(e) => setForm((p: any) => ({ ...p, is_ip: e.target.checked }))}
            />
          }
          label="ИП"
        />
      </FormGroup>
      <TextField
        fullWidth
        label="График работы"
        value={form.work_schedule}
        onChange={(e) => setForm((p: any) => ({ ...p, work_schedule: e.target.value }))}
        multiline
        minRows={2}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Квалификация"
        value={form.qualification}
        onChange={(e) => setForm((p: any) => ({ ...p, qualification: e.target.value }))}
        multiline
        minRows={2}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Комментарий"
        value={form.trainer_comment}
        onChange={(e) => setForm((p: any) => ({ ...p, trainer_comment: e.target.value }))}
        multiline
        minRows={2}
        sx={{ mt: 1 }}
      />
    </Box>
  );

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Тренеры</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setOpen(true);
            setNewTrainer({ full_name: '', email: '', password: '', ...emptyProfileForm });
          }}
        >
          Создать тренера
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ФИО</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Ставка тренера</TableCell>
              <TableCell>Количество занятий</TableCell>
              <TableCell>Оплата за месяц</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Количество групп</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trainers.map((trainer) => {
              const groupsCount = groups.filter((g) => g.trainer_id === trainer.id).length;
              const rate = trainerRates[trainer.id] ?? 0;
              const lessons = trainerLessons[trainer.id] ?? 0;
              const payment = rate * lessons;
              return (
                <TableRow key={trainer.id}>
                  <TableCell>{trainer.full_name}</TableCell>
                  <TableCell>{trainer.email}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={rate}
                      onChange={(e) =>
                        setTrainerRates((prev) => ({
                          ...prev,
                          [trainer.id]: toNumber(e.target.value),
                        }))
                      }
                      onBlur={() => handleSaveCompensation(trainer.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={lessons}
                      onChange={(e) =>
                        setTrainerLessons((prev) => ({
                          ...prev,
                          [trainer.id]: toNumber(e.target.value),
                        }))
                      }
                      onBlur={() => handleSaveCompensation(trainer.id)}
                    />
                  </TableCell>
                  <TableCell>{payment.toFixed(2)}</TableCell>
                  <TableCell>{trainer.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                  <TableCell>{groupsCount}</TableCell>
                  <TableCell>
                    <Button size="small" startIcon={<PersonIcon />} onClick={() => openProfile(trainer)} sx={{ mr: 1 }}>
                      Профиль
                    </Button>
                    {trainer.is_active ? (
                      <Button
                        size="small"
                        color="warning"
                        onClick={async () => {
                          try {
                            await usersApi.update(trainer.id, { is_active: false });
                            loadTrainers();
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Ошибка архивации тренера');
                          }
                        }}
                      >
                        Архивировать
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        color="success"
                        onClick={async () => {
                          try {
                            await usersApi.update(trainer.id, { is_active: true });
                            loadTrainers();
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Ошибка разархивации тренера');
                          }
                        }}
                      >
                        Разархивировать
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle>Создать тренера</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="ФИО тренера *"
            value={newTrainer.full_name}
            onChange={(e) => setNewTrainer({ ...newTrainer, full_name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Email *"
            type="email"
            value={newTrainer.email}
            onChange={(e) => setNewTrainer({ ...newTrainer, email: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Пароль *"
            type="password"
            value={newTrainer.password}
            onChange={(e) => setNewTrainer({ ...newTrainer, password: e.target.value })}
            sx={{ mt: 2 }}
            required
            helperText="Минимум 6 символов"
          />
          {renderProfileFields(newTrainer, setNewTrainer, true)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained">
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle>Профиль тренера{profileTrainer ? `: ${profileTrainer.full_name}` : ''}</DialogTitle>
        <DialogContent>
          {renderProfileFields(profileForm, setProfileForm, false)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileOpen(false)}>Отмена</Button>
          <Button onClick={handleSaveProfile} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TrainersPage;
