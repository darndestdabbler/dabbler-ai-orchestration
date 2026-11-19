using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// What a Configuration value may be set to, as the router lists it: its
    /// choices, an unreachable one marked with why, and what is withheld
    /// shown greyed with why; or, where the model is typed, a box. Esc or the
    /// window's close button dismisses it, and nothing runs.
    /// </summary>
    internal sealed class PickDialog : DialogWindow
    {
        private readonly StackPanel body = new StackPanel { Margin = new Thickness(12) };

        private readonly StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(12, 0, 12, 12) };

        private PickDialog(string title)
        {
            Title = "Dabbler";
            SizeToContent = SizeToContent.WidthAndHeight;
            MinWidth = 420;
            MaxWidth = 720;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            HasMinimizeButton = false;
            HasMaximizeButton = false;
            PreviewKeyDown += (_, e) =>
            {
                if (e.Key != Key.Escape) return;
                DialogResult = false;
                e.Handled = true;
            };
            body.Children.Add(new TextBlock { Text = title, TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 8) });
            var panel = new StackPanel();
            panel.Children.Add(body);
            panel.Children.Add(buttons);
            Content = panel;
        }

        /// <summary>The item the developer chose, or null where they dismissed the list.</summary>
        public static PickItem? Choose(ConfigurationPick pick)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dialog = new PickDialog(pick.Title);
            var (field, filter) = Box(pick.Placeholder);
            dialog.body.Children.Add(field);
            var list = new ListBox { MaxHeight = 420, Margin = new Thickness(0, 8, 0, 0) };
            ScrollViewer.SetHorizontalScrollBarVisibility(list, ScrollBarVisibility.Disabled);
            var rows = ConfigurationAsk.Items(pick).Select(item => (Item: item, Row: Row(item))).ToList();
            foreach (var (_, row) in rows) list.Items.Add(row);
            dialog.body.Children.Add(list);

            // The box narrows the list to what it names, as VS Code's quick pick does.
            filter.TextChanged += (_, _) =>
            {
                var text = filter.Text.Trim();
                foreach (var (item, row) in rows)
                {
                    var shown = text.Length == 0
                        || item.Label.IndexOf(text, StringComparison.OrdinalIgnoreCase) >= 0
                        || (item.Description?.IndexOf(text, StringComparison.OrdinalIgnoreCase) ?? -1) >= 0;
                    row.Visibility = shown ? Visibility.Visible : Visibility.Collapsed;
                }
            };

            PickItem? chosen = null;
            void Accept()
            {
                var at = rows.FindIndex(pair => pair.Row == list.SelectedItem);
                if (at < 0 || !rows[at].Item.Choosable) return;
                chosen = rows[at].Item;
                dialog.DialogResult = true;
            }
            list.MouseDoubleClick += (_, _) => Accept();
            var ok = dialog.Add("OK");
            ok.IsDefault = true;
            ok.Click += (_, _) => Accept();
            dialog.Loaded += (_, _) => filter.Focus();
            return dialog.ShowModal() == true ? chosen : null;
        }

        /// <summary>
        /// The position of the item the developer chose from
        /// <paramref name="items"/>, each a label and a description, or null
        /// where they dismissed the list.
        /// </summary>
        public static int? Choose(string title, IReadOnlyList<(string Label, string Description)> items)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dialog = new PickDialog(title);
            var (field, filter) = Box("Type to narrow the list");
            dialog.body.Children.Add(field);
            var list = new ListBox { MaxHeight = 420, Margin = new Thickness(0, 8, 0, 0) };
            ScrollViewer.SetHorizontalScrollBarVisibility(list, ScrollBarVisibility.Disabled);
            var rows = items.Select(item => Row(item.Label, item.Description)).ToList();
            foreach (var row in rows) list.Items.Add(row);
            dialog.body.Children.Add(list);
            filter.TextChanged += (_, _) =>
            {
                var text = filter.Text.Trim();
                for (var at = 0; at < rows.Count; at++)
                {
                    var shown = text.Length == 0 || items[at].Label.IndexOf(text, StringComparison.OrdinalIgnoreCase) >= 0;
                    rows[at].Visibility = shown ? Visibility.Visible : Visibility.Collapsed;
                }
            };
            int? chosen = null;
            void Accept()
            {
                var at = list.SelectedItem is ListBoxItem selected ? rows.IndexOf(selected) : -1;
                if (at < 0) return;
                chosen = at;
                dialog.DialogResult = true;
            }
            list.MouseDoubleClick += (_, _) => Accept();
            var ok = dialog.Add("Compare");
            ok.IsDefault = true;
            ok.Click += (_, _) => Accept();
            dialog.Loaded += (_, _) => filter.Focus();
            return dialog.ShowModal() == true ? chosen : null;
        }

        /// <summary>What the developer typed for a typed model, or null where they dismissed the box.</summary>
        public static string? Type(ConfigurationPick pick)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dialog = new PickDialog(pick.Title);
            if (pick.Typed != null)
            {
                dialog.body.Children.Add(new TextBlock { Text = pick.Typed.Prompt, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8) });
            }
            var (field, box) = Box(pick.Placeholder);
            dialog.body.Children.Add(field);
            var ok = dialog.Add("OK");
            ok.IsDefault = true;
            ok.Click += (_, _) => dialog.DialogResult = true;
            dialog.Loaded += (_, _) => box.Focus();
            return dialog.ShowModal() == true ? box.Text : null;
        }

        /// <summary>A text box with the router's placeholder over it while it is empty; WPF's has none.</summary>
        private static (Grid Field, TextBox Box) Box(string placeholder)
        {
            var box = new TextBox { MinWidth = 400, Padding = new Thickness(2) };
            var hint = new TextBlock { Text = placeholder, Opacity = 0.6, IsHitTestVisible = false, Margin = new Thickness(5, 3, 5, 3) };
            box.TextChanged += (_, _) => hint.Visibility = box.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            var field = new Grid();
            field.Children.Add(box);
            field.Children.Add(hint);
            return (field, box);
        }

        /// <summary>One item's lines: its label and description, its detail, and why it cannot be reached or is withheld.</summary>
        private static ListBoxItem Row(PickItem item)
        {
            var lines = new StackPanel { Margin = new Thickness(2, 3, 2, 3) };
            var head = new TextBlock { TextWrapping = TextWrapping.Wrap };
            head.Inlines.Add(new System.Windows.Documents.Run(item.Label) { FontWeight = FontWeights.SemiBold });
            if (!string.IsNullOrEmpty(item.Description)) head.Inlines.Add(new System.Windows.Documents.Run("  " + item.Description));
            lines.Children.Add(head);
            if (!string.IsNullOrEmpty(item.Detail))
            {
                lines.Children.Add(new TextBlock { Text = item.Detail, TextWrapping = TextWrapping.Wrap, Opacity = 0.75 });
            }
            if (item.Reason != null)
            {
                var words = item.Choosable ? $"Not reachable on this machine: {item.Reason}" : $"Not offered: {item.Reason}";
                lines.Children.Add(new TextBlock { Text = words, TextWrapping = TextWrapping.Wrap, FontStyle = FontStyles.Italic, Opacity = 0.75 });
            }
            return new ListBoxItem { Content = lines, IsEnabled = item.Choosable };
        }

        /// <summary>One plain item's line: its label, then its description.</summary>
        private static ListBoxItem Row(string label, string description)
        {
            var head = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(2, 3, 2, 3) };
            head.Inlines.Add(new System.Windows.Documents.Run(label) { FontWeight = FontWeights.SemiBold });
            head.Inlines.Add(new System.Windows.Documents.Run("  " + description));
            return new ListBoxItem { Content = head };
        }

        private Button Add(string title)
        {
            var button = new Button { Content = title, Margin = new Thickness(6, 0, 0, 0), Padding = new Thickness(10, 3, 10, 3), MinWidth = 75 };
            buttons.Children.Add(button);
            return button;
        }
    }
}
