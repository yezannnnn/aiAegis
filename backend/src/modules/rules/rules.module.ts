import { Module, forwardRef } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { AstParserService } from './ast-parser.service';
import { AstContextService } from './ast-context.service';
import { RuleMatcherService } from './rule-matcher.service';
import { ApprovalModule } from '../approval/approval.module';
import { WebSocketGatewayModule } from '../websocket/websocket.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [
    ApprovalModule,
    forwardRef(() => WebSocketGatewayModule),
    forwardRef(() => MonitoringModule),
  ],
  controllers: [RulesController],
  providers: [AstParserService, AstContextService, RuleMatcherService],
  exports: [AstParserService, AstContextService, RuleMatcherService],
})
export class RulesModule {}
