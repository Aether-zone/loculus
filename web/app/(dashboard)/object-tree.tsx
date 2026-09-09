'use client';

import {
  AlertDialog,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Text,
  TreeItem,
  TreeView,
  useToast,
} from '@aether-zone/kosmos';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  BoxIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  ServiceIcon,
  TrashIcon,
} from '@/components/icons';
import { formatBytes, formatRelative } from '@/lib/format';
import type { StoredFile } from '@/lib/files';
import {
  allBranchValues,
  buildObjectTree,
  organizationLabel,
} from '@/lib/object-tree';
import { deleteObject, downloadUrlFor } from '@/lib/objects';

/**
 * The organization's objects, as the tree their keys already form.
 *
 * A key is `{requestor}/{organizationId}/{name}`, so the grouping is not a
 * shape invented here — it is where the object actually sits in the bucket.
 * Which is also why a file's row shows the last segment while the panel beside
 * it shows the whole key: the segment is what distinguishes it from its
 * siblings, the key is what every other service refers to.
 */
export function ObjectTree({ files }: { files: StoredFile[] }) {
  const router = useRouter();
  const tree = useMemo(() => buildObjectTree(files), [files]);

  /*
   * Expanded by default, and uncontrolled from there.
   *
   * Someone opening the console wants to see what is in it, not to click
   * through two levels first. `key` on the
   * TreeView remounts it when the set of branches changes, so a newly uploaded
   * file's group is open rather than collapsed behind a chevron nobody knew to
   * look at.
   */
  const branches = useMemo(() => allBranchValues(tree), [tree]);

  const [selected, setSelected] = useState<string | null>(null);
  const selectedFile = useMemo(
    () =>
      tree
        .flatMap((requestor) => requestor.organizations)
        .flatMap((organization) => organization.files)
        .find((file) => file.objectKey === selected) ?? null,
    [tree, selected],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objects</CardTitle>
        <CardDescription>
          Everything filed for this organization, grouped the way the keys
          are: requestor, then organization. Read from loculus rather than
          remembered here, so an object akouo filed — or one uploaded from
          another machine — is in the list too.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {files.length === 0 ? (
          <EmptyState
            bordered
            icon={<BoxIcon />}
            title="Nothing here yet"
            description="Upload a file above. Anything akouo files for this organization shows up here too."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <TreeView
              key={branches.join('|')}
              label="Objects filed for this organization"
              defaultExpanded={branches}
              defaultSelected={selected ?? undefined}
              onSelectedChange={setSelected}
              className="min-w-0"
            >
              {tree.map((requestor) => (
                <TreeItem
                  key={requestor.value}
                  value={requestor.value}
                  icon={<ServiceIcon />}
                  label={
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">
                        {requestor.id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {countOf(
                          requestor.organizations.reduce(
                            (total, organization) =>
                              total + organization.files.length,
                            0,
                          ),
                        )}
                      </span>
                    </span>
                  }
                >
                  {requestor.organizations.map((organization) => (
                    <TreeItem
                      key={organization.value}
                      value={organization.value}
                      icon={<FolderIcon />}
                      label={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-mono text-xs">
                            {organizationLabel(organization.id)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {countOf(organization.files.length)}
                          </span>
                        </span>
                      }
                    >
                      {organization.files.map((file) => (
                        <TreeItem
                          key={file.objectKey}
                          value={file.objectKey}
                          icon={<FileIcon />}
                          label={
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate">
                                {file.file.name}
                              </span>
                              {!file.file.confirmed && (
                                <Badge
                                  variant="warning"
                                  title="loculus has not seen the bytes yet"
                                >
                                  Pending
                                </Badge>
                              )}
                            </span>
                          }
                        />
                      ))}
                    </TreeItem>
                  ))}
                </TreeItem>
              ))}
            </TreeView>

            <ObjectDetail
              file={selectedFile?.file ?? null}
              onChanged={() => {
                setSelected(null);
                // The listing is the api's, so a delete is re-read rather than
                // patched locally: the server component runs again and the tree
                // renders whatever is actually filed.
                router.refresh();
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const countOf = (files: number) => `${files} file${files === 1 ? '' : 's'}`;

/**
 * The selected object, and everything that can be done to it.
 *
 * Beside the tree rather than inside a row: the actions are destructive enough
 * to want a moment's deliberation, and a row of icon buttons per leaf would put
 * a delete one arrow-key away from every file in the list.
 */
function ObjectDetail({
  file,
  onChanged,
}: {
  file: StoredFile | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!file) {
    return (
      <aside className="rounded-lg border border-dashed border-border p-6">
        <Text className="text-sm text-muted-foreground">
          Select a file to copy its key, download it, or delete it.
        </Text>
      </aside>
    );
  }

  async function copyKey() {
    if (!file) {
      return;
    }

    try {
      await navigator.clipboard.writeText(file.objectKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access is refused outside a secure context, and there is no
      // second way to write to it. Say so rather than appearing to do nothing.
      toast({
        variant: 'warning',
        title: 'Could not copy',
        description: 'This browser would not give the page clipboard access.',
      });
    }
  }

  async function download() {
    if (!file) {
      return;
    }

    /*
     * The tab is opened *before* the request, while the click is still what the
     * browser is handling. Opening one after an await is a popup, and gets
     * blocked. Where it is blocked anyway, this navigates instead — the signed
     * URL is a plain GET, so either way the store serves the object.
     */
    const tab = window.open('', '_blank');

    setBusy(true);

    const result = await downloadUrlFor(file.objectKey);

    setBusy(false);

    if (!result.ok) {
      tab?.close();
      toast({
        variant: 'destructive',
        title: 'No download link',
        description: result.error,
      });

      return;
    }

    /*
     * Asking for a download link is also what confirms an upload: loculus HEADs
     * the object to sign it and flips a still-pending row to uploaded. Nothing
     * to record here — the next listing reads the row that just changed.
     */
    if (!file.confirmed) {
      onChanged();
    }

    if (tab) {
      // Cut the new tab off from this one before sending it to the store.
      // `window.open(..., 'noopener')` would do the same, but it hands back
      // null by spec, leaving nothing to navigate once the URL arrives.
      tab.opener = null;
      tab.location.href = result.url;
    } else {
      window.location.href = result.url;
    }
  }

  async function remove() {
    if (!file) {
      return;
    }

    setBusy(true);

    const result = await deleteObject(file.objectKey);

    setBusy(false);
    setConfirming(false);

    if (!result.ok) {
      toast({
        variant: 'destructive',
        title: 'Not deleted',
        description: result.error,
      });

      return;
    }

    toast({ title: `${file.name} deleted` });

    onChanged();
  }

  return (
    <aside className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Text truncate className="font-medium">
          {file.name}
        </Text>
        {/* The key is the object's only identity, so it is shown in full rather
            than hidden behind a detail view — it is what every other service
            and every support question refers to. */}
        <span className="break-all font-mono text-xs text-muted-foreground">
          {file.objectKey}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Size</dt>
        <dd className="text-right">{formatBytes(file.size)}</dd>

        {/* A pending object has no `uploadedAt` — nothing has seen its bytes
            — so the time it was offered a URL is what there is to show. */}
        <dt className="text-muted-foreground">
          {file.uploadedAt ? 'Uploaded' : 'Offered'}
        </dt>
        <dd
          className="text-right"
          title={new Date(file.uploadedAt ?? file.createdAt).toLocaleString()}
        >
          {formatRelative(file.uploadedAt ?? file.createdAt)}
        </dd>

        <dt className="text-muted-foreground">State</dt>
        <dd className="text-right">
          {file.confirmed ? (
            <Badge variant="success">Uploaded</Badge>
          ) : (
            <Badge variant="warning" title="loculus has not seen the bytes yet">
              Pending
            </Badge>
          )}
        </dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Copy the key for ${file.name}`}
          onClick={copyKey}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy key'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          aria-label={`Download ${file.name}`}
          disabled={busy}
          onClick={download}
        >
          <DownloadIcon />
          Download
        </Button>

        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${file.name}`}
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          <TrashIcon />
          Delete
        </Button>
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="destructive"
        busy={busy}
        title={`Delete ${file.name}?`}
        description="The bytes and loculus's record of them both go, and an object.deleted event tells the rest of the workspace. Anything still holding this key will stop being able to read it."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </aside>
  );
}
