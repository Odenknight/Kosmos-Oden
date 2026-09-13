using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class SidecarFileIdentity
{
    [StructLayout(LayoutKind.Sequential)]
    private struct FileInformation
    {
        public uint Attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation information);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint length, uint flags);

    private static string Normalize(string path)
    {
        if (path.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) return @"\\" + path.Substring(8);
        if (path.StartsWith(@"\\?\", StringComparison.Ordinal)) return path.Substring(4);
        return path;
    }

    public static void Validate(FileStream stream, string expectedPath)
    {
        FileInformation information;
        if (!GetFileInformationByHandle(stream.SafeFileHandle, out information)) throw new Win32Exception();
        if ((information.Attributes & 0x410) != 0 || information.Links != 1)
            throw new IOException("Opened sidecar leaf is not a single-link regular file");
        var path = new StringBuilder(32768);
        uint length = GetFinalPathNameByHandle(stream.SafeFileHandle, path, (uint)path.Capacity, 0);
        if (length == 0) throw new Win32Exception();
        if (length >= path.Capacity || !String.Equals(Normalize(path.ToString()),
            Normalize(Path.GetFullPath(expectedPath)), StringComparison.OrdinalIgnoreCase))
            throw new IOException("Opened sidecar leaf path does not match");
    }
}
