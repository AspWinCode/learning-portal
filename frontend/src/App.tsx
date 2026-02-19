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
import TrainerLessonsPage from './pages/TrainerLessonsPage';
import ProgramsPage from './pages/ProgramsPage';
import GuestProgramsPage from './pages/GuestProgramsPage';
import GradesPage from './pages/GradesPage';
import CharacteristicsPage from './pages/CharacteristicsPage';
import ReportsPage from './pages/ReportsPage';
import FinancialModelPage from './pages/FinancialModelPage';
import AbonementsPage from './pages/AbonementsPage';
import TrainersPage from './pages/TrainersPage';
import B2BSchoolsPage from './pages/B2BSchoolsPage';
import B2BSchoolCreatePage from './pages/B2BSchoolCreatePage';
import OwnerFunnelsPage from './pages/OwnerFunnelsPage';
import ParentDashboardPage from './pages/ParentDashboardPage';
import SalesLeadsPage from './pages/SalesLeadsPage';
import SalesManagersPage from './pages/SalesManagersPage';
import SalesEventsPage from './pages/SalesEventsPage';
import SalesInvoicesPage from './pages/SalesInvoicesPage';
import SalesSettingsPage from './pages/SalesSettingsPage';
import SalesDashboardPage from './pages/SalesDashboardPage';
import SalesFollowUpsPage from './pages/SalesFollowUpsPage';
import SalesPostVisitPage from './pages/SalesPostVisitPage';
import SalesReinviteEventPage from './pages/SalesReinviteEventPage';
import SalesAgreedPage from './pages/SalesAgreedPage';
import SalesReportsPage from './pages/SalesReportsPage';
import SalesInstructionsPage from './pages/SalesInstructionsPage';
import StudentCardsPage from './pages/StudentCardsPage';
import TasksPage from './pages/TasksPage';
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
                <PrivateRoute allowedRoles={['admin', 'trainer', 'parent', 'owner']}>
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
                <PrivateRoute allowedRoles={['admin', 'trainer', 'owner']}>
                  <GroupsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/lessons"
              element={
                <PrivateRoute allowedRoles={['admin', 'trainer']}>
                  <TrainerLessonsPage />
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
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesLeadsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/pipeline"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesLeadsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/events"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesEventsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/post-visit"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesPostVisitPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/reinvite-event"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesReinviteEventPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/agreed"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesAgreedPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/invoices"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesInvoicesPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/follow-ups"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesFollowUpsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/reports"
              element={
                <PrivateRoute allowedRoles={['sales']}>
                  <SalesReportsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/instructions"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesInstructionsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/student-cards"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <StudentCardsPage />
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
              path="/owner-funnels"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <OwnerFunnelsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/b2b-schools"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <B2BSchoolsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/b2b-schools/new"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <B2BSchoolCreatePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales-managers"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner']}>
                  <SalesManagersPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/settings"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesSettingsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <TasksPage />
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

