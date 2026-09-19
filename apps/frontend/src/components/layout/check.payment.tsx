import { FC, ReactNode, useEffect, useState } from 'react';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { timer } from '@gitroom/helpers/utils/timer';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { lockUi } from '@gitroom/frontend/components/layout/ui.lock';

/**
 * How long to wait for the payment provider to confirm before letting the user
 * back into the app. The subscription state is re-read on the next load anyway;
 * a spinner that never ends is strictly worse than an app that is briefly stale.
 */
const MAX_CHECKS = 60; // ~1 minute at one check per second

export const CheckPayment: FC<{
  check: string;
  mutate: () => void;
  children: ReactNode;
}> = (props) => {
  if (!props.check) {
    return <>{props.children}</>;
  }
  return <CheckPaymentInner {...props} />;
};

export const CheckPaymentInner: FC<{
  check: string;
  mutate: () => void;
  children: ReactNode;
}> = (props) => {
  const [showLoader, setShowLoader] = useState(true);
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useDecisionModal();

  // Released when the loader goes away AND if this unmounts mid-check.
  useEffect(() => (showLoader ? lockUi() : undefined), [showLoader]);

  useEffect(() => {
    // It used to recurse forever while the status stayed pending, and a single
    // failed request left the spinner — and the page lock — up for good.
    let active = true;
    (async () => {
      try {
        for (let i = 0; i < MAX_CHECKS && active; i++) {
          const { status } = await (
            await fetch('/billing/check/' + props.check)
          ).json();
          if (!active) return;
          if (status === 1) {
            modal.open({
              title: 'Invalid Payment',
              onlyApprove: true,
              approveLabel: 'OK',
              description:
                'We could not validate your payment method, please try again',
            });
            return;
          }
          if (status === 2) {
            props.mutate();
            return;
          }
          await timer(1000);
        }
        if (active) {
          toaster.show(
            'Your payment is still being confirmed. Refresh in a minute to see your plan.',
            'warning'
          );
        }
      } catch (e) {
        if (active) {
          toaster.show(
            'We could not confirm your payment yet. Refresh in a minute to see your plan.',
            'warning'
          );
        }
      } finally {
        if (active) setShowLoader(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (showLoader) {
    return (
      <div className="fixed bg-black/40 w-full h-full flex justify-center items-center z-[400]">
        <div>
          <Loading type="spin" color="#6ba3da" height={250} width={250} />
        </div>
      </div>
    );
  }
  return props.children;
};
