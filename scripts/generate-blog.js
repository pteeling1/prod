#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Utility: Make HTTPS request and return parsed JSON
function httpGet(hostname, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: requestPath,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Azure-Local-Blog-Generator',
        ...headers
      }
    };

    https.get(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        }
      });
    }).on('error', reject);
  });
}

// Utility: Make HTTPS POST request (for Claude API)
function httpPost(hostname, requestPath, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const jsonData = JSON.stringify(data);
    const options = {
      hostname,
      path: requestPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonData),
        'User-Agent': 'Azure-Local-Blog-Generator',
        ...headers
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(jsonData);
    req.end();
  });
}

// Call Claude API
async function callClaudeAPI(prompt, githubToken) {
  console.log('📝 Calling Claude API via Anthropic...');
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }
  
  const response = await httpPost(
    'api.anthropic.com',
    '/v1/messages',
    {
      model: 'claude-opus-4-1',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    },
    {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  );

  const content = response?.content?.[0]?.text;
  if (!content) {
    throw new Error('No content in Claude response');
  }

  console.log('✅ Claude response received');
  return content;
}

// Fetch recent Azure Local commits
async function fetchAzureLocalCommits() {
  console.log('🔍 Fetching Azure Local commits...');
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const response = await httpGet(
    'api.github.com',
    `/repos/MicrosoftDocs/azure-stack-docs/commits?sha=main&since=${sevenDaysAgo}&per_page=50`
  );

  if (!Array.isArray(response) || response.length === 0) {
    console.log('⚠️  No commits found in past 7 days');
    return null;
  }

  console.log(`✅ Found ${response.length} commits`);

  // Find an Azure Local-related commit
  let commit = response.find(c => 
    /azure.local|azure\/local|deployment|upgrade/i.test(c.commit.message)
  ) || response[0];

  console.log(`📌 Selected commit: ${commit.sha.slice(0, 7)}`);
  return commit;
}

// Fetch full commit with diffs
async function fetchFullCommit(sha) {
  console.log(`📂 Fetching full commit details...`);
  
  const response = await httpGet(
    'api.github.com',
    `/repos/MicrosoftDocs/azure-stack-docs/commits/${sha}`
  );

  console.log(`✅ Retrieved ${response.files?.length || 0} files`);
  return response;
}

// Map GitHub path to docs.microsoft.com URL
function githubPathToDocsUrl(filepath) {
  const cleanPath = filepath.replace(/\.md$/, '').replace(/^.*?\//, '');
  return `https://learn.microsoft.com/en-us/azure-stack/${cleanPath}`;
}

// Parse diff to extract meaningful added/removed lines
function extractMeaningfulDiffs(files) {
  const changes = [];
  
  for (const file of files.slice(0, 5)) {
    if (!file.patch) continue;
    
    const lines = file.patch.split('\n');
    const added = [];
    const removed = [];
    
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const content = line.substring(1).trim();
        if (content.length > 15 && !content.match(/^[#\s]*$/)) added.push(content);
      }
      if (line.startsWith('-') && !line.startsWith('---')) {
        const content = line.substring(1).trim();
        if (content.length > 15 && !content.match(/^[#\s]*$/)) removed.push(content);
      }
    }
    
    if (added.length > 0 || removed.length > 0) {
      changes.push({
        file: file.filename,
        docsUrl: githubPathToDocsUrl(file.filename),
        added: added.slice(0, 4),
        removed: removed.slice(0, 4)
      });
    }
  }
  
  return changes;
}

// Build the prompt for Claude
function buildPrompt(fullCommit) {
  const files = fullCommit.files || [];
  const meaningfulChanges = extractMeaningfulDiffs(files);
  
  // Format changes for Claude with before/after context
  const changesContext = meaningfulChanges.map(c => {
    let text = `\n**${c.file}**`;
    if (c.removed.length > 0) {
      text += `\nRemoved: ${c.removed.map(r => `"${r}"`).join(' | ')}`;
    }
    if (c.added.length > 0) {
      text += `\nAdded: ${c.added.map(a => `"${a}"`).join(' | ')}`;
    }
    return text;
  }).join('');

  return `You are an Azure Local infrastructure expert analyzing documentation changes.

COMMIT: ${fullCommit.commit.message}

ACTUAL CHANGES (what was removed vs. added):
${changesContext}

Your task:
1. IDENTIFY the specific technical change - quote the actual text that changed, don't summarize
2. EXPLAIN WHY it matters - be concrete about operational impact (e.g., "deployments will fail if...", "teams must add...")
3. DESCRIBE WHAT TO DO - what actionable steps ops teams need to take
4. AVOID generic language - no "enhanced", "streamlined", "updated" without specific details

Write a 100-120 word technical blog post. Focus on concrete changes and what ops teams must know to operate correctly.`;
}

// Generate blog post object
function createBlogPost(claudeContent, fullCommit) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const dateDisplay = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Convert Claude's response to HTML paragraphs
  const htmlContent = claudeContent
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p class="article-text">${p.trim()}</p>`)
    .join('');

  // Link to the primary docs page being updated
  const mainFile = (fullCommit.files || [])[0];
  const docsUrl = mainFile ? githubPathToDocsUrl(mainFile.filename) : 'https://learn.microsoft.com/en-us/azure-stack/';
  const linkHtml = `<p class="article-text"><a href="${docsUrl}">📖 Read the updated documentation →</a></p>`;

  return {
    id: `auto-${dateStr}-${Math.random().toString(36).slice(2, 10)}`,
    title: `Azure Local Update — ${dateDisplay}`,
    subtitle: 'Documentation changes',
    date: dateStr,
    content: htmlContent + linkHtml,
    source: 'Azure Local Blog Monitor',
    auto_generated: true,
    claude_generated: true
  };
}

// Main execution
async function main() {
  try {
    console.log('🚀 Azure Local Blog Generator');
    console.log('================================\n');

    // Check for test mode
    const testMode = process.env.TEST_MODE === 'true';
    
    // Check for GitHub token or Anthropic API key
    const githubToken = process.env.GITHUB_TOKEN || process.env.COPILOT_API_TOKEN;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    
    if (!testMode && !githubToken && !anthropicKey) {
      throw new Error('Please set TEST_MODE=true, GITHUB_TOKEN, or ANTHROPIC_API_KEY');
    }
    
    if (testMode) {
      console.log('🧪 Running in TEST MODE (using mock data)\n');
    }

    // Fetch commits
    let commit, fullCommit, claudeContent;
    
    if (testMode) {
      // Mock data for testing
      commit = {
        sha: 'abc1234567890def',
        commit: { message: 'Docs: Update Azure Local deployment guide' }
      };
      fullCommit = {
        sha: 'abc1234567890def',
        commit: { message: 'Docs: Update Azure Local deployment guide for v1.2.3' },
        files: [
          { filename: 'docs/deploy-azure-local.md', additions: 25, deletions: 12, patch: '--- a/docs/deploy-azure-local.md\n+++ b/docs/deploy-azure-local.md\n@@ -45,7 +45,10 @@\n ## Prerequisites\n\n+Updated for Azure Local v1.2.3\n These are the minimum requirements:' }
        ]
      };
      claudeContent = 'Azure Local deployment documentation has been updated to reflect the latest v1.2.3 release. Key changes include improved prerequisite documentation and additional guidance for cluster operators. This update simplifies the deployment experience and reduces common configuration errors.';
    } else {
      commit = await fetchAzureLocalCommits();
      if (!commit) {
        console.log('💤 No commits found, skipping blog generation');
        process.exit(0);
      }

      // Get full commit with diffs
      fullCommit = await fetchFullCommit(commit.sha);

      // Call Claude to generate blog content
      claudeContent = await callClaudeAPI(buildPrompt(fullCommit), githubToken);
    }

    // Create blog post object
    const blogPost = createBlogPost(claudeContent, fullCommit);

    // Read blogs-data.json
    const blogsDataPath = path.join(__dirname, '..', 'blogs-data.json');
    console.log(`\n📖 Updating ${blogsDataPath}...`);

    let blogsData = { auto_posts: [] };
    if (fs.existsSync(blogsDataPath)) {
      const content = fs.readFileSync(blogsDataPath, 'utf8');
      try {
        blogsData = JSON.parse(content);
      } catch (e) {
        console.warn('⚠️  Could not parse existing blogs-data.json, starting fresh');
      }
    }

    // Add new post to beginning of array
    if (!Array.isArray(blogsData.auto_posts)) {
      blogsData.auto_posts = [];
    }
    blogsData.auto_posts.unshift(blogPost);

    // Write back to file
    fs.writeFileSync(blogsDataPath, JSON.stringify(blogsData, null, 2));
    console.log(`✅ Blog post added! Total posts: ${blogsData.auto_posts.length}`);

    console.log('\n📝 Generated Blog Post:');
    console.log(`   Title: ${blogPost.title}`);
    console.log(`   Content length: ${blogPost.content.length} chars`);
    console.log(`   ID: ${blogPost.id}`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
