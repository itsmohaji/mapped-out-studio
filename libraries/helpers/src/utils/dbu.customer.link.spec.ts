import { deriveDbuCustomerLinks } from './dbu.customer.link';

describe('deriveDbuCustomerLinks', () => {
  it('records the link when a client\'s channels agree, creating nothing', () => {
    const plan = deriveDbuCustomerLinks(
      [
        { id: 'i1', name: 'Epoque IG', customerId: 'c1', dbuClientId: 'd1', dbuClientName: 'Époque' },
        { id: 'i2', name: 'Epoque FB', customerId: 'c1', dbuClientId: 'd1', dbuClientName: 'Époque' },
      ],
      [{ id: 'c1', name: 'Époque', dbuClientId: null }]
    );

    expect(plan.links).toEqual([
      {
        customerId: 'c1',
        customerName: 'Époque',
        dbuClientId: 'd1',
        dbuClientName: 'Époque',
        channelCount: 2,
      },
    ]);
    expect(plan.creates).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it('proposes a new client only for channels in no client at all', () => {
    const plan = deriveDbuCustomerLinks(
      [{ id: 'i1', name: 'Solo TikTok', customerId: null, dbuClientId: 'd9', dbuClientName: 'New Client' }],
      []
    );

    expect(plan.links).toEqual([]);
    expect(plan.creates).toEqual([
      {
        dbuClientId: 'd9',
        dbuClientName: 'New Client',
        channelIds: ['i1'],
        channelNames: ['Solo TikTok'],
      },
    ]);
  });

  it('does not also create when the same DBU client is being linked to an existing client', () => {
    // One channel grouped, one not. The ungrouped one belongs to the client we
    // are about to link — creating a second record for it would split them.
    const plan = deriveDbuCustomerLinks(
      [
        { id: 'i1', customerId: 'c1', dbuClientId: 'd1', dbuClientName: 'Époque' },
        { id: 'i2', customerId: null, dbuClientId: 'd1', dbuClientName: 'Époque' },
      ],
      [{ id: 'c1', name: 'Époque' }]
    );

    expect(plan.links).toHaveLength(1);
    expect(plan.creates).toEqual([]);
  });

  it('refuses to guess when one client\'s channels name two DBU clients', () => {
    const plan = deriveDbuCustomerLinks(
      [
        { id: 'i1', customerId: 'c1', dbuClientId: 'd1', dbuClientName: 'Époque' },
        { id: 'i2', customerId: 'c1', dbuClientId: 'd2', dbuClientName: 'Other' },
      ],
      [{ id: 'c1', name: 'Mixed' }]
    );

    expect(plan.links).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].reason).toBe('channels-disagree');
  });

  it('refuses to move a client that is already linked somewhere else', () => {
    const plan = deriveDbuCustomerLinks(
      [{ id: 'i1', customerId: 'c1', dbuClientId: 'd2', dbuClientName: 'Other' }],
      [{ id: 'c1', name: 'Époque', dbuClientId: 'd1' }]
    );

    expect(plan.links).toEqual([]);
    expect(plan.conflicts[0].reason).toBe('already-linked-elsewhere');
  });

  it('never links one DBU client to two Mapped Out clients', () => {
    const plan = deriveDbuCustomerLinks(
      [
        { id: 'i1', customerId: 'c1', dbuClientId: 'd1', dbuClientName: 'Époque' },
        { id: 'i2', customerId: 'c2', dbuClientId: 'd1', dbuClientName: 'Époque' },
      ],
      [
        { id: 'c1', name: 'Époque' },
        { id: 'c2', name: 'Epoque duplicate' },
      ]
    );

    // NEITHER is linked. Two Mapped Out clients pointing at one DBU client is a
    // duplicate client record; choosing a winner would silently decide which of
    // them owns the channels.
    expect(plan.links).toEqual([]);
    expect(plan.conflicts.filter((c) => c.reason === 'dbu-client-claimed-twice')).toHaveLength(1);
  });

  it('is idempotent — a second run proposes nothing', () => {
    const rows = [
      { id: 'i1', customerId: 'c1', dbuClientId: 'd1', dbuClientName: 'Époque' },
    ];
    const plan = deriveDbuCustomerLinks(rows, [
      { id: 'c1', name: 'Époque', dbuClientId: 'd1' },
    ]);

    expect(plan.links).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.alreadyLinked).toBe(1);
  });

  it('leaves non-DBU channels alone and counts them', () => {
    const plan = deriveDbuCustomerLinks(
      [
        { id: 'i1', customerId: 'c1', dbuClientId: null },
        { id: 'i2', customerId: null, dbuClientId: null },
      ],
      [{ id: 'c1', name: 'Social only' }]
    );

    expect(plan.links).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.channelsWithoutDbuClient).toBe(2);
  });

  it('survives empty and malformed input', () => {
    expect(deriveDbuCustomerLinks([], []).links).toEqual([]);
    expect(deriveDbuCustomerLinks(null as any, null as any).creates).toEqual([]);
  });
});
