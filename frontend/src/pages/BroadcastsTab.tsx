import React, { useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import TemplatesSubTab from './TemplatesSubTab';
import EmailCampaignsSubTab from './EmailCampaignsSubTab';
import MaxBroadcastsSubTab from './MaxBroadcastsSubTab';

const BroadcastsTab: React.FC = () => {
  const [tab, setTab] = useState<'templates' | 'campaigns' | 'max'>('templates');

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="templates" label="Шаблоны" />
        <Tab value="campaigns" label="Кампании" />
        <Tab value="max" label="MAX" />
      </Tabs>

      {tab === 'templates' && <TemplatesSubTab />}
      {tab === 'campaigns' && <EmailCampaignsSubTab />}
      {tab === 'max' && <MaxBroadcastsSubTab />}
    </Box>
  );
};

export default BroadcastsTab;
