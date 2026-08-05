import { Sidebar } from '@/components/Sidebar';
import { requireReadyUser } from '@/lib/auth/guards';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireReadyUser();
  return <Sidebar actor={actor}>{children}</Sidebar>;
}
