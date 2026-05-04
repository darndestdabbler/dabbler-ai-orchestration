import * as vscode from "vscode";
import { SessionSet } from "../types";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

async function copy(text: string, label: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
  vscode.window.setStatusBarMessage(`Copied: ${label}`, 4000);
}

const startCommandPresets: Record<string, (slug: string) => string> = {
  default: (slug) => `Start the next session of \`${slug}\`.`,
  parallel: (slug) => `Start the next parallel session of \`${slug}\`.`,
};

const presetLabels: Record<string, string> = {
  default: "start next session",
  parallel: "start next parallel session",
};

export function registerCopyCommands(context: vscode.ExtensionContext): void {
  for (const [key, builder] of Object.entries(startCommandPresets)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `dabblerSessionSets.copyStartCommand.${key}`,
        async (item: SetItem) => {
          if (!item?.set) return;
          await copy(builder(item.set.name), presetLabels[key]);
        }
      )
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.copySlug",
      async (item: SetItem) => {
        if (!item?.set) return;
        await copy(item.set.name, "slug");
      }
    )
  );
}
