# Project instructions

- Read `HANDOFF.md` and `README.md` before changing behavior. The UI and user-facing communication are Chinese.
- This is a personal rental-viewing notebook. QQ/GPT integration is not implemented and is not part of the existing application.
- Keep `main` and its existing GitHub Pages site as a browser-local tool with JSON export/import. Pages must not connect to a server API. The user will create a separate branch for future server build/deployment work; do not begin that work or remove Pages as part of maintaining `main`.
- Use the existing dependency-free web frontend and Flask/SQLite backend. Node is for local model tests only; the Ubuntu runtime does not need Node or Docker.
- Preserve browser drafts, JSON backup compatibility, optimistic concurrency and conflict copies. Never silently turn unknown/other answers into passes or failures.
- Guide descriptions stay expanded. Check notes stay hidden until “其他” is selected. History suggestions come from the same check across recorded homes; filled text remains editable.
- Test UI changes through browser-specific controls that do not move the user's Windows mouse. Use an isolated test origin rather than modifying actual records. Reset temporary viewport overrides.
- Keep the preview origin `http://127.0.0.1:8766` when restarting a local preview; browser data is tied to its origin.
- Run appropriate checks: `node --test tests/model.test.js`, virtualenv Python `-m unittest discover -s tests -v`, and `python publication.py`.
- `python package.py` builds only the explicit manifest in `publication.py` and checks it for sensitive content. Add newly intended public files to that manifest.
- Runtime data, credentials, database backups, environment files, screenshots and machine-specific artifacts must not be committed or published. Never put private configuration inside `web/` because Pages publishes that directory.
- Deployment scripts are templates. Confirm actual server state before changing it; preserve unrelated services.
