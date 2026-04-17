// MySQL-backed client compatible with the subset of Supabase APIs used by this app.
// JWT tokens are stored in httpOnly cookies (set by the server), NOT in localStorage.

import type { Database, Tables, TablesInsert, TablesUpdate } from './types';

// ── Helper types ──────────────────────────────────────────────────────────────

type TableName = keyof Database['public']['Tables'];
type FunctionName = keyof Database['public']['Functions'];
type FunctionArgs<F extends FunctionName> = Database['public']['Functions'][F]['Args'];
type FunctionReturns<F extends FunctionName> = Database['public']['Functions'][F]['Returns'];

type AuthUser = {
  id: string;
  email: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string | null;
};

type AuthSession = {
  token_type: string;
  expires_in: number;
  user: AuthUser;
};

type SupabaseLikeResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

type QueryFilter = { col: string; op?: string; value: unknown };

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');
const PUBLIC_BASE = (import.meta.env.API_PUBLIC_URL || '').replace(/\/$/, '');
const STORAGE_KEY = 'scouthub_session';

type AuthChangeCallback = (event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED', session: AuthSession | null) => void;

const listeners = new Set<AuthChangeCallback>();

function getStoredSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function setStoredSession(session: AuthSession | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function notify(event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED', session: AuthSession | null) {
  for (const cb of listeners) cb(event, session);
}

// ── Auth response types ───────────────────────────────────────────────────────

type LoginResponse = {
  user: AuthUser;
  session: AuthSession;
  requires2FA?: boolean;
  userId?: string;
};

type SessionResponse = { session: AuthSession | null };
type UserResponse = { user: AuthUser | null };

// ── API request ───────────────────────────────────────────────────────────────

async function apiRequest<T = unknown>(path: string, init: RequestInit = {}, _auth = true): Promise<SupabaseLikeResult<T>> {
  try {
    const headers = new Headers(init.headers || {});

    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // Auth is handled by httpOnly cookies — no Authorization header needed
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const message = payload?.error || `HTTP ${response.status}`;
      return { data: null, error: new Error(String(message)) };
    }

    return { data: payload as T, error: null };
  } catch (error) {
    if (error instanceof Error) {
      return { data: null, error };
    }
    return { data: null, error: new Error(String(error)) };
  }
}

// ── QueryBuilder ──────────────────────────────────────────────────────────────

class QueryBuilder<T extends TableName> {
  private table: T;
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: QueryFilter[] = [];
  private selected = '*';
  private values: TablesInsert<T> | TablesUpdate<T> | Array<TablesInsert<T>> | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitRange: { from: number; to: number } | null = null;
  private expectSingle = false;
  private expectMaybeSingle = false;
  private wantsReturning = false;
  private onConflictColumn: string | undefined;

  constructor(table: T) {
    this.table = table;
  }

  select(columns = '*') {
    this.selected = columns;
    if (this.mode === 'select') return this;
    this.wantsReturning = true;
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push({ col, value });
    return this;
  }

  is(col: string, value: null) {
    this.filters.push({ col, value });
    return this;
  }

  in(col: string, values: unknown[]) {
    this.filters.push({ col, op: 'in', value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  range(from: number, to: number) {
    this.limitRange = { from, to };
    return this.execute();
  }

  limit(count: number) {
    this.limitRange = { from: 0, to: count - 1 };
    return this;
  }

  insert(values: TablesInsert<T> | Array<TablesInsert<T>>) {
    this.mode = 'insert';
    this.values = values;
    return this;
  }

  update(values: TablesUpdate<T>) {
    this.mode = 'update';
    this.values = values;
    return this;
  }

  upsert(values: TablesInsert<T> | Array<TablesInsert<T>>, options?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.values = values;
    this.onConflictColumn = options?.onConflict;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  single() {
    this.expectSingle = true;
    return this.execute() as Promise<SupabaseLikeResult<Tables<T>>>;
  }

  maybeSingle() {
    this.expectMaybeSingle = true;
    return this.execute() as Promise<SupabaseLikeResult<Tables<T> | null>>;
  }

  async execute(): Promise<SupabaseLikeResult<Tables<T>[]>> {
    const { data, error } = await apiRequest<{ data?: Tables<T>[] } | Tables<T>[]>('/query', {
      method: 'POST',
      body: JSON.stringify({
        table: this.table,
        op: this.mode,
        select: this.selected,
        filters: this.filters,
        values: this.values,
        order: this.orderBy,
        range: this.limitRange,
        single: this.expectSingle,
        maybeSingle: this.expectMaybeSingle,
        returning: this.wantsReturning,
        onConflict: this.onConflictColumn,
      }),
    });

    if (error) return { data: null, error };

    if (data && typeof data === 'object' && 'data' in data) {
      return { data: (data as { data: Tables<T>[] }).data, error: null };
    }

    return { data: data as Tables<T>[], error: null };
  }

  then(resolve: (value: SupabaseLikeResult<Tables<T>[]>) => void, reject?: (reason: unknown) => void) {
    return this.execute().then(resolve, reject);
  }
}

// ── Exported client ───────────────────────────────────────────────────────────

export const supabase = {
  auth: {
    async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, string> } }) {
      const meta = options?.data || {};
      const { data, error } = await apiRequest<LoginResponse>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          fullName: meta.full_name || '',
          club: meta.club || '',
          role: meta.role || 'scout',
          referralCode: meta.referral_code || '',
        }),
      }, false);

      if (error || !data) return { data: { user: null, session: null }, error };

      if (data.session) {
        setStoredSession(data.session);
        notify('SIGNED_IN', data.session);
      }

      return { data: { user: data.user, session: data.session }, error: null };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const { data, error } = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }, false);

      if (error) return { data: { user: null, session: null }, error };

      // 2FA required — return special payload without setting session
      if (data?.requires2FA) {
        return { data: { requires2FA: true, userId: data.userId, user: null, session: null }, error: null };
      }

      if (!data?.session) return { data: { user: null, session: null }, error };

      setStoredSession(data.session);
      notify('SIGNED_IN', data.session);
      return { data: { user: data.user, session: data.session }, error: null };
    },

    async validate2FA(userId: string, code: string) {
      const { data, error } = await apiRequest<LoginResponse>('/auth/2fa/validate', {
        method: 'POST',
        body: JSON.stringify({ userId, code }),
      }, false);

      if (error || !data?.session) return { data: null, error: error || new Error('Validation failed') };

      setStoredSession(data.session);
      notify('SIGNED_IN', data.session);
      return { data: { user: data.user, session: data.session }, error: null };
    },

    async signOut() {
      await apiRequest('/auth/signout', { method: 'POST' });
      setStoredSession(null);
      notify('SIGNED_OUT', null);
      return { error: null };
    },

    async getSession() {
      const current = getStoredSession();
      if (!current) return { data: { session: null }, error: null };

      const { data, error } = await apiRequest<SessionResponse>('/auth/session', { method: 'GET' });
      if (error) return { data: { session: null }, error };

      const session = data?.session || null;
      if (session) {
        setStoredSession(session);
        notify('TOKEN_REFRESHED', session);
      } else {
        setStoredSession(null);
      }

      return { data: { session }, error: null };
    },

    async getUser() {
      const { data, error } = await apiRequest<UserResponse>('/auth/user', { method: 'GET' });
      if (error) return { data: { user: null }, error };
      return { data: { user: data?.user || null }, error: null };
    },

    onAuthStateChange(callback: AuthChangeCallback) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(callback),
          },
        },
      };
    },

    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
      const { error } = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, redirectTo: options?.redirectTo }),
      }, false);
      return { data: {}, error };
    },

    async resetPasswordWithToken(token: string, password: string) {
      const { data, error } = await apiRequest<LoginResponse>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }, false);
      if (error) return { data: null, error };
      if (data?.session) {
        setStoredSession(data.session);
        notify('SIGNED_IN', data.session);
      }
      return { data, error: null };
    },

    async updateUser(updates: { email?: string; password?: string }) {
      const { data, error } = await apiRequest<LoginResponse>('/auth/user', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      if (error) return { data: null, error };

      if (data?.session) {
        setStoredSession(data.session);
        notify('USER_UPDATED', data.session);
      }

      return { data, error: null };
    },
  },

  from<T extends TableName>(table: T) {
    return new QueryBuilder(table);
  },

  async rpc<F extends FunctionName>(name: F, args: FunctionArgs<F>) {
    const { data, error } = await apiRequest<{ data?: FunctionReturns<F> } | FunctionReturns<F>>(`/rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(args || {}),
    });

    if (error) return { data: null, error };
    const result = (data && typeof data === 'object' && 'data' in data)
      ? (data as { data: FunctionReturns<F> }).data
      : data as FunctionReturns<F>;
    return { data: result ?? null, error: null } as SupabaseLikeResult<FunctionReturns<F>>;
  },

  functions: {
    async invoke(name: string, options?: { body?: Record<string, unknown> }) {
      const { data, error } = await apiRequest<unknown>(`/functions/${name}`, {
        method: 'POST',
        body: JSON.stringify(options?.body || {}),
      });

      return { data, error: error || null };
    },
  },

  storage: {
    from(bucket: string) {
      return {
        async upload(_fileName: string, file: File, _options?: Record<string, unknown>) {
          const form = new FormData();
          form.append('file', file);
          form.append('fileName', _fileName);

          const { data, error } = await apiRequest<{ path: string }>(`/storage/${bucket}/upload`, {
            method: 'POST',
            body: form,
          });

          if (error) return { data: null, error };
          return { data, error: null };
        },

        getPublicUrl(fileName: string) {
          // If fileName is already an absolute URL (e.g. Vercel Blob CDN URL), return as-is
          if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
            return { data: { publicUrl: fileName } };
          }
          return {
            data: {
              publicUrl: PUBLIC_BASE ? `${PUBLIC_BASE}/uploads/${fileName}` : `/uploads/${fileName}`,
            },
          };
        },
      };
    },
  },
};
