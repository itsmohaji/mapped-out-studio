export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { ReportsComponent } from '@gitroom/frontend/components/reports/reports.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Mapped Lab' : 'Gitroom'} Reports`,
  description: '',
};

export default async function Index() {
  return <ReportsComponent />;
}
