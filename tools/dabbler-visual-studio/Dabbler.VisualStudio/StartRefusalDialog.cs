using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// A refused start, in the router's words, with a button for each way on
    /// it offered and one that closes it and does nothing.
    /// </summary>
    internal sealed class StartRefusalDialog : DialogWindow
    {
        private StartButton? chosen;

        private StartRefusalDialog(string refusal, IReadOnlyList<StartButton> buttons)
        {
            Title = "Dabbler: the session did not start";
            SizeToContent = SizeToContent.WidthAndHeight;
            MaxWidth = 640;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            HasMinimizeButton = false;
            HasMaximizeButton = false;

            var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(12, 0, 12, 12) };
            foreach (var button in buttons)
            {
                var way = Button(button.Title);
                way.Click += (_, _) =>
                {
                    chosen = button;
                    DialogResult = true;
                };
                row.Children.Add(way);
            }
            var close = Button("Close");
            close.IsCancel = true;
            row.Children.Add(close);

            var panel = new StackPanel();
            panel.Children.Add(new TextBlock { Text = refusal, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(12) });
            panel.Children.Add(row);
            Content = panel;
        }

        /// <summary>The way on a developer chose, or null where they closed the dialog.</summary>
        public static StartButton? Ask(string refusal, IReadOnlyList<StartButton> buttons)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dialog = new StartRefusalDialog(refusal, buttons);
            return dialog.ShowModal() == true ? dialog.chosen : null;
        }

        private static Button Button(string title)
        {
            return new Button { Content = title, Margin = new Thickness(6, 0, 0, 0), Padding = new Thickness(10, 3, 10, 3), MinWidth = 75 };
        }
    }
}
