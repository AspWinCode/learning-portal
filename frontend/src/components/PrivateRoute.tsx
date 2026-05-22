import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CircularProgress, Box } from '@mui/material';
import { getEffectiveRole, hasPermission } from '../utils/permissions';

interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, allowedRoles, requiredPermission }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user) {
    const effectiveRoles = new Set(allowedRoles);
    if (effectiveRoles.has('admin')) {
      effectiveRoles.add('owner');
    }
    const effectiveRole = getEffectiveRole(user);
    if (!effectiveRole || !effectiveRoles.has(effectiveRole)) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <Box textAlign="center">
            <Box component="h1" sx={{ fontSize: 48, m: 0 }}>
              403
            </Box>
            <Box component="p" sx={{ mt: 1, color: 'text.secondary' }}>
              Недостаточно прав для доступа к этой странице.
            </Box>
          </Box>
        </Box>
      );
    }
    if (effectiveRole === 'sales' && effectiveRoles.has('sales') && !hasPermission(user, 'sales.access')) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <Box textAlign="center">
            <Box component="h1" sx={{ fontSize: 48, m: 0 }}>
              403
            </Box>
            <Box component="p" sx={{ mt: 1, color: 'text.secondary' }}>
              Недостаточно прав для доступа к этой странице.
            </Box>
          </Box>
        </Box>
      );
    }
  }

  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Box textAlign="center">
          <Box component="h1" sx={{ fontSize: 48, m: 0 }}>
            403
          </Box>
          <Box component="p" sx={{ mt: 1, color: 'text.secondary' }}>
            Недостаточно прав для доступа к этой странице.
          </Box>
        </Box>
      </Box>
    );
  }

  return <>{children}</>;
};

export default PrivateRoute;

