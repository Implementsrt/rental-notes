import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from package import build_package
from publication import audit_publication


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'web').mkdir()
        (self.root/'README.md').write_text('Public project documentation', encoding='utf-8')
        (self.root/'web/app.js').write_text('console.log("Hello")', encoding='utf-8')
        self.manifest = ('README.md', 'web/app.js')

    def test_local_configuration_and_session_data_are_not_packaged(self):
        (self.root/'.env.production').write_text('private local settings', encoding='utf-8')
        private = self.root/'test-results'
        private.mkdir()
        (private/'admin.json').write_text('{}', encoding='utf-8')
        with zipfile.ZipFile(build_package(self.root, self.manifest)) as archive:
            self.assertEqual(set(archive.namelist()), set(self.manifest))

    def test_secret_values_block_packaging_without_printing_the_value(self):
        generated_example = 'sk-' + 'A' * 40
        (self.root/'web/app.js').write_text(generated_example, encoding='utf-8')
        report = audit_publication(self.root, self.manifest)
        self.assertEqual(report['findings'][0]['kind'], 'openai_style_key')
        self.assertNotIn(generated_example, json.dumps(report))
        with self.assertRaises(ValueError):
            build_package(self.root, self.manifest)
        self.assertFalse((self.root/'rental-notes.zip').exists())

    def test_unreviewed_files_and_private_pages_assets_block_publication(self):
        extra = self.root/'personal-notes.txt'
        extra.write_text('Not reviewed', encoding='utf-8')
        self.assertTrue(audit_publication(self.root, self.manifest)['findings'])
        extra.unlink()
        (self.root/'web/.env').write_text('private', encoding='utf-8')
        findings = audit_publication(self.root, self.manifest)['findings']
        self.assertEqual(findings, [{'file':'web/.env', 'kind':'unreviewed_file'}])
        (self.root/'web/.env').unlink()
        (self.root/'.env.example').write_text('public template needs review', encoding='utf-8')
        self.assertEqual(audit_publication(self.root, self.manifest)['findings'],
                         [{'file':'.env.example', 'kind':'unreviewed_file'}])


if __name__ == '__main__':
    unittest.main()
