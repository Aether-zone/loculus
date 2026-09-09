import { Provider } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { StoredObject } from './stored-object.entity';

export const DATA_SOURCE = 'DATA_SOURCE';
export const DATABASE_CONFIG = 'DATABASE_CONFIG';
export const STORED_OBJECT_REPOSITORY = 'STORED_OBJECT_REPOSITORY';

export interface DatabaseConfig {
  /** Path to the sqlite file, relative to the working directory. */
  database: string;
  /** Whether TypeORM syncs the schema on boot. Keep this off outside development. */
  synchronize: boolean;
}

export const defaultDatabaseConfig: DatabaseConfig = {
  database: 'db.sqlite',
  synchronize: true,
};

export const createDatabaseProviders = (): Provider[] => [
  {
    provide: DATA_SOURCE,
    useFactory: (config: DatabaseConfig) =>
      new DataSource({
        type: 'better-sqlite3',
        database: config.database,
        entities: [StoredObject],
        synchronize: config.synchronize,
      }).initialize(),
    inject: [DATABASE_CONFIG],
  },
  {
    provide: STORED_OBJECT_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      dataSource.getRepository(StoredObject),
    inject: [DATA_SOURCE],
  },
];
