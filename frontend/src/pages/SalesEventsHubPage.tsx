import React, { useEffect, useState } from 'react';
import { Tabs, Tab, Box } from '@mui/material';
import Layout from '../components/Layout';
import SalesEventsPage from './SalesEventsPage';
import SalesPostVisitPage from './SalesPostVisitPage';
import SalesReinviteEventPage from './SalesReinviteEventPage';
import SalesAgreedPage from './SalesAgreedPage';
import SalesInvoicesPage from './SalesInvoicesPage';

const SalesEventsHubPage: React.FC = () => {
  const [tab, setTab] = useState<'events' | 'post_visit' | 'reinvite' | 'agreed' | 'invoices'>('events');

  return (
    <Layout>
      <Box sx={{ mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="events" label="События" />
          <Tab value="post_visit" label="Дожать на обучение" />
          <Tab value="reinvite" label="Повторно позвать" />
          <Tab value="agreed" label="Решили сразу" />
          <Tab value="invoices" label="Счета" />
        </Tabs>
      </Box>

      {tab === 'events' && <SalesEventsPage />}
      {tab === 'post_visit' && <SalesPostVisitPage />}
      {tab === 'reinvite' && <SalesReinviteEventPage />}
      {tab === 'agreed' && <SalesAgreedPage />}
      {tab === 'invoices' && <SalesInvoicesPage />}
    </Layout>
  );
};

export default SalesEventsHubPage;

