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
import { usersApi, groupsApi, salesApi, adminToolsApi, rolesApi } from '../services/api';
import {
  User,
  Group,
  Role,
  TrainerLessonFormat,
  TRAINER_BANK_KEYS,
  TRAINER_BANK_LABELS,
  type TrainerBankKey,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import { applyPhoneMask, isValidPhone, phoneFromApi, phoneToApiValue } from '../utils/phoneMask';
import { hasPermission } from '../utils/permissions';

/** Дни недели для графика работы */
const WORK_SCHEDULE_DAYS = [
  { id: 'mon', label: 'Пн' },
  { id: 'tue', label: 'Вт' },
  { id: 'wed', label: 'Ср' },
  { id: 'thu', label: 'Чт' },
  { id: 'fri', label: 'Пт' },
  { id: 'sat', label: 'Сб' },
  { id: 'sun', label: 'Вс' },
] as const;

/** Часовые интервалы 06:00–23:00 */
const WORK_SCHEDULE_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 6; h <= 22; h++) {
    const start = `${String(h).padStart(2, '0')}:00`;
    const end = `${String(h + 1).padStart(2, '0')}:00`;
    slots.push(`${start}-${end}`);
  }
  return slots;
})();

function parseWorkSchedule(workSchedule: string): { days: string[]; slots: string[] } {
  if (!workSchedule?.trim()) return { days: [], slots: [] };
  try {
    const parsed = JSON.parse(workSchedule) as { d?: string[]; s?: string[] };
    if (parsed && typeof parsed === 'object') {
      const days = Array.isArray(parsed.d) ? parsed.d : [];
      const slots = Array.isArray(parsed.s) ? parsed.s : [];
      return { days, slots };
    }
  } catch {
    // legacy free text — return empty, UI will show checkboxes empty
  }
  return { days: [], slots: [] };
}

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
    phone: phoneFromApi(u.phone ?? ''),
    phone_extra: phoneFromApi(u.phone_extra ?? ''),
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
  const [trainerRoles, setTrainerRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [newTrainer, setNewTrainer] = useState({
    full_name: '',
    email: '',
    password: '',
    custom_role_id: '',
    ...emptyProfileForm,
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTrainer, setProfileTrainer] = useState<User | null>(null);
  const [profileForm, setProfileForm] = useState<TrainerProfileForm>(emptyProfileForm);
  const { user } = useAuth();
  const canManageUsers = hasPermission(user, 'users.manage');
  const canViewTrainerFinancials = hasPermission(user, 'owner_calculations.access');
  const [citiesList, setCitiesList] = useState<string[]>([]);
  const [resetPasswordInfo, setResetPasswordInfo] = useState<{ trainer?: User | null; password: string } | null>(null);

  const loadTrainers = async () => {
    try {
      const [data, allRoles] = await Promise.all([usersApi.getAll('trainer'), rolesApi.getAll()]);
      // Скрываем архивных тренеров из основного списка
      setTrainers(data.filter((t) => t.is_active));
      setTrainerRoles(allRoles.filter((role) => role.base_role === 'trainer' && role.is_active));
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
    if (!newTrainer.phone.trim()) {
      setError('Укажите основной телефон');
      return;
    }
    if (!isValidPhone(newTrainer.phone)) {
      setError('Некорректный основной телефон. Введите 10 цифр номера.');
      return;
    }
    if (newTrainer.phone_extra.trim() && !isValidPhone(newTrainer.phone_extra)) {
      setError('Некорректный дополнительный телефон. Введите 10 цифр или оставьте пустым.');
      return;
    }
    try {
      await usersApi.create({
        full_name: newTrainer.full_name.trim(),
        email: newTrainer.email.trim(),
        password: newTrainer.password,
        role: 'trainer',
        custom_role_id: newTrainer.custom_role_id ? Number(newTrainer.custom_role_id) : undefined,
        phone: phoneToApiValue(newTrainer.phone) || undefined,
        phone_extra: newTrainer.phone_extra.trim() ? phoneToApiValue(newTrainer.phone_extra) : undefined,
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
      setNewTrainer({ full_name: '', email: '', password: '', custom_role_id: '', ...emptyProfileForm });
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
    if (!profileForm.phone.trim()) {
      setError('Укажите основной телефон');
      return;
    }
    if (!isValidPhone(profileForm.phone)) {
      setError('Некорректный основной телефон. Введите 10 цифр номера.');
      return;
    }
    if (profileForm.phone_extra.trim() && !isValidPhone(profileForm.phone_extra)) {
      setError('Некорректный дополнительный телефон. Введите 10 цифр или оставьте пустым.');
      return;
    }
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
        phone: phoneToApiValue(profileForm.phone) || null,
        phone_extra: profileForm.phone_extra.trim() ? phoneToApiValue(profileForm.phone_extra) : null,
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
        required
        label="Телефон основной *"
        value={form.phone}
        onChange={(e) => setForm((p: any) => ({ ...p, phone: applyPhoneMask(e.target.value) }))}
        onBlur={(e) => setForm((p: any) => ({ ...p, phone: applyPhoneMask((p as any).phone || '') }))}
        placeholder="+7(999) 123-45-67"
        error={!!form.phone && !isValidPhone(form.phone)}
        helperText={form.phone && !isValidPhone(form.phone) ? 'Введите 10 цифр номера' : ''}
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        label="Телефон дополнительный"
        value={form.phone_extra}
        onChange={(e) => setForm((p: any) => ({ ...p, phone_extra: applyPhoneMask(e.target.value) }))}
        onBlur={(e) => setForm((p: any) => ({ ...p, phone_extra: applyPhoneMask((p as any).phone_extra || '') }))}
        placeholder="+7(999) 123-45-67"
        error={!!form.phone_extra && !isValidPhone(form.phone_extra)}
        helperText={form.phone_extra && !isValidPhone(form.phone_extra) ? 'Введите 10 цифр или оставьте пустым' : ''}
        sx={{ mt: 1 }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>
        Формат ведения занятий
      </Typography>
      <FormGroup row sx={{ mt: 0.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={form.trainer_lesson_formats === 'group' || form.trainer_lesson_formats === 'both'}
              onChange={(e) => {
                const group = e.target.checked;
                const ind = form.trainer_lesson_formats === 'individual' || form.trainer_lesson_formats === 'both';
                const next: TrainerLessonFormat | '' = group && ind ? 'both' : group ? 'group' : ind ? 'individual' : '';
                setForm((p: any) => ({ ...p, trainer_lesson_formats: next }));
              }}
            />
          }
          label="Групповой"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.trainer_lesson_formats === 'individual' || form.trainer_lesson_formats === 'both'}
              onChange={(e) => {
                const ind = e.target.checked;
                const group = form.trainer_lesson_formats === 'group' || form.trainer_lesson_formats === 'both';
                const next: TrainerLessonFormat | '' = group && ind ? 'both' : group ? 'group' : ind ? 'individual' : '';
                setForm((p: any) => ({ ...p, trainer_lesson_formats: next }));
              }}
            />
          }
          label="Индивидуальный"
        />
      </FormGroup>
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
        placeholder="@username"
        helperText="@username"
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
      {form.work_schedule.trim() && !form.work_schedule.trim().startsWith('{"d"') && (() => {
        const parsed = parseWorkSchedule(form.work_schedule);
        const isLegacy = parsed.days.length === 0 && parsed.slots.length === 0;
        if (isLegacy) {
          return (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Ранее указано: {form.work_schedule}
            </Typography>
          );
        }
        return null;
      })()}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Дни
      </Typography>
      <FormGroup row sx={{ flexWrap: 'wrap', gap: 0 }}>
        {WORK_SCHEDULE_DAYS.map(({ id, label }) => {
          const parsed = parseWorkSchedule(form.work_schedule);
          const checked = parsed.days.includes(id);
          return (
            <FormControlLabel
              key={id}
              control={
                <Checkbox
                  checked={checked}
                  onChange={() => {
                    const parsed = parseWorkSchedule(form.work_schedule);
                    const days = checked ? parsed.days.filter((d) => d !== id) : [...parsed.days, id].sort();
                    const next = JSON.stringify({ d: days, s: parsed.slots });
                    setForm((p: any) => ({ ...p, work_schedule: next }));
                  }}
                />
              }
              label={label}
            />
          );
        })}
      </FormGroup>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
        Время (интервал 1 час)
      </Typography>
      <FormGroup row sx={{ flexWrap: 'wrap', gap: 0 }}>
        {WORK_SCHEDULE_SLOTS.map((slot) => {
          const parsed = parseWorkSchedule(form.work_schedule);
          const checked = parsed.slots.includes(slot);
          return (
            <FormControlLabel
              key={slot}
              control={
                <Checkbox
                  checked={checked}
                  onChange={() => {
                    const parsed = parseWorkSchedule(form.work_schedule);
                    const slots = checked ? parsed.slots.filter((s) => s !== slot) : [...parsed.slots, slot].sort();
                    const next = JSON.stringify({ d: parsed.days, s: slots });
                    setForm((p: any) => ({ ...p, work_schedule: next }));
                  }}
                />
              }
              label={slot}
            />
          );
        })}
      </FormGroup>

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
        {canManageUsers && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setOpen(true);
              setNewTrainer({ full_name: '', email: '', password: '', custom_role_id: '', ...emptyProfileForm });
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
              {canViewTrainerFinancials && (
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
                  {canViewTrainerFinancials && (
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
                    {canManageUsers && (
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
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Кастомная роль</InputLabel>
            <Select
              label="Кастомная роль"
              value={newTrainer.custom_role_id}
              onChange={(e) => setNewTrainer({ ...newTrainer, custom_role_id: String(e.target.value) })}
            >
              <MenuItem value="">Без кастомной роли</MenuItem>
              {trainerRoles.map((role) => (
                <MenuItem key={role.id} value={String(role.id)}>
                  {role.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {renderProfileFields(newTrainer, setNewTrainer, true)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={
              !newTrainer.phone.trim() ||
              !isValidPhone(newTrainer.phone) ||
              (!!newTrainer.phone_extra.trim() && !isValidPhone(newTrainer.phone_extra))
            }
          >
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
          <Button
            onClick={handleSaveProfile}
            variant="contained"
            disabled={
              !profileForm.phone.trim() ||
              !isValidPhone(profileForm.phone) ||
              (!!profileForm.phone_extra.trim() && !isValidPhone(profileForm.phone_extra))
            }
          >
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
