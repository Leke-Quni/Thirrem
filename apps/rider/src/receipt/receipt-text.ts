const requested = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatRequestedAt = (iso: string): string => requested.format(new Date(iso));
