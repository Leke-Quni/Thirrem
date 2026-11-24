import { useEffect, useState } from 'react';
import { API_BASE_URL } from './api-base-url';

export type DemoStatus = 'checking' | 'online' | 'offline';

const TIMEOUT_MS = 5000;

export function useDemoStatus(): DemoStatus {
  const [status, setStatus] = useState<DemoStatus>('checking');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    fetch(`${API_BASE_URL}/health`, { signal: controller.signal })
      .then((response) => setStatus(response.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  return status;
}
