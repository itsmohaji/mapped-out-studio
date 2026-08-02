export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AutomationComponent } from '@gitroom/frontend/components/automation/automation.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Mapped Out Social' : 'Gitroom'} Automation`,
  description: '',
};

export default async function Index() {
  return <AutomationComponent />;
}
