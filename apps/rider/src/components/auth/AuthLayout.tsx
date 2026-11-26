import { AuthLayout as SharedAuthLayout, type AuthFact, type AuthMode } from '@thirrem/ui';
import type { ReactNode } from 'react';
import { AuthBackdrop } from './AuthBackdrop';

const FACTS: AuthFact[] = [
  { icon: 'cube', title: 'Everything is simulated', text: 'No real drivers, rides or money are involved.' },
  { icon: 'save', title: 'Your account is kept', text: 'It stays even when your simulation is cleared.' },
  { icon: 'bolt', title: 'Nothing to confirm', text: 'There is no email to verify. Sign up and you are in.' },
];

export function AuthLayout(props: { mode: AuthMode; title: string; intro: string; children: ReactNode }) {
  return <SharedAuthLayout {...props} backdrop={<AuthBackdrop />} facts={FACTS} />;
}
