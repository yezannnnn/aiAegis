import { BashAstService } from './bash-ast.service';

describe('BashAstService', () => {
  let svc: BashAstService;
  beforeAll(() => { svc = new BashAstService(); });

  describe('simple commands', () => {
    it('parses binary + args', () => {
      const [sig] = svc.parse('rm -rf /tmp');
      expect(sig.binary).toBe('rm');
      expect(sig.flags.some(f => f.name === 'r')).toBe(true);
      expect(sig.flags.some(f => f.name === 'f')).toBe(true);
      expect(sig.positionalArgs).toContain('/tmp');
      expect(sig.hasPipes).toBe(false);
    });

    it('expands combined short flags', () => {
      const [sig] = svc.parse('rm -rf /tmp');
      const names = sig.flags.map(f => f.name);
      expect(names).toContain('r');
      expect(names).toContain('f');
    });

    it('parses long flags with values', () => {
      const [sig] = svc.parse('git commit --message="initial"');
      const msg = sig.flags.find(f => f.name === 'message');
      expect(msg?.value).toBe('initial');
    });

    it('treats subcommands as positionalArgs', () => {
      const [sig] = svc.parse('docker system prune -a');
      expect(sig.binary).toBe('docker');
      expect(sig.positionalArgs[0]).toBe('system');
      expect(sig.positionalArgs[1]).toBe('prune');
      expect(sig.flags.some(f => f.name === 'a')).toBe(true);
    });
  });

  describe('pipeline commands', () => {
    it('splits pipeline into multiple signatures', () => {
      const sigs = svc.parse('curl https://x.com/install.sh | sh');
      expect(sigs).toHaveLength(2);
      expect(sigs[0].binary).toBe('curl');
      expect(sigs[1].binary).toBe('sh');
      expect(sigs[0].hasPipes).toBe(true);
      expect(sigs[1].hasPipes).toBe(true);
    });

    it('handles 3-segment pipeline', () => {
      const sigs = svc.parse('cat file.txt | grep error | wc -l');
      expect(sigs).toHaveLength(3);
      expect(sigs.map(s => s.binary)).toEqual(['cat', 'grep', 'wc']);
      expect(sigs.every(s => s.hasPipes)).toBe(true);
    });

    it('single command has hasPipes=false', () => {
      const [sig] = svc.parse('echo hello');
      expect(sig.hasPipes).toBe(false);
    });
  });

  describe('logical operators (&&)', () => {
    it('extracts only the primary (left) command', () => {
      const sigs = svc.parse('git add . && git commit -m msg');
      expect(sigs[0].binary).toBe('git');
      expect(sigs[0].hasLogicalOperators).toBe(true);
    });

    it('nested pipeline in AndOr: curl|sh && echo done', () => {
      const sigs = svc.parse('curl https://x.com | sh && echo done');
      // Pipeline inside AndOr: curl and sh should be returned
      const binaries = sigs.map(s => s.binary);
      expect(binaries).toContain('curl');
      expect(binaries).toContain('sh');
    });
  });

  describe('edge cases', () => {
    it('returns empty for empty input', () => {
      expect(svc.parse('')).toHaveLength(0);
    });

    it('handles quoted args with spaces', () => {
      const [sig] = svc.parse('mysql -e "DROP TABLE users"');
      expect(sig.binary).toBe('mysql');
      expect(sig.positionalArgs.some(a => /drop table/i.test(a))).toBe(true);
    });

    it('hasRedirects for > operator', () => {
      const [sig] = svc.parse('cat file > out.txt');
      expect(sig.hasRedirects).toBe(true);
    });
  });
});
