import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/ui';
import { ErrorNote, Spinner } from '../../components/kit';
import { historyApi } from './api';
import './history.css';

export default function About() {
  const q = useQuery({ queryKey: ['about'], queryFn: historyApi.about, staleTime: Infinity });
  return (
    <>
      <PageHeader title="About Netipam" sub="Network IP address management" />
      {q.isLoading && <Spinner />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data && (
        <div className="card history-about">
          <dl>
            <dt>Version</dt>
            <dd className="mono">{q.data.version}</dd>
            <dt>Website</dt>
            <dd><a href={q.data.website} target="_blank" rel="noreferrer">netipam.com</a></dd>
          </dl>
        </div>
      )}
    </>
  );
}
