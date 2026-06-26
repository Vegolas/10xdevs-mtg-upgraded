/**
 * Hand-written Postgres schema types for the cookie-bound Supabase client
 * (user-accounts). Mirrors the `upgrade_paths` / `path_steps` tables from the
 * first migration (`supabase/migrations/20260626121519_user_accounts_paths.sql`).
 *
 * Parametrizing `createServerClient<Database>` makes every `.from(...)` query
 * return typed rows instead of `any`, which keeps the strict-type-checked lint
 * clean and gives the API handlers real column types. Shaped to match Supabase's
 * generated-types layout so it can be swapped for `supabase gen types` output
 * later without touching call sites.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      upgrade_paths: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          visibility: "private" | "unlisted";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          visibility?: "private" | "unlisted";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          visibility?: "private" | "unlisted";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      path_steps: {
        Row: {
          id: string;
          path_id: string;
          position: number;
          name: string;
          list_text: string;
          snapshot: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          path_id: string;
          position: number;
          name: string;
          list_text: string;
          snapshot: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          path_id?: string;
          position?: number;
          name?: string;
          list_text?: string;
          snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "path_steps_path_id_fkey";
            columns: ["path_id"];
            isOneToOne: false;
            referencedRelation: "upgrade_paths";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
