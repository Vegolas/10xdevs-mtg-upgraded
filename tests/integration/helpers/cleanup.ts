import { admin } from "./owners";

/**
 * Service-role teardown. Deleting an owner cascades to their `upgrade_paths`
 * and `path_steps` via `on delete cascade`, so each test/file can remove
 * everything it created by id — keeping the suite independent and re-runnable.
 */

/** Delete a single test owner (and, by cascade, all their paths + steps). */
export async function deleteOwner(userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`deleteOwner(${userId}) failed: ${error.message}`);
  }
}

/** Delete several owners; tolerant of ids already gone so cleanup never masks a test failure. */
export async function deleteOwners(userIds: readonly string[]): Promise<void> {
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
}
