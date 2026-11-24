import React from 'react';
import { useParams } from 'react-router-dom';
import ParentDashboardPage from './ParentDashboardPage';

const ParentDashboardPreviewPage: React.FC = () => {
  const { parentId } = useParams<{ parentId: string }>();
  const parsedParentId = Number(parentId);

  return <ParentDashboardPage previewParentId={Number.isInteger(parsedParentId) ? parsedParentId : undefined} />;
};

export default ParentDashboardPreviewPage;
