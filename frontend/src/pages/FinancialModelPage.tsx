import React from 'react';
import Layout from '../components/Layout';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
} from '@mui/material';
import * as XLSX from 'xlsx';

const SHEET_NAMES = [
  'Inputs',
  'TaxRates',
  'Students',
  'Groups',
  'Teachers',
  'Revenue',
  'Costs',
  'P&L',
  'Dashboard',
];

const setFormula = (ws: any, cell: string, formula: string) => {
  ws[cell] = { t: 'n', f: formula };
};

const buildWorkbook = () => {
  const wb = XLSX.utils.book_new();

  // 1) Inputs
  const inputsData: any[][] = [
    [
      { t: 's', v: 'SelectedTax' },
      { t: 's', v: 'AcquiringPercent' },
      { t: 's', v: 'AcquiringFixed' },
      { t: 's', v: 'DefaultAbonementLessons' },
      { t: 's', v: 'DefaultLessonHours' },
      { t: 's', v: 'DefaultRetention' },
      { t: 's', v: 'DefaultDiscount' },
      { t: 's', v: 'SelectedTaxRate' },
      { t: 's', v: 'SelectedTaxFixed' },
    ],
    [
      { t: 's', v: 'ИП Патент' },
      { t: 'n', v: 0.02 },
      { t: 'n', v: 10 },
      { t: 'n', v: 8 },
      { t: 'n', v: 1 },
      { t: 'n', v: 0.95 },
      { t: 'n', v: 0 },
      { t: 'n', v: 0 },
      { t: 'n', v: 0 },
    ],
    [],
    [
      { t: 's', v: 'SeasonalityMultiplier' },
      { t: 's', v: 'Jan' },
      { t: 's', v: 'Feb' },
      { t: 's', v: 'Mar' },
      { t: 's', v: 'Apr' },
      { t: 's', v: 'May' },
      { t: 's', v: 'Jun' },
      { t: 's', v: 'Jul' },
      { t: 's', v: 'Aug' },
      { t: 's', v: 'Sep' },
      { t: 's', v: 'Oct' },
      { t: 's', v: 'Nov' },
      { t: 's', v: 'Dec' },
    ],
    [
      { t: 's', v: '' },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
      { t: 'n', v: 1 },
    ],
  ];
  const inputsWs = XLSX.utils.aoa_to_sheet(inputsData);
  setFormula(inputsWs, 'H2', 'XLOOKUP(A2,TaxRates!A:A,TaxRates!B:B)');
  setFormula(inputsWs, 'I2', 'XLOOKUP(A2,TaxRates!A:A,TaxRates!C:C)');
  XLSX.utils.book_append_sheet(wb, inputsWs, 'Inputs');

  // 2) TaxRates
  const taxRatesWs = XLSX.utils.aoa_to_sheet([
    ['TaxName', 'TaxPercent', 'TaxFixedMonthly'],
    ['ИП Патент', 0.06, 0],
    ['ООО УСН 15%', 0.15, 0],
    ['ООО УСН 6%', 0.06, 0],
  ]);
  XLSX.utils.book_append_sheet(wb, taxRatesWs, 'TaxRates');

  // 3) Students
  const studentsWs = XLSX.utils.aoa_to_sheet([
    [
      'StudentID',
      'StartDate',
      'Direction',
      'GroupID',
      'TeacherID',
      'MonthlyPrice',
      'DiscountPercent',
      'Status',
      'PaymentMonths',
      'IsAnnual',
    ],
    [1, new Date('2026-01-01'), 'Start', 101, 501, 12000, 0, 'Active', 1, false],
  ]);
  XLSX.utils.book_append_sheet(wb, studentsWs, 'Students');

  // 4) Groups
  const groupsWs = XLSX.utils.aoa_to_sheet([
    [
      'GroupID',
      'Direction',
      'TeacherID',
      'LessonHours',
      'LessonsPerMonth',
      'MaxCapacity',
      'CurrentStudents',
      'GroupStatus',
    ],
    [101, 'Start', 501, 1, 8, 12, 0, 'Active'],
  ]);
  setFormula(groupsWs, 'G2', 'COUNTIFS(Students!D:D,A2,Students!H:H,"Active")');
  XLSX.utils.book_append_sheet(wb, groupsWs, 'Groups');

  // 5) Teachers
  const teachersWs = XLSX.utils.aoa_to_sheet([
    ['TeacherID', 'Grade', 'RatePerHour', 'BonusPerStudent'],
    [501, 'Senior', 1200, 0],
  ]);
  XLSX.utils.book_append_sheet(wb, teachersWs, 'Teachers');

  // 6) Revenue
  const revenueWs = XLSX.utils.aoa_to_sheet([
    [
      'Month',
      'GroupID',
      'Direction',
      'ActiveStudents',
      'PricePerStudent',
      'Discount',
      'GrossRevenue',
      'NetRevenue',
    ],
    [new Date('2026-01-01'), 101, 'Start', 0, 0, 0, 0, 0],
  ]);
  setFormula(
    revenueWs,
    'D2',
    'COUNTIFS(Students!D:D,B2,Students!H:H,"Active",Students!B:B,"<="&EOMONTH(A2,0))'
  );
  setFormula(revenueWs, 'E2', 'IFERROR(AVERAGEIF(Students!D:D,B2,Students!F:F),0)');
  setFormula(revenueWs, 'F2', 'Inputs!G2');
  setFormula(revenueWs, 'G2', 'D2*E2*(1-F2)');
  setFormula(revenueWs, 'H2', 'G2*(1-Inputs!B2)-(D2*Inputs!C2)');
  XLSX.utils.book_append_sheet(wb, revenueWs, 'Revenue');

  // 7) Costs
  const costsWs = XLSX.utils.aoa_to_sheet([
    ['Month', 'Category', 'Subcategory', 'Amount', 'GroupID', 'TeacherID'],
    [new Date('2026-01-01'), 'Variable', 'Teacher payroll', 0, 101, 501],
  ]);
  XLSX.utils.book_append_sheet(wb, costsWs, 'Costs');

  // 8) P&L
  const pnlWs = XLSX.utils.aoa_to_sheet([
    [
      'Month',
      'Revenue',
      'COGS',
      'Gross Profit',
      'Opex',
      'EBITDA',
      'Taxes',
      'Net Profit',
    ],
    [new Date('2026-01-01'), 0, 0, 0, 0, 0, 0, 0],
  ]);
  setFormula(pnlWs, 'B2', 'SUMIFS(Revenue!H:H,Revenue!A:A,A2)');
  setFormula(pnlWs, 'C2', 'SUMIFS(Costs!D:D,Costs!B:B,"Variable",Costs!A:A,A2)');
  setFormula(pnlWs, 'D2', 'B2-C2');
  setFormula(pnlWs, 'E2', 'SUMIFS(Costs!D:D,Costs!B:B,"Fixed",Costs!A:A,A2)');
  setFormula(pnlWs, 'F2', 'D2-E2');
  setFormula(pnlWs, 'G2', 'B2*Inputs!H2+Inputs!I2');
  setFormula(pnlWs, 'H2', 'F2-G2');
  XLSX.utils.book_append_sheet(wb, pnlWs, 'P&L');

  // 9) Dashboard
  const dashboardWs = XLSX.utils.aoa_to_sheet([
    ['Dashboard'],
    ['SelectedMonth', new Date('2026-01-01')],
    [],
    ['Summary'],
    ['Revenue', 0],
    ['COGS', 0],
    ['Opex', 0],
    ['Net Profit', 0],
    [],
    ['ByGroup'],
    ['GroupID', 'GroupRevenue', 'TeacherCost', 'GroupVariableCosts', 'GroupProfit'],
    [101, 0, 0, 0, 0],
    [],
    ['ByTeacher'],
    ['TeacherID', 'Revenue', 'Hours', 'TeacherCost', 'Margin'],
    [501, 0, 0, 0, 0],
    [],
    ['ByDirection'],
    ['Direction', 'Revenue', 'AvgCheck', 'Retention'],
    ['Start', 0, 0, 0],
  ]);
  setFormula(dashboardWs, 'B5', 'SUMIFS(Revenue!H:H,Revenue!A:A,$B$2)');
  setFormula(dashboardWs, 'B6', 'SUMIFS(Costs!D:D,Costs!B:B,"Variable",Costs!A:A,$B$2)');
  setFormula(dashboardWs, 'B7', 'SUMIFS(Costs!D:D,Costs!B:B,"Fixed",Costs!A:A,$B$2)');
  setFormula(dashboardWs, 'B8', 'B5-B6-B7-(B5*Inputs!H2+Inputs!I2)');
  setFormula(dashboardWs, 'B12', 'SUMIFS(Revenue!H:H,Revenue!B:B,A12,Revenue!A:A,$B$2)');
  setFormula(dashboardWs, 'C12', 'SUMIFS(Costs!D:D,Costs!E:E,A12,Costs!B:B,"Variable",Costs!A:A,$B$2)');
  setFormula(dashboardWs, 'D12', 'SUMIFS(Costs!D:D,Costs!E:E,A12,Costs!B:B,"Variable",Costs!A:A,$B$2)');
  setFormula(dashboardWs, 'E12', 'B12-C12-D12');
  setFormula(
    dashboardWs,
    'B15',
    'SUMPRODUCT((Revenue!A:A=$B$2)*(XLOOKUP(Revenue!B:B,Groups!A:A,Groups!C:C)=A15)*Revenue!H:H)'
  );
  setFormula(
    dashboardWs,
    'C15',
    'SUMPRODUCT((Revenue!A:A=$B$2)*(XLOOKUP(Revenue!B:B,Groups!A:A,Groups!D:D))*XLOOKUP(Revenue!B:B,Groups!A:A,Groups!E:E))'
  );
  setFormula(dashboardWs, 'D15', 'SUMIFS(Costs!D:D,Costs!F:F,A15,Costs!A:A,$B$2)');
  setFormula(dashboardWs, 'E15', 'B15-D15');
  setFormula(dashboardWs, 'B18', 'SUMIFS(Revenue!H:H,Revenue!C:C,A18,Revenue!A:A,$B$2)');
  setFormula(dashboardWs, 'C18', 'IFERROR(AVERAGEIF(Students!C:C,A18,Students!F:F),0)');
  setFormula(dashboardWs, 'D18', 'Inputs!F2');
  XLSX.utils.book_append_sheet(wb, dashboardWs, 'Dashboard');

  return wb;
};

const FinancialModelPage: React.FC = () => {
  const handleDownload = () => {
    const wb = buildWorkbook();
    XLSX.writeFile(wb, 'WinCode_Financial_Model.xlsx');
  };

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Финансовая модель
        </Typography>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={2}>
            <Typography>
              Шаблон финансовой модели доступен для скачивания в формате Excel. Внутри — все листы и базовые формулы.
            </Typography>
            <Button variant="contained" onClick={handleDownload}>
              Скачать шаблон Excel
            </Button>
            <Typography variant="body2" color="text.secondary">
              После скачивания вы можете редактировать таблицы, добавлять строки и корректировать формулы.
            </Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Листы модели
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Sheet name</TableCell>
                <TableCell>Описание</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SHEET_NAMES.map((name) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell>
                    {name === 'Inputs' && 'Базовые параметры'}
                    {name === 'TaxRates' && 'Список налоговых режимов'}
                    {name === 'Students' && 'Ученик и его параметры'}
                    {name === 'Groups' && 'Группы и вместимость'}
                    {name === 'Teachers' && 'Ставки тренеров'}
                    {name === 'Revenue' && 'Выручка по месяцам и группам'}
                    {name === 'Costs' && 'Расходы (Fixed/Variable)'}
                    {name === 'P&L' && 'Отчет о прибылях и убытках'}
                    {name === 'Dashboard' && 'Сводный дашборд'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    </Layout>
  );
};

export default FinancialModelPage;

