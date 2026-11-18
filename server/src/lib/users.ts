import type { Db } from "../db.js";
import type { Env } from "../env.js";

export interface UserContact {
  email: string | null;
  name: string | null;
}

/**
 * Looks up people by user id for contact details (e.g. the organizer on a
 * venue request). Supabase keeps users in auth.users; self-hosted auth keeps
 * them in app_users. `profiles` (display name, phone) is shared by both.
 */
export function createUserDirectory(env: Env, db: Db) {
  return {
    async contacts(ids: string[]): Promise<Map<string, UserContact>> {
      const out = new Map<string, UserContact>();
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return out;

      if (env.AUTH_PROVIDER === "local") {
        const rows = await db.app_users.findMany({
          where: { id: { in: unique } },
          select: { id: true, email: true, display_name: true },
        });
        for (const r of rows) out.set(r.id, { email: r.email, name: r.display_name });
        return out;
      }

      try {
        const rows = await db.$queryRaw<Array<{ id: string; email: string | null; name: string | null }>>`
          select u.id::text as id,
                 u.email::text as email,
                 u.raw_user_meta_data ->> 'display_name' as name
            from auth.users u
           where u.id = any(${unique}::uuid[])`;
        for (const r of rows) out.set(r.id, { email: r.email, name: r.name });
      } catch {
        // auth schema not reachable with this role: fall back to profiles only.
      }
      return out;
    },

    async email(id: string): Promise<string | null> {
      return (await this.contacts([id])).get(id)?.email ?? null;
    },
  };
}

export type UserDirectory = ReturnType<typeof createUserDirectory>;
