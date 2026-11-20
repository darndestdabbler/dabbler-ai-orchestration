using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>One row as the Configuration window shows it, and whether it is open or selected.</summary>
    public sealed class ConfigurationNode : INotifyPropertyChanged
    {
        /// <summary>
        /// The actions this extension runs. The router offers more; one whose
        /// Visual Studio half is not built yet is not shown, because a menu
        /// item that does nothing is worse than none.
        /// </summary>
        internal static readonly IReadOnlyCollection<string> RunnableActions = new HashSet<string>
        {
            "dabblerSolution.setEngine",
            "dabblerSolution.setAuthoringModel",
            "dabblerSolution.setMechanicModel",
            "dabblerSolution.setMechanic",
            "dabblerSolution.setReviewerTransport",
            "dabblerSolution.setPrimaryReviewerModel",
            "dabblerSolution.setAuxiliaryReviewerModel",
            "dabblerSolution.setAsMyDefault",
            ConfigurationAsk.RefreshRecord,
            ConfigurationAsk.StoreCredential,
        };

        private bool isExpanded;
        private bool isSelected;

        internal ConfigurationNode(ConfigurationRow row, bool expanded)
        {
            Row = row;
            Children = row.Children.Select(child => new ConfigurationNode(child, expanded: false)).ToList();
            Actions = row.Actions.Where(action => RunnableActions.Contains(action.Id)).ToList();
            Click = row.Click != null && RunnableActions.Contains(row.Click.Id) ? row.Click : null;
            isExpanded = expanded;
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        public ConfigurationRow Row { get; }

        public string Id => Row.Id;

        public string Label => Row.Label;

        /// <summary>The value and the layer that decided it, in the router's words.</summary>
        public string? Description => Row.Description;

        public string? Tooltip => string.IsNullOrWhiteSpace(Row.Tooltip) ? null : Row.Tooltip;

        public IReadOnlyList<ConfigurationNode> Children { get; }

        /// <summary>The row's actions this extension runs, in the router's order: the row's context menu.</summary>
        public IReadOnlyList<ConfigurationAction> Actions { get; }

        /// <summary>What activating the row runs, or null where it runs nothing here.</summary>
        public ConfigurationAction? Click { get; }

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

        /// <summary>
        /// The row as a screen reader says it: WPF names a tree item by its
        /// data's ToString, which would otherwise be this class's name.
        /// </summary>
        public override string ToString()
        {
            return string.IsNullOrWhiteSpace(Description) ? Label : $"{Label}, {Description}";
        }
    }

    /// <summary>
    /// The Configuration window's content: the root row's words as its
    /// header, and the root's children -- Authoring AI, Reviewing AI and API
    /// Keys -- as the tree.
    /// </summary>
    public sealed class ConfigurationTree : INotifyPropertyChanged
    {
        private string? header;

        public event PropertyChangedEventHandler? PropertyChanged;

        public ObservableCollection<ConfigurationNode> Roots { get; } = new ObservableCollection<ConfigurationNode>();

        /// <summary>The root row's actions this extension runs, such as Update the Catalog: the buttons under the header.</summary>
        public ObservableCollection<ConfigurationAction> Actions { get; } = new ObservableCollection<ConfigurationAction>();

        /// <summary>The root's description and tooltip, which carries the model catalog's age; null before a document.</summary>
        public string? Header
        {
            get => header;
            private set
            {
                if (header == value) return;
                header = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Header)));
            }
        }

        /// <summary>
        /// Replaces the tree with <paramref name="document"/>'s rows, keeping a
        /// developer's place by the rows' ids: a row seen before is open
        /// exactly when it was, and the selected row stays selected. A row not
        /// seen before starts open where it is at the top, closed below.
        /// </summary>
        public void Show(ConfigurationDocument document)
        {
            var wasOpen = new Dictionary<string, bool>();
            string? selected = null;
            foreach (var node in Walk(Roots))
            {
                wasOpen[node.Id] = node.IsExpanded;
                if (node.IsSelected) selected = node.Id;
            }
            var root = document.Configuration;
            var nodes = root.Children.Select(row => new ConfigurationNode(row, expanded: true)).ToList();
            foreach (var node in Walk(nodes))
            {
                if (wasOpen.TryGetValue(node.Id, out var open)) node.IsExpanded = open;
                node.IsSelected = node.Id == selected;
            }
            Roots.Clear();
            foreach (var node in nodes) Roots.Add(node);
            Actions.Clear();
            foreach (var action in root.Actions.Where(action => ConfigurationNode.RunnableActions.Contains(action.Id))) Actions.Add(action);
            var parts = new[] { root.Description, root.Tooltip }.Where(part => !string.IsNullOrWhiteSpace(part)).Select(part => part!.Trim());
            Header = string.Join("\n\n", parts);
        }

        /// <summary>Clears the tree and its header, as before any document.</summary>
        public void Clear()
        {
            Roots.Clear();
            Actions.Clear();
            Header = null;
        }

        private static IEnumerable<ConfigurationNode> Walk(IEnumerable<ConfigurationNode> nodes)
        {
            foreach (var node in nodes)
            {
                yield return node;
                foreach (var below in Walk(node.Children)) yield return below;
            }
        }
    }
}
