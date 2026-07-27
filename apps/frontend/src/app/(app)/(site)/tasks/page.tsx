export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { TasksComponent } from '@gitroom/frontend/components/tasks/tasks.component';
export const metadata: Metadata = { title: 'Mapped Out Social Tasks', description: '' };
export default async function Index() {
  return <TasksComponent />;
}
