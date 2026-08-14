/**
 * Who may change PLATFORM-WIDE configuration.
 *
 * `AiProviderConfig.provider` is `@unique` globally: there is one row per
 * provider for the whole installation, holding the operator's own API key and
 * his commercial arrangement with that vendor. It is not tenant data.
 *
 * It was nevertheless gated with `@OrgRoles(Role.SUPERADMIN)` — an ORGANIZATION
 * role. Every org owner is SUPERADMIN of their own org, so the first outside
 * agency onboarded onto this install could have overwritten the platform's AI
 * key, pointed `endpoint` at a server they control, and read every prompt sent
 * by every other tenant. Not reachable today only because self-registration is
 * disabled — and the entire point of the current work is to onboard a second
 * agency.
 *
 * An org role can never authorise a platform-wide change. This is the
 * platform-level test instead.
 *
 * FAIL CLOSED. With `User.isSuperAdmin` unset on every row (nothing in this
 * codebase ever sets it) and `SUPERADMIN_EMAILS` unconfigured, nobody qualifies
 * and the affected routes refuse everyone. That is the correct failure
 * direction for a key that grants read access to other tenants' prompts: losing
 * a settings page is recoverable, leaking the platform key is not.
 */
export function platformOwnerEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformOwner(
  user: { isSuperAdmin?: boolean | null; email?: string | null } | null | undefined
): boolean {
  if (!user) {
    return false;
  }

  // The database flag stays authoritative — it is what upstream Postiz means by
  // a platform admin, and impersonation already relies on it.
  if (user.isSuperAdmin === true) {
    return true;
  }

  if (!user.email) {
    return false;
  }

  return platformOwnerEmails().includes(user.email.toLowerCase());
}
