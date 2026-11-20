using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// What a finished session changed, read from git: its first and last
    /// commits by the subjects the framework writes for a session, and the
    /// files that differ between the commit before the first and the last.
    /// By the time a developer looks, the work is committed and Git Changes
    /// is empty, so this is where they see it.
    /// </summary>
    public static class SessionChanges
    {
        /// <summary>The git arguments whose output <see cref="Range"/> reads.</summary>
        public static readonly IReadOnlyList<string> LogArguments = new[] { "log", "--first-parent", "--format=%H%x09%s" };

        /// <summary>The git arguments whose output <see cref="Files"/> reads.</summary>
        public static IReadOnlyList<string> DiffArguments(SessionRange range) =>
            new[] { "diff", "--name-status", "-M", "-z", range.Start, range.End };

        /// <summary>
        /// Session <paramref name="session"/>'s range in <paramref name="log"/>
        /// (newest first, one `sha TAB subject` a line): the first parent of
        /// its earliest commit and its latest; null where no commit is its own
        /// or its earliest has no parent.
        /// </summary>
        public static SessionRange? Range(string log, int session)
        {
            var own = new Regex($@"^(Session {session}: |Close session {session} of |Transcript for session {session}$)");
            var lines = log.Replace("\r", "").Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
            string? latest = null;
            var earliest = -1;
            for (var at = 0; at < lines.Length; at++)
            {
                var tab = lines[at].IndexOf('\t');
                if (tab <= 0 || !own.IsMatch(lines[at].Substring(tab + 1))) continue;
                latest ??= lines[at].Substring(0, tab);
                earliest = at;
            }
            if (latest == null || earliest + 1 >= lines.Length) return null;
            var before = lines[earliest + 1];
            var parent = before.IndexOf('\t') > 0 ? before.Substring(0, before.IndexOf('\t')) : before.Trim();
            return new SessionRange(parent, latest);
        }

        /// <summary>
        /// The files in <paramref name="nameStatus"/>, as `git diff --name-status -M -z`
        /// prints them: NUL between every field, so a path is exactly the
        /// path, whatever it holds.
        /// </summary>
        public static IReadOnlyList<ChangedFile> Files(string nameStatus)
        {
            var files = new List<ChangedFile>();
            var fields = nameStatus.Split('\0');
            var at = 0;
            while (at + 1 < fields.Length)
            {
                var status = fields[at].Trim();
                if (status.Length == 0)
                {
                    at++;
                    continue;
                }
                // A rename or a copy names two paths, the old one first.
                if ((status[0] == 'R' || status[0] == 'C') && at + 2 < fields.Length)
                {
                    files.Add(status[0] == 'R'
                        ? new ChangedFile(FileChange.Renamed, fields[at + 2], fields[at + 1])
                        : new ChangedFile(FileChange.Added, fields[at + 2], null));
                    at += 3;
                    continue;
                }
                var change = status[0] == 'A' ? FileChange.Added : status[0] == 'D' ? FileChange.Deleted : FileChange.Modified;
                files.Add(new ChangedFile(change, fields[at + 1], null));
                at += 2;
            }
            return files;
        }
    }

    /// <summary>The commit before a session's first and its last.</summary>
    public sealed class SessionRange
    {
        internal SessionRange(string start, string end)
        {
            Start = start;
            End = end;
        }

        public string Start { get; }

        public string End { get; }
    }

    public enum FileChange
    {
        Added,
        Modified,
        Deleted,
        Renamed,
    }

    /// <summary>One file a session changed, repository-relative with forward slashes.</summary>
    public sealed class ChangedFile
    {
        internal ChangedFile(FileChange change, string path, string? oldPath)
        {
            Change = change;
            Path = path;
            OldPath = oldPath;
        }

        public FileChange Change { get; }

        /// <summary>Where the file is at the session's last commit; where it was, for a deleted one.</summary>
        public string Path { get; }

        /// <summary>Where a renamed file was at the session's start; null otherwise.</summary>
        public string? OldPath { get; }

        /// <summary>How it changed, in words: added, changed, deleted, or renamed from its old path.</summary>
        public string Description => Change switch
        {
            FileChange.Added => "added",
            FileChange.Deleted => "deleted",
            FileChange.Renamed => $"renamed from {OldPath}",
            _ => "changed",
        };
    }
}
