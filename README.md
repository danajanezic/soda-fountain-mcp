# soda-fountain-mcp

An MCP server for querying [Socrata](https://dev.socrata.com/) open data portals. Discover government datasets from states, cities, counties, and federal agencies, then query them using SoQL — all from your AI assistant.

## Tools

| Tool | Description |
|------|-------------|
| `list_domains` | List available Socrata open data portals |
| `get_domain_categories` | Get categories and tags for a portal |
| `search_datasets` | Search a portal's dataset catalog |
| `get_dataset_schema` | Get column definitions and sample rows |
| `query_dataset` | Execute SoQL queries against a dataset |
| `validate_soql` | Validate SoQL query syntax before executing |
| `find_correlation_keys` | Discover joinable columns across datasets |

## Installation

### Prerequisites

- Node.js 18+
- npm

### Build from source

```bash
git clone https://github.com/danajanezic/soda-fountain-mcp.git
cd soda-fountain-mcp
npm install
npm run build
```

### Configure your MCP client

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "soda-fountain": {
      "command": "node",
      "args": ["/absolute/path/to/soda-fountain-mcp/dist/index.js"],
      "env": {
        "SOCRATA_API_KEY": "your-app-token"
      }
    }
  }
}
```

Or for Claude Code (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "soda-fountain": {
      "command": "node",
      "args": ["/absolute/path/to/soda-fountain-mcp/dist/index.js"],
      "env": {
        "SOCRATA_API_KEY": "your-app-token"
      }
    }
  }
}
```

### API key (optional)

A Socrata app token (`SOCRATA_API_KEY`) is optional but recommended — without one, requests are subject to stricter rate limits. You can register for a free token at [dev.socrata.com](https://dev.socrata.com/).

## Example Questions

Here are some things you can ask your AI assistant once soda-fountain-mcp is connected:

**Single-dataset lookups**
- "What are the largest wildfires in Oregon history?"
- "Show me the top 10 highest-paid employees in New York state"
- "How many active businesses are registered in Portland?"
- "What are the most common 311 complaint types in Chicago?"

**Trends over time**
- "How has the number of wildfires in Oregon changed year over year?"
- "What's the trend in CDC reported cases of foodborne illness since 2010?"
- "Are business registrations in Texas going up or down?"

**Cross-portal comparisons**
- "How do state employee payrolls compare between New York and Texas?"
- "Compare 311 service request volumes between Chicago and NYC"
- "Which state has more open datasets about public safety — New York or Pennsylvania?"

**Exploratory research**
- "What data does data.cityofnewyork.us have about housing?"
- "I'm researching water quality — which portals have relevant datasets?"
- "What kinds of questions could I answer with Iowa's open data?"

The server covers 20+ portals including NYC, Chicago, LA, and state-level data for Oregon, Washington, New York, Texas, Colorado, and more. Use `list_domains` to see them all.

## Design Philosophy

### The server is a bridge, not a brain

The agent handles intent detection and decides which tools to call. The server's job is to be a clean, well-documented bridge to the Socrata API — it doesn't try to guess what the agent wants, and it doesn't hide the underlying data model. Tool descriptions encode the intended workflow (`list_domains` → `get_domain_categories` → `search_datasets` → `get_dataset_schema` → `query_dataset`) so the agent can discover the right sequence on its own.

### Guided discovery over raw access

Most data APIs assume the caller already knows what they're looking for. LLMs don't. The tool progression is a narrowing funnel that mirrors how a human researcher would explore unfamiliar data — each step returns exactly the context the agent needs to make the next call correctly.

### Errors are agent signals, not stack traces

Every error is a structured envelope with `code`, `message`, `recoverable`, and `suggestion` fields. The agent gets unambiguous signals: `recoverable: true` means fix the input and retry; `recoverable: false` means tell the user. Empty results include a `notice` field that explicitly tells the agent not to hallucinate data. The server never throws exceptions that crash the process — all failures are returned as MCP tool responses.

### Catch mistakes before they cost round-trips

LLMs habitually write SQL instead of SoQL, hallucinate column names, and forget GROUP BY clauses. The server validates queries in two layers before hitting the Socrata API:

- **Syntax validation** (`validate_soql`) catches structural mistakes — SQL-isms like `JOIN` and `DISTINCT`, missing aggregation clauses, invalid operators.
- **Schema-aware validation** runs automatically inside `query_dataset`, checking column names against the actual dataset schema. Wrong column name? You get a fuzzy-match suggestion instead of a Socrata 400 error.

### Rich responses that reduce follow-up calls

Query responses include column types, null counts, numeric summaries, and truncation warnings alongside the data itself. The agent gets the context it needs to interpret results — and to explain caveats to the user — without making additional API calls.

### Cross-dataset intelligence

Government data is siloed by portal but connected by shared dimensions — counties, ZIP codes, NAICS codes, fiscal years. The `find_correlation_keys` tool encodes a static index of these shared keys so the agent can discover joinable columns across datasets and portals without manual column-matching.

### Prompts as workflows

The server ships with prompt templates (`explore_portal`, `investigate_question`, `compare_across_portals`, etc.) that encode multi-step research workflows. These aren't just convenience — they represent tested sequences of tool calls that produce reliable, thorough results. They turn "look at Oregon fire data" into a structured investigation with reproducible queries.
