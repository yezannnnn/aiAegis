import { Module } from '@nestjs/common';
import { SqliteStorageService } from './sqlite-storage.service';

@Module({
  providers: [SqliteStorageService],
  exports: [SqliteStorageService]
})
export class StorageModule {}