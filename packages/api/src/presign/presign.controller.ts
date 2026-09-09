import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { CurrentUser, type Principal } from '@aether-zone/organon';

import { CreatePresignedUploadPipe } from './create-presigned-upload.pipe';
import type { ObjectOwner } from './presign.service';
import type {
  CreatePresignedUploadDTO,
  PresignedDownloadDTO,
  PresignedUploadDTO,
} from './presign.dto';
import { PresignService } from './presign.service';

/**
 * Every route here requires a pistis access token: `PistisAuthModule` registers
 * its guard globally, and nothing in this controller opts out with `@Public()`.
 */
/**
 * Who an object belongs to, from the token the guard already verified.
 *
 * Never from anything the request said about itself: the whole point of the
 * ownership check is that a caller cannot name an owner.
 */
const ownerOf = (principal: Principal): ObjectOwner => ({
  clientId: principal.clientId,
  subject: principal.id,
});

/**
 * A key is a path now, so the routes capture it with a wildcard.
 *
 * Express 5 hands a wildcard parameter back as an array of segments where the
 * old `:param` gave a string, and Nest passes that through untouched — so both
 * shapes are joined here rather than at each handler.
 */
const keyOf = (objectKey: string | string[]): string =>
  Array.isArray(objectKey) ? objectKey.join('/') : objectKey;

@Controller('objects')
export class PresignController {
  constructor(private readonly presign: PresignService) {}

  /**
   * Asks for somewhere to put a file.
   *
   * A POST rather than a GET even though nothing is stored yet: the answer is
   * a credential, and credentials do not belong in a URL that proxies and
   * browser history keep.
   */
  @Post('presign')
  createUpload(
    @CurrentUser() principal: Principal,
    @Body(CreatePresignedUploadPipe) body: CreatePresignedUploadDTO,
  ): Promise<PresignedUploadDTO> {
    return this.presign.createUpload(body, ownerOf(principal));
  }

  @Get('*objectKey/presign')
  createDownload(
    @CurrentUser() principal: Principal,
    @Param('objectKey') objectKey: string | string[],
  ): Promise<PresignedDownloadDTO> {
    return this.presign.createDownload(keyOf(objectKey), ownerOf(principal));
  }

  /**
   * Removes an object, and says so on the bus.
   *
   * The event names the key and nothing else. Whatever reacts — dropping a row
   * that pointed here, say — acts as itself: a credential in a queue outlives
   * the request that made it and is readable by anything that can read the
   * queue.
   */
  @Delete('*objectKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() principal: Principal,
    @Param('objectKey') objectKey: string | string[],
  ): Promise<void> {
    return this.presign.remove(keyOf(objectKey), ownerOf(principal));
  }
}
