'use client';

import { Select } from '@aether-zone/kosmos';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';

export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
};

/**
 * Switches which organization the person is working in.
 *
 * pistis authenticates the person and states which organizations they belong to
 * in the token; picking among them is application state, so switching is
 * instant and needs no trip back to the authorization server.
 *
 * **It does not filter anything yet.** loculus files an object under the OAuth
 * client that presigned it, not under an organization, so this records where
 * someone considers themselves to be working and nothing below it reads that
 * yet. Scoping objects by tenant is a change to the api.
 *
 * `router.refresh()` rather than a reload: every server component re-renders
 * against the new cookie, so the page follows the switch without losing client
 * state or flashing the shell.
 */
export function OrganizationSwitcher({
  organizations,
  activeId,
  collapsed = false,
}: {
  organizations: Organization[];
  activeId: string | null;
  collapsed?: boolean;
}) {
  const [switching, setSwitching] = useState(false);
  const router = useRouter();

  const [first, ...rest] = organizations;

  if (!first) {
    return collapsed ? null : (
      <p className="px-1 text-xs text-muted-foreground">
        You do not belong to any organization yet. Ask an owner to add you in
        pistis.
      </p>
    );
  }

  const active = [first, ...rest].find((org) => org.id === activeId) ?? first;

  // One organization is not a choice, so show where they are rather than a
  // dropdown with a single entry.
  if (rest.length === 0 || collapsed) {
    return collapsed ? (
      <span
        title={active.name}
        className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-semibold uppercase text-muted-foreground"
      >
        {active.name.slice(0, 2)}
      </span>
    ) : (
      <div className="px-1">
        <p className="truncate text-sm font-medium text-foreground">
          {active.name}
        </p>
        <p className="text-xs capitalize text-muted-foreground">
          {active.role}
        </p>
      </div>
    );
  }

  const choose = async (organizationId: string) => {
    setSwitching(true);

    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (response.ok) {
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Select
      aria-label="Organization"
      value={active.id}
      disabled={switching}
      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
        choose(event.target.value)
      }
    >
      {organizations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </Select>
  );
}
