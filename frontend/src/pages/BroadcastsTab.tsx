import React, { useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import TemplatesSubTab from './TemplatesSubTab';
import EmailCampaignsSubTab from './EmailCampaignsSubTab';

const BroadcastsTab: React.FC = () => {
  const [tab, setTab] = useState<'templates' | 'campaigns'>('templates');

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="templates" label="Шаблоны" />
        <Tab value="campaigns" label="Кампании" />
      </Tabs>

      {tab === 'templates' && <TemplatesSubTab />}
      {tab === 'campaigns' && <EmailCampaignsSubTab />}
    </Box>
  );
};

export default BroadcastsTab;
