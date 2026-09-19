/**
 * The background drift layer sits behind every frosted-glass panel. Animated
 * smoothly under a blur filter it forced all of them to re-blur every frame
 * (performance baseline 2026-09-19). Keep it cheap.
 */
import { readFileSync } from 'fs';

const scss = readFileSync('apps/frontend/src/app/global.scss', 'utf8');
const rule = scss.slice(scss.indexOf('body::before {'), scss.indexOf('}', scss.indexOf('body::before {')));

describe('background drift layer', () => {
  it('has no filter (softness lives in the gradient stops)', () => {
    expect(rule).not.toMatch(/\bfilter\s*:/);
  });
  it('steps its animation instead of repainting every frame', () => {
    expect(rule).toMatch(/animation:\s*mo-drift[^;]*steps\(\d+\)/);
  });
  it('still stops completely for reduced-motion users', () => {
    expect(scss).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*body::before\s*\{\s*animation:\s*none/);
  });
});
