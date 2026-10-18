import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import ScrollToTop from '@/components/ScrollToTop';
// Add page imports here
import Layout from '@/components/Layout';
import Dashboard from '@/features/incidents/Dashboard';
import IncidentDetail from '@/features/incidents/IncidentDetail';
import Repeaters from '@/features/repeaters/Repeaters';
import Guidance from '@/features/guidance/Guidance';
import GuidanceEditor from '@/features/guidance/GuidanceEditor';
import Volunteers from '@/features/team/Volunteers';
import Settings from '@/features/settings/Settings';
import Reports from '@/features/incidents/Reports';
import RequireRole from '@/features/auth/RequireRole';
import RequireOperator from '@/features/auth/RequireOperator';
import ProtectedRoute from '@/features/auth/ProtectedRoute';
import Login from '@/features/auth/Login';
import ForgotPassword from '@/features/auth/ForgotPassword';
import ResetPassword from '@/features/auth/ResetPassword';
import DtmfControl from '@/features/dtmf/DtmfControl';
import DtmfLog from '@/features/dtmf/DtmfLog';

// THE MAP OF THE APP: which web address shows which screen, and who may see it.
//   /login, /forgot-password, /reset-password   open to everyone
//   everything else                             needs a signed-in user (ProtectedRoute)
//   RequireOperator   admin or operator only (radio control screens)
//   RequireRole admin admin only (repeaters, guidance, volunteers, settings)
// These guards only hide screens. The real enforcement is on the server.
const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  // Show loading spinner while the stored session is checked
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/incident/:id" element={<IncidentDetail />} />
          <Route path="/dtmf" element={<RequireOperator><DtmfControl /></RequireOperator>} />
          <Route path="/dtmf-log" element={<RequireOperator><DtmfLog /></RequireOperator>} />
          <Route path="/repeaters" element={<RequireRole role="admin"><Repeaters /></RequireRole>} />
          <Route path="/guidance" element={<RequireRole role="admin"><Guidance /></RequireRole>} />
          <Route path="/guidance/new" element={<RequireRole role="admin"><GuidanceEditor /></RequireRole>} />
          <Route path="/guidance/:id" element={<RequireRole role="admin"><GuidanceEditor /></RequireRole>} />
          <Route path="/volunteers" element={<RequireRole role="admin"><Volunteers /></RequireRole>} />
          <Route path="/settings" element={<RequireRole role="admin"><Settings /></RequireRole>} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


// App = the outer wrappers every screen sits inside: sign-in state, the data cache,
// the router, and the pop-up message area (Toaster).
function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App