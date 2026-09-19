/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
import { lockUi, resetUiLock } from '@gitroom/frontend/components/layout/ui.lock';

const locked = () => document.body.hasAttribute('data-ui-locked');

afterEach(() => resetUiLock());

describe('page lock', () => {
  it('locks while held and unlocks on release', () => {
    const release = lockUi();
    expect(locked()).toBe(true);
    release();
    expect(locked()).toBe(false);
  });

  it('one holder releasing does not unlock the page for another', () => {
    // e.g. the payment check spinner and a modal at the same time
    const a = lockUi();
    const b = lockUi();
    a();
    expect(locked()).toBe(true);
    b();
    expect(locked()).toBe(false);
  });

  it('releasing twice cannot steal someone else’s lock', () => {
    const a = lockUi();
    const b = lockUi();
    a();
    a();
    expect(locked()).toBe(true);
    b();
    expect(locked()).toBe(false);
  });

  it('reset clears everything, for the global error page', () => {
    lockUi();
    lockUi();
    resetUiLock();
    expect(locked()).toBe(false);
    const again = lockUi();
    again();
    expect(locked()).toBe(false);
  });
});
