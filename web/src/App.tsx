import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './auth';
import { allRoutes } from './registry';
import Shell from './components/Shell';
import Login from './pages/Login';
import Setup from './pages/users/Setup';
import { usersApi } from './pages/users/api';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from './components/kit';

export default function App() {
  const me = useMe();
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: usersApi.setupStatus, retry: false, enabled: !me.isLoading && !me.data?.authenticated });

  if (me.isLoading) return <div className="splash">Loading…</div>;
  if (!me.data?.authenticated) {
    if (setup.isLoading) return <div className="splash">Loading…</div>;
    if (setup.data?.needed) return <Setup />;
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Shell me={me.data}>
      <Routes>
        {allRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
        <Route path="*" element={allRoutes.length ? <Navigate to="/" replace /> : <Spinner />} />
      </Routes>
    </Shell>
  );
}
