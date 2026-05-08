import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SidebarShell } from '@/components/sidebar-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <SidebarShell userEmail={user.email ?? ''}>
      {children}
    </SidebarShell>
  );
}
