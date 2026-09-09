import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';

import { CurrentUser, type Principal } from '@aether-zone/organon';

import type { FileDTO } from './file.dto';
import { FileService } from './file.service';

/**
 * What is filed for one organization.
 *
 * The only listing loculus offers, and it is narrow on purpose: it answers
 * about an organization the caller belongs to, never about the bucket. The
 * bucket is shared by every aether-zone service, and most of what is in it
 * means nothing to whoever is asking.
 */
@Controller('organizations/:organizationId/files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get()
  getFiles(
    @Param('organizationId') organizationId: string,
    @CurrentUser() principal: Principal,
  ): Promise<FileDTO[]> {
    /*
     * The token's own `orgs` claim decides this, not the path. pistis re-reads
     * the memberships on every issue, so a removal takes effect at the caller's
     * next refresh.
     */
    if (!Object.keys(principal.organizations).includes(organizationId)) {
      throw new ForbiddenException('Not authorized for organization');
    }

    return this.fileService.getFiles(organizationId);
  }
}
