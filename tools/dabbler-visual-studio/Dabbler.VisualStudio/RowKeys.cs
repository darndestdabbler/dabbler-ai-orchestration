using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;

namespace Dabbler.VisualStudio
{
    /// <summary>What the keyboard reaches in a Dabbler window that a mouse reaches without help.</summary>
    internal static class RowKeys
    {
        /// <summary>
        /// Where Visual Studio gives the keyboard to the window itself, as it
        /// does when the window's command shows it, the window hands it to its
        /// rows, so the arrow keys work straight away.
        /// </summary>
        public static void FocusRowsWhenShown(UserControl window, Control rows)
        {
            window.Focusable = true;
            window.IsTabStop = false;
            window.GotKeyboardFocus += (_, e) =>
            {
                if (e.NewFocus == window) rows.Focus();
            };
        }

        /// <summary>
        /// The context-menu key or Shift+F10 in a tree: WPF raises the opening
        /// on the focused row, which holds no menu -- the row's header does.
        /// The header's menu is filled by <paramref name="fill"/> and opened
        /// under it. A right-click starts inside the header, whose own handler
        /// has answered it, and is left alone.
        /// </summary>
        public static void OpenMenu(ContextMenuEventArgs e, Func<FrameworkElement, bool> fill)
        {
            if (!(e.OriginalSource is TreeViewItem item)) return;
            e.Handled = true;
            if (!(item.Template?.FindName("PART_Header", item) is ContentPresenter header) || VisualTreeHelper.GetChildrenCount(header) == 0) return;
            if (!(VisualTreeHelper.GetChild(header, 0) is FrameworkElement row) || row.ContextMenu == null || !fill(row)) return;
            row.ContextMenu.PlacementTarget = row;
            row.ContextMenu.Placement = PlacementMode.Bottom;
            row.ContextMenu.IsOpen = true;
        }
    }
}
