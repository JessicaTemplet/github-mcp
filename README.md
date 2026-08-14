# github-mcp

A Model Context Protocol (MCP) server that gives Claude direct access to
GitHub: repos, files, branches, issues, pull requests, GitHub Actions, and
code search, authenticated with a personal access token.

## Why this exists

Claude Code has its own GitHub integration built in. Claude chat (the
desktop app, claude.ai) doesn't ship with a first party GitHub connector.
This server fills that gap for anyone who wants Claude to read and write to
their repos outside of Claude Code.

## What it can do

- List, search, and get details on repos
- Read and write files, list directories
- Branches: list, create, delete
- Issues: list, get, create, update, comment
- Pull requests: list, get, create, merge
- GitHub Actions: list workflows, list runs, trigger a run
- Search code and issues/PRs across your repositories
- List commits
- Create new repos
- Get info on the authenticated user

## Setup

1. Clone this repo and install dependencies:

   ```
   git clone https://github.com/JessicaTemplet/github-mcp.git
   cd github-mcp
   npm install
   npm run build
   ```

2. Create a GitHub personal access token at
   [Settings -> Developer settings -> Personal access tokens](https://github.com/settings/tokens).
   Give it the scopes you actually need (`repo` for private repo access,
   `workflow` if you want it triggering Actions).

3. Add it to your Claude Desktop config. Don't create a
   `claude_desktop_config.json` yourself somewhere and expect Claude Desktop
   to find it, that file has to be the one the app actually reads, and
   creating a separate one won't work. Instead, open Claude Desktop, go to
   Settings -> Developer -> Edit Config, and that opens the real config
   file for you to edit:

   ```json
   {
     "mcpServers": {
       "github": {
         "command": "node",
         "args": ["/absolute/path/to/github-mcp/dist/index.js"],
         "env": {
           "GITHUB_TOKEN": "your-token-here"
         }
       }
     }
   }
   ```

4. Restart Claude Desktop.

## Notes

- The token is read from an environment variable at runtime and is never
  written to disk by this server. Don't commit a token or a `.env` file to
  this repo.
- Built against the official `@modelcontextprotocol/sdk` and `@octokit/rest`.

## License

MIT, see [LICENSE](./LICENSE).
