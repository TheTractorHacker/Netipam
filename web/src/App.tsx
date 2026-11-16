import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';

export default function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  if (me.isLoading) return <div className="splash">Loading…</div>;
  if (!me.data?.authenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Shell me={me.data}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/devices" element={<Devices kind="device" title="Devices" />} />
        <Route path="/clients" element={<Devices kind="client" title="Clients" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
