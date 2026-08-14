/**
 * Deriving the Mapped Out client ↔ DBU client link from data that already exists.
 *
 * Channels are grouped TWICE today: by `Integration.customerId` (what the Clients
 * page shows) and, in parallel, by `Integration.dbuClientId` (mirrored from DBU).
 * `Customer.dbuClientId` was designed to reconcile the two and has never been
 * written by anything.
 *
 * The link does not need to be invented, because every channel already carries
 * BOTH ids. Where a client's channels agree on which DBU client they belong to,
 * that agreement IS the mapping — it only has to be recorded.
 *
 * `Customer` is canonical and stays canonical: Mapped Out is becoming a SaaS
 * where other agencies never touch DBU, so a DBU id can only ever be an optional
 * attribute of a Mapped Out client, never its identity. Permissions already
 * depend on `Customer` too.
 *
 * Pure on purpose. Everything here is decided from rows passed in, so the plan
 * can be shown to a human and unit-tested without a database.
 */

export interface LinkIntegrationRow {
  id: string;
  name?: string | null;
  customerId?: string | null;
  dbuClientId?: string | null;
  dbuClientName?: string | null;
}

export interface LinkCustomerRow {
  id: string;
  name?: string | null;
  dbuClientId?: string | null;
}

/** A client whose channels agree on one DBU client. Recording it creates nothing. */
export interface DerivedLink {
  customerId: string;
  customerName: string;
  dbuClientId: string;
  dbuClientName: string;
  channelCount: number;
}

/** A DBU client whose channels belong to no Mapped Out client yet. */
export interface DerivedCreate {
  dbuClientId: string;
  dbuClientName: string;
  channelIds: string[];
  channelNames: string[];
}

/** Anything ambiguous. NEVER guessed — surfaced for a human to settle. */
export interface DerivedConflict {
  reason:
    | 'channels-disagree'
    | 'already-linked-elsewhere'
    | 'dbu-client-claimed-twice';
  customerId?: string;
  customerName?: string;
  dbuClientId?: string;
  dbuClientName?: string;
  detail: string;
}

export interface DbuLinkPlan {
  links: DerivedLink[];
  creates: DerivedCreate[];
  conflicts: DerivedConflict[];
  /** Already recorded. Present so a second run visibly does nothing. */
  alreadyLinked: number;
  /** Channels with no DBU client at all — untouched, counted for the report. */
  channelsWithoutDbuClient: number;
}

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' && v.trim() ? v : fallback;

export function deriveDbuCustomerLinks(
  integrations: LinkIntegrationRow[],
  customers: LinkCustomerRow[]
): DbuLinkPlan {
  const rows = Array.isArray(integrations) ? integrations : [];
  const customerRows = Array.isArray(customers) ? customers : [];

  const customerById = new Map(customerRows.map((c) => [str(c.id), c]));

  const conflicts: DerivedConflict[] = [];
  let channelsWithoutDbuClient = 0;

  // What each client's channels claim their DBU client is.
  const claimsByCustomer = new Map<string, Map<string, string>>();
  const channelCountByCustomerClient = new Map<string, number>();
  // Channels carrying a DBU client but sitting in no Mapped Out client.
  const orphansByDbuClient = new Map<string, DerivedCreate>();

  for (const row of rows) {
    const dbuClientId = str(row.dbuClientId);
    if (!dbuClientId) {
      channelsWithoutDbuClient++;
      continue;
    }

    const dbuClientName = str(row.dbuClientName, dbuClientId);
    const customerId = str(row.customerId);

    if (!customerId) {
      const existing = orphansByDbuClient.get(dbuClientId) || {
        dbuClientId,
        dbuClientName,
        channelIds: [],
        channelNames: [],
      };
      existing.channelIds.push(str(row.id));
      existing.channelNames.push(str(row.name, 'Unnamed channel'));
      orphansByDbuClient.set(dbuClientId, existing);
      continue;
    }

    const claims = claimsByCustomer.get(customerId) || new Map<string, string>();
    claims.set(dbuClientId, dbuClientName);
    claimsByCustomer.set(customerId, claims);

    const key = `${customerId}::${dbuClientId}`;
    channelCountByCustomerClient.set(
      key,
      (channelCountByCustomerClient.get(key) || 0) + 1
    );
  }

  const links: DerivedLink[] = [];
  let alreadyLinked = 0;

  for (const [customerId, claims] of claimsByCustomer) {
    const customer = customerById.get(customerId);
    const customerName = str(customer?.name, customerId);

    if (claims.size > 1) {
      // Two clients' channels in one Mapped Out client. Picking a winner here
      // would silently reassign somebody's channels.
      conflicts.push({
        reason: 'channels-disagree',
        customerId,
        customerName,
        detail: `Channels in "${customerName}" point at ${claims.size} different DBU clients: ${[
          ...claims.values(),
        ].join(', ')}. Not linked — split the channels first.`,
      });
      continue;
    }

    const [dbuClientId, dbuClientName] = [...claims.entries()][0];
    const existingLink = str(customer?.dbuClientId);

    if (existingLink) {
      if (existingLink === dbuClientId) {
        alreadyLinked++;
      } else {
        conflicts.push({
          reason: 'already-linked-elsewhere',
          customerId,
          customerName,
          dbuClientId,
          dbuClientName,
          detail: `"${customerName}" is already linked to a different DBU client. Its channels say "${dbuClientName}". Left alone.`,
        });
      }
      continue;
    }

    links.push({
      customerId,
      customerName,
      dbuClientId,
      dbuClientName,
      channelCount:
        channelCountByCustomerClient.get(`${customerId}::${dbuClientId}`) || 0,
    });
  }

  // One DBU client must not end up on two Mapped Out clients — that would make
  // "which client is this?" ambiguous in the direction we are about to rely on.
  const seenDbuClient = new Map<string, string>();
  const contested = new Set<string>();
  for (const customer of customerRows) {
    const linked = str(customer.dbuClientId);
    if (linked) {
      seenDbuClient.set(linked, str(customer.name, customer.id));
    }
  }
  const claimants = new Map<string, string[]>();
  for (const link of links) {
    claimants.set(link.dbuClientId, [
      ...(claimants.get(link.dbuClientId) || []),
      link.customerName,
    ]);
  }

  for (const link of links) {
    const alreadyLinkedTo = seenDbuClient.get(link.dbuClientId);
    const alsoClaimedBy = claimants.get(link.dbuClientId) || [];

    if (alreadyLinkedTo || alsoClaimedBy.length > 1) {
      // NEITHER side is linked. Two Mapped Out clients pointing at one DBU
      // client means there is a duplicate client record, and picking a winner
      // would be a guess that silently decides which of them owns the channels.
      // Report it and let a human merge them.
      if (!contested.has(link.dbuClientId)) {
        contested.add(link.dbuClientId);
        const names = alreadyLinkedTo
          ? [alreadyLinkedTo, ...alsoClaimedBy]
          : alsoClaimedBy;
        conflicts.push({
          reason: 'dbu-client-claimed-twice',
          dbuClientId: link.dbuClientId,
          dbuClientName: link.dbuClientName,
          detail: `DBU client "${link.dbuClientName}" is claimed by more than one Mapped Out client: ${names.join(
            ', '
          )}. None were linked — merge them first.`,
        });
      }
      continue;
    }

    seenDbuClient.set(link.dbuClientId, link.customerName);
  }

  return {
    links: links.filter((l) => !contested.has(l.dbuClientId)),
    // A DBU client that is getting linked to an existing client does not also
    // need a new one created for its unassigned channels.
    creates: [...orphansByDbuClient.values()].filter(
      (create) => !seenDbuClient.has(create.dbuClientId)
    ),
    conflicts,
    alreadyLinked,
    channelsWithoutDbuClient,
  };
}
