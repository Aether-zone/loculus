import {
  Alert,
  AlertDescription,
  AlertTitle,
  Heading,
  Text,
} from '@aether-zone/kosmos';

import { getSession } from '@/lib/auth';
import { listFiles } from '@/lib/files';

import { ObjectsView } from './objects-view';

export default async function DashboardPage() {
  /*
   * Both at once: the session is cookies and possibly a token refresh, the
   * listing is a round trip to the api, and neither needs the other's answer.
   * `getSession` is memoized per request, so the layout's call and this one are
   * the same call — which matters, because two concurrent refreshes would
   * replay a rotating refresh token and pistis revokes the family for that.
   */
  const [session, listing] = await Promise.all([getSession(), listFiles()]);

  // The layout has already redirected anyone without one; this is for the type.
  if (!session) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Heading level={1} size="heading-large">
          Objects
        </Heading>
        <Text tone="muted">
          loculus stores files for the rest of the workspace and hands out
          short-lived, signed URLs to reach them. This console is a way to use
          it by hand — upload something, fetch it back, throw it away.
        </Text>
      </div>

      {listing.ok ? (
        <ObjectsView files={listing.files} />
      ) : (
        <Alert
          variant={
            listing.reason === 'noOrganization' ? 'warning' : 'destructive'
          }
        >
          <AlertTitle>
            {listing.reason === 'noOrganization'
              ? 'No organization selected'
              : 'Could not list objects'}
          </AlertTitle>
          <AlertDescription>
            {listing.reason === 'noOrganization'
              ? 'loculus files an object under an organization, so pick one in the sidebar to see what is stored for it.'
              : (listing.message ??
                'loculus could not be reached. Try again in a moment.')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
