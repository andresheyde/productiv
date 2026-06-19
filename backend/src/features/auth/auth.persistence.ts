import { queryRuntimeDatabase } from "../../shared/db/postgres.ts";
import type { AuthenticatedUser, GoogleProfile } from "./auth.types.ts";

type UserRow = {
  id: string;
  google_subject: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export async function upsertUserProfile(profile: GoogleProfile) {
  const result = await queryRuntimeDatabase<UserRow>(
    `
      insert into users (
        google_subject,
        email,
        full_name,
        avatar_url
      )
      values ($1, $2, $3, $4)
      on conflict (google_subject)
      do update set
        email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url
      returning id, google_subject, email, full_name, avatar_url
    `,
    [
      profile.googleSubject,
      profile.email,
      profile.fullName,
      profile.avatarUrl,
    ],
  );

  return mapUserRow(result.rows[0]);
}

function mapUserRow(row: UserRow | undefined): AuthenticatedUser {
  if (!row) {
    throw new Error("Expected user upsert to return a row.");
  }

  return {
    id: row.id,
    googleSubject: row.google_subject,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  };
}
