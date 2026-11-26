import { ServiceUnavailableException } from '@nestjs/common';
import type { SandboxBusyResponse } from '@thirrem/types';

const BUSY: SandboxBusyResponse = { code: 'SANDBOX_LIMIT', message: 'All Sandboxes are busy right now. Please try again in a few minutes.' };

export const sandboxBusy = () => new ServiceUnavailableException(BUSY);
