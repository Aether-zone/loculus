import { ZodValidationPipe } from '@aether-zone/organon';
import {
  ArgumentMetadata,
  Inject,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

import {
  createPresignedUploadSchema,
  type CreatePresignedUploadDTO,
} from './presign.dto';
import { PRESIGN_CONFIG, type PresignConfig } from './presign.config';

/**
 * Validates the upload request against the configured size limit.
 *
 * A pipe class rather than `new ZodValidationPipe(schema)` at the call site,
 * because the schema is not knowable until the module has been configured —
 * `maxUploadBytes` is deployment state, and a decorator argument is evaluated
 * when the class is defined. Nest resolves an injectable pipe through the
 * container, which is what makes the limit reachable at all.
 *
 * The schema is built once, in the constructor: the configuration cannot change
 * while the process runs, so rebuilding it per request would be work for a
 * result that never differs.
 */
@Injectable()
export class CreatePresignedUploadPipe implements PipeTransform {
  private readonly pipe: ZodValidationPipe<CreatePresignedUploadDTO>;

  constructor(@Inject(PRESIGN_CONFIG) config: PresignConfig) {
    this.pipe = new ZodValidationPipe(
      createPresignedUploadSchema(config.maxUploadBytes),
    );
  }

  transform(value: unknown, metadata: ArgumentMetadata) {
    return this.pipe.transform(value, metadata);
  }
}
