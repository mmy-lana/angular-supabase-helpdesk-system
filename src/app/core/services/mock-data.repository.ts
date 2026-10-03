import { Injectable } from '@angular/core';
import { DataRepository } from './data-repository.interface';

@Injectable()
export class MockDataRepository implements DataRepository {
  async getTicketsByView(): Promise<readonly unknown[]> {
    return [];
  }

  async getTicketById(): Promise<unknown> {
    return null;
  }

  async getComments(): Promise<readonly unknown[]> {
    return [];
  }

  async createTicket(): Promise<unknown> {
    return null;
  }

  async updateTicket(): Promise<unknown> {
    return null;
  }

  async claimTicket(): Promise<unknown> {
    return null;
  }

  async addComment(): Promise<unknown> {
    return null;
  }
}
