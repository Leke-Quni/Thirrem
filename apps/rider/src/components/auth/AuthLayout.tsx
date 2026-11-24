import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Logo } from '../Logo';
import { ThemeToggle } from '../ThemeToggle';
import { AuthBackdrop } from './AuthBackdrop';
import { AuthFacts } from './AuthFacts';
import { AuthTabs, type AuthMode } from './AuthTabs';

interface AuthLayoutProps {
  mode: AuthMode;
  title: string;
  intro: string;
  children: ReactNode;
}

/** The one page shell shared by login and signup: backdrop, centred panel and the facts underneath. */
export function AuthLayout({ mode, title, intro, children }: AuthLayoutProps) {
  const headingId = useId();
  return (
    <div className="auth-page">
      <AuthBackdrop />
      <div className="auth-shell">
        <nav className="auth-nav">
          <Logo />
          <div className="links">
            <Link className="auth-back" to="/">
              <Icon name="back" size={16} />
              Back to home
            </Link>
            <ThemeToggle />
          </div>
        </nav>

        <main className="auth-main">
          <section className="auth-panel" aria-labelledby={headingId}>
            <AuthTabs active={mode} />
            <h1 id={headingId}>{title}</h1>
            <p className="auth-intro">{intro}</p>
            {children}
          </section>
          <AuthFacts />
        </main>

        <footer className="auth-footer">Thirrem is a portfolio project. It is a simulation, and nothing here is a real service.</footer>
      </div>
    </div>
  );
}
