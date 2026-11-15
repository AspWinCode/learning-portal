import React, { useEffect, useState } from 'react';
import { Alert, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { formatDate, formatMoney, getStudent, listStudents, LegoStudent } from './legoApi';

type StudentSummary = {
  student: LegoStudent;
  payments: string[];
  attendanceDates: string[];
};

const LegoStudentsSummaryPage: React.FC = () => {
  const [rows, setRows] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const students = await listStudents({ status: 'active' });
        const summaries = await Promise.all(students.map(async (student) => {
          const card = await getStudent(student.id);
          return {
            student,
            payments: card.payments?.history.map((payment) => (
              `${formatDate(payment.payment_date)} — ${formatMoney(payment.amount)}`
            )) ?? [],
            attendanceDates: card.attendance.history
              .filter((lesson) => lesson.attended)
              .map((lesson) => formatDate(lesson.date)),
          };
        }));

        if (!cancelled) {
          setRows(summaries.sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru')));
        }
      } catch {
        if (!cancelled) setError('Не удалось загрузить сводку по ученикам');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>Ученики: оплаты и посещения</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ФИО ученика</TableCell>
              <TableCell>Оплаты ученика</TableCell>
              <TableCell>Даты хождения ученика</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={3}>Загрузка…</TableCell></TableRow>
            )}
            {!loading && rows.map(({ student, payments, attendanceDates }) => (
              <TableRow key={student.id} hover>
                <TableCell sx={{ fontWeight: 600, verticalAlign: 'top' }}>{student.full_name}</TableCell>
                <TableCell sx={{ whiteSpace: 'pre-line', verticalAlign: 'top' }}>
                  {payments.length ? payments.join('\n') : '—'}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'pre-line', verticalAlign: 'top' }}>
                  {attendanceDates.length ? attendanceDates.join(', ') : '—'}
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={3}><Typography color="text.secondary">Активных учеников пока нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </>
  );
};

export default LegoStudentsSummaryPage;
