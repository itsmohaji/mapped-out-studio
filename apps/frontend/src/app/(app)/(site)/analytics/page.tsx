export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AnalyticsTabs } from '@gitroom/frontend/components/platform-analytics/analytics.tabs';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Mapped Out Social' : 'Gitroom'} Analytics`,
  description: '',
};
export default async function Index() {
  return <AnalyticsTabs />;
}
