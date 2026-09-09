'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FileUpload,
  Progress,
  Text,
  useToast,
} from '@aether-zone/kosmos';
import { useRef, useState } from 'react';

import { formatBytes } from '@/lib/format';
import { MAX_UPLOAD_BYTES, uploadFile } from '@/lib/objects';

/** One file on its way. `error` is only set once `status` is 'failed'. */
type QueueItem = {
  id: string;
  file: File;
  status: 'waiting' | 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
};

export function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const update = (id: string, patch: Partial<QueueItem>) =>
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  async function start() {
    if (!files.length) {
      return;
    }

    const items: QueueItem[] = files.map((file, index) => ({
      // The name alone is not unique — two folders can each hold a `notes.txt`
      // — and the key does not exist until the file has been presigned.
      id: `${index}-${file.name}-${file.size}`,
      file,
      status: 'waiting',
      progress: 0,
    }));

    const controller = new AbortController();

    abort.current = controller;
    setQueue(items);
    setFiles([]);
    setUploading(true);

    /*
     * One at a time, deliberately. These are large files going straight to the
     * object store; running them in parallel would divide one browser's upload
     * bandwidth between them and make every progress bar move slowly rather
     * than making any file finish sooner.
     */
    for (const item of items) {
      if (controller.signal.aborted) {
        update(item.id, { status: 'failed', error: 'Cancelled.' });
        continue;
      }

      update(item.id, { status: 'uploading' });

      const result = await uploadFile(item.file, {
        signal: controller.signal,
        onProgress: (fraction) => update(item.id, { progress: fraction }),
      });

      if (!result.ok) {
        update(item.id, { status: 'failed', error: result.error, progress: 0 });

        if (!result.cancelled) {
          toast({
            variant: 'destructive',
            title: `${item.file.name} was not stored`,
            description: result.error,
          });
        }

        continue;
      }

      update(item.id, { status: 'done', progress: 1 });

      // Nothing to hand over: loculus wrote the row at presign, so the next
      // listing has the object with everything the tree renders.
      onUploaded();

      toast({
        variant: 'success',
        title: `${item.file.name} stored`,
        description: result.confirmed
          ? 'loculus has seen the bytes.'
          : 'Uploaded, but loculus has not confirmed it yet — its sweep will.',
      });
    }

    abort.current = null;
    setUploading(false);
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload</CardTitle>
        <CardDescription>
          The file goes straight from this browser to the object store. loculus
          only signs the URL — nothing large passes through it, or through this
          app.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <FileUpload
          multiple
          files={files}
          onFilesChange={setFiles}
          disabled={uploading}
          maxSize={MAX_UPLOAD_BYTES}
          description={`Any file type, up to ${formatBytes(MAX_UPLOAD_BYTES)} each`}
          onReject={(rejected, reason) =>
            toast({
              variant: 'warning',
              title:
                rejected.length === 1
                  ? `${rejected[0].name} was not added`
                  : `${rejected.length} files were not added`,
              description:
                reason === 'size'
                  ? `The limit is ${formatBytes(MAX_UPLOAD_BYTES)} per file.`
                  : 'That file type is not accepted.',
            })
          }
        />

        {files.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <Text size="body-small" tone="muted">
              {files.length} {files.length === 1 ? 'file' : 'files'},{' '}
              {formatBytes(total)}
            </Text>
            <Button onClick={start} disabled={uploading}>
              Upload
            </Button>
          </div>
        )}

        {queue.length > 0 && (
          <ul className="flex flex-col gap-3">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Text size="body-small" truncate>
                    {item.file.name}
                  </Text>
                  <Text
                    size="body-small"
                    tone={item.status === 'failed' ? 'destructive' : 'muted'}
                    className="shrink-0 tabular-nums"
                  >
                    {statusLabel(item)}
                  </Text>
                </div>

                <Progress
                  value={Math.round(item.progress * 100)}
                  variant={item.status === 'failed' ? 'destructive' : 'primary'}
                  size="sm"
                  label={`Uploading ${item.file.name}`}
                />
              </li>
            ))}
          </ul>
        )}

        {uploading && (
          <div className="flex justify-end">
            {/*
              Cancelling abandons the PUT in flight. loculus already has a
              PENDING row for it; nothing arrives at the store, and the sweep
              drops the row once the URL expires.
            */}
            <Button
              variant="ghost"
              onClick={() => abort.current?.abort()}
              type="button"
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function statusLabel(item: QueueItem): string {
  switch (item.status) {
    case 'waiting':
      return 'Waiting';
    case 'uploading':
      return `${Math.round(item.progress * 100)}%`;
    case 'done':
      return 'Stored';
    case 'failed':
      return item.error ?? 'Failed';
  }
}
