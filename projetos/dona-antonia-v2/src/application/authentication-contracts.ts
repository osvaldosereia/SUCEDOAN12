import type { StaffRole } from './authorization';

export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly email: string;
}

export interface StaffSession {
  readonly identity: AuthenticatedIdentity;
  readonly role: StaffRole;
  readonly expiresAt: number;
}

export interface SignInWithPasswordInput {
  readonly email: string;
  readonly password: string;
}

export class StaffAccessDeniedError extends Error {
  constructor() {
    super('Esta conta ainda não possui um papel ativo no administrador da Dona Antônia.');
    this.name = 'StaffAccessDeniedError';
  }
}

/** Port that keeps the administrator UI independent from the Auth provider implementation. */
export interface AuthenticationPort {
  signInWithPassword(input: SignInWithPasswordInput): Promise<StaffSession>;
  getSession(): Promise<StaffSession | null>;
  signOut(): Promise<void>;
  onSessionChanged(listener: (session: StaffSession | null) => void): () => void;
}

/** Role lookup must use trusted database state, never user_metadata. */
export interface StaffRoleLookup {
  getCurrentRole(identity: AuthenticatedIdentity): Promise<StaffRole | null>;
}
