import { usePlausible } from 'next-plausible';
import { useCallback } from 'react';
import { getPosthog } from '@gitroom/react/helpers/posthog';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

export const useFireEvents = () => {
  const { billingEnabled } = useVariables();
  const plausible = usePlausible();
  const user = useUser();

  return useCallback(
    (name: string, props?: any) => {
      if (!billingEnabled) {
        return;
      }

      const posthog = getPosthog();
      if (posthog && user) {
        posthog.identify(user.id, { email: user.email, name: user.name });
      }

      posthog?.capture(name, props);
      plausible(name, { props });
    },
    [user]
  );
};
