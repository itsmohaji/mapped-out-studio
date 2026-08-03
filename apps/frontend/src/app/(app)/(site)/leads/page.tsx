export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { LeadsComponent } from '@gitroom/frontend/components/leads/leads.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Mapped Out Social' : 'Gitroom'} Leads`,
  description: '',
};

export default async function Index() {
  return <LeadsComponent />;
}
