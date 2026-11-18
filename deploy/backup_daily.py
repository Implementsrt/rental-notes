"""Keep the most recent 14 consistent daily DB backups."""
from contextlib import closing
from datetime import datetime, timezone
import os
from pathlib import Path
import sqlite3

data_dir = Path(os.environ.get('RENT_DATA_DIR', '/var/lib/rental-notes')).resolve()
backup_dir = data_dir / 'backups'
backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
output = backup_dir / ('rental-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f') + '.sqlite3')
source = data_dir / 'rental.sqlite3'
with closing(sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)) as src, closing(sqlite3.connect(output)) as dest:
    src.backup(dest)
if os.name != 'nt':
    output.chmod(0o600)
for old in sorted(backup_dir.glob('rental-*.sqlite3'), reverse=True)[14:]:
    if old.resolve().parent == backup_dir.resolve() and old.is_file() and not old.is_symlink():
        old.unlink()
print(f'Backup created: {output.name}')
