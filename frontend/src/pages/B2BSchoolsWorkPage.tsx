import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { CampaignsTab } from './CampaignsTab';
import { B2BSchoolCreateContent } from './B2BSchoolCreatePage';
import { b2bApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool } from '../types';

const TAB_LIST = 'list';
const TAB_SCHOOLS = 'schools';
const TAB_NEW = 'new';

const B2BSchoolsDirectoryTab: React.FC = () => {
  const [schools, setSchools] = React.useState<B2BSchool[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadSchools = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await b2bApi.listSchools({ search });
      setSchools(data);
      setError('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить школы'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">Школы</Typography>
          <Typography variant="body2" color="text.secondary">
            Общий список школ из B2B. Записи обновляются после импорта или ручного добавления в настройках.
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <TextField size="small" label="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="outlined" onClick={loadSchools} disabled={loading}>
            Обновить
          </Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Название</TableCell>
            <TableCell>Город</TableCell>
            <TableCell>Директор/ИО директора</TableCell>
            <TableCell>Почта</TableCell>
            <TableCell>Адрес</TableCell>
            <TableCell>Телефон</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {schools.map((school) => (
            <TableRow key={school.id}>
              <TableCell>{school.name}</TableCell>
              <TableCell>{school.city || '—'}</TableCell>
              <TableCell>{school.director || '—'}</TableCell>
              <TableCell>{school.email || '—'}</TableCell>
              <TableCell>{school.address || '—'}</TableCell>
              <TableCell>{school.phone_school || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
};

const B2BSchoolsWorkPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = tabParam === TAB_NEW ? TAB_NEW : tabParam === TAB_SCHOOLS ? TAB_SCHOOLS : TAB_LIST;

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams(value === TAB_NEW || value === TAB_SCHOOLS ? { tab: value } : {});
  };

  return (
    <Layout>
      <Box sx={{ width: '100%' }}>
        <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Работа со школами" value={TAB_LIST} />
          <Tab label="Школы" value={TAB_SCHOOLS} />
          <Tab label="Новая B2B школа" value={TAB_NEW} />
        </Tabs>
        {tab === TAB_LIST && <CampaignsTab />}
        {tab === TAB_SCHOOLS && <B2BSchoolsDirectoryTab />}
        {tab === TAB_NEW && <B2BSchoolCreateContent />}
      </Box>
    </Layout>
  );
};

export default B2BSchoolsWorkPage;
