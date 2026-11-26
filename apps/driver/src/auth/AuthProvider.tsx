import { createAuth } from '@thirrem/ui';
import { API_BASE_URL } from '../api-base-url';

export const { AuthProvider, useAuth, GuestRoute, TOKEN_KEY } = createAuth('driver', API_BASE_URL);
