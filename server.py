"""Personal rental notebook API. Run via Gunicorn on the Ubuntu server."""
from __future__ import annotations

import argparse
from contextlib import closing
import functools
import getpass
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import sqlite3
import time
import uuid

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent
WEB = ROOT / 'web'
CHECK_KINDS = {
    **dict.fromkeys(['orientation', 'closed_kitchen', 'balcony', 'utilities', 'natural_gas', 'furniture', 'appliances', 'washer', 'agency', 'dry', 'pressure', 'toilet', 'drain', 'signal', 'working'], 'hard'),
    **dict.fromkeys(['condition', 'ac_efficiency', 'bedroom_door', 'entry_door', 'door_lock', 'soundproof', 'kitchen_space', 'double_sink', 'balcony_clear', 'balcony_privacy', 'street_noise', 'neighbor_noise', 'gate', 'floor', 'entrance_gates', 'traffic_separation', 'ebike_access', 'property_fee', 'parking_fee', 'parking_position'], 'soft'),
    **dict.fromkeys(['authority', 'all_fees', 'deposit_terms', 'early_exit', 'renewal', 'repair_duty', 'entry_notice', 'repair_plan', 'repair_clean', 'unusable', 'temporary_stay', 'repeated_repair', 'handover'], 'contract'),
}
COST_IDS = ['rent', 'property', 'parking', 'internet', 'agency', 'cleanIn', 'cleanOut', 'deposit']
SCHEMA = '''
CREATE TABLE IF NOT EXISTS homes (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT,
 deleted INTEGER NOT NULL DEFAULT 0, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, attempted_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_by_ip ON login_attempts(ip, attempted_at);
'''


def valid_id(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value
    except (ValueError, TypeError, AttributeError):
        return False


def validate_home(raw, home_id):
    if not isinstance(raw, dict) or raw.get('id') != home_id:
        raise ValueError('房源 ID 不一致')
    home = {'id': home_id}
    for key in ['community', 'layout', 'bathrooms', 'name', 'address', 'link', 'contact', 'area', 'floor', 'visitDate', 'notes', 'updatedAt']:
        value = raw.get(key, '')
        limit = 10000 if key == 'notes' else 2000
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('文字字段格式或长度不正确')
        home[key] = value
    home['propertyFeeBasis'] = raw.get('propertyFeeBasis', 'monthly')
    if home['propertyFeeBasis'] not in ['area', 'monthly']:
        raise ValueError('物业费单位不正确')
    if raw.get('decision') not in ['pending', 'shortlist', 'eliminated', 'chosen']:
        raise ValueError('房源状态不正确')
    home['decision'] = raw['decision']
    costs = raw.get('costs', {})
    checks = raw.get('checks', {})
    if not isinstance(costs, dict) or not isinstance(checks, dict):
        raise ValueError('指标格式不正确')
    home['costs'] = {}
    for key in COST_IDS:
        value = costs.get(key)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1e8):
            raise ValueError('费用必须为空或非负金额')
        home['costs'][key] = value
    home['checks'] = {}
    for key, kind in CHECK_KINDS.items():
        if key not in checks:
            continue
        value = checks[key]
        allowed = ['unknown', 'good', 'average', 'poor', 'other'] if kind == 'soft' else ['unknown', 'pass', 'fail', 'other']
        if not isinstance(value, dict) or value.get('status') not in allowed or not isinstance(value.get('note', ''), str) or len(value.get('note', '')) > 3000:
            raise ValueError('检查结果格式不正确')
        home['checks'][key] = {'status': value['status'], 'note': value.get('note', '')}
    return home


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(DATA_DIR=os.environ.get('RENT_DATA_DIR', str(ROOT / 'data')),
                      ALLOWED_ORIGINS=[x.strip().rstrip('/') for x in os.environ.get('RENT_ALLOWED_ORIGINS', '').split(',') if x.strip()],
                      MAX_CONTENT_LENGTH=256 * 1024, SESSION_SECONDS=7 * 24 * 3600,
                      ADMIN_HASH=None)
    if test_config:
        app.config.update(test_config)
    data_dir = Path(app.config['DATA_DIR'])
    data_dir.mkdir(parents=True, exist_ok=True)
    app.config['DB_PATH'] = str(data_dir / 'rental.sqlite3')
    auth_file = data_dir / 'admin.json'
    if app.config['ADMIN_HASH'] is None and auth_file.exists():
        app.config['ADMIN_HASH'] = json.loads(auth_file.read_text(encoding='utf-8'))['password_hash']
    with closing(sqlite3.connect(app.config['DB_PATH'])) as con:
        con.execute('PRAGMA journal_mode=WAL')
        con.executescript(SCHEMA)
    if os.environ.get('RENT_TRUST_PROXY') == '1':
        # Production service listens on loopback; trust exactly the local proxy.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    def db():
        if 'db' not in g:
            g.db = sqlite3.connect(app.config['DB_PATH'], timeout=10)
            g.db.row_factory = sqlite3.Row
        return g.db

    @app.teardown_appcontext
    def close_db(_error):
        if 'db' in g:
            g.db.close()

    def origin_allowed(origin):
        return origin == request.host_url.rstrip('/') or origin in app.config['ALLOWED_ORIGINS']

    @app.before_request
    def origin_gate():
        if request.path.startswith('/api/'):
            origin = request.headers.get('Origin')
            if origin and not origin_allowed(origin):
                return jsonify(error='该页面地址未获服务器允许'), 403
            if request.method == 'OPTIONS':
                return '', 204

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Frame-Options'] = 'DENY'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
            origin = request.headers.get('Origin')
            if origin and origin_allowed(origin):
                response.headers['Access-Control-Allow-Origin'] = origin
                response.headers['Vary'] = 'Origin'
                response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
                response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS'
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    def require_login(fn):
        @functools.wraps(fn)
        def wrapped(*args, **kwargs):
            auth = request.headers.get('Authorization', '')
            token = auth[7:] if auth.startswith('Bearer ') else ''
            digest = hashlib.sha256(token.encode()).hexdigest()
            session = db().execute('SELECT expires FROM sessions WHERE token_hash=?', (digest,)).fetchone()
            if not token or not session or session['expires'] <= time.time():
                return jsonify(error='请登录后同步'), 401
            g.token_hash = digest
            return fn(*args, **kwargs)
        return wrapped

    @app.get('/api/health')
    def health():
        return jsonify(ok=True, authenticationConfigured=bool(app.config['ADMIN_HASH']))

    @app.post('/api/login')
    def login():
        if not app.config['ADMIN_HASH']:
            return jsonify(error='服务器尚未设置登录密码'), 503
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get('password'), str) or len(payload['password']) > 1024:
            return jsonify(error='请填写登录密码'), 400
        now, ip = time.time(), request.remote_addr or 'unknown'
        con = db()
        # Reserve a rate-limit slot before checking the hash, including concurrent requests.
        with con:
            con.execute('BEGIN IMMEDIATE')
            con.execute('DELETE FROM login_attempts WHERE attempted_at < ?', (now - 600,))
            attempts = con.execute('SELECT count(*) FROM login_attempts WHERE ip=?', (ip,)).fetchone()[0]
            if attempts >= 10:
                return jsonify(error='尝试次数过多，请10分钟后重试'), 429
            con.execute('INSERT INTO login_attempts VALUES (?, ?)', (ip, now))
        if not check_password_hash(app.config['ADMIN_HASH'], payload['password']):
            return jsonify(error='密码不正确'), 401
        token = secrets.token_urlsafe(40)
        with con:
            con.execute('DELETE FROM sessions WHERE expires < ?', (now,))
            con.execute('INSERT INTO sessions VALUES (?, ?)', (hashlib.sha256(token.encode()).hexdigest(), now + app.config['SESSION_SECONDS']))
        return jsonify(token=token)

    @app.post('/api/logout')
    @require_login
    def logout():
        with db() as con:
            con.execute('DELETE FROM sessions WHERE token_hash=?', (g.token_hash,))
        return jsonify(ok=True)

    def record(row):
        return {'id': row['id'], 'revision': row['revision'], 'deleted': bool(row['deleted']), 'data': json.loads(row['data']) if row['data'] else None, 'modifiedAt':int(row['updated_at'] * 1000)}

    @app.get('/api/homes')
    @require_login
    def list_homes():
        return jsonify(items=[record(row) for row in db().execute('SELECT * FROM homes ORDER BY id')])

    @app.put('/api/homes/<home_id>')
    @require_login
    def put_home(home_id):
        payload = request.get_json(silent=True)
        if not valid_id(home_id) or not isinstance(payload, dict):
            return jsonify(error='房源格式不正确'), 400
        revision, deleted = payload.get('revision'), payload.get('deleted', False)
        if type(revision) is not int or revision < 0 or type(deleted) is not bool:
            return jsonify(error='版本信息不正确'), 400
        try:
            home = None if deleted else validate_home(payload.get('data'), home_id)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        con = db()
        with con:
            con.execute('BEGIN IMMEDIATE')
            old = con.execute('SELECT * FROM homes WHERE id=?', (home_id,)).fetchone()
            if (old['revision'] if old else 0) != revision:
                return jsonify(error='其他设备已修改这套房源，请重新同步', current=record(old) if old else None), 409
            next_revision = revision + 1
            con.execute('INSERT INTO homes VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, data=excluded.data, deleted=excluded.deleted, updated_at=excluded.updated_at',
                        (home_id, next_revision, json.dumps(home, ensure_ascii=False, allow_nan=False) if home else None, int(deleted), time.time()))
        return jsonify(id=home_id, revision=next_revision, deleted=deleted), 200 if old else 201

    @app.get('/config.js')
    def runtime_config():
        return 'window.RENT_CONFIG = {apiBase: ""};\n', 200, {'Content-Type': 'application/javascript', 'Cache-Control': 'no-store'}

    @app.get('/')
    @app.get('/<path:filename>')
    def frontend(filename='index.html'):
        if filename not in {'index.html', 'app.js', 'app.css', 'model.js', 'store.js', 'checklist.js', 'connection.js', 'icon.svg'}:
            return jsonify(error='Not found'), 404
        return send_from_directory(WEB, filename)

    return app


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('init-admin', help='Set or reset the private login password')
    serve = sub.add_parser('serve', help='Local development preview only')
    serve.add_argument('--port', type=int, default=8765)
    backup = sub.add_parser('backup', help='Consistent SQLite backup, including active WAL data')
    backup.add_argument('--output', required=True)
    args = parser.parse_args()
    data_dir = Path(os.environ.get('RENT_DATA_DIR', ROOT / 'data'))
    if args.command == 'init-admin':
        password = getpass.getpass('Set password (at least 12 characters): ')
        if len(password) < 12 or password != getpass.getpass('Repeat password: '):
            raise SystemExit('Passwords must match and be at least 12 characters.')
        data_dir.mkdir(parents=True, exist_ok=True)
        auth_file = data_dir / 'admin.json'
        auth_file.write_text(json.dumps({'password_hash': generate_password_hash(password)}), encoding='utf-8')
        if os.name != 'nt':
            auth_file.chmod(0o600)
        app = create_app()
        with closing(sqlite3.connect(app.config['DB_PATH'])) as con:
            with con:
                con.execute('DELETE FROM sessions')
        print('Password saved. Restart the service if it is already running.')
    elif args.command == 'backup':
        output = Path(args.output).resolve()
        source = (data_dir / 'rental.sqlite3').resolve()
        if output == source or output.exists():
            raise SystemExit('Choose a new backup filename.')
        output.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)) as src, closing(sqlite3.connect(output)) as dest:
            src.backup(dest)
        if os.name != 'nt':
            output.chmod(0o600)
        print(f'Backup created: {output}')
    else:
        create_app().run(host='127.0.0.1', port=args.port, debug=False)


if __name__ == '__main__':
    main()
