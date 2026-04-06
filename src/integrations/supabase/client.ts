// MySQL-backed client compatible with the subset of Supabase APIs used by this app.

type AuthUser = {
  id: string;
  email: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string | null;
};

type AuthSession = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
};

type SupabaseLikeResult<T = any> = {
  data: T | null;
  error: any;
};

type QueryFilter = { col: string; op?: string; value: any };

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

async function apiRequest<T = any>(path: string, init: RequestInit = {}, auth = true): Promise<SupabaseLikeResult<T>> {
  try {
    const session = getStoredSession();
    const headers = new Headers(init.headers || {});

    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (auth && session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
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

class QueryBuilder {
  private table: string;
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: QueryFilter[] = [];
  private selected = '*';
  private values: any = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitRange: { from: number; to: number } | null = null;
  private expectSingle = false;
  private expectMaybeSingle = false;
  private wantsReturning = false;
  private onConflictColumn: string | undefined;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*') {
    this.selected = columns;
    if (this.mode === 'select') return this;
    this.wantsReturning = true;
    return this;
  }

  eq(col: string, value: any) {
    this.filters.push({ col, value });
    return this;
  }

  in(col: string, values: any[]) {
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

  insert(values: any) {
    this.mode = 'insert';
    this.values = values;
    return this;
  }

  update(values: any) {
    this.mode = 'update';
    this.values = values;
    return this;
  }

  upsert(values: any, options?: { onConflict?: string }) {
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
    return this.execute();
  }

  maybeSingle() {
    this.expectMaybeSingle = true;
    return this.execute();
  }

  async execute(): Promise<SupabaseLikeResult<any>> {
    const { data, error } = await apiRequest<any>('/query', {
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

    if (data && Object.prototype.hasOwnProperty.call(data, 'data')) {
      return { data: data.data, error: null };
    }

    return { data, error: null };
  }

  then(resolve: (value: SupabaseLikeResult<any>) => void, reject?: (reason: any) => void) {
    return this.execute().then(resolve, reject);
  }
}

export const supabase = {
  auth: {
    async signUp({ email, password, options }: { email: string; password: string; options?: any }) {
      const meta = options?.data || {};
      const { data, error } = await apiRequest<any>('/auth/signup', {
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
      const { data, error } = await apiRequest<any>('/auth/login', {
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
      const { data, error } = await apiRequest<any>('/auth/2fa/validate', {
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
      if (!current?.access_token) return { data: { session: null }, error: null };

      const { data, error } = await apiRequest<any>('/auth/session', { method: 'GET' });
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
      const { data, error } = await apiRequest<any>('/auth/user', { method: 'GET' });
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
      const { error } = await apiRequest<any>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, redirectTo: options?.redirectTo }),
      }, false);
      return { data: {}, error };
    },

    async resetPasswordWithToken(token: string, password: string) {
      const { data, error } = await apiRequest<any>('/auth/reset-password', {
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
      const { data, error } = await apiRequest<any>('/auth/user', {
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

  from(table: string) {
    return new QueryBuilder(table);
  },

  async rpc(name: string, args: Record<string, any>) {
    const { data, error } = await apiRequest<any>(`/rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(args || {}),
    });

    if (error) return { data: null, error };
    return { data: data?.data ?? data, error: null };
  },

  functions: {
    async invoke(name: string, options?: { body?: any }) {
      const { data, error } = await apiRequest<any>(`/functions/${name}`, {
        method: 'POST',
        body: JSON.stringify(options?.body || {}),
      });

      return { data, error: error || null };
    },
  },

  storage: {
    from(bucket: string) {
      return {
        async upload(_fileName: string, file: File, _options?: any) {
          const form = new FormData();
          form.append('file', file);
          form.append('fileName', _fileName);

          const { data, error } = await apiRequest<any>(`/storage/${bucket}/upload`, {
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

