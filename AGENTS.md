# Project instructions

- Read `HANDOFF.md` and `README.md` before changing behavior. The UI and user-facing communication are Chinese.
- This is a personal rental-viewing notebook. QQ/GPT integration is not implemented and is not part of the existing application.
- Continue shared application development and server deployment work on `main`; do not create a separate server branch unless the user explicitly requests one. Keep the existing GitHub Pages site browser-local by default with JSON export/import. A backend may be selected explicitly through an HTTPS address in the URL fragment; confirm the target before sending credentials or requests. Never embed a real deployment address in public files. Preserve separate drafts and sessions for each backend and for local mode. Reuse the same frontend and existing Flask/SQLite backend for the server deployment; do not remove Pages.
- Use the existing dependency-free web frontend and Flask/SQLite backend. Node is for local model tests only; the Ubuntu runtime does not need Node or Docker.
- Preserve browser drafts, JSON backup compatibility, optimistic concurrency and conflict copies. Never silently turn unknown/other answers into passes or failures.
- Guide descriptions stay expanded. Check notes stay hidden until “其他” is selected. History suggestions come from the same check across recorded homes; filled text remains editable.
- Test UI changes through browser-specific controls that do not move the user's Windows mouse. Use an isolated test origin rather than modifying actual records. Reset temporary viewport overrides.
- Keep the preview origin `http://127.0.0.1:8766` when restarting a local preview; browser data is tied to its origin.
- Run appropriate checks: `node --test tests/model.test.js`, virtualenv Python `-m unittest discover -s tests -v`, and `python publication.py`.
- `python package.py` builds only the explicit manifest in `publication.py` and checks it for sensitive content. Add newly intended public files to that manifest.
- Runtime data, credentials, database backups, environment files, screenshots and machine-specific artifacts must not be committed or published. Never put private configuration inside `web/` because Pages publishes that directory.
- Keep the local Workbench installation and configuration: the user explicitly retained it for backend publishing and maintenance. Prefer Workbench CLI for remote operations once the user has configured its credentials; local OpenSSH with a host alias remains a fallback. Keep actual cloud/SSH connection settings, private keys, authentication material and private deployment notes outside the repository. The user handles interactive credential configuration and SSH host-key verification when applicable. Never print credential contents.
- Deployment scripts are templates. Confirm actual server state before changing it; preserve unrelated services.
