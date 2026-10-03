import { InjectionToken } from '@angular/core';

export abstract class DataRepository {
  abstract getTicketsByView(view: string, cursor?: { createdAt: string; id: string }): Promise<readonly unknown[]>;
  abstract getTicketById(id: string): Promise<unknown>;
  abstract getComments(ticketId: string): Promise<readonly unknown[]>;
  abstract createTicket(dto: unknown): Promise<unknown>;
  abstract updateTicket(ticketId: string, dto: unknown): Promise<unknown>;
  abstract claimTicket(ticketId: string, agentId: string, version: number): Promise<unknown>;
  abstract addComment(dto: unknown): Promise<unknown>;
}

export const DATA_REPOSITORY = new InjectionToken<DataRepository>('DATA_REPOSITORY');
