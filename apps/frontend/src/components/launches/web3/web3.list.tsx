import { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { Web3ProviderInterface } from '@gitroom/frontend/components/launches/web3/web3.provider.interface';
// Farcaster (Neynar, ~850 KB) is not an enabled Mapped Out channel, but this
// list is imported by the Add Channel UI on the Calendar, so it shipped with
// every Calendar load. Loaded only if it is ever actually opened.
const WrapcasterProvider = dynamic<Web3ProviderInterface>(
  () =>
    import('@gitroom/frontend/components/launches/web3/providers/wrapcaster.provider').then(
      (m) => m.WrapcasterProvider
    ),
  { ssr: false }
);
import { TelegramProvider } from '@gitroom/frontend/components/launches/web3/providers/telegram.provider';
import { MoltbookProvider } from '@gitroom/frontend/components/launches/web3/providers/moltbook.provider';
export const web3List: {
  identifier: string;
  component: ComponentType<Web3ProviderInterface>;
}[] = [
  {
    identifier: 'telegram',
    component: TelegramProvider,
  },
  {
    identifier: 'wrapcast',
    component: WrapcasterProvider,
  },
  {
    identifier: 'moltbook',
    component: MoltbookProvider,
  },
];
