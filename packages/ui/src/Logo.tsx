import { Link } from 'react-router-dom';

export function Logo({ to = '/', tag }: { to?: string; tag?: string }) {
  return (
    <Link to={to} className="logo" aria-label={tag ? `Thirrem ${tag} home` : 'Thirrem home'}>
      <i aria-hidden="true" />
      <span translate="no">Thirrem</span>
      {tag && <span className="logo-tag">{tag}</span>}
    </Link>
  );
}
