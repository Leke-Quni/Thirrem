import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../auth/auth-api';
import { Icon } from './Icon';
import { Field } from './auth/Field';
import type { AuthMode } from './auth/AuthTabs';

const MIN_PASSWORD_LENGTH = 8;

const PASSWORD_RULES = [
  { label: `${MIN_PASSWORD_LENGTH}+ characters`, isMet: (password: string) => password.length >= MIN_PASSWORD_LENGTH },
  { label: 'Uppercase letter', isMet: (password: string) => /\p{Lu}/u.test(password) },
  { label: 'Special character', isMet: (password: string) => /[^\p{L}\p{N}\s]/u.test(password) },
] as const;

const COPY = {
  login: { submit: 'Log in', busy: 'Logging in…', autoComplete: 'current-password' },
  signup: { submit: 'Sign up', busy: 'Signing up…', autoComplete: 'new-password' },
} as const;

interface AuthFormProps {
  mode: AuthMode;
  onSubmit(email: string, password: string): Promise<void>;
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const navigate = useNavigate();
  const copy = COPY[mode];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const rulesId = useId();
  const metCount = PASSWORD_RULES.filter((rule) => rule.isMet(password)).length;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setBusy(true);
    try {
      await onSubmit(String(form.get('email')), String(form.get('password')));
      navigate('/home', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const passwordHint =
    mode === 'signup' ? (
      <>
        <ul id={rulesId} className="field-rules">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.isMet(password);
            return (
              <li key={rule.label} className={`field-hint${met ? ' is-met' : ''}`}>
                {met ? <Icon name="check" size={12} /> : <span className="rule-dot" aria-hidden="true" />}
                {rule.label}
                <span className="sr-only">{met ? ' (met)' : ' (not met yet)'}</span>
              </li>
            );
          })}
        </ul>
        <span role="status" className="sr-only">
          {metCount} of {PASSWORD_RULES.length} password requirements met
        </span>
      </>
    ) : null;

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <Field label="Email" icon="mail" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
      <Field
        label="Password"
        icon="lock"
        name="password"
        type="password"
        autoComplete={copy.autoComplete}
        placeholder={mode === 'signup' ? 'Create a password' : 'Your password'}
        minLength={MIN_PASSWORD_LENGTH}
        onValueChange={setPassword}
        hint={passwordHint}
        describedBy={mode === 'signup' ? rulesId : undefined}
      />
      {error && (
        <p role="alert" className="form-error">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
      <button type="submit" className="btn primary auth-submit" disabled={busy}>
        {busy ? copy.busy : copy.submit}
      </button>
      {mode === 'signup' && <p className="auth-note">This is a demo. Nothing you do here is a real ride, and no email is ever sent.</p>}
    </form>
  );
}
