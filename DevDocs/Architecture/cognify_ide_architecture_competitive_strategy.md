# Cognify IDE: Architectural Specification & Competitive Strategy

## Executive Summary
This document outlines the architectural blueprint, data model, and AI feature roadmap for **Cognify IDE** (`cognify_ide`). 

While Obsidian serves as an extensible, local-first personal knowledge management (PKM) tool for Markdown documents, Cognify merges PKM directly into an integrated development environment (IDE). By bridging the gap between documentation, code abstract syntax trees (ASTs), git version control, and vector-backed semantic graphs, Cognify transforms static notes into an active cognitive engine for developers.

---

## 1. Competitive Advantage: Cognify IDE vs. Obsidian

| Capability | Obsidian | Cognify IDE |
| :--- | :--- | :--- |
| **Core Abstraction** | Document-first (Notes linking to notes) | System-first (Code AST $\leftrightarrow$ Documentation $\leftrightarrow$ Decisions) |
| **Linking Engine** | Manual wikilinks (`[[Note]]`) | Hybrid: Explicit wikilinks + Automatic semantic embeddings |
| **Code Awareness** | Plain text / static code snippets | Real-time AST & LSP resolution (functions, classes, endpoints) |
| **Graph View** | Structural node graph based on raw links | Semantic cluster graph with vector proximity + dynamic call paths |
| **Whiteboard / Canvas** | Manual note card positioning | Self-assembling AI Canvas (workflows, logic flows, diffs) |
| **Version Drift** | None; documentation rots silently | Automated Architecture Drift alerts tied to git commits |
| **Runtime & Overhead** | Heavy Electron shell | High-performance Tauri v2 / Code-OSS host with native workers |

---

## 2. Differentiating AI & Knowledge Features

### 2.1. Code-Aware Bidirectional Linking (`[[Doc]]` $\leftrightarrow$ Code AST)
- **Symbol Linking:** Support syntax extending beyond files to include code identifiers (e.g., `[[src/services/AuthService.ts#validateSession]]`).
- **In-Editor CodeLens:** Display inline references directly above source code declarations:
  > *`3 Cognify Notes reference this function | 1 Architecture Decision Record (ADR)`*
- **AST Watcher:** When code symbols are refactored via LSP or tree-sitter, Cognify automatically updates or flags dependent documentation links.

### 2.2. Autonomous Architecture Drift & Commit Monitoring
- **Git Hook Synthesis:** On every git stage, commit, or branch switch, Cognify maps modified files against registered knowledge entities in the graph.
- **Drift Warnings:** If an API route, database schema, or method signature changes without updating its associated ADR or design doc, an inline diagnostic is raised:
  > *`Warning: Architecture Drift in docs/adr/003-auth.md. Referenced schema 'users.v1' was altered in commit a3b81f.`*

### 2.3. Semantic Clustering & Dynamic Associative Edges
- **Zero-Friction Linking:** Documents and code files are broken into semantic chunks. Local embeddings discover connections without requiring manual `[[wikilink]]` typing.
- **Topographical Graph:** Nodes cluster based on HDBSCAN density clustering over embedding space, automatically organizing files into functional domains (e.g., Auth, Storage, Billing, Telemetry).

### 2.4. Agentic Spatial Canvas
- **Dynamic Whiteboard Assembly:** Users can select disparate files or notes and request an AI synthesis:
  - *“Map authentication flow from controller to database”*
  - *“Identify architecture contradictions between these three RFCs”*
- **Live Canvas Cards:** Canvas nodes are active editor buffers and diagrams rather than static cards.

---

## 3. Revised Technical Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Cognify IDE UI Layer                            │
│  ┌───────────────────────┐  ┌───────────────────┐  ┌─────────────────┐ │
│  │ Monaco / CM6 Editor   │  │ PixiJS / WebGL    │  │ Tldraw Infinite │ │
│  │ (Code + Live Markdown)│  │ (Knowledge Graph) │  │ (Spatial Canvas)│ │
│  └───────────────────────┘  └───────────────────┘  └─────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC / RPC Bridge
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Workspace Intelligence Engine                       │
│                       (Rust Sidecar / Tauri Core)                      │
│  ┌─────────────────────────┐                 ┌───────────────────────┐ │
│  │ FS Watcher & Git State  │                 │ Tree-sitter & AST     │ │
│  │ (notify crate)          │                 │ Token Parser          │ │
│  └───────────┬─────────────┘                 └───────────┬───────────┘ │
│              │                                           │             │
│  ┌───────────▼───────────────────────────────────────────▼───────────┐ │
│  │ Local Embedding Pipeline: ONNX Runtime (bge-small / nomic-embed)   │ │
│  └───────────────────────────────┬───────────────────────────────────┘ │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                 Local Storage (.cognify/ at Repo Root)                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SQLite Index (rusqlite / libsql + sqlite-vec + FTS5)             │  │
│  │ - Bidirectional link matrix                                      │  │
│  │ - Dense vector chunk embeddings                                  │  │
│  │ - Full-text search index                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Stack Components

| Subsystem | Technology | Justification |
| :--- | :--- | :--- |
| **Application Host** | **Tauri v2** or **Code-OSS Shell** | Native multi-pane windowing, low resource footprint, cross-platform file access. |
| **Code Editor** | **Monaco Editor** | Industry standard for code, syntax trees, CodeLens, and diff views. |
| **Markdown / PKM Editor** | **CodeMirror 6 / ProseMirror** | Customizable live preview, inline rendering of LaTeX math, and clickable wikilink widgets. |
| **Native Engine** | **Rust** (`notify`, `pulldown-cmark`, `tree-sitter`) | High-throughput parsing, file watching, and background indexing without UI freezes. |
| **Database & Vector Search** | **SQLite** (`libsql` / `sqlite-vec`) | Embedded, serverless, relational queries combined with fast approximate nearest neighbor (ANN) vector lookups. |
| **Knowledge Graph** | **PixiJS** or **WebGPU (Three.js)** | 60 FPS force-directed physics rendering scaling to 50,000+ nodes. |
| **Visual Canvas** | **Tldraw Engine** | Extensible whiteboard framework supporting custom node cards, vectors, and live editors. |
| **Local Embeddings** | **ONNX Runtime (`ort`)** | In-process execution of models like `bge-small-en-v1.5` or `nomic-embed-text` with zero cloud latency. |

---

## 4. Database & Relational Schema (SQLite + `sqlite-vec`)

The following schema is managed by Cognify within the workspace root directory at `.cognify/index.db`:

```sql
-- Core document index: registers Markdown notes, ADRs, and source code files
CREATE TABLE documents (
    id TEXT PRIMARY KEY,                       -- UUID v4 or ULID
    file_path TEXT NOT NULL UNIQUE,            -- e.g. "docs/adr/001-database.md" or "src/auth.ts"
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,                   -- 'markdown', 'typescript', 'rust', etc.
    file_hash TEXT NOT NULL,                   -- SHA-256 hash for incremental indexing
    title TEXT NOT NULL,
    frontmatter_json TEXT,                     -- Extracted YAML frontmatter metadata
    raw_content TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,               -- Epoch timestamp (ms)
    updated_at INTEGER NOT NULL
);

-- Granular chunk index for hybrid RAG and vector embeddings
CREATE TABLE document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    header_path TEXT,                          -- e.g. "Architecture > Authentication > Token Validation"
    symbol_reference TEXT,                     -- e.g. "AuthService.validateToken" (for code chunks)
    chunk_content TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    embedding BLOB,                            -- Float32 array stored for sqlite-vec
    created_at INTEGER NOT NULL
);

-- Explicit bidirectional links (Wikilinks, embedded code symbols, and cross-references)
CREATE TABLE document_links (
    id TEXT PRIMARY KEY,
    source_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_identifier TEXT NOT NULL,           -- Target string: "Database Schema" or "src/db/pool.ts#connect"
    target_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    link_type TEXT CHECK (link_type IN ('wiki', 'embed', 'tag', 'code_symbol')),
    anchor_text TEXT,                          -- Display alias
    block_id TEXT,                             -- Reference to a specific block ID (#^block-id)
    line_number INTEGER,
    created_at INTEGER NOT NULL
);

-- AI-synthesized semantic edges (latent connections uncovered via vector cosine similarity)
CREATE TABLE semantic_edges (
    id TEXT PRIMARY KEY,
    source_chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    target_chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL,            -- Range 0.0 to 1.0
    relationship_label TEXT,                   -- "relates_to", "implements", "contradicts", "extends"
    is_confirmed_by_user INTEGER DEFAULT 0,    -- 0: Unlinked recommendation, 1: User-accepted edge
    created_at INTEGER NOT NULL
);

-- Spatial Whiteboard Canvas states
CREATE TABLE canvas_boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    viewport_state TEXT,                       -- Zoom level, x/y camera offsets
    nodes_json TEXT NOT NULL,                  -- Positioned cards, file references, shapes
    edges_json TEXT NOT NULL,                  -- Directed connections and semantic labels
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Full-Text Search (FTS5) for instant lexical retrieval
CREATE VIRTUAL TABLE fts_documents USING fts5(
    title,
    raw_content,
    content='documents',
    content_rowid='rowid'
);

-- Trigger configurations to keep FTS index synchronized
CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO fts_documents(rowid, title, raw_content) 
    VALUES (new.rowid, new.title, new.raw_content);
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO fts_documents(fts_documents, rowid, title, raw_content) 
    VALUES('delete', old.rowid, old.title, old.raw_content);
END;

CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO fts_documents(fts_documents, rowid, title, raw_content) 
    VALUES('delete', old.rowid, old.title, old.raw_content);
    INSERT INTO fts_documents(rowid, title, raw_content) 
    VALUES (new.rowid, new.title, new.raw_content);
END;
```

---

## 5. File System Structure inside Workspaces

Cognify stores all project knowledge in the repository root, ensuring that notes, architecture decisions, and canvas states are version-controllable alongside code:

```text
my-project/
├── .cognify/
│   ├── index.db              # Local SQLite database (FTS5 + links + sqlite-vec)
│   ├── config.json           # Embedding model choice, index excludes, threshold configs
│   └── canvas/               # Serialized Tldraw / visual canvas boards
│       ├── system_overview.canvas
│       └── auth_pipeline.canvas
├── docs/
│   ├── adr/
│   │   ├── 001-state-management.md
│   │   └── 002-database-engine.md
│   ├── architecture/
│   │   └── data_flow.md
│   └── scratchpad.md
├── src/                      # Source code (monitored by Tree-sitter & AST indexer)
│   └── ...
└── README.md
```

---

## 6. Implementation Roadmap

### Phase 1: Core Linking & Markdown Layer
1. Set up the file watcher background thread (`notify` in Rust) targeting `.md` and code files.
2. Build an AST extraction parser (`pulldown-cmark`) to index standard `[[Note]]` wikilinks, tags, and code symbol references into SQLite.
3. Add CodeMirror 6 autocompletion hooked into the SQLite FTS5 table to trigger link popups when typing `[[`.

### Phase 2: Code AST & CodeLens Integration
1. Configure Tree-sitter grammars for major languages (TypeScript, Rust, Python, Go).
2. Register Monaco CodeLens providers that read `document_links` to render active note references directly above code functions.
3. Implement refactor propagation: updating a symbol's name prompts automatic updates to corresponding Markdown doc references.

### Phase 3: Local Vector Search & Semantic Linking
1. Embed the ONNX Runtime with `bge-small-en-v1.5` to generate local chunk vectors in a background thread.
2. Store embeddings using `sqlite-vec`.
3. Build a "Cognitive Context" sidebar panel showing unlinked semantic references and related code sections based on cosine similarity ($> 0.78$).

### Phase 4: Graph Visualization & Spatial Canvas
1. Implement a WebGL force-directed graph view using PixiJS, loading nodes and edges directly from SQLite.
2. Embed the Tldraw canvas engine into a dedicated IDE editor tab.
3. Allow dragging file nodes from the tree explorer onto the canvas to render live interactive code cards with dynamic edge connections.