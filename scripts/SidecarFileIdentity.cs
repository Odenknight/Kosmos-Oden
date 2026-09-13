using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Security.AccessControl;
using System.Security.Principal;
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

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("advapi32.dll")]
    private static extern uint GetSecurityInfo(SafeFileHandle handle, int type, uint fields,
        out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll")]
    private static extern uint SetSecurityInfo(SafeFileHandle handle, int type, uint fields,
        IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetSecurityDescriptorOwner(IntPtr descriptor, out IntPtr owner, out bool defaulted);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetSecurityDescriptorDacl(IntPtr descriptor, out bool present, out IntPtr dacl, out bool defaulted);
    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        public int Length;
        public IntPtr Descriptor;
        public int InheritHandle;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateDirectory(string path, ref SecurityAttributes attributes);

    // Caller must supply a host-owned state parent. Existing directories are
    // refused; this primitive neither migrates nor rewrites existing state.
    public static SafeFileHandle CreatePrivateDirectory(string path)
    {
        path = Path.GetFullPath(path);
        string parent = Path.GetDirectoryName(path), name = Path.GetFileName(path);
        if (String.IsNullOrEmpty(parent) || String.IsNullOrEmpty(name) || name.TrimEnd(' ', '.') != name ||
            name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) throw new IOException("Invalid new state directory");
        using (var anchor = OpenDirectory(parent)) {
            string sid = WindowsIdentity.GetCurrent().User.Value;
            var security = new RawSecurityDescriptor("O:" + sid + "D:P(A;OICI;FA;;;" + sid + ")");
            var bytes = new byte[security.BinaryLength]; security.GetBinaryForm(bytes, 0);
            IntPtr descriptor = Marshal.AllocHGlobal(bytes.Length);
            try {
                Marshal.Copy(bytes, 0, descriptor, bytes.Length);
                var attributes = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = descriptor, InheritHandle = 0 };
                if (!CreateDirectory(path, ref attributes)) throw new Win32Exception();
            } finally { Marshal.FreeHGlobal(descriptor); }
            return OpenDirectory(path);
        }
    }

    public static SafeFileHandle OpenDirectory(string path)
    {
        // READ_CONTROL | WRITE_DAC | WRITE_OWNER | FILE_READ_ATTRIBUTES | FILE_LIST_DIRECTORY,
        // read sharing only; open the reparse point itself, never its target.
        var handle = CreateFile(path, 0xE0081, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (handle.IsInvalid) { int error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(error); }
        try { ValidateHandle(handle, path, true); return handle; }
        catch { handle.Dispose(); throw; }
    }

    public static DirectorySecurity ReadDirectoryAcl(SafeFileHandle handle)
    {
        IntPtr owner, group, dacl, sacl, descriptor;
        uint error = GetSecurityInfo(handle, 1, 5, out owner, out group, out dacl, out sacl, out descriptor);
        if (error != 0) throw new Win32Exception((int)error);
        try {
            uint length = GetSecurityDescriptorLength(descriptor);
            if (length == 0 || length > 65536) throw new IOException("Invalid directory security descriptor");
            var bytes = new byte[length]; Marshal.Copy(descriptor, bytes, 0, (int)length);
            var security = new DirectorySecurity();
            security.SetSecurityDescriptorBinaryForm(bytes, AccessControlSections.Owner | AccessControlSections.Access);
            return security;
        } finally { LocalFree(descriptor); }
    }

    public static void WriteDirectoryAcl(SafeFileHandle handle, DirectorySecurity security)
    {
        var bytes = security.GetSecurityDescriptorBinaryForm();
        IntPtr descriptor = Marshal.AllocHGlobal(bytes.Length);
        try {
            Marshal.Copy(bytes, 0, descriptor, bytes.Length);
            IntPtr owner, dacl; bool present, defaulted;
            if (!GetSecurityDescriptorOwner(descriptor, out owner, out defaulted) ||
                !GetSecurityDescriptorDacl(descriptor, out present, out dacl, out defaulted)) throw new Win32Exception();
            if (owner == IntPtr.Zero || !present || dacl == IntPtr.Zero) throw new IOException("Refusing an absent owner or DACL");
            uint error = SetSecurityInfo(handle, 1, 0x80000005, owner, IntPtr.Zero, dacl, IntPtr.Zero);
            if (error != 0) throw new Win32Exception((int)error);
        } finally { Marshal.FreeHGlobal(descriptor); }
    }

    private static string Normalize(string path)
    {
        if (path.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) return @"\\" + path.Substring(8);
        if (path.StartsWith(@"\\?\", StringComparison.Ordinal)) return path.Substring(4);
        return path;
    }

    public static void Validate(FileStream stream, string expectedPath)
    {
        ValidateHandle(stream.SafeFileHandle, expectedPath, false);
    }

    private static void ValidateHandle(SafeFileHandle handle, string expectedPath, bool directory)
    {
        FileInformation information;
        if (!GetFileInformationByHandle(handle, out information)) throw new Win32Exception();
        if ((information.Attributes & 0x400) != 0 || ((information.Attributes & 0x10) != 0) != directory || (!directory && information.Links != 1))
            throw new IOException("Opened sidecar leaf is not a single-link regular file");
        var path = new StringBuilder(32768);
        uint length = GetFinalPathNameByHandle(handle, path, (uint)path.Capacity, 0);
        if (length == 0) throw new Win32Exception();
        if (length >= path.Capacity || !String.Equals(Normalize(path.ToString()),
            Normalize(Path.GetFullPath(expectedPath)), StringComparison.OrdinalIgnoreCase))
            throw new IOException("Opened sidecar leaf path does not match");
    }
}
