"""Build only reviewed public files; exclude local credentials and runtime data."""
from pathlib import Path
import zipfile

from publication import PUBLIC_FILES, audit_archive, audit_publication


def build_package(root, public_files=PUBLIC_FILES):
    root = Path(root).resolve()
    report = audit_publication(root, public_files)
    if report['findings']:
        raise ValueError(f"Publication check failed: {report['findings']}")
    output = root / 'rental-notes.zip'
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for filename in sorted(public_files):
            archive.write(root / filename, filename)
    findings = audit_archive(output, public_files)
    if findings:
        output.unlink()
        raise ValueError(f'Archive check failed: {findings}')
    return output


if __name__ == '__main__':
    output = build_package(Path(__file__).resolve().parent)
    print(f'{output} ({output.stat().st_size:,} bytes, {len(PUBLIC_FILES)} files)')
