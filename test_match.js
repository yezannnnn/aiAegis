const { loadRules } = require('./dist/rules/loader');
const path = require('path');
const os = require('os');

(async () => {
  const result = await loadRules(path.join(os.homedir(), '.aegis', 'rules.yaml'));
  
  // Check first 3 patterns
  const rules = result.rules.slice(0, 5);
  for (const r of rules) {
    const pattern = r.def.pattern;
    console.log(`Pattern: ${pattern}`);
    console.log(`  Severity: ${r.severity}`);
    console.log(`  Desc: ${r.def.description}`);
    
    // Test manual regex
    try {
      const re = new RegExp(pattern, "i");
      const cmd = "rm -rf /";
      const result = re.test(cmd);
      console.log(`  Test "rm -rf /": ${result ? "MATCH" : "NO MATCH"}`);
    } catch(e) {
      console.log(`  ERROR: ${e.message}`);
    }
    console.log();
  }
  process.exit(0);
})();
