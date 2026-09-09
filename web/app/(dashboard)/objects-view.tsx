'use client';

import { useRouter } from 'next/navigation';

import type { StoredFile } from '@/lib/files';

import { ObjectTree } from './object-tree';
import { UploadCard } from './upload-card';

/**
 * The console proper: upload, and what came of it.
 *
 * `files` comes from the server component above, which read them from loculus.
 * Nothing here keeps a copy — an upload asks for the page to be re-rendered,
 * and the listing that comes back is the api's answer rather than this
 * browser's recollection of it.
 */
export function ObjectsView({ files }: { files: StoredFile[] }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <UploadCard onUploaded={() => router.refresh()} />

      <ObjectTree files={files} />
    </div>
  );
}
