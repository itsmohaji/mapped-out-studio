'use client';

import { FC, useEffect, useRef } from 'react';
import dayjs from '@gitroom/frontend/components/layout/dayjs.setup';
import { isValidTimezone } from '@gitroom/helpers/utils/timezone';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  applyTimezone,
  getAccountTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

/**
 * Pushes the account's timezone into the app.
 *
 * Mounted as the first child of the user context, above every date the app
 * renders. Before this existed the zone came from `localStorage` alone, so the
 * same person on a laptop and a phone typed "9am" and got two different UTC
 * instants — the posts went out an hour or five apart from what they scheduled.
 */
export const TimezoneSync: FC = () => {
  const user = useUser();
  const fetch = useFetch();
  const captured = useRef(false);

  const accountValue = (user as { timezoneName?: string | null } | undefined)
    ?.timezoneName;

  // Applied during render, not from an effect: effects run after the subtree
  // below has already rendered, which would leave the first paint in the
  // browser's zone. The assignment is idempotent.
  if (accountValue && accountValue !== getAccountTimezone()) {
    applyTimezone(accountValue);
  }

  useEffect(() => {
    if (!user?.id || accountValue || captured.current) {
      return;
    }

    // Nothing chosen yet. Adopt this browser's guess once and write it to the
    // account, so the next device asks the same question and gets the same
    // answer instead of guessing for itself.
    const guess = dayjs.tz.guess();
    if (!isValidTimezone(guess)) {
      return;
    }

    captured.current = true;
    applyTimezone(guess);

    fetch('/user/timezone', {
      method: 'POST',
      body: JSON.stringify({ timezone: guess }),
    }).catch(() => {
      // Offline, or the zone was rejected: keep the local value and try again
      // on the next load rather than blocking the app.
      captured.current = false;
    });
  }, [user?.id, accountValue]);

  return null;
};

export default TimezoneSync;
