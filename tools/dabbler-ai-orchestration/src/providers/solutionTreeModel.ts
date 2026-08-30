// What the Solution Explorer says, decided without vscode so the unit suite
// can drive it.
//
// This file renders; it never decides. The projection is written by the
// router (`workflow/project.ts`), and folding the event log stays there —
// two implementations of one rule disagree eventually, and the disagreement
// surfaces as a status nobody can explain.

export interface ProjectionSolution {
  name: string;
  title: string;
  step: string;
  stepTitle: string;
  stepNumber: number;
  stepCount: number;
  waitingOn?: string | null;
  returns?: number;
}

export interface ProjectionComponent {
  name: string;
  kind: string;
  title: string;
  version?: string | null;
  step: string;
  stepTitle: string;
  stepNumber: number;
  owner?: string | null;
  contract?: string | null;
  contractDoc?: string | null;
  dependsOn: string[];
  usedBy: string[];
  waitingOn?: string | null;
  returns?: number;
}

export interface Projection {
  solution: ProjectionSolution;
  components: ProjectionComponent[];
  needsYou: string[];
}

/**
 * Which file the Contract row opens. The readable rendering when there is
 * one, the source otherwise. A consumer reading a contract wants the tables,
 * not the YAML that generates them; Python derives both paths, so this only
 * picks between them.
 */
export function contractTarget(
  c: ProjectionComponent | undefined,
): string | undefined {
  if (!c) return undefined;
  return c.contractDoc || c.contract || undefined;
}

export type IconSpec = { id: string; tone?: "attention" | "done" | "muted" };

export type SolutionNode =
  | { kind: "solution" }
  | { kind: "component"; name: string }
  | { kind: "contract"; name: string }
  | { kind: "usedBy"; name: string }
  | { kind: "consumer"; name: string; consumer: string }
  | { kind: "progress"; name: string };

export interface RowDescriptor {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: IconSpec;
  /** Collapsed, never Expanded: the tree stays lazy. */
  expandable: boolean;
  contextValue?: string;
}

function find(p: Projection, name: string): ProjectionComponent | undefined {
  return p.components.find((c) => c.name === name);
}

/** Components first, integration last — it is what the others compose into. */
export function orderedComponents(p: Projection): ProjectionComponent[] {
  const libs = p.components.filter((c) => c.kind !== "integration");
  const integrations = p.components.filter((c) => c.kind === "integration");
  return [...libs, ...integrations];
}

export function rootNodes(): SolutionNode[] {
  return [{ kind: "solution" }];
}

export function childrenOf(node: SolutionNode, p: Projection): SolutionNode[] {
  switch (node.kind) {
    case "solution":
      return orderedComponents(p).map((c) => ({
        kind: "component" as const,
        name: c.name,
      }));
    case "component": {
      const c = find(p, node.name);
      if (!c) return [];
      const out: SolutionNode[] = [{ kind: "contract", name: c.name }];
      // Only rendered when there is something to say. An empty folder is a
      // row the reader has to open to learn nothing.
      if (c.usedBy.length > 0) out.push({ kind: "usedBy", name: c.name });
      out.push({ kind: "progress", name: c.name });
      return out;
    }
    case "usedBy": {
      const c = find(p, node.name);
      if (!c) return [];
      return c.usedBy.map((consumer) => ({
        kind: "consumer" as const,
        name: node.name,
        consumer,
      }));
    }
    default:
      return [];
  }
}

export function descriptorFor(
  node: SolutionNode,
  p: Projection,
): RowDescriptor {
  switch (node.kind) {
    case "solution": {
      const s = p.solution;
      const waiting = p.needsYou.length > 0;
      return {
        id: `solution:${s.name}`,
        label: s.title,
        description: `step ${s.stepNumber}/${s.stepCount} · ${s.stepTitle}`,
        tooltip: waiting
          ? `Waiting on you: ${p.needsYou.join(", ")}`
          : `${s.stepTitle} — nothing is waiting on you`,
        icon: { id: "project", tone: waiting ? "attention" : undefined },
        expandable: true,
        contextValue: "dabblerSolution",
      };
    }
    case "component": {
      const c = find(p, node.name);
      if (!c) {
        return { id: `component:${node.name}`, label: node.name, expandable: false };
      }
      const bits: string[] = [];
      if (c.version) bits.push(`v${c.version}`);
      bits.push(`${c.stepNumber}/6 ${c.stepTitle}`);
      if (c.owner) bits.push(c.owner);
      if (c.returns && c.returns > 0) {
        bits.push(`${c.returns}× sent back`);
      }
      const attention = c.waitingOn === "developer";
      return {
        id: `component:${c.name}`,
        label: c.name,
        description: bits.join(" · "),
        tooltip: attention
          ? "Waiting on you"
          : c.waitingOn === "author"
            ? "Back with the author"
            : c.title,
        icon: {
          id: c.kind === "integration" ? "layers" : "package",
          tone: attention ? "attention" : c.stepNumber === 6 ? "done" : undefined,
        },
        expandable: true,
        contextValue: `dabblerComponent:${c.kind}`,
      };
    }
    case "contract": {
      const c = find(p, node.name);
      const has = Boolean(contractTarget(c));
      return {
        id: `contract:${node.name}`,
        label: "Contract",
        description: has ? "open" : "not written yet",
        tooltip: has
          ? "What this component promises. Opens in an editor tab."
          : "No contract yet — it is written at step 3.",
        icon: { id: "file-text", tone: has ? undefined : "muted" },
        expandable: false,
        contextValue: has ? "dabblerContract" : "dabblerContractMissing",
      };
    }
    case "usedBy": {
      const c = find(p, node.name);
      const n = c ? c.usedBy.length : 0;
      return {
        id: `usedBy:${node.name}`,
        label: "Used by",
        description: `${n}`,
        // The line nobody can get anywhere else, and the reason people are
        // willing to change a component instead of adding one beside it.
        tooltip: "These break if this contract changes.",
        icon: { id: "references" },
        expandable: n > 0,
      };
    }
    case "consumer":
      return {
        id: `consumer:${node.name}:${node.consumer}`,
        label: node.consumer,
        icon: { id: "arrow-small-right", tone: "muted" },
        expandable: false,
      };
    case "progress": {
      const c = find(p, node.name);
      const step = c ? c.stepNumber : 1;
      return {
        id: `progress:${node.name}`,
        label: "Progress",
        description: `${"■".repeat(step)}${"□".repeat(6 - step)}`,
        tooltip: c ? `Step ${step} of 6 — ${c.stepTitle}` : undefined,
        icon: { id: "graph" },
        expandable: false,
      };
    }
  }
}
