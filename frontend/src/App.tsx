import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import GroupsPage from './pages/GroupsPage';
import ProgramsPage from './pages/ProgramsPage';
import GuestProgramsPage from './pages/GuestProgramsPage';
import GradesPage from './pages/GradesPage';
import CharacteristicsPage from './pages/CharacteristicsPage';
import ReportsPage from './pages/ReportsPage';
import FinancialModelPage from './pages/FinancialModelPage';
import AbonementsPage from './pages/AbonementsPage';
import TrainersPage from './pages/TrainersPage';
import ParentDashboardPage from './pages/ParentDashboardPage';
import SalesLeadsPage from './pages/SalesLeadsPage';
import SalesManagersPage from './pages/SalesManagersPage';
import SalesEventsPage from './pages/SalesEventsPage';
import SalesInvoicesPage from './pages/SalesInvoicesPage';
import SalesSettingsPage from './pages/SalesSettingsPage';
import SalesDashboardPage from './pages/SalesDashboardPage';
import SalesFollowUpsPage from './pages/SalesFollowUpsPage';
import SalesReportsPage from './pages/SalesReportsPage';
import { appTheme } from './theme';
import { useAuth } from './contexts/AuthContext';

const DefaultRedirect: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'guest') return <Navigate to="/programs" replace />;
  if (user?.role === 'parent') return <Navigate to="/parent-dashboard" replace />;
  if (user?.role === 'sales') return <Navigate to="/sales/dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
};

const ProgramsRoute: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'guest') return <GuestProgramsPage />;
  return <ProgramsPage />;
};

function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <AuthProvider>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute allowedRoles={['admin', 'trainer', 'parent']}>
                  <DashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/students"
              element={
                <PrivateRoute allowedRoles={['admin', 'trainer', 'owner']}>
                  <StudentsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/groups"
              element={
                <PrivateRoute allowedRoles={['admin', 'trainer']}>
                  <GroupsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/programs"
              element={
                <PrivateRoute allowedRoles={['admin', 'trainer', 'parent', 'guest']}>
                  <ProgramsRoute />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/dashboard"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesDashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/leads"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesLeadsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/pipeline"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesLeadsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/events"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesEventsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/invoices"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesInvoicesPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/follow-ups"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesFollowUpsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/reports"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesReportsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/grades"
              element={
                <PrivateRoute allowedRoles={['admin', 'trainer', 'parent']}>
                  <GradesPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/characteristics"
              element={
                <PrivateRoute allowedRoles={['admin', 'trainer', 'parent']}>
                  <CharacteristicsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner']}>
                  <ReportsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/financial-model"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <FinancialModelPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/abonements"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <AbonementsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/trainers"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <TrainersPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales-managers"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <SalesManagersPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/settings"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner']}>
                  <SalesSettingsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/parent-dashboard"
              element={
                <PrivateRoute allowedRoles={['parent']}>
                  <ParentDashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DefaultRedirect />
                </PrivateRoute>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

