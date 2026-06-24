import * as acorn from "acorn";
import * as walk from "acorn-walk";
import path from "node:path";

const JS_EXTENSIONS = new Set([".mjs", ".js", ".jsx"]);
const CODE_NODE_TYPES = new Set(["function", "class", "export"]);
const BUILTIN_CALLS = new Set(["String", "Number", "Boolean", "Array", "Object", "JSON", "Math", "Date", "Promise", "Error"]);
const RESERVED = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "else",
  "export", "false", "for", "from", "function", "if", "import", "in", "let", "new", "null",
  "return", "switch", "throw", "true", "try", "typeof", "undefined", "var", "while"
]);

export function canUseAstParser(file) {
  return JS_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function buildAstSliceAnalysis({ file, text, target, graphNodes }) {
  if (!canUseAstParser(file)) {
    return {
      ok: false,
      mode: "heuristic",
      reason: "unsupported-extension"
    };
  }

  let ast;
  try {
    ast = acorn.parse(text, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      ranges: true,
      allowHashBang: true
    });
  } catch (error) {
    return {
      ok: false,
      mode: "heuristic",
      reason: `parse-error:${error.message}`
    };
  }

  const targetNode = findTargetAstNode(ast, target.name);
  if (!targetNode) {
    return {
      ok: false,
      mode: "heuristic",
      reason: "target-not-found-in-ast"
    };
  }

  const bodyNode = unwrapTargetBodyNode(targetNode);
  const sourceText = text.slice(bodyNode.start, bodyNode.end);
  const imports = collectAstImports(ast);
  const directCalls = collectAstCalls(bodyNode, graphNodes, target.name, file, imports);
  const dataflow = collectAstDataflow(bodyNode);
  const warnings = [];

  if (directCalls.some((call) => !call.resolved)) warnings.push("unresolved-calls-present");

  return {
    ok: true,
    mode: "ast",
    parser: "acorn",
    parser_version: acorn.version,
    target_node_type: targetNode.type,
    span: {
      line_start: bodyNode.loc.start.line,
      line_end: bodyNode.loc.end.line,
      range_start: bodyNode.start,
      range_end: bodyNode.end
    },
    source_text: sourceText,
    calls: directCalls,
    dataflow,
    imports,
    warnings
  };
}

function findTargetAstNode(ast, name) {
  let found = null;

  walk.fullAncestor(ast, (node, _state, ancestors) => {
    if (found) return;
    const parent = ancestors.at(-2);
    if (node.type === "FunctionDeclaration" && node.id?.name === name) {
      found = node;
    } else if (node.type === "ClassDeclaration" && node.id?.name === name) {
      found = node;
    } else if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.id.name === name) {
      found = parent?.type === "VariableDeclaration" ? parent : node;
    }
  });

  return found;
}

function unwrapTargetBodyNode(node) {
  if (node.type === "ExportNamedDeclaration" && node.declaration) return node.declaration;
  if (node.type === "ExportDefaultDeclaration" && node.declaration) return node.declaration;
  return node;
}

function collectAstCalls(node, graphNodes, ownName, file, imports) {
  const seen = new Set();
  const calls = [];

  walk.ancestor(node, {
    CallExpression(callNode) {
      if (callNode.callee.type !== "Identifier") return;
      const name = callNode.callee.name;
      if (name === ownName || BUILTIN_CALLS.has(name)) return;
      if (seen.has(name)) return;
      seen.add(name);
      const resolved = resolveCallTarget(name, graphNodes, file, imports);
      calls.push({
        name,
        resolved: Boolean(resolved),
        arguments: callNode.arguments.map((argument, index) => ({
          index,
          expression: formatExpression(argument),
          identifiers: collectIdentifiers(argument)
        })),
        target: resolved ? {
          id: resolved.id,
          type: resolved.type,
          name: resolved.name,
          file: resolved.file,
          line: resolved.line,
          source_hash: resolved.source_hash
        } : null
      });
    }
  });

  return calls;
}

function resolveCallTarget(name, graphNodes, file, imports) {
  const candidates = graphNodes
    .filter((candidate) => CODE_NODE_TYPES.has(candidate.type) && candidate.name === name)
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  if (!candidates.length) return null;

  const sameFile = candidates.find((candidate) => candidate.file === file);
  if (sameFile) return sameFile;

  const knownFiles = [...new Set(graphNodes.map((node) => node.file))];
  const matchingImport = imports.find((item) => item.specifiers.includes(name));
  if (matchingImport) {
    const targetFile = resolveImportFile(file, matchingImport.source, knownFiles);
    const imported = candidates.find((candidate) => candidate.file === targetFile);
    if (imported) return imported;
  }

  return candidates[0];
}

function resolveImportFile(file, specifier, knownFiles) {
  if (!specifier.startsWith(".")) return "";
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return knownFiles.find((candidate) => {
    const extension = path.posix.extname(candidate);
    const withoutExt = extension ? candidate.slice(0, -extension.length) : candidate;
    return candidate === base || withoutExt === base;
  }) || "";
}

function collectAstDataflow(node) {
  const reads = new Set();
  const writes = new Set();
  const parameters = new Set();

  walk.ancestor(node, {
    FunctionDeclaration(fnNode) {
      for (const param of fnNode.params || []) {
        collectPatternNames(param, parameters);
      }
    },
    FunctionExpression(fnNode) {
      for (const param of fnNode.params || []) {
        collectPatternNames(param, parameters);
      }
    },
    ArrowFunctionExpression(fnNode) {
      for (const param of fnNode.params || []) {
        collectPatternNames(param, parameters);
      }
    },
    VariableDeclarator(declarator) {
      collectPatternNames(declarator.id, writes);
    },
    AssignmentExpression(assignment) {
      collectPatternNames(assignment.left, writes);
    },
    UpdateExpression(update) {
      collectPatternNames(update.argument, writes);
    },
    Identifier(identifier, ancestors) {
      if (isIgnoredIdentifier(identifier, ancestors)) return;
      const name = identifier.name;
      if (!RESERVED.has(name) && !BUILTIN_CALLS.has(name)) reads.add(name);
    }
  });

  return {
    parameters: [...parameters],
    reads: [...reads].filter((name) => !writes.has(name)).sort(),
    writes: [...writes].sort()
  };
}

function formatExpression(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return JSON.stringify(node.value);
  if (node.type === "TemplateLiteral") return "`...`";
  if (node.type === "MemberExpression") {
    const object = formatExpression(node.object);
    const property = node.computed ? `[${formatExpression(node.property)}]` : `.${formatExpression(node.property)}`;
    return `${object}${property}`;
  }
  if (node.type === "CallExpression") return `${formatExpression(node.callee)}(...)`;
  if (node.type === "BinaryExpression" || node.type === "LogicalExpression") {
    return `${formatExpression(node.left)} ${node.operator} ${formatExpression(node.right)}`;
  }
  if (node.type === "UnaryExpression") return `${node.operator}${formatExpression(node.argument)}`;
  if (node.type === "ObjectExpression") return "{...}";
  if (node.type === "ArrayExpression") return "[...]";
  return node.type;
}

function collectIdentifiers(node) {
  const identifiers = new Set();
  walk.full(node, (child) => {
    if (child.type === "Identifier" && !BUILTIN_CALLS.has(child.name) && !RESERVED.has(child.name)) {
      identifiers.add(child.name);
    }
  });
  return [...identifiers].sort();
}

function collectAstImports(ast) {
  const imports = [];

  for (const node of ast.body || []) {
    if (node.type !== "ImportDeclaration") continue;
    imports.push({
      source: node.source.value,
      line: node.loc.start.line,
      specifiers: node.specifiers.map((specifier) => specifier.local?.name).filter(Boolean)
    });
  }

  return imports;
}

function collectPatternNames(node, target) {
  if (!node) return;
  if (node.type === "Identifier") {
    target.add(node.name);
  } else if (node.type === "ObjectPattern") {
    for (const property of node.properties) collectPatternNames(property.value || property.argument, target);
  } else if (node.type === "ArrayPattern") {
    for (const element of node.elements) collectPatternNames(element, target);
  } else if (node.type === "AssignmentPattern") {
    collectPatternNames(node.left, target);
  } else if (node.type === "RestElement") {
    collectPatternNames(node.argument, target);
  } else if (node.type === "MemberExpression") {
    collectPatternNames(node.object, target);
  }
}

function isIgnoredIdentifier(identifier, ancestors) {
  const parent = ancestors.at(-2);
  if (!parent) return false;

  if (parent.type === "VariableDeclarator" && parent.id === identifier) return true;
  if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ClassDeclaration") && parent.id === identifier) return true;
  if (parent.type === "Property" && parent.key === identifier && !parent.computed) return true;
  if (parent.type === "MethodDefinition" && parent.key === identifier && !parent.computed) return true;
  if (parent.type === "MemberExpression" && parent.property === identifier && !parent.computed) return true;
  if (parent.type === "ImportSpecifier" || parent.type === "ImportDefaultSpecifier" || parent.type === "ImportNamespaceSpecifier") return true;
  if (parent.type === "AssignmentExpression" && parent.left === identifier) return true;
  if (parent.type === "UpdateExpression" && parent.argument === identifier) return true;
  if (parent.type === "LabeledStatement" && parent.label === identifier) return true;
  if (parent.type === "BreakStatement" && parent.label === identifier) return true;
  if (parent.type === "ContinueStatement" && parent.label === identifier) return true;

  return false;
}
