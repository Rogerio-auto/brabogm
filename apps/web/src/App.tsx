import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import PaymentsPage from './pages/PaymentsPage';
import EventLogsPage from './pages/EventLogsPage';
import AdminActionsPage from './pages/AdminActionsPage';
import AffiliatesPage from './pages/AffiliatesPage';
import SettingsPage from './pages/SettingsPage';
import CaktoImportsPage from './pages/CaktoImportsPage';
import OrphanRenewalsPage from './pages/OrphanRenewalsPage';
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="subscriptions" element={<SubscriptionsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="event-logs" element={<EventLogsPage />} />
        <Route path="admin-actions" element={<AdminActionsPage />} />
        <Route path="affiliates" element={<AffiliatesPage />} />
        <Route path="cakto-imports" element={<CaktoImportsPage />} />
        <Route path="orphan-renewals" element={<OrphanRenewalsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
