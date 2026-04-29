import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  RefreshCw,
  CreditCard,
  ScrollText,
  Zap,
  UserPlus,
  Settings,
  FileSpreadsheet,
  GitBranchPlus,
  LogOut,
  Menu,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Clientes', icon: Users },
  { to: '/subscriptions', label: 'Assinaturas', icon: RefreshCw },
  { to: '/payments', label: 'Pagamentos', icon: CreditCard },
  { to: '/event-logs', label: 'Logs de Eventos', icon: ScrollText },
  { to: '/admin-actions', label: 'Ações Admin', icon: Zap },
  { to: '/affiliates', label: 'Afiliados', icon: UserPlus },
  { to: '/cakto-imports', label: 'Histórico Cakto', icon: FileSpreadsheet },
  { to: '/orphan-renewals', label: 'Renovações Órfãs', icon: GitBranchPlus },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-gray-900 text-white w-64">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold text-blue-400">Brabogm</h1>
        <p className="text-xs text-gray-400 mt-1">Gestão de Assinaturas</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700">
        <div className="text-sm text-gray-400 mb-2">{user?.name}</div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-left text-sm text-gray-400 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black opacity-50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full z-50">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden bg-gray-900 text-white p-4 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-300">
            <Menu size={24} />
          </button>
          <h1 className="font-bold text-blue-400">Brabogm</h1>
          <div />
        </div>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
