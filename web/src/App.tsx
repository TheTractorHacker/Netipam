import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './auth';
import { allRoutes } from './registry';
import Shell from './components/Shell';
import Login from './pages/Login';
import { Spinner } from './components/kit';

export default function App() {
  const me = useMe();

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
        {allRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
        <Route path="*" element={allRoutes.length ? <Navigate to="/" replace /> : <Spinner />} />
      </Routes>
    </Shell>
  );
}
