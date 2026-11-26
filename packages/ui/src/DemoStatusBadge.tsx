import { useEffect, useState } from 'react';

type DemoStatus = 'checking' | 'online' | 'offline';

const TIMEOUT_MS = 5000;

const STATUS_TEXT: Record<DemoStatus, string> = {
  checking: 'Checking the live demo…',
  online: 'Live demo is online',
  offline: 'Live demo is offline right now. Sign-up and login are paused.',
};

function useDemoStatus(apiBaseUrl: string): DemoStatus {
  const [status, setStatus] = useState<DemoStatus>('checking');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    fetch(`${apiBaseUrl}/health`, { signal: controller.signal })
      .then((response) => setStatus(response.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiBaseUrl]);
  return status;
}

/** Whether the live demo's API answers its health check. */
export function DemoStatusBadge({ apiBaseUrl }: { apiBaseUrl: string }) {
  const status = useDemoStatus(apiBaseUrl);
  return (
    <span className={`badge status ${status}`} role="status">
      <b /> {STATUS_TEXT[status]}
    </span>
  );
}
