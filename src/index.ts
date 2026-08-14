import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

const server = new Server(
  { name: "github-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_repos",
      description: "List your GitHub repositories",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["all", "owner", "public", "private", "forks"], default: "all" },
          sort: { type: "string", enum: ["created", "updated", "pushed", "full_name"], default: "updated" },
          per_page: { type: "number", default: 30 }
        }
      }
    },
    {
      name: "get_repo",
      description: "Get details about a specific repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_branches",
      description: "List branches in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "create_branch",
      description: "Create a new branch in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          branch: { type: "string" },
          from_branch: { type: "string" }
        },
        required: ["owner", "repo", "branch"]
      }
    },
    {
      name: "delete_branch",
      description: "Delete a branch from a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          branch: { type: "string" }
        },
        required: ["owner", "repo", "branch"]
      }
    },
    {
      name: "get_file",
      description: "Get the contents of a file from a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string" },
          branch: { type: "string" }
        },
        required: ["owner", "repo", "path"]
      }
    },
    {
      name: "create_or_update_file",
      description: "Create or update a file in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string" },
          content: { type: "string" },
          message: { type: "string" },
          branch: { type: "string" },
          sha: { type: "string" }
        },
        required: ["owner", "repo", "path", "content", "message"]
      }
    },
    {
      name: "delete_file",
      description: "Delete a file from a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string" },
          message: { type: "string" },
          sha: { type: "string" },
          branch: { type: "string" }
        },
        required: ["owner", "repo", "path", "message", "sha"]
      }
    },
    {
      name: "list_directory",
      description: "List contents of a directory in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string", default: "" },
          branch: { type: "string" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_issues",
      description: "List issues in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
          per_page: { type: "number", default: 30 }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "get_issue",
      description: "Get a specific issue",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "number" }
        },
        required: ["owner", "repo", "issue_number"]
      }
    },
    {
      name: "create_issue",
      description: "Create a new issue",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
          assignees: { type: "array", items: { type: "string" } }
        },
        required: ["owner", "repo", "title"]
      }
    },
    {
      name: "update_issue",
      description: "Update an existing issue",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "number" },
          title: { type: "string" },
          body: { type: "string" },
          state: { type: "string", enum: ["open", "closed"] },
          labels: { type: "array", items: { type: "string" } },
          assignees: { type: "array", items: { type: "string" } }
        },
        required: ["owner", "repo", "issue_number"]
      }
    },
    {
      name: "comment_on_issue",
      description: "Add a comment to an issue or pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "number" },
          body: { type: "string" }
        },
        required: ["owner", "repo", "issue_number", "body"]
      }
    },
    {
      name: "list_pull_requests",
      description: "List pull requests in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
          per_page: { type: "number", default: 30 }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "get_pull_request",
      description: "Get details of a specific pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" }
        },
        required: ["owner", "repo", "pull_number"]
      }
    },
    {
      name: "create_pull_request",
      description: "Create a new pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          head: { type: "string" },
          base: { type: "string" },
          draft: { type: "boolean", default: false }
        },
        required: ["owner", "repo", "title", "head", "base"]
      }
    },
    {
      name: "merge_pull_request",
      description: "Merge a pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
          merge_method: { type: "string", enum: ["merge", "squash", "rebase"], default: "merge" },
          commit_message: { type: "string" }
        },
        required: ["owner", "repo", "pull_number"]
      }
    },
    {
      name: "list_workflows",
      description: "List GitHub Actions workflows in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_workflow_runs",
      description: "List recent runs for a workflow",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          workflow_id: { type: "string" },
          per_page: { type: "number", default: 10 }
        },
        required: ["owner", "repo", "workflow_id"]
      }
    },
    {
      name: "trigger_workflow",
      description: "Manually trigger a GitHub Actions workflow",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          workflow_id: { type: "string" },
          ref: { type: "string" },
          inputs: { type: "object" }
        },
        required: ["owner", "repo", "workflow_id", "ref"]
      }
    },
    {
      name: "search_code",
      description: "Search for code across your GitHub repositories",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          per_page: { type: "number", default: 20 }
        },
        required: ["query"]
      }
    },
    {
      name: "search_issues",
      description: "Search issues and pull requests across repositories",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          per_page: { type: "number", default: 20 }
        },
        required: ["query"]
      }
    },
    {
      name: "list_commits",
      description: "List commits in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          branch: { type: "string" },
          per_page: { type: "number", default: 20 }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "create_repo",
      description: "Create a new GitHub repository",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          private: { type: "boolean", default: true },
          auto_init: { type: "boolean", default: true }
        },
        required: ["name"]
      }
    },
    {
      name: "get_authenticated_user",
      description: "Get info about the authenticated GitHub user",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_repos": {
        const { data } = await octokit.repos.listForAuthenticatedUser({
          type: (args?.type as any) ?? "all",
          sort: (args?.sort as any) ?? "updated",
          per_page: (args?.per_page as number) ?? 30
        });
        return { content: [{ type: "text", text: JSON.stringify(data.map(r => ({
          name: r.name, full_name: r.full_name, private: r.private,
          description: r.description, default_branch: r.default_branch,
          updated_at: r.updated_at, language: r.language
        })), null, 2) }] };
      }

      case "get_repo": {
        const { data } = await octokit.repos.get({ owner: args!.owner as string, repo: args!.repo as string });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "list_branches": {
        const { data } = await octokit.repos.listBranches({ owner: args!.owner as string, repo: args!.repo as string });
        return { content: [{ type: "text", text: JSON.stringify(data.map(b => ({ name: b.name, sha: b.commit.sha })), null, 2) }] };
      }

      case "create_branch": {
        const owner = args!.owner as string;
        const repo = args!.repo as string;
        const repoData = await octokit.repos.get({ owner, repo });
        const fromBranch = (args!.from_branch as string) ?? repoData.data.default_branch;
        const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${fromBranch}` });
        await octokit.git.createRef({ owner, repo, ref: `refs/heads/${args!.branch as string}`, sha: refData.object.sha });
        return { content: [{ type: "text", text: `Branch '${args!.branch}' created from '${fromBranch}'` }] };
      }

      case "delete_branch": {
        await octokit.git.deleteRef({ owner: args!.owner as string, repo: args!.repo as string, ref: `heads/${args!.branch as string}` });
        return { content: [{ type: "text", text: `Branch '${args!.branch}' deleted` }] };
      }

      case "get_file": {
        const { data } = await octokit.repos.getContent({
          owner: args!.owner as string, repo: args!.repo as string,
          path: args!.path as string, ref: args?.branch as string
        });
        if (Array.isArray(data)) throw new Error("Path is a directory, use list_directory instead");
        if (data.type !== "file") throw new Error(`Not a file: ${data.type}`);
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return { content: [{ type: "text", text: `File: ${data.path}\nSHA: ${data.sha}\n\n${content}` }] };
      }

      case "create_or_update_file": {
        const content = Buffer.from(args!.content as string, "utf-8").toString("base64");
        const { data } = await octokit.repos.createOrUpdateFileContents({
          owner: args!.owner as string, repo: args!.repo as string,
          path: args!.path as string, message: args!.message as string,
          content, branch: args?.branch as string, sha: args?.sha as string
        });
        return { content: [{ type: "text", text: `File ${data.content?.path} ${args?.sha ? "updated" : "created"}\nCommit: ${data.commit.sha}` }] };
      }

      case "delete_file": {
        const { data } = await octokit.repos.deleteFile({
          owner: args!.owner as string, repo: args!.repo as string,
          path: args!.path as string, message: args!.message as string,
          sha: args!.sha as string, branch: args?.branch as string
        });
        return { content: [{ type: "text", text: `File deleted. Commit: ${data.commit.sha}` }] };
      }

      case "list_directory": {
        const { data } = await octokit.repos.getContent({
          owner: args!.owner as string, repo: args!.repo as string,
          path: (args?.path as string) ?? "", ref: args?.branch as string
        });
        if (!Array.isArray(data)) throw new Error("Path is a file, use get_file instead");
        return { content: [{ type: "text", text: JSON.stringify(data.map(f => ({ name: f.name, type: f.type, path: f.path, sha: f.sha, size: f.size })), null, 2) }] };
      }

      case "list_issues": {
        const { data } = await octokit.issues.listForRepo({
          owner: args!.owner as string, repo: args!.repo as string,
          state: (args?.state as any) ?? "open", per_page: (args?.per_page as number) ?? 30
        });
        return { content: [{ type: "text", text: JSON.stringify(data.map(i => ({
          number: i.number, title: i.title, state: i.state,
          labels: i.labels.map((l: any) => l.name), created_at: i.created_at
        })), null, 2) }] };
      }

      case "get_issue": {
        const { data } = await octokit.issues.get({ owner: args!.owner as string, repo: args!.repo as string, issue_number: args!.issue_number as number });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_issue": {
        const { data } = await octokit.issues.create({
          owner: args!.owner as string, repo: args!.repo as string,
          title: args!.title as string, body: args?.body as string,
          labels: args?.labels as string[], assignees: args?.assignees as string[]
        });
        return { content: [{ type: "text", text: `Issue #${data.number} created: ${data.html_url}` }] };
      }

      case "update_issue": {
        const { data } = await octokit.issues.update({
          owner: args!.owner as string, repo: args!.repo as string,
          issue_number: args!.issue_number as number, title: args?.title as string,
          body: args?.body as string, state: args?.state as any,
          labels: args?.labels as string[], assignees: args?.assignees as string[]
        });
        return { content: [{ type: "text", text: `Issue #${data.number} updated: ${data.html_url}` }] };
      }

      case "comment_on_issue": {
        const { data } = await octokit.issues.createComment({
          owner: args!.owner as string, repo: args!.repo as string,
          issue_number: args!.issue_number as number, body: args!.body as string
        });
        return { content: [{ type: "text", text: `Comment added: ${data.html_url}` }] };
      }

      case "list_pull_requests": {
        const { data } = await octokit.pulls.list({
          owner: args!.owner as string, repo: args!.repo as string,
          state: (args?.state as any) ?? "open", per_page: (args?.per_page as number) ?? 30
        });
        return { content: [{ type: "text", text: JSON.stringify(data.map(p => ({
          number: p.number, title: p.title, state: p.state,
          head: p.head.ref, base: p.base.ref, draft: p.draft
        })), null, 2) }] };
      }

      case "get_pull_request": {
        const { data } = await octokit.pulls.get({ owner: args!.owner as string, repo: args!.repo as string, pull_number: args!.pull_number as number });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_pull_request": {
        const { data } = await octokit.pulls.create({
          owner: args!.owner as string, repo: args!.repo as string,
          title: args!.title as string, body: args?.body as string,
          head: args!.head as string, base: args!.base as string, draft: args?.draft as boolean
        });
        return { content: [{ type: "text", text: `PR #${data.number} created: ${data.html_url}` }] };
      }

      case "merge_pull_request": {
        const { data } = await octokit.pulls.merge({
          owner: args!.owner as string, repo: args!.repo as string,
          pull_number: args!.pull_number as number,
          merge_method: (args?.merge_method as any) ?? "merge",
          commit_message: args?.commit_message as string
        });
        return { content: [{ type: "text", text: `PR merged: ${data.message}\nSHA: ${data.sha}` }] };
      }

      case "list_workflows": {
        const { data } = await octokit.actions.listRepoWorkflows({ owner: args!.owner as string, repo: args!.repo as string });
        return { content: [{ type: "text", text: JSON.stringify(data.workflows.map(w => ({ id: w.id, name: w.name, path: w.path, state: w.state })), null, 2) }] };
      }

      case "list_workflow_runs": {
        const { data } = await octokit.actions.listWorkflowRuns({
          owner: args!.owner as string, repo: args!.repo as string,
          workflow_id: args!.workflow_id as string, per_page: (args?.per_page as number) ?? 10
        });
        return { content: [{ type: "text", text: JSON.stringify(data.workflow_runs.map(r => ({
          id: r.id, status: r.status, conclusion: r.conclusion,
          branch: r.head_branch, created_at: r.created_at
        })), null, 2) }] };
      }

      case "trigger_workflow": {
        await octokit.actions.createWorkflowDispatch({
          owner: args!.owner as string, repo: args!.repo as string,
          workflow_id: args!.workflow_id as string, ref: args!.ref as string,
          inputs: (args?.inputs as Record<string, string>) ?? {}
        });
        return { content: [{ type: "text", text: `Workflow '${args!.workflow_id}' triggered on '${args!.ref}'` }] };
      }

      case "search_code": {
        const { data } = await octokit.search.code({ q: args!.query as string, per_page: (args?.per_page as number) ?? 20 });
        return { content: [{ type: "text", text: JSON.stringify(data.items.map(i => ({
          name: i.name, path: i.path, repo: i.repository.full_name, html_url: i.html_url
        })), null, 2) }] };
      }

      case "search_issues": {
        const { data } = await octokit.search.issuesAndPullRequests({ q: args!.query as string, per_page: (args?.per_page as number) ?? 20 });
        return { content: [{ type: "text", text: JSON.stringify(data.items.map(i => ({
          number: i.number, title: i.title, state: i.state, html_url: i.html_url
        })), null, 2) }] };
      }

      case "list_commits": {
        const { data } = await octokit.repos.listCommits({
          owner: args!.owner as string, repo: args!.repo as string,
          sha: args?.branch as string, per_page: (args?.per_page as number) ?? 20
        });
        return { content: [{ type: "text", text: JSON.stringify(data.map(c => ({
          sha: c.sha, message: c.commit.message, author: c.commit.author?.name, date: c.commit.author?.date
        })), null, 2) }] };
      }

      case "create_repo": {
        const { data } = await octokit.repos.createForAuthenticatedUser({
          name: args!.name as string, description: args?.description as string,
          private: (args?.private as boolean) ?? true, auto_init: (args?.auto_init as boolean) ?? true
        });
        return { content: [{ type: "text", text: `Repo created: ${data.html_url}` }] };
      }

      case "get_authenticated_user": {
        const { data } = await octokit.users.getAuthenticated();
        return { content: [{ type: "text", text: JSON.stringify({
          login: data.login, name: data.name, email: data.email,
          public_repos: data.public_repos, total_private_repos: data.total_private_repos
        }, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("GitHub MCP server running");
