'use client';

import { Select } from '@gitroom/react/form/select';
import React, { useCallback, useMemo, useState } from 'react';
import { isUSCitizen } from '@gitroom/frontend/components/launches/helpers/isuscitizen.utils';
import timezones from 'timezones-list';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { isValidTimezone } from '@gitroom/helpers/utils/timezone';
import {
  applyTimezone,
  getTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

const dateMetrics = [
  { label: 'AM:PM', value: 'US' },
  { label: '24 hours', value: 'GLOBAL' },
];

const MetricComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();

  const [currentMetric, setCurrentMetric] = useState(isUSCitizen());
  const [timezone, setTimezone] = useState(getTimezone);
  const [saving, setSaving] = useState(false);

  // The list ships a handful of zones this runtime cannot compute in, and the
  // user's own zone is not guaranteed to appear in it at all — an unlisted
  // value would leave the select showing somebody else's timezone.
  const options = useMemo(() => {
    const valid = timezones
      .filter((zone) => isValidTimezone(zone.tzCode))
      .map((zone) => ({ tzCode: zone.tzCode, label: zone.label }));
    return valid.some((zone) => zone.tzCode === timezone)
      ? valid
      : [{ tzCode: timezone, label: timezone }, ...valid];
  }, [timezone]);

  const changeMetric = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setCurrentMetric(value === 'US');
    localStorage.setItem('isUS', value);
  };

  const changeTimezone = useCallback(
    async (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      const previous = timezone;
      if (value === previous || saving) {
        return;
      }

      setTimezone(value);
      setSaving(true);

      const response = await fetch('/user/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: value }),
      }).catch(() => null);

      if (!response?.ok) {
        setTimezone(previous);
        setSaving(false);
        toaster.show(
          t('timezone_not_saved', 'Could not save your timezone'),
          'warning'
        );
        return;
      }

      applyTimezone(value);

      // Reload rather than just re-rendering: dates already on screen were
      // formatted in the old zone by components that will not re-render on
      // their own, and a calendar showing two different timezones at once is
      // exactly the confusion this setting exists to end.
      window.location.reload();
    },
    [timezone, saving, fetch, toaster, t]
  );

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="mt-[4px]">{t('date_metrics', 'Date Metrics')}</div>
      <Select
        name="metric"
        disableForm={true}
        label=""
        onChange={changeMetric}
        value={currentMetric ? 'US' : 'GLOBAL'}
      >
        {dateMetrics.map((metric) => (
          <option key={metric.value} value={metric.value}>
            {metric.label}
          </option>
        ))}
      </Select>

      <div className="flex flex-col gap-[6px]">
        <div className="mt-[4px]">{t('current_timezone', 'Current Timezone')}</div>
        <div className="text-[12px] text-newTextColor/60">
          {t(
            'current_timezone_description',
            'Times are shown and scheduled in this timezone on every device you sign in from.'
          )}
        </div>
        <Select
          name="timezone"
          disableForm={true}
          label=""
          onChange={changeTimezone}
          value={timezone}
          disabled={saving || !user?.id}
        >
          {options.map((zone) => (
            <option key={zone.tzCode} value={zone.tzCode}>
              {zone.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
};

export default MetricComponent;
