import { findRtlIssues, hasRtlIssues } from './rtl.lint';

describe('findRtlIssues', () => {
  it('flags physical margin and padding', () => {
    expect(hasRtlIssues('flex ml-[8px]')).toBe(true);
    expect(hasRtlIssues('flex mr-2')).toBe(true);
    expect(hasRtlIssues('pl-[16px] pr-[12px]')).toBe(true);
  });

  it('accepts the logical equivalents', () => {
    expect(findRtlIssues('flex ms-[8px] me-2 ps-[16px] pe-[12px]')).toEqual([]);
  });

  it('flags physical text alignment and corners', () => {
    expect(hasRtlIssues('text-left')).toBe(true);
    expect(hasRtlIssues('text-right')).toBe(true);
    expect(hasRtlIssues('rounded-tl-lg')).toBe(true);
    expect(hasRtlIssues('rounded-br-[10px]')).toBe(true);
    expect(findRtlIssues('rounded-ss-lg rounded-ee-[10px] text-start')).toEqual(
      []
    );
  });

  it('leaves an explicit rtl: override alone', () => {
    expect(hasRtlIssues('rtl:rotate-180')).toBe(false);
    expect(hasRtlIssues('rtl:ml-2')).toBe(false);
  });

  it('does not flag centring — translate-x does not flip', () => {
    expect(hasRtlIssues('absolute left-[50%] -translate-x-[50%]')).toBe(false);
    expect(hasRtlIssues('absolute left-1/2 -translate-x-1/2')).toBe(false);
  });

  it('does not flag a full-cover overlay, where left-0 and start-0 are identical', () => {
    expect(hasRtlIssues('absolute left-0 top-0 w-full h-full')).toBe(false);
  });

  it('DOES flag an offset position that is not full-cover', () => {
    expect(hasRtlIssues('absolute right-[4px] -top-[7px]')).toBe(true);
  });

  it('explains what to use instead', () => {
    expect(findRtlIssues('ml-2')[0].reason).toContain('ms-');
  });

  it('is safe on empty input', () => {
    expect(findRtlIssues('')).toEqual([]);
    expect(findRtlIssues(undefined as any)).toEqual([]);
  });
});
