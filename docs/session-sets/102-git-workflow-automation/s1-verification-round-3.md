VERIFIED

Fix verdict: L1 URL-encoded Azure DevOps project/repository names are decoded before CLI reuse and re-encoded exactly once for web URLs -- fix-accepted

The implementation decodes all parsed remote path segments without throwing on malformed escapes, and the tests substantiate decoded ADO coordinates plus absence of `%2520` double encoding.