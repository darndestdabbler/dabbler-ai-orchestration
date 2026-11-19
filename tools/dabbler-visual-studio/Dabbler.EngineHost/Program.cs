using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Dabbler.VisualStudio.Core;

namespace Dabbler.EngineHost
{
    /// <summary>
    /// One engine, kept running whether or not a pane is attached:
    /// <c>Dabbler.EngineHost --folder F --title T --columns C --rows R --pipe P -- "command line"</c>,
    /// in the working folder and environment it is started with. It runs the
    /// command line it is given and decides nothing.
    /// </summary>
    internal static class Program
    {
        // Marks the second start: the host that runs, no longer its starter's child.
        private const string Detached = "--detached";

        private const uint CreateBreakawayFromJob = 0x01000000;
        private const uint CreateNoWindow = 0x08000000;
        private const uint CreateNewProcessGroup = 0x00000200;
        private const int AccessDenied = 5;

        private static int Main(string[] args)
        {
            var detached = args.Length > 0 && args[0] == Detached;
            var options = HostOptions.Parse(detached ? args.Skip(1).ToArray() : args);
            if (options == null) return 2;
            if (!detached) return StartDetached(args);
            return Run(options);
        }

        /// <summary>
        /// Starts this program again with the same arguments, out of the
        /// starter's job where it has one, and returns: the host that runs is
        /// then no child of Visual Studio's, and nothing that ends Visual
        /// Studio's process tree or job reaches it.
        /// </summary>
        private static int StartDetached(string[] args)
        {
            var self = typeof(Program).Assembly.Location;
            var commandLine = string.Join(" ", new[] { self, Detached }.Concat(args).Select(Router.Quote));
            IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out var inJob);
            var flags = CreateNoWindow | CreateNewProcessGroup | (inJob ? CreateBreakawayFromJob : 0);
            if (Start(commandLine, flags)) return 0;
            var error = Marshal.GetLastWin32Error();
            // A job that forbids breaking away: Windows Management starts it, outside this tree and its job.
            if (inJob && error == AccessDenied) return StartThroughManagement(commandLine) ? 0 : 1;
            return 1;
        }

        private static bool Start(string commandLine, uint flags)
        {
            var startup = new StartupInfo { cb = Marshal.SizeOf<StartupInfo>() };
            if (!CreateProcessW(null, new StringBuilder(commandLine), IntPtr.Zero, IntPtr.Zero, false, flags, IntPtr.Zero, null, ref startup, out var info)) return false;
            CloseHandle(info.hThread);
            CloseHandle(info.hProcess);
            return true;
        }

        private static bool StartThroughManagement(string commandLine)
        {
            using (var startupClass = new ManagementClass("Win32_ProcessStartup"))
            using (var startup = startupClass.CreateInstance())
            using (var processClass = new ManagementClass("Win32_Process"))
            using (var parameters = processClass.GetMethodParameters("Create"))
            {
                // A process Windows Management starts has its own environment, not this one's: the engine's is carried over.
                startup["EnvironmentVariables"] = Environment.GetEnvironmentVariables().Cast<DictionaryEntry>().Select(pair => $"{pair.Key}={pair.Value}").ToArray();
                parameters["CommandLine"] = commandLine;
                parameters["CurrentDirectory"] = Environment.CurrentDirectory;
                parameters["ProcessStartupInformation"] = startup;
                using (var result = processClass.InvokeMethod("Create", parameters, null))
                {
                    return Convert.ToUInt32(result["ReturnValue"]) == 0;
                }
            }
        }

        /// <summary>The host itself: the engine started, its record written while it runs, and its exit code returned.</summary>
        private static int Run(HostOptions options)
        {
            var record = Path.Combine(EngineRecord.RecordsFolder, options.Pipe + ".json");
            var environment = Environment.GetEnvironmentVariables().Cast<DictionaryEntry>().ToDictionary(pair => (string)pair.Key, pair => (string)pair.Value!, StringComparer.OrdinalIgnoreCase);
            var exited = new ManualResetEventSlim();
            var code = 1;
            var host = new Host(options);
            try
            {
                using (var engine = new PseudoConsole(options.CommandLine, Environment.CurrentDirectory, environment, options.Columns, options.Rows, host.OnOutput, exit =>
                {
                    code = exit;
                    exited.Set();
                }))
                {
                    host.Serve(engine);
                    WriteRecord(record, options);
                    exited.Wait();
                    host.OnExit(code);
                }
            }
            catch (Win32Exception)
            {
                // The engine could not be started: there is nothing to keep running.
            }
            finally
            {
                try
                {
                    File.Delete(record);
                }
                catch (IOException)
                {
                }
            }
            return code;
        }

        /// <summary>Written whole or not at all, so a reader never sees half of one.</summary>
        private static void WriteRecord(string path, HostOptions options)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var text = new EngineRecord
            {
                Folder = options.Folder,
                Title = options.Title,
                ProcessId = System.Diagnostics.Process.GetCurrentProcess().Id,
                Pipe = options.Pipe,
                StartedAt = DateTimeOffset.Now,
            }.ToJson();
            var temporary = path + ".tmp";
            File.WriteAllText(temporary, text, new UTF8Encoding(false));
            if (File.Exists(path)) File.Delete(path);
            File.Move(temporary, path);
        }

        /// <summary>
        /// The pipe a pane attaches through: open to this Windows user only,
        /// listening again as soon as a pane connects, and typing to the
        /// engine for the one pane that holds its seat.
        /// </summary>
        private sealed class Host
        {
            private readonly HostOptions options;
            private readonly EngineSeat seat = new EngineSeat();
            private PseudoConsole? engine;
            // The pane that holds the seat, read by the engine's output thread.
            private volatile Pane? pane;

            public Host(HostOptions options)
            {
                this.options = options;
            }

            public void Serve(PseudoConsole engine)
            {
                this.engine = engine;
                columns = options.Columns;
                rows = options.Rows;
                new Thread(Listen) { IsBackground = true, Name = "Dabbler engine pipe" }.Start();
                new Thread(WatchForAbandonment) { IsBackground = true, Name = "Dabbler engine idle" }.Start();
            }

            // What the engine printed last, replayed to a pane that attaches:
            // both engines draw full-screen, so the tail redraws the screen,
            // and trimmed by half its size at a time rather than on every write.
            private const int KeptChars = 1 << 20;
            private readonly object outputGate = new object();
            private readonly StringBuilder kept = new StringBuilder();

            // The private modes (alternate screen, bracketed paste, mouse) set in
            // what was trimmed: an engine sets them once, and a new terminal
            // replaying only the tail would not have them.
            private static readonly Regex PrivateMode = new Regex(@"\x1b\[\?([0-9;]+)([hl])");
            private readonly Dictionary<string, string> trimmedModes = new Dictionary<string, string>();
            private int columns;
            private int rows;

            // An engine that has printed nothing and had no pane for this long is left behind: it ends, and its host with it.
            private static readonly TimeSpan Abandoned = TimeSpan.FromHours(24);
            private long lastSign = DateTime.UtcNow.Ticks;

            private void Sign() => Interlocked.Exchange(ref lastSign, DateTime.UtcNow.Ticks);

            private void WatchForAbandonment()
            {
                while (true)
                {
                    Thread.Sleep(TimeSpan.FromMinutes(1));
                    if (seat.Held) continue;
                    if (DateTime.UtcNow - new DateTime(Interlocked.Read(ref lastSign), DateTimeKind.Utc) < Abandoned) continue;
                    // The console's close ends the engine, and its exit ends this host.
                    engine?.Dispose();
                    return;
                }
            }

            public void OnOutput(string text)
            {
                Sign();
                lock (outputGate)
                {
                    kept.Append(text);
                    if (kept.Length > 2 * KeptChars)
                    {
                        var trimmed = kept.ToString(0, kept.Length - KeptChars);
                        foreach (Match mode in PrivateMode.Matches(trimmed))
                        {
                            foreach (var number in mode.Groups[1].Value.Split(';')) trimmedModes[number] = mode.Groups[2].Value;
                        }
                        kept.Remove(0, trimmed.Length);
                    }
                    pane?.Send(EngineMessage.Output(text));
                }
            }

            /// <summary>The screen as the engine last drew it, for a terminal that has drawn nothing.</summary>
            private string Replay()
            {
                var modes = string.Concat(trimmedModes.Select(mode => $"\x1b[?{mode.Key}{mode.Value}"));
                return modes + kept;
            }

            public void OnExit(int code)
            {
                pane?.Send(EngineMessage.Exited(code));
            }

            private void Listen()
            {
                var security = new PipeSecurity();
                security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
                while (true)
                {
                    NamedPipeServerStream stream;
                    try
                    {
                        stream = new NamedPipeServerStream(options.Pipe, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 0, 0, security);
                        stream.WaitForConnection();
                    }
                    catch (IOException)
                    {
                        Thread.Sleep(500);
                        continue;
                    }
                    var connected = new Pane(stream);
                    new Thread(() => Talk(connected)) { IsBackground = true, Name = "Dabbler engine pane" }.Start();
                }
            }

            /// <summary>One pane's connection: attach first, then its keys and sizes, until it goes.</summary>
            private void Talk(Pane connected)
            {
                try
                {
                    var first = connected.Read();
                    if (first?.Kind != EngineMessageKind.Attach) return;
                    if (!seat.TryTake(connected))
                    {
                        connected.Send(EngineMessage.Refused("This engine is open in another Visual Studio window."));
                        return;
                    }
                    lock (outputGate)
                    {
                        connected.Send(EngineMessage.Attached(options.Folder, options.Title));
                        // Under the output's lock: nothing printed meanwhile is lost or given twice.
                        if (kept.Length > 0) connected.Send(EngineMessage.Output(Replay()));
                        pane = connected;
                    }
                    // A pane of another size has the engine draw again at that size.
                    if (first.Columns != columns || first.Rows != rows) Resize(first);
                    while (connected.Read() is EngineMessage message)
                    {
                        if (!seat.MayType(connected)) break;
                        switch (message.Kind)
                        {
                            case EngineMessageKind.Input:
                                engine?.Write(message.Text ?? "");
                                break;
                            case EngineMessageKind.Size:
                                Resize(message);
                                break;
                            case EngineMessageKind.End:
                                // The console's close ends the engine, and its exit ends this host.
                                engine?.Dispose();
                                break;
                        }
                    }
                }
                catch (Exception error) when (error is IOException || error is FormatException || error is ObjectDisposedException)
                {
                    // A broken pipe or a line that is not a message: the pane has gone.
                }
                finally
                {
                    if (ReferenceEquals(pane, connected))
                    {
                        pane = null;
                        // The idle time is counted from the pane leaving, not from before it came.
                        Sign();
                    }
                    seat.Leave(connected);
                    connected.Dispose();
                }
            }

            private void Resize(EngineMessage message)
            {
                if (!(message.Columns is int newColumns && message.Rows is int newRows && newColumns > 0 && newRows > 0)) return;
                engine?.Resize(newColumns, newRows);
                columns = newColumns;
                rows = newRows;
            }
        }

        /// <summary>One pane's end of the pipe; what is sent to it is sent whole, from any thread.</summary>
        private sealed class Pane : IDisposable
        {
            private readonly NamedPipeServerStream stream;
            private readonly StreamReader reader;
            private readonly StreamWriter writer;

            public Pane(NamedPipeServerStream stream)
            {
                this.stream = stream;
                var utf8 = new UTF8Encoding(false);
                reader = new StreamReader(stream, utf8);
                writer = new StreamWriter(stream, utf8);
            }

            public EngineMessage? Read() => EngineMessages.Read(reader);

            public void Send(EngineMessage message)
            {
                lock (writer)
                {
                    try
                    {
                        EngineMessages.Write(writer, message);
                    }
                    catch (Exception error) when (error is IOException || error is ObjectDisposedException)
                    {
                        // The pane has gone; its reader sees it and leaves the seat.
                    }
                }
            }

            public void Dispose()
            {
                lock (writer)
                {
                    stream.Dispose();
                }
            }
        }

        private sealed class HostOptions
        {
            public string Folder = "";
            public string Title = "";
            public int Columns;
            public int Rows;
            public string Pipe = "";
            public string CommandLine = "";

            /// <summary>The options, or null where one is missing or the command line is not the one argument after <c>--</c>.</summary>
            public static HostOptions? Parse(string[] args)
            {
                var options = new HostOptions();
                for (var i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--")
                    {
                        if (i != args.Length - 2) return null;
                        options.CommandLine = args[i + 1];
                        break;
                    }
                    if (i + 1 >= args.Length) return null;
                    var value = args[++i];
                    switch (args[i - 1])
                    {
                        case "--folder": options.Folder = value; break;
                        case "--title": options.Title = value; break;
                        case "--pipe": options.Pipe = value; break;
                        case "--columns": int.TryParse(value, out options.Columns); break;
                        case "--rows": int.TryParse(value, out options.Rows); break;
                        default: return null;
                    }
                }
                var complete = options.Folder.Length > 0 && options.Pipe.Length > 0 && options.CommandLine.Length > 0 && options.Columns > 0 && options.Rows > 0;
                return complete ? options : null;
            }
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct StartupInfo
        {
            public int cb;
            public string? lpReserved;
            public string? lpDesktop;
            public string? lpTitle;
            public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2;
            public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInformation
        {
            public IntPtr hProcess, hThread;
            public int dwProcessId, dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessW(string? application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string? folder, ref StartupInfo startup, out ProcessInformation information);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);
    }
}
