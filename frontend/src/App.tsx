import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { PageSpinner } from "./components/ui/Spinner";
import { RequireAuth } from "./features/auth/RequireAuth";
import { DashboardLayout } from "./features/layout/DashboardLayout";
import { EmailDetailPage } from "./pages/EmailDetailPage";
import { EmailListPage } from "./pages/EmailListPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrivacyPage } from "./pages/PrivacyPage";

// The rich-text editor (TipTap + ProseMirror) is most of the JavaScript, and
// only Compose needs it, so that page is loaded on first visit.
const ComposePage = lazy(() => import("./pages/ComposePage").then((m) => ({ default: m.ComposePage })));

// /dashboard must exist: the backend redirects there after Google login and
// after Slack OAuth (/dashboard?slack=...).
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Public: linked from Google's OAuth consent screen */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          {/* key: switching tabs remounts the page, resetting search and page */}
          <Route path="/dashboard" element={<EmailListPage key="scheduled" tab="scheduled" />} />
          <Route path="/dashboard/sent" element={<EmailListPage key="sent" tab="sent" />} />
        </Route>
        <Route
          path="/compose"
          element={
            <Suspense fallback={<PageSpinner />}>
              <ComposePage />
            </Suspense>
          }
        />
        <Route path="/emails/:id" element={<EmailDetailPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
