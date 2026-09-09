import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';

import { FileController } from './file.controller';
import { FileService } from './file.service';

/**
 * Listing objects by organization.
 *
 * A dynamic module because it needs `ObjectRegistry`, which `PresignModule`
 * owns and exports — and that module is configured at the root, so the
 * configured instance has to be handed in rather than imported by name.
 */
@Module({})
export class FileModule {
  static register(imports: ModuleMetadata['imports'] = []): DynamicModule {
    return {
      module: FileModule,
      imports,
      controllers: [FileController],
      providers: [FileService],
    };
  }
}
