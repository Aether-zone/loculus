import type { AsyncModuleConfig } from '@aether-zone/organon';
import {
  DynamicModule,
  Module,
  ModuleMetadata,
  Provider,
} from '@nestjs/common';

import {
  createDatabaseProviders,
  DATABASE_CONFIG,
  defaultDatabaseConfig,
  type DatabaseConfig,
} from '../objects/database.providers';
import { ObjectAnnouncer } from '../objects/object.announcer';
import { ObjectRegistry } from '../objects/object-registry.service';
import { CreatePresignedUploadPipe } from './create-presigned-upload.pipe';
import { ObjectStoreHealth } from './object-store.health';
import { ObjectSweeper } from './object-sweeper.service';
import { PresignController } from './presign.controller';
import {
  createS3Providers,
  defaultPresignConfig,
  PRESIGN_CONFIG,
  S3_CLIENT,
  type PresignConfig,
} from './presign.config';
import { PresignService } from './presign.service';

/**
 * Signed URLs for putting objects in the store and getting them back out.
 *
 * `PresignService` is exported so another module can hand out a URL without
 * going through HTTP — the controller is one caller of it, not the only way in.
 */
@Module({})
export class PresignModule {
  static forRoot(
    config: PresignConfig = defaultPresignConfig,
    database: DatabaseConfig = defaultDatabaseConfig,
  ): DynamicModule {
    return PresignModule.create(
      { provide: PRESIGN_CONFIG, useValue: config },
      { provide: DATABASE_CONFIG, useValue: database },
    );
  }

  static forRootAsync(
    options: AsyncModuleConfig<PresignConfig & { database: DatabaseConfig }>,
  ): DynamicModule {
    return PresignModule.create(
      {
        provide: PRESIGN_CONFIG,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      {
        provide: DATABASE_CONFIG,
        useFactory: async (...args: never[]) =>
          (await options.useFactory(...args)).database,
        inject: (options.inject ?? []) as never[],
      },
      options.imports,
    );
  }

  private static create(
    configProvider: Provider,
    databaseProvider: Provider,
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return {
      module: PresignModule,
      imports,
      controllers: [PresignController],
      providers: [
        configProvider,
        databaseProvider,
        ...createS3Providers(),
        ...createDatabaseProviders(),
        ObjectRegistry,
        ObjectAnnouncer,
        ObjectSweeper,
        PresignService,
        ObjectStoreHealth,
        CreatePresignedUploadPipe,
      ],
      exports: [
        PresignService,
        ObjectRegistry,
        // Reached by `ObjectListener`, which the root module provides.
        ObjectAnnouncer,
        PRESIGN_CONFIG,
        S3_CLIENT,
        ObjectStoreHealth,
      ],
    };
  }
}
