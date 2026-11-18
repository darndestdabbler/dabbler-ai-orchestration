using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>Something a person should know about a session, in the words it is said in.</summary>
    public sealed class TerminalNotice
    {
        public const string Paused = "paused";
        public const string InstructionOverdue = "instruction-overdue";
        public const string SessionClosed = "session-closed";

        /// <summary>A session seen paused is past its stop: resumed, or another session is running. Said to close its pause, never shown.</summary>
        public const string MovedOn = "moved-on";

        public TerminalNotice(string kind, string? session, string message)
        {
            Kind = kind;
            Session = session;
            Message = message;
        }

        /// <summary><see cref="Paused"/>, <see cref="InstructionOverdue"/>, <see cref="SessionClosed"/> or <see cref="MovedOn"/>.</summary>
        public string Kind { get; }

        /// <summary>The session's label as the router prints it, such as 358; null where the stream has not named one.</summary>
        public string? Session { get; }

        /// <summary>The router's sentence for a pause or an overdue instruction; for a close, one saying so.</summary>
        public string Message { get; }
    }

    /// <summary>
    /// The notices one following of `dabbler terminal --follow --json` raises
    /// for one repository, each raised once. What has been raised is kept in a
    /// file, so a following started again -- Visual Studio restarted, the
    /// solution reopened -- does not raise it a second time, although the
    /// router says a pause that is still in force again on its first look.
    /// </summary>
    public sealed class TerminalNotices
    {
        private readonly string repositoryRoot;
        private readonly string raisedFile;
        private readonly HashSet<string> raised = new HashSet<string>(StringComparer.Ordinal);

        // The sessions this following saw in a phase other than complete and
        // has not seen close: only their close is news.
        private readonly HashSet<string> open = new HashSet<string>(StringComparer.Ordinal);

        // The sessions this following saw paused and has not seen move on.
        private readonly HashSet<string> paused = new HashSet<string>(StringComparer.Ordinal);

        // The session the stream last named. A phase line names it only when
        // it changes, and an overdue notice never does.
        private string? session;

        public TerminalNotices(string repositoryRoot, string raisedFile)
        {
            this.repositoryRoot = repositoryRoot.TrimEnd('\\', '/');
            this.raisedFile = raisedFile;
            if (File.Exists(raisedFile)) raised.UnionWith(File.ReadAllLines(raisedFile));
        }

        /// <summary>Whether a session this following saw open has not yet been seen to close.</summary>
        public bool SessionOpen => open.Count > 0;

        /// <summary>
        /// The notice one line the router printed raises; null for every other
        /// line, for one raised before, and for one that is not JSON -- the
        /// Dabbler Terminal window says what it could not read. A paused
        /// session moving on is said every time, being nothing to show.
        /// </summary>
        public TerminalNotice? Read(string json)
        {
            JObject record;
            try
            {
                record = JObject.Parse(json);
            }
            catch (JsonException)
            {
                return null;
            }
            switch ((string?)record["kind"])
            {
                case "notice":
                    return Notice(record);
                case "line":
                    return Line(record);
                default:
                    return null;
            }
        }

        private TerminalNotice? Notice(JObject record)
        {
            var message = (string?)record["message"] ?? "";
            switch ((string?)record["notice"])
            {
                case TerminalNotice.Paused:
                    var stopped = (string?)record["session"] ?? session;
                    // A paused session is open, whether or not a phase line named it first.
                    if (stopped != null)
                    {
                        open.Add(stopped);
                        paused.Add(stopped);
                        session ??= stopped;
                    }
                    return Raise(new TerminalNotice(TerminalNotice.Paused, stopped, message), (string?)record["stop"], (string?)record["reason"]);
                case TerminalNotice.InstructionOverdue:
                    return Raise(new TerminalNotice(TerminalNotice.InstructionOverdue, session, message), (string?)record["seq"], (string?)record["outstandingSeconds"]);
                default:
                    return null;
            }
        }

        private TerminalNotice? Line(JObject record)
        {
            var fields = record["fields"] as JObject;
            var named = (string?)fields?["session"];
            switch ((string?)record["event"])
            {
                case "phase":
                    // Another session running is the paused one gone: a rollback says so this way.
                    var left = named != null && session != null && named != session && paused.Contains(session) ? session : null;
                    if (named != null) session = named;
                    if (session != null && (string?)fields?["now"] != "complete") open.Add(session);
                    if (left == null) return null;
                    open.Remove(left);
                    return MoveOn(left);
                case "progress-resumed":
                    return session != null && paused.Contains(session) ? MoveOn(session) : null;
                case TerminalNotice.SessionClosed:
                    var closed = named ?? session;
                    if (closed == null || !open.Remove(closed)) return null;
                    paused.Remove(closed);
                    return Raise(new TerminalNotice(TerminalNotice.SessionClosed, closed, $"Dabbler: session {closed} is closed."));
                default:
                    return null;
            }
        }

        private TerminalNotice MoveOn(string moved)
        {
            paused.Remove(moved);
            return new TerminalNotice(TerminalNotice.MovedOn, moved, $"Dabbler: session {moved} is past its stop.");
        }

        /// <summary>The notice, where its key has not been raised before; the key is kept as it is raised.</summary>
        private TerminalNotice? Raise(TerminalNotice notice, params string?[] identity)
        {
            var parts = new List<string> { repositoryRoot, notice.Kind, notice.Session ?? "" };
            foreach (var part in identity) parts.Add(part ?? "");
            // One key to a line of the file, whatever a reason holds.
            var key = string.Join("\t", parts).Replace('\r', ' ').Replace('\n', ' ');
            if (!raised.Add(key)) return null;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(raisedFile))!);
                File.AppendAllText(raisedFile, key + Environment.NewLine);
            }
            catch (Exception error) when (error is IOException || error is UnauthorizedAccessException)
            {
                // A notice raised again after a restart is better than one never raised.
            }
            return notice;
        }
    }
}
