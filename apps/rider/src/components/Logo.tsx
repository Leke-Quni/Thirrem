import { Link } from 'react-router-dom';

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Thirrem home">
      <i aria-hidden="true" />
      Thirrem
    </Link>
  );
}
