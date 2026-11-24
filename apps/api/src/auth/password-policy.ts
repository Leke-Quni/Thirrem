export const MIN_PASSWORD_LENGTH = 8;

const RULES: ReadonlyArray<{ description: string; isMet(password: string): boolean }> = [
  { description: `at least ${MIN_PASSWORD_LENGTH} characters`, isMet: (password) => password.length >= MIN_PASSWORD_LENGTH },
  { description: 'an uppercase letter', isMet: (password) => /\p{Lu}/u.test(password) },
  { description: 'a special character', isMet: (password) => /[^\p{L}\p{N}\s]/u.test(password) },
];

export function unmetPasswordRules(password: string): string[] {
  return RULES.filter((rule) => !rule.isMet(password)).map((rule) => rule.description);
}

export function passwordRequirementMessage(unmet: string[]): string {
  const list = unmet.length > 1 ? `${unmet.slice(0, -1).join(', ')} and ${unmet[unmet.length - 1]}` : unmet[0];
  return `Password needs ${list}`;
}
