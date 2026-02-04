#!/usr/bin/env node
// Local test to see what data Claude would receive

const https = require('https');

// Sample commit data that would come from GitHub API
const sampleCommitData = {
  "sha": "792bd0a4c6c1b8e9a2f0e1c3d4e5f6a7b8c9d0e",
  "message": "Merge pull request #4136 from MicrosoftDocs/main639058251872966003sync_temp\n\nFor protected branch, push strategy should use PR and merge to target branch method to work around git push error",
  "author": {
    "name": "Azure Docs Bot"
  },
  "files": [
    {
      "filename": "azure-local/deploy/deployment-prep-active-directory.md",
      "additions": 15,
      "deletions": 8,
      "patch": "@@ -45,7 +45,7 @@ To prepare Active Directory for Azure Local deployment, you must:\n \n 1. Create an Active Directory Lifecycle Manager (LCM) user account\n 2. Make sure it's a member of the **local Administrator** group\n-3. (Optional) Configure additional permissions\n+3. Create an Active Directory Lifecycle Manager (LCM) user account that's a member of the local Administrator group. Make sure this account also has *Log on as a batch job* rights, as described in [Log on as a batch job](/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/log-on-as-a-batch-job).\n \n For detailed instructions, see the [Prepare Active Directory for Azure Local deployment](../deploy/deployment-prep-active-directory.md) guide.\n"
    },
    {
      "filename": "azure-local/update/import-discover-updates-offline-23h2.md",
      "additions": 22,
      "deletions": 5,
      "patch": "@@ -120,6 +120,20 @@ The update procedure varies based on your environment:\n \n ## Offline Update Procedures\n \n+### LCM User Account Requirements\n+\n+When performing offline updates, your LCM user account requires specific permissions:\n+\n+- **Log on as a batch job** - Required for automated processes\n+- **Act as part of the operating system** - Required for system operations\n+- **Replace a process level token** - Required for token replacement\n+\n+To assign these rights:\n+\n+1. Open `secpol.msc` on the Azure Local node\n+2. Navigate to **Local Policies** > **User Rights Assignment**\n+3. Add your LCM user account to each required policy\n+4. Restart the node to apply changes\n+\n ### Preparing for Offline Updates\n \n"
    }
  ]
};

// The prompt that would be sent to Claude
function buildPrompt(commitData) {
  const files = commitData.files || [];
  const filesInfo = files.map(f => `- ${f.filename}: +${f.additions} -${f.deletions}`).join('\n');
  const diffs = files.slice(0, 3).map(f => f.patch || '').filter(p => p).join('\n\n');
  
  const prompt = `You are an Azure Local infrastructure expert writing for ops teams. 
              
Analyze this documentation change and write a 80-120 word technical blog post:

**Commit Message:** ${commitData.message}

**Files Changed:**
${filesInfo}

**Diff Preview:**
${diffs.slice(0, 1500)}

**Instructions:**
1. Explain what changed and why it matters for operations teams
2. Be specific - reference the actual changes (added fields, removed steps, etc.)
3. Mention any operational impact or required actions
4. Keep it technical but accessible`;

  return prompt;
}

console.log("=== CLAUDE API INPUT ===\n");
console.log(buildPrompt(sampleCommitData));

console.log("\n\n=== WHAT THIS WOULD GENERATE ===");
console.log("This prompt would be sent to Claude 3.5-Sonnet");
console.log("Max tokens: 1024");
console.log("Temperature: default (0.7)");
console.log("\nExpected response: 80-120 word technical blog post about:");
console.log("- LCM user account requirements for Azure Local deployment");
console.log("- Specific permissions needed (Log on as batch job, etc.)");
console.log("- Impact on offline update procedures");
