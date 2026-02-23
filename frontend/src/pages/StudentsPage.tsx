import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  Checkbox,
  FormControlLabel,
  Switch,
  Autocomplete,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, AccountBalance as AccountBalanceIcon, Person as PersonIcon } from '@mui/icons-material';
import { studentsApi, usersApi, groupsApi, programsApi, abonementsApi, studentAccountsApi, studentCardsApi, salesApi } from '../services/api';
import { Student, User, Group, Program, Abonement, StudentAccount, StudentCard as StudentCardType } from '../types';
import type { AnketaConvertConflict } from '../types';
import { useAuth } from '../contexts/AuthContext';
import StudentDetailPopup from '../components/StudentDetailPopup';
import AnketaFormDrawer from '../components/AnketaFormDrawer';
import { studentCardsApi } from '../services/api';
import { applyPhoneMask, isValidPhone, phoneFromApi, phoneToApiValue } from '../utils/phoneMask';

const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [typeFilter, setTypeFilter] = useState<'' | 'grant' | 'individual' | 'paid'>('');
  const [studentCards, setStudentCards] = useState<StudentCardType[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [error, setError] = useState('');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    parent_id: '',
    trainer_id: '',
    group_id: '',
    program_id: '',
    abonement_id: '',
  });
  const [parentCreateMode, setParentCreateMode] = useState<'none' | 'existing' | 'new'>('new');
  const [parentSearchQuery, setParentSearchQuery] = useState('');
  const [parentSearchResults, setParentSearchResults] = useState<{ id: number; full_name: string; email: string }[]>([]);
  const [parentSearching, setParentSearching] = useState(false);
  const [selectedParentForCreate, setSelectedParentForCreate] = useState<{ id: number; full_name: string; email: string } | null>(null);
  const [newParent, setNewParent] = useState({
    full_name: '',
    email: '',
  });
  const [createCardToo, setCreateCardToo] = useState(false);
  const [cardFields, setCardFields] = useState({
    student_full_name: '',
    student_email: '',
    birth_date: '',
    student_phone: '',
    telegram: '',
    gender: '' as '' | 'm' | 'f',
    on_grant: false,
    format_type: '' as '' | 'group' | 'individual',
    city: '',
    school: '',
    grade: '',
    parent_full_name: '',
    parent_phone: '',
    parent_phone_2: '',
    parent_telegram: '',
    parent_email: '',
    preferred_messenger: '' as '' | 'max' | 'telegram' | 'sms',
    source: '',
    comment: '',
  });
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editParentCabinetLink, setEditParentCabinetLink] = useState<string | null>(null);
  const [editParentCabinetMessage, setEditParentCabinetMessage] = useState<string | null>(null);
  const [editParentCabinetLoading, setEditParentCabinetLoading] = useState(false);
  const [newTrainer, setNewTrainer] = useState({
    full_name: '',
    email: '',
    password: '',
  });
  const [parents, setParents] = useState<User[]>([]);
  const [trainers, setTrainers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);
  const [accountsStudent, setAccountsStudent] = useState<Student | null>(null);
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<{ account: StudentAccount; type: 'payment' | 'deduct' } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [accountsError, setAccountsError] = useState('');
  const [studentDetailId, setStudentDetailId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  useEffect(() => {
    const detailId = searchParams.get('detail');
    if (detailId && /^\d+$/.test(detailId)) {
      setStudentDetailId(Number(detailId));
    }
  }, [searchParams]);
  const isAdminLike = user?.role === 'admin' || user?.role === 'owner';
  const isOwner = user?.role === 'owner';
  const hasFullStudentsView = isAdminLike || user?.role === 'sales';
  const canAssignAbonement = isAdminLike || user?.role === 'sales';
  const canManageAccounts = isAdminLike || user?.role === 'parent' || user?.role === 'sales';
  const canCreateCard = isAdminLike || user?.role === 'sales';
  const canSeeAnkety = isAdminLike || user?.role === 'sales';
  const [citiesList, setCitiesList] = useState<string[]>([]);

  const studentsTab = searchParams.get('tab') !== 'ankety' ? 'students' : 'ankety';
  const setStudentsTab = (tab: 'students' | 'ankety') => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'ankety') next.set('tab', 'ankety');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const [anketyItems, setAnketyItems] = useState<StudentCardType[]>([]);
  const [anketyLoading, setAnketyLoading] = useState(false);
  const [anketyError, setAnketyError] = useState<string | null>(null);
  const [anketyStatusTab, setAnketyStatusTab] = useState<'all' | 'draft' | 'filled' | 'converted' | 'cancelled'>('all');
  const [anketaFormOpen, setAnketaFormOpen] = useState(false);
  const [anketaFormMode, setAnketaFormMode] = useState<'create' | 'edit' | 'addStudent'>('create');
  const [anketaFormCardId, setAnketaFormCardId] = useState<number | null>(null);
  const [convertLoading, setConvertLoading] = useState<number | null>(null);
  const [convertCardId, setConvertCardId] = useState<number | null>(null);
  const [convertConflict, setConvertConflict] = useState<AnketaConvertConflict | null>(null);
  const [conflictChoice, setConflictChoice] = useState<'existing_parent' | 'existing_student' | 'new_student' | null>(null);
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState<number | ''>('');

  const ANKETA_STATUS_LABELS: Record<string, string> = {
    draft: 'Новая',
    filled: 'Заполнена',
    converted: 'Конвертирована',
    cancelled: 'Отменена',
  };

  const loadAnkety = async () => {
    if (!canSeeAnkety) return;
    setAnketyLoading(true);
    setAnketyError(null);
    try {
      const params: { archived?: boolean; anketa_status?: string[] } = { archived: false };
      if (anketyStatusTab !== 'all') params.anketa_status = [anketyStatusTab];
      const data = await studentCardsApi.list(params);
      setAnketyItems(data);
    } catch (err: any) {
      setAnketyError(err.response?.data?.detail || 'Не удалось загрузить анкеты');
    } finally {
      setAnketyLoading(false);
    }
  };

  useEffect(() => {
    if (canSeeAnkety && studentsTab === 'ankety') void loadAnkety();
  }, [canSeeAnkety, studentsTab, anketyStatusTab]);

  const cardIdFromUrl = searchParams.get('cardId');
  useEffect(() => {
    if (!cardIdFromUrl) return;
    const id = parseInt(cardIdFromUrl, 10);
    if (Number.isNaN(id)) return;
    setStudentsTab('ankety');
    setAnketaFormMode('edit');
    setAnketaFormCardId(id);
    setAnketaFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('cardId');
    setSearchParams(next, { replace: true });
  }, [cardIdFromUrl]);

  const handleConvert = async (card: StudentCardType, body?: { use_existing_parent_id?: number; use_existing_student_id?: number }) => {
    setConvertLoading(card.id);
    setAnketyError(null);
    setConvertConflict(null);
    setConvertCardId(card.id);
    setConflictChoice(null);
    setSelectedExistingStudentId('');
    try {
      const res = await studentCardsApi.convert(card.id, body);
      setConvertCardId(null);
      await loadAnkety();
      if (res.student_id) setStudentDetailId(res.student_id);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409 && detail && (detail.code === 'existing_parent' || detail.code === 'existing_student')) {
        setConvertConflict(detail as AnketaConvertConflict);
      } else {
        setAnketyError(typeof detail === 'string' ? detail : detail?.message || 'Ошибка конверсии');
      }
    } finally {
      setConvertLoading(null);
    }
  };

  const handleConflictResolve = async () => {
    if (!convertCardId || !convertConflict) return;
    if (convertConflict.code === 'existing_parent' && conflictChoice === 'existing_parent' && convertConflict.existing_parent_id) {
      await handleConvert({ id: convertCardId } as StudentCardType, { use_existing_parent_id: convertConflict.existing_parent_id });
      setConvertConflict(null);
      setConvertCardId(null);
      return;
    }
    if (convertConflict.code === 'existing_student') {
      if (conflictChoice === 'existing_student' && (convertConflict.existing_student_id || selectedExistingStudentId)) {
        const sid = Number(selectedExistingStudentId || convertConflict.existing_student_id);
        await handleConvert({ id: convertCardId } as StudentCardType, { use_existing_student_id: sid });
        setConvertConflict(null);
        setConvertCardId(null);
        setSelectedExistingStudentId('');
        return;
      }
      if (conflictChoice === 'new_student' && convertConflict.existing_parent_id) {
        await handleConvert({ id: convertCardId } as StudentCardType, { use_existing_parent_id: convertConflict.existing_parent_id });
        setConvertConflict(null);
        setConvertCardId(null);
        return;
      }
    }
    setAnketyError('Выберите вариант');
  };

  const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

  useEffect(() => {
    if (!hasFullStudentsView) {
      loadStudents();
      return;
    }
    loadParents();
    if (canCreateCard) {
      salesApi.listSalesCities(true).then((list) => setCitiesList(list.map((c) => c.name).filter(Boolean))).catch(() => {});
    }
    if (!isOwner || user?.role === 'sales') {
      loadTrainers();
    }
    loadGroups();
    loadPrograms();
    if (canAssignAbonement) {
      loadAbonements();
    }
    studentCardsApi.list({}).then(setStudentCards).catch(() => setStudentCards([]));
  }, [user, canCreateCard, hasFullStudentsView, canAssignAbonement]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadStudents();
    }, searchQuery.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [user, statusFilter, searchQuery]);

  useEffect(() => {
    if (parentCreateMode !== 'existing' || !parentSearchQuery.trim()) {
      setParentSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      setParentSearching(true);
      studentsApi
        .searchParents(parentSearchQuery.trim())
        .then(setParentSearchResults)
        .catch(() => setParentSearchResults([]))
        .finally(() => setParentSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [parentCreateMode, parentSearchQuery]);

  useEffect(() => {
    setCardFields((prev) => ({
      ...prev,
      student_full_name: newStudent.full_name,
      parent_full_name: parentCreateMode === 'new' ? newParent.full_name : (selectedParentForCreate?.full_name ?? ''),
      parent_email: parentCreateMode === 'new' ? newParent.email : (selectedParentForCreate?.email ?? ''),
    }));
  }, [newStudent.full_name, parentCreateMode, newParent.full_name, newParent.email, selectedParentForCreate?.full_name, selectedParentForCreate?.email]);

  const loadStudents = async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.q = searchQuery.trim();
      const data = await studentsApi.getAll(Object.keys(params).length ? params : undefined);
      setStudents(data);
    } catch (err) {
      setError('Ошибка загрузки данных');
    }
  };

  const openAccountsDialog = async (student: Student) => {
    setAccountsStudent(student);
    setAccountsDialogOpen(true);
    setNewAccountName('');
    setAccountsError('');
    setAccountsLoading(true);
    try {
      const list = await studentsApi.getAccounts(student.id);
      setAccounts(list);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Не удалось загрузить счета. Убедитесь, что на сервере выполнена миграция: alembic upgrade head';
      setAccountsError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!accountsStudent || !newAccountName.trim()) return;
    setAccountsLoading(true);
    try {
      const created = await studentsApi.createAccount(accountsStudent.id, { name: newAccountName.trim() });
      setAccounts((prev) => [...prev, created]);
      setNewAccountName('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания счета');
    } finally {
      setAccountsLoading(false);
    }
  };

  const handlePaymentOrDeduct = async () => {
    if (!paymentDialog) return;
    const amount = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      setError('Введите положительную сумму');
      return;
    }
    if (paymentDialog.type === 'deduct' && paymentDialog.account.balance < amount) {
      setError('Недостаточно средств на счете');
      return;
    }
    setAccountsLoading(true);
    setError('');
    try {
      if (paymentDialog.type === 'payment') {
        await studentAccountsApi.addPayment(paymentDialog.account.id, { amount, note: paymentNote.trim() || undefined });
      } else {
        await studentAccountsApi.deduct(paymentDialog.account.id, { amount, note: paymentNote.trim() || undefined });
      }
      if (accountsStudent) {
        const list = await studentsApi.getAccounts(accountsStudent.id);
        setAccounts(list);
      }
      setPaymentDialog(null);
      setPaymentAmount('');
      setPaymentNote('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка операции');
    } finally {
      setAccountsLoading(false);
    }
  };

  const loadParents = async () => {
    try {
      const data = await usersApi.getAll('parent');
      setParents(data);
    } catch (err) {
      console.error('Ошибка загрузки родителей', err);
    }
  };

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data);
    } catch (err) {
      console.error('Ошибка загрузки тренеров', err);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await groupsApi.getAll();
      // Загружаем полную информацию о каждой группе, включая учеников
      const groupsWithStudents = await Promise.all(
        data
          .filter(g => g.status === 'active')
          .map(async (group) => {
            try {
              const fullGroup = await groupsApi.getById(group.id);
              return fullGroup;
            } catch (err) {
              return group;
            }
          })
      );
      setGroups(groupsWithStudents);
    } catch (err) {
      console.error('Ошибка загрузки групп', err);
    }
  };

  const loadPrograms = async () => {
    try {
      const data = await programsApi.getAll();
      // показываем только активные программы
      setPrograms(data.filter((p) => p.status === 'active'));
    } catch (err) {
      console.error('Ошибка загрузки программ', err);
    }
  };

  const loadAbonements = async () => {
    try {
      const data = await abonementsApi.getAll();
      setAbonements(data);
    } catch (err) {
      console.error('Ошибка загрузки абонементов', err);
    }
  };

  const handleCreate = async () => {
    if (!newStudent.full_name.trim()) {
      setError('Заполните ФИО ученика');
      return;
    }

    const abonementId =
      canAssignAbonement && newStudent.abonement_id && newStudent.abonement_id.trim() !== ''
        ? parseInt(newStudent.abonement_id)
        : null;
    if (abonementId !== null && isNaN(abonementId)) {
      setError('Некорректный абонемент');
      return;
    }

    try {
      setError('');

      if (parentCreateMode === 'none') {
        const studentData: any = {
          full_name: newStudent.full_name.trim(),
          abonement_id: abonementId ?? undefined,
        };
        const createdStudent = await studentsApi.create(studentData);
        await assignProgramAndGroup(createdStudent.id);
        if (createCardToo && canCreateCard) {
          const phoneErr = [cardFields.student_phone, cardFields.parent_phone, cardFields.parent_phone_2].find((p) => p.trim() && !isValidPhone(p));
          if (phoneErr) {
            setError('Введите корректный номер телефона: 10 цифр в формате +7(XXX) XXX-XX-XX');
            return;
          }
          if (cardFields.student_email.trim() && !isValidEmail(cardFields.student_email)) {
            setError('Введите корректный email ученика');
            return;
          }
          if (cardFields.parent_email.trim() && !isValidEmail(cardFields.parent_email)) {
            setError('Введите корректный email родителя');
            return;
          }
          try {
            await createCardForStudent(createdStudent, null);
          } catch (err: any) {
            setError(err.response?.data?.detail || 'Ученик создан, но не удалось создать карточку');
            return;
          }
        }
        setOpen(false);
        resetCreateForm();
        loadStudents();
        loadGroups();
        return;
      }

      if (parentCreateMode === 'existing' && !selectedParentForCreate) {
        setError('Выберите родителя из списка или переключитесь на «Создать нового»');
        return;
      }
      if (parentCreateMode === 'new' && (!newParent.full_name.trim() || !newParent.email.trim())) {
        setError('Заполните ФИО и email родителя');
        return;
      }
      if (parentCreateMode === 'new' && newParent.email.trim() && !isValidEmail(newParent.email)) {
        setError('Введите корректный email родителя');
        return;
      }

      const parentPayload =
        parentCreateMode === 'existing' && selectedParentForCreate
          ? { id: selectedParentForCreate.id, full_name: selectedParentForCreate.full_name, email: selectedParentForCreate.email }
          : { id: null as number | null, full_name: newParent.full_name.trim(), email: newParent.email.trim() };

      const { student: createdStudent, parent: createdParent } = await studentsApi.createWithParent({
        student: { full_name: newStudent.full_name.trim(), abonement_id: abonementId ?? undefined },
        parent: parentPayload,
      });

      await assignProgramAndGroup(createdStudent.id);
      if (createCardToo && canCreateCard) {
        const phoneErr = [cardFields.student_phone, cardFields.parent_phone, cardFields.parent_phone_2].find((p) => p.trim() && !isValidPhone(p));
        if (phoneErr) {
          setError('Введите корректный номер телефона: 10 цифр в формате +7(XXX) XXX-XX-XX');
          return;
        }
        if (cardFields.student_email.trim() && !isValidEmail(cardFields.student_email)) {
          setError('Введите корректный email ученика');
          return;
        }
        const parentEmail = (cardFields.parent_email || createdParent.email || '').trim();
        if (parentEmail && !isValidEmail(parentEmail)) {
          setError('Введите корректный email родителя');
          return;
        }
        try {
          await createCardForStudent(createdStudent, {
            full_name: createdParent.full_name,
            email: createdParent.email,
          });
        } catch (err: any) {
          setError(err.response?.data?.detail || 'Ученик создан, но не удалось создать карточку');
          return;
        }
      }
      setOpen(false);
      resetCreateForm();
      loadStudents();
      loadGroups();
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message || 'Ошибка создания ученика';
      if (status === 409) {
        setError('Найдено несколько родителей с таким email. Выберите родителя из списка (режим «Выбрать существующего»).');
      } else {
        setError(detail);
      }
    }
  };

  const assignProgramAndGroup = async (studentId: number) => {
    if (newStudent.program_id && newStudent.program_id.trim() !== '') {
      const programId = parseInt(newStudent.program_id);
      if (!isNaN(programId)) {
        try {
          await programsApi.assignToStudent(programId, studentId);
        } catch (err: any) {
          setError(`Ученик создан, но не удалось назначить программу: ${err.response?.data?.detail || 'ошибка'}`);
        }
      }
    }
    if (newStudent.group_id && newStudent.group_id.trim() !== '') {
      const groupId = parseInt(newStudent.group_id);
      if (!isNaN(groupId)) {
        try {
          await groupsApi.addStudent(groupId, studentId);
        } catch (err: any) {
          console.error('Ошибка добавления в группу', err);
        }
      }
    }
  };

  const createCardForStudent = async (
    student: Student,
    parentInfo: { full_name: string; email: string } | null
  ) => {
    await studentCardsApi.create({
      student_id: student.id,
      student_full_name: (cardFields.student_full_name || student.full_name).trim(),
      student_email: cardFields.student_email.trim() || undefined,
      birth_date: cardFields.birth_date.trim() || undefined,
      student_phone: cardFields.student_phone.trim() ? phoneToApiValue(cardFields.student_phone) || undefined : undefined,
      telegram: cardFields.telegram.trim() || undefined,
      gender: cardFields.gender || undefined,
      on_grant: cardFields.on_grant,
      format_type: cardFields.format_type || undefined,
      city: cardFields.city.trim() || undefined,
      school: cardFields.school.trim() || undefined,
      grade: cardFields.grade.trim() || undefined,
      parent_full_name: (cardFields.parent_full_name || parentInfo?.full_name || '').trim() || undefined,
      parent_phone: cardFields.parent_phone.trim() ? phoneToApiValue(cardFields.parent_phone) || undefined : undefined,
      parent_phone_2: cardFields.parent_phone_2.trim() ? phoneToApiValue(cardFields.parent_phone_2) || undefined : undefined,
      parent_telegram: cardFields.parent_telegram.trim() || undefined,
      parent_email: (cardFields.parent_email || parentInfo?.email || '').trim() || undefined,
      preferred_messenger: cardFields.preferred_messenger || undefined,
      source: cardFields.source.trim() || undefined,
      comment: cardFields.comment.trim() || undefined,
      discount_type: 'none',
      discount_value: 0,
    });
  };

  const emptyCardFields = () => ({
    student_full_name: '',
    student_email: '',
    birth_date: '',
    student_phone: '',
    telegram: '',
    gender: '' as '' | 'm' | 'f',
    on_grant: false,
    format_type: '' as '' | 'group' | 'individual',
    city: '',
    school: '',
    grade: '',
    parent_full_name: '',
    parent_phone: '',
    parent_phone_2: '',
    parent_telegram: '',
    parent_email: '',
    preferred_messenger: '' as '' | 'max' | 'telegram' | 'sms',
    source: '',
    comment: '',
  });

  const resetCreateForm = () => {
    setNewStudent({ full_name: '', parent_id: '', trainer_id: '', group_id: '', program_id: '', abonement_id: '' });
    setParentCreateMode('new');
    setParentSearchQuery('');
    setParentSearchResults([]);
    setSelectedParentForCreate(null);
    setNewParent({ full_name: '', email: '' });
    setCreateCardToo(false);
    setCardFields(emptyCardFields());
  };

  const handleEdit = async (student: Student) => {
    setEditingStudent(student);
    const studentGroup = getStudentGroup(student);
    setNewStudent({
      full_name: student.full_name,
      parent_id: student.parent_id?.toString() || '',
      trainer_id: '',
      group_id: studentGroup?.id?.toString() || '',
      program_id: '',
      abonement_id: student.abonement_id?.toString() || '',
    });
    setParentCreateMode(student.parent_id ? 'existing' : 'none');
    setParentSearchQuery('');
    setParentSearchResults([]);
    setSelectedParentForCreate(student.parent_id ? (parents.find((p) => p.id === student.parent_id) ?? null) : null);
    const card = studentCards.find((c) => c.student_id === student.id);
    if (card) {
      setEditingCardId(card.id);
      setCardFields({
        student_full_name: card.student_full_name || '',
        student_email: card.student_email || '',
        birth_date: card.birth_date || '',
        student_phone: phoneFromApi(card.student_phone),
        telegram: card.telegram || '',
        gender: (card.gender === 'm' || card.gender === 'f' ? card.gender : '') as '' | 'm' | 'f',
        on_grant: card.on_grant ?? false,
        format_type: (card.format_type === 'group' || card.format_type === 'individual' ? card.format_type : '') as '' | 'group' | 'individual',
        city: card.city || '',
        school: card.school || '',
        grade: card.grade || '',
        parent_full_name: card.parent_full_name || '',
        parent_phone: phoneFromApi(card.parent_phone),
        parent_phone_2: phoneFromApi(card.parent_phone_2),
        parent_telegram: card.parent_telegram || '',
        parent_email: card.parent_email || '',
        preferred_messenger: (card.preferred_messenger === 'max' || card.preferred_messenger === 'telegram' || card.preferred_messenger === 'sms' ? card.preferred_messenger : '') as '' | 'max' | 'telegram' | 'sms',
        source: card.source || '',
        comment: card.comment || '',
      });
    } else {
      setEditingCardId(null);
      setCardFields(emptyCardFields());
    }
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingStudent || !newStudent.full_name) {
      setError('Заполните ФИО ученика');
      return;
    }

    try {
      const updateData: any = {
        full_name: newStudent.full_name,
      };

      if (newStudent.parent_id) {
        updateData.parent_id = parseInt(newStudent.parent_id);
      } else {
        updateData.parent_id = null;
      }

      if (canAssignAbonement) {
        if (newStudent.abonement_id) {
          updateData.abonement_id = parseInt(newStudent.abonement_id);
        } else {
          updateData.abonement_id = null;
        }
      }

      await studentsApi.update(editingStudent.id, updateData);

      // Обновление группы
      // Сначала удаляем из всех групп
      const studentGroups = groups.filter(g => 
        g.students?.some(s => s.id === editingStudent.id)
      );
      for (const group of studentGroups) {
        try {
          await groupsApi.removeStudent(group.id, editingStudent.id);
        } catch (err) {
          // Игнорируем ошибки, если ученик не в группе
        }
      }
      
      // Добавляем в новую группу, если выбрана
      if (newStudent.group_id) {
        try {
          await groupsApi.addStudent(parseInt(newStudent.group_id), editingStudent.id);
        } catch (err) {
          console.error('Ошибка добавления в группу', err);
        }
      }
      
      loadGroups();

      if (canCreateCard && editingStudent) {
        const parentInfo = newStudent.parent_id ? parents.find((p) => p.id.toString() === newStudent.parent_id) : null;
        const cardPayload = {
          student_id: editingStudent.id,
          student_full_name: (cardFields.student_full_name || newStudent.full_name).trim(),
          student_email: cardFields.student_email.trim() || undefined,
          birth_date: cardFields.birth_date.trim() || undefined,
          student_phone: cardFields.student_phone.trim() ? phoneToApiValue(cardFields.student_phone) || undefined : undefined,
          telegram: cardFields.telegram.trim() || undefined,
          gender: cardFields.gender || undefined,
          on_grant: cardFields.on_grant,
          format_type: cardFields.format_type || undefined,
          city: cardFields.city.trim() || undefined,
          school: cardFields.school.trim() || undefined,
          grade: cardFields.grade.trim() || undefined,
          parent_full_name: (cardFields.parent_full_name ?? '').trim() || (parentInfo?.full_name ?? '').trim() || null,
          parent_phone: cardFields.parent_phone.trim() ? phoneToApiValue(cardFields.parent_phone) || undefined : undefined,
          parent_phone_2: cardFields.parent_phone_2.trim() ? phoneToApiValue(cardFields.parent_phone_2) || undefined : undefined,
          parent_telegram: cardFields.parent_telegram.trim() || undefined,
          parent_email: (cardFields.parent_email || parentInfo?.email || '').trim() || undefined,
          preferred_messenger: cardFields.preferred_messenger || undefined,
          source: cardFields.source.trim() || undefined,
          comment: cardFields.comment.trim() || undefined,
        };
        try {
          if (editingCardId) {
            await studentCardsApi.update(editingCardId, cardPayload);
          } else {
            await studentCardsApi.create({ ...cardPayload, discount_type: 'none', discount_value: 0 });
          }
          const updatedCards = await studentCardsApi.list({});
          setStudentCards(updatedCards);
        } catch (cardErr: any) {
          setError(cardErr.response?.data?.detail || 'Ученик сохранён, но не удалось сохранить карточку');
          return;
        }
      }

      setEditOpen(false);
      setEditingStudent(null);
      setEditingCardId(null);
      setEditParentCabinetLink(null);
      setEditParentCabinetMessage(null);
      setNewStudent({ full_name: '', parent_id: '', trainer_id: '', group_id: '', program_id: '', abonement_id: '' });
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления');
    }
  };

  const getStudentGroup = (student: Student): Group | undefined => {
    if (!student || !groups.length) return undefined;
    return groups.find(g => g.students?.some(s => s.id === student.id));
  };

  const getStudentProgramLabel = (student: Student): string => {
    const direct = (student.programs || []).filter((p) => p.status === 'active');
    if (direct.length) {
      return direct.map((p) => `${p.name} (v${p.version})`).join(', ');
    }
    const g = getStudentGroup(student);
    const gp = (g?.programs || []).filter((p) => p.status === 'active');
    if (gp.length) {
      return gp.map((p) => `${p.name} (v${p.version})`).join(', ') + ' (из группы)';
    }
    return '—';
  };

  const handleAddProgramToStudent = async (studentId: number, programId: number) => {
    try {
      await programsApi.assignToStudent(programId, studentId);
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка назначения программы');
    }
  };

  const handleRemoveProgramFromStudent = async (studentId: number, programId: number) => {
    try {
      await studentsApi.removeProgram(studentId, programId);
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка снятия программы');
    }
  };

  const getAbonementForStudent = (student: Student): Abonement | undefined =>
    student.abonement || (student.abonement_id ? abonements.find((a) => a.id === student.abonement_id) : undefined);

  const grantStudentIds = useMemo(
    () => new Set(studentCards.filter((c) => c.student_id != null && c.on_grant).map((c) => c.student_id!)),
    [studentCards]
  );

  const individualFormatStudentIds = useMemo(
    () => new Set(studentCards.filter((c) => c.student_id != null && c.format_type === 'individual').map((c) => c.student_id!)),
    [studentCards]
  );

  const isInIndividualGroup = (student: Student): boolean => {
    const g = groups.find((gr) => gr.students?.some((st) => st.id === student.id));
    return (g?.name?.toLowerCase().includes('индивидуально') ?? false);
  };

  const isIndividualStudent = (student: Student): boolean =>
    isInIndividualGroup(student) || individualFormatStudentIds.has(student.id);

  const filteredStudents = useMemo(() => {
    let list = students;
    if (typeFilter === 'grant') list = list.filter((s) => grantStudentIds.has(s.id));
    else if (typeFilter === 'individual') list = list.filter((s) => isIndividualStudent(s));
    else if (typeFilter === 'paid') list = list.filter((s) => !grantStudentIds.has(s.id) && !isIndividualStudent(s));
    return list;
  }, [students, typeFilter, grantStudentIds, individualFormatStudentIds, groups]);

  const filteredParents = useMemo(() => parents.filter((p) => p.is_active !== false), [parents]);
  const filteredTrainers = useMemo(() => trainers.filter((t) => t.is_active !== false), [trainers]);

  const getDiscountLabel = (ab: Abonement): string => {
    if (ab.discount_type === 'none') return '—';
    if (ab.discount_type === 'percent') return `${ab.discount_value}%`;
    return `${ab.discount_value} ₽`;
  };

  const getPriceWithDiscount = (ab: Abonement): number => {
    if (ab.discount_type === 'none') return ab.price;
    if (ab.discount_type === 'percent') return Math.round(ab.price * (1 - ab.discount_value / 100) * 100) / 100;
    return Math.max(0, ab.price - ab.discount_value);
  };

  const handleAbonementAssign = async (studentId: number, abonementId: string) => {
    try {
      await studentsApi.update(studentId, {
        abonement_id: abonementId ? parseInt(abonementId) : null,
      });
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка назначения абонемента');
    }
  };

  if (!hasFullStudentsView) {
    return (
      <Layout>
        <Typography variant="h4" gutterBottom>
          Ученики
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ФИО</TableCell>
                <TableCell>Программа</TableCell>
                <TableCell>Статус</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>{student.full_name}</TableCell>
                  <TableCell>{getStudentProgramLabel(student)}</TableCell>
                  <TableCell>{student.status === 'active' ? 'Активен' : 'Архивирован'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={studentsTab} onChange={(_, v) => setStudentsTab(v)}>
          <Tab label="Ученики" value="students" />
          {canSeeAnkety && <Tab label="Анкеты" value="ankety" />}
        </Tabs>
      </Box>

      {studentsTab === 'students' && (
        <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Ученики</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Статус учеников</InputLabel>
            <Select
              value={statusFilter}
              label="Статус учеников"
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="active">Активные</MenuItem>
              <MenuItem value="archived">Архивированные</MenuItem>
            </Select>
          </FormControl>
          {hasFullStudentsView && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>По типу</InputLabel>
              <Select
                value={typeFilter}
                label="По типу"
                onChange={(e) => setTypeFilter(e.target.value as '' | 'grant' | 'individual' | 'paid')}
              >
                <MenuItem value="">Все</MenuItem>
                <MenuItem value="grant">По гранту</MenuItem>
                <MenuItem value="individual">Индивидуальные</MenuItem>
                <MenuItem value="paid">По оплате</MenuItem>
              </Select>
            </FormControl>
          )}
          {(!isOwner || user?.role === 'sales') && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setTrainerOpen(true);
                setNewTrainer({ full_name: '', email: '', password: '' });
              }}
            >
              Создать тренера
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setAnketaFormMode('addStudent');
              setAnketaFormCardId(null);
              setAnketaFormOpen(true);
            }}
          >
            Добавить ученика
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Typography variant="h5" sx={{ mt: 3, mb: 2 }}>
        Ученики
      </Typography>
      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Поиск по ФИО или имени..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ minWidth: 280 }}
          inputProps={{ 'aria-label': 'Поиск ученика по ФИО' }}
        />
      </Box>
      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>№</TableCell>
              <TableCell>ФИО</TableCell>
              <TableCell>Родитель</TableCell>
              <TableCell>Группа</TableCell>
              <TableCell>Программа</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredStudents.map((student, index) => {
              const studentGroup = getStudentGroup(student);
              return (
                <TableRow key={student.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{student.full_name}</TableCell>
                  <TableCell>{student.parent?.full_name || '-'}</TableCell>
                  <TableCell>{studentGroup?.name || '-'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      {(student.programs || []).filter((p) => p.status === 'active').map((p) => (
                        <Chip
                          key={p.id}
                          size="small"
                          label={`${p.name} (v${p.version})`}
                          onDelete={() => handleRemoveProgramFromStudent(student.id, p.id)}
                        />
                      ))}
                      {(student.programs || []).filter((p) => p.status === 'active').length === 0 && (() => {
                        const g = getStudentGroup(student);
                        const gp = (g?.programs || []).filter((p) => p.status === 'active');
                        if (gp.length) {
                          return (
                            <Typography variant="body2" color="text.secondary">
                              {gp.map((p) => `${p.name} (v${p.version})`).join(', ')} (из группы)
                            </Typography>
                          );
                        }
                        return <Typography variant="body2" color="text.secondary">—</Typography>;
                      })()}
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <Select
                          displayEmpty
                          value=""
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v !== '') {
                              handleAddProgramToStudent(student.id, parseInt(v as string));
                            }
                          }}
                          renderValue={() => 'Добавить программу'}
                        >
                          <MenuItem value="">
                            <em>Добавить программу</em>
                          </MenuItem>
                          {programs
                            .filter((p) => p.status === 'active' && !(student.programs || []).some((sp) => sp.id === p.id))
                            .map((p) => (
                              <MenuItem key={p.id} value={p.id.toString()}>
                                {p.name} (версия {p.version})
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                    </Stack>
                  </TableCell>
                  <TableCell>{student.status === 'active' ? 'Активен' : 'Архивирован'}</TableCell>
                  <TableCell>
                    {canManageAccounts && (
                      <Button
                        size="small"
                        startIcon={<AccountBalanceIcon />}
                        onClick={() => openAccountsDialog(student)}
                        sx={{ mr: 1 }}
                      >
                        Счета
                      </Button>
                    )}
                    <Button
                      size="small"
                      startIcon={<PersonIcon />}
                      onClick={() => setStudentDetailId(student.id)}
                      sx={{ mr: 1 }}
                    >
                      Карточка
                    </Button>
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => handleEdit(student)}
                      sx={{ mr: 1 }}
                    >
                      Редактировать
                    </Button>
                    {student.status === 'active' ? (
                      <Button
                        size="small"
                        color="warning"
                        onClick={async () => {
                          await studentsApi.archive(student.id);
                          loadStudents();
                        }}
                      >
                        Архивировать
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        color="success"
                        onClick={async () => {
                          await studentsApi.update(student.id, { status: 'active' });
                          loadStudents();
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
      </TableContainer>

      <Typography variant="h5" sx={{ mt: 3, mb: 2 }}>
        Родители
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ФИО</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Количество учеников</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredParents.map((parent) => {
              const studentsCount = students.filter(s => s.parent_id === parent.id).length;
              return (
                <TableRow key={parent.id}>
                  <TableCell>{parent.full_name}</TableCell>
                  <TableCell>{parent.email}</TableCell>
                  <TableCell>{parent.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                  <TableCell>{studentsCount}</TableCell>
                  <TableCell>
                    {parent.is_active ? (
                      <Button
                        size="small"
                        color="warning"
                        onClick={async () => {
                          try {
                            await usersApi.update(parent.id, { is_active: false });
                            loadParents();
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Ошибка изменения статуса родителя');
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
                            await usersApi.update(parent.id, { is_active: true });
                            loadParents();
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Ошибка изменения статуса родителя');
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
      </TableContainer>

      {(!isOwner || user?.role === 'sales') && (
        <>
          <Typography variant="h5" sx={{ mt: 3, mb: 2 }}>
            Тренеры
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ФИО</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Количество групп</TableCell>
                  <TableCell>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTrainers.map((trainer) => {
                  const groupsCount = groups.filter(g => g.trainer_id === trainer.id).length;
                  return (
                    <TableRow key={trainer.id}>
                      <TableCell>{trainer.full_name}</TableCell>
                      <TableCell>{trainer.email}</TableCell>
                      <TableCell>{trainer.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                      <TableCell>{groupsCount}</TableCell>
                      <TableCell>
                        {trainer.is_active ? (
                          <Button
                            size="small"
                            color="warning"
                            onClick={async () => {
                              try {
                                await usersApi.update(trainer.id, { is_active: false });
                                loadTrainers();
                              } catch (err: any) {
                                setError(err.response?.data?.detail || 'Ошибка изменения статуса тренера');
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
                                setError(err.response?.data?.detail || 'Ошибка изменения статуса тренера');
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
          </TableContainer>
        </>
      )}

        </>
      )}

      {studentsTab === 'ankety' && canSeeAnkety && (
        <>
          {anketyError && (
            <Alert severity="error" onClose={() => setAnketyError(null)} sx={{ mb: 2 }}>
              {anketyError}
            </Alert>
          )}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
            <Tabs value={anketyStatusTab} onChange={(_, v) => setAnketyStatusTab(v)}>
              <Tab label="Все" value="all" />
              <Tab label="Новая / В работе" value="draft" />
              <Tab label="Заполнена" value="filled" />
              <Tab label="Конвертирована" value="converted" />
              <Tab label="Отменена" value="cancelled" />
            </Tabs>
            <Button variant="contained" onClick={() => { setAnketaFormMode('create'); setAnketaFormCardId(null); setAnketaFormOpen(true); }}>
              Новая анкета
            </Button>
          </Stack>
          {anketyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : anketyItems.length === 0 ? (
            <Typography color="textSecondary">Нет анкет по выбранному фильтру.</Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ФИО ребёнка</TableCell>
                    <TableCell>Родитель</TableCell>
                    <TableCell>Контакты</TableCell>
                    <TableCell>Город</TableCell>
                    <TableCell>Класс</TableCell>
                    <TableCell>Формат</TableCell>
                    <TableCell>Источник</TableCell>
                    <TableCell>Статус анкеты</TableCell>
                    <TableCell>Привязан ученик</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {anketyItems.map((card) => (
                    <TableRow key={card.id}>
                      <TableCell>{card.student_full_name}</TableCell>
                      <TableCell>{card.parent_full_name || '—'}</TableCell>
                      <TableCell>{card.parent_phone || card.parent_email || '—'}</TableCell>
                      <TableCell>{card.city || '—'}</TableCell>
                      <TableCell>{card.grade || '—'}</TableCell>
                      <TableCell>{card.format_type === 'group' ? 'Группа' : card.format_type === 'individual' ? 'Индивидуальное' : '—'}</TableCell>
                      <TableCell>{card.source || '—'}</TableCell>
                      <TableCell>{ANKETA_STATUS_LABELS[card.anketa_status || ''] || card.anketa_status || '—'}</TableCell>
                      <TableCell>{card.student_id ? 'Да' : 'Нет'}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => { setAnketaFormMode('edit'); setAnketaFormCardId(card.id); setAnketaFormOpen(true); }}>
                          Открыть анкету
                        </Button>
                        {(card.anketa_status === 'draft' || card.anketa_status === 'filled') && !card.student_id && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            disabled={convertLoading !== null}
                            onClick={() => handleConvert(card)}
                          >
                            {convertLoading === card.id ? '...' : 'Создать ученика'}
                          </Button>
                        )}
                        {card.anketa_status === 'converted' && card.student_id && (
                          <Button size="small" variant="outlined" onClick={() => setStudentDetailId(card.student_id!)}>
                            Открыть ученика
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

        </>
      )}

      <Dialog open={!!convertConflict} onClose={() => { setConvertConflict(null); setConvertCardId(null); setConflictChoice(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Есть совпадение</DialogTitle>
        <DialogContent>
          {convertConflict && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography>{convertConflict.message}</Typography>
              {convertConflict.code === 'existing_parent' && (
                <Button variant={conflictChoice === 'existing_parent' ? 'contained' : 'outlined'} size="small" onClick={() => setConflictChoice('existing_parent')}>
                  Привязать к существующему родителю
                </Button>
              )}
              {convertConflict.code === 'existing_student' && (
                <Stack spacing={1}>
                  <Button variant={conflictChoice === 'existing_student' ? 'contained' : 'outlined'} size="small" onClick={() => setConflictChoice('existing_student')}>
                    Привязать к существующему ученику
                  </Button>
                  {convertConflict.existing_students && convertConflict.existing_students.length > 1 && (
                    <FormControl fullWidth size="small">
                      <InputLabel>Ученик</InputLabel>
                      <Select value={selectedExistingStudentId} label="Ученик" onChange={(e) => setSelectedExistingStudentId(e.target.value === '' ? '' : Number(e.target.value))}>
                        {convertConflict.existing_students.map((s) => (
                          <MenuItem key={s.id} value={s.id}>{s.full_name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <Button variant={conflictChoice === 'new_student' ? 'contained' : 'outlined'} size="small" onClick={() => setConflictChoice('new_student')}>
                    Создать нового ученика
                  </Button>
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConvertConflict(null); setConvertCardId(null); setConflictChoice(null); }}>Отмена</Button>
          <Button variant="contained" onClick={handleConflictResolve}>Применить</Button>
        </DialogActions>
      </Dialog>

      <AnketaFormDrawer
        open={anketaFormOpen}
        onClose={() => { setAnketaFormOpen(false); setAnketaFormCardId(null); }}
        mode={anketaFormMode}
        cardId={anketaFormCardId}
        isOwner={!!isOwner}
        abonements={abonements}
        onSuccess={(studentId) => {
          if (studentId != null) setStudentDetailId(studentId);
          if (studentsTab === 'ankety') loadAnkety();
        }}
        onConvertConflict={(cardId, conflict) => {
          setConvertCardId(cardId);
          setConvertConflict(conflict);
        }}
        onError={(msg) => {
          setAnketyError(msg);
          setError(msg);
        }}
      />

      {/* Диалог добавления */}
      <Dialog open={open} onClose={() => { setOpen(false); setError(''); }} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить ученика</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="ФИО ученика *"
            value={newStudent.full_name}
            onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Родитель</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button size="small" variant={parentCreateMode === 'none' ? 'contained' : 'outlined'} onClick={() => { setParentCreateMode('none'); setSelectedParentForCreate(null); setParentSearchQuery(''); }}>
              Без родителя
            </Button>
            <Button size="small" variant={parentCreateMode === 'existing' ? 'contained' : 'outlined'} onClick={() => { setParentCreateMode('existing'); setSelectedParentForCreate(null); setParentSearchQuery(''); }}>
              Выбрать существующего
            </Button>
            <Button size="small" variant={parentCreateMode === 'new' ? 'contained' : 'outlined'} onClick={() => { setParentCreateMode('new'); setSelectedParentForCreate(null); }}>
              Создать нового
            </Button>
          </Stack>
          {parentCreateMode === 'existing' && (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                size="small"
                label="Поиск по email или ФИО"
                value={parentSearchQuery}
                onChange={(e) => setParentSearchQuery(e.target.value)}
                placeholder="Введите для поиска..."
              />
              {parentSearching && <Typography variant="caption" color="text.secondary">Поиск...</Typography>}
              {selectedParentForCreate && (
                <Chip
                  label={`${selectedParentForCreate.full_name} (${selectedParentForCreate.email})`}
                  onDelete={() => setSelectedParentForCreate(null)}
                  size="small"
                />
              )}
              {!selectedParentForCreate && parentSearchResults.length > 0 && (
                <Stack direction="column" spacing={0.5}>
                  {parentSearchResults.map((p) => (
                    <Button
                      key={p.id}
                      size="small"
                      fullWidth
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => setSelectedParentForCreate(p)}
                    >
                      {p.full_name} — {p.email}
                    </Button>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
          {parentCreateMode === 'new' && (
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                size="small"
                label="ФИО родителя *"
                value={newParent.full_name}
                onChange={(e) => setNewParent({ ...newParent, full_name: e.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="Email родителя *"
                type="email"
                value={newParent.email}
                onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                error={!!newParent.email.trim() && !isValidEmail(newParent.email)}
                helperText={newParent.email.trim() && !isValidEmail(newParent.email) ? 'Введите корректный email' : ''}
              />
            </Stack>
          )}

          {canCreateCard && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createCardToo}
                    onChange={(e) => setCreateCardToo(e.target.checked)}
                  />
                }
                label="Также создать личную карточку (продажи)"
                sx={{ mt: 2 }}
              />
              {createCardToo && (
                <Stack spacing={1.5} sx={{ mt: 1, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
                  <Typography variant="subtitle2" color="primary">Личная карточка</Typography>
                  <TextField size="small" fullWidth label="ФИО ученика" value={cardFields.student_full_name || newStudent.full_name} onChange={(e) => setCardFields((f) => ({ ...f, student_full_name: e.target.value }))} />
                  <TextField size="small" fullWidth label="Email ученика" type="email" value={cardFields.student_email} onChange={(e) => setCardFields((f) => ({ ...f, student_email: e.target.value }))} error={!!cardFields.student_email.trim() && !isValidEmail(cardFields.student_email)} helperText={cardFields.student_email.trim() && !isValidEmail(cardFields.student_email) ? 'Введите корректный email' : ''} />
                  <TextField size="small" fullWidth label="Дата рождения ученика" type="date" value={cardFields.birth_date} onChange={(e) => setCardFields((f) => ({ ...f, birth_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" fullWidth label="Мобильный телефон ученика" value={cardFields.student_phone} onChange={(e) => setCardFields((f) => ({ ...f, student_phone: applyPhoneMask(e.target.value) }))} placeholder="+7(999) 123-45-67" error={!!cardFields.student_phone.trim() && !isValidPhone(cardFields.student_phone)} helperText={cardFields.student_phone.trim() && !isValidPhone(cardFields.student_phone) ? '10 цифр номера' : ''} />
                  <TextField size="small" fullWidth label="Телеграмм ученика" value={cardFields.telegram} onChange={(e) => setCardFields((f) => ({ ...f, telegram: e.target.value }))} />
                  <FormControl size="small" fullWidth>
                    <InputLabel>Пол</InputLabel>
                    <Select value={cardFields.gender} label="Пол" onChange={(e) => setCardFields((f) => ({ ...f, gender: e.target.value as '' | 'm' | 'f' }))}>
                      <MenuItem value="">—</MenuItem>
                      <MenuItem value="m">М</MenuItem>
                      <MenuItem value="f">Ж</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControlLabel control={<Switch checked={cardFields.on_grant} onChange={(e) => setCardFields((f) => ({ ...f, on_grant: e.target.checked }))} />} label="На гранте" />
                  <FormControl size="small" fullWidth>
                    <InputLabel>Формат</InputLabel>
                    <Select value={cardFields.format_type} label="Формат" onChange={(e) => setCardFields((f) => ({ ...f, format_type: e.target.value as '' | 'group' | 'individual' }))}>
                      <MenuItem value="">—</MenuItem>
                      <MenuItem value="group">Группа</MenuItem>
                      <MenuItem value="individual">Индивидуальное</MenuItem>
                    </Select>
                  </FormControl>
                  <Autocomplete
                    size="small"
                    freeSolo
                    options={citiesList}
                    value={cardFields.city}
                    onInputChange={(_, v) => setCardFields((f) => ({ ...f, city: v ?? '' }))}
                    onChange={(_, v) => setCardFields((f) => ({ ...f, city: (typeof v === 'string' ? v : v ?? '').trim() }))}
                    renderInput={(params) => <TextField {...params} label="Город" placeholder="Выберите или введите город" />}
                  />
                  <TextField size="small" fullWidth label="Образовательное учреждение" value={cardFields.school} onChange={(e) => setCardFields((f) => ({ ...f, school: e.target.value }))} />
                  <TextField size="small" fullWidth label="Класс" value={cardFields.grade} onChange={(e) => setCardFields((f) => ({ ...f, grade: e.target.value }))} />
                  <TextField size="small" fullWidth label="ФИО родителя" value={cardFields.parent_full_name || (parentCreateMode === 'new' ? newParent.full_name : selectedParentForCreate?.full_name || '')} onChange={(e) => setCardFields((f) => ({ ...f, parent_full_name: e.target.value }))} />
                  <TextField size="small" fullWidth label="Мобильный телефон родителя" value={cardFields.parent_phone} onChange={(e) => setCardFields((f) => ({ ...f, parent_phone: applyPhoneMask(e.target.value) }))} placeholder="+7(999) 123-45-67" error={!!cardFields.parent_phone.trim() && !isValidPhone(cardFields.parent_phone)} helperText={cardFields.parent_phone.trim() && !isValidPhone(cardFields.parent_phone) ? '10 цифр номера' : ''} />
                  <TextField size="small" fullWidth label="Второй мобильный телефон родителя" value={cardFields.parent_phone_2} onChange={(e) => setCardFields((f) => ({ ...f, parent_phone_2: applyPhoneMask(e.target.value) }))} placeholder="+7(999) 123-45-67" error={!!cardFields.parent_phone_2.trim() && !isValidPhone(cardFields.parent_phone_2)} helperText={cardFields.parent_phone_2.trim() && !isValidPhone(cardFields.parent_phone_2) ? '10 цифр номера' : ''} />
                  <TextField size="small" fullWidth label="Телеграм родителя" value={cardFields.parent_telegram} onChange={(e) => setCardFields((f) => ({ ...f, parent_telegram: e.target.value }))} />
                  <TextField size="small" fullWidth label="Email родителя" type="email" value={cardFields.parent_email || (parentCreateMode === 'new' ? newParent.email : selectedParentForCreate?.email || '')} onChange={(e) => setCardFields((f) => ({ ...f, parent_email: e.target.value }))} error={!!(cardFields.parent_email || (parentCreateMode === 'new' ? newParent.email : selectedParentForCreate?.email || '')).trim() && !isValidEmail(cardFields.parent_email || (parentCreateMode === 'new' ? newParent.email : selectedParentForCreate?.email || ''))} helperText={((cardFields.parent_email || (parentCreateMode === 'new' ? newParent.email : selectedParentForCreate?.email || '')).trim() && !isValidEmail(cardFields.parent_email || (parentCreateMode === 'new' ? newParent.email : selectedParentForCreate?.email || ''))) ? 'Введите корректный email' : ''} />
                  <FormControl size="small" fullWidth>
                    <InputLabel>Удобный мессенджер для общения с родителем</InputLabel>
                    <Select value={cardFields.preferred_messenger} label="Удобный мессенджер для общения с родителем" onChange={(e) => setCardFields((f) => ({ ...f, preferred_messenger: e.target.value as '' | 'max' | 'telegram' | 'sms' }))}>
                      <MenuItem value="">—</MenuItem>
                      <MenuItem value="max">MAX</MenuItem>
                      <MenuItem value="telegram">Telegram</MenuItem>
                      <MenuItem value="sms">SMS</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField size="small" fullWidth label="Откуда пришел" value={cardFields.source} onChange={(e) => setCardFields((f) => ({ ...f, source: e.target.value }))} placeholder="например: рекомендация, сайт, соцсети" />
                  <TextField size="small" fullWidth label="Комментарий" value={cardFields.comment} onChange={(e) => setCardFields((f) => ({ ...f, comment: e.target.value }))} multiline minRows={2} />
                </Stack>
              )}
            </>
          )}

          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Группа</InputLabel>
            <Select
              value={newStudent.group_id}
              label="Группа"
              onChange={(e) => setNewStudent({ ...newStudent, group_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбрана</em>
              </MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id.toString()}>
                  {group.name} (Тренер: {group.trainer?.full_name || '-'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Программа</InputLabel>
            <Select
              value={newStudent.program_id}
              label="Программа"
              onChange={(e) => setNewStudent({ ...newStudent, program_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбрана</em>
              </MenuItem>
              {programs.map((program) => (
                <MenuItem key={program.id} value={program.id.toString()}>
                  {program.name} (версия {program.version})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {canAssignAbonement && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Абонемент</InputLabel>
              <Select
                value={newStudent.abonement_id}
                label="Абонемент"
                onChange={(e) => setNewStudent({ ...newStudent, abonement_id: e.target.value })}
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {abonements
                  .filter((a) => a.status === 'active')
                  .map((a) => (
                    <MenuItem key={a.id} value={a.id.toString()}>
                      {a.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained">
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог редактирования */}
      <Dialog open={editOpen} onClose={() => { setEditOpen(false); setEditingCardId(null); setEditParentCabinetLink(null); setEditParentCabinetMessage(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать ученика</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="ФИО ученика *"
            value={newStudent.full_name}
            onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Родитель</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button size="small" variant={parentCreateMode === 'none' ? 'contained' : 'outlined'} onClick={() => { setParentCreateMode('none'); setSelectedParentForCreate(null); setNewStudent((prev) => ({ ...prev, parent_id: '' })); }}>
              Без родителя
            </Button>
            <Button size="small" variant={parentCreateMode === 'existing' ? 'contained' : 'outlined'} onClick={() => { setParentCreateMode('existing'); setSelectedParentForCreate(null); setParentSearchQuery(''); }}>
              Выбрать существующего
            </Button>
          </Stack>
          {parentCreateMode === 'existing' && (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                size="small"
                label="Поиск по email или ФИО"
                value={parentSearchQuery}
                onChange={(e) => setParentSearchQuery(e.target.value)}
                placeholder="Введите для поиска..."
              />
              {parentSearching && <Typography variant="caption" color="text.secondary">Поиск...</Typography>}
              {selectedParentForCreate && (
                <Chip
                  label={`${selectedParentForCreate.full_name} (${selectedParentForCreate.email})`}
                  onDelete={() => { setSelectedParentForCreate(null); setNewStudent((prev) => ({ ...prev, parent_id: '' })); }}
                  size="small"
                />
              )}
              {!selectedParentForCreate && parentSearchResults.length > 0 && (
                <Stack direction="column" spacing={0.5}>
                  {parentSearchResults.map((p) => (
                    <Button
                      key={p.id}
                      size="small"
                      fullWidth
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => { setSelectedParentForCreate(p); setNewStudent((prev) => ({ ...prev, parent_id: p.id.toString() })); }}
                    >
                      {p.full_name} — {p.email}
                    </Button>
                  ))}
                </Stack>
              )}
            </Stack>
          )}

          {canCreateCard && (
            <Stack spacing={1.5} sx={{ mt: 2, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
              <Typography variant="subtitle2" color="primary">Личная карточка (продажи)</Typography>
              <TextField size="small" fullWidth label="ФИО ученика" value={cardFields.student_full_name || newStudent.full_name} onChange={(e) => setCardFields((f) => ({ ...f, student_full_name: e.target.value }))} />
              <TextField size="small" fullWidth label="Email ученика" type="email" value={cardFields.student_email} onChange={(e) => setCardFields((f) => ({ ...f, student_email: e.target.value }))} error={!!cardFields.student_email.trim() && !isValidEmail(cardFields.student_email)} helperText={cardFields.student_email.trim() && !isValidEmail(cardFields.student_email) ? 'Введите корректный email' : ''} />
              <TextField size="small" fullWidth label="Дата рождения ученика" type="date" value={cardFields.birth_date} onChange={(e) => setCardFields((f) => ({ ...f, birth_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
              <TextField size="small" fullWidth label="Мобильный телефон ученика" value={cardFields.student_phone} onChange={(e) => setCardFields((f) => ({ ...f, student_phone: applyPhoneMask(e.target.value) }))} placeholder="+7(999) 123-45-67" error={!!cardFields.student_phone.trim() && !isValidPhone(cardFields.student_phone)} helperText={cardFields.student_phone.trim() && !isValidPhone(cardFields.student_phone) ? '10 цифр номера' : ''} />
              <TextField size="small" fullWidth label="Телеграмм ученика" value={cardFields.telegram} onChange={(e) => setCardFields((f) => ({ ...f, telegram: e.target.value }))} />
              <FormControl size="small" fullWidth>
                <InputLabel>Пол</InputLabel>
                <Select value={cardFields.gender} label="Пол" onChange={(e) => setCardFields((f) => ({ ...f, gender: e.target.value as '' | 'm' | 'f' }))}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="m">М</MenuItem>
                  <MenuItem value="f">Ж</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel control={<Switch checked={cardFields.on_grant} onChange={(e) => setCardFields((f) => ({ ...f, on_grant: e.target.checked }))} />} label="На гранте" />
              <FormControl size="small" fullWidth>
                <InputLabel>Формат</InputLabel>
                <Select value={cardFields.format_type} label="Формат" onChange={(e) => setCardFields((f) => ({ ...f, format_type: e.target.value as '' | 'group' | 'individual' }))}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="group">Группа</MenuItem>
                  <MenuItem value="individual">Индивидуальное</MenuItem>
                </Select>
              </FormControl>
              <Autocomplete
                size="small"
                freeSolo
                options={citiesList}
                value={cardFields.city}
                onInputChange={(_, v) => setCardFields((f) => ({ ...f, city: v ?? '' }))}
                onChange={(_, v) => setCardFields((f) => ({ ...f, city: (typeof v === 'string' ? v : v ?? '').trim() }))}
                renderInput={(params) => <TextField {...params} label="Город" placeholder="Выберите или введите город" />}
              />
              <TextField size="small" fullWidth label="Образовательное учреждение" value={cardFields.school} onChange={(e) => setCardFields((f) => ({ ...f, school: e.target.value }))} />
              <TextField size="small" fullWidth label="Класс" value={cardFields.grade} onChange={(e) => setCardFields((f) => ({ ...f, grade: e.target.value }))} />
              <TextField size="small" fullWidth label="ФИО родителя" value={cardFields.parent_full_name || (selectedParentForCreate?.full_name || '')} onChange={(e) => setCardFields((f) => ({ ...f, parent_full_name: e.target.value }))} />
              <TextField size="small" fullWidth label="Мобильный телефон родителя" value={cardFields.parent_phone} onChange={(e) => setCardFields((f) => ({ ...f, parent_phone: applyPhoneMask(e.target.value) }))} placeholder="+7(999) 123-45-67" error={!!cardFields.parent_phone.trim() && !isValidPhone(cardFields.parent_phone)} helperText={cardFields.parent_phone.trim() && !isValidPhone(cardFields.parent_phone) ? '10 цифр номера' : ''} />
              <TextField size="small" fullWidth label="Второй мобильный телефон родителя" value={cardFields.parent_phone_2} onChange={(e) => setCardFields((f) => ({ ...f, parent_phone_2: applyPhoneMask(e.target.value) }))} placeholder="+7(999) 123-45-67" error={!!cardFields.parent_phone_2.trim() && !isValidPhone(cardFields.parent_phone_2)} helperText={cardFields.parent_phone_2.trim() && !isValidPhone(cardFields.parent_phone_2) ? '10 цифр номера' : ''} />
              <TextField size="small" fullWidth label="Телеграм родителя" value={cardFields.parent_telegram} onChange={(e) => setCardFields((f) => ({ ...f, parent_telegram: e.target.value }))} />
              <TextField size="small" fullWidth label="Email родителя" type="email" value={cardFields.parent_email || (selectedParentForCreate?.email || '')} onChange={(e) => setCardFields((f) => ({ ...f, parent_email: e.target.value }))} error={!!(cardFields.parent_email || selectedParentForCreate?.email || '').trim() && !isValidEmail(cardFields.parent_email || selectedParentForCreate?.email || '')} helperText={((cardFields.parent_email || selectedParentForCreate?.email || '').trim() && !isValidEmail(cardFields.parent_email || selectedParentForCreate?.email || '')) ? 'Введите корректный email' : ''} />
              <FormControl size="small" fullWidth>
                <InputLabel>Удобный мессенджер для общения с родителем</InputLabel>
                <Select value={cardFields.preferred_messenger} label="Удобный мессенджер для общения с родителем" onChange={(e) => setCardFields((f) => ({ ...f, preferred_messenger: e.target.value as '' | 'max' | 'telegram' | 'sms' }))}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="max">MAX</MenuItem>
                  <MenuItem value="telegram">Telegram</MenuItem>
                  <MenuItem value="sms">SMS</MenuItem>
                </Select>
              </FormControl>
              <TextField size="small" fullWidth label="Откуда пришел" value={cardFields.source} onChange={(e) => setCardFields((f) => ({ ...f, source: e.target.value }))} placeholder="например: рекомендация, сайт, соцсети" />
              <TextField size="small" fullWidth label="Комментарий" value={cardFields.comment} onChange={(e) => setCardFields((f) => ({ ...f, comment: e.target.value }))} multiline minRows={2} />
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>Кабинет родителя</Typography>
              {editingCardId && (cardFields.parent_email?.trim() || studentCards.find((c) => c.id === editingCardId)?.parent_email) ? (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">Сначала нажмите «Сохранить» ниже, затем откройте кабинет (или откройте раздел «Карточки учеников» в меню).</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={editParentCabinetLoading}
                    onClick={async () => {
                      if (!editingCardId) return;
                      setEditParentCabinetLoading(true);
                      setError('');
                      setEditParentCabinetLink(null);
                      setEditParentCabinetMessage(null);
                      try {
                        const res = await studentCardsApi.openParentCabinet(editingCardId);
                        if (res.invite_link) setEditParentCabinetLink(res.invite_link);
                        else setEditParentCabinetMessage('Кабинет родителя уже привязан к этому ученику.');
                      } catch (err: any) {
                        setError(err.response?.data?.detail || 'Не удалось открыть кабинет родителя');
                      } finally {
                        setEditParentCabinetLoading(false);
                      }
                    }}
                  >
                    {editParentCabinetLoading ? 'Открываю…' : 'Открыть кабинет родителя'}
                  </Button>
                  {editParentCabinetLink && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField size="small" fullWidth value={editParentCabinetLink} InputProps={{ readOnly: true }} sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                      <Button size="small" onClick={() => { navigator.clipboard.writeText(editParentCabinetLink); }}>Копировать</Button>
                    </Stack>
                  )}
                  {editParentCabinetMessage && !editParentCabinetLink && (
                    <Alert severity="info" sx={{ py: 0 }}>{editParentCabinetMessage}</Alert>
                  )}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">Укажите email родителя выше и нажмите «Сохранить». Затем здесь появится кнопка «Открыть кабинет родителя». Также можно открыть раздел «Карточки учеников» в меню слева.</Typography>
              )}
            </Stack>
          )}

          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Группа</InputLabel>
            <Select
              value={newStudent.group_id || getStudentGroup(editingStudent!)?.id?.toString() || ''}
              label="Группа"
              onChange={(e) => setNewStudent({ ...newStudent, group_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбрана</em>
              </MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id.toString()}>
                  {group.name} (Тренер: {group.trainer?.full_name || '-'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Программы ученика</Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {((students.find((s) => s.id === editingStudent?.id) || editingStudent)?.programs || [])
              .filter((p) => p.status === 'active')
              .map((p) => (
                <Chip
                  key={p.id}
                  size="small"
                  label={`${p.name} (v${p.version})`}
                  onDelete={() => {
                    if (editingStudent) {
                      handleRemoveProgramFromStudent(editingStudent.id, p.id);
                    }
                  }}
                />
              ))}
          </Stack>
          <FormControl size="small" fullWidth sx={{ mt: 0 }}>
            <InputLabel>Добавить программу</InputLabel>
            <Select
              value=""
              label="Добавить программу"
              onChange={(e) => {
                const v = e.target.value;
                if (v !== '' && editingStudent) {
                  handleAddProgramToStudent(editingStudent.id, parseInt(v as string));
                }
              }}
            >
              <MenuItem value="">
                <em>Выберите программу</em>
              </MenuItem>
              {programs
                .filter(
                  (p) =>
                    p.status === 'active' &&
                    !((students.find((s) => s.id === editingStudent?.id) || editingStudent)?.programs || []).some(
                      (sp) => sp.id === p.id
                    )
                )
                .map((p) => (
                  <MenuItem key={p.id} value={p.id.toString()}>
                    {p.name} (версия {p.version})
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          {canAssignAbonement && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Абонемент</InputLabel>
              <Select
                value={newStudent.abonement_id}
                label="Абонемент"
                onChange={(e) => setNewStudent({ ...newStudent, abonement_id: e.target.value })}
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {abonements
                  .filter((a) => a.status === 'active')
                  .map((a) => (
                    <MenuItem key={a.id} value={a.id.toString()}>
                      {a.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditOpen(false); setEditingCardId(null); }}>Отмена</Button>
          <Button onClick={handleUpdate} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог создания родителя (приглашение — ссылка для установки пароля) */}
      <Dialog open={parentOpen} onClose={() => { setParentOpen(false); setInviteLink(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Пригласить родителя</DialogTitle>
        <DialogContent>
          {!inviteLink ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                Родителю будет создана учётная запись. Отправьте ему ссылку из следующего шага — по ней он задаст пароль и получит доступ в кабинет.
              </Typography>
              <TextField
                fullWidth
                label="ФИО родителя *"
                value={newParent.full_name}
                onChange={(e) => setNewParent({ ...newParent, full_name: e.target.value })}
                sx={{ mt: 2 }}
                required
              />
              <TextField
                fullWidth
                label="Email *"
                type="email"
                value={newParent.email}
                onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                sx={{ mt: 2 }}
                required
              />
            </>
          ) : (
            <>
              <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>Родитель создан. Отправьте ему эту ссылку (действует 7 дней):</Typography>
              <TextField
                fullWidth
                size="small"
                value={inviteLink}
                sx={{ mt: 1, mb: 1 }}
                InputProps={{ readOnly: true }}
              />
              <Button
                size="small"
                onClick={() => { navigator.clipboard.writeText(inviteLink); setError(''); }}
              >
                Копировать ссылку
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setParentOpen(false); setInviteLink(null); }}>{inviteLink ? 'Готово' : 'Отмена'}</Button>
          {!inviteLink && (
            <Button
              onClick={async () => {
                if (!newParent.full_name.trim() || !newParent.email.trim()) {
                  setError('Заполните ФИО и email');
                  return;
                }
                setError('');
                try {
                  const res = await usersApi.inviteParent({
                    full_name: newParent.full_name.trim(),
                    email: newParent.email.trim(),
                  });
                  setInviteLink(res.invite_link);
                  setNewParent({ full_name: '', email: '' });
                  loadParents();
                } catch (err: any) {
                  setError(err.response?.data?.detail || 'Ошибка приглашения');
                }
              }}
              variant="contained"
            >
              Создать и получить ссылку
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {(!isOwner || user?.role === 'sales') && (
        <Dialog open={trainerOpen} onClose={() => setTrainerOpen(false)} maxWidth="sm" fullWidth>
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
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTrainerOpen(false)}>Отмена</Button>
            <Button
              onClick={async () => {
                if (!newTrainer.full_name.trim() || !newTrainer.email.trim() || !newTrainer.password.trim()) {
                  setError('Заполните все поля');
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
                  });
                  setTrainerOpen(false);
                  setNewTrainer({ full_name: '', email: '', password: '' });
                  setError('');
                  loadTrainers(); // Обновляем список тренеров
                  loadGroups(); // Обновляем группы, так как там может быть новый тренер
                } catch (err: any) {
                  setError(err.response?.data?.detail || 'Ошибка создания тренера');
                }
              }}
              variant="contained"
            >
              Создать
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={accountsDialogOpen} onClose={() => { setAccountsDialogOpen(false); setAccountsError(''); }} maxWidth="sm" fullWidth>
        <DialogTitle>Счета: {accountsStudent?.full_name}</DialogTitle>
        <DialogContent>
          {accountsError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setAccountsError('')}>
              {accountsError}
            </Alert>
          )}
          {accountsLoading && accounts.length === 0 && !accountsError ? (
            <Typography color="textSecondary">Загрузка...</Typography>
          ) : (
            <>
              {(isAdminLike || user?.role === 'sales') && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <TextField
                    size="small"
                    label="Название счета"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="Группа / Индивидуально"
                    sx={{ flex: 1 }}
                  />
                  <Button variant="outlined" onClick={handleCreateAccount} disabled={!newAccountName.trim() || accountsLoading}>
                    Создать счет
                  </Button>
                </Stack>
              )}
              {accounts.length === 0 ? (
                <Typography color="textSecondary">Нет счетов. {(isAdminLike || user?.role === 'sales') ? 'Создайте первый счет.' : ''}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Счет</TableCell>
                      <TableCell align="right">Остаток (₽)</TableCell>
                      <TableCell align="right">Действия</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.map((acc) => (
                      <TableRow key={acc.id}>
                        <TableCell>{acc.name}</TableCell>
                        <TableCell align="right">{acc.balance.toFixed(2)}</TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => { setPaymentDialog({ account: acc, type: 'payment' }); setPaymentAmount(''); setPaymentNote(''); }}>Пополнить</Button>
                          {(isAdminLike || user?.role === 'sales') && (
                            <Button size="small" color="secondary" onClick={() => { setPaymentDialog({ account: acc, type: 'deduct' }); setPaymentAmount(''); setPaymentNote(''); }} disabled={acc.balance <= 0}>Списать</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccountsDialogOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!paymentDialog} onClose={() => setPaymentDialog(null)}>
        <DialogTitle>{paymentDialog?.type === 'payment' ? 'Пополнение счета' : 'Списание за занятие'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Сумма (₽)" type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} inputProps={{ min: 0, step: 0.01 }} sx={{ mt: 1 }} />
          <TextField fullWidth label="Комментарий" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(null)}>Отмена</Button>
          <Button variant="contained" onClick={handlePaymentOrDeduct} disabled={!paymentAmount || accountsLoading}>Подтвердить</Button>
        </DialogActions>
      </Dialog>
      <StudentDetailPopup
        open={studentDetailId !== null}
        onClose={() => {
          setStudentDetailId(null);
          searchParams.delete('detail');
          setSearchParams(searchParams, { replace: true });
        }}
        studentId={studentDetailId}
        onOpenAnketa={(cardId) => {
          setAnketaFormMode('edit');
          setAnketaFormCardId(cardId);
          setAnketaFormOpen(true);
        }}
      />
    </Layout>
  );
};

export default StudentsPage;
