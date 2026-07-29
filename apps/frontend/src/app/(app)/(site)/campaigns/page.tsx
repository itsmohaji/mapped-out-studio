export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { CampaignsComponent } from '@gitroom/frontend/components/campaigns/campaigns.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Mapped Out Social' : 'Gitroom'} Campaigns`,
  description: '',
};

export default async function Index() {
  return <CampaignsComponent />;
}
