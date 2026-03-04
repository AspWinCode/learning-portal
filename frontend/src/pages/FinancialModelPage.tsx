import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Stack,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Button,
  IconButton,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Autocomplete,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { usersApi, groupsApi, financeApi } from '../services/api';
import { User, Group as ApiGroup, Student as ApiStudent, FinancePnlRow } from '../types';
import { AcademyOperationsTab } from './AcademyOperationsTab';

type Inputs = {
  selectedTax: string;
  acquiringPercent: number;
  acquiringFixed: number;
  defaultAbonementLessons: number;
  defaultLessonHours: number;
  defaultRetention: number;
  defaultDiscount: number;
  seasonality: number[];
};

type TaxRate = {
  taxName: string;
  taxPercent: number;
  taxFixedMonthly: number;
};

type Student = {
  studentId: number;
  startDate: string;
  direction: string;
  groupId: number;
  teacherId: number;
  monthlyPrice: number;
  discountPercent: number;
  status: string;
  paymentMonths: number;
  isAnnual: boolean;
};

type Group = {
  groupId: number;
  direction: string;
  teacherId: number;
  lessonHours: number;
  lessonsPerMonth: number;
  maxCapacity: number;
  groupStatus: string;
};

type Teacher = {
  teacherId: number;
  grade: string;
  ratePerHour: number;
  bonusPerStudent: number;
};

type GroupModelRow = {
  groupId: number;
  groupName: string;
  groupDirection: string;
  teacherId: number;
  studentsCount: number;
  avgCheck: number;
  revenue: number;
  trainerSalaryCost: number;
  directCosts: number;
  sharedCosts: number;
  totalCosts: number;
  profit: number;
  marginPercent: number;
  breakEvenStudents: number;
};

type TrainerModelRow = {
  teacherId: number;
  teacherName: string;
  groupsCount: number;
  studentsCount: number;
  revenue: number;
  totalCosts: number;
  profit: number;
  marginPercent: number;
  avgGroupProfit: number;
};

type RevenueRow = {
  month: string;
  groupId: number;
  direction: string;
  discount: number;
  category?: string;
  manualAmount?: number;
};

type CostRow = {
  month: string;
  category: 'Variable' | 'Fixed';
  subcategory: string;
  amount: number;
  groupId?: number;
  teacherId?: number;
};

type ModelData = {
  inputs: Inputs;
  taxRates: TaxRate[];
  categories: { id: number; name: string; type: 'income' | 'expense' }[];
  students: Student[];
  groups: Group[];
  teachers: Teacher[];
  revenue: RevenueRow[];
  costs: CostRow[];
};

const STORAGE_KEY = 'financialModelData';

const defaultData: ModelData = {
  inputs: {
    selectedTax: 'ИП Патент',
    acquiringPercent: 0.02,
    acquiringFixed: 10,
    defaultAbonementLessons: 8,
    defaultLessonHours: 1,
    defaultRetention: 0.95,
    defaultDiscount: 0,
    seasonality: Array.from({ length: 12 }, () => 1),
  },
  taxRates: [
    { taxName: 'ИП Патент', taxPercent: 0.06, taxFixedMonthly: 0 },
    { taxName: 'ООО УСН 15%', taxPercent: 0.15, taxFixedMonthly: 0 },
    { taxName: 'ООО УСН 6%', taxPercent: 0.06, taxFixedMonthly: 0 },
  ],
  categories: [
    { id: 1, name: 'Абонементы', type: 'income' },
    { id: 2, name: 'Индивидуальные занятия', type: 'income' },
    { id: 3, name: 'ФОТ тренеров', type: 'expense' },
    { id: 4, name: 'Маркетинг', type: 'expense' },
  ],
  students: [
    {
      studentId: 1,
      startDate: '2026-01-01',
      direction: 'Start',
      groupId: 101,
      teacherId: 501,
      monthlyPrice: 12000,
      discountPercent: 0,
      status: 'Active',
      paymentMonths: 1,
      isAnnual: false,
    },
  ],
  groups: [
    {
      groupId: 101,
      direction: 'Start',
      teacherId: 501,
      lessonHours: 1,
      lessonsPerMonth: 8,
      maxCapacity: 12,
      groupStatus: 'Active',
    },
  ],
  teachers: [
    {
      teacherId: 501,
      grade: 'Senior',
      ratePerHour: 1200,
      bonusPerStudent: 0,
    },
  ],
  revenue: [
    {
      month: '2026-01',
      groupId: 101,
      direction: 'Start',
      discount: 0,
    },
  ],
  costs: [
    {
      month: '2026-01',
      category: 'Variable',
      subcategory: 'Teacher payroll',
      amount: 0,
      groupId: 101,
      teacherId: 501,
    },
  ],
};

const toNumber = (value: string | number, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseMonthEnd = (month: string) => {
  if (!month) return null;
  const [y, m] = month.split('-').map((v) => Number(v));
  if (!y || !m) return null;
  return new Date(y, m, 0);
};

const FinancialModelPage: React.FC = () => {
  const [sheetIndex, setSheetIndex] = useState(0);
  const [data, setData] = useState<ModelData>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    try {
      const parsed = JSON.parse(raw) as ModelData;
      return {
        ...defaultData,
        ...parsed,
        categories: parsed.categories ?? defaultData.categories,
      };
    } catch {
      return defaultData;
    }
  });
  const [dashboardMonth, setDashboardMonth] = useState<string>('2026-01');
  const [trainerModelTrainerFilter, setTrainerModelTrainerFilter] = useState<number | 'all'>('all');
  const [trainerModelDirectionFilter, setTrainerModelDirectionFilter] = useState<string>('all');
  const [globalTrainers, setGlobalTrainers] = useState<User[]>([]);
  const [dbGroups, setDbGroups] = useState<ApiGroup[]>([]);
  const [entryDate, setEntryDate] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [entryCategory, setEntryCategory] = useState<string>('');
  const [entryAmount, setEntryAmount] = useState<number>(0);
  const [entryCategoryType, setEntryCategoryType] = useState<'Variable' | 'Fixed'>('Fixed');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const loadTrainers = useCallback(async () => {
    try {
      const trainers = await usersApi.getAll('trainer');
      setGlobalTrainers(trainers);
    } catch {
      setGlobalTrainers([]);
    }
  }, []);

  useEffect(() => {
    loadTrainers();

    const interval = window.setInterval(loadTrainers, 10000);
    const handleFocus = () => loadTrainers();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [loadTrainers]);

  useEffect(() => {
    const loadGroupsWithStudents = async () => {
      try {
        const groups = await groupsApi.getAll();
        const groupsWithStudents = await Promise.all(
          groups.map(async (group) => {
            try {
              return await groupsApi.getById(group.id);
            } catch {
              return group;
            }
          })
        );
        setDbGroups(groupsWithStudents);
      } catch {
        setDbGroups([]);
      }
    };
    loadGroupsWithStudents();
  }, []);

  const selectedTax = data.inputs.selectedTax;
  const selectedTaxRate = data.taxRates.find((t) => t.taxName === selectedTax)?.taxPercent ?? 0;
  const selectedTaxFixed = data.taxRates.find((t) => t.taxName === selectedTax)?.taxFixedMonthly ?? 0;
  const categoryOptions = useMemo(() => {
    return data.categories.filter((c) => c.type === entryType).map((c) => c.name);
  }, [data.categories, entryType]);

  const handleAddEntry = () => {
    const [year, month] = entryDate.split('-');
    const monthKey = year && month ? `${year}-${month}` : '';
    if (!monthKey || !entryCategory || entryAmount <= 0) return;

    if (entryType === 'income') {
      setData((prev) => ({
        ...prev,
        revenue: [
          ...prev.revenue,
          {
            month: monthKey,
            groupId: 0,
            direction: '',
            discount: prev.inputs.defaultDiscount,
            category: entryCategory,
            manualAmount: entryAmount,
          },
        ],
      }));
    } else {
      setData((prev) => ({
        ...prev,
        costs: [
          ...prev.costs,
          {
            month: monthKey,
            category: entryCategoryType,
            subcategory: entryCategory,
            amount: entryAmount,
            groupId: undefined,
            teacherId: undefined,
          },
        ],
      }));
    }

    setEntryCategory('');
    setEntryAmount(0);
  };

  const dbStudents: Student[] = useMemo(() => {
    if (!dbGroups.length) return [];
    const list: Student[] = [];
    dbGroups.forEach((group) => {
      (group.students || []).forEach((student: ApiStudent) => {
        list.push({
          studentId: student.id,
          startDate: student.created_at ? student.created_at.slice(0, 10) : '2026-01-01',
          direction: '',
          groupId: group.id,
          teacherId: group.trainer_id,
          monthlyPrice: student.abonement?.price || 0,
          discountPercent: 0,
          status: student.status === 'active' ? 'Active' : 'Paused',
          paymentMonths: 1,
          isAnnual: false,
        });
      });
    });
    return list;
  }, [dbGroups]);

  const effectiveGroups = dbGroups.length ? dbGroups : data.groups;
  const effectiveStudents = dbStudents.length ? dbStudents : data.students;

  const revenueComputed = useMemo(() => {
    return data.revenue.map((row) => {
      const isManual = typeof row.manualAmount === 'number' && row.manualAmount > 0;
      const monthEnd = parseMonthEnd(row.month);
      const activeStudents = effectiveStudents.filter((s) => {
        if (s.status !== 'Active') return false;
        if (s.groupId !== row.groupId) return false;
        if (!monthEnd) return true;
        return new Date(s.startDate) <= monthEnd;
      });
      const pricePerStudent =
        isManual || activeStudents.length === 0
          ? 0
          : activeStudents.reduce((sum, s) => sum + toNumber(s.monthlyPrice), 0) / activeStudents.length;
      const discount = row.discount ?? data.inputs.defaultDiscount;
      const gross = isManual ? row.manualAmount || 0 : activeStudents.length * pricePerStudent * (1 - discount);
      const net = isManual
        ? gross * (1 - data.inputs.acquiringPercent) - data.inputs.acquiringFixed
        : gross * (1 - data.inputs.acquiringPercent) - activeStudents.length * data.inputs.acquiringFixed;
      return {
        ...row,
        activeStudents: isManual ? 0 : activeStudents.length,
        pricePerStudent,
        discount,
        grossRevenue: gross,
        netRevenue: net,
      };
    });
  }, [data.revenue, data.inputs, effectiveStudents]);

  const pnlRows = useMemo(() => {
    const months = Array.from(
      new Set([...data.revenue.map((r) => r.month), ...data.costs.map((c) => c.month)].filter(Boolean))
    ).sort();
    return months.map((month) => {
      const revenue = revenueComputed
        .filter((r) => r.month === month)
        .reduce((sum, r) => sum + r.netRevenue, 0);
      const cogs = data.costs
        .filter((c) => c.month === month && c.category === 'Variable')
        .reduce((sum, c) => sum + toNumber(c.amount), 0);
      const opex = data.costs
        .filter((c) => c.month === month && c.category === 'Fixed')
        .reduce((sum, c) => sum + toNumber(c.amount), 0);
      const ebitda = revenue - cogs - opex;
      const taxes = revenue * selectedTaxRate + selectedTaxFixed;
      const netProfit = ebitda - taxes;
      return { month, revenue, cogs, grossProfit: revenue - cogs, opex, ebitda, taxes, netProfit };
    });
  }, [data.revenue, data.costs, revenueComputed, selectedTaxRate, selectedTaxFixed]);

  const dashboardSummary = useMemo(() => {
    const month = dashboardMonth;
    const revenue = revenueComputed
      .filter((r) => r.month === month)
      .reduce((sum, r) => sum + r.netRevenue, 0);
    const cogs = data.costs
      .filter((c) => c.month === month && c.category === 'Variable')
      .reduce((sum, c) => sum + toNumber(c.amount), 0);
    const opex = data.costs
      .filter((c) => c.month === month && c.category === 'Fixed')
      .reduce((sum, c) => sum + toNumber(c.amount), 0);
    const taxes = revenue * selectedTaxRate + selectedTaxFixed;
    return {
      revenue,
      cogs,
      opex,
      netProfit: revenue - cogs - opex - taxes,
    };
  }, [dashboardMonth, revenueComputed, data.costs, selectedTaxRate, selectedTaxFixed]);

  const dashboardGroups = useMemo(() => {
    return data.groups.map((group) => {
      const groupRevenue = revenueComputed
        .filter((r) => r.month === dashboardMonth && r.groupId === group.groupId)
        .reduce((sum, r) => sum + r.netRevenue, 0);
      const teacherCost = data.costs
        .filter((c) => c.month === dashboardMonth && c.teacherId === group.teacherId)
        .reduce((sum, c) => sum + toNumber(c.amount), 0);
      const groupVariableCosts = data.costs
        .filter((c) => c.month === dashboardMonth && c.groupId === group.groupId && c.category === 'Variable')
        .reduce((sum, c) => sum + toNumber(c.amount), 0);
      return {
        groupId: group.groupId,
        revenue: groupRevenue,
        teacherCost,
        groupVariableCosts,
        profit: groupRevenue - teacherCost - groupVariableCosts,
      };
    });
  }, [data.groups, revenueComputed, data.costs, dashboardMonth]);

  const dashboardTeachers = useMemo(() => {
    const trainerComp = globalTrainers.reduce<Record<number, number>>((acc, trainer) => {
      const rate = trainer.trainer_rate ?? 0;
      const lessons = trainer.trainer_lessons ?? 0;
      acc[trainer.id] = rate * lessons;
      return acc;
    }, {});
    const totalExpenses = data.costs
      .filter((c) => c.month === dashboardMonth)
      .reduce((sum, c) => sum + toNumber(c.amount), 0);
    const totalCommissions = revenueComputed
      .filter((r) => r.month === dashboardMonth)
      .reduce((sum, r) => sum + (r.grossRevenue - r.netRevenue), 0);
    const totalRevenue = revenueComputed
      .filter((r) => r.month === dashboardMonth)
      .reduce((sum, r) => sum + r.netRevenue, 0);
    const totalTaxes = totalRevenue * selectedTaxRate + selectedTaxFixed;
    const trainersCount = data.teachers.length || 1;
    const expensesShare = totalExpenses / trainersCount;
    const commissionsShare = totalCommissions / trainersCount;
    const taxesShare = totalTaxes / trainersCount;

    const teacherSource = globalTrainers.length
      ? globalTrainers.map((t) => ({ teacherId: t.id, full_name: t.full_name }))
      : data.teachers.map((t) => ({ teacherId: t.teacherId, full_name: String(t.teacherId) }));

    return teacherSource.map((teacher) => {
      const localTeacher = data.teachers.find((t) => t.teacherId === teacher.teacherId);
      const groupsForTeacher = dbGroups.length
        ? dbGroups.filter((g) => g.trainer_id === teacher.teacherId)
        : data.groups.filter((g) => g.teacherId === teacher.teacherId);
      const teacherPay = trainerComp[teacher.teacherId] ?? 0;

      if (dbGroups.length) {
        const studentsForTeacher: ApiStudent[] = [];
        groupsForTeacher.forEach((g) => {
          const group = g as ApiGroup;
          (group.students || []).forEach((s: ApiStudent) => {
            if (s.status === 'active') studentsForTeacher.push(s);
          });
        });
        const studentsCount = studentsForTeacher.length;
        const groupRevenue = studentsForTeacher.reduce((sum, s) => sum + (s.abonement?.price || 0), 0);
        const total = groupRevenue - teacherPay - expensesShare - commissionsShare - taxesShare;
        return {
          teacherId: teacher.teacherId,
          name: teacher.full_name,
          grade: localTeacher?.grade,
          studentsCount,
          groupRevenue,
          teacherPay,
          expensesShare,
          commissionsShare,
          taxesShare,
          total,
        };
      }

      const groupIds = new Set(
        (groupsForTeacher as Group[]).map((g) => g.groupId)
      );
      const studentsForTeacher = effectiveStudents.filter(
        (s) => s.status === 'Active' && groupIds.has(s.groupId)
      );
      const studentsCount = studentsForTeacher.length;
      const groupRevenue = studentsForTeacher.reduce((sum, s) => sum + toNumber(s.monthlyPrice), 0);
      const total = groupRevenue - teacherPay - expensesShare - commissionsShare - taxesShare;
      return {
        teacherId: teacher.teacherId,
        name: teacher.full_name,
        grade: localTeacher?.grade,
        studentsCount,
        groupRevenue,
        teacherPay,
        expensesShare,
        commissionsShare,
        taxesShare,
        total,
      };
    });
  }, [
    data.teachers,
    effectiveGroups,
    effectiveStudents,
    data.costs,
    revenueComputed,
    dashboardMonth,
    selectedTaxRate,
    selectedTaxFixed,
    globalTrainers,
    dbGroups,
  ]);

  const dashboardDirections = useMemo(() => {
    const directions = Array.from(new Set([...data.students.map((s) => s.direction), ...data.groups.map((g) => g.direction)]));
    return directions.map((direction) => {
      const revenue = revenueComputed
        .filter((r) => r.month === dashboardMonth && r.direction === direction)
        .reduce((sum, r) => sum + r.netRevenue, 0);
      const avgCheckRaw = data.students.filter((s) => s.direction === direction);
      const avgCheck =
        avgCheckRaw.length === 0
          ? 0
          : avgCheckRaw.reduce((sum, s) => sum + toNumber(s.monthlyPrice), 0) / avgCheckRaw.length;
      return {
        direction,
        revenue,
        avgCheck,
        retention: data.inputs.defaultRetention,
      };
    });
  }, [data.students, data.groups, revenueComputed, dashboardMonth, data.inputs.defaultRetention]);

  const teacherNameMap = useMemo(() => {
    const map = new Map<number, string>();
    globalTrainers.forEach((t) => map.set(t.id, t.full_name));
    return map;
  }, [globalTrainers]);

  const groupModelRows = useMemo<GroupModelRow[]>(() => {
    const activeGroups = dbGroups.filter((g) => (g.status || '').toLowerCase() !== 'archived');

    const totalSharedCosts = data.costs
      .filter(
        (c) =>
          c.month === dashboardMonth &&
          (c.groupId === undefined || c.groupId === null) &&
          (c.teacherId === undefined || c.teacherId === null)
      )
      .reduce((sum, c) => sum + toNumber(c.amount), 0);

    const sharedPerGroup = activeGroups.length ? totalSharedCosts / activeGroups.length : 0;

    const teacherMonthlyPay = globalTrainers.reduce<Record<number, number>>((acc, trainer) => {
      const rate = trainer.trainer_rate ?? 0;
      const lessons = trainer.trainer_lessons ?? 0;
      acc[trainer.id] = rate * lessons;
      return acc;
    }, {});

    const groupsPerTeacher = new Map<number, number>();
    activeGroups.forEach((g) => {
      const teacherId = g.trainer_id;
      groupsPerTeacher.set(teacherId, (groupsPerTeacher.get(teacherId) || 0) + 1);
    });

    return activeGroups.map((group) => {
      const groupId = group.id;
      const teacherId = group.trainer_id;
      const groupName = group.name || `Группа #${groupId}`;
      const groupDirection = group.programs?.[0]?.name || 'Без направления';
      const activeStudents = (group.students || []).filter((s: ApiStudent) => s.status === 'active');
      const studentsCount = activeStudents.length;
      const revenue = activeStudents.reduce((sum: number, s: ApiStudent) => sum + (s.abonement?.price || 0), 0);
      const avgCheck = studentsCount ? revenue / studentsCount : 0;

      const directCosts = data.costs
        .filter((c) => c.month === dashboardMonth && c.groupId === groupId)
        .reduce((sum, c) => sum + toNumber(c.amount), 0);

      const teacherOnlyCosts = data.costs
        .filter(
          (c) =>
            c.month === dashboardMonth &&
            c.teacherId === teacherId &&
            (c.groupId === undefined || c.groupId === null)
        )
        .reduce((sum, c) => sum + toNumber(c.amount), 0);

      const teacherGroupsCount = groupsPerTeacher.get(teacherId) || 1;
      const trainerSalaryCost = (teacherMonthlyPay[teacherId] || 0) / teacherGroupsCount;
      const teacherCostShare = teacherOnlyCosts / teacherGroupsCount;
      const totalCosts = trainerSalaryCost + directCosts + teacherCostShare + sharedPerGroup;
      const profit = revenue - totalCosts;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      const breakEvenStudents = avgCheck > 0 ? Math.ceil(totalCosts / avgCheck) : 0;

      return {
        groupId,
        groupName,
        groupDirection,
        teacherId,
        studentsCount,
        avgCheck,
        revenue,
        trainerSalaryCost,
        directCosts: directCosts + teacherCostShare,
        sharedCosts: sharedPerGroup,
        totalCosts,
        profit,
        marginPercent,
        breakEvenStudents,
      };
    });
  }, [dashboardMonth, data.costs, dbGroups, globalTrainers]);

  const trainerModelRows = useMemo<TrainerModelRow[]>(() => {
    const byTeacher = new Map<number, GroupModelRow[]>();
    groupModelRows.forEach((row) => {
      const list = byTeacher.get(row.teacherId) || [];
      list.push(row);
      byTeacher.set(row.teacherId, list);
    });

    const teacherIds = new Set<number>([
      ...globalTrainers.map((t) => t.id),
      ...Array.from(byTeacher.keys()),
    ]);

    return Array.from(teacherIds).map((teacherId) => {
      const rows = byTeacher.get(teacherId) || [];
      const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
      const totalCosts = rows.reduce((sum, row) => sum + row.totalCosts, 0);
      const profit = rows.reduce((sum, row) => sum + row.profit, 0);
      const studentsCount = rows.reduce((sum, row) => sum + row.studentsCount, 0);
      const avgGroupProfit = rows.length ? profit / rows.length : 0;
      return {
        teacherId,
        teacherName: teacherNameMap.get(teacherId) || `Тренер #${teacherId}`,
        groupsCount: rows.length,
        studentsCount,
        revenue,
        totalCosts,
        profit,
        marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
        avgGroupProfit,
      };
    });
  }, [globalTrainers, groupModelRows, teacherNameMap]);

  const trainerFilterOptions = useMemo(
    () => trainerModelRows.map((row) => ({ teacherId: row.teacherId, teacherName: row.teacherName })),
    [trainerModelRows]
  );

  const directionFilterOptions = useMemo(
    () => Array.from(new Set(groupModelRows.map((row) => row.groupDirection))).sort((a, b) => a.localeCompare(b, 'ru')),
    [groupModelRows]
  );

  const filteredGroupModelRows = useMemo(() => {
    return groupModelRows.filter((row) => {
      if (trainerModelTrainerFilter !== 'all' && row.teacherId !== trainerModelTrainerFilter) return false;
      if (trainerModelDirectionFilter !== 'all' && row.groupDirection !== trainerModelDirectionFilter) return false;
      return true;
    });
  }, [groupModelRows, trainerModelDirectionFilter, trainerModelTrainerFilter]);

  const filteredTrainerModelRows = useMemo(() => {
    const grouped = new Map<number, GroupModelRow[]>();
    filteredGroupModelRows.forEach((row) => {
      const list = grouped.get(row.teacherId) || [];
      list.push(row);
      grouped.set(row.teacherId, list);
    });
    return Array.from(grouped.entries()).map(([teacherId, rows]) => {
      const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
      const totalCosts = rows.reduce((sum, row) => sum + row.totalCosts, 0);
      const profit = rows.reduce((sum, row) => sum + row.profit, 0);
      const studentsCount = rows.reduce((sum, row) => sum + row.studentsCount, 0);
      return {
        teacherId,
        teacherName: teacherNameMap.get(teacherId) || `Тренер #${teacherId}`,
        groupsCount: rows.length,
        studentsCount,
        revenue,
        totalCosts,
        profit,
        marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
        avgGroupProfit: rows.length ? profit / rows.length : 0,
      };
    });
  }, [filteredGroupModelRows, teacherNameMap]);

  const trainerModelSummary = useMemo(() => {
    const totalRevenue = filteredTrainerModelRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalProfit = filteredTrainerModelRows.reduce((sum, row) => sum + row.profit, 0);
    const activeGroups = filteredGroupModelRows.length;
    const avgGroupSize = activeGroups
      ? filteredGroupModelRows.reduce((sum, row) => sum + row.studentsCount, 0) / activeGroups
      : 0;
    return {
      totalRevenue,
      totalProfit,
      avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      avgGroupSize,
      activeGroups,
    };
  }, [filteredGroupModelRows, filteredTrainerModelRows]);

  const monthsList = Array.from(
    new Set([...data.revenue.map((r) => r.month), ...data.costs.map((c) => c.month)])
  ).filter(Boolean);

  const [factPnlRows, setFactPnlRows] = useState<FinancePnlRow[]>([]);
  const [factLoading, setFactLoading] = useState(false);
  const [factError, setFactError] = useState<string | null>(null);

  useEffect(() => {
    if (monthsList.length === 0) {
      setFactPnlRows([]);
      return;
    }
    // Берём минимум и максимум по месяцам и грузим P&L академии за этот диапазон
    const sortedMonths = [...monthsList].sort();
    const first = sortedMonths[0]; // YYYY-MM
    const last = sortedMonths[sortedMonths.length - 1]; // YYYY-MM
    const date_from = `${first}-01`;
    const [y, m] = last.split('-').map((v) => Number(v));
    const lastDate = new Date(y || 1970, (m || 1), 0);
    const date_to = lastDate.toISOString().slice(0, 10);

    setFactLoading(true);
    setFactError(null);
    financeApi
      .getPnl({
        target_code: 'academy',
        date_from,
        date_to,
        group_by: 'month',
      })
      .then((rows) => setFactPnlRows(rows))
      .catch((err: any) => {
        setFactError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить факт P&L из журнала');
        setFactPnlRows([]);
      })
      .finally(() => setFactLoading(false));
  }, [monthsList.join(',')]);

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Финансовая модель
        </Typography>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={1}>
            <Typography>Модель редактируется прямо в интерфейсе. Данные сохраняются в браузере.</Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                onClick={() => {
                  setData(defaultData);
                  setDashboardMonth('2026-01');
                }}
              >
                Сбросить к шаблону
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  if (
                    !window.confirm(
                      'Очистить финансовую модель? Будут удалены все статьи, выручка, затраты, группы и ученики, сохранённые в этом браузере.'
                    )
                  ) {
                    return;
                  }
                  setData({
                    ...defaultData,
                    categories: [],
                    students: [],
                    groups: [],
                    teachers: [],
                    revenue: [],
                    costs: [],
                  });
                }}
              >
                Очистить модель
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Ввод данных (доходы / расходы)
          </Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Дата"
                type="date"
                size="small"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Тип</InputLabel>
                <Select label="Тип" value={entryType} onChange={(e) => setEntryType(e.target.value as 'income' | 'expense')}>
                  <MenuItem value="income">Доход</MenuItem>
                  <MenuItem value="expense">Расход</MenuItem>
                </Select>
              </FormControl>
              {entryType === 'expense' && (
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Категория</InputLabel>
                  <Select
                    label="Категория"
                    value={entryCategoryType}
                    onChange={(e) => setEntryCategoryType(e.target.value as 'Variable' | 'Fixed')}
                  >
                    <MenuItem value="Variable">Переменные</MenuItem>
                    <MenuItem value="Fixed">Постоянные</MenuItem>
                  </Select>
                </FormControl>
              )}
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Autocomplete
                options={categoryOptions}
                value={entryCategory}
                onChange={(_, value) => setEntryCategory(value || '')}
                renderInput={(params) => (
                  <TextField {...params} size="small" label="Статья" placeholder="Начните ввод" />
                )}
                sx={{ minWidth: 260 }}
              />
              <TextField
                label="Сумма"
                size="small"
                type="number"
                value={entryAmount}
                onChange={(e) => setEntryAmount(toNumber(e.target.value))}
              />
              <Button variant="contained" onClick={handleAddEntry}>
                Добавить
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Tabs value={sheetIndex} onChange={(_, v) => setSheetIndex(v)} variant="scrollable">
            {[
              'Параметры',
              'Ставки налогов',
              'Статьи',
              'Выручка',
              'Затраты',
              'Прибыли и убытки',
              'План / Факт (Академия)',
              'Дашборд',
              'Финансовая модель по тренерам',
              'Операции по расходам и доходам',
            ].map((label) => (
              <Tab key={label} label={label} />
            ))}
          </Tabs>
        </Paper>

        {sheetIndex === 0 && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Параметры
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Налоговый режим</TableCell>
                  <TableCell>Эквайринг, %</TableCell>
                  <TableCell>Эквайринг, фикс</TableCell>
                  <TableCell>Уроков в абонементе</TableCell>
                  <TableCell>Длительность урока (ч)</TableCell>
                  <TableCell>Коэффициент удержания</TableCell>
                  <TableCell>Скидка по умолчанию</TableCell>
                  <TableCell>Ставка налога</TableCell>
                  <TableCell>Фикс. налог в месяц</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Tax</InputLabel>
                      <Select
                        value={data.inputs.selectedTax}
                        label="Tax"
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            inputs: { ...prev.inputs, selectedTax: String(e.target.value) },
                          }))
                        }
                      >
                        {data.taxRates.map((rate) => (
                          <MenuItem key={rate.taxName} value={rate.taxName}>
                            {rate.taxName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  {(
                    [
                      ['acquiringPercent', data.inputs.acquiringPercent],
                      ['acquiringFixed', data.inputs.acquiringFixed],
                      ['defaultAbonementLessons', data.inputs.defaultAbonementLessons],
                      ['defaultLessonHours', data.inputs.defaultLessonHours],
                      ['defaultRetention', data.inputs.defaultRetention],
                      ['defaultDiscount', data.inputs.defaultDiscount],
                    ] as Array<[keyof Inputs, number]>
                  ).map(([key, value]) => (
                    <TableCell key={key}>
                      <TextField
                        size="small"
                        type="number"
                        value={value}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            inputs: { ...prev.inputs, [key]: toNumber(e.target.value) },
                          }))
                        }
                      />
                    </TableCell>
                  ))}
                  <TableCell>{selectedTaxRate}</TableCell>
                  <TableCell>{selectedTaxFixed}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Сезонный коэффициент
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => (
                    <TableCell key={m}>{m}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  {data.inputs.seasonality.map((value, idx) => (
                    <TableCell key={idx}>
                      <TextField
                        size="small"
                        type="number"
                        value={value}
                        onChange={(e) =>
                          setData((prev) => {
                            const seasonality = [...prev.inputs.seasonality];
                            seasonality[idx] = toNumber(e.target.value);
                            return { ...prev, inputs: { ...prev.inputs, seasonality } };
                          })
                        }
                      />
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 1 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Ставки налогов</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    taxRates: [...prev.taxRates, { taxName: '', taxPercent: 0, taxFixedMonthly: 0 }],
                  }))
                }
              >
                Добавить
              </Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Режим</TableCell>
                  <TableCell>Ставка (%)</TableCell>
                  <TableCell>Фикс. сумма в месяц</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.taxRates.map((rate, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <TextField
                        size="small"
                        value={rate.taxName}
                        onChange={(e) =>
                          setData((prev) => {
                            const taxRates = [...prev.taxRates];
                            taxRates[idx] = { ...taxRates[idx], taxName: e.target.value };
                            return { ...prev, taxRates };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={rate.taxPercent}
                        onChange={(e) =>
                          setData((prev) => {
                            const taxRates = [...prev.taxRates];
                            taxRates[idx] = { ...taxRates[idx], taxPercent: toNumber(e.target.value) };
                            return { ...prev, taxRates };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={rate.taxFixedMonthly}
                        onChange={(e) =>
                          setData((prev) => {
                            const taxRates = [...prev.taxRates];
                            taxRates[idx] = { ...taxRates[idx], taxFixedMonthly: toNumber(e.target.value) };
                            return { ...prev, taxRates };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="error"
                        onClick={() =>
                          setData((prev) => ({
                            ...prev,
                            taxRates: prev.taxRates.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 2 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Статьи (доходы / расходы)</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    categories: [
                      ...prev.categories,
                      { id: Date.now(), name: '', type: 'income' },
                    ],
                  }))
                }
              >
                Добавить
              </Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell>Тип</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.categories.map((cat, idx) => (
                  <TableRow key={cat.id}>
                    <TableCell>
                      <TextField
                        size="small"
                        value={cat.name}
                        onChange={(e) =>
                          setData((prev) => {
                            const categories = [...prev.categories];
                            categories[idx] = { ...categories[idx], name: e.target.value };
                            return { ...prev, categories };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={cat.type}
                        onChange={(e) =>
                          setData((prev) => {
                            const categories = [...prev.categories];
                            categories[idx] = { ...categories[idx], type: e.target.value as 'income' | 'expense' };
                            return { ...prev, categories };
                          })
                        }
                      >
                        <MenuItem value="income">Доход</MenuItem>
                        <MenuItem value="expense">Расход</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="error"
                        onClick={() =>
                          setData((prev) => ({
                            ...prev,
                            categories: prev.categories.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 3 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Выручка</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    revenue: [...prev.revenue, { month: '', groupId: 0, direction: '', discount: prev.inputs.defaultDiscount }],
                  }))
                }
              >
                Добавить
              </Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Месяц</TableCell>
                  <TableCell>ID группы</TableCell>
                  <TableCell>Направление</TableCell>
                  <TableCell>Статья</TableCell>
                  <TableCell>Активных учеников</TableCell>
                  <TableCell>Цена за ученика</TableCell>
                  <TableCell>Скидка</TableCell>
                  <TableCell>Сумма вручную</TableCell>
                  <TableCell>Выручка (gross)</TableCell>
                  <TableCell>Выручка (net)</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {revenueComputed.map((row, idx) => (
                  <TableRow key={`${row.month}-${idx}`}>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.month}
                        placeholder="YYYY-MM"
                        onChange={(e) =>
                          setData((prev) => {
                            const revenue = [...prev.revenue];
                            revenue[idx] = { ...revenue[idx], month: e.target.value };
                            return { ...prev, revenue };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={row.groupId}
                        onChange={(e) =>
                          setData((prev) => {
                            const revenue = [...prev.revenue];
                            revenue[idx] = { ...revenue[idx], groupId: toNumber(e.target.value) };
                            return { ...prev, revenue };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.direction}
                        onChange={(e) =>
                          setData((prev) => {
                            const revenue = [...prev.revenue];
                            revenue[idx] = { ...revenue[idx], direction: e.target.value };
                            return { ...prev, revenue };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.category || ''}
                        onChange={(e) =>
                          setData((prev) => {
                            const revenue = [...prev.revenue];
                            revenue[idx] = { ...revenue[idx], category: e.target.value };
                            return { ...prev, revenue };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>{row.activeStudents}</TableCell>
                    <TableCell>{row.pricePerStudent.toFixed(2)}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={row.discount}
                        onChange={(e) =>
                          setData((prev) => {
                            const revenue = [...prev.revenue];
                            revenue[idx] = { ...revenue[idx], discount: toNumber(e.target.value) };
                            return { ...prev, revenue };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={row.manualAmount ?? ''}
                        onChange={(e) =>
                          setData((prev) => {
                            const revenue = [...prev.revenue];
                            const next = e.target.value === '' ? undefined : toNumber(e.target.value);
                            revenue[idx] = { ...revenue[idx], manualAmount: next };
                            return { ...prev, revenue };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>{row.grossRevenue.toFixed(2)}</TableCell>
                    <TableCell>{row.netRevenue.toFixed(2)}</TableCell>
                    <TableCell>
                      <IconButton
                        color="error"
                        onClick={() =>
                          setData((prev) => ({
                            ...prev,
                            revenue: prev.revenue.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 4 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Затраты</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    costs: [
                      ...prev.costs,
                      { month: '', category: 'Variable', subcategory: '', amount: 0, groupId: undefined, teacherId: undefined },
                    ],
                  }))
                }
              >
                Добавить
              </Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Месяц</TableCell>
                  <TableCell>Категория</TableCell>
                  <TableCell>Подкатегория</TableCell>
                  <TableCell>Сумма</TableCell>
                  <TableCell>ID группы</TableCell>
                  <TableCell>ID тренера</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.costs.map((cost, idx) => (
                  <TableRow key={`${cost.month}-${idx}`}>
                    <TableCell>
                      <TextField
                        size="small"
                        value={cost.month}
                        placeholder="YYYY-MM"
                        onChange={(e) =>
                          setData((prev) => {
                            const costs = [...prev.costs];
                            costs[idx] = { ...costs[idx], month: e.target.value };
                            return { ...prev, costs };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={cost.category}
                        onChange={(e) =>
                          setData((prev) => {
                            const costs = [...prev.costs];
                            costs[idx] = { ...costs[idx], category: e.target.value as CostRow['category'] };
                            return { ...prev, costs };
                          })
                        }
                      >
                        <MenuItem value="Variable">Переменные</MenuItem>
                        <MenuItem value="Fixed">Постоянные</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={cost.subcategory}
                        onChange={(e) =>
                          setData((prev) => {
                            const costs = [...prev.costs];
                            costs[idx] = { ...costs[idx], subcategory: e.target.value };
                            return { ...prev, costs };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={cost.amount}
                        onChange={(e) =>
                          setData((prev) => {
                            const costs = [...prev.costs];
                            costs[idx] = { ...costs[idx], amount: toNumber(e.target.value) };
                            return { ...prev, costs };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={cost.groupId ?? ''}
                        onChange={(e) =>
                          setData((prev) => {
                            const costs = [...prev.costs];
                            costs[idx] = { ...costs[idx], groupId: toNumber(e.target.value) || undefined };
                            return { ...prev, costs };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={cost.teacherId ?? ''}
                        onChange={(e) =>
                          setData((prev) => {
                            const costs = [...prev.costs];
                            costs[idx] = { ...costs[idx], teacherId: toNumber(e.target.value) || undefined };
                            return { ...prev, costs };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="error"
                        onClick={() =>
                          setData((prev) => ({
                            ...prev,
                            costs: prev.costs.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 5 && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Прибыли и убытки (P&L)
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Месяц</TableCell>
                  <TableCell>Выручка</TableCell>
                  <TableCell>Себестоимость (COGS)</TableCell>
                  <TableCell>Валовая прибыль</TableCell>
                  <TableCell>Операционные расходы (Opex)</TableCell>
                  <TableCell>EBITDA</TableCell>
                  <TableCell>Налоги</TableCell>
                  <TableCell>Чистая прибыль</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pnlRows.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell>{row.revenue.toFixed(2)}</TableCell>
                    <TableCell>{row.cogs.toFixed(2)}</TableCell>
                    <TableCell>{row.grossProfit.toFixed(2)}</TableCell>
                    <TableCell>{row.opex.toFixed(2)}</TableCell>
                    <TableCell>{row.ebitda.toFixed(2)}</TableCell>
                    <TableCell>{row.taxes.toFixed(2)}</TableCell>
                    <TableCell>{row.netProfit.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 6 && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              План / Факт по Академии (P&L по месяцам)
            </Typography>
            {factError && (
              <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                {factError}
              </Typography>
            )}
            {factLoading && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Загрузка фактических данных из журнала…
              </Typography>
            )}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Месяц</TableCell>
                  <TableCell align="right">План: Выручка</TableCell>
                  <TableCell align="right">План: COGS</TableCell>
                  <TableCell align="right">План: Opex</TableCell>
                  <TableCell align="right">План: Чистая прибыль</TableCell>
                  <TableCell align="right">Факт: Выручка</TableCell>
                  <TableCell align="right">Факт: Расходы</TableCell>
                  <TableCell align="right">Факт: Прибыль</TableCell>
                  <TableCell align="right">Δ Прибыль</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pnlRows.map((planRow) => {
                  const factRow = factPnlRows.find((f) => f.period === planRow.month);
                  const factRevenue = factRow?.income ?? 0;
                  const factExpense = factRow?.expense ?? 0;
                  const factProfit = (factRow?.profit ?? (factRevenue - factExpense)) || 0;
                  const deltaProfit = factProfit - planRow.netProfit;
                  return (
                    <TableRow key={planRow.month}>
                      <TableCell>{planRow.month}</TableCell>
                      <TableCell align="right">{planRow.revenue.toFixed(2)}</TableCell>
                      <TableCell align="right">{planRow.cogs.toFixed(2)}</TableCell>
                      <TableCell align="right">{planRow.opex.toFixed(2)}</TableCell>
                      <TableCell align="right">{planRow.netProfit.toFixed(2)}</TableCell>
                      <TableCell align="right">{factRevenue.toFixed(2)}</TableCell>
                      <TableCell align="right">{factExpense.toFixed(2)}</TableCell>
                      <TableCell align="right">{factProfit.toFixed(2)}</TableCell>
                      <TableCell
                        align="right"
                        sx={{ color: deltaProfit >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
                      >
                        {deltaProfit >= 0 ? '+' : ''}
                        {deltaProfit.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 9 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Дашборд</Typography>
              <FormControl size="small">
                <InputLabel>Месяц</InputLabel>
                <Select
                  label="Месяц"
                  value={dashboardMonth}
                  onChange={(e) => setDashboardMonth(String(e.target.value))}
                >
                  {monthsList.map((month) => (
                    <MenuItem key={month} value={month}>
                      {month}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Сводка
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Выручка</TableCell>
                  <TableCell>Себестоимость (COGS)</TableCell>
                  <TableCell>Операционные расходы (Opex)</TableCell>
                  <TableCell>Чистая прибыль</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{dashboardSummary.revenue.toFixed(2)}</TableCell>
                  <TableCell>{dashboardSummary.cogs.toFixed(2)}</TableCell>
                  <TableCell>{dashboardSummary.opex.toFixed(2)}</TableCell>
                  <TableCell>{dashboardSummary.netProfit.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              По группам
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Формулы: Прямые затраты = расходы из `Затраты` по `groupId` + доля расходов по `teacherId` (если без `groupId`).
              Доля общих затрат = расходы из `Затраты` без `groupId` и `teacherId`, распределенные поровну на активные группы.
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>ID группы</TableCell>
                  <TableCell>Выручка</TableCell>
                  <TableCell>Затраты тренера</TableCell>
                  <TableCell>Переменные затраты группы</TableCell>
                  <TableCell>Прибыль группы</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dashboardGroups.map((row) => (
                  <TableRow key={row.groupId}>
                    <TableCell>{row.groupId}</TableCell>
                    <TableCell>{row.revenue.toFixed(2)}</TableCell>
                    <TableCell>{row.teacherCost.toFixed(2)}</TableCell>
                    <TableCell>{row.groupVariableCosts.toFixed(2)}</TableCell>
                    <TableCell>{row.profit.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Расчеты по тренерам
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Тренер</TableCell>
                  <TableCell>Количество учеников</TableCell>
                  <TableCell>Выручка группы</TableCell>
                  <TableCell>Оплата тренера</TableCell>
                  <TableCell>Расходы</TableCell>
                  <TableCell>Комиссии</TableCell>
                  <TableCell>Налоги</TableCell>
                  <TableCell>Итог</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dashboardTeachers.map((row) => (
                  <TableRow key={row.teacherId}>
                  <TableCell>
                    {row.name || row.teacherId} {row.grade ? `(${row.grade})` : ''}
                  </TableCell>
                    <TableCell>{row.studentsCount}</TableCell>
                    <TableCell>{row.groupRevenue.toFixed(2)}</TableCell>
                    <TableCell>{row.teacherPay.toFixed(2)}</TableCell>
                    <TableCell>{row.expensesShare.toFixed(2)}</TableCell>
                    <TableCell>{row.commissionsShare.toFixed(2)}</TableCell>
                    <TableCell>{row.taxesShare.toFixed(2)}</TableCell>
                    <TableCell
                      sx={{
                        color: row.total >= 0 ? 'success.main' : 'error.main',
                        fontWeight: 600,
                      }}
                    >
                      {row.total.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              По направлениям
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Направление</TableCell>
                  <TableCell>Выручка</TableCell>
                  <TableCell>Средний чек</TableCell>
                  <TableCell>Коэф. удержания</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dashboardDirections.map((row) => (
                  <TableRow key={row.direction}>
                    <TableCell>{row.direction}</TableCell>
                    <TableCell>{row.revenue.toFixed(2)}</TableCell>
                    <TableCell>{row.avgCheck.toFixed(2)}</TableCell>
                    <TableCell>{(row.retention * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {sheetIndex === 7 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
              <Typography variant="h6">Финансовая модель по тренерам</Typography>
              <FormControl size="small">
                <InputLabel>Месяц</InputLabel>
                <Select
                  label="Месяц"
                  value={dashboardMonth}
                  onChange={(e) => setDashboardMonth(String(e.target.value))}
                >
                  {monthsList.map((month) => (
                    <MenuItem key={month} value={month}>
                      {month}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>Тренер</InputLabel>
                <Select
                  label="Тренер"
                  value={trainerModelTrainerFilter}
                  onChange={(e) => setTrainerModelTrainerFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <MenuItem value="all">Все тренеры</MenuItem>
                  {trainerFilterOptions.map((trainer) => (
                    <MenuItem key={trainer.teacherId} value={trainer.teacherId}>
                      {trainer.teacherName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Направление</InputLabel>
                <Select
                  label="Направление"
                  value={trainerModelDirectionFilter}
                  onChange={(e) => setTrainerModelDirectionFilter(String(e.target.value))}
                >
                  <MenuItem value="all">Все направления</MenuItem>
                  {directionFilterOptions.map((direction) => (
                    <MenuItem key={direction} value={direction}>
                      {direction}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Ключевые показатели
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Активных групп</TableCell>
                  <TableCell>Средний размер группы</TableCell>
                  <TableCell>Общая выручка</TableCell>
                  <TableCell>Общая прибыль</TableCell>
                  <TableCell>Средняя маржинальность</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{trainerModelSummary.activeGroups}</TableCell>
                  <TableCell>{trainerModelSummary.avgGroupSize.toFixed(1)}</TableCell>
                  <TableCell>{trainerModelSummary.totalRevenue.toFixed(2)} ₽</TableCell>
                  <TableCell>{trainerModelSummary.totalProfit.toFixed(2)} ₽</TableCell>
                  <TableCell>{trainerModelSummary.avgMargin.toFixed(1)}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              По группам
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Группа</TableCell>
                  <TableCell>Направление</TableCell>
                  <TableCell>Тренер</TableCell>
                  <TableCell>Учеников</TableCell>
                  <TableCell>Средний чек</TableCell>
                  <TableCell>Выручка</TableCell>
                  <TableCell>Зарплата тренера</TableCell>
                  <TableCell>Прямые затраты</TableCell>
                  <TableCell>Доля общих затрат</TableCell>
                  <TableCell>Прибыль группы</TableCell>
                  <TableCell>Маржинальность</TableCell>
                  <TableCell>Точка безубыт. (учеников)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredGroupModelRows.map((row) => (
                  <TableRow key={row.groupId}>
                    <TableCell>{row.groupName}</TableCell>
                    <TableCell>{row.groupDirection}</TableCell>
                    <TableCell>{teacherNameMap.get(row.teacherId) || row.teacherId}</TableCell>
                    <TableCell>{row.studentsCount}</TableCell>
                    <TableCell>{row.avgCheck.toFixed(2)} ₽</TableCell>
                    <TableCell>{row.revenue.toFixed(2)} ₽</TableCell>
                    <TableCell>{row.trainerSalaryCost.toFixed(2)} ₽</TableCell>
                    <TableCell>{row.directCosts.toFixed(2)} ₽</TableCell>
                    <TableCell>{row.sharedCosts.toFixed(2)} ₽</TableCell>
                    <TableCell sx={{ color: row.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                      {row.profit.toFixed(2)} ₽
                    </TableCell>
                    <TableCell>{row.marginPercent.toFixed(1)}%</TableCell>
                    <TableCell>{row.breakEvenStudents}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              По тренерам
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Тренер</TableCell>
                  <TableCell>Групп</TableCell>
                  <TableCell>Учеников</TableCell>
                  <TableCell>Выручка</TableCell>
                  <TableCell>Затраты</TableCell>
                  <TableCell>Прибыль тренера</TableCell>
                  <TableCell>Маржинальность</TableCell>
                  <TableCell>Средняя прибыль на группу</TableCell>
                  <TableCell>Статус</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTrainerModelRows.map((row) => (
                  <TableRow key={row.teacherId}>
                    <TableCell>{row.teacherName}</TableCell>
                    <TableCell>{row.groupsCount}</TableCell>
                    <TableCell>{row.studentsCount}</TableCell>
                    <TableCell>{row.revenue.toFixed(2)} ₽</TableCell>
                    <TableCell>{row.totalCosts.toFixed(2)} ₽</TableCell>
                    <TableCell sx={{ color: row.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                      {row.profit.toFixed(2)} ₽
                    </TableCell>
                    <TableCell>{row.marginPercent.toFixed(1)}%</TableCell>
                    <TableCell>{row.avgGroupProfit.toFixed(2)} ₽</TableCell>
                    <TableCell
                      sx={{
                        color:
                          row.marginPercent >= 50 ? 'success.main' : row.marginPercent >= 40 ? 'warning.main' : 'error.main',
                        fontWeight: 600,
                      }}
                    >
                      {row.marginPercent >= 50 ? 'Отлично' : row.marginPercent >= 40 ? 'Норма' : 'Риск'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Typography variant="body2" color="text.secondary">
              Управленческий ориентир: маржинальность ниже 40% требует оптимизации (цены, загрузка, затраты).
              Диапазон 50-60% считается здоровым, 70%+ указывает на хорошо масштабируемую модель.
            </Typography>
          </Paper>
        )}

        {sheetIndex === 8 && (
          <AcademyOperationsTab />
        )}
      </Box>
    </Layout>
  );
};

export default FinancialModelPage;

