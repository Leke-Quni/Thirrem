import { Logo, ThemeToggle } from '@thirrem/ui';
import type { ReactNode } from 'react';

/** The bar of every logged-in page. `who` and `action` sit either side of the theme toggle. */
export function HomeBar({ who, action }: { who?: ReactNode; action?: ReactNode }) {
  return (
    <header className="home-bar">
      <Logo to="/home" tag="Driver" />
      <div className="links">
        {who}
        <ThemeToggle />
        {action}
      </div>
    </header>
  );
}
