import React, { useState } from 'react';
import { Tabs, Tab, Box } from '@mui/material';
import Layout from '../components/Layout';
import { SalesEventsPageContent } from './SalesEventsPage';
import { SalesPostVisitPageContent } from './SalesPostVisitPage';
import { SalesReinviteEventPageContent } from './SalesReinviteEventPage';
import { SalesAgreedPageContent } from './SalesAgreedPage';
import { SalesInvoicesPageContent } from './SalesInvoicesPage';

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

      {tab === 'events' && <SalesEventsPageContent />}
      {tab === 'post_visit' && <SalesPostVisitPageContent />}
      {tab === 'reinvite' && <SalesReinviteEventPageContent />}
      {tab === 'agreed' && <SalesAgreedPageContent />}
      {tab === 'invoices' && <SalesInvoicesPageContent />}
    </Layout>
  );
};

export default SalesEventsHubPage;

