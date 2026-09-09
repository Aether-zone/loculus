'use client';

import { Button } from '@aether-zone/kosmos';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * Kosmos ships no icon-only button, so this is `Button` squared off.
 *
 * `w-8 px-0` rather than a `size-*`: the height already comes from the button's
 * own size, and matching it on the width is what makes the control square.
 * Every caller must still pass an `aria-label` — there is no text to read.
 */
export function IconButton({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={['w-8 px-0', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
