import { Icon, type IconName } from '../Icon';

const FACTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'cube', title: 'Everything is simulated', text: 'No real drivers, rides or money are involved.' },
  { icon: 'save', title: 'Your account is kept', text: 'It stays even when your simulation is cleared.' },
  { icon: 'bolt', title: 'Nothing to confirm', text: 'There is no email to verify. Sign up and you are in.' },
];

export function AuthFacts() {
  return (
    <ul className="auth-facts">
      {FACTS.map((fact) => (
        <li key={fact.title}>
          <span className="auth-fact-icon">
            <Icon name={fact.icon} size={18} />
          </span>
          <div>
            <strong>{fact.title}</strong>
            <span>{fact.text}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
