const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ✅ Your Details
const USER_ID = "garv_2005";
const EMAIL = "gb9171@srmist.edu.in";
const ROLL = "RA2311026010343";

// ─── VALIDATION ───────────────────────────────────────────────────────────────
function validateEntry(raw) {
  const entry = raw.trim();

  // Empty string
  if (!entry) return { valid: false, entry: "" };

  // Must match exactly: single uppercase letter -> single uppercase letter
  // No self-loops (A->A)
  const match = entry.match(/^([A-Z])->([A-Z])$/);
  if (!match) return { valid: false, entry };
  if (match[1] === match[2]) return { valid: false, entry }; // self-loop

  return { valid: true, entry, parent: match[1], child: match[2] };
}

// ─── CYCLE DETECTION (DFS) ────────────────────────────────────────────────────
function detectCycle(root, adjList) {
  const visited = new Set();
  const stack = new Set();

  function dfs(node) {
    visited.add(node);
    stack.add(node);
    for (const child of (adjList[node] || [])) {
      if (!visited.has(child)) {
        if (dfs(child)) return true;
      } else if (stack.has(child)) {
        return true;
      }
    }
    stack.delete(node);
    return false;
  }

  return dfs(root);
}

// ─── BUILD NESTED TREE ────────────────────────────────────────────────────────
function buildNestedTree(node, adjList) {
  const result = {};
  for (const child of (adjList[node] || [])) {
    result[child] = buildNestedTree(child, adjList);
  }
  return result;
}

// ─── DEPTH CALCULATION ────────────────────────────────────────────────────────
function calcDepth(node, adjList) {
  const kids = adjList[node] || [];
  if (kids.length === 0) return 1;
  return 1 + Math.max(...kids.map(c => calcDepth(c, adjList)));
}

// ─── GET ALL NODES IN A COMPONENT (BFS from root using adjList) ───────────────
function getComponent(startNode, adjList, reverseAdj) {
  // BFS in both directions to find full connected component
  const visited = new Set();
  const queue = [startNode];
  while (queue.length) {
    const node = queue.shift();
    if (visited.has(node)) continue;
    visited.add(node);
    for (const child of (adjList[node] || [])) queue.push(child);
    for (const parent of (reverseAdj[node] || [])) queue.push(parent);
  }
  return visited;
}

// ─── MAIN PROCESSING FUNCTION ─────────────────────────────────────────────────
function processData(data) {
  const invalid_entries = [];
  const duplicate_edges = [];
  const seenEdges = new Set();
  const validEdges = [];

  // ── Step 1: Validate & Deduplicate ──
  for (const raw of data) {
    const { valid, entry, parent, child } = validateEntry(raw);

    if (!valid) {
      // Push non-empty invalid entries; skip truly empty strings per rules
      if (entry !== "") invalid_entries.push(entry);
      // But empty string should also be pushed
      else invalid_entries.push(entry);
      continue;
    }

    const edgeKey = `${parent}->${child}`;
    if (seenEdges.has(edgeKey)) {
      // Only add to duplicate_edges once per unique duplicate
      if (!duplicate_edges.includes(edgeKey)) {
        duplicate_edges.push(edgeKey);
      }
    } else {
      seenEdges.add(edgeKey);
      validEdges.push({ edge: edgeKey, parent, child });
    }
  }

  // ── Step 2: Build adjacency list (multi-parent rule: first-seen wins) ──
  const adjList = {};     // parent -> [children]
  const reverseAdj = {};  // child -> [parents]
  const firstParent = {}; // child -> first parent (multi-parent handling)
  const allNodes = new Set();

  for (const { parent, child } of validEdges) {
    // Multi-parent: if child already has a parent, discard this edge silently
    if (firstParent[child] !== undefined) continue;

    firstParent[child] = parent;

    if (!adjList[parent]) adjList[parent] = [];
    if (!adjList[child]) adjList[child] = [];
    if (!reverseAdj[child]) reverseAdj[child] = [];
    if (!reverseAdj[parent]) reverseAdj[parent] = [];

    adjList[parent].push(child);
    reverseAdj[child].push(parent);

    allNodes.add(parent);
    allNodes.add(child);
  }

  // Ensure all nodes exist in adjList even if no children
  for (const node of allNodes) {
    if (!adjList[node]) adjList[node] = [];
    if (!reverseAdj[node]) reverseAdj[node] = [];
  }

  // ── Step 3: Find roots (nodes that never appear as a child) ──
  const childNodes = new Set(Object.keys(firstParent));
  const roots = [...allNodes].filter(n => !childNodes.has(n)).sort();

  // ── Step 4: Process each connected component ──
  const hierarchies = [];
  const processedNodes = new Set();

  // Process components reachable from roots first
  for (const root of roots) {
    if (processedNodes.has(root)) continue;

    const component = getComponent(root, adjList, reverseAdj);
    component.forEach(n => processedNodes.add(n));

    const cyclic = detectCycle(root, adjList);

    if (cyclic) {
      hierarchies.push({
        root,
        tree: {},
        has_cycle: true
      });
    } else {
      const treeObj = { [root]: buildNestedTree(root, adjList) };
      const depth = calcDepth(root, adjList);
      hierarchies.push({ root, tree: treeObj, depth });
    }
  }

  // ── Step 5: Handle pure cycles (no root found — all nodes are children) ──
  const remaining = [...allNodes].filter(n => !processedNodes.has(n));

  if (remaining.length > 0) {
    // Group remaining into their own components
    const tempProcessed = new Set();
    for (const node of remaining.sort()) {
      if (tempProcessed.has(node)) continue;

      const component = getComponent(node, adjList, reverseAdj);
      component.forEach(n => tempProcessed.add(n));
      component.forEach(n => processedNodes.add(n));

      // Lexicographically smallest node as root
      const cycleRoot = [...component].sort()[0];

      hierarchies.push({
        root: cycleRoot,
        tree: {},
        has_cycle: true
      });
    }
  }

  // ── Step 6: Build Summary ──
  const nonCyclicTrees = hierarchies.filter(h => !h.has_cycle);
  const total_trees = nonCyclicTrees.length;
  const total_cycles = hierarchies.filter(h => h.has_cycle).length;

  let largest_tree_root = "";
  let maxDepth = -1;

  for (const t of nonCyclicTrees) {
    if (
      t.depth > maxDepth ||
      (t.depth === maxDepth && t.root < largest_tree_root)
    ) {
      maxDepth = t.depth;
      largest_tree_root = t.root;
    }
  }

  return {
    user_id: USER_ID,
    email_id: EMAIL,
    college_roll_number: ROLL,
    hierarchies,
    invalid_entries,
    duplicate_edges,
    summary: {
      total_trees,
      total_cycles,
      largest_tree_root
    }
  };
}

// ─── ROUTE ────────────────────────────────────────────────────────────────────
app.post('/bfhl', (req, res) => {
  const { data } = req.body;

  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: '"data" must be a non-empty array' });
  }

  try {
    const result = processData(data);
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', message: 'SRM BFHL API running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
