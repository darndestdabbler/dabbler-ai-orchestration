using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// What a row action asks before it runs, in the router's words: a
    /// confirmation with its accept and keep buttons, or a reason typed into
    /// a box. Esc or the window's close button dismisses either; what a
    /// dismissal means is the router's (see ActionAsk).
    /// </summary>
    internal sealed class ActionDialog : DialogWindow
    {
        private readonly StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(12, 0, 12, 12) };

        private readonly StackPanel body = new StackPanel { Margin = new Thickness(12) };

        private ActionDialog()
        {
            Title = "Dabbler";
            SizeToContent = SizeToContent.WidthAndHeight;
            MinWidth = 360;
            MaxWidth = 640;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            HasMinimizeButton = false;
            HasMaximizeButton = false;
            // A dialog with no keep button still closes on Esc.
            PreviewKeyDown += (_, e) =>
            {
                if (e.Key != Key.Escape) return;
                DialogResult = false;
                e.Handled = true;
            };
            var panel = new StackPanel();
            panel.Children.Add(body);
            panel.Children.Add(buttons);
            Content = panel;
        }

        /// <summary>True only where the developer chose the confirmation's accept.</summary>
        public static bool Confirm(WorkExplorerConfirmation confirmation)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dialog = new ActionDialog();
            dialog.body.Children.Add(new TextBlock { Text = confirmation.Title, TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold });
            if (!string.IsNullOrEmpty(confirmation.Detail))
            {
                dialog.body.Children.Add(new TextBlock { Text = confirmation.Detail, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0) });
            }
            var accept = dialog.Add(confirmation.Accept);
            accept.IsDefault = true;
            accept.Click += (_, _) => dialog.DialogResult = true;
            if (confirmation.Keep != null) dialog.Add(confirmation.Keep).IsCancel = true;
            return dialog.ShowModal() == true;
        }

        /// <summary>What the developer typed, or null where they dismissed the box.</summary>
        public static string? AskReason(WorkExplorerReason reason)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dialog = new ActionDialog();
            dialog.body.Children.Add(new TextBlock { Text = reason.Prompt, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8) });
            var box = new TextBox { MinWidth = 340, Padding = new Thickness(2) };
            // WPF's text box has no placeholder: the router's sits over it while it is empty.
            var placeholder = new TextBlock { Text = reason.Placeholder, Opacity = 0.6, IsHitTestVisible = false, Margin = new Thickness(5, 3, 5, 3) };
            box.TextChanged += (_, _) => placeholder.Visibility = box.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            var field = new Grid();
            field.Children.Add(box);
            field.Children.Add(placeholder);
            dialog.body.Children.Add(field);
            // One button, named by the platform's word for going on: Esc is the
            // dismissal, and a second button's word would say what dismissing
            // means, which differs action to action.
            var ok = dialog.Add("OK");
            ok.IsDefault = true;
            ok.Click += (_, _) => dialog.DialogResult = true;
            dialog.Loaded += (_, _) => box.Focus();
            return dialog.ShowModal() == true ? box.Text : null;
        }

        private Button Add(string title)
        {
            var button = new Button { Content = title, Margin = new Thickness(6, 0, 0, 0), Padding = new Thickness(10, 3, 10, 3), MinWidth = 75 };
            buttons.Children.Add(button);
            return button;
        }
    }
}
