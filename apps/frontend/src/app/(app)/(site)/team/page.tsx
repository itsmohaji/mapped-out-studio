export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { TeamComponent } from '@gitroom/frontend/components/team/team.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Mapped Out Social' : 'Gitroom'} Team`,
  description: '',
};

export default async function Index() {
  return <TeamComponent />;
}
