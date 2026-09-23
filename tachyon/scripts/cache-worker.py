#!/usr/bin/env python3
"""Prefetch a bounded Gmail INBOX cache through Tachyon's authenticated API."""

import hashlib
import http.cookiejar
import json
import os
import pathlib
import tempfile
import time
import urllib.request


OPTIONS = pathlib.Path('/data/options.json')
CACHE_ROOT = pathlib.Path('/data/tachyon/ha-message-cache')
BASE_URL = 'http://127.0.0.1:8888/'
INTERVAL_SECONDS = 300
MESSAGE_LIMIT = 50
MAX_MESSAGE_BYTES = 2_000_000
WEB_UID = 82


class TachyonApi:
    def __init__(self, base_url=BASE_URL):
        self.base_url = base_url
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = ''

    def request(self, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode('utf-8')
        headers = {'Accept': 'application/json'}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        if self.token:
            headers['X-SM-Token'] = self.token
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers)
        with self.opener.open(request, timeout=45) as response:
            result = json.load(response)
        if not isinstance(result, dict) or result.get('Result') is False:
            raise RuntimeError('Tachyon returned an unsuccessful response')
        return result

    def login(self, email, password):
        app_data = self.request('?/AppData/0/ha-cache/')
        self.token = app_data.get('System', {}).get('token', '')
        if not self.token:
            raise RuntimeError('Tachyon did not supply a login token')
        self.request('?/Json/', {
            'Action': 'Login', 'Email': email, 'Password': password, 'signMe': 0
        })
        app_data = self.request('?/AppData/0/ha-cache-authenticated/')
        self.token = app_data.get('System', {}).get('token', '')
        if not self.token:
            raise RuntimeError('Tachyon did not supply an authenticated token')

    def logout(self):
        if self.token:
            try:
                self.request('?/Json/', {'Action': 'Logout'})
            except Exception:
                pass


def cache_dir(email):
    digest = hashlib.sha256(email.lower().encode('utf-8')).hexdigest()
    return CACHE_ROOT / digest


def grant_web_read(path):
    if hasattr(os, 'geteuid') and os.geteuid() == 0:
        os.chown(path, WEB_UID, WEB_UID)


def atomic_json(path, value):
    encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(encoded) > MAX_MESSAGE_BYTES:
        return False
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.message-', delete=False) as temp:
        temp_path = pathlib.Path(temp.name)
        try:
            temp.write(encoded)
            temp.flush()
            os.fsync(temp.fileno())
            os.chmod(temp_path, 0o640)
            grant_web_read(temp_path)
        except BaseException:
            temp_path.unlink(missing_ok=True)
            raise
    os.replace(temp_path, path)
    return True


def sync_recent(email, password, api=None, root=None):
    api = api or TachyonApi()
    directory = (root or CACHE_ROOT) / hashlib.sha256(email.lower().encode('utf-8')).hexdigest()
    api.login(email, password)
    try:
        listing = api.request('?/Json/', {
            'Action': 'MessageList', 'folder': 'INBOX', 'offset': 0,
            'limit': MESSAGE_LIMIT, 'search': '', 'sort': ''
        }).get('Result', {})
        messages = listing.get('@Collection') if isinstance(listing, dict) else None
        if not isinstance(messages, list) or len(messages) > MESSAGE_LIMIT:
            raise RuntimeError('Invalid INBOX listing')
        directory.mkdir(parents=True, exist_ok=True)
        os.chmod(directory, 0o750)
        grant_web_read(directory)
        folder_info = listing.get('folder')
        uid_validity = folder_info.get('uidValidity') if isinstance(folder_info, dict) else None
        if not isinstance(uid_validity, int) or uid_validity < 1:
            raise RuntimeError('INBOX UIDVALIDITY is missing')
        validity_file = directory / 'uidvalidity'
        if validity_file.is_file() and validity_file.read_text(encoding='ascii') != str(uid_validity):
            for old_message in directory.glob('*.json'):
                old_message.unlink()
        validity_file.write_text(str(uid_validity), encoding='ascii')
        os.chmod(validity_file, 0o640)
        grant_web_read(validity_file)
        wanted = set()
        fetched = 0
        for item in messages:
            if not isinstance(item, dict) or item.get('folder') != 'INBOX':
                raise RuntimeError('Invalid message in INBOX listing')
            uid = item.get('uid')
            if type(uid) is not int or uid < 1:
                raise RuntimeError('Invalid message UID')
            path = directory / f'{uid}.json'
            wanted.add(path.name)
            if path.is_file():
                try:
                    cached = json.loads(path.read_text(encoding='utf-8'))
                except (OSError, ValueError):
                    cached = None
                if isinstance(cached, dict) and cached.get('uid') == uid and cached.get('folder') == 'INBOX':
                    if isinstance(item.get('flags'), list):
                        cached['flags'] = item['flags']
                        atomic_json(path, cached)
                    continue
            result = api.request('?/Json/', {
                'Action': 'Message', 'folder': 'INBOX', 'uid': uid
            }).get('Result')
            if not isinstance(result, dict) or result.get('folder') != 'INBOX' or result.get('uid') != uid:
                raise RuntimeError('Invalid message response')
            if atomic_json(path, result):
                fetched += 1
        for path in directory.glob('*.json'):
            if path.name not in wanted:
                path.unlink()
        return fetched, len(messages)
    finally:
        api.logout()


def run_forever():
    while True:
        try:
            options = json.loads(OPTIONS.read_text(encoding='utf-8'))
            email = str(options.get('gmail_cache_email', '')).strip().lower()
            password = str(options.get('gmail_cache_password', ''))
            if options.get('gmail_cache_enabled') and email.endswith('@gmail.com') and password:
                fetched, total = sync_recent(email, password)
                print(f'[INFO] Gmail cache: {fetched} fetched, {total} recent INBOX messages', flush=True)
        except (OSError, ValueError, RuntimeError, KeyError) as error:
            print(f'[WARN] Gmail cache sync failed ({type(error).__name__}); retrying later', flush=True)
        except Exception as error:
            print(f'[WARN] Gmail cache unavailable ({type(error).__name__}); retrying later', flush=True)
        time.sleep(INTERVAL_SECONDS)


if __name__ == '__main__':
    run_forever()
