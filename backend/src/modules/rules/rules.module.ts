import { Module, forwardRef } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { AstParserService } from './ast-parser.service';
import { AstContextService } from './ast-context.service';
import { BashAstService } from './bash-ast.service';
import { RuleMatcherService } from './rule-matcher.service';
import { ApprovalModule } from '../approval/approval.module';
import { WebSocketGatewayModule } from '../websocket/websocket.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    ApprovalModule,
    forwardRef(() => WebSocketGatewayModule),
    forwardRef(() => MonitoringModule),
    StorageModule,
  ],
  controllers: [RulesController],
  providers: [AstParserService, AstContextService, BashAstService, RuleMatcherService],
  exports: [AstParserService, AstContextService, BashAstService, RuleMatcherService],
})
export class RulesModule {}
