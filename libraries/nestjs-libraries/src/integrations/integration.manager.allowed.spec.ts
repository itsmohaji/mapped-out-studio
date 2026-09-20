/**
 * The allow-list must block CONNECTING an unsupported provider while leaving
 * already-connected channels fully functional (owner: do not break integrations).
 */
// The real registry loads all 33 provider classes; a few pull ESM-only deps
// that jest cannot transform. They are only needed at call time, not to build
// the registry, so stub the modules.
jest.mock('bcrypt', () => ({}));
jest.mock('nostr-tools', () => ({ getPublicKey: () => '', Relay: class {}, finalizeEvent: () => ({}), SimplePool: class {} }));
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { SUPPORTED_SOCIAL_PROVIDERS } from '@gitroom/nestjs-libraries/integrations/supported.providers';

const manager = new IntegrationManager();

describe('getAllowedSocialsIntegrations', () => {
  it('allows exactly the supported set — every connect entry point checks this', () => {
    expect(manager.getAllowedSocialsIntegrations().sort()).toEqual(
      [...SUPPORTED_SOCIAL_PROVIDERS].sort()
    );
  });

  it.each(['reddit', 'telegram', 'bluesky', 'gmb', 'medium'])('does not allow connecting %s', (id) => {
    expect(manager.getAllowedSocialsIntegrations()).not.toContain(id);
  });

  it('still resolves hidden providers, so channels already connected keep posting', () => {
    for (const id of ['reddit', 'telegram', 'bluesky', 'gmb', 'medium', 'mastodon']) {
      expect(manager.getSocialIntegration(id)?.identifier).toBe(id);
    }
  });

  it('resolves every supported provider', () => {
    for (const id of SUPPORTED_SOCIAL_PROVIDERS) {
      expect(manager.getSocialIntegration(id)?.identifier).toBe(id);
    }
  });
});
