using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Dabbler.EngineHost
{
    /// <summary>
    /// One program running in a Windows pseudo console (ConPTY): what it
    /// draws comes out as text, keystrokes go in as text, and it is told its
    /// size. It lives in this process and ends with it.
    /// </summary>
    internal sealed class PseudoConsole : IDisposable
    {
        private const uint ExtendedStartupInfoPresent = 0x00080000;
        private const uint CreateUnicodeEnvironment = 0x00000400;
        private const int StartfUseStdHandles = 0x00000100;
        private static readonly IntPtr ProcThreadAttributePseudoConsole = (IntPtr)0x00020016;

        private readonly object gate = new object();
        private readonly FileStream input;
        private readonly FileStream output;
        private readonly SafeWaitHandle? process;
        private IntPtr console;
        private IntPtr attributes;
        private bool disposed;
        private Thread? reader;

        // How long the exit waits for the last of the output once the console is closed.
        private static readonly TimeSpan LastOutput = TimeSpan.FromSeconds(5);

        /// <summary>
        /// Starts <paramref name="commandLine"/> in <paramref name="folder"/>
        /// with exactly <paramref name="environment"/>, in a pseudo console of
        /// <paramref name="columns"/> by <paramref name="rows"/>.
        /// <paramref name="onOutput"/> and <paramref name="onExit"/> are called
        /// on a thread of the console's own.
        /// </summary>
        public PseudoConsole(string commandLine, string folder, IReadOnlyDictionary<string, string> environment, int columns, int rows, Action<string> onOutput, Action<int> onExit)
        {
            if (!CreatePipe(out var inputRead, out var inputWrite, IntPtr.Zero, 0)) throw new Win32Exception();
            if (!CreatePipe(out var outputRead, out var outputWrite, IntPtr.Zero, 0)) throw new Win32Exception();
            var result = CreatePseudoConsole(new Coord(columns, rows), inputRead, outputWrite, 0, out console);
            // The console holds its own ends; ours close so the output ends when it does.
            inputRead.Dispose();
            outputWrite.Dispose();
            if (result != 0)
            {
                inputWrite.Dispose();
                outputRead.Dispose();
                throw new Win32Exception(result);
            }
            input = new FileStream(inputWrite, FileAccess.Write);
            output = new FileStream(outputRead, FileAccess.Read);

            var size = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
            attributes = Marshal.AllocHGlobal(size);
            if (!InitializeProcThreadAttributeList(attributes, 1, 0, ref size)) throw new Win32Exception();
            if (!UpdateProcThreadAttribute(attributes, 0, ProcThreadAttributePseudoConsole, console, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) throw new Win32Exception();

            var startup = new StartupInfoEx();
            startup.StartupInfo.cb = Marshal.SizeOf<StartupInfoEx>();
            // No standard handles of Visual Studio's: the program's are the console's.
            startup.StartupInfo.dwFlags = StartfUseStdHandles;
            startup.lpAttributeList = attributes;
            var block = EnvironmentBlock(environment);
            if (!CreateProcessW(null, new StringBuilder(commandLine), IntPtr.Zero, IntPtr.Zero, false, ExtendedStartupInfoPresent | CreateUnicodeEnvironment, block, folder, ref startup, out var info))
            {
                var error = new Win32Exception();
                // No reader has started, so nothing else will close the output.
                output.Dispose();
                Dispose();
                throw error;
            }
            CloseHandle(info.hThread);
            process = new SafeWaitHandle(info.hProcess, true);

            reader = new Thread(() => Read(onOutput)) { IsBackground = true, Name = "Dabbler engine output" };
            reader.Start();
            new Thread(() => Wait(onExit)) { IsBackground = true, Name = "Dabbler engine exit" }.Start();
        }

        /// <summary>Text typed at the program, as UTF-8.</summary>
        public void Write(string text)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            lock (gate)
            {
                if (disposed) return;
                try
                {
                    input.Write(bytes, 0, bytes.Length);
                    input.Flush();
                }
                catch (IOException)
                {
                    // The program has gone; its exit is said by the exit thread.
                }
            }
        }

        public void Resize(int columns, int rows)
        {
            lock (gate)
            {
                if (!disposed) ResizePseudoConsole(console, new Coord(columns, rows));
            }
        }

        /// <summary>Closes the console, which ends the program attached to it.</summary>
        public void Dispose()
        {
            lock (gate)
            {
                if (disposed) return;
                disposed = true;
            }
            if (console != IntPtr.Zero) ClosePseudoConsole(console);
            console = IntPtr.Zero;
            if (process != null && !process.IsClosed)
            {
                TerminateProcess(process, 1);
            }
            input?.Dispose();
            if (attributes != IntPtr.Zero)
            {
                DeleteProcThreadAttributeList(attributes);
                Marshal.FreeHGlobal(attributes);
                attributes = IntPtr.Zero;
            }
        }

        private void Read(Action<string> onOutput)
        {
            // One decoder for the whole stream: a character split across two reads is kept whole.
            var decoder = Encoding.UTF8.GetDecoder();
            var bytes = new byte[16384];
            var chars = new char[Encoding.UTF8.GetMaxCharCount(bytes.Length)];
            try
            {
                int read;
                while ((read = output.Read(bytes, 0, bytes.Length)) > 0)
                {
                    var count = decoder.GetChars(bytes, 0, read, chars, 0);
                    if (count > 0) onOutput(new string(chars, 0, count));
                }
            }
            catch (IOException)
            {
                // The console was closed.
            }
            catch (ObjectDisposedException)
            {
            }
            finally
            {
                output.Dispose();
            }
        }

        private void Wait(Action<int> onExit)
        {
            using (var waiter = new ManualResetEvent(false) { SafeWaitHandle = process! })
            {
                waiter.WaitOne();
                GetExitCodeProcess(process!, out var code);
                // A console whose program has gone still holds the output open until it is closed.
                lock (gate)
                {
                    if (!disposed && console != IntPtr.Zero)
                    {
                        ClosePseudoConsole(console);
                        console = IntPtr.Zero;
                    }
                }
                // What the program printed last, an error before it exits, is given before its exit is said.
                reader?.Join(LastOutput);
                onExit((int)code);
            }
        }

        /// <summary>The block CreateProcess takes: NAME=value pairs ordered by name, each ended by a NUL, and one more NUL.</summary>
        private static string EnvironmentBlock(IReadOnlyDictionary<string, string> environment)
        {
            var block = new StringBuilder();
            foreach (var pair in environment.OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase))
            {
                block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');
            }
            return block.Append('\0').ToString();
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct Coord
        {
            public short X;
            public short Y;

            public Coord(int columns, int rows)
            {
                X = (short)Math.Min(columns, short.MaxValue);
                Y = (short)Math.Min(rows, short.MaxValue);
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
        private struct StartupInfoEx
        {
            public StartupInfo StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInformation
        {
            public IntPtr hProcess, hThread;
            public int dwProcessId, dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CreatePipe(out SafeFileHandle read, out SafeFileHandle write, IntPtr attributes, int size);

        [DllImport("kernel32.dll")]
        private static extern int CreatePseudoConsole(Coord size, SafeFileHandle input, SafeFileHandle output, uint flags, out IntPtr console);

        [DllImport("kernel32.dll")]
        private static extern int ResizePseudoConsole(IntPtr console, Coord size);

        [DllImport("kernel32.dll")]
        private static extern void ClosePseudoConsole(IntPtr console);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returnSize);

        [DllImport("kernel32.dll")]
        private static extern void DeleteProcThreadAttributeList(IntPtr list);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessW(string? application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, string environment, string folder, ref StartupInfoEx startup, out ProcessInformation information);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateProcess(SafeWaitHandle process, uint code);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetExitCodeProcess(SafeWaitHandle process, out uint code);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);
    }
}
