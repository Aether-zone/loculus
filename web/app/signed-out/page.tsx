import { Button } from '@aether-zone/kosmos';
import { createSignedOutPage } from '@aether-zone/daimon/ui';

import { Logo, LogoMark } from '../logo';

/**
 * Where signing out lands, and where a failed authorization comes back to.
 *
 * The layout and copy are daimon's; the brand and the button are loculus's. The
 * button is passed in rather than imported by the library so daimon does not
 * depend on kosmos — and it submits a GET form rather than sitting inside a
 * link, because kosmos's `Button` renders a real `<button>` with no `asChild`
 * escape hatch. That still works before any JavaScript has loaded, which
 * matters on the one page someone reaches when their session has just failed.
 */
export default createSignedOutPage({
  appName: 'loculus',
  brand: {
    compactMark: <Logo />,
    mark: <LogoMark className="size-12" />,
    wordmark: 'loculus',
    tagline: 'Somewhere to put things',
  },
  signInButton: (
    <Button type="submit" size="lg">
      Sign in
    </Button>
  ),
});
