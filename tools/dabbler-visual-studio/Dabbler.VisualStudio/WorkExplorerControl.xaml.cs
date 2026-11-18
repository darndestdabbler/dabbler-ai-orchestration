using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Dabbler.VisualStudio.Core;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The Work Explorer's content: a tree bound to a <see cref="WorkExplorerTree"/>
    /// as its data context. It decides nothing about an action: it says which
    /// one a developer chose, and the window runs it.
    /// </summary>
    public partial class WorkExplorerControl : UserControl
    {
        public WorkExplorerControl()
        {
            InitializeComponent();
        }

        /// <summary>
        /// A menu item was clicked, or a row with a `click` was double-clicked
        /// or had Enter pressed on it: the action, and the row it was chosen on.
        /// </summary>
        public event EventHandler<(WorkExplorerNode Node, WorkExplorerAction Action)>? ActionChosen;

        /// <summary>Start Session with Different Models was clicked: the row's Start Session, to be run with other answers.</summary>
        public event EventHandler<WorkExplorerAction>? DifferentModelsChosen;

        /// <summary>Set Up Dabbler in This Solution was clicked, under the sentence saying the repository has no session plan.</summary>
        public event EventHandler? SetUpChosen;

        private void OnSetUpClick(object sender, RoutedEventArgs e)
        {
            SetUpChosen?.Invoke(this, EventArgs.Empty);
        }

        private void OnRowMenuOpening(object sender, ContextMenuEventArgs e)
        {
            var row = (FrameworkElement)sender;
            if (!(row.DataContext is WorkExplorerNode node) || node.Actions.Count == 0 || row.ContextMenu == null)
            {
                e.Handled = true;
                return;
            }
            node.IsSelected = true;
            row.ContextMenu.Items.Clear();
            foreach (var action in node.Actions)
            {
                var item = new MenuItem { Header = action.Title };
                item.Click += (_, _) => ActionChosen?.Invoke(this, (node, action));
                row.ContextMenu.Items.Add(item);
                // The same start, asked: offered wherever Start Session is, as VS Code offers it.
                if (action.Id != ActionIds.StartSession) continue;
                var different = new MenuItem { Header = "Start Session with Different Models" };
                different.Click += (_, _) => DifferentModelsChosen?.Invoke(this, action);
                row.ContextMenu.Items.Add(different);
            }
        }

        private void OnRowMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount != 2 || !(((FrameworkElement)sender).DataContext is WorkExplorerNode node)) return;
            if (Activate(node)) e.Handled = true;
        }

        private void OnRowsKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && Rows.SelectedItem is WorkExplorerNode node && Activate(node)) e.Handled = true;
        }

        /// <summary>Runs the row's own `click`; false where it has none.</summary>
        private bool Activate(WorkExplorerNode node)
        {
            var click = node.Row.Click;
            if (click == null) return false;
            ActionChosen?.Invoke(this, (node, click));
            return true;
        }
    }
}
