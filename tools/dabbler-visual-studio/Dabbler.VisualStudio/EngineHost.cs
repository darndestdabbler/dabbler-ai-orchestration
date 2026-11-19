using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Dabbler.VisualStudio.Core;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The extension's side of an engine host: starting one, and the
    /// connection a pane attaches through.
    /// </summary>
    internal static class EngineHost
    {
        private const string Program = "Dabbler.EngineHost.exe";
        private static readonly TimeSpan Patience = TimeSpan.FromSeconds(10);

        /// <summary>
        /// Starts a host running <paramref name="commandLine"/> in
        /// <paramref name="cwd"/> with exactly <paramref name="environment"/>,
        /// and returns its pipe. The host runs from a copy outside the
        /// extension's folder, so an update of the extension never meets a
        /// file a running engine holds.
        /// </summary>
        /// <exception cref="InvalidOperationException">The host could not be started.</exception>
        public static string Start(string folder, string title, string commandLine, string cwd, IReadOnlyDictionary<string, string> environment, TerminalSize size)
        {
            var pipe = "dabbler-engine-" + Guid.NewGuid().ToString("N");
            var start = new ProcessStartInfo(Installed())
            {
                Arguments = string.Join(" ", new[] { "--folder", folder, "--title", title, "--columns", size.Columns.ToString(), "--rows", size.Rows.ToString(), "--pipe", pipe, "--", commandLine }.Select(Router.Quote)),
                WorkingDirectory = cwd,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            start.EnvironmentVariables.Clear();
            foreach (var pair in environment) start.EnvironmentVariables[pair.Key] = pair.Value;
            using (var starter = System.Diagnostics.Process.Start(start) ?? throw new InvalidOperationException("The engine host did not start."))
            {
                // The starter starts the host itself out of Visual Studio's tree and exits.
                if (!starter.WaitForExit((int)Patience.TotalMilliseconds)) throw new InvalidOperationException("The engine host did not start in time.");
                if (starter.ExitCode != 0) throw new InvalidOperationException($"The engine host could not start the engine (exit code {starter.ExitCode}).");
            }
            return pipe;
        }

        /// <summary>
        /// The host's folder under %LOCALAPPDATA%\Dabbler\host, named by what
        /// the host is, copied there from the package once.
        /// </summary>
        private static string Installed()
        {
            var shipped = Path.Combine(Path.GetDirectoryName(typeof(EngineHost).Assembly.Location)!, "host");
            string name;
            using (var sha = SHA256.Create())
            using (var exe = File.OpenRead(Path.Combine(shipped, Program)))
            {
                name = string.Concat(sha.ComputeHash(exe).Take(8).Select(b => b.ToString("x2")));
            }
            var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dabbler", "host");
            var target = Path.Combine(root, name);
            if (!File.Exists(Path.Combine(target, Program)))
            {
                // Copied beside it and renamed whole, so a host never starts from half a copy.
                var copying = Path.Combine(root, name + "-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(copying);
                foreach (var file in Directory.GetFiles(shipped)) File.Copy(file, Path.Combine(copying, Path.GetFileName(file)));
                try
                {
                    Directory.Move(copying, target);
                }
                catch (IOException) when (File.Exists(Path.Combine(target, Program)))
                {
                    // Another Visual Studio copied it first.
                    Directory.Delete(copying, true);
                }
            }
            return Path.Combine(target, Program);
        }

        /// <summary>
        /// The engines whose hosts are running for the repository at
        /// <paramref name="folder"/>, by the records they keep. A record whose
        /// host has gone without removing it, as a killed one does, is deleted.
        /// </summary>
        public static IReadOnlyList<EngineRecord> Running(string folder)
        {
            var running = new List<EngineRecord>();
            if (!Directory.Exists(EngineRecord.RecordsFolder)) return running;
            foreach (var path in Directory.GetFiles(EngineRecord.RecordsFolder, "*.json"))
            {
                EngineRecord? record;
                try
                {
                    record = EngineRecord.Parse(File.ReadAllText(path));
                }
                catch (IOException)
                {
                    continue;
                }
                if (record == null) continue;
                if (!IsHost(record.ProcessId))
                {
                    try
                    {
                        File.Delete(path);
                    }
                    catch (IOException)
                    {
                    }
                    continue;
                }
                if (record.IsFor(folder)) running.Add(record);
            }
            return running.OrderBy(record => record.StartedAt).ToList();
        }

        /// <summary>Whether <paramref name="processId"/> is a running engine host, not a process that took its number.</summary>
        private static bool IsHost(int processId)
        {
            try
            {
                using (var process = System.Diagnostics.Process.GetProcessById(processId))
                {
                    return !process.HasExited && string.Equals(process.ProcessName, Path.GetFileNameWithoutExtension(Program), StringComparison.OrdinalIgnoreCase);
                }
            }
            catch (ArgumentException)
            {
                return false;
            }
            catch (InvalidOperationException)
            {
                return false;
            }
            catch (System.ComponentModel.Win32Exception)
            {
                // Another user's process: never a host of this user's.
                return false;
            }
        }

        /// <summary>
        /// Attaches to the host at <paramref name="pipe"/> at
        /// <paramref name="size"/>, and returns its answer: attached or refused.
        /// </summary>
        /// <exception cref="IOException">The host could not be reached.</exception>
        public static Connection Attach(string pipe, TerminalSize size, out EngineMessage answer)
        {
            var stream = new NamedPipeClientStream(".", pipe, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                stream.Connect((int)Patience.TotalMilliseconds);
            }
            catch (TimeoutException error)
            {
                stream.Dispose();
                throw new IOException("The engine host did not answer.", error);
            }
            var connection = new Connection(stream);
            connection.Send(EngineMessage.Attach(size.Columns, size.Rows));
            var first = connection.Read();
            if (first == null || (first.Kind != EngineMessageKind.Attached && first.Kind != EngineMessageKind.Refused))
            {
                connection.Dispose();
                throw new IOException("The engine host did not answer.");
            }
            answer = first;
            return connection;
        }

        /// <summary>A pane's end of the pipe to a host.</summary>
        internal sealed class Connection : IDisposable
        {
            private readonly NamedPipeClientStream stream;
            private readonly StreamReader reader;
            private readonly StreamWriter writer;
            private int disposed;

            public Connection(NamedPipeClientStream stream)
            {
                this.stream = stream;
                var utf8 = new UTF8Encoding(false);
                reader = new StreamReader(stream, utf8);
                writer = new StreamWriter(stream, utf8);
            }

            public EngineMessage? Read() => EngineMessages.Read(reader);

            /// <summary>
            /// Reads what the host says on a thread of its own, calling
            /// <paramref name="onMessage"/> for each message and
            /// <paramref name="onGone"/> once when the pipe ends.
            /// </summary>
            public void Listen(Action<EngineMessage> onMessage, Action onGone)
            {
                new Thread(() =>
                {
                    try
                    {
                        while (Read() is EngineMessage message) onMessage(message);
                    }
                    catch (Exception error) when (error is IOException || error is FormatException || error is ObjectDisposedException)
                    {
                        // The host has gone, or this end was closed.
                    }
                    onGone();
                }) { IsBackground = true, Name = "Dabbler engine host" }.Start();
            }

            /// <summary>Sends one message; a host that has gone is said by the listener.</summary>
            public void Send(EngineMessage message)
            {
                lock (writer)
                {
                    if (disposed != 0) return;
                    try
                    {
                        EngineMessages.Write(writer, message);
                    }
                    catch (Exception error) when (error is IOException || error is ObjectDisposedException)
                    {
                    }
                }
            }

            /// <summary>Detaches: the engine runs on.</summary>
            public void Dispose()
            {
                lock (writer)
                {
                    if (Interlocked.Exchange(ref disposed, 1) != 0) return;
                    stream.Dispose();
                }
            }
        }
    }
}
