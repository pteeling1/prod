const https = require('https');

function httpGet(hostname, path) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path, method: 'GET', headers: { 'User-Agent': 'Azure-Local-Blog-Monitor' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  console.log('Searching for batch-job permission change in PR repo...\n');
  
  // Get last 100 commits from PR repo
  const prCommits = await httpGet('api.github.com', '/repos/MicrosoftDocs/azure-stack-docs-pr/commits?sha=live&per_page=100');
  
  if (!Array.isArray(prCommits)) {
    console.log('Could not fetch PR commits');
    return;
  }
  
  for (let i = 0; i < Math.min(prCommits.length, 30); i++) {
    const c = prCommits[i];
    const date = new Date(c.commit.committer.date);
    const msg = c.commit.message.split('\n')[0];
    
    console.log(`Commit ${i}: ${msg}`);
    console.log(`  Date: ${c.commit.committer.date}`);
    
    const detail = await httpGet('api.github.com', `/repos/MicrosoftDocs/azure-stack-docs-pr/commits/${c.sha}`);
    const files = detail.files || [];
    
    // Check for upgrade file
    const upgradeFile = files.find(f => f.filename.includes('install-solution-upgrade'));
    if (upgradeFile) {
      console.log('  ✓✓✓ FOUND install-solution-upgrade.md!');
      console.log('      Changes: +' + upgradeFile.additions + ' -' + upgradeFile.deletions);
      
      // Show first few lines
      if (upgradeFile.patch) {
        const lines = upgradeFile.patch.split('\n').slice(0, 20);
        lines.forEach(line => console.log('    ' + line.slice(0, 80)));
      }
    }
    
    console.log();
  }
})();
