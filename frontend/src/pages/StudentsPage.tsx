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
  Menu,
  IconButton,
  Grid,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, AccountBalance as AccountBalanceIcon, Person as PersonIcon, MoreVert as MoreVertIcon } from '@mui/icons-material';
import { studentsApi, usersApi, groupsApi, programsApi, abonementsApi, studentAccountsApi, studentCardsApi, salesApi } from '../services/api';
import { Student, User, Group, Program, Abonement, AccountTemplate, StudentAccount, StudentCard as StudentCardType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import StudentDetailPopup from '../components/StudentDetailPopup';
import { applyPhoneMask, isValidPhone, isValidGeorgianPhone, phoneFromApi, phoneToApiValue } from '../utils/phoneMask';
import { getEffectiveRole, hasPermission } from '../utils/permissions';
import { FilterPanel } from '../components/ui';

const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [typeFilter, setTypeFilter] = useState<'' | 'grant' | 'individual' | 'paid'>('');
  const [groupFilter, setGroupFilter] = useState<number | ''>('');
  const [trainerFilter, setTrainerFilter] = useState<number | ''>('');
  const [programFilter, setProgramFilter] = useState<number | ''>('');
  const [studentCards, setStudentCards] = useState<StudentCardType[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [error, setError] = useState('');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    parent_id: '',
    trainer_id: '',
    group_id: '',
    program_id: '',
    abonement_id: '',
    discount_type: 'none' as 'none' | 'amount' | 'percent',
    discount_value: '',
    training_start_date: '',
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
    payment_link: '',
  });
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editParentCabinetLink, setEditParentCabinetLink] = useState<string | null>(null);
  const [editParentCabinetMessage, setEditParentCabinetMessage] = useState<string | null>(null);
  const [editParentCabinetLoading, setEditParentCabinetLoading] = useState(false);
  const [parents, setParents] = useState<User[]>([]);
  const [trainers, setTrainers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);
  const [accountsStudent, setAccountsStudent] = useState<Student | null>(null);
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountFormat, setNewAccountFormat] = useState<'' | 'individual' | 'package' | 'group'>('');
  const [accountTemplates, setAccountTemplates] = useState<AccountTemplate[]>([]);
  const [selectedAccountTemplateId, setSelectedAccountTemplateId] = useState<number | ''>('');
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<{ account: StudentAccount; type: 'payment' | 'deduct' } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [accountsError, setAccountsError] = useState('');
  const [transactionsDialogAccount, setTransactionsDialogAccount] = useState<StudentAccount | null>(null);
  const [transactions, setTransactions] = useState<
    {
      id: number;
      account_id: number;
      amount: number;
      kind: 'payment' | 'lesson_deduction' | 'extra_lesson_deduction';
      note?: string | null;
      lesson_attendance_id?: number | null;
      created_at: string;
    }[]
  >([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState('');
  const [studentDetailId, setStudentDetailId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  useEffect(() => {
    const detailId = searchParams.get('detail');
    if (detailId && /^\d+$/.test(detailId)) {
      setStudentDetailId(Number(detailId));
    }
  }, [searchParams]);
  const isAdminLike = effectiveRole === 'admin' || effectiveRole === 'owner';
  const isOwner = effectiveRole === 'owner';
  const canManageStudents = hasPermission(user, 'students.manage');
  const hasFullStudentsView = canManageStudents;
  const canAssignAbonement = canManageStudents;
  const canManageAccounts = isAdminLike || effectiveRole === 'parent' || effectiveRole === 'sales';
  const canCreateCard = canManageStudents;
  const [citiesList, setCitiesList] = useState<string[]>([]);
  const [schoolsList, setSchoolsList] = useState<string[]>([]);
  const [classesList, setClassesList] = useState<string[]>([]);
  const [parentsLoaded, setParentsLoaded] = useState(false);
  const [trainersLoaded, setTrainersLoaded] = useState(false);
  const [refDataLoaded, setRefDataLoaded] = useState(false);

  type PageTab = 'students' | 'parents';
  const tabParam = searchParams.get('tab');
  const studentsTab: PageTab =
    tabParam === 'parents' ? tabParam : 'students';
  const setStudentsTab = (tab: PageTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'students') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const [quickFilterNoGroup, setQuickFilterNoGroup] = useState(false);
  const [quickFilterFromLead, setQuickFilterFromLead] = useState(false);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<{ el: HTMLElement; student: Student } | null>(null);
  const [parentSearch, setParentSearch] = useState('');
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState<Student | null>(null);

  const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

  const isValidStudentPhone = (s: string) => {
    const v = (s || '').trim();
    if (!v) return true;
    // Разрешаем либо российский формат, либо грузинский +9955XXXXXXXX
    return isValidPhone(v) || isValidGeorgianPhone(v);
  };

  // Первая загрузка: только данные для вкладки «Ученики» (таблица + фильтры). Тренеры нужны для фильтра по тренеру.
  useEffect(() => {
    if (!hasFullStudentsView) {
      loadStudents();
      return;
    }
    loadGroups();
    loadPrograms();
    studentCardsApi.list({}).then(setStudentCards).catch(() => setStudentCards([]));
    if (!isOwner) {
      loadTrainers().then(() => setTrainersLoaded(true));
    }
  }, [user, hasFullStudentsView, isOwner]);

  // Родители: загружаем при открытии вкладки «Родители» или диалога редактирования
  useEffect(() => {
    if (!hasFullStudentsView || parentsLoaded) return;
    const needParents = studentsTab === 'parents' || editOpen;
    if (needParents) {
      loadParents().then(() => setParentsLoaded(true));
    }
  }, [hasFullStudentsView, studentsTab, editOpen, parentsLoaded]);

  // Справочники для диалогов (города, школы, классы) и абонементы — по требованию при открытии добавления/редактирования
  useEffect(() => {
    if (!hasFullStudentsView || refDataLoaded) return;
    if (!open && !editOpen) return;
    setRefDataLoaded(true);
    salesApi.listSalesCities(true).then((list) => setCitiesList(list.map((c) => c.name).filter(Boolean))).catch(() => {});
    salesApi.listSalesSchools(true).then((list) => setSchoolsList(list.filter((s) => s.is_active).map((s) => s.name))).catch(() => setSchoolsList([]));
    salesApi.listSalesClasses(true).then((list) => setClassesList(list.filter((c) => c.is_active).map((c) => c.name))).catch(() => setClassesList([]));
  }, [hasFullStudentsView, open, editOpen, refDataLoaded]);

  useEffect(() => {
    if (!hasFullStudentsView || !(open || editOpen) || !canAssignAbonement) return;
    loadAbonements();
  }, [hasFullStudentsView, open, editOpen, canAssignAbonement]);

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
    // Не перезаписывать карточку при редактировании — там уже подставлены данные из карточки ученика
    if (editOpen) return;
    setCardFields((prev) => ({
      ...prev,
      student_full_name: newStudent.full_name,
      parent_full_name: parentCreateMode === 'new' ? newParent.full_name : (selectedParentForCreate?.full_name ?? ''),
      parent_email: parentCreateMode === 'new' ? newParent.email : (selectedParentForCreate?.email ?? ''),
    }));
  }, [editOpen, newStudent.full_name, parentCreateMode, newParent.full_name, newParent.email, selectedParentForCreate?.full_name, selectedParentForCreate?.email]);

  const loadStudents = async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.q = searchQuery.trim();
      const data = await studentsApi.getAll(Object.keys(params).length ? params : undefined);
      // Один ученик — одна строка (дедупликация по id на случай дублей из API)
      const byId = new Map<number, Student>();
      (Array.isArray(data) ? data : []).forEach((s: Student) => {
        if (!byId.has(s.id)) byId.set(s.id, s);
      });
      setStudents(Array.from(byId.values()));
    } catch (err) {
      setError('Ошибка загрузки данных');
    }
  };

  const openAccountsDialog = async (student: Student) => {
    setAccountsStudent(student);
    setAccountsDialogOpen(true);
    setNewAccountName('');
    setNewAccountFormat('');
    setSelectedAccountTemplateId('');
    setAccountsError('');
    setAccountsLoading(true);
    try {
      const [list, templates] = await Promise.all([
        studentsApi.getAccounts(student.id),
        salesApi.listAccountTemplates().catch(() => [] as AccountTemplate[]),
      ]);
      setAccounts(list);
      setAccountTemplates(templates);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Не удалось загрузить счета. Убедитесь, что на сервере выполнена миграция: alembic upgrade head';
      setAccountsError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!accountsStudent) return;
    const baseName = newAccountName.trim();
    const formatLabel =
      newAccountFormat === 'individual'
        ? 'Индивидуальный'
        : newAccountFormat === 'package'
        ? 'Пакет'
        : newAccountFormat === 'group'
        ? 'Групповой'
        : '';
    const finalName = baseName || formatLabel;
    if (!finalName) return;
    setAccountsLoading(true);
    setAccountsError('');
    try {
      const created = await studentsApi.createAccount(accountsStudent.id, { name: finalName });
      setAccounts((prev) => [...prev, created]);
      setNewAccountName('');
      setNewAccountFormat('');
    } catch (err: any) {
      setAccountsError(err.response?.data?.detail || 'Ошибка создания счета');
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleCreateAccountFromTemplate = async () => {
    if (!accountsStudent || !selectedAccountTemplateId) return;
    const template = accountTemplates.find((t) => t.id === selectedAccountTemplateId);
    if (!template) return;
    setAccountsLoading(true);
    setAccountsError('');
    try {
      const created = await studentsApi.createAccount(accountsStudent.id, { name: template.name });
      setAccounts((prev) => [...prev, created]);
      setSelectedAccountTemplateId('');
    } catch (err: any) {
      setAccountsError(err.response?.data?.detail || 'Ошибка создания счета');
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleDeleteAccount = async (acc: StudentAccount) => {
    if (!accountsStudent) return;
    if (!window.confirm(`Удалить счёт «${acc.name}»? Счёт с операциями удалить нельзя.`)) return;
    setAccountsLoading(true);
    setAccountsError('');
    try {
      await studentsApi.deleteAccount(accountsStudent.id, acc.id);
      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
    } catch (err: any) {
      setAccountsError(err.response?.data?.detail || 'Не удалось удалить счёт');
    } finally {
      setAccountsLoading(false);
    }
  };

  const openAccountTransactions = async (acc: StudentAccount) => {
    setTransactionsDialogAccount(acc);
    setTransactionsError('');
    setTransactionsLoading(true);
    try {
      const list = await studentAccountsApi.getTransactions(acc.id);
      setTransactions(list);
    } catch (err: any) {
      setTransactions([]);
      setTransactionsError(err.response?.data?.detail || 'Не удалось загрузить операции по счету');
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handleDeleteTransaction = async (tx: { id: number }) => {
    if (!transactionsDialogAccount) return;
    if (
      !window.confirm(
        'Удалить операцию по счёту ученика? Баланс будет пересчитан, операция может повлиять на даты оплат.'
      )
    ) {
      return;
    }
    setTransactionsLoading(true);
    setTransactionsError('');
    try {
      const updated = await studentAccountsApi.deleteTransaction(transactionsDialogAccount.id, tx.id);
      setTransactions(updated.transactions || []);
      setAccounts((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, balance: updated.balance } : a))
      );
      setTransactionsDialogAccount(updated);
    } catch (err: any) {
      setTransactionsError(err.response?.data?.detail || 'Не удалось удалить операцию по счёту');
    } finally {
      setTransactionsLoading(false);
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
    const discountValue = Number(newStudent.discount_value) || 0;
    if (abonementId !== null && isNaN(abonementId)) {
      setError('Некорректный абонемент');
      return;
    }
    if (newStudent.discount_type !== 'none' && discountValue < 0) {
      setError('Скидка не может быть отрицательной');
      return;
    }
    if (newStudent.discount_type === 'percent' && discountValue > 100) {
      setError('Скидка в процентах не может быть больше 100');
      return;
    }

    try {
      setError('');

      if (parentCreateMode === 'none') {
        const studentData: any = {
          full_name: newStudent.full_name.trim(),
          abonement_id: abonementId ?? undefined,
          discount_type: canAssignAbonement ? newStudent.discount_type : 'none',
          discount_value: canAssignAbonement && newStudent.discount_type !== 'none' ? discountValue : 0,
        };
        const createdStudent = await studentsApi.create(studentData);
        await assignProgramAndGroup(createdStudent.id);
        if (createCardToo && canCreateCard) {
          const phoneErr = [cardFields.student_phone, cardFields.parent_phone, cardFields.parent_phone_2].find(
            (p) => p.trim() && !isValidStudentPhone(p),
          );
          if (phoneErr) {
            setError('Введите корректный номер телефона: РФ (+7) или Грузия (+9955XXXXXXXX)');
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
        student: {
          full_name: newStudent.full_name.trim(),
          abonement_id: abonementId ?? undefined,
          discount_type: canAssignAbonement ? newStudent.discount_type : 'none',
          discount_value: canAssignAbonement && newStudent.discount_type !== 'none' ? discountValue : 0,
        },
        parent: parentPayload,
      });

      await assignProgramAndGroup(createdStudent.id);
      if (createCardToo && canCreateCard) {
        const phoneErr = [cardFields.student_phone, cardFields.parent_phone, cardFields.parent_phone_2].find(
          (p) => p.trim() && !isValidStudentPhone(p),
        );
        if (phoneErr) {
          setError('Введите корректный номер телефона: РФ (+7) или Грузия (+9955XXXXXXXX)');
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
      payment_link: isAdminLike ? (cardFields.payment_link.trim() || undefined) : undefined,
      discount_type: canAssignAbonement ? newStudent.discount_type : 'none',
      discount_value: canAssignAbonement && newStudent.discount_type !== 'none' ? Number(newStudent.discount_value) || 0 : 0,
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
    payment_link: '',
  });

  const resetCreateForm = () => {
    setNewStudent({ full_name: '', parent_id: '', trainer_id: '', group_id: '', program_id: '', abonement_id: '', discount_type: 'none', discount_value: '', training_start_date: '' });
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
      discount_type: student.discount_type || 'none',
      discount_value: student.discount_value ? String(student.discount_value) : '',
      training_start_date: student.training_start_date ? String(student.training_start_date).slice(0, 10) : '',
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
        payment_link: card.payment_link || '',
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
        updateData.discount_type = newStudent.discount_type;
        updateData.discount_value = newStudent.discount_type !== 'none' ? Number(newStudent.discount_value) || 0 : 0;
      }
      updateData.training_start_date = newStudent.training_start_date?.trim() ? newStudent.training_start_date.trim() : null;

      await studentsApi.update(editingStudent.id, updateData);

      // Обновление группы
      // Сначала удаляем из всех групп (делаем параллельно, чтобы не блокировать UI по одной группе)
      const studentGroups = groups.filter((g) => g.students?.some((s) => s.id === editingStudent.id));
      if (studentGroups.length) {
        await Promise.all(
          studentGroups.map(async (group) => {
            try {
              await groupsApi.removeStudent(group.id, editingStudent.id);
            } catch {
              // Игнорируем ошибки, если ученик не в группе
            }
          }),
        );
      }

      // Добавляем в новую группу, если выбрана
      if (newStudent.group_id) {
        try {
          await groupsApi.addStudent(parseInt(newStudent.group_id, 10), editingStudent.id);
        } catch (err) {
          console.error('Ошибка добавления в группу', err);
        }
      }

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
        payment_link: isAdminLike ? (cardFields.payment_link.trim() || undefined) : undefined,
        };
        try {
          if (editingCardId) {
            await studentCardsApi.update(editingCardId, cardPayload);
          } else {
            await studentCardsApi.create({
              ...cardPayload,
              discount_type: canAssignAbonement ? newStudent.discount_type : 'none',
              discount_value: canAssignAbonement && newStudent.discount_type !== 'none' ? Number(newStudent.discount_value) || 0 : 0,
            });
          }
        } catch (cardErr: any) {
          setError(cardErr.response?.data?.detail || 'Ученик сохранён, но не удалось сохранить карточку');
          return;
        }
      }

      // Обновляем списки с сервера в фоне, чтобы не блокировать UI
      studentCardsApi
        .list({})
        .then((updated) => setStudentCards(updated))
        .catch(() => {});
      loadStudents();
      loadGroups();

      // Закрываем диалог сразу после успешного сохранения
      setEditOpen(false);
      setEditingStudent(null);
      setEditingCardId(null);
      setEditParentCabinetLink(null);
      setEditParentCabinetMessage(null);
      setNewStudent({
        full_name: '',
        parent_id: '',
        trainer_id: '',
        group_id: '',
        program_id: '',
        abonement_id: '',
        discount_type: 'none',
        discount_value: '',
        training_start_date: '',
      });
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
    if (quickFilterNoGroup) list = list.filter((s) => s.in_group === false);
    if (quickFilterFromLead) list = list.filter((s) => !!s.from_lead_id);
    if (groupFilter !== '') {
      list = list.filter((s) => getStudentGroup(s)?.id === groupFilter);
    }
    if (trainerFilter !== '') {
      list = list.filter((s) => getStudentGroup(s)?.trainer_id === trainerFilter);
    }
    if (programFilter !== '') {
      list = list.filter((s) => {
        const g = getStudentGroup(s);
        const hasInStudent = (s.programs || []).some((p) => p.id === programFilter);
        const hasInGroup = (g?.programs || []).some((p: { id: number }) => p.id === programFilter);
        return hasInStudent || hasInGroup;
      });
    }
    return list;
  }, [students, typeFilter, groupFilter, trainerFilter, programFilter, grantStudentIds, individualFormatStudentIds, groups, quickFilterNoGroup, quickFilterFromLead]);

  const studentsMetrics = useMemo(() => {
    const active = students.filter((s) => s.status === 'active').length;
    const archived = students.filter((s) => s.status === 'archived').length;
    const notInGroup = students.filter((s) => s.in_group === false).length;
    const fromLeads = students.filter((s) => !!s.from_lead_id).length;
    const individual = students.filter((s) => isIndividualStudent(s)).length;
    const onGrant = students.filter((s) => grantStudentIds.has(s.id)).length;
    return { active, archived, notInGroup, fromLeads, individual, onGrant };
  }, [students, grantStudentIds, individualFormatStudentIds, groups]);

  const filteredParents = useMemo(() => {
    let list = parents.filter((p) => p.is_active !== false);
    const q = (parentSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          (p.full_name || '').toLowerCase().includes(q) ||
          (p.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [parents, parentSearch]);

  const getDiscountLabel = (student: Student): string => {
    const type = student.discount_type || 'none';
    const value = student.discount_value || 0;
    if (type === 'none' || value <= 0) return '—';
    if (type === 'percent') return `${value}%`;
    return `${value} ₽`;
  };

  const getPriceWithDiscount = (student: Student, ab?: Abonement): number => {
    if (!ab) return 0;
    const type = student.discount_type || 'none';
    const value = student.discount_value || 0;
    if (type === 'none') return ab.price;
    if (type === 'percent') return Math.round(ab.price * (1 - value / 100) * 100) / 100;
    return Math.max(0, ab.price - value);
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

  const renderStudentDiscountFields = () => {
    const selectedAbonement = newStudent.abonement_id
      ? abonements.find((a) => a.id === Number(newStudent.abonement_id))
      : undefined;
    const discountValue = Number(newStudent.discount_value) || 0;
    const previewStudent = {
      discount_type: newStudent.discount_type,
      discount_value: discountValue,
    } as Student;
    const finalPrice = selectedAbonement ? getPriceWithDiscount(previewStudent, selectedAbonement) : 0;

    return (
      <Stack spacing={1.5} sx={{ mt: 2 }}>
        <Typography variant="subtitle2">Персональная скидка ученика</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <FormControl size="small" fullWidth>
            <InputLabel>Тип скидки</InputLabel>
            <Select
              value={newStudent.discount_type}
              label="Тип скидки"
              onChange={(e) => setNewStudent({ ...newStudent, discount_type: e.target.value as 'none' | 'amount' | 'percent', discount_value: e.target.value === 'none' ? '' : newStudent.discount_value })}
            >
              <MenuItem value="none">Нет скидки</MenuItem>
              <MenuItem value="amount">Сумма</MenuItem>
              <MenuItem value="percent">Процент</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            fullWidth
            type="number"
            label={newStudent.discount_type === 'percent' ? 'Процент скидки' : 'Сумма скидки'}
            value={newStudent.discount_value}
            onChange={(e) => setNewStudent({ ...newStudent, discount_value: e.target.value })}
            disabled={newStudent.discount_type === 'none'}
            inputProps={{ min: 0, max: newStudent.discount_type === 'percent' ? 100 : undefined }}
          />
        </Stack>
        {selectedAbonement && (
          <Typography variant="caption" color="text.secondary">
            Абонемент: {selectedAbonement.price} ₽ · скидка: {getDiscountLabel(previewStudent)} · к оплате: {finalPrice} ₽
          </Typography>
        )}
      </Stack>
    );
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
        <Tabs value={studentsTab} onChange={(_, v) => setStudentsTab(v as PageTab)}>
          <Tab label="Ученики" value="students" />
          {hasFullStudentsView && <Tab label="Родители" value="parents" />}
        </Tabs>
      </Box>

      {studentsTab === 'students' && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box>
              <Typography variant="h4">Ученики</Typography>
              <Typography variant="body2" color="text.secondary">
                Управление учениками, группами, программами и карточками.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  resetCreateForm();
                  setOpen(true);
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

          <Grid container spacing={1} sx={{ mb: 2 }}>
            <Grid item><Paper variant="outlined" sx={{ px: 1.5, py: 1 }}><Typography variant="body2" color="text.secondary">Активные</Typography><Typography variant="h6">{studentsMetrics.active}</Typography></Paper></Grid>
            <Grid item><Paper variant="outlined" sx={{ px: 1.5, py: 1, cursor: 'pointer' }}><Typography variant="body2" color="text.secondary">Архив</Typography><Typography variant="h6">{studentsMetrics.archived}</Typography></Paper></Grid>
            <Grid item><Paper variant="outlined" sx={{ px: 1.5, py: 1, cursor: 'pointer', bgcolor: quickFilterNoGroup ? 'action.selected' : undefined }} onClick={() => setQuickFilterNoGroup((v) => !v)}><Typography variant="body2" color="text.secondary">Не в группе</Typography><Typography variant="h6">{studentsMetrics.notInGroup}</Typography></Paper></Grid>
            <Grid item><Paper variant="outlined" sx={{ px: 1.5, py: 1, cursor: 'pointer', bgcolor: quickFilterFromLead ? 'action.selected' : undefined }} onClick={() => setQuickFilterFromLead((v) => !v)}><Typography variant="body2" color="text.secondary">Из лидов</Typography><Typography variant="h6">{studentsMetrics.fromLeads}</Typography></Paper></Grid>
            <Grid item><Paper variant="outlined" sx={{ px: 1.5, py: 1 }}><Typography variant="body2" color="text.secondary">Индивидуальные</Typography><Typography variant="h6">{studentsMetrics.individual}</Typography></Paper></Grid>
            <Grid item><Paper variant="outlined" sx={{ px: 1.5, py: 1 }}><Typography variant="body2" color="text.secondary">По гранту</Typography><Typography variant="h6">{studentsMetrics.onGrant}</Typography></Paper></Grid>
          </Grid>

          <FilterPanel>
            <TextField
              size="small"
              placeholder="Поиск по ФИО / email / телефону..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: 260 }}
              inputProps={{ 'aria-label': 'Поиск ученика' }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Статус</InputLabel>
              <Select value={statusFilter} label="Статус" onChange={(e) => setStatusFilter(e.target.value as any)}>
                <MenuItem value="all">Все</MenuItem>
                <MenuItem value="active">Активные</MenuItem>
                <MenuItem value="archived">Архив</MenuItem>
              </Select>
            </FormControl>
            {hasFullStudentsView && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Тип</InputLabel>
                <Select value={typeFilter} label="Тип" onChange={(e) => setTypeFilter(e.target.value as '' | 'grant' | 'individual' | 'paid')}>
                  <MenuItem value="">Все</MenuItem>
                  <MenuItem value="grant">По гранту</MenuItem>
                  <MenuItem value="individual">Индивидуальные</MenuItem>
                  <MenuItem value="paid">По оплате</MenuItem>
                </Select>
              </FormControl>
            )}
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Группа</InputLabel>
              <Select value={groupFilter} label="Группа" onChange={(e) => setGroupFilter(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">Все</MenuItem>
                {groups.map((g) => (
                  <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Тренер</InputLabel>
              <Select value={trainerFilter} label="Тренер" onChange={(e) => setTrainerFilter(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">Все</MenuItem>
                {trainers.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Программа</InputLabel>
              <Select value={programFilter} label="Программа" onChange={(e) => setProgramFilter(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">Все</MenuItem>
                {programs.filter((p) => p.status === 'active').map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name} (v{p.version})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel control={<Checkbox checked={quickFilterNoGroup} onChange={(e) => setQuickFilterNoGroup(e.target.checked)} />} label="Только без группы" />
            <FormControlLabel control={<Checkbox checked={quickFilterFromLead} onChange={(e) => setQuickFilterFromLead(e.target.checked)} />} label="Только из лидов" />
            <Button size="small" onClick={() => { setQuickFilterNoGroup(false); setQuickFilterFromLead(false); setGroupFilter(''); setTrainerFilter(''); setProgramFilter(''); setStatusFilter('all'); setTypeFilter(''); setSearchQuery(''); }}>Сбросить фильтры</Button>
          </FilterPanel>

          <TableContainer component={Paper} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={48}>№</TableCell>
                  <TableCell>Ученик</TableCell>
                  <TableCell>Родитель</TableCell>
                  <TableCell>Группа / формат</TableCell>
                  <TableCell>Программа</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right" width={140}>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStudents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Нет учеников по выбранным фильтрам</Typography>
                      <Button size="small" sx={{ mt: 1 }} onClick={() => { setQuickFilterNoGroup(false); setQuickFilterFromLead(false); setGroupFilter(''); setTrainerFilter(''); setProgramFilter(''); setStatusFilter('all'); setTypeFilter(''); setSearchQuery(''); }}>Сбросить фильтры</Button>
                    </TableCell>
                  </TableRow>
                )}
                {filteredStudents.map((student, index) => {
                  const studentGroup = getStudentGroup(student);
                  const fromLead = !!student.from_lead_id;
                  const notInGroup = student.in_group === false;
                  const isIndividual = isIndividualStudent(student);
                  const onGrant = grantStudentIds.has(student.id);
                  const activePrograms = (student.programs || []).filter((p) => p.status === 'active');
                  const groupPrograms = studentGroup ? (studentGroup.programs || []).filter((p: { status: string }) => p.status === 'active') : [];
                  const programLabel = activePrograms.length > 0
                    ? `${activePrograms[0].name} (v${activePrograms[0].version})${activePrograms.length > 1 ? ` +${activePrograms.length - 1}` : ''}`
                    : groupPrograms.length > 0
                      ? `${groupPrograms[0].name} (из группы)${groupPrograms.length > 1 ? ` +${groupPrograms.length - 1}` : ''}`
                      : '—';
                  return (
                    <TableRow
                      key={student.id}
                      hover
                      sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                      onClick={(e) => { if (!(e.target as HTMLElement).closest('button, [role="button"], .MuiSelect-root')) setStudentDetailId(student.id); }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{student.full_name}</Typography>
                          <Stack direction="row" flexWrap="wrap" sx={{ gap: 0.5, mt: 0.25 }} onClick={(e) => e.stopPropagation()}>
                            {fromLead && <Chip size="small" label="Из лида" sx={{ bgcolor: 'warning.light', color: 'warning.dark' }} />}
                            {notInGroup && <Chip size="small" label="Не в группе" sx={{ bgcolor: 'info.light', color: 'info.dark' }} />}
                            {isIndividual && <Chip size="small" label="Индивидуальный" sx={{ bgcolor: 'success.light', color: 'success.dark' }} />}
                            {onGrant && <Chip size="small" label="По гранту" sx={{ bgcolor: 'secondary.light', color: 'secondary.dark' }} />}
                          </Stack>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {student.parent ? (
                          <Box>
                            <Typography variant="body2">{student.parent.full_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{[student.parent.email, student.parent.phone].filter(Boolean).join(' · ') || '—'}</Typography>
                          </Box>
                        ) : (
                          <Chip size="small" label="Нет родителя" color="default" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        {studentGroup ? (
                          <Box>
                            <Typography variant="body2">{studentGroup.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {studentGroup.schedule_short || '—'} · {isInIndividualGroup(student) ? 'Индивидуальный' : 'Групповой'}
                            </Typography>
                          </Box>
                        ) : (
                          <Box><Typography variant="body2" color="text.secondary">—</Typography><Typography variant="caption" display="block" color="text.secondary">Не в группе</Typography></Box>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{programLabel}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={student.status === 'active' ? 'Активен' : 'Архив'} color={student.status === 'active' ? 'success' : 'default'} variant="outlined" />
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Button size="small" startIcon={<PersonIcon />} onClick={() => setStudentDetailId(student.id)}>Карточка</Button>
                        <Button size="small" startIcon={<EditIcon />} onClick={() => handleEdit(student)}>Ред.</Button>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setRowMenuAnchor({ el: e.currentTarget, student }); }}><MoreVertIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Menu
            open={!!rowMenuAnchor}
            anchorEl={rowMenuAnchor?.el}
            onClose={() => setRowMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {canManageAccounts && rowMenuAnchor && (
              <MenuItem onClick={() => { openAccountsDialog(rowMenuAnchor.student); setRowMenuAnchor(null); }}>Счета</MenuItem>
            )}
            {rowMenuAnchor && (
              <MenuItem onClick={() => { setStudentDetailId(rowMenuAnchor.student.id); setRowMenuAnchor(null); }}>Управлять программами (в карточке)</MenuItem>
            )}
            {rowMenuAnchor && (
              <MenuItem onClick={() => { handleEdit(rowMenuAnchor.student); setRowMenuAnchor(null); }}>Редактировать</MenuItem>
            )}
            {rowMenuAnchor && rowMenuAnchor.student.status === 'active' && (
              <MenuItem onClick={() => { setArchiveConfirmOpen(rowMenuAnchor.student); setRowMenuAnchor(null); }}>Архивировать</MenuItem>
            )}
            {rowMenuAnchor && rowMenuAnchor.student.status === 'archived' && (
              <MenuItem onClick={async () => {
                if (!rowMenuAnchor) return;
                await studentsApi.update(rowMenuAnchor.student.id, { status: 'active' });
                loadStudents();
                setRowMenuAnchor(null);
              }}>Разархивировать</MenuItem>
            )}
          </Menu>

          <Dialog open={!!archiveConfirmOpen} onClose={() => setArchiveConfirmOpen(null)}>
            <DialogTitle>Архивировать ученика?</DialogTitle>
            <DialogContent>Он пропадёт из активного списка, но данные сохранятся.</DialogContent>
            <DialogActions>
              <Button onClick={() => setArchiveConfirmOpen(null)}>Отмена</Button>
              <Button color="warning" variant="contained" onClick={async () => {
                if (archiveConfirmOpen) {
                  await studentsApi.archive(archiveConfirmOpen.id);
                  loadStudents();
                  setArchiveConfirmOpen(null);
                }
              }}>Архивировать</Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {studentsTab === 'parents' && hasFullStudentsView && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">Родители</Typography>
          </Box>
          <Box sx={{ mb: 2 }}>
            <TextField size="small" placeholder="Поиск по ФИО / email..." value={parentSearch} onChange={(e) => setParentSearch(e.target.value)} sx={{ minWidth: 280 }} />
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={48}>№</TableCell>
                  <TableCell>ФИО</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Кол-во детей</TableCell>
                  <TableCell>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredParents.map((parent, idx) => {
                  const studentsCount = students.filter((s) => s.parent_id === parent.id).length;
                  return (
                    <TableRow key={parent.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{parent.full_name}</TableCell>
                      <TableCell>{parent.email}</TableCell>
                      <TableCell>{parent.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                      <TableCell>{studentsCount}</TableCell>
                      <TableCell>
                        {parent.is_active ? (
                          <Button size="small" color="warning" onClick={async () => { try { await usersApi.update(parent.id, { is_active: false }); loadParents(); } catch (err: any) { setError(err.response?.data?.detail || 'Ошибка'); } }}>Архивировать</Button>
                        ) : (
                          <Button size="small" color="success" onClick={async () => { try { await usersApi.update(parent.id, { is_active: true }); loadParents(); } catch (err: any) { setError(err.response?.data?.detail || 'Ошибка'); } }}>Разархивировать</Button>
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
                  <TextField
                    size="small"
                    fullWidth
                    label="Мобильный телефон ученика"
                    value={cardFields.student_phone}
                    onChange={(e) => setCardFields((f) => ({ ...f, student_phone: e.target.value }))}
                    placeholder="+9955XXXXXXXX или +7(XXX) XXX-XX-XX"
                    error={!!cardFields.student_phone.trim() && !isValidStudentPhone(cardFields.student_phone)}
                    helperText={
                      cardFields.student_phone.trim() && !isValidStudentPhone(cardFields.student_phone)
                        ? 'Формат: РФ (+7) или Грузия (+9955XXXXXXXX)'
                        : ''
                    }
                  />
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
                  <Autocomplete
                    size="small"
                    freeSolo
                    options={schoolsList}
                    value={cardFields.school}
                    onInputChange={(_, v) => setCardFields((f) => ({ ...f, school: v ?? '' }))}
                    onChange={(_, v) => setCardFields((f) => ({ ...f, school: (typeof v === 'string' ? v : v ?? '').trim() }))}
                    renderInput={(params) => <TextField {...params} label="Образовательное учреждение" placeholder="Выберите школу из списка или введите свою" />}
                  />
                  <Autocomplete
                    size="small"
                    freeSolo
                    options={classesList}
                    value={cardFields.grade}
                    onInputChange={(_, v) => setCardFields((f) => ({ ...f, grade: v ?? '' }))}
                    onChange={(_, v) => setCardFields((f) => ({ ...f, grade: (typeof v === 'string' ? v : v ?? '').trim() }))}
                    renderInput={(params) => <TextField {...params} label="Класс" placeholder="Выберите класс из списка или введите свой" />}
                  />
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
                  {isAdminLike && (
                    <TextField
                      size="small"
                      fullWidth
                      label="Ссылка для оплаты"
                      value={cardFields.payment_link}
                      onChange={(e) => setCardFields((f) => ({ ...f, payment_link: e.target.value }))}
                      placeholder="https://..."
                    />
                  )}
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
          {canAssignAbonement && renderStudentDiscountFields()}
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
          <TextField
            fullWidth
            size="small"
            label="Дата начала обучения"
            type="date"
            value={newStudent.training_start_date}
            onChange={(e) => setNewStudent({ ...newStudent, training_start_date: e.target.value })}
            InputLabelProps={{ shrink: true }}
            helperText="С этой даты ученик участвует в уроках; от неё считаются оплата и напоминания"
            sx={{ mt: 2 }}
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
              <TextField
                size="small"
                fullWidth
                label="Мобильный телефон ученика"
                value={cardFields.student_phone}
                onChange={(e) => setCardFields((f) => ({ ...f, student_phone: e.target.value }))}
                placeholder="+9955XXXXXXXX или +7(XXX) XXX-XX-XX"
                error={!!cardFields.student_phone.trim() && !isValidStudentPhone(cardFields.student_phone)}
                helperText={
                  cardFields.student_phone.trim() && !isValidStudentPhone(cardFields.student_phone)
                    ? 'Формат: РФ (+7) или Грузия (+9955XXXXXXXX)'
                    : ''
                }
              />
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
              <Autocomplete
                size="small"
                freeSolo
                options={schoolsList}
                value={cardFields.school}
                onInputChange={(_, v) => setCardFields((f) => ({ ...f, school: v ?? '' }))}
                onChange={(_, v) => setCardFields((f) => ({ ...f, school: (typeof v === 'string' ? v : v ?? '').trim() }))}
                renderInput={(params) => <TextField {...params} label="Образовательное учреждение" placeholder="Выберите школу из списка или введите свою" />}
              />
              <Autocomplete
                size="small"
                freeSolo
                options={classesList}
                value={cardFields.grade}
                onInputChange={(_, v) => setCardFields((f) => ({ ...f, grade: v ?? '' }))}
                onChange={(_, v) => setCardFields((f) => ({ ...f, grade: (typeof v === 'string' ? v : v ?? '').trim() }))}
                renderInput={(params) => <TextField {...params} label="Класс" placeholder="Выберите класс из списка или введите свой" />}
              />
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
              {isAdminLike && (
                <TextField
                  size="small"
                  fullWidth
                  label="Ссылка для оплаты"
                  value={cardFields.payment_link}
                  onChange={(e) => setCardFields((f) => ({ ...f, payment_link: e.target.value }))}
                  placeholder="https://..."
                />
              )}
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
          {canAssignAbonement && renderStudentDiscountFields()}
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
              {canManageStudents && (
                <>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <TextField
                      size="small"
                      label="Название счета"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="Группа / Индивидуально"
                      sx={{ flex: 1 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                      <InputLabel>Формат счета</InputLabel>
                      <Select
                        label="Формат счета"
                        value={newAccountFormat}
                        onChange={(e) =>
                          setNewAccountFormat(
                            (e.target.value as 'individual' | 'package' | 'group' | '') || '',
                          )
                        }
                      >
                        <MenuItem value="">Не выбран</MenuItem>
                        <MenuItem value="individual">Индивидуальный</MenuItem>
                        <MenuItem value="package">Пакет</MenuItem>
                        <MenuItem value="group">Групповой</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      variant="outlined"
                      onClick={handleCreateAccount}
                      disabled={(!newAccountName.trim() && !newAccountFormat) || accountsLoading}
                    >
                      Создать счет
                    </Button>
                  </Stack>
                  {accountTemplates.length > 0 && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel>Добавить из списка</InputLabel>
                        <Select
                          label="Добавить из списка"
                          value={selectedAccountTemplateId}
                          onChange={(e) => setSelectedAccountTemplateId(e.target.value === '' ? '' : Number(e.target.value))}
                        >
                          <MenuItem value="">— выберите шаблон</MenuItem>
                          {accountTemplates.map((t) => (
                            <MenuItem key={t.id} value={t.id}>
                              {t.name} ({t.format === 'group' ? 'Групповой' : 'Индивидуальный'})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button
                        variant="contained"
                        onClick={handleCreateAccountFromTemplate}
                        disabled={!selectedAccountTemplateId || accountsLoading}
                      >
                        Создать из шаблона
                      </Button>
                    </Stack>
                  )}
                </>
              )}
              {accounts.length === 0 ? (
                <Typography color="textSecondary">Нет счетов. {canManageStudents ? 'Создайте первый счет.' : ''}</Typography>
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
                          <Button
                            size="small"
                            onClick={() => {
                              setPaymentDialog({ account: acc, type: 'payment' });
                              setPaymentAmount('');
                              setPaymentNote('');
                            }}
                          >
                            Пополнить
                          </Button>
                          {canManageStudents && (
                            <>
                              <Button
                                size="small"
                                color="secondary"
                                onClick={() => {
                                  setPaymentDialog({ account: acc, type: 'deduct' });
                                  setPaymentAmount('');
                                  setPaymentNote('');
                                }}
                                disabled={acc.balance <= 0}
                                sx={{ ml: 0.5 }}
                              >
                                Списать
                              </Button>
                              <Button
                                size="small"
                                onClick={() => openAccountTransactions(acc)}
                                sx={{ ml: 0.5 }}
                              >
                                Операции
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                onClick={() => handleDeleteAccount(acc)}
                                disabled={accountsLoading}
                                sx={{ ml: 0.5 }}
                              >
                                Удалить
                              </Button>
                            </>
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

      <Dialog
        open={!!transactionsDialogAccount}
        onClose={() => {
          setTransactionsDialogAccount(null);
          setTransactions([]);
          setTransactionsError('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Операции по счёту: {transactionsDialogAccount?.name}
        </DialogTitle>
        <DialogContent>
          {transactionsError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setTransactionsError('')}>
              {transactionsError}
            </Alert>
          )}
          {transactionsLoading && transactions.length === 0 ? (
            <Typography color="textSecondary">Загрузка...</Typography>
          ) : transactions.length === 0 ? (
            <Typography color="textSecondary">По этому счёту ещё нет операций.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell align="right">Сумма (₽)</TableCell>
                  <TableCell>Тип</TableCell>
                  <TableCell>Комментарий</TableCell>
                  {canManageStudents && (
                    <TableCell align="right">Действия</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.created_at).toLocaleString('ru-RU')}</TableCell>
                    <TableCell align="right">{tx.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      {tx.kind === 'payment'
                        ? 'Пополнение'
                        : tx.kind === 'lesson_deduction'
                        ? 'Списание за занятие'
                        : 'Списание (доп. занятие)'}
                    </TableCell>
                    <TableCell>{tx.note || '—'}</TableCell>
                    {canManageStudents && (
                      <TableCell align="right">
                        {tx.kind === 'payment' && (
                          <Button
                            size="small"
                            color="error"
                            onClick={() => handleDeleteTransaction(tx)}
                            disabled={transactionsLoading}
                          >
                            Удалить
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setTransactionsDialogAccount(null);
              setTransactions([]);
              setTransactionsError('');
            }}
          >
            Закрыть
          </Button>
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
      />
    </Layout>
  );
};

export default StudentsPage;
