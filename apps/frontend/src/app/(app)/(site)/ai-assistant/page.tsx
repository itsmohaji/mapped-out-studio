export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AiOrchestraComponent } from '@gitroom/frontend/components/ai-orchestra/ai.orchestra.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Mapped Out Social' : 'Gitroom'} AI Assistant`,
  description: '',
};

export default async function Index() {
  return <AiOrchestraComponent />;
}
