import { Request, Response, NextFunction } from 'express';
import { BaseService, Cacheable, CreateUserInput } from './types';

export { formatUser, sanitizeEmail } from './helpers';

export const MAX_USERS = 1000;

export type UserRole = 'admin' | 'editor' | 'viewer';

export enum OrderStatus {
  Pending = 'PENDING',
  Confirmed = 'CONFIRMED',
  Shipped = 'SHIPPED',
  Delivered = 'DELIVERED',
  Cancelled = 'CANCELLED',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export class UserService extends BaseService implements Cacheable {
  private cache: Map<string, User> = new Map();
  private ttl: number;

  constructor(ttl: number = 3600) {
    super();
    this.ttl = ttl;
  }

  async getById(id: string): Promise<User | null> {
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    const user = await this.repository.findOne({ where: { id } });
    if (user) {
      this.cache.set(id, user);
    }
    return user ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      role: input.role ?? 'viewer',
      createdAt: new Date(),
    };

    if (!this.validate(user)) {
      throw new Error('Invalid user data');
    }

    await this.repository.save(user);
    this.cache.set(user.id, user);
    return user;
  }

  private validate(user: User): boolean {
    if (!user.name || user.name.length < 2) {
      return false;
    }
    if (!user.email || !user.email.includes('@')) {
      return false;
    }
    return true;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
