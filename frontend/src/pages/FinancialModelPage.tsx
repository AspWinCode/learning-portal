import React, { useMemo, useState, useEffect } from 'react';
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
  const [entryGroupId, setEntryGroupId] = useState<number | ''>('');
  const [entryTeacherId, setEntryTeacherId] = useState<number | ''>('');
  const [entryDirection, setEntryDirection] = useState<string>('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

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
            groupId: typeof entryGroupId === 'number' ? entryGroupId : 0,
            direction: entryDirection,
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
            groupId: typeof entryGroupId === 'number' ? entryGroupId : undefined,
            teacherId: typeof entryTeacherId === 'number' ? entryTeacherId : undefined,
          },
        ],
      }));
    }

    setEntryCategory('');
    setEntryAmount(0);
    setEntryGroupId('');
    setEntryTeacherId('');
    setEntryDirection('');
  };

  const groupCurrentStudents = useMemo(() => {
    const counts = new Map<number, number>();
    data.students.forEach((student) => {
      if (student.status !== 'Active') return;
      counts.set(student.groupId, (counts.get(student.groupId) || 0) + 1);
    });
    return counts;
  }, [data.students]);

  const revenueComputed = useMemo(() => {
    return data.revenue.map((row) => {
      const isManual = typeof row.manualAmount === 'number' && row.manualAmount > 0;
      const monthEnd = parseMonthEnd(row.month);
      const activeStudents = data.students.filter((s) => {
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
  }, [data.revenue, data.students, data.inputs]);

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

    return data.teachers.map((teacher) => {
      const groupsForTeacher = data.groups.filter((g) => g.teacherId === teacher.teacherId);
      const groupIds = new Set(groupsForTeacher.map((g) => g.groupId));
      const studentsForTeacher = data.students.filter(
        (s) => s.status === 'Active' && groupIds.has(s.groupId)
      );
      const studentsCount = studentsForTeacher.length;
      const groupRevenue = studentsForTeacher.reduce((sum, s) => sum + toNumber(s.monthlyPrice), 0);
      const teacherPay = 0;
      const total = groupRevenue - teacherPay - expensesShare - commissionsShare - taxesShare;
      return {
        teacherId: teacher.teacherId,
        grade: teacher.grade,
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
    data.groups,
    data.students,
    data.costs,
    revenueComputed,
    dashboardMonth,
    selectedTaxRate,
    selectedTaxFixed,
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

  const monthsList = Array.from(new Set(data.revenue.map((r) => r.month))).filter(Boolean);

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
                    <MenuItem value="Variable">Variable</MenuItem>
                    <MenuItem value="Fixed">Fixed</MenuItem>
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
              <TextField
                label="GroupID"
                size="small"
                type="number"
                value={entryGroupId}
                onChange={(e) => setEntryGroupId(e.target.value === '' ? '' : toNumber(e.target.value))}
              />
              <TextField
                label="TeacherID"
                size="small"
                type="number"
                value={entryTeacherId}
                onChange={(e) => setEntryTeacherId(e.target.value === '' ? '' : toNumber(e.target.value))}
              />
              <TextField
                label="Direction"
                size="small"
                value={entryDirection}
                onChange={(e) => setEntryDirection(e.target.value)}
              />
              <Button variant="contained" onClick={handleAddEntry}>
                Добавить
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Tabs value={sheetIndex} onChange={(_, v) => setSheetIndex(v)} variant="scrollable">
            {['Inputs', 'TaxRates', 'Статьи', 'Students', 'Groups', 'Teachers', 'Revenue', 'Costs', 'P&L', 'Dashboard'].map(
              (label) => (
                <Tab key={label} label={label} />
              )
            )}
          </Tabs>
        </Paper>

        {sheetIndex === 0 && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Inputs
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>SelectedTax</TableCell>
                  <TableCell>AcquiringPercent</TableCell>
                  <TableCell>AcquiringFixed</TableCell>
                  <TableCell>DefaultAbonementLessons</TableCell>
                  <TableCell>DefaultLessonHours</TableCell>
                  <TableCell>DefaultRetention</TableCell>
                  <TableCell>DefaultDiscount</TableCell>
                  <TableCell>SelectedTaxRate</TableCell>
                  <TableCell>SelectedTaxFixed</TableCell>
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
              SeasonalityMultiplier
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
              <Typography variant="h6">TaxRates</Typography>
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
                  <TableCell>TaxName</TableCell>
                  <TableCell>TaxPercent</TableCell>
                  <TableCell>TaxFixedMonthly</TableCell>
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
              <Typography variant="h6">Students</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    students: [
                      ...prev.students,
                      {
                        studentId: Date.now(),
                        startDate: '',
                        direction: '',
                        groupId: 0,
                        teacherId: 0,
                        monthlyPrice: 0,
                        discountPercent: 0,
                        status: 'Active',
                        paymentMonths: 1,
                        isAnnual: false,
                      },
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
                  <TableCell>StudentID</TableCell>
                  <TableCell>StartDate</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell>GroupID</TableCell>
                  <TableCell>TeacherID</TableCell>
                  <TableCell>MonthlyPrice</TableCell>
                  <TableCell>DiscountPercent</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>PaymentMonths</TableCell>
                  <TableCell>IsAnnual</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.students.map((student, idx) => (
                  <TableRow key={student.studentId}>
                    {(
                      [
                        ['studentId', student.studentId],
                        ['startDate', student.startDate],
                        ['direction', student.direction],
                        ['groupId', student.groupId],
                        ['teacherId', student.teacherId],
                        ['monthlyPrice', student.monthlyPrice],
                        ['discountPercent', student.discountPercent],
                        ['status', student.status],
                        ['paymentMonths', student.paymentMonths],
                        ['isAnnual', student.isAnnual ? 'true' : 'false'],
                      ] as Array<[keyof Student, string | number | boolean]>
                    ).map(([key, value]) => (
                      <TableCell key={key}>
                        <TextField
                          size="small"
                          value={value}
                          onChange={(e) =>
                            setData((prev) => {
                              const students = [...prev.students];
                              const raw = e.target.value;
                              const nextValue =
                                key === 'isAnnual'
                                  ? raw === 'true' || raw === '1'
                                  : ['studentId', 'groupId', 'teacherId', 'monthlyPrice', 'discountPercent', 'paymentMonths'].includes(
                                      key
                                    )
                                  ? toNumber(raw)
                                  : raw;
                              students[idx] = { ...students[idx], [key]: nextValue } as Student;
                              return { ...prev, students };
                            })
                          }
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <IconButton
                        color="error"
                        onClick={() =>
                          setData((prev) => ({
                            ...prev,
                            students: prev.students.filter((_, i) => i !== idx),
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
              <Typography variant="h6">Groups</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    groups: [
                      ...prev.groups,
                      {
                        groupId: Date.now(),
                        direction: '',
                        teacherId: 0,
                        lessonHours: data.inputs.defaultLessonHours,
                        lessonsPerMonth: data.inputs.defaultAbonementLessons,
                        maxCapacity: 0,
                        groupStatus: 'Active',
                      },
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
                  <TableCell>GroupID</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell>TeacherID</TableCell>
                  <TableCell>LessonHours</TableCell>
                  <TableCell>LessonsPerMonth</TableCell>
                  <TableCell>MaxCapacity</TableCell>
                  <TableCell>CurrentStudents</TableCell>
                  <TableCell>GroupStatus</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.groups.map((group, idx) => (
                  <TableRow key={group.groupId}>
                    <TableCell>{group.groupId}</TableCell>
                    {(
                      [
                        ['direction', group.direction],
                        ['teacherId', group.teacherId],
                        ['lessonHours', group.lessonHours],
                        ['lessonsPerMonth', group.lessonsPerMonth],
                        ['maxCapacity', group.maxCapacity],
                      ] as Array<[keyof Group, string | number]>
                    ).map(([key, value]) => (
                      <TableCell key={key}>
                        <TextField
                          size="small"
                          value={value}
                          onChange={(e) =>
                            setData((prev) => {
                              const groups = [...prev.groups];
                              const nextValue = ['teacherId', 'lessonHours', 'lessonsPerMonth', 'maxCapacity'].includes(key)
                                ? toNumber(e.target.value)
                                : e.target.value;
                              groups[idx] = { ...groups[idx], [key]: nextValue } as Group;
                              return { ...prev, groups };
                            })
                          }
                        />
                      </TableCell>
                    ))}
                    <TableCell>{groupCurrentStudents.get(group.groupId) || 0}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={group.groupStatus}
                        onChange={(e) =>
                          setData((prev) => {
                            const groups = [...prev.groups];
                            groups[idx] = { ...groups[idx], groupStatus: e.target.value };
                            return { ...prev, groups };
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
                            groups: prev.groups.filter((_, i) => i !== idx),
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
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Teachers</Typography>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    teachers: [...prev.teachers, { teacherId: Date.now(), grade: '', ratePerHour: 0, bonusPerStudent: 0 }],
                  }))
                }
              >
                Добавить
              </Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>TeacherID</TableCell>
                  <TableCell>Grade</TableCell>
                  <TableCell>RatePerHour</TableCell>
                  <TableCell>BonusPerStudent</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.teachers.map((teacher, idx) => (
                  <TableRow key={teacher.teacherId}>
                    <TableCell>{teacher.teacherId}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={teacher.grade}
                        onChange={(e) =>
                          setData((prev) => {
                            const teachers = [...prev.teachers];
                            teachers[idx] = { ...teachers[idx], grade: e.target.value };
                            return { ...prev, teachers };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={teacher.ratePerHour}
                        onChange={(e) =>
                          setData((prev) => {
                            const teachers = [...prev.teachers];
                            teachers[idx] = { ...teachers[idx], ratePerHour: toNumber(e.target.value) };
                            return { ...prev, teachers };
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={teacher.bonusPerStudent}
                        onChange={(e) =>
                          setData((prev) => {
                            const teachers = [...prev.teachers];
                            teachers[idx] = { ...teachers[idx], bonusPerStudent: toNumber(e.target.value) };
                            return { ...prev, teachers };
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
                            teachers: prev.teachers.filter((_, i) => i !== idx),
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

        {sheetIndex === 6 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Revenue</Typography>
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
                  <TableCell>Month</TableCell>
                  <TableCell>GroupID</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>ActiveStudents</TableCell>
                  <TableCell>PricePerStudent</TableCell>
                  <TableCell>Discount</TableCell>
                  <TableCell>ManualAmount</TableCell>
                  <TableCell>GrossRevenue</TableCell>
                  <TableCell>NetRevenue</TableCell>
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

        {sheetIndex === 7 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Costs</Typography>
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
                  <TableCell>Month</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Subcategory</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>GroupID</TableCell>
                  <TableCell>TeacherID</TableCell>
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
                        <MenuItem value="Variable">Variable</MenuItem>
                        <MenuItem value="Fixed">Fixed</MenuItem>
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

        {sheetIndex === 8 && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              P&amp;L
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell>Revenue</TableCell>
                  <TableCell>COGS</TableCell>
                  <TableCell>Gross Profit</TableCell>
                  <TableCell>Opex</TableCell>
                  <TableCell>EBITDA</TableCell>
                  <TableCell>Taxes</TableCell>
                  <TableCell>Net Profit</TableCell>
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

        {sheetIndex === 9 && (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Dashboard</Typography>
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
              Summary
            </Typography>
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Revenue</TableCell>
                  <TableCell>COGS</TableCell>
                  <TableCell>Opex</TableCell>
                  <TableCell>Net Profit</TableCell>
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
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>GroupID</TableCell>
                  <TableCell>Revenue</TableCell>
                  <TableCell>TeacherCost</TableCell>
                  <TableCell>GroupVariableCosts</TableCell>
                  <TableCell>GroupProfit</TableCell>
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
                      {row.teacherId} {row.grade ? `(${row.grade})` : ''}
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
                  <TableCell>Direction</TableCell>
                  <TableCell>Revenue</TableCell>
                  <TableCell>AvgCheck</TableCell>
                  <TableCell>Retention</TableCell>
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
      </Box>
    </Layout>
  );
};

export default FinancialModelPage;

