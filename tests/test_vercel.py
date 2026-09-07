import sys, pathlib, unittest, json
from unittest.mock import patch, MagicMock
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import shared_geocode as geo
class DeploymentTests(unittest.TestCase):
    def test_cache_avoids_provider(self):
        with patch.object(geo,'redis',return_value=json.dumps({'matches':[]})), patch.object(geo,'lookup_address') as provider:
            self.assertEqual(geo.lookup_shared('Waltham'),{'matches':[]})
            provider.assert_not_called()
    def test_busy_avoids_provider(self):
        with patch.object(geo,'redis',side_effect=[None,None]), patch.object(geo,'lookup_address') as provider:
            with self.assertRaises(geo.Busy):geo.lookup_shared('Waltham')
            provider.assert_not_called()
    def test_provider_has_lock_and_cooldown(self):
        with patch.object(geo,'redis',side_effect=[None,'OK','OK',1]) as store, patch.object(geo,'lookup_address',return_value={'matches':[]}):
            geo.lookup_shared('Waltham')
            self.assertEqual(store.call_args_list[1].args[0],'SET')
            self.assertIn('NX',store.call_args_list[1].args)
            self.assertEqual(store.call_args_list[-1].args[0],'EVAL')
    def test_missing_store_fails_closed(self):
        with patch.dict('os.environ',{},clear=True),patch.object(geo,'lookup_address') as provider:
            with self.assertRaises(RuntimeError):geo.lookup_shared('Waltham')
            provider.assert_not_called()
    def test_marketplace_credentials(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"result":"PONG"}'
        with patch.dict('os.environ', {'KV_REST_API_URL':'https://example.invalid', 'KV_REST_API_TOKEN':'test-token'}, clear=True), patch.object(geo, 'urlopen', return_value=response) as request:
            self.assertEqual(geo.redis('PING'), 'PONG')
            self.assertEqual(request.call_args.args[0].full_url, 'https://example.invalid')
    def test_incomplete_pairs_are_not_mixed(self):
        with patch.dict('os.environ', {'UPSTASH_REDIS_REST_URL':'https://example.invalid', 'KV_REST_API_TOKEN':'test-token'}, clear=True), patch.object(geo, 'urlopen') as request:
            with self.assertRaises(geo.NotConfigured): geo.redis('PING')
            request.assert_not_called()
    def test_public_output(self):
        root=pathlib.Path(__file__).resolve().parents[1]/'dist'
        self.assertTrue((root/'index.html').exists())
        self.assertFalse(any(p.suffix=='.py' or p.name.startswith('.env') for p in root.rglob('*')))
if __name__=='__main__':unittest.main()
