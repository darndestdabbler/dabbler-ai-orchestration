using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// The whole Work Explorer tree as `dabbler view work-explorer` prints it
    /// (packages/router/schemas/work-explorer.schema.json). Every rule that
    /// decides a row is the router's: these types carry the rows and decide
    /// nothing about them.
    /// </summary>
    public sealed class WorkExplorerDocument
    {
        /// <summary>The one shape this extension reads.</summary>
        public const int ReadableSchemaVersion = 1;

        [JsonProperty("schemaVersion")]
        public int SchemaVersion { get; private set; }

        /// <summary>One row per repository given that has a sessions root.</summary>
        [JsonProperty("repositories")]
        public IReadOnlyList<WorkExplorerRow> Repositories { get; private set; } = null!;

        /// <summary>
        /// One line the router printed, as a document; a <see cref="FormatException"/>
        /// naming the problem where it is not one, or is in a shape other than
        /// <see cref="ReadableSchemaVersion"/>.
        /// </summary>
        public static WorkExplorerDocument Parse(string json)
        {
            WorkExplorerDocument? document;
            try
            {
                document = JsonConvert.DeserializeObject<WorkExplorerDocument>(json);
            }
            catch (JsonException error)
            {
                throw new FormatException($"The router printed something that is not a Work Explorer document: {error.Message}", error);
            }
            if (document == null || document.Repositories == null)
            {
                throw new FormatException("The router printed something that is not a Work Explorer document: it names no repositories.");
            }
            if (document.SchemaVersion != ReadableSchemaVersion)
            {
                throw new FormatException($"The router printed a Work Explorer document in shape {document.SchemaVersion}, and this extension reads shape {ReadableSchemaVersion}: update the extension or the router so they match.");
            }
            return document;
        }
    }

    /// <summary>One row of the tree, and the rows beneath it.</summary>
    public sealed class WorkExplorerRow
    {
        /// <summary>Stable across refreshes and unique across the whole tree.</summary>
        [JsonProperty("id")]
        public string Id { get; private set; } = "";

        /// <summary>repository, bucket, session, task, verification, finding, attention or refusal.</summary>
        [JsonProperty("kind")]
        public string Kind { get; private set; } = "";

        [JsonProperty("label")]
        public string Label { get; private set; } = "";

        [JsonProperty("description")]
        public string? Description { get; private set; }

        /// <summary>Markdown source; a `$(name)` is an icon by name.</summary>
        [JsonProperty("tooltip")]
        public string? Tooltip { get; private set; }

        [JsonProperty("icon")]
        public WorkExplorerIcon? Icon { get; private set; }

        /// <summary>none, collapsed or expanded: whether the row has children, and whether it starts open.</summary>
        [JsonProperty("collapsible")]
        public string Collapsible { get; private set; } = "none";

        [JsonProperty("contextValue")]
        public string ContextValue { get; private set; } = "";

        [JsonProperty("click")]
        public WorkExplorerAction? Click { get; private set; }

        [JsonProperty("actions")]
        public IReadOnlyList<WorkExplorerAction> Actions { get; private set; } = Array.Empty<WorkExplorerAction>();

        [JsonProperty("children")]
        public IReadOnlyList<WorkExplorerRow> Children { get; private set; } = Array.Empty<WorkExplorerRow>();

        /// <summary>On a repository row whose progress reading failed: why, in words a person can act on.</summary>
        [JsonProperty("error")]
        public string? Error { get; private set; }
    }

    /// <summary>
    /// An icon by name: a `theme` icon is the editor's own glyph by
    /// <see cref="Id"/>, optionally in a named <see cref="Color"/>; a `file`
    /// icon is one of the status pictures by <see cref="Slug"/>.
    /// </summary>
    public sealed class WorkExplorerIcon
    {
        [JsonProperty("kind")]
        public string Kind { get; private set; } = "";

        [JsonProperty("id")]
        public string? Id { get; private set; }

        [JsonProperty("color")]
        public string? Color { get; private set; }

        [JsonProperty("slug")]
        public string? Slug { get; private set; }
    }

    /// <summary>One action: the `dabbler` command it runs, or the file it opens, and what it needs from a person first.</summary>
    public sealed class WorkExplorerAction
    {
        [JsonProperty("id")]
        public string Id { get; private set; } = "";

        [JsonProperty("title")]
        public string Title { get; private set; } = "";

        /// <summary>The command, beginning `dabbler`, run in the repository's root; null where the action opens a file.</summary>
        [JsonProperty("argv")]
        public IReadOnlyList<string>? Argv { get; private set; }

        [JsonProperty("opens")]
        public WorkExplorerOpens? Opens { get; private set; }

        /// <summary>A command that writes nothing, whose output the person reads before they are asked.</summary>
        [JsonProperty("preview")]
        public IReadOnlyList<string>? Preview { get; private set; }

        [JsonProperty("confirm")]
        public WorkExplorerConfirmation? Confirm { get; private set; }

        [JsonProperty("reason")]
        public WorkExplorerReason? Reason { get; private set; }
    }

    /// <summary>A file an action opens rather than a verb it runs.</summary>
    public sealed class WorkExplorerOpens
    {
        [JsonProperty("file")]
        public string File { get; private set; } = "";

        /// <summary>1-based; null for the top.</summary>
        [JsonProperty("line")]
        public int? Line { get; private set; }

        [JsonProperty("fragment")]
        public string? Fragment { get; private set; }
    }

    /// <summary>A confirmation a person gives before the action runs, in the words they are shown.</summary>
    public sealed class WorkExplorerConfirmation
    {
        [JsonProperty("title")]
        public string Title { get; private set; } = "";

        [JsonProperty("detail")]
        public string? Detail { get; private set; }

        [JsonProperty("accept")]
        public string Accept { get; private set; } = "";

        [JsonProperty("keep")]
        public string? Keep { get; private set; }
    }

    /// <summary>A reason a person types before the action runs; it reaches the command as `--reason &lt;text&gt;`.</summary>
    public sealed class WorkExplorerReason
    {
        [JsonProperty("prompt")]
        public string Prompt { get; private set; } = "";

        [JsonProperty("placeholder")]
        public string Placeholder { get; private set; } = "";

        /// <summary>abort or blank: what dismissing the box does.</summary>
        [JsonProperty("dismissed")]
        public string Dismissed { get; private set; } = "abort";

        [JsonProperty("blank")]
        public string? Blank { get; private set; }
    }
}
