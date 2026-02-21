import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Download from '@mui/icons-material/Download';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const currentYear = new Date().getFullYear();

const SalesTaxDeductionPage: React.FC = () => {
  const [orgInn, setOrgInn] = useState('');
  const [orgKpp, setOrgKpp] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [correctionNumber, setCorrectionNumber] = useState('');
  const [reportYear, setReportYear] = useState(String(currentYear));
  const [orgName, setOrgName] = useState('');
  const [fulltimeStudy, setFulltimeStudy] = useState<'0' | '1'>('1');

  const [taxpayerLastname, setTaxpayerLastname] = useState('');
  const [taxpayerFirstname, setTaxpayerFirstname] = useState('');
  const [taxpayerPatronymic, setTaxpayerPatronymic] = useState('');
  const [taxpayerInn, setTaxpayerInn] = useState('');
  const [taxpayerDob, setTaxpayerDob] = useState('');
  const [docTypeCode, setDocTypeCode] = useState('');
  const [docSeriesNumber, setDocSeriesNumber] = useState('');
  const [docIssueDate, setDocIssueDate] = useState('');

  const [taxpayerSameAsStudent, setTaxpayerSameAsStudent] = useState<'0' | '1'>('0');
  const [amount, setAmount] = useState('');

  const [studentLastname, setStudentLastname] = useState('');
  const [studentFirstname, setStudentFirstname] = useState('');
  const [studentPatronymic, setStudentPatronymic] = useState('');
  const [studentInn, setStudentInn] = useState('');
  const [studentDob, setStudentDob] = useState('');
  const [studentDocTypeCode, setStudentDocTypeCode] = useState('');
  const [studentDocSeriesNumber, setStudentDocSeriesNumber] = useState('');
  const [studentDocIssueDate, setStudentDocIssueDate] = useState('');

  const [confirmFio, setConfirmFio] = useState('');
  const [confirmDate, setConfirmDate] = useState(new Date().toISOString().slice(0, 10));
  const [pagesCount, setPagesCount] = useState('2');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildBody = (): Record<string, unknown> => ({
    org_inn: orgInn.trim() || undefined,
    org_kpp: orgKpp.trim() || undefined,
    cert_number: certNumber.trim() || undefined,
    correction_number: correctionNumber.trim() || undefined,
    report_year: reportYear.trim() || undefined,
    org_name: orgName.trim() || undefined,
    fulltime_study: fulltimeStudy,

    taxpayer_lastname: taxpayerLastname.trim() || undefined,
    taxpayer_firstname: taxpayerFirstname.trim() || undefined,
    taxpayer_patronymic: taxpayerPatronymic.trim() || undefined,
    taxpayer_inn: taxpayerInn.trim() || undefined,
    taxpayer_dob: taxpayerDob.trim() || undefined,
    doc_type_code: docTypeCode.trim() || undefined,
    doc_series_number: docSeriesNumber.trim() || undefined,
    doc_issue_date: docIssueDate.trim() || undefined,

    taxpayer_same_as_student: taxpayerSameAsStudent,
    amount: amount.trim() || undefined,

    student_lastname: studentLastname.trim() || undefined,
    student_firstname: studentFirstname.trim() || undefined,
    student_patronymic: studentPatronymic.trim() || undefined,
    student_inn: studentInn.trim() || undefined,
    student_dob: studentDob.trim() || undefined,
    student_doc_type_code: studentDocTypeCode.trim() || undefined,
    student_doc_series_number: studentDocSeriesNumber.trim() || undefined,
    student_doc_issue_date: studentDocIssueDate.trim() || undefined,

    confirm_fio: confirmFio.trim() || undefined,
    confirm_date: confirmDate.trim() || undefined,
    pages_count: pagesCount.trim() || undefined,
  });

  const handleGenerate = async () => {
    setError(null);
    if (!orgName.trim() || !taxpayerLastname.trim() || !taxpayerFirstname.trim() || !amount.trim() || !confirmFio.trim()) {
      setError('Заполните обязательные поля: наименование организации, ФИО налогоплательщика, сумма расходов, ФИО подтверждающего.');
      return;
    }
    if (taxpayerSameAsStudent === '0' && (!studentLastname.trim() || !studentFirstname.trim())) {
      setError('При «Налогоплательщик и обучаемый не одно лицо» заполните ФИО обучаемого.');
      return;
    }
    setLoading(true);
    try {
      const blob = await salesApi.generateTaxDeductionCertificate(buildBody());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spravka_KND_1151158.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сформировать справку'));
    } finally {
      setLoading(false);
    }
  };

  const showStudentBlock = taxpayerSameAsStudent === '0';

  return (
    <Layout>
      <Stack spacing={2}>
        <Typography variant="h4">Справка налогового вычета (КНД 1151158)</Typography>
        <Typography variant="body2" color="text.secondary">
          Справка об оплате образовательных услуг для представления в налоговый орган. Заполните поля и нажмите «Сформировать справку».
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={3}>
              <Typography variant="subtitle1" fontWeight={600}>Реквизиты справки</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Номер справки" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} size="small" />
                <TextField label="Номер корректировки" value={correctionNumber} onChange={(e) => setCorrectionNumber(e.target.value)} size="small" />
                <TextField label="Отчётный год" value={reportYear} onChange={(e) => setReportYear(e.target.value)} size="small" placeholder={String(currentYear)} />
              </Stack>

              <Typography variant="subtitle1" fontWeight={600}>Данные образовательной организации / ИП</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="ИНН" value={orgInn} onChange={(e) => setOrgInn(e.target.value)} size="small" placeholder="7707123456" />
                <TextField label="КПП" value={orgKpp} onChange={(e) => setOrgKpp(e.target.value)} size="small" placeholder="770701001" />
              </Stack>
              <TextField fullWidth label="Наименование организации / ФИО ИП" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="ООО «Образование»" />

              <Box>
                <Typography variant="subtitle2" gutterBottom>Обучение по очной форме</Typography>
                <RadioGroup row value={fulltimeStudy} onChange={(_, v) => setFulltimeStudy(v as '0' | '1')}>
                  <FormControlLabel value="0" control={<Radio size="small" />} label="0 — нет" />
                  <FormControlLabel value="1" control={<Radio size="small" />} label="1 — да" />
                </RadioGroup>
              </Box>

              <Typography variant="subtitle1" fontWeight={600}>Налогоплательщик (кто оплатил)</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Фамилия" value={taxpayerLastname} onChange={(e) => setTaxpayerLastname(e.target.value)} required size="small" fullWidth />
                <TextField label="Имя" value={taxpayerFirstname} onChange={(e) => setTaxpayerFirstname(e.target.value)} required size="small" fullWidth />
                <TextField label="Отчество" value={taxpayerPatronymic} onChange={(e) => setTaxpayerPatronymic(e.target.value)} size="small" fullWidth />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="ИНН налогоплательщика" value={taxpayerInn} onChange={(e) => setTaxpayerInn(e.target.value)} size="small" />
                <TextField label="Дата рождения" type="date" value={taxpayerDob} onChange={(e) => setTaxpayerDob(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
              </Stack>
              <Typography variant="caption" display="block" color="text.secondary">Документ, удостоверяющий личность</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Код вида документа" value={docTypeCode} onChange={(e) => setDocTypeCode(e.target.value)} size="small" placeholder="21" />
                <TextField label="Серия и номер" value={docSeriesNumber} onChange={(e) => setDocSeriesNumber(e.target.value)} size="small" fullWidth placeholder="4510 123456" />
                <TextField label="Дата выдачи" type="date" value={docIssueDate} onChange={(e) => setDocIssueDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
              </Stack>

              <Box>
                <Typography variant="subtitle2" gutterBottom>Налогоплательщик и обучаемый — одно лицо</Typography>
                <RadioGroup row value={taxpayerSameAsStudent} onChange={(_, v) => setTaxpayerSameAsStudent(v as '0' | '1')}>
                  <FormControlLabel value="0" control={<Radio size="small" />} label="0 — нет" />
                  <FormControlLabel value="1" control={<Radio size="small" />} label="1 — да" />
                </RadioGroup>
              </Box>

              <TextField label="Сумма расходов на образовательные услуги (руб.)" value={amount} onChange={(e) => setAmount(e.target.value)} required type="number" inputProps={{ min: 0 }} size="small" sx={{ maxWidth: 240 }} />

              {showStudentBlock && (
                <>
                  <Typography variant="subtitle1" fontWeight={600}>Данные обучаемого</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField label="Фамилия" value={studentLastname} onChange={(e) => setStudentLastname(e.target.value)} size="small" fullWidth />
                    <TextField label="Имя" value={studentFirstname} onChange={(e) => setStudentFirstname(e.target.value)} size="small" fullWidth />
                    <TextField label="Отчество" value={studentPatronymic} onChange={(e) => setStudentPatronymic(e.target.value)} size="small" fullWidth />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField label="ИНН обучаемого" value={studentInn} onChange={(e) => setStudentInn(e.target.value)} size="small" />
                    <TextField label="Дата рождения" type="date" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
                  </Stack>
                  <Typography variant="caption" display="block" color="text.secondary">Документ обучаемого</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField label="Код вида документа" value={studentDocTypeCode} onChange={(e) => setStudentDocTypeCode(e.target.value)} size="small" />
                    <TextField label="Серия и номер" value={studentDocSeriesNumber} onChange={(e) => setStudentDocSeriesNumber(e.target.value)} size="small" fullWidth />
                    <TextField label="Дата выдачи" type="date" value={studentDocIssueDate} onChange={(e) => setStudentDocIssueDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
                  </Stack>
                </>
              )}

              <Typography variant="subtitle1" fontWeight={600}>Подтверждение</Typography>
              <TextField fullWidth label="ФИО подтверждающего (подпись)" value={confirmFio} onChange={(e) => setConfirmFio(e.target.value)} required placeholder="Иванов Иван Иванович" size="small" />
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField label="Дата" type="date" value={confirmDate} onChange={(e) => setConfirmDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
                <TextField label="Справка составлена на" value={pagesCount} onChange={(e) => setPagesCount(e.target.value)} size="small" type="number" inputProps={{ min: 1 }} sx={{ width: 80 }} />
                <Typography variant="body2">страницах</Typography>
              </Stack>

              <Box>
                <Button variant="contained" startIcon={loading ? null : <Download />} onClick={handleGenerate} disabled={loading}>
                  {loading ? 'Формирование…' : 'Сформировать справку (PDF)'}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Layout>
  );
};

export default SalesTaxDeductionPage;
