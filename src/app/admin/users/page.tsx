import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/lib/auth';
import { getEffectiveRole } from '@/lib/roles';
import { AdminUsersPanel } from '@/components/AdminUsersPanel';

export const dynamic = 'force-dynamic';

/**
 * Admin page: manage the role of the users.
 *
 * The role decides the daily quota, the maximum length of an answer and the
 * models an account may use. Only an administrator may open the page.
 */
export default async function AdminUsersPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect('/');
  }

  const role = await getEffectiveRole(session.id, session.email);

  if (role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-900/60 bg-red-950/30 p-6 text-center">
          <h1 className="text-lg font-bold text-red-300">Akses ditolak</h1>
          <p className="mt-2 text-xs text-red-200/80">
            Halaman ini hanya untuk administrator. Akun kamu memakai role{' '}
            <span className="font-mono">{role}</span>.
          </p>
          <a
            href="/"
            className="mt-4 inline-block px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100"
          >
            Kembali ke chat
          </a>
        </div>
      </div>
    );
  }

  return <AdminUsersPanel />;
}
