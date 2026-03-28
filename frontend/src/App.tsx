import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';
import SetPasswordPage from './pages/SetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import GroupsPage from './pages/GroupsPage';
import LessonsPageContainer from './pages/lessons/LessonsPageContainer';
import ProgramsPage from './pages/ProgramsPage';
import GuestProgramsPage from './pages/GuestProgramsPage';
import GradesPage from './pages/GradesPage';
import CharacteristicsPage from './pages/CharacteristicsPage';
import ReportsPage from './pages/ReportsPage';
import FinancialModelPage from './pages/FinancialModelPage';
import AbonementsPage from './pages/AbonementsPage';
import TrainersPage from './pages/TrainersPage';
import CalculationsPage from './pages/CalculationsPage';
import B2BSchoolsWorkPage from './pages/B2BSchoolsWorkPage';
import B2BPlanForTodayPage from './pages/B2BPlanForTodayPage';
import OwnerFunnelsPage from './pages/OwnerFunnelsPage';
import ParentDashboardPage from './pages/ParentDashboardPage';
import SalesLeadsPage from './pages/SalesLeadsPage';
import SalesManagersPage from './pages/SalesManagersPage';
import SalesEventsHubPage from './pages/SalesEventsHubPage';
import SalesInvoicesPage from './pages/SalesInvoicesPage';
import SalesSettingsPage from './pages/SalesSettingsPage';
import SalesDashboardPage from './pages/SalesDashboardPage';
import SalesPostVisitPage from './pages/SalesPostVisitPage';
import SalesReinviteEventPage from './pages/SalesReinviteEventPage';
import SalesAgreedPage from './pages/SalesAgreedPage';
import SalesReportsPage from './pages/SalesReportsPage';
import SalesInstructionsPage from './pages/SalesInstructionsPage';
import SalesAbsencesPage from './pages/SalesAbsencesPage';
import SalesDebtsPage from './pages/SalesDebtsPage';
import SalesProgramMakeupPage from './pages/SalesProgramMakeupPage';
import SalesTaxDeductionPage from './pages/SalesTaxDeductionPage';
import LeadCardPage from './pages/LeadCardPage';
import SpecialistQuestionnairePage from './pages/SpecialistQuestionnairePage';
import TildaLeadPage from './pages/TildaLeadPage';
import StartLeadPage from './pages/StartLeadPage';
import BaseLeadPage from './pages/BaseLeadPage';
import ProLeadPage from './pages/ProLeadPage';
import TasksPage from './pages/TasksPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectKanbanPage from './pages/ProjectKanbanPage';
import OwnerWorkspacePage from './pages/OwnerWorkspacePage';
import PersonalFinancePage from './pages/PersonalFinancePage';
import FinanceOverviewPage from './pages/FinanceOverviewPage';
import FinanceProjectsPage from './pages/FinanceProjectsPage';
import { appTheme } from './theme';
import { useAuth } from './contexts/AuthContext';

const DefaultRedirect: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'guest') return <Navigate to="/programs" replace />;
  if (user?.role === 'parent') return <Navigate to="/parent-dashboard" replace />;
  if (user?.role === 'sales') return <Navigate to="/tasks" replace />;
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
            <Route path="/set-password" element={<SetPasswordPage />} />
            <Route path="/anketa/specialist" element={<SpecialistQuestionnairePage />} />
            <Route
              path="/anketa/tilda_lead"
              element={
                <TildaLeadPage titleOverride="Просим заполнить информацию на консультацию" />
              }
            />
            <Route path="/anketa/start_lead" element={<StartLeadPage />} />
            <Route path="/anketa/base_lead" element={<BaseLeadPage />} />
            <Route path="/anketa/pro_lead" element={<ProLeadPage />} />
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
                <PrivateRoute allowedRoles={['admin', 'trainer', 'owner', 'sales']}>
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
                <PrivateRoute allowedRoles={['admin', 'trainer', 'owner', 'sales']}>
                  <LessonsPageContainer />
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
                <PrivateRoute allowedRoles={['admin', 'owner']}>
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
              path="/sales/leads/:id"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <LeadCardPage />
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
                  <SalesEventsHubPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/post-visit"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesPostVisitPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/reinvite-event"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesReinviteEventPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/agreed"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
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
                <Navigate to="/sales/leads?overdue_only=1" replace />
              }
            />
            <Route
              path="/sales/reports"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner']}>
                  <SalesReportsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/finance/overview"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <FinanceOverviewPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/finance/projects"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <FinanceProjectsPage />
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
              path="/sales/absences"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesAbsencesPage />
                </PrivateRoute>
              }
            />
            <Route path="/sales/student-cards" element={<Navigate to="/students?tab=ankety" replace />} />
            <Route path="/sales/ankety" element={<Navigate to="/students?tab=ankety" replace />} />
            <Route
              path="/sales/debts"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesDebtsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/program-makeup"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner']}>
                  <SalesProgramMakeupPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/tax-deduction"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales']}>
                  <SalesTaxDeductionPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/manual-lessons"
              element={<Navigate to="/lessons" replace />}
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
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales']}>
                  <TrainersPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/calculations"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <CalculationsPage />
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
              path="/b2b-schools/plan"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <B2BPlanForTodayPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/b2b-schools/new"
              element={<Navigate to="/b2b-schools?tab=new" replace />}
            />
            <Route
              path="/b2b-schools"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <B2BSchoolsWorkPage />
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
                <PrivateRoute allowedRoles={['admin', 'owner']}>
                  <SalesSettingsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales', 'trainer']}>
                  <TasksPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales', 'trainer']}>
                  <ProjectsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <PrivateRoute allowedRoles={['admin', 'owner', 'sales', 'trainer']}>
                  <ProjectKanbanPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/notifications"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/settings"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/projects"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/projects/:projectId"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/contacts"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/contacts/:contactId"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/tasks"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/tasks/:taskId"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/reports"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/comms"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/history"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace"
              element={
                <PrivateRoute allowedRoles={['owner', 'admin', 'sales', 'trainer']}>
                  <OwnerWorkspacePage />
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
              path="/personal-finance"
              element={
                <PrivateRoute allowedRoles={['owner']}>
                  <PersonalFinancePage />
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

