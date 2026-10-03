import { Injectable, inject } from '@angular/core';
import {
  Attachment,
  CreateCommentDTO,
  CreateTicketDTO,
  Profile,
  Ticket,
  TicketComment,
  TicketCursor,
  TicketViewId,
  UpdateTicketDTO
} from '../models/helpdesk.models';
import { environment } from '../../../environments/environment';
import { AuthStateService } from './auth-state.service';
import { DataRepository } from './data-repository.interface';
import { MockDataRepository } from './mock-data.repository';
import { SupabaseDataRepository } from './supabase-data.repository';
import { isTransportFailure } from './transport-failure';

/**
 * Routes every read and write to whichever backend can actually answer.
 *
 * Two situations have to work without anybody thinking about them:
 *
 *  - `ng serve` with the local container stopped. The login fallback in
 *    `AuthStateService` has already recorded the outage, so this proxy starts on
 *    the mock repository and the workspace is fully usable.
 *  - a container that dies *after* the session was established, or a static
 *    deployment whose Supabase host is unreachable. Nothing flagged the outage
 *    yet, so the first real query fails. That failure is the detection: the
 *    proxy records it, flips `isOperatingOffline` and replays the same call
 *    against the mock backend instead of letting a network error reach a person.
 *
 * Only transport failures are absorbed. A rejected write, a stale version or a
 * permission error still propagates, because those are answers the person needs
 * to see.
 */
@Injectable()
export class ResilientDataRepository implements DataRepository {
  private readonly supabaseRepo = inject(SupabaseDataRepository);
  private readonly mockRepo = inject(MockDataRepository);
  private readonly authState = inject(AuthStateService);

  /**
   * The outage notice is emitted once, so a page full of failing queries does not
   * repeat it. It starts unset: a build configured for mock data never reaches
   * the reporting path at all, and a build configured for Supabase must be able
   * to announce the first failure it actually sees.
   */
  private offlineReported = false;

  /**
   * Which backend answers right now.
   *
   * `AuthStateService` seeds the flag with `environment.useMockData`, so a build
   * configured for mock data never reaches Supabase, and a build configured for
   * Supabase starts on Supabase until something proves otherwise. Consulting the
   * flag alone keeps the decision in one place.
   */
  private get activeRepo(): DataRepository {
    return this.authState.isOperatingOffline() ? this.mockRepo : this.supabaseRepo;
  }

  getTicketsByView(view: TicketViewId, cursor?: TicketCursor): Promise<readonly Ticket[]> {
    return this.run((repository) => repository.getTicketsByView(view, cursor));
  }

  getTicketById(id: string): Promise<Ticket> {
    return this.run((repository) => repository.getTicketById(id));
  }

  getComments(ticketId: string): Promise<readonly TicketComment[]> {
    return this.run((repository) => repository.getComments(ticketId));
  }

  createTicket(dto: CreateTicketDTO): Promise<Ticket> {
    return this.run((repository) => repository.createTicket(dto));
  }

  updateTicket(ticketId: string, dto: UpdateTicketDTO): Promise<Ticket> {
    return this.run((repository) => repository.updateTicket(ticketId, dto));
  }

  claimTicket(ticketId: string, agentId: string, version: number): Promise<Ticket> {
    return this.run((repository) => repository.claimTicket(ticketId, agentId, version));
  }

  addComment(dto: CreateCommentDTO): Promise<TicketComment> {
    return this.run((repository) => repository.addComment(dto));
  }

  getViewCounts(): Promise<Readonly<Record<TicketViewId, number>>> {
    return this.run((repository) => repository.getViewCounts());
  }

  searchTickets(query: string, limit?: number): Promise<readonly Ticket[]> {
    return this.run((repository) => repository.searchTickets(query, limit));
  }

  getTicketsByRequester(requesterId: string, excludeTicketId?: string): Promise<readonly Ticket[]> {
    return this.run((repository) => repository.getTicketsByRequester(requesterId, excludeTicketId));
  }

  listAssignableProfiles(): Promise<readonly Profile[]> {
    return this.run((repository) => repository.listAssignableProfiles());
  }

  uploadAttachment(file: File): Promise<Attachment> {
    return this.run((repository) => repository.uploadAttachment(file));
  }

  getAttachmentUrl(filePath: string): Promise<string> {
    return this.run((repository) => repository.getAttachmentUrl(filePath));
  }

  /**
   * Reset always targets the mock backend. When the app is running on Supabase,
   * that is still the dataset the user can see by switching accounts, and it is
   * the only one that holds local state worth clearing.
   */
  resetLocalData(): void {
    if (this.activeRepo === this.mockRepo) {
      this.mockRepo.resetLocalData();
      return;
    }
    this.supabaseRepo.resetLocalData();
  }

  private async run<T>(call: (repository: DataRepository) => Promise<T>): Promise<T> {
    const repository = this.activeRepo;
    if (repository === this.mockRepo) {
      return call(repository);
    }

    try {
      return await call(repository);
    } catch (failure) {
      if (!isTransportFailure(failure)) {
        throw failure;
      }
      this.reportOutage();
      return call(this.mockRepo);
    }
  }

  private reportOutage(): void {
    this.authState.isOperatingOffline.set(true);

    if (this.offlineReported) {
      return;
    }
    this.offlineReported = true;
    console.warn(
      'Supabase is unreachable, so ticket data is being served from the offline workspace. ' +
        'Start the local stack with "pnpm run docker:start", or serve the showcase with "pnpm run start:demo".'
    );
  }
}