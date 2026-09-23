import importlib.util
import json
import pathlib
import tempfile
import unittest


SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'cache-worker.py'
SPEC = importlib.util.spec_from_file_location('tachyon_cache_worker', SOURCE)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class FakeApi:
    def __init__(self, uids, validity=7):
        self.uids = uids
        self.validity = validity
        self.fetched = []
        self.logged_out = False

    def login(self, email, password):
        self.email = email
        self.password = password

    def logout(self):
        self.logged_out = True

    def request(self, path, payload):
        if payload['Action'] == 'MessageList':
            return {'Result': {
                'folder': {'uidValidity': self.validity},
                '@Collection': [{'folder': 'INBOX', 'uid': uid, 'flags': ['\\Seen']}
                                for uid in self.uids]
            }}
        uid = payload['uid']
        self.fetched.append(uid)
        return {'Result': {'folder': 'INBOX', 'uid': uid, 'subject': f'Message {uid}',
                           'flags': [], 'html': '<p>Hello</p>'}}


class CacheWorkerTests(unittest.TestCase):
    def test_fetches_only_new_messages_and_prunes_old_ones(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temp:
            root = pathlib.Path(temp)
            first = FakeApi([8, 7])
            self.assertEqual(worker.sync_recent('user@gmail.com', 'secret', first, root), (2, 2))
            directory = worker.cache_dir('user@gmail.com').name
            mailbox = root / directory
            self.assertEqual(json.loads((mailbox / '8.json').read_text())['subject'], 'Message 8')
            self.assertNotIn('secret', (mailbox / '8.json').read_text())
            self.assertTrue(first.logged_out)

            second = FakeApi([9, 8])
            self.assertEqual(worker.sync_recent('user@gmail.com', 'secret', second, root), (1, 2))
            self.assertEqual(second.fetched, [9])
            self.assertEqual(sorted(path.name for path in mailbox.glob('*.json')),
                             ['8.json', '9.json'])
            self.assertEqual(json.loads((mailbox / '8.json').read_text())['flags'], ['\\Seen'])

    def test_uidvalidity_change_invalidates_cached_messages(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temp:
            root = pathlib.Path(temp)
            worker.sync_recent('user@gmail.com', 'secret', FakeApi([8], 7), root)
            next_api = FakeApi([8], 8)
            self.assertEqual(worker.sync_recent('user@gmail.com', 'secret', next_api, root), (1, 1))
            self.assertEqual(next_api.fetched, [8])

    def test_invalid_listing_does_not_remove_existing_cache(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temp:
            root = pathlib.Path(temp)
            worker.sync_recent('user@gmail.com', 'secret', FakeApi([8]), root)
            mailbox = root / worker.cache_dir('user@gmail.com').name
            broken = FakeApi([8])
            broken.uids = [0]
            with self.assertRaises(RuntimeError):
                worker.sync_recent('user@gmail.com', 'secret', broken, root)
            self.assertTrue((mailbox / '8.json').is_file())
            self.assertTrue(broken.logged_out)


if __name__ == '__main__':
    unittest.main()
