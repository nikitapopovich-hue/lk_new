import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { AppShell } from "./components/Shell";
import { AuthCallbackPage } from "./pages/AuthCallback";
import { DashboardPage } from "./pages/Dashboard";
import { TeamsPage } from "./pages/Teams";
import { getRole } from "./lib/role";
import { MappingsPage } from "./pages/Mappings";
import { AccountsPage } from "./pages/Accounts";
import { ProfilePage } from "./pages/Profile";
import { FinancePage } from "./pages/Finance";
import { TriggersPage } from "./pages/Triggers";
import { TriggersLayout } from "./pages/triggers/TriggersLayout";
import { TriggersRaPage } from "./pages/triggers/TriggersRaPage";
import { RemoteWorkPage } from "./pages/RemoteWork";
import { KcDataPage } from "./pages/KcData";
import { KcStructurePage } from "./pages/KcStructure";
import { KpdLayout } from "./pages/kpd/KpdLayout";
import { KpdUploadPage } from "./pages/kpd/KpdUploadPage";
import { KpdViewPage } from "./pages/kpd/KpdViewPage";
import { ViolationJournalLayout } from "./pages/violations/ViolationJournalLayout";
import { ViolationsJournalPage } from "./pages/violations/ViolationsJournalPage";
import { ViolationsStatsPage } from "./pages/violations/ViolationsStatsPage";
import { FinanceJournalListPage } from "./pages/finance-journal/FinanceJournalListPage";
import {
  BonusesLayoutPage,
  OvertimeLayoutPage,
  RecalculationsLayoutPage,
} from "./pages/finance-journal/FinanceJournalLayouts";
import { OvertimeStatsPage } from "./pages/overtime/OvertimeStatsPage";

const LoginPage = lazy(() => import("./pages/Login").then((m) => ({ default: m.LoginPage })));

function ProtectedLayout() {
  return (
    <AuthGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGate>
  );
}

function App() {
  const role = getRole();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<div className="min-h-screen bg-black" aria-hidden />}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/kc-data" element={<KcDataPage />} />
        <Route path="/kc-data/structure" element={<KcStructurePage />} />
      {role === "supervisor" || role === "superadmin" ? (
        <>
          <Route path="/triggers" element={<TriggersLayout />}>
            <Route index element={<TriggersPage />} />
            <Route path="ra" element={<TriggersRaPage />} />
          </Route>
          <Route path="/remote-work" element={<RemoteWorkPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/kpd" element={<KpdLayout />}>
            <Route index element={<Navigate to="view" replace />} />
            <Route path="view" element={<KpdViewPage />} />
            <Route path="upload" element={<KpdUploadPage />} />
          </Route>
          <Route path="/violations" element={<ViolationJournalLayout />}>
            <Route index element={<Navigate to="journal" replace />} />
            <Route path="journal" element={<ViolationsJournalPage />} />
            <Route path="stats" element={<ViolationsStatsPage />} />
          </Route>
          <Route path="/overtime" element={<OvertimeLayoutPage />}>
            <Route index element={<Navigate to="journal" replace />} />
            <Route path="journal" element={<FinanceJournalListPage entryType="overtime" />} />
            <Route path="stats" element={<OvertimeStatsPage />} />
          </Route>
          <Route path="/bonuses" element={<BonusesLayoutPage />}>
            <Route index element={<Navigate to="journal" replace />} />
            <Route path="journal" element={<FinanceJournalListPage entryType="bonus" />} />
          </Route>
          <Route path="/recalculations" element={<RecalculationsLayoutPage />}>
            <Route index element={<Navigate to="journal" replace />} />
            <Route path="journal" element={<FinanceJournalListPage entryType="recalculation" />} />
          </Route>
        </>
      ) : null}
      {role === "superadmin" ? <Route path="/mappings" element={<MappingsPage />} /> : null}
      {role === "superadmin" ? <Route path="/accounts" element={<AccountsPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
