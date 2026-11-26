import { AuthLayout, type AuthFact, type AuthMode } from '@thirrem/ui';
import type { ReactNode } from 'react';
import { AuthBackdrop } from './AuthBackdrop';

const FACTS: AuthFact[] = [
  { icon: 'cube', title: 'Everything is simulated', text: 'No real riders, rides or money are involved.' },
  { icon: 'save', title: 'Your account is kept', text: 'It is separate from any account in the Rider app.' },
  { icon: 'bolt', title: 'Nothing to confirm', text: 'There is no email to verify. Sign up and you are in.' },
];

export function DriverAuthLayout(props: { mode: AuthMode; title: string; intro: string; children: ReactNode }) {
  return <AuthLayout {...props} tag="Driver" backdrop={<AuthBackdrop />} facts={FACTS} />;
}
