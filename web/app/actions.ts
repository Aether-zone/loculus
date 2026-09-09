'use server';

import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

/**
 * Signs out of the console. The pistis session is untouched, so signing back in
 * may not ask for a password — single sign-on, not a bug.
 */
export async function signOutAction() {
  await auth.signOut();

  // Outside any try/catch: redirect() signals by throwing.
  redirect('/signed-out');
}
