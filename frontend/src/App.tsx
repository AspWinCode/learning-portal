import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';
import SetPasswordPage from './pages/SetPasswordPage';
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
import CalculationsPage from './pages/CalculationsPage';
import B2BSchoolsWorkPage from './pages/B2BSchoolsWorkPage';
import B2BPlanForTodayPage from './pages/B2BPlanForTodayPage';
import OwnerFunnelsPage from './pages/OwnerFunnelsPage';
import ParentDashboardPage from './pages/ParentDashboardPage';
import TrainerCockpitPage from './pages/TrainerCockpitPage';
import TrainerGradesPage from './pages/TrainerGradesPage';
import SalesLeadsPage from './pages/SalesLeadsPage';
import SalesManagersPage from './pages/SalesManagersPage';
import SalesEventsHubPage from './pages/SalesEventsHubPage';
import SalesInvoicesPage from './pages/SalesInvoicesPage';
import SalesSettingsPage from './pages/SalesSettingsPage';
import CommunicationsSettingsPage from './pages/CommunicationsSettingsPage';
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
import ManualLessonsPage from './pages/ManualLessonsPage';
import SpecialistQuestionnairePage from './pages/SpecialistQuestionnairePage';
import TildaLeadPage from './pages/TildaLeadPage';
import StartLeadPage from './pages/StartLeadPage';
import BaseLeadPage from './pages/BaseLeadPage';
import ProLeadPage from './pages/ProLeadPage';
import SelectMakeupPage from './pages/SelectMakeupPage';
import TasksPage from './pages/TasksPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectKanbanPage from './pages/ProjectKanbanPage';
import OwnerWorkspacePage from './pages/OwnerWorkspacePage';
import PersonalFinancePage from './pages/PersonalFinancePage';
import FinanceOverviewPage from './pages/FinanceOverviewPage';
import FinanceProjectsPage from './pages/FinanceProjectsPage';
import RolesPage from './pages/RolesPage';
import PersonRegistryPage from './pages/PersonRegistryPage';
import UserDetailsPage from './pages/UserDetailsPage';
import { queryClient } from './queryClient';
import { appTheme } from './theme';
import { useAuth } from './contexts/AuthContext';
import { getEffectiveRole } from './utils/permissions';

const DefaultRedirect: React.FC = () => {
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  if (effectiveRole === 'guest') return <Navigate to="/programs" replace />;
  if (effectiveRole === 'parent') return <Navigate to="/parent-dashboard" replace />;
  if (effectiveRole === 'sales') return <Navigate to="/tasks" replace />;
  if (effectiveRole === 'trainer') return <Navigate to="/trainer-cockpit" replace />;
  return <Navigate to="/dashboard" replace />;
};

const ProgramsRoute: React.FC = () => {
  const { user } = useAuth();
  if (getEffectiveRole(user) === 'guest') return <GuestProgramsPage />;
  return <ProgramsPage />;
};

function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
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
            <Route path="/select-makeup" element={<SelectMakeupPage />} />
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
                <PrivateRoute requiredPermission="students.access">
                  <StudentsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/groups"
              element={
                <PrivateRoute requiredPermission="groups.access">
                  <GroupsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/trainer-cockpit"
              element={
                <PrivateRoute requiredPermission="trainer_cockpit.access">
                  <TrainerCockpitPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/trainer-grades"
              element={
                <PrivateRoute requiredPermission="grades.manage">
                  <TrainerGradesPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/lessons"
              element={
                <PrivateRoute requiredPermission="lessons.access">
                  <TrainerLessonsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/programs"
              element={
                <PrivateRoute requiredPermission="programs.access">
                  <ProgramsRoute />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/dashboard"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesDashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/leads"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesLeadsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/leads/:id"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <LeadCardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/pipeline"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesLeadsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/events"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesEventsHubPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/post-visit"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesPostVisitPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/reinvite-event"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesReinviteEventPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/agreed"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesAgreedPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/invoices"
              element={
                <PrivateRoute requiredPermission="sales.access">
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
                <PrivateRoute requiredPermission="reports.access">
                  <SalesReportsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/finance/overview"
              element={
                <PrivateRoute requiredPermission="finance.access">
                  <FinanceOverviewPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/finance/projects"
              element={
                <PrivateRoute requiredPermission="finance.access">
                  <FinanceProjectsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/instructions"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesInstructionsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/absences"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesAbsencesPage />
                </PrivateRoute>
              }
            />
            <Route path="/sales/student-cards" element={<Navigate to="/students?tab=ankety" replace />} />
            <Route path="/sales/ankety" element={<Navigate to="/students?tab=ankety" replace />} />
            <Route
              path="/sales/debts"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesDebtsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/program-makeup"
              element={
                <PrivateRoute requiredPermission="settings.manage">
                  <SalesProgramMakeupPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/tax-deduction"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SalesTaxDeductionPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/manual-lessons"
              element={
                <PrivateRoute requiredPermission="lessons.manage">
                  <ManualLessonsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/grades"
              element={
                <PrivateRoute requiredPermission="grades.access">
                  <GradesPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/characteristics"
              element={
                <PrivateRoute requiredPermission="characteristics.access">
                  <CharacteristicsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <PrivateRoute requiredPermission="reports.access">
                  <ReportsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/financial-model"
              element={
                <PrivateRoute requiredPermission="abonements.access">
                  <FinancialModelPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/abonements"
              element={
                <PrivateRoute requiredPermission="abonements.access">
                  <AbonementsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/trainers"
              element={
                <PrivateRoute requiredPermission="users.access">
                  <TrainersPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/calculations"
              element={
                <PrivateRoute requiredPermission="owner_calculations.access">
                  <CalculationsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-funnels"
              element={
                <PrivateRoute requiredPermission="owner_funnels.access">
                  <OwnerFunnelsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/b2b-schools/plan"
              element={
                <PrivateRoute requiredPermission="b2b.access">
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
                <PrivateRoute requiredPermission="b2b.access">
                  <B2BSchoolsWorkPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales-managers"
              element={
                <PrivateRoute requiredPermission="users.manage">
                  <SalesManagersPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/settings"
              element={
                <PrivateRoute requiredPermission="settings.access">
                  <SalesSettingsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/roles"
              element={
                <PrivateRoute requiredPermission="roles.access">
                  <RolesPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/persons"
              element={
                <PrivateRoute requiredPermission="persons.access">
                  <PersonRegistryPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/users/:userId"
              element={
                <PrivateRoute requiredPermission="users.access">
                  <UserDetailsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/settings/communications"
              element={
                <PrivateRoute requiredPermission="communications.access">
                  <CommunicationsSettingsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <PrivateRoute requiredPermission="tasks.access">
                  <TasksPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <PrivateRoute requiredPermission="projects.access">
                  <ProjectsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <PrivateRoute requiredPermission="projects.access">
                  <ProjectKanbanPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/notifications"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/settings"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/projects"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/projects/:projectId"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/contacts"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/contacts/:contactId"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/tasks"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/tasks/:taskId"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/reports"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/comms"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/history"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/parent-dashboard"
              element={
                <PrivateRoute requiredPermission="parent_dashboard.access">
                  <ParentDashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/personal-finance"
              element={
                <PrivateRoute requiredPermission="personal_finance.access">
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
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

