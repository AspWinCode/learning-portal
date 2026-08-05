import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { queryClient } from './queryClient';
import { appTheme } from './theme';
import { useAuth } from './contexts/AuthContext';
import { getEffectiveRole } from './utils/permissions';

const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const SetPasswordPage = React.lazy(() => import('./pages/SetPasswordPage'));
const StudentPortalLoginPage = React.lazy(() => import('./pages/StudentPortalLoginPage'));
const StudentPortalCabinetPage = React.lazy(() => import('./pages/StudentPortalCabinetPage'));
const MobileHomePage = React.lazy(() => import('./pages/MobileHomePage'));
const MobileContactsPage = React.lazy(() => import('./pages/MobileContactsPage'));
const MobileTrainerCockpitPage = React.lazy(() => import('./pages/MobileTrainerCockpitPage'));
const MobileParentDashboardPage = React.lazy(() => import('./pages/MobileParentDashboardPage'));
const MobileStudentsPage = React.lazy(() => import('./pages/MobileStudentsPage'));
const MobileTasksPage = React.lazy(() => import('./pages/MobileTasksPage'));
const MobileLessonsPage = React.lazy(() => import('./pages/MobileLessonsPage'));
const MobileProgramsPage = React.lazy(() => import('./pages/MobileProgramsPage'));
const MobileLeadsPage = React.lazy(() => import('./pages/MobileLeadsPage'));
const MobileOwnerWorkspacePage = React.lazy(() => import('./pages/MobileOwnerWorkspacePage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const StudentsPage = React.lazy(() => import('./pages/StudentsPage'));
const GroupsPage = React.lazy(() => import('./pages/GroupsPage'));
const TrainerLessonsPage = React.lazy(() => import('./pages/TrainerLessonsPage'));
const ProgramsPage = React.lazy(() => import('./pages/ProgramsPage'));
const GuestProgramsPage = React.lazy(() => import('./pages/GuestProgramsPage'));
const GradesPage = React.lazy(() => import('./pages/GradesPage'));
const CharacteristicsPage = React.lazy(() => import('./pages/CharacteristicsPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const AbonementsPage = React.lazy(() => import('./pages/AbonementsPage'));
const TrainersPage = React.lazy(() => import('./pages/TrainersPage'));
const CalculationsPage = React.lazy(() => import('./pages/CalculationsPage'));
const B2BSchoolsWorkPage = React.lazy(() => import('./pages/B2BSchoolsWorkPage'));
const B2BPlanForTodayPage = React.lazy(() => import('./pages/B2BPlanForTodayPage'));
const OwnerFunnelsPage = React.lazy(() => import('./pages/OwnerFunnelsPage'));
const OwnerUsefulLinksPage = React.lazy(() => import('./pages/OwnerUsefulLinksPage'));
const TranscriptionPage = React.lazy(() => import('./pages/TranscriptionPage'));
const ParentDashboardPage = React.lazy(() => import('./pages/ParentDashboardPage'));
const TrainerCockpitPage = React.lazy(() => import('./pages/TrainerCockpitPage'));
const TrainerGradesPage = React.lazy(() => import('./pages/TrainerGradesPage'));
const SalesLeadsPage = React.lazy(() => import('./pages/SalesLeadsPage'));
const SalesManagersPage = React.lazy(() => import('./pages/SalesManagersPage'));
const SalesEventsHubPage = React.lazy(() => import('./pages/SalesEventsHubPage'));
const SalesInvoicesPage = React.lazy(() => import('./pages/SalesInvoicesPage'));
const SalesSettingsPage = React.lazy(() => import('./pages/SalesSettingsPage'));
const CommunicationsSettingsPage = React.lazy(() => import('./pages/CommunicationsSettingsPage'));
const SalesDashboardPage = React.lazy(() => import('./pages/SalesDashboardPage'));
const SalesPostVisitPage = React.lazy(() => import('./pages/SalesPostVisitPage'));
const SalesReinviteEventPage = React.lazy(() => import('./pages/SalesReinviteEventPage'));
const SalesAgreedPage = React.lazy(() => import('./pages/SalesAgreedPage'));
const SalesReportsPage = React.lazy(() => import('./pages/SalesReportsPage'));
const SalesInstructionsPage = React.lazy(() => import('./pages/SalesInstructionsPage'));
const SalesAbsencesPage = React.lazy(() => import('./pages/SalesAbsencesPage'));
const SalesDebtsPage = React.lazy(() => import('./pages/SalesDebtsPage'));
const SalesTaxDeductionPage = React.lazy(() => import('./pages/SalesTaxDeductionPage'));
const SeoPagesListPage = React.lazy(() => import('./pages/seo/SeoPagesListPage'));
const SeoPageEditPage = React.lazy(() => import('./pages/seo/SeoPageEditPage'));
const BlogPostsListPage = React.lazy(() => import('./pages/blog/BlogPostsListPage'));
const BlogPostEditPage = React.lazy(() => import('./pages/blog/BlogPostEditPage'));
const SitePublishPage = React.lazy(() => import('./pages/seo/SitePublishPage'));
const RedirectsPage = React.lazy(() => import('./pages/seo/RedirectsPage'));
const SiteSettingsPage = React.lazy(() => import('./pages/seo/SiteSettingsPage'));
const CmsEditorPage = React.lazy(() => import('./pages/cms/CmsEditorPage'));
const SeoVisualEditorPage = React.lazy(() => import('./pages/seo/SeoVisualEditorPage'));
const LeadCardPage = React.lazy(() => import('./pages/LeadCardPage'));
const ManualLessonsPage = React.lazy(() => import('./pages/ManualLessonsPage'));
const SpecialistQuestionnairePage = React.lazy(() => import('./pages/SpecialistQuestionnairePage'));
const PublicStudentQuestionnairePage = React.lazy(() => import('./pages/PublicStudentQuestionnairePage'));
const TildaLeadPage = React.lazy(() => import('./pages/TildaLeadPage'));
const StartLeadPage = React.lazy(() => import('./pages/StartLeadPage'));
const BaseLeadPage = React.lazy(() => import('./pages/BaseLeadPage'));
const ProLeadPage = React.lazy(() => import('./pages/ProLeadPage'));
const SelectMakeupPage = React.lazy(() => import('./pages/SelectMakeupPage'));
const TasksPage = React.lazy(() => import('./pages/TasksPage'));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage'));
const ProjectKanbanPage = React.lazy(() => import('./pages/ProjectKanbanPage'));
const OwnerWorkspacePage = React.lazy(() => import('./pages/OwnerWorkspacePage'));
const OwnerCounterpartiesPage = React.lazy(() => import('./pages/OwnerCounterpartiesPage'));
const CounterpartyDetailPage = React.lazy(() => import('./pages/CounterpartyDetailPage'));
const ProjectDetailPage = React.lazy(() => import('./pages/ProjectDetailPage'));
const FinanceOverviewPage = React.lazy(() => import('./pages/FinanceOverviewPage'));
const RolesPage = React.lazy(() => import('./pages/RolesPage'));
const PersonRegistryPage = React.lazy(() => import('./pages/PersonRegistryPage'));
const UserDetailsPage = React.lazy(() => import('./pages/UserDetailsPage'));
const DiskPage = React.lazy(() => import('./pages/DiskPage'));
const PasswordsPage = React.lazy(() => import('./pages/PasswordsPage'));
const NotesPage = React.lazy(() => import('./pages/NotesPage'));
const KodexStudioPage = React.lazy(() => import('./pages/KodexStudioPage'));
const MethodistHubPage = React.lazy(() => import('./pages/MethodistHubPage'));
const MethodistStudioLoginPage = React.lazy(() => import('./pages/MethodistStudioLoginPage'));
const MethodistStudioPage = React.lazy(() => import('./pages/MethodistStudioPage'));
const MethodistsPage = React.lazy(() => import('./pages/MethodistsPage'));
const AgileProjectsPage = React.lazy(() => import('./pages/AgileProjectsPage'));
const AgileProjectPage = React.lazy(() => import('./pages/AgileProjectPage'));
const TravelPage = React.lazy(() => import('./pages/TravelPage'));
const TripDetailPage = React.lazy(() => import('./pages/TripDetailPage'));

const DefaultRedirect: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isStandalonePwa =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
  const isPwaLaunch = isStandalonePwa || new URLSearchParams(location.search).get('pwa') === '1';
  if (isPwaLaunch) return <Navigate to="/mobile?pwa=1" replace />;
  const effectiveRole = getEffectiveRole(user);
  if (effectiveRole === 'guest') return <Navigate to="/programs" replace />;
  if (effectiveRole === 'parent') return <Navigate to="/parent-dashboard" replace />;
  if (effectiveRole === 'sales') return <Navigate to="/tasks" replace />;
  if (effectiveRole === 'seo_manager') return <Navigate to="/seo/pages" replace />;
  if (effectiveRole === 'methodist') return <Navigate to="/methodist-hub" replace />;
  if (effectiveRole === 'trainer') return <Navigate to="/trainer-cockpit" replace />;
  return <Navigate to="/dashboard" replace />;
};

const ProgramsRoute: React.FC = () => {
  const { user } = useAuth();
  if (getEffectiveRole(user) === 'guest') return <GuestProgramsPage />;
  return <ProgramsPage />;
};

const SectionBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ErrorBoundary>{children}</ErrorBoundary>
);

const RouteFallback: React.FC = () => (
  <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <CircularProgress />
  </Box>
);

const RedirectWithSearch: React.FC<{ to: string }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorBoundary>
            <Router
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <Suspense fallback={<RouteFallback />}>
                <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/set-password" element={<SetPasswordPage />} />
            <Route path="/student-portal/login" element={<StudentPortalLoginPage />} />
            <Route path="/student-portal" element={<StudentPortalCabinetPage />} />
            <Route path="/methodist-studio/login" element={<MethodistStudioLoginPage />} />
            <Route path="/methodist-studio" element={<MethodistStudioPage />} />
            <Route
              path="/mobile"
              element={
                <PrivateRoute>
                  <MobileHomePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/contacts"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <MobileContactsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/contacts/:contactId"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <MobileContactsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/trainer-cockpit"
              element={
                <PrivateRoute requiredPermission="trainer_cockpit.access">
                  <MobileTrainerCockpitPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/parent-dashboard"
              element={
                <PrivateRoute>
                  <MobileParentDashboardPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/students"
              element={
                <PrivateRoute requiredPermission="students.access">
                  <MobileStudentsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/students/:studentId"
              element={
                <PrivateRoute requiredPermission="students.access">
                  <MobileStudentsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/tasks"
              element={
                <PrivateRoute>
                  <MobileTasksPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/lessons"
              element={
                <PrivateRoute requiredPermission="lessons.access">
                  <MobileLessonsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/programs"
              element={
                <PrivateRoute requiredPermission="programs.access">
                  <MobileProgramsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/leads"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <MobileLeadsPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/mobile/owner-workspace"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <MobileOwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            <Route path="/anketa/specialist" element={<SpecialistQuestionnairePage />} />
            <Route path="/anketa/student/:questionnaireId" element={<PublicStudentQuestionnairePage />} />
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
                  <SectionBoundary>
                    <TrainerCockpitPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/trainer-grades"
              element={
                <PrivateRoute requiredPermission="grades.manage">
                  <SectionBoundary>
                    <TrainerGradesPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/lessons"
              element={
                <PrivateRoute requiredPermission="lessons.access">
                  <SectionBoundary>
                    <TrainerLessonsPage />
                  </SectionBoundary>
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
                  <SectionBoundary>
                    <SalesDashboardPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/seo/pages"
              element={
                <PrivateRoute requiredPermission="seo.access">
                  <SectionBoundary>
                    <SeoPagesListPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/seo/pages/:pageId"
              element={
                <PrivateRoute requiredPermission="seo.access">
                  <SectionBoundary>
                    <SeoPageEditPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/blog/posts"
              element={
                <PrivateRoute requiredPermission="seo.access">
                  <SectionBoundary>
                    <BlogPostsListPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/blog/posts/:postId"
              element={
                <PrivateRoute requiredPermission="seo.access">
                  <SectionBoundary>
                    <BlogPostEditPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/seo/publish"
              element={
                <PrivateRoute requiredPermission="seo.manage">
                  <SectionBoundary>
                    <SitePublishPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/seo/redirects"
              element={
                <PrivateRoute requiredPermission="seo.access">
                  <SectionBoundary>
                    <RedirectsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/seo/site-settings"
              element={
                <PrivateRoute requiredPermission="seo.manage">
                  <SectionBoundary>
                    <SiteSettingsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/cms/editor"
              element={
                <PrivateRoute requiredPermission="seo.access">
                  <SectionBoundary>
                    <CmsEditorPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/seo/visual-editor"
              element={
                <PrivateRoute requiredPermission="seo.access">
                  <SectionBoundary>
                    <SeoVisualEditorPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/leads"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesLeadsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/leads/:id"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <LeadCardPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/pipeline"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesLeadsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/events"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesEventsHubPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/post-visit"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesPostVisitPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/reinvite-event"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesReinviteEventPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/agreed"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesAgreedPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/sales/invoices"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesInvoicesPage />
                  </SectionBoundary>
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
                  <SectionBoundary>
                    <SalesReportsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/finance/overview"
              element={
                <PrivateRoute requiredPermission="finance.access">
                  <SectionBoundary>
                    <FinanceOverviewPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/operations/instructions"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesInstructionsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/operations/absences"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesAbsencesPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route path="/sales/instructions" element={<RedirectWithSearch to="/operations/instructions" />} />
            <Route path="/sales/absences" element={<RedirectWithSearch to="/operations/absences" />} />
            <Route path="/sales/student-cards" element={<Navigate to="/admin/settings?tab=questionnaires" replace />} />
            <Route
              path="/finance/payments"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesDebtsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/operations/program-makeup"
              element={<Navigate to="/admin/settings?tab=programMakeup" replace />}
            />
            <Route
              path="/finance/tax-deduction"
              element={
                <PrivateRoute requiredPermission="sales.access">
                  <SectionBoundary>
                    <SalesTaxDeductionPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/operations/manual-lessons"
              element={
                <PrivateRoute requiredPermission="lessons.manage">
                  <SectionBoundary>
                    <ManualLessonsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route path="/sales/debts" element={<RedirectWithSearch to="/finance/payments" />} />
            <Route path="/sales/program-makeup" element={<RedirectWithSearch to="/operations/program-makeup" />} />
            <Route path="/sales/tax-deduction" element={<RedirectWithSearch to="/finance/tax-deduction" />} />
            <Route path="/sales/manual-lessons" element={<RedirectWithSearch to="/operations/manual-lessons" />} />
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
              path="/methodists"
              element={
                <PrivateRoute requiredPermission="users.access">
                  <MethodistsPage />
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
              path="/admin/settings"
              element={
                <PrivateRoute requiredPermission="settings.access">
                  <SalesSettingsPage />
                </PrivateRoute>
              }
            />
            <Route path="/sales/settings" element={<RedirectWithSearch to="/admin/settings" />} />
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
              path="/owner-workspace/counterparties"
              element={
                <PrivateRoute allowedRoles={['owner']} requiredPermission="owner_workspace.access">
                  <OwnerCounterpartiesPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/links"
              element={
                <PrivateRoute allowedRoles={['owner']} requiredPermission="owner_workspace.access">
                  <OwnerUsefulLinksPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/transcription"
              element={
                <PrivateRoute allowedRoles={['owner']} requiredPermission="transcription.access">
                  <TranscriptionPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/counterparties/:id"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <SectionBoundary>
                    <CounterpartyDetailPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/projects/:id"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <SectionBoundary>
                    <ProjectDetailPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/disk"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <SectionBoundary>
                    <DiskPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/passwords"
              element={
                <PrivateRoute requiredPermission="passwords.access">
                  <SectionBoundary>
                    <PasswordsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/notes"
              element={
                <PrivateRoute>
                  <SectionBoundary>
                    <NotesPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/methodist-hub"
              element={
                <PrivateRoute requiredPermission="kodex.access">
                  <SectionBoundary>
                    <MethodistHubPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/kodex"
              element={
                <PrivateRoute requiredPermission="kodex.access">
                  <SectionBoundary>
                    <KodexStudioPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/owner-workspace/notifications"
              element={<Navigate to="/owner-workspace/projects" replace />}
            />
            {/* Настройки таск трекера и контрагентов переехали в общий раздел настроек */}
            <Route path="/owner-workspace/settings" element={<RedirectWithSearch to="/admin/settings?tab=ownerWorkspace" />} />
            <Route
              path="/owner-workspace/projects"
              element={
                <PrivateRoute requiredPermission="owner_workspace.access">
                  <OwnerWorkspacePage />
                </PrivateRoute>
              }
            />
            {/* /owner-workspace/projects/:id → ProjectDetailPage (defined above) */}
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
              path="/owner-workspace/meetings"
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
              path="/agile"
              element={
                <PrivateRoute requiredPermission="agile.access">
                  <SectionBoundary>
                    <AgileProjectsPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/agile/:projectId"
              element={
                <PrivateRoute requiredPermission="agile.access">
                  <SectionBoundary>
                    <AgileProjectPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/travel"
              element={
                <PrivateRoute>
                  <SectionBoundary>
                    <TravelPage />
                  </SectionBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/travel/:id"
              element={
                <PrivateRoute>
                  <SectionBoundary>
                    <TripDetailPage />
                  </SectionBoundary>
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
              path="/"
              element={
                <PrivateRoute>
                  <DefaultRedirect />
                </PrivateRoute>
              }
            />
                </Routes>
              </Suspense>
            </Router>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
