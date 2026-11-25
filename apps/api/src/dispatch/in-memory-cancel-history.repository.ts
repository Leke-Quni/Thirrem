import { CancelHistoryRepository } from './cancel-history.repository.js';
import { type CancelHistory, NO_CANCELS } from './cancel-limit.js';

export class InMemoryCancelHistoryRepository extends CancelHistoryRepository {
  private readonly histories = new Map<string, CancelHistory>();

  async findByAccount(accountId: string): Promise<CancelHistory> {
    return this.histories.get(accountId) ?? NO_CANCELS;
  }

  async save(accountId: string, history: CancelHistory): Promise<void> {
    this.histories.set(accountId, history);
  }
}
