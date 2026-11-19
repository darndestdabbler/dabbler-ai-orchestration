using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The Dabbler Terminal's content: a list bound to a <see cref="TerminalRows"/>
    /// as its data context, each piece of a row painted in its tone.
    /// </summary>
    public partial class TerminalControl : UserControl
    {
        /// <summary>A row's pieces, drawn as runs into the TextBlock this is set on.</summary>
        public static readonly DependencyProperty PiecesProperty = DependencyProperty.RegisterAttached(
            "Pieces", typeof(IReadOnlyList<TerminalPiece>), typeof(TerminalControl), new PropertyMetadata(null, OnPiecesChanged));

        /// <summary>One piece -- a row's clock -- drawn as a run into the TextBlock this is set on.</summary>
        public static readonly DependencyProperty PieceProperty = DependencyProperty.RegisterAttached(
            "Piece", typeof(TerminalPiece), typeof(TerminalControl), new PropertyMetadata(null, OnPieceChanged));

        // The palettes of packages/router/src/transcript.ts TONES, which the
        // VS Code terminal and the transcript are painted from. `plain` is
        // the window's own text colour and is not here.
        private static readonly IReadOnlyDictionary<string, Brush> Dark = Palette(new Dictionary<string, string>
        {
            ["milestone"] = "#3874db",
            ["good"] = "#54a33b",
            ["warn"] = "#b79427",
            ["bad"] = "#f14c4c",
            ["muted"] = "#8c8c8c",
        });

        private static readonly IReadOnlyDictionary<string, Brush> Light = Palette(new Dictionary<string, string>
        {
            ["milestone"] = "#2a5db0",
            ["good"] = "#256029",
            ["warn"] = "#8a6100",
            ["bad"] = "#a31515",
            ["muted"] = "#6b6b6b",
        });

        // Whether the newest row is kept in view: true until the developer
        // scrolls away from the end, and again once they scroll back to it.
        private bool following = true;

        public TerminalControl()
        {
            InitializeComponent();
            RowKeys.FocusRowsWhenShown(this, List);
            ((INotifyCollectionChanged)List.Items).CollectionChanged += OnRowsChanged;
            // A row's colours are chosen as it is drawn, so a change of theme draws them all again.
            Loaded += (_, _) => VSColorTheme.ThemeChanged += OnThemeChanged;
            Unloaded += (_, _) => VSColorTheme.ThemeChanged -= OnThemeChanged;
        }

        public static IReadOnlyList<TerminalPiece>? GetPieces(TextBlock block) => (IReadOnlyList<TerminalPiece>?)block.GetValue(PiecesProperty);

        public static void SetPieces(TextBlock block, IReadOnlyList<TerminalPiece>? value) => block.SetValue(PiecesProperty, value);

        public static TerminalPiece? GetPiece(TextBlock block) => (TerminalPiece?)block.GetValue(PieceProperty);

        public static void SetPiece(TextBlock block, TerminalPiece? value) => block.SetValue(PieceProperty, value);

        /// <summary>Whether any row is selected, so there is something to copy.</summary>
        public bool CanCopy => List.SelectedItems.Count > 0;

        /// <summary>The selected rows' text on the clipboard, one to a line, in the order they are shown.</summary>
        public void CopySelection()
        {
            var rows = List.SelectedItems.Cast<TerminalRow>().OrderBy(row => List.Items.IndexOf(row)).Select(row => row.Text);
            var text = string.Join(Environment.NewLine, rows);
            if (text.Length > 0) Clipboard.SetText(text);
        }

        private void OnCopy(object sender, ExecutedRoutedEventArgs e)
        {
            CopySelection();
        }

        private void OnCanCopy(object sender, CanExecuteRoutedEventArgs e)
        {
            e.CanExecute = CanCopy;
        }

        /// <summary>A row added or the last one replaced: the newest is brought into view while following.</summary>
        private void OnRowsChanged(object sender, NotifyCollectionChangedEventArgs e)
        {
            var count = List.Items.Count;
            if (count == 0)
            {
                following = true;
                return;
            }
            if (following) List.ScrollIntoView(List.Items[count - 1]);
        }

        /// <summary>
        /// Following is decided only by a move the developer made: the offset
        /// changed while the extent did not. Rows arriving change the extent,
        /// and a resized window changes neither offset nor following.
        /// </summary>
        private void OnScrollChanged(object sender, ScrollChangedEventArgs e)
        {
            if (e.ExtentHeightChange != 0 || e.VerticalChange == 0) return;
            following = e.VerticalOffset + e.ViewportHeight >= e.ExtentHeight - 0.5;
        }

        private void OnThemeChanged(ThemeChangedEventArgs e)
        {
            List.Items.Refresh();
        }

        private static void OnPiecesChanged(DependencyObject target, DependencyPropertyChangedEventArgs e)
        {
            Draw((TextBlock)target, (IReadOnlyList<TerminalPiece>?)e.NewValue);
        }

        private static void OnPieceChanged(DependencyObject target, DependencyPropertyChangedEventArgs e)
        {
            Draw((TextBlock)target, e.NewValue is TerminalPiece piece ? new[] { piece } : null);
        }

        private static void Draw(TextBlock block, IReadOnlyList<TerminalPiece>? pieces)
        {
            block.Inlines.Clear();
            if (pieces == null) return;
            var palette = Tones();
            foreach (var piece in pieces)
            {
                var run = new Run(piece.Text);
                if (palette.TryGetValue(piece.Tone, out var brush)) run.Foreground = brush;
                if (piece.Bold) run.FontWeight = FontWeights.Bold;
                block.Inlines.Add(run);
            }
        }

        /// <summary>The palette for the theme the tool window is drawn in, chosen as the status pictures are.</summary>
        private static IReadOnlyDictionary<string, Brush> Tones()
        {
            var background = VSColorTheme.GetThemedColor(EnvironmentColors.ToolWindowBackgroundColorKey);
            return background.GetBrightness() < 0.5 ? Dark : Light;
        }

        private static IReadOnlyDictionary<string, Brush> Palette(Dictionary<string, string> colours)
        {
            var brushes = new Dictionary<string, Brush>();
            foreach (var colour in colours)
            {
                var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(colour.Value));
                brush.Freeze();
                brushes[colour.Key] = brush;
            }
            return brushes;
        }
    }
}
