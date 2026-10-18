import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import IncidentDetail from '@/pages/IncidentDetail';
import Repeaters from '@/pages/Repeaters';
import Guidance from '@/pages/Guidance';
import GuidanceEditor from '@/pages/GuidanceEditor';
import Volunteers from '@/pages/Volunteers';
import Settings from '@/pages/Settings';
import Reports from '@/pages/Reports';
import RequireRole from '@/components/RequireRole';
import RequireOperator from '@/components/RequireOperator';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import DtmfControl from '@/pages/DtmfControl';
import DtmfLog from '@/pages/DtmfLog';

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