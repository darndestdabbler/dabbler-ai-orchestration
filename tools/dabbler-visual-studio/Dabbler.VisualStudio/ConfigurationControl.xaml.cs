using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Dabbler.VisualStudio.Core;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The Configuration window's content: the header and a tree bound to a
    /// <see cref="ConfigurationTree"/> as its data context. It decides
    /// nothing about an action: it says which one a developer chose, and the
    /// window runs it.
    /// </summary>
    public partial class ConfigurationControl : UserControl
    {
        public ConfigurationControl()
        {
            InitializeComponent();
        }

        /// <summary>A menu item was clicked, or a row with a click was double-clicked or had Enter pressed on it.</summary>
        public event EventHandler<ConfigurationAction>? ActionChosen;

        private void OnRowMenuOpening(object sender, ContextMenuEventArgs e)
        {
            var row = (FrameworkElement)sender;
            if (!(row.DataContext is ConfigurationNode node) || node.Actions.Count == 0 || row.ContextMenu == null)
            {
                e.Handled = true;
                return;
            }
            node.IsSelected = true;
            row.ContextMenu.Items.Clear();
            foreach (var action in node.Actions)
            {
                var item = new MenuItem { Header = action.Title };
                item.Click += (_, _) => ActionChosen?.Invoke(this, action);
                row.ContextMenu.Items.Add(item);
            }
        }

        private void OnRootActionClick(object sender, RoutedEventArgs e)
        {
            if (((FrameworkElement)sender).DataContext is ConfigurationAction action) ActionChosen?.Invoke(this, action);
        }

        private void OnRowMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount != 2 || !(((FrameworkElement)sender).DataContext is ConfigurationNode node)) return;
            if (Activate(node)) e.Handled = true;
        }

        private void OnRowsKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && Rows.SelectedItem is ConfigurationNode node && Activate(node)) e.Handled = true;
        }

        /// <summary>Runs the row's click; false where it has none here.</summary>
        private bool Activate(ConfigurationNode node)
        {
            if (node.Click == null) return false;
            ActionChosen?.Invoke(this, node.Click);
            return true;
        }
    }
}
