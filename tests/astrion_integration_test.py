"""Astrion integration touches only its dedicated CrossPet config, never credentials."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "tools/integrate.py"
spec = importlib.util.spec_from_file_location("crosspet_integrate_astrion_test", SCRIPT)
integrate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(integrate)


class AstrionIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.support = Path(self.temp.name)
        self.config = self.support / "astrion.json"
        self.state = self.support / "state"
        self.patches = [patch.object(integrate, "SUPPORT", self.support),
                        patch.object(integrate, "ASTRION_CONFIG", self.config),
                        patch.object(integrate, "STATE_DIR", self.state)]
        for value in self.patches:
            value.start()

    def tearDown(self):
        for value in reversed(self.patches):
            value.stop()
        self.temp.cleanup()

    def test_install_and_uninstall_preserve_unrelated_config(self):
        self.config.write_text('{"user_field":"keep"}')
        integrate.astrion(True)
        self.assertTrue(integrate.astrion_registered())
        installed = json.loads(self.config.read_text())
        self.assertEqual(installed["user_field"], "keep")
        self.assertEqual(installed["state_dir"], str(self.state.resolve()))
        integrate.astrion(False)
        self.assertFalse(integrate.astrion_registered())
        self.assertEqual(json.loads(self.config.read_text())["user_field"], "keep")
        self.assertTrue(list(self.support.glob("astrion.json.bak-crosspet-*")))
        self.assertFalse(self.state.exists())

    def test_repeated_install_is_idempotent(self):
        integrate.astrion(True)
        first = self.config.read_text()
        integrate.astrion(True)
        self.assertEqual(self.config.read_text(), first)
        self.assertFalse(list(self.support.glob(".astrion-*")))

    def test_bad_config_and_symlink_are_not_overwritten(self):
        self.config.write_text('{broken')
        with self.assertRaises(ValueError):
            integrate.astrion(True)
        self.assertEqual(self.config.read_text(), '{broken')
        self.config.unlink()
        target = self.support / "other.json"
        target.write_text('{}')
        self.config.symlink_to(target)
        with self.assertRaises(ValueError):
            integrate.astrion(True)
        self.assertEqual(target.read_text(), '{}')

    def test_fresh_snapshot_is_detected_without_registration(self):
        self.state.mkdir()
        snapshot = self.state / "astrion-state.json"
        snapshot.write_text('{"version":1,"source":"astrion","ts":100}')
        with patch("time.time", return_value=110):
            self.assertTrue(integrate.astrion_producing())
        self.assertFalse(self.config.exists())
        with patch("time.time", return_value=146):
            self.assertFalse(integrate.astrion_producing())
        snapshot.write_text('{"version":1,"source":"other","ts":100}')
        with patch("time.time", return_value=110):
            self.assertFalse(integrate.astrion_producing())

    def test_peer_removal_does_not_override_active_producer(self):
        self.state.mkdir()
        snapshot = self.state / "astrion-state.json"
        content = '{"version":1,"source":"astrion","ts":100}'
        snapshot.write_text(content)
        integrate.astrion(False)
        with patch("time.time", return_value=110):
            self.assertTrue(integrate.astrion_producing())
        self.assertEqual(snapshot.read_text(), content)

    def test_uninstall_without_registration_creates_nothing(self):
        # 没用过 Astrion 的用户卸载时不该凭空多出一个配置
        integrate.astrion(False)
        self.assertFalse(self.config.exists())
        self.assertFalse(list(self.support.glob("astrion.json*")))

    def test_install_preserves_existing_state_dir(self):
        # 用户登记过的自定义目录不能被改回默认
        self.config.write_text(json.dumps({"version": 1, "enabled": True, "state_dir": "/custom/crosspet"}))
        integrate.astrion(True)
        self.assertEqual(json.loads(self.config.read_text())["state_dir"], "/custom/crosspet")
        integrate.astrion(False)
        self.assertEqual(json.loads(self.config.read_text())["state_dir"], "/custom/crosspet")

    def test_installed_ignores_snapshot_without_registration(self):
        # 看到新鲜输出不等于已接入，列表里不该因此显示「已接入」
        self.state.mkdir()
        (self.state / "astrion-state.json").write_text('{"version":1,"source":"astrion","ts":100}')
        with patch("time.time", return_value=110):
            self.assertTrue(integrate.astrion_producing())
            self.assertFalse(integrate.astrion_registered())
            self.assertNotIn("astrion", integrate.installed())

    def test_registered_install_target(self):
        self.assertIs(integrate.TARGETS["astrion"], integrate.astrion)
        self.assertEqual(integrate.SEEN_KEY["astrion"], "astrion")


if __name__ == "__main__":
    unittest.main()
