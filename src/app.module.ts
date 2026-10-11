import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CoreModule } from './core/core.module.js';
import { HealthModule } from './health/health.module.js';
import { PlatformModule } from './modules/platform.module.js';
import { WorkspaceModule } from './modules/workspace.module.js';

/** Root module that wires core, auth and all feature modules together. */
@Module({
  imports: [
    // Order matters: global guards run in import order (throttle, then auth, then project membership).
    CoreModule,
    AuthModule,
    PlatformModule,
    WorkspaceModule,
    HealthModule,
  ],
})
export class AppModule {}
