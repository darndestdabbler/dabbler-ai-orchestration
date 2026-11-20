namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// A terminal's size in columns and rows, as the engine pane's page
    /// measures it. A hidden or collapsing pane measures zero, and a pseudo
    /// console given zero fails or draws nothing, so a size is sent only
    /// when it is one the engine can draw in and not the one it already has.
    /// </summary>
    public readonly struct TerminalSize
    {
        public TerminalSize(int columns, int rows)
        {
            Columns = columns;
            Rows = rows;
        }

        public int Columns { get; }

        public int Rows { get; }

        /// <summary>
        /// The size to send to the engine for <paramref name="columns"/> by
        /// <paramref name="rows"/>, or null where either is below one or it
        /// is <paramref name="last"/>, the size last sent.
        /// </summary>
        public static TerminalSize? ToSend(int columns, int rows, TerminalSize? last)
        {
            if (columns < 1 || rows < 1) return null;
            if (last is TerminalSize sent && sent.Columns == columns && sent.Rows == rows) return null;
            return new TerminalSize(columns, rows);
        }
    }
}
