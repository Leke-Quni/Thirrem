import { Icon, type IconName } from '../Icon';

export interface AuthFact {
  icon: IconName;
  title: string;
  text: string;
}

export function AuthFacts({ facts }: { facts: AuthFact[] }) {
  return (
    <ul className="auth-facts">
      {facts.map((fact) => (
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
