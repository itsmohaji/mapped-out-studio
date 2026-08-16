import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { hasExplicitOffset, toWidgetDate, zonedDayjs } from './dayjs.zone';

dayjs.extend(utc);
dayjs.extend(timezone);

const BAHRAIN = 'Asia/Bahrain'; // UTC+3, no DST
const LONDON = 'Europe/London'; // UTC+1 in August, UTC+0 in January

/**
 * Every assertion below is stated in absolute terms — a wall-clock plus a zone
 * on one side, a UTC instant on the other. Nothing depends on the timezone of
 * the machine running the suite, which is the whole point: two devices in two
 * zones must agree, and a test that leaned on the local zone could not tell us
 * they do.
 */
describe('zonedDayjs', () => {
  it('reads a typed wall-clock as being in the chosen zone', () => {
    // The composer's write path: 9am typed in Bahrain is 06:00 UTC, whatever
    // the browser thinks its own timezone is.
    expect(
      zonedDayjs(dayjs, BAHRAIN, '2026-08-16 09:00:00')
        .utc()
        .format('YYYY-MM-DDTHH:mm:ss')
    ).toBe('2026-08-16T06:00:00');
  });

  it('keeps the instant of a value that already carries an offset', () => {
    // The read path: a publishDate off the API is an instant, and must not be
    // re-read as a wall-clock — that would move the post by the zone's offset.
    expect(
      zonedDayjs(dayjs, BAHRAIN, '2026-08-16T06:00:00.000Z').format(
        'YYYY-MM-DD HH:mm'
      )
    ).toBe('2026-08-16 09:00');

    expect(
      zonedDayjs(dayjs, BAHRAIN, '2026-08-16T07:00:00+01:00').format(
        'YYYY-MM-DD HH:mm'
      )
    ).toBe('2026-08-16 09:00');
  });

  it('re-expresses a Date or timestamp without moving it', () => {
    const instant = new Date('2026-08-16T06:00:00.000Z');

    expect(zonedDayjs(dayjs, BAHRAIN, instant).format('HH:mm')).toBe('09:00');
    expect(zonedDayjs(dayjs, BAHRAIN, instant.getTime()).format('HH:mm')).toBe(
      '09:00'
    );
  });

  it('round-trips a wall-clock through UTC and back', () => {
    // Type 9am, store, read back, still 9am. The single property the whole
    // feature rests on.
    const typed = zonedDayjs(dayjs, BAHRAIN, '2026-08-16 09:00:00');
    const stored = typed.utc().format('YYYY-MM-DDTHH:mm:ss') + 'Z';

    expect(zonedDayjs(dayjs, BAHRAIN, stored).format('HH:mm')).toBe('09:00');
  });

  it('agrees across devices — the bug this exists to kill', () => {
    // Two browsers, two zones, one account. Both must produce the same instant
    // for the same typed time, and show the same clock for the same instant.
    const typedInLondon = zonedDayjs(dayjs, BAHRAIN, '2026-08-16 09:00:00');
    const typedInBahrain = zonedDayjs(dayjs, BAHRAIN, '2026-08-16 09:00:00');

    expect(typedInLondon.valueOf()).toBe(typedInBahrain.valueOf());
    expect(typedInLondon.utc().format()).toBe('2026-08-16T06:00:00Z');
  });

  it('honours daylight saving, which the legacy numeric offset cannot', () => {
    // Same zone, same wall-clock, two sides of the DST boundary: the offset is
    // +01:00 in August and +00:00 in January. A stored integer offset gets one
    // of these two wrong for half the year.
    expect(
      zonedDayjs(dayjs, LONDON, '2026-08-16 09:00:00').utc().format('HH:mm')
    ).toBe('08:00');
    expect(
      zonedDayjs(dayjs, LONDON, '2026-01-16 09:00:00').utc().format('HH:mm')
    ).toBe('09:00');
  });

  it('reads a bare calendar day as midnight in the zone', () => {
    // Calendar range filters send `YYYY-MM-DD`. In Bahrain the day starts at
    // 21:00 UTC the evening before; read in the wrong zone, the first and last
    // posts of a range fall outside it.
    expect(
      zonedDayjs(dayjs, BAHRAIN, '2026-08-16').startOf('day').utc().format()
    ).toBe('2026-08-15T21:00:00Z');
  });

  it('builds "now" as the same instant, only expressed differently', () => {
    const now = zonedDayjs(dayjs, BAHRAIN);
    expect(Math.abs(now.valueOf() - Date.now())).toBeLessThan(1000);
  });
});

describe('hasExplicitOffset', () => {
  it('recognises the forms an API actually sends', () => {
    expect(hasExplicitOffset('2026-08-16T06:00:00.000Z')).toBe(true);
    expect(hasExplicitOffset('2026-08-16T06:00:00+03:00')).toBe(true);
    expect(hasExplicitOffset('2026-08-16T06:00:00-0500')).toBe(true);
    expect(hasExplicitOffset('  2026-08-16T06:00:00Z  ')).toBe(true);
  });

  it('treats the app\'s own wall-clock formats as zone-less', () => {
    // What the backend stores and what the pickers produce.
    expect(hasExplicitOffset('2026-08-16T06:00:00')).toBe(false);
    expect(hasExplicitOffset('2026-08-16 06:00:00')).toBe(false);
    expect(hasExplicitOffset('2026-08-16')).toBe(false);
  });
});

describe('toWidgetDate', () => {
  it('hands a picker the clock the user is reading, not the instant', () => {
    // A Mantine Calendar/TimeInput reads a Date's components in the browser's
    // zone. Given the instant it would show the browser's clock; given this it
    // shows the same digits as the rest of the app.
    const zoned = zonedDayjs(dayjs, BAHRAIN, '2026-08-16 09:30:15');
    const widget = toWidgetDate(zoned);

    expect(widget.getFullYear()).toBe(2026);
    expect(widget.getMonth()).toBe(7);
    expect(widget.getDate()).toBe(16);
    expect(widget.getHours()).toBe(9);
    expect(widget.getMinutes()).toBe(30);
    expect(widget.getSeconds()).toBe(15);
  });
});
