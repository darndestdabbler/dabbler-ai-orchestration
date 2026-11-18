using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// One run of text in one tone, as the router named it: milestone, good,
    /// warn, bad, muted or plain. What a tone looks like is the window's to
    /// paint; which tone a piece is, is the router's.
    /// </summary>
    public sealed class TerminalPiece
    {
        public TerminalPiece(string text, string tone, bool bold)
        {
            Text = text;
            Tone = tone;
            Bold = bold;
        }

        public string Text { get; }

        public string Tone { get; }

        public bool Bold { get; }
    }

    /// <summary>One row of the Dabbler Terminal.</summary>
    public sealed class TerminalRow
    {
        public TerminalRow(TerminalPiece? clock, IReadOnlyList<TerminalPiece> pieces, bool isHeading, string? voice = null, bool isJobOutput = false, bool ended = true)
        {
            Clock = clock;
            Pieces = pieces;
            IsHeading = isHeading;
            Voice = voice;
            IsJobOutput = isJobOutput;
            Ended = ended;
        }

        /// <summary>Who said it: the framework, or the job whose log it came from; null for a heading.</summary>
        public string? Voice { get; }

        /// <summary>A job's own output, exactly as the job wrote it, rather than a line of the framework's.</summary>
        public bool IsJobOutput { get; }

        /// <summary>False for a job's line the job has not finished writing: the next of its output continues it.</summary>
        internal bool Ended { get; }

        /// <summary>The time a framework line was said, kept apart so the rest wraps under its event; null where the row has none.</summary>
        public TerminalPiece? Clock { get; }

        /// <summary>Everything after the clock, in order.</summary>
        public IReadOnlyList<TerminalPiece> Pieces { get; }

        /// <summary>A change of voice or the start of a session: a heading over the rows beneath.</summary>
        public bool IsHeading { get; }

        /// <summary>The row as copied: the clock, a space, and the pieces.</summary>
        public string Text =>
            (Clock == null ? "" : Clock.Text + " ") + string.Concat(Pieces.Select(piece => piece.Text));
    }

    /// <summary>
    /// The rows of what `dabbler terminal --follow --json` has printed, one
    /// object to a line, in the order it printed them.
    /// </summary>
    public sealed class TerminalRows
    {
        public ObservableCollection<TerminalRow> Rows { get; } = new ObservableCollection<TerminalRow>();

        /// <summary>
        /// One line the router printed, added as the row it is; a
        /// <see cref="FormatException"/> naming the problem where it is not a
        /// terminal object.
        /// </summary>
        public void Add(string json)
        {
            JObject record;
            try
            {
                record = JObject.Parse(json);
            }
            catch (JsonException error)
            {
                throw new FormatException($"The router printed something that is not a Dabbler Terminal line: {error.Message}", error);
            }
            var kind = (string?)record["kind"];
            switch (kind)
            {
                case "line":
                    Rows.Add(Line(record));
                    return;
                case "rule":
                case "banner":
                    Rows.Add(new TerminalRow(null, new[] { new TerminalPiece((string?)record["label"] ?? "", "milestone", true) }, isHeading: true));
                    return;
                case "output":
                    AddOutput(record);
                    return;
                case "notice":
                    return;
                default:
                    throw new FormatException($"The router printed a Dabbler Terminal line of kind '{kind}', which this extension does not read: update the extension or the router so they match.");
            }
        }

        public void Clear()
        {
            Rows.Clear();
        }

        /// <summary>A piece of a job's output: a row of its own, or the rest of the line the job's last piece left open.</summary>
        private void AddOutput(JObject record)
        {
            var voice = (string?)record["voice"];
            var text = (string?)record["text"] ?? "";
            var ended = (bool?)record["eol"] ?? true;
            var last = Rows.Count == 0 ? null : Rows[Rows.Count - 1];
            if (last != null && last.IsJobOutput && !last.Ended && last.Voice == voice)
            {
                Rows[Rows.Count - 1] = Output(voice, last.Text + text, ended);
                return;
            }
            Rows.Add(Output(voice, text, ended));
        }

        private static TerminalRow Output(string? voice, string text, bool ended) =>
            new TerminalRow(null, new[] { new TerminalPiece(text, "plain", false) }, isHeading: false, voice, isJobOutput: true, ended);

        private static TerminalRow Line(JObject record)
        {
            var clock = (string?)record["clock"];
            var pieces = (record["spans"] as JArray ?? new JArray())
                .OfType<JObject>()
                .Select(span => new TerminalPiece((string?)span["text"] ?? "", (string?)span["tone"] ?? "plain", (bool?)span["bold"] ?? false))
                .ToList();
            TerminalPiece? first = null;
            if (pieces.Count > 0 && clock != null && pieces[0].Text == clock)
            {
                first = pieces[0];
                pieces.RemoveAt(0);
                if (pieces.Count > 0 && pieces[0].Text == " ") pieces.RemoveAt(0);
            }
            return new TerminalRow(first, pieces, isHeading: false, (string?)record["voice"]);
        }
    }
}
