"""Review the explicit publication manifest without printing secret values."""
from __future__ import annotations

import fnmatch
import json
from pathlib import Path
import re
import zipfile

PUBLIC_FILES = (
    '.gitattributes', '.gitignore', '.github/workflows/pages.yml', 'AGENTS.md', 'HANDOFF.md',
    'PUBLICATION_REVIEW.md', 'README.md', 'package.json', 'package.py',
    'publication.py', 'requirements.txt', 'server.py',
    'deploy/backup_daily.py', 'deploy/install.sh', 'deploy/nginx.example.conf',
    'deploy/rental-notes-backup.service', 'deploy/rental-notes-backup.timer',
    'deploy/rental-notes.service', 'deploy/windows-install.ps1',
    'tests/model.test.js', 'tests/test_api.py', 'tests/test_publication.py',
    'web/app.css', 'web/app.js', 'web/checklist.js', 'web/config.js', 'web/connection.js',
    'web/icon.svg', 'web/index.html', 'web/model.js', 'web/store.js',
)
PRIVATE_DIRS = {'.git', '.venv', '__pycache__', 'data', 'test-results',
                '.ssh', 'backups', 'logs', '.vscode', '.idea'}
LOCAL_PATTERNS = ('.env', '.env.*', '*.pyc', '*.sqlite*', '*.db', '*.db-*',
                  '*.zip', '*.log', '*.bak', '*.pem', '*.key', 'admin.json',
                  '.DS_Store', 'Thumbs.db')
PATTERNS = {
    'openai_style_key': re.compile(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}'),
    'aws_access_key': re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
    'aliyun_access_key': re.compile(r'\bLTAI[A-Za-z0-9]{12,}\b'),
    'github_token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})'),
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'embedded_credential': re.compile(r'''(?i)\b(?:password|api_key|app_secret|access_token)\s*[:=]\s*['"][^'"\r\n]{8,}['"]'''),
    'url_credential': re.compile(r'https?://[^/\s:@]+:[^/\s@]+@'),
    'personal_windows_path': re.compile(r'(?i)\b[A-Z]:[\\/]Users[\\/][^\s/\\]+'),
    'possible_mobile_number': re.compile(r'(?<!\d)(?:\+86[- ]?)?1[3-9]\d{9}(?!\d)'),
}


def scan_text(text, filename):
    """Return locations and categories only, never matched credential strings."""
    return [dict(file=filename, line=text.count('\n', 0, match.start()) + 1, kind=kind)
            for kind, pattern in PATTERNS.items() for match in pattern.finditer(text)]


def local_only(path):
    # Every Pages asset must be reviewed, including hidden files and folders.
    if path.parts and path.parts[0] == 'web':
        return False
    if path.name == '.env.example':
        return False
    if any(part in PRIVATE_DIRS for part in path.parts):
        return True
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in LOCAL_PATTERNS)


def audit_publication(root, public_files=PUBLIC_FILES):
    root = Path(root).resolve()
    expected = set(public_files)
    findings = []
    for filename in public_files:
        path = root / filename
        if not path.is_file():
            findings.append(dict(file=filename, kind='missing_file'))
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            findings.append(dict(file=filename, kind='linked_file'))
            continue
        try:
            findings.extend(scan_text(path.read_text(encoding='utf-8-sig'), filename))
        except UnicodeError:
            findings.append(dict(file=filename, kind='unexpected_binary'))
    def walk(folder):
        for path in folder.iterdir():
            relative = path.relative_to(root)
            if local_only(relative):
                continue
            if path.is_symlink():
                if relative.as_posix() not in expected:
                    findings.append(dict(file=relative.as_posix(), kind='unreviewed_link'))
            elif path.is_dir():
                walk(path)
            elif path.is_file() and relative.as_posix() not in expected:
                findings.append(dict(file=relative.as_posix(), kind='unreviewed_file'))
    walk(root)
    return dict(files_scanned=len(public_files), findings=findings)


def audit_archive(filename, public_files=PUBLIC_FILES):
    findings = []
    with zipfile.ZipFile(filename) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or set(names) != set(public_files):
            findings.append(dict(file=Path(filename).name, kind='archive_manifest_mismatch'))
        for name in names:
            try:
                findings.extend(scan_text(archive.read(name).decode('utf-8-sig'), name))
            except UnicodeError:
                findings.append(dict(file=name, kind='unexpected_binary'))
    return findings


if __name__ == '__main__':
    report = audit_publication(Path(__file__).resolve().parent)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(bool(report['findings']))
