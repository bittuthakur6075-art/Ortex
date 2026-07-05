# Rule: Automatically Update CLAUDE.md

AI agents MUST check and update the `CLAUDE.md` file in the workspace root at the end of any task or sequence of edits.

## Guidelines:
1. **When to Update**:
   - Added new pages, modules, or features.
   - Added/changed dependencies or runtime configurations.
   - Changed local development commands.
   - Shifted architectural paradigms (e.g. database schema, auth rules).
2. **Maintenance**:
   - Ensure the structure maps all active subprojects (`Ortex.Web`, `Ortex.Admin`, etc.) and their respective setup steps accurately.
3. **Commit Behavior**:
   - Modifications to `CLAUDE.md` should be staged and committed together with the code changes.
