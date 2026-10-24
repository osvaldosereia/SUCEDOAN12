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

/** Provider port for a future isolated Supabase Auth adapter; no credentials are stored here. */
export interface AuthenticationPort {
  signInWithPassword(input: SignInWithPasswordInput): Promise<StaffSession>;
  getSession(): Promise<StaffSession | null>;
  signOut(): Promise<void>;
  onSessionChanged(listener: (session: StaffSession | null) => void): () => void;
}

/** The adapter must resolve the role from trusted server/database state, never user_metadata. */
export interface StaffRoleLookup {
  getCurrentRole(identity: AuthenticatedIdentity): Promise<StaffRole | null>;
}
