import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The timezone has to be REACHABLE, not merely implemented.
 *
 * Both halves of this feature shipped commented out and stayed that way:
 * `{/*<SetTimezone />*}` in the app layout, and the whole timezone `<Select>` in
 * the settings panel. So the code read as if a user could choose a timezone
 * while in fact nobody could, the value lived in `localStorage` alone, and the
 * same person on two devices turned one typed time into two different UTC
 * instants.
 *
 * A type check cannot see this and neither can a unit test of the helpers —
 * commented-out JSX is simply absent. Only the source can tell us the wiring is
 * still connected, so this is a source check, in the same spirit as
 * `integration.list.key.spec.ts`.
 */

const COMPONENTS = join(__dirname, '..');
const FRONTEND_SRC = join(__dirname, '..', '..');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' ? [] : walk(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

const read = (...segments: string[]) =>
  readFileSync(join(COMPONENTS, ...segments), 'utf8');

/**
 * Strips comments so that prose about the rule — including the JSX quoted in
 * this file's own header — never counts as satisfying it.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('timezone wiring', () => {
  it('mounts TimezoneSync inside the user context', () => {
    const layout = stripComments(
      read('new-layout', 'layout.component.tsx')
    );

    expect(layout).toContain('<TimezoneSync />');
    // Inside the context, not merely present in the file: the component reads
    // the account's timezone through `useUser()` and is inert without it.
    const contextOpens = layout.indexOf('<ContextWrapper');
    expect(contextOpens).toBeGreaterThan(-1);
    expect(layout.indexOf('<TimezoneSync />')).toBeGreaterThan(contextOpens);
  });

  it('mounts TimezoneSync on the client portal too', () => {
    // Clients read approval deadlines and publish times. A client seeing a
    // different clock from the manager who scheduled the post is the same bug
    // wearing a different hat.
    const layout = stripComments(read('new-layout', 'layout.component.tsx'));
    const mounts = layout.match(/<TimezoneSync \/>/g) ?? [];
    expect(mounts.length).toBe(2);
  });

  it('offers the timezone selector in settings', () => {
    const settings = stripComments(read('settings', 'metric.component.tsx'));

    expect(settings).toMatch(/name="timezone"/);
    expect(settings).toContain('/user/timezone');
  });

  it('does not use the one dayjs method the .local() patch changes', () => {
    // `.local()` is redefined app-wide to mean "the user's timezone". dayjs
    // calls it internally from the SETTER form of `utcOffset(value)`, which
    // therefore behaves differently from the library's documentation. Nothing
    // uses that form today — only the argument-less getter — and this keeps it
    // that way, so the redefinition stays invisible instead of becoming a trap.
    const setterForm = /\.utcOffset\(\s*[^)\s]/;

    const offenders = walk(FRONTEND_SRC)
      .filter((file) => !/\.spec\.tsx?$/.test(file))
      .filter((file) => setterForm.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(FRONTEND_SRC.length + 1));

    expect(offenders).toEqual([]);
  });

  it('resolves the account value ahead of the device cache', () => {
    // Guards the guard: if `set.timezone` stopped consulting the account, the
    // two checks above would still pass while the bug came straight back.
    const source = stripComments(read('layout', 'set.timezone.tsx'));

    expect(source).toContain('resolveTimezone');
    expect(source).toMatch(/account:\s*accountTimezone/);
  });
});
