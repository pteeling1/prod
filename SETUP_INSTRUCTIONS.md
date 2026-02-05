# GitHub Actions Setup for Azure Local Blog Generator

## Required Secrets

The blog generation workflow requires the following GitHub repository secret to be configured:

### ANTHROPIC_API_KEY

To set this up:

1. Go to your GitHub repository: https://github.com/pteeling1/phase-2-4
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: Your Anthropic API key (starting with `sk-ant-...`)
5. Click **Add secret**

## How the Workflow Works

The `monitor-azure-local-docs.yml` workflow:

1. **Triggers**: 
   - On push to main (when workflow files change)
   - Every Monday at 9 AM UTC
   - Manual trigger via `workflow_dispatch`

2. **Steps**:
   - Fetches recent commits to MicrosoftDocs/azure-stack-docs
   - Filters for Azure Local documentation changes
   - Runs `scripts/generate-blog.js` with Anthropic Claude
   - Generates blog posts with full document context
   - Commits blog posts to `blogs-data.json`

3. **Features**:
   - Fetches current and previous versions of modified files
   - Provides Claude with full document context for better reasoning
   - Detects version-specific applicability (e.g., "applies to upgrades from 22H2")
   - Filters out metadata lines (ms.date, author, etc.)
   - Generates bulleted list format with inline documentation links

## Testing Locally

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Test with a specific commit
TEST_COMMIT=7c1e704 node scripts/generate-blog.js

# Or test against recent commits
node scripts/generate-blog.js
```

## Blog Post Format

Generated blog posts are stored in `blogs-data.json` with structure:

```json
{
  "id": "auto-2026-02-05-xyz123",
  "title": "Azure Local Update — February 5, 2026",
  "date": "2026-02-05",
  "content": "<p>...HTML content with bulleted list and links...</p>",
  "claude_generated": true,
  "auto_generated": true
}
```
