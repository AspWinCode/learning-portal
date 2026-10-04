import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../utils/permissions';
import LegoOwnerPage from './LegoOwnerPage';
import LegoTodayPage from './LegoTodayPage';

// /lego: владелец (lego.manage) видит единую страницу, тренер — экран «Сегодня».
const LegoHome: React.FC = () => {
  const { user } = useAuth();
  return hasPermission(user, 'lego.manage') ? <LegoOwnerPage /> : <LegoTodayPage />;
};

export default LegoHome;
