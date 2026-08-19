<![CDATA[import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

// --- Startup scope check -----------------------------------------------
// Fail fast with a clear message instead of letting a missing scope
// surface as a confusing 403 deep inside some later tool call.
async function checkTokenScopes() {
  try {
    const res = await octokit.request("GET /user");
    const scopeHeader = res.headers["x-oauth-scopes"] ?? "";
    const scopes = scopeHeader.split(",").map((s) => s.trim()).filter(Boolean);
    const missing: string[] = [];
    if (!scopes.includes("repo")) missing.push("repo");
    if (!scopes.includes("workflow")) missing.push("workflow");
    if (missing.length > 0) {
      console.error(
        `Warning: GITHUB_TOKEN is missing recommended scope(s): ${missing.join(", ")}. ` +
        `Tools that need them (e.g. trigger_workflow needs 'workflow', private repo access needs 'repo') will fail until the token is regenerated with those scopes.`
      );
    }
  } catch (err: any) {
    // Fine-grained PATs don't return x-oauth-scopes at all — that's not an
    // error, just a different token type. Only warn on an actual auth failure.
    if (err?.status === 401) {
      console.error("Warning: GITHUB_TOKEN appears to be invalid or expired.");
    }
  }
}

// --- Argument validation -------------------------------------------------
// Each tool gets a zod schema. Parsing failures produce a clear, specific
// message ("owner: Required") instead of a raw TypeError from a `!` assertion
// deep inside a switch case.
const schemas = {
  list_repos: z.object({
    type: z.enum(["all", "owner", "public", "private", "forks"]).default("all"),
    sort: z.enum(["created", "updated", "pushed", "full_name"]).default("updated"),
    per_page: z.number().default(30),
  }),
  get_repo: z.object({ owner: z.string(), repo: z.string() }),
  list_branches: z.object({ owner: z.string(), repo: z.string() }),
  create_branch: z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    from_branch: z.string().optional(),
  }),
  delete_branch: z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    confirm: z.boolean().default(false),
  }),
  get_file: z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    branch: z.string().optional(),
  }),
  create_or_update_file: z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    content: z.string(),
    message: z.string(),
    branch: z.string().optional(),
    sha: z.string().optional(),
  }),
  delete_file: z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    message: z.string(),
    sha: z.string(),
    branch: z.string().optional(),
    confirm: z.boolean().default(false),
  }),
  list_directory: z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string().default(""),
    branch: z.string().optional(),
  }),
  list_issues: z.object({
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).default("open"),
    per_page: z.number().default(30),
  }),
  get_issue: z.object({ owner: z.string(), repo: z.string(), issue_number: z.number() }),
  create_issue: z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
  }),
  update_issue: z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
    title: z.string().optional(),
    body: z.string().optional(),
    state: z.enum(["open", "closed"]).optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
  }),
  comment_on_issue: z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
    body: z.string(),
  }),
  list_pull_requests: z.object({
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).default("open"),
    per_page: z.number().default(30),
  }),
  get_pull_request: z.object({ owner: z.string(), repo: z.string(), pull_number: z.number() }),
  create_pull_request: z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    head: z.string(),
    base: z.string(),
    draft: z.boolean().default(false),
  }),
  merge_pull_request: z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
    merge_method: z.enum(["merge", "squash", "rebase"]).default("merge"),
    commit_message: z.string().optional(),
    confirm: z.boolean().default(false),
  }),
  list_workflows: z.object({ owner: z.string(), repo: z.string() }),
  list_workflow_runs: z.object({
    owner: z.string(),
    repo: z.string(),
    workflow_id: z.string(),
    per_page: z.number().default(10),
  }),
  trigger_workflow: z.object({
    owner: z.string(),
    repo: z.string(),
    workflow_id: z.string(),
    ref: z.string(),
    inputs: z.record(z.string()).default({}),
    confirm: z.boolean().default(false),
  }),
  search_code: z.object({ query: z.string(), per_page: z.number().default(20) }),
  search_issues: z.object({ query: z.string(), per_page: z.number().default(20) }),
  list_commits: z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string().optional(),
    per_page: z.number().default(20),
  }),
  create_repo: z.object({
    name: z.string(),
    description: z.string().optional(),
    private: z.boolean().default(true),
    auto_init: z.boolean().default(true),
  }),
  get_authenticated_user: z.object({}),
} as const;

type ToolName = keyof typeof schemas;

// Tools that mutate or destroy state outside the local filesystem and can't
// be trivially undone (or are annoying enough to undo that a caller should
// have to mean it). Each requires `confirm: true` in the call args.
const DESTRUCTIVE_TOOLS = new Set<ToolName>([
  "delete_branch",
  "delete_file",
  "merge_pull_request",
  "trigger_workflow",
]);

function confirmationRequiredMessage(name: string, args: Record<string, unknown>) {
  const preview = JSON.stringify(args, null, 2);
  return (
    `'${name}' is a destructive operation and was not executed. ` +
    `Re-call it with "confirm": true once you've confirmed this is intended.\n\n` +
    `Args that would be used:\n${preview}`
  );
}

const server = new Server(
  { name: "github-mcp", version: "1.1.0" },
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
        properties: { owner: { type: "string" }, repo: { type: "string" } },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_branches",
      description: "List branches in a repository",
      inputSchema: {
        type: "object",
        properties: { owner: { type: "string" }, repo: { type: "string" } },
        required: ["owner", "repo"]
      }
    },
    {
      name: "create_branch",
      description: "Create a new branch in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" },
          branch: { type: "string" }, from_branch: { type: "string" }
        },
        required: ["owner", "repo", "branch"]
      }
    },
    {
      name: "delete_branch",
      description: "Delete a branch from a repository. Destructive — requires confirm: true.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" }, branch: { type: "string" },
          confirm: { type: "boolean", default: false, description: "Must be true to actually perform the deletion." }
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
          owner: { type: "string" }, repo: { type: "string" },
          path: { type: "string" }, branch: { type: "string" }
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
          owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" },
          content: { type: "string" }, message: { type: "string" },
          branch: { type: "string" }, sha: { type: "string" }
        },
        required: ["owner", "repo", "path", "content", "message"]
      }
    },
    {
      name: "delete_file",
      description: "Delete a file from a repository. Destructive — requires confirm: true.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" },
          message: { type: "string" }, sha: { type: "string" }, branch: { type: "string" },
          confirm: { type: "boolean", default: false, description: "Must be true to actually perform the deletion." }
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
          owner: { type: "string" }, repo: { type: "string" },
          path: { type: "string", default: "" }, branch: { type: "string" }
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
          owner: { type: "string" }, repo: { type: "string" },
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
        properties: { owner: { type: "string" }, repo: { type: "string" }, issue_number: { type: "number" } },
        required: ["owner", "repo", "issue_number"]
      }
    },
    {
      name: "create_issue",
      description: "Create a new issue",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" },
          body: { type: "string" }, labels: { type: "array", items: { type: "string" } },
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
          owner: { type: "string" }, repo: { type: "string" }, issue_number: { type: "number" },
          title: { type: "string" }, body: { type: "string" },
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
          owner: { type: "string" }, repo: { type: "string" },
          issue_number: { type: "number" }, body: { type: "string" }
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
          owner: { type: "string" }, repo: { type: "string" },
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
        properties: { owner: { type: "string" }, repo: { type: "string" }, pull_number: { type: "number" } },
        required: ["owner", "repo", "pull_number"]
      }
    },
    {
      name: "create_pull_request",
      description: "Create a new pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" },
          body: { type: "string" }, head: { type: "string" }, base: { type: "string" },
          draft: { type: "boolean", default: false }
        },
        required: ["owner", "repo", "title", "head", "base"]
      }
    },
    {
      name: "merge_pull_request",
      description: "Merge a pull request. Destructive — requires confirm: true.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" }, pull_number: { type: "number" },
          merge_method: { type: "string", enum: ["merge", "squash", "rebase"], default: "merge" },
          commit_message: { type: "string" },
          confirm: { type: "boolean", default: false, description: "Must be true to actually perform the merge." }
        },
        required: ["owner", "repo", "pull_number"]
      }
    },
    {
      name: "list_workflows",
      description: "List GitHub Actions workflows in a repository",
      inputSchema: {
        type: "object",
        properties: { owner: { type: "string" }, repo: { type: "string" } },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_workflow_runs",
      description: "List recent runs for a workflow",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" },
          workflow_id: { type: "string" }, per_page: { type: "number", default: 10 }
        },
        required: ["owner", "repo", "workflow_id"]
      }
    },
    {
      name: "trigger_workflow",
      description: "Manually trigger a GitHub Actions workflow. Destructive — requires confirm: true.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" }, workflow_id: { type: "string" },
          ref: { type: "string" }, inputs: { type: "object" },
          confirm: { type: "boolean", default: false, description: "Must be true to actually trigger the run." }
        },
        required: ["owner", "repo", "workflow_id", "ref"]
      }
    },
    {
      name: "search_code",
      description: "Search for code across your GitHub repositories",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, per_page: { type: "number", default: 20 } },
        required: ["query"]
      }
    },
    {
      name: "search_issues",
      description: "Search issues and pull requests across repositories",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, per_page: { type: "number", default: 20 } },
        required: ["query"]
      }
    },
    {
      name: "list_commits",
      description: "List commits in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" }, repo: { type: "string" },
          branch: { type: "string" }, per_page: { type: "number", default: 20 }
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
          name: { type: "string" }, description: { type: "string" },
          private: { type: "boolean", default: true }, auto_init: { type: "boolean", default: true }
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
  const { name, arguments: rawArgs } = request.params;

  if (!(name in schemas)) {
    return { content: [{ type: "text", text: `Error: Unknown tool: ${name}` }], isError: true };
  }
  const toolName = name as ToolName;

  // Validate before doing anything else. A bad call fails with a specific,
  // actionable message instead of a raw TypeError from deep inside a case.
  const parsed = schemas[toolName].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { content: [{ type: "text", text: `Error: invalid arguments for '${toolName}': ${issues}` }], isError: true };
  }
  const args = parsed.data as any;

  if (DESTRUCTIVE_TOOLS.has(toolName) && !args.confirm) {
    return { content: [{ type: "text", text: confirmationRequiredMessage(toolName, args) }] };
  }

  try {
    switch (toolName) {
      case "list_repos": {
        const { data } = await octokit.repos.listForAuthenticatedUser(args);
        return { content: [{ type: "text", text: JSON.stringify(data.map(r => ({
          name: r.name, full_name: r.full_name, private: r.private,
          description: r.description, default_branch: r.default_branch,
          updated_at: r.updated_at, language: r.language
        })), null, 2) }] };
      }

      case "get_repo": {
        const { data } = await octokit.repos.get(args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "list_branches": {
        const { data } = await octokit.repos.listBranches(args);
        return { content: [{ type: "text", text: JSON.stringify(data.map(b => ({ name: b.name, sha: b.commit.sha })), null, 2) }] };
      }

      case "create_branch": {
        const repoData = await octokit.repos.get({ owner: args.owner, repo: args.repo });
        const fromBranch = args.from_branch ?? repoData.data.default_branch;
        const { data: refData } = await octokit.git.getRef({ owner: args.owner, repo: args.repo, ref: `heads/${fromBranch}` });
        await octokit.git.createRef({ owner: args.owner, repo: args.repo, ref: `refs/heads/${args.branch}`, sha: refData.object.sha });
        return { content: [{ type: "text", text: `Branch '${args.branch}' created from '${fromBranch}'` }] };
      }

      case "delete_branch": {
        await octokit.git.deleteRef({ owner: args.owner, repo: args.repo, ref: `heads/${args.branch}` });
        return { content: [{ type: "text", text: `Branch '${args.branch}' deleted` }] };
      }

      case "get_file": {
        const { data } = await octokit.repos.getContent({
          owner: args.owner, repo: args.repo, path: args.path, ref: args.branch
        });
        if (Array.isArray(data)) throw new Error("Path is a directory, use list_directory instead");
        if (data.type !== "file") throw new Error(`Not a file: ${data.type}`);
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return { content: [{ type: "text", text: `File: ${data.path}\nSHA: ${data.sha}\n\n${content}` }] };
      }

      case "create_or_update_file": {
        const content = Buffer.from(args.content, "utf-8").toString("base64");
        const { data } = await octokit.repos.createOrUpdateFileContents({
          owner: args.owner, repo: args.repo, path: args.path, message: args.message,
          content, branch: args.branch, sha: args.sha
        });
        return { content: [{ type: "text", text: `File ${data.content?.path} ${args.sha ? "updated" : "created"}\nCommit: ${data.commit.sha}` }] };
      }

      case "delete_file": {
        const { data } = await octokit.repos.deleteFile({
          owner: args.owner, repo: args.repo, path: args.path,
          message: args.message, sha: args.sha, branch: args.branch
        });
        return { content: [{ type: "text", text: `File deleted. Commit: ${data.commit.sha}` }] };
      }

      case "list_directory": {
        const { data } = await octokit.repos.getContent({ owner: args.owner, repo: args.repo, path: args.path, ref: args.branch });
        if (!Array.isArray(data)) throw new Error("Path is a file, use get_file instead");
        return { content: [{ type: "text", text: JSON.stringify(data.map(f => ({ name: f.name, type: f.type, path: f.path, sha: f.sha, size: f.size })), null, 2) }] };
      }

      case "list_issues": {
        const { data } = await octokit.issues.listForRepo(args);
        return { content: [{ type: "text", text: JSON.stringify(data.map(i => ({
          number: i.number, title: i.title, state: i.state,
          labels: i.labels.map((l: any) => typeof l === "string" ? l : l.name), created_at: i.created_at
        })), null, 2) }] };
      }

      case "get_issue": {
        const { data } = await octokit.issues.get(args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_issue": {
        const { data } = await octokit.issues.create(args);
        return { content: [{ type: "text", text: `Issue #${data.number} created: ${data.html_url}` }] };
      }

      case "update_issue": {
        const { data } = await octokit.issues.update(args);
        return { content: [{ type: "text", text: `Issue #${data.number} updated: ${data.html_url}` }] };
      }

      case "comment_on_issue": {
        const { data } = await octokit.issues.createComment(args);
        return { content: [{ type: "text", text: `Comment added: ${data.html_url}` }] };
      }

      case "list_pull_requests": {
        const { data } = await octokit.pulls.list(args);
        return { content: [{ type: "text", text: JSON.stringify(data.map(p => ({
          number: p.number, title: p.title, state: p.state,
          head: p.head.ref, base: p.base.ref, draft: p.draft
        })), null, 2) }] };
      }

      case "get_pull_request": {
        const { data } = await octokit.pulls.get(args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_pull_request": {
        const { data } = await octokit.pulls.create(args);
        return { content: [{ type: "text", text: `PR #${data.number} created: ${data.html_url}` }] };
      }

      case "merge_pull_request": {
        const { confirm, ...mergeArgs } = args;
        const { data } = await octokit.pulls.merge(mergeArgs);
        return { content: [{ type: "text", text: `PR merged: ${data.message}\nSHA: ${data.sha}` }] };
      }

      case "list_workflows": {
        const { data } = await octokit.actions.listRepoWorkflows(args);
        return { content: [{ type: "text", text: JSON.stringify(data.workflows.map(w => ({ id: w.id, name: w.name, path: w.path, state: w.state })), null, 2) }] };
      }

      case "list_workflow_runs": {
        const { data } = await octokit.actions.listWorkflowRuns(args);
        return { content: [{ type: "text", text: JSON.stringify(data.workflow_runs.map(r => ({
          id: r.id, status: r.status, conclusion: r.conclusion,
          branch: r.head_branch, created_at: r.created_at
        })), null, 2) }] };
      }

      case "trigger_workflow": {
        const { confirm, ...triggerArgs } = args;
        await octokit.actions.createWorkflowDispatch(triggerArgs);
        return { content: [{ type: "text", text: `Workflow '${args.workflow_id}' triggered on '${args.ref}'` }] };
      }

      case "search_code": {
        const { data } = await octokit.search.code({ q: args.query, per_page: args.per_page });
        return { content: [{ type: "text", text: JSON.stringify(data.items.map(i => ({
          name: i.name, path: i.path, repo: i.repository.full_name, html_url: i.html_url
        })), null, 2) }] };
      }

      case "search_issues": {
        const { data } = await octokit.search.issuesAndPullRequests({ q: args.query, per_page: args.per_page });
        return { content: [{ type: "text", text: JSON.stringify(data.items.map(i => ({
          number: i.number, title: i.title, state: i.state, html_url: i.html_url
        })), null, 2) }] };
      }

      case "list_commits": {
        const { data } = await octokit.repos.listCommits({
          owner: args.owner, repo: args.repo, sha: args.branch, per_page: args.per_page
        });
        return { content: [{ type: "text", text: JSON.stringify(data.map(c => ({
          sha: c.sha, message: c.commit.message, author: c.commit.author?.name, date: c.commit.author?.date
        })), null, 2) }] };
      }

      case "create_repo": {
        const { data } = await octokit.repos.createForAuthenticatedUser(args);
        return { content: [{ type: "text", text: `Repo created: ${data.html_url}` }] };
      }

      case "get_authenticated_user": {
        const { data } = await octokit.users.getAuthenticated();
        return { content: [{ type: "text", text: JSON.stringify({
          login: data.login, name: data.name, email: data.email,
          public_repos: data.public_repos, total_private_repos: data.total_private_repos
        }, null, 2) }] };
      }
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

await checkTokenScopes();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("GitHub MCP server running");
]]>