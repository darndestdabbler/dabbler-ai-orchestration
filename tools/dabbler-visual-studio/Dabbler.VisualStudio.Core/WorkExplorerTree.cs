using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>The router's ids of the actions that do more than open a file.</summary>
    public static class ActionIds
    {
        public const string StartSession = "dabblerSessionSets.startSession";
        public const string ConsultWithAi = "dabbler.consultWithAi";
        public const string OpenMechanic = "dabbler.openMechanic";
    }

    /// <summary>One row as the tree shows it: the router's words, made plain, and whether it is open or selected.</summary>
    public sealed class WorkExplorerNode : INotifyPropertyChanged
    {
        private static readonly Regex IconToken = new Regex(@"\$\([A-Za-z0-9~-]+\)\s?");

        /// <summary>
        /// The actions this extension runs. The router offers more; one whose
        /// Visual Studio half is not built yet is not shown, because a menu
        /// item that does nothing is worse than none.
        /// </summary>
        internal static readonly IReadOnlyCollection<string> RunnableActions = new HashSet<string>
        {
            "dabblerSessionSets.openSpec",
            "dabblerSessionSets.openActivityLog",
            "dabblerSessionSets.openChangeLog",
            "dabblerSessionSets.openSessionState",
            ActionIds.StartSession,
            ActionIds.ConsultWithAi,
            ActionIds.OpenMechanic,
        };

        private bool isExpanded;
        private bool isSelected;

        internal WorkExplorerNode(WorkExplorerRow row)
        {
            Row = row;
            Label = IconToken.Replace(row.Label, "").Trim();
            Tooltip = PlainText(row.Tooltip);
            Children = row.Children.Select(child => new WorkExplorerNode(child)).ToList();
            Actions = row.Actions.Where(action => RunnableActions.Contains(action.Id)).ToList();
            isExpanded = row.Collapsible == "expanded";
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        public WorkExplorerRow Row { get; }

        public string Id => Row.Id;

        /// <summary>The row's label, with any `$(name)` icon in it left out.</summary>
        public string Label { get; }

        public string? Description => Row.Description;

        /// <summary>The row's markdown tooltip as plain text, or null where the row has none.</summary>
        public string? Tooltip { get; }

        public WorkExplorerIcon? Icon => Row.Icon;

        public IReadOnlyList<WorkExplorerNode> Children { get; }

        /// <summary>The row's actions this extension runs, in the order the router gave them: the row's context menu.</summary>
        public IReadOnlyList<WorkExplorerAction> Actions { get; }

        public bool IsExpanded
        {
            get => isExpanded;
            set => Set(ref isExpanded, value, nameof(IsExpanded));
        }

        public bool IsSelected
        {
            get => isSelected;
            set => Set(ref isSelected, value, nameof(IsSelected));
        }

        private void Set(ref bool field, bool value, string name)
        {
            if (field == value) return;
            field = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }

        private static string? PlainText(string? markdown)
        {
            if (markdown == null) return null;
            var plain = IconToken.Replace(markdown, "").Replace("**", "").Replace("`", "").Trim();
            return plain.Length > 0 ? plain : null;
        }
    }

    /// <summary>The Work Explorer's tree: the nodes of the last document the router printed.</summary>
    public sealed class WorkExplorerTree : INotifyPropertyChanged
    {
        private const string WhatThisShows = "This shows the work: which session is running, which step it is on, and anything waiting on you.";

        private const string HowToSetUp = "Set Dabbler up there: run dabbler bootstrap at the repository's root, or Set Up Dabbler in This Folder in VS Code.";

        /// <summary>Shown where no solution is open.</summary>
        public const string NoSolution = WhatThisShows + "\n\nNo solution is open. Open a solution that is in a git repository to see its sessions.";

        /// <summary>Shown where the open solution is in no git repository.</summary>
        public const string NotInRepository = WhatThisShows + "\n\nThis solution is not in a git repository, so it has no sessions to show. Put it in one (git init in the solution's folder). " + HowToSetUp;

        /// <summary>Shown where the repository has no session plan.</summary>
        public const string NoSessionPlan = WhatThisShows + "\n\nThis repository has no session plan yet. " + HowToSetUp;

        private string? message;

        public event PropertyChangedEventHandler? PropertyChanged;

        public ObservableCollection<WorkExplorerNode> Roots { get; } = new ObservableCollection<WorkExplorerNode>();

        /// <summary>What the window says instead of a tree, or null where it shows the tree.</summary>
        public string? Message
        {
            get => message;
            set
            {
                if (message == value) return;
                message = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Message)));
            }
        }

        /// <summary>
        /// Replaces the tree with <paramref name="document"/>'s rows, keeping a
        /// developer's place by the rows' ids: a row seen before is open
        /// exactly when it was, whatever its row says now, and the selected
        /// row stays selected. A row not seen before starts as its row says.
        /// A document naming no repository is a repository with no session
        /// plan, and says so in <see cref="Message"/>.
        /// </summary>
        public void Show(WorkExplorerDocument document)
        {
            var wasOpen = new Dictionary<string, bool>();
            string? selected = null;
            foreach (var node in Walk(Roots))
            {
                wasOpen[node.Id] = node.IsExpanded;
                if (node.IsSelected) selected = node.Id;
            }
            var nodes = document.Repositories.Select(row => new WorkExplorerNode(row)).ToList();
            foreach (var node in Walk(nodes))
            {
                if (wasOpen.TryGetValue(node.Id, out var open)) node.IsExpanded = open;
                node.IsSelected = node.Id == selected;
            }
            Roots.Clear();
            foreach (var node in nodes) Roots.Add(node);
            Message = nodes.Count == 0 ? NoSessionPlan : null;
        }

        private static IEnumerable<WorkExplorerNode> Walk(IEnumerable<WorkExplorerNode> nodes)
        {
            foreach (var node in nodes)
            {
                yield return node;
                foreach (var below in Walk(node.Children)) yield return below;
            }
        }

        /// <summary>
        /// The nearest folder at or above <paramref name="folder"/> holding a
        /// `.git` directory or file (a worktree's), or null where there is none.
        /// </summary>
        public static string? RepositoryRootOf(string folder)
        {
            for (var current = new DirectoryInfo(folder); current != null; current = current.Parent)
            {
                var git = Path.Combine(current.FullName, ".git");
                if (Directory.Exists(git) || File.Exists(git)) return current.FullName;
            }
            return null;
        }
    }
}
