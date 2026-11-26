import { createAuth } from '@thirrem/ui';
import { API_BASE_URL } from '../api-base-url';

export const { TOKEN_KEY, authApi, AuthProvider, useAuth, GuestRoute } = createAuth('rider', API_BASE_URL);
