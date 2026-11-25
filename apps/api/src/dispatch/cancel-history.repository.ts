import { type CancelHistory, cancelKind, type Cancelling, withCancel } from './cancel-limit.js';

export abstract class CancelHistoryRepository {
  /** An account that has not cancelled has an empty one. */
  abstract findByAccount(accountId: string): Promise<CancelHistory>;
  abstract save(accountId: string, history: CancelHistory): Promise<void>;
}

/** Adds a cancel made at `nowMs` to the account's history, if it is one that counts. */
export async function recordCancel(histories: CancelHistoryRepository, accountId: string, cancelling: Cancelling, nowMs: number): Promise<void> {
  const kind = cancelKind(cancelling, nowMs);
  if (kind) await histories.save(accountId, withCancel(await histories.findByAccount(accountId), kind, nowMs));
}
