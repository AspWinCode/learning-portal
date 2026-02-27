import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import Layout from '../components/Layout';
import { CampaignsTab } from './CampaignsTab';
import { B2BSchoolsMVPContent } from './B2BSchoolsMVPPage';
import { B2BSchoolCreateContent } from './B2BSchoolCreatePage';

const TAB_LIST = 'list';
const TAB_NEW = 'new';
const VIEW_CAMPAIGNS = 'campaigns';
const VIEW_SCHOOLS = 'schools';

const B2BSchoolsWorkPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === TAB_NEW ? TAB_NEW : TAB_LIST;
  const view = searchParams.get('view') === VIEW_SCHOOLS ? VIEW_SCHOOLS : VIEW_CAMPAIGNS;

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams(value === TAB_NEW ? { tab: TAB_NEW } : {});
  };

  const handleViewChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams(value === VIEW_SCHOOLS ? { view: VIEW_SCHOOLS } : {});
  };

  return (
    <Layout>
      <Box sx={{ width: '100%' }}>
        <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Работа со школами" value={TAB_LIST} />
          <Tab label="Новая B2B школа" value={TAB_NEW} />
        </Tabs>
        {tab === TAB_LIST && (
          <>
            <Tabs value={view} onChange={handleViewChange} sx={{ mb: 2 }}>
              <Tab label="Кампании" value={VIEW_CAMPAIGNS} />
              <Tab label="Школы" value={VIEW_SCHOOLS} />
            </Tabs>
            {view === VIEW_CAMPAIGNS && <CampaignsTab />}
            {view === VIEW_SCHOOLS && <B2BSchoolsMVPContent />}
          </>
        )}
        {tab === TAB_NEW && <B2BSchoolCreateContent />}
      </Box>
    </Layout>
  );
};

export default B2BSchoolsWorkPage;
