import { Navigate, useLocation, useParams } from 'react-router-dom';

export function LegacyPartyRedirect() {
  const { id } = useParams<{ id: string }>();
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: `/party/${encodeURIComponent(id || '')}`, search, hash }} />;
}
