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
import { usersApi, groupsApi, salesApi, adminToolsApi } from '../services/api';
import {
  User,
  Group,
  TrainerLessonFormat,
  TRAINER_BANK_KEYS,
  TRAINER_BANK_LABELS,
  type TrainerBankKey,
} from '../types';
import { useAuth } from '../contexts/AuthContext';

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
  lesson_mode_online: boolean;
  lesson_mode_offline: boolean;
  qualification_languages: string;
  qualification_hackathons: string;
  qualification_olympiads: string;
  qualification_courses: string;
  work_experience: string;
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
  lesson_mode_online: false,
  lesson_mode_offline: false,
  qualification_languages: '',
  qualification_hackathons: '',
  qualification_olympiads: '',
  qualification_courses: '',
  work_experience: '',
};

function profileFromUser(u: User): TrainerProfileForm {
  let lesson_mode_online = false;
  let lesson_mode_offline = false;
  let qualification_languages = '';
  let qualification_hackathons = '';
  let qualification_olympiads = '';
  let qualification_courses = '';
  let work_experience = '';

  if (u.qualification) {
    try {
      const parsed = JSON.parse(u.qualification as string);
      if (parsed && typeof parsed === 'object') {
        if (parsed.lesson_modes) {
          lesson_mode_online = !!parsed.lesson_modes.online;
          lesson_mode_offline = !!parsed.lesson_modes.offline;
        }
        if (Array.isArray(parsed.languages)) {
          qualification_languages = parsed.languages.join(', ');
        }
        if (Array.isArray(parsed.hackathons)) {
          qualification_hackathons = parsed.hackathons
            .map((h: any) => [h.name, h.year].filter(Boolean).join(' / '))
            .join('\n');
        }
        if (Array.isArray(parsed.olympiads)) {
          qualification_olympiads = parsed.olympiads
            .map((o: any) => [o.name, o.year].filter(Boolean).join(' / '))
            .join('\n');
        }
        if (Array.isArray(parsed.courses)) {
          qualification_courses = parsed.courses
            .map((c: any) => [c.name, c.date].filter(Boolean).join(' / '))
            .join('\n');
        }
        if (typeof parsed.work_experience === 'string') {
          work_experience = parsed.work_experience;
        }
      }
    } catch {
      work_experience = u.qualification ?? '';
    }
  }

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
    lesson_mode_online,
    lesson_mode_offline,
    qualification_languages,
    qualification_hackathons,
    qualification_olympiads,
    qualification_courses,
    work_experience,
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
  const { user } = useAuth();
  const [citiesList, setCitiesList] = useState<string[]>([]);
  const [resetPasswordInfo, setResetPasswordInfo] = useState<{ trainer?: User | null; password: string } | null>(null);

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      // Скрываем архивных тренеров из основного списка
      setTrainers(data.filter((t) => t.is_active));
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
    salesApi
      .listSalesCities(true)
      .then((list) => setCitiesList(list.map((c) => c.name).filter(Boolean)))
      .catch(() => {});
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
      const qualificationPayload = {
        lesson_modes: {
          online: profileForm.lesson_mode_online,
          offline: profileForm.lesson_mode_offline,
        },
        languages: profileForm.qualification_languages
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        hackathons: profileForm.qualification_hackathons
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, year] = line.split('/').map((s) => s.trim());
            return { name, year };
          }),
        olympiads: profileForm.qualification_olympiads
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, year] = line.split('/').map((s) => s.trim());
            return { name, year };
          }),
        courses: profileForm.qualification_courses
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, date] = line.split('/').map((s) => s.trim());
            return { name, date };
          }),
        work_experience: profileForm.work_experience.trim(),
      };

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
        qualification: JSON.stringify(qualificationPayload),
        trainer_comment: profileForm.trainer_comment || null,
      });
      setProfileOpen(false);
      setProfileTrainer(null);
      loadTrainers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения профиля');
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
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Город
        </Typography>
        {/* Город из справочника Sales (с возможностью свободного ввода) */}
        {/* Используем Autocomplete из StudentsPage по списку городов sales */}
        {/* Чтобы не тянуть компонент напрямую, заменяем на простой Select при пустом справочнике */}
        {citiesList.length ? (
          <FormControl fullWidth size="small">
            <InputLabel>Город</InputLabel>
            <Select
              label="Город"
              value={form.city || ''}
              onChange={(e) => setForm((p: any) => ({ ...p, city: e.target.value }))}
            >
              <MenuItem value="">
                <em>Не указан</em>
              </MenuItem>
              {citiesList.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            fullWidth
            label="Город"
            value={form.city}
            onChange={(e) => setForm((p: any) => ({ ...p, city: e.target.value }))}
            size="small"
          />
        )}
      </Box>
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
      <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
        График работы
      </Typography>
      <TextField
        fullWidth
        placeholder="Например: Пн–Пт 08:00–12:00, 14:00–18:00"
        value={form.work_schedule}
        onChange={(e) => setForm((p: any) => ({ ...p, work_schedule: e.target.value }))}
        multiline
        minRows={2}
        sx={{ mt: 0.5 }}
      />

      <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
        Формат занятий
      </Typography>
      <FormGroup row sx={{ mt: 0.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={form.lesson_mode_online}
              onChange={(e) => setForm((p: any) => ({ ...p, lesson_mode_online: e.target.checked }))}
            />
          }
          label="Онлайн"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.lesson_mode_offline}
              onChange={(e) => setForm((p: any) => ({ ...p, lesson_mode_offline: e.target.checked }))}
            />
          }
          label="Офлайн"
        />
      </FormGroup>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
        Квалификация
      </Typography>
      <TextField
        fullWidth
        label="Языки программирования (через запятую)"
        value={form.qualification_languages}
        onChange={(e) => setForm((p: any) => ({ ...p, qualification_languages: e.target.value }))}
        sx={{ mt: 0.5 }}
      />
      <TextField
        fullWidth
        label="Хакатоны (каждый с новой строки: название / год)"
        value={form.qualification_hackathons}
        onChange={(e) => setForm((p: any) => ({ ...p, qualification_hackathons: e.target.value }))}
        multiline
        minRows={2}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Олимпиады (каждый с новой строки: название / год)"
        value={form.qualification_olympiads}
        onChange={(e) => setForm((p: any) => ({ ...p, qualification_olympiads: e.target.value }))}
        multiline
        minRows={2}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Пройденные курсы (каждый с новой строки: курс / дата)"
        value={form.qualification_courses}
        onChange={(e) => setForm((p: any) => ({ ...p, qualification_courses: e.target.value }))}
        multiline
        minRows={2}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Опыт работы"
        value={form.work_experience}
        onChange={(e) => setForm((p: any) => ({ ...p, work_experience: e.target.value }))}
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
        {(user?.role === 'admin' || user?.role === 'owner') && (
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
        )}
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
              <TableCell width={48}>№</TableCell>
              <TableCell>ФИО</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Количество групп</TableCell>
              {user?.role === 'owner' && (
                <>
                  <TableCell>Ставка</TableCell>
                  <TableCell>Занятий в месяц</TableCell>
                  <TableCell>Оплата за месяц</TableCell>
                </>
              )}
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trainers.map((trainer, idx) => {
              const groupsCount = groups.filter((g) => g.trainer_id === trainer.id).length;
              const rate = trainer.trainer_rate ?? 0;
              const lessons = trainer.trainer_lessons ?? 0;
              const monthPay = rate * lessons;
              return (
                <TableRow key={trainer.id} hover onClick={() => openProfile(trainer)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{trainer.full_name}</TableCell>
                  <TableCell>{trainer.email}</TableCell>
                  <TableCell>{trainer.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                  <TableCell>{groupsCount}</TableCell>
                  {user?.role === 'owner' && (
                    <>
                      <TableCell>{rate ? `${rate.toLocaleString('ru-RU')} ₽` : '—'}</TableCell>
                      <TableCell>{lessons || '—'}</TableCell>
                      <TableCell>{monthPay ? `${monthPay.toLocaleString('ru-RU')} ₽` : '—'}</TableCell>
                    </>
                  )}
                  <TableCell>
                    <Button
                      size="small"
                      startIcon={<PersonIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        openProfile(trainer);
                      }}
                      sx={{ mr: 1 }}
                    >
                      Профиль
                    </Button>
                    {(user?.role === 'admin' || user?.role === 'owner') && (
                      <Button
                        size="small"
                        sx={{ mr: 1 }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await adminToolsApi.resetTrainerPassword(trainer.id);
                            setResetPasswordInfo({ trainer, password: res.temporary_password });
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Не удалось сбросить пароль тренера');
                          }
                        }}
                      >
                        Сбросить пароль
                      </Button>
                    )}
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

      <Dialog
        open={!!resetPasswordInfo}
        onClose={() => setResetPasswordInfo(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Временный пароль тренера</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {resetPasswordInfo?.trainer
              ? `Для тренера «${resetPasswordInfo.trainer.full_name}» создан временный пароль.`
              : 'Создан временный пароль для тренера.'}
          </Typography>
          <TextField
            fullWidth
            label="Временный пароль"
            value={resetPasswordInfo?.password || ''}
            InputProps={{ readOnly: true }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Пароль также отправлен тренеру в Telegram (если он привязан). Передайте его тренеру любым удобным способом.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPasswordInfo(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TrainersPage;
