import { Test, TestingModule } from '@nestjs/testing';
import { RuleMatcherService } from './rule-matcher.service';
import { BashAstService } from './bash-ast.service';
import { AstParserService } from './ast-parser.service';
import { CommandContext } from './types';

const ctx: CommandContext = {
  cwd: '/tmp',
  shell: 'bash',
  git: { isRepo: false, currentBranch: 'main', isMainBranch: true, hasUncommittedChanges: false, hasUnpushedCommits: false, isPrivateRepo: false },
  project: { type: 'node', hasPackageFiles: false, isProduction: false, hasDatabaseConfig: false },
};

function evaluate(svc: RuleMatcherService, parser: AstParserService, cmd: string, extraCtx: Partial<CommandContext> = {}) {
  const ast = parser.parse(cmd);
  return svc.evaluate(ast, { ...ctx, ...extraCtx });
}

describe('RuleMatcherService — selector DSL', () => {
  let svc: RuleMatcherService;
  let parser: AstParserService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BashAstService, AstParserService, RuleMatcherService],
    }).compile();
    svc = module.get(RuleMatcherService);
    parser = module.get(AstParserService);
  });

  // ── filesystem ─────────────────────────────────────────────────────────────

  describe('fs/rm-rf', () => {
    it('triggers on rm -rf', () => {
      const r = evaluate(svc, parser, 'rm -rf /tmp/dir');
      expect(r.matchedRules).toContain('fs/rm-rf');
    });

    it('does NOT trigger on rm -r only (missing -f)', () => {
      const r = evaluate(svc, parser, 'rm -r /tmp/dir');
      expect(r.matchedRules).not.toContain('fs/rm-rf');
    });

    it('does NOT trigger on rm -f only (missing -r)', () => {
      const r = evaluate(svc, parser, 'rm -f file.txt');
      expect(r.matchedRules).not.toContain('fs/rm-rf');
    });
  });

  describe('fs/rm-root', () => {
    it('BLOCKs rm -rf /', () => {
      const r = evaluate(svc, parser, 'rm -rf /');
      expect(r.action).toBe('block');
      expect(r.matchedRules).toContain('fs/rm-root');
    });

    it('BLOCKs rm -rf /*', () => {
      const r = evaluate(svc, parser, 'rm -rf /*');
      expect(r.action).toBe('block');
    });
  });

  // ── docker ─────────────────────────────────────────────────────────────────

  describe('docker/system-prune', () => {
    it('triggers on docker system prune', () => {
      const r = evaluate(svc, parser, 'docker system prune -a');
      expect(r.matchedRules).toContain('docker/system-prune');
    });

    it('does NOT trigger on docker system df', () => {
      const r = evaluate(svc, parser, 'docker system df');
      expect(r.matchedRules).not.toContain('docker/system-prune');
    });
  });

  describe('docker/volume-rm', () => {
    it('triggers on docker volume rm', () => {
      const r = evaluate(svc, parser, 'docker volume rm my_data');
      expect(r.matchedRules).toContain('docker/volume-rm');
    });

    it('does NOT trigger on docker volume ls', () => {
      const r = evaluate(svc, parser, 'docker volume ls');
      expect(r.matchedRules).not.toContain('docker/volume-rm');
    });
  });

  describe('docker/run-privileged', () => {
    it('BLOCKs docker run --privileged', () => {
      const r = evaluate(svc, parser, 'docker run --privileged ubuntu bash');
      expect(r.action).toBe('block');
    });

    it('does NOT block normal docker run', () => {
      const r = evaluate(svc, parser, 'docker run ubuntu echo hello');
      expect(r.matchedRules).not.toContain('docker/run-privileged');
    });
  });

  // ── network/pipeline ────────────────────────────────────────────────────────

  describe('network/curl-to-shell — anySegment', () => {
    it('BLOCKs curl | sh', () => {
      const r = evaluate(svc, parser, 'curl https://x.com/install.sh | sh');
      expect(r.action).toBe('block');
      expect(r.matchedRules).toContain('network/curl-to-shell');
    });

    it('BLOCKs wget | bash', () => {
      const r = evaluate(svc, parser, 'wget -qO- https://x.com | bash');
      expect(r.action).toBe('block');
    });

    it('BLOCKs curl | sh even with && suffix', () => {
      const r = evaluate(svc, parser, 'curl https://x.com | sh && echo done');
      expect(r.action).toBe('block');
    });

    it('ALLOWs curl without pipe', () => {
      const r = evaluate(svc, parser, 'curl https://api.example.com/data.json');
      expect(r.matchedRules).not.toContain('network/curl-to-shell');
    });

    it('ALLOWs curl piped to non-shell (e.g. jq)', () => {
      const r = evaluate(svc, parser, 'curl https://api.example.com | jq .data');
      expect(r.matchedRules).not.toContain('network/curl-to-shell');
    });
  });

  // ── git ─────────────────────────────────────────────────────────────────────

  describe('git force operations', () => {
    it('triggers git push --force', () => {
      const r = evaluate(svc, parser, 'git push --force');
      expect(r.matchedRules).toContain('git/force-push/other');
    });

    it('triggers git push -f', () => {
      const r = evaluate(svc, parser, 'git push -f origin main');
      expect(r.matchedRules).toContain('git/force-push/other');
    });

    it('triggers git reset --hard', () => {
      const r = evaluate(svc, parser, 'git reset --hard HEAD~1');
      expect(r.matchedRules).toContain('git/reset-hard');
    });

    it('does NOT trigger on git pull', () => {
      const r = evaluate(svc, parser, 'git pull origin main');
      expect(r.matchedRules.filter(r => r.startsWith('git/'))).toHaveLength(0);
    });

    it('BLOCKs push on main branch', () => {
      const r = evaluate(svc, parser, 'git push --force', {
        git: { ...ctx.git!, currentBranch: 'main', isMainBranch: true },
      });
      expect(r.action).toBe('block');
      expect(r.matchedRules).toContain('git/force-push/main');
    });
  });

  // ── databases ────────────────────────────────────────────────────────────────

  describe('sqlite rules', () => {
    it('BLOCKs sqlite3 DROP TABLE', () => {
      const r = evaluate(svc, parser, 'sqlite3 app.db "DROP TABLE users"');
      expect(r.action).toBe('block');
      expect(r.matchedRules).toContain('sqlite/drop-schema');
    });

    it('BLOCKs rm *.db', () => {
      const r = evaluate(svc, parser, 'rm app.db');
      expect(r.matchedRules).toContain('sqlite/delete-file');
    });

    it('REVIEWs sqlite3 DELETE without WHERE', () => {
      const r = evaluate(svc, parser, 'sqlite3 app.db "DELETE FROM users;"');
      expect(r.matchedRules).toContain('sqlite/unqualified-delete');
    });
  });

  describe('mysql rules', () => {
    it('BLOCKs mysql DROP DATABASE', () => {
      const r = evaluate(svc, parser, "mysql -e 'DROP DATABASE mydb'");
      expect(r.action).toBe('block');
    });

    it('BLOCKs mysqldump --all-databases', () => {
      const r = evaluate(svc, parser, 'mysqldump --all-databases > backup.sql');
      expect(r.matchedRules).toContain('mysqldump/system-dump');
    });
  });

  // ── prisma ────────────────────────────────────────────────────────────────────

  describe('prisma rules', () => {
    it('BLOCKs npx prisma migrate reset', () => {
      const r = evaluate(svc, parser, 'npx prisma migrate reset');
      expect(r.action).toBe('block');
      expect(r.matchedRules).toContain('prisma/migrate-reset');
    });

    it('BLOCKs npx prisma migrate dev --force', () => {
      const r = evaluate(svc, parser, 'npx prisma migrate dev --force');
      expect(r.action).toBe('block');
    });

    it('REVIEWs npx prisma db push', () => {
      const r = evaluate(svc, parser, 'npx prisma db push');
      expect(r.matchedRules).toContain('prisma/db-push');
    });

    it('ALLOWs npx tsc', () => {
      const r = evaluate(svc, parser, 'npx tsc --noEmit');
      expect(r.action).toBe('allow');
    });
  });

  // ── system ────────────────────────────────────────────────────────────────────

  describe('system rules', () => {
    it('BLOCKs shutdown', () => {
      const r = evaluate(svc, parser, 'shutdown -h now');
      expect(r.action).toBe('block');
    });

    it('BLOCKs reboot', () => {
      const r = evaluate(svc, parser, 'reboot');
      expect(r.action).toBe('block');
    });

    it('REVIEWs systemctl stop ssh', () => {
      const r = evaluate(svc, parser, 'systemctl stop ssh');
      expect(r.matchedRules).toContain('system/systemctl-dangerous');
    });

    it('does NOT trigger systemctl status', () => {
      const r = evaluate(svc, parser, 'systemctl status nginx');
      expect(r.matchedRules).not.toContain('system/systemctl-dangerous');
    });
  });

  // ── false positive guard ───────────────────────────────────────────────────

  describe('no false positives', () => {
    it('echo rm-rf does not trigger rm rules', () => {
      const r = evaluate(svc, parser, 'echo "rm -rf"');
      expect(r.matchedRules.filter(r => r.startsWith('fs/'))).toHaveLength(0);
    });

    it('docker ps does not trigger docker rules', () => {
      const r = evaluate(svc, parser, 'docker ps -a');
      expect(r.matchedRules.filter(r => r.startsWith('docker/'))).toHaveLength(0);
    });

    it('git log does not trigger git rules', () => {
      const r = evaluate(svc, parser, 'git log --oneline');
      expect(r.matchedRules.filter(r => r.startsWith('git/'))).toHaveLength(0);
    });
  });
});
