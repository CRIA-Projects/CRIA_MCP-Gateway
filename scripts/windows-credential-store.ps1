param(
  [ValidateSet('read','write','delete')][string]$Action,
  [string]$Target
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CriaVault {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
    public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Write(ref Credential value, UInt32 flags);
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Read(string target, UInt32 type, UInt32 flags, out IntPtr value);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Delete(string target, UInt32 type, UInt32 flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr value);
  public static void Put(string target, string secret) {
    byte[] bytes = Encoding.Unicode.GetBytes(secret);
    IntPtr memory = Marshal.AllocHGlobal(bytes.Length);
    try {
      Marshal.Copy(bytes,0,memory,bytes.Length);
      Credential c = new Credential { Type=1, TargetName=target, UserName="CRIA", CredentialBlobSize=(UInt32)bytes.Length, CredentialBlob=memory, Persist=2 };
      if (!Write(ref c,0)) throw new Exception("Credential write failed");
    } finally {
      for(int i=0;i<bytes.Length;i++) Marshal.WriteByte(memory,i,0);
      Marshal.FreeHGlobal(memory); Array.Clear(bytes,0,bytes.Length);
    }
  }
  public static string Get(string target) {
    IntPtr pointer;
    if (!Read(target,1,0,out pointer)) throw new Exception("Credential missing");
    try { Credential c=(Credential)Marshal.PtrToStructure(pointer,typeof(Credential)); return Marshal.PtrToStringUni(c.CredentialBlob,(int)c.CredentialBlobSize/2); }
    finally { CredFree(pointer); }
  }
  public static void Remove(string target) { if(!Delete(target,1,0)) throw new Exception("Credential delete failed"); }
}
'@
try {
  if ($Action -eq 'write') {
    $secret = [Console]::ReadLine()
    if ($secret -notmatch '^cria_[a-f0-9]{64}$') { throw 'Invalid credential' }
    [CriaVault]::Put($Target, $secret)
    $secret = $null
  } elseif ($Action -eq 'read') { [Console]::Write([CriaVault]::Get($Target)) }
  else { [CriaVault]::Remove($Target) }
} catch { [Console]::Error.WriteLine('Windows credential store operation failed'); exit 1 }
