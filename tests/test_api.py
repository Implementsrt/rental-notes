import copy
from contextlib import closing
import json
import secrets
from pathlib import Path
import sqlite3
import tempfile
import unittest
import uuid

from werkzeug.security import generate_password_hash
from server import create_app


class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password = secrets.token_urlsafe(24)
        cls.password_hash = generate_password_hash(cls.password)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = {'TESTING':True,'DATA_DIR':self.temp.name,'ADMIN_HASH':self.password_hash,'ALLOWED_ORIGINS':['https://example.github.io']}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        result = self.client.post('/api/login',json={'password':self.password})
        self.headers = {'Authorization':'Bearer '+result.json['token']}
        self.home = {'id':str(uuid.uuid4()),'name':'南向房','decision':'pending','costs':{'rent':2600},'checks':{'balcony':{'status':'pass','note':'有阳台'}}}

    def put(self,revision=0,home=None,deleted=False,client=None):
        home = home or self.home
        return (client or self.client).put('/api/homes/'+home['id'],headers=self.headers,json={'data':None if deleted else home,'revision':revision,'deleted':deleted})

    def test_private_data_requires_login(self):
        self.assertEqual(self.client.get('/api/homes').status_code,401)
        self.assertEqual(self.client.put('/api/homes/'+self.home['id'],json={}).status_code,401)
        self.assertEqual(self.client.get('/data/admin.json').status_code,404)
        self.assertEqual(self.client.get('/server.py').status_code,404)

    def test_all_frontend_modules_are_served(self):
        for name in ['app.js','model.js','store.js','checklist.js','connection.js','app.css','config.js','icon.svg']:
            result=self.client.get('/'+name)
            self.assertEqual(result.status_code,200,name)
            result.close()

    def test_save_update_and_delete_are_versioned_and_survive_restart(self):
        self.assertEqual(self.put().json['revision'],1)
        restarted = create_app(self.config).test_client()
        rows = restarted.get('/api/homes',headers=self.headers).json['items']
        self.assertEqual(rows[0]['data']['name'],'南向房')
        self.home['notes']='补充记录'
        self.assertEqual(self.put(1,client=restarted).json['revision'],2)
        self.assertEqual(self.put(2,deleted=True).json['revision'],3)
        row = self.client.get('/api/homes',headers=self.headers).json['items'][0]
        self.assertTrue(row['deleted']);self.assertIsNone(row['data'])

    def test_stale_edits_and_stale_deletes_are_rejected(self):
        self.put()
        self.assertEqual(self.put(0).status_code,409)
        self.assertEqual(self.put(0,deleted=True).status_code,409)
        self.assertFalse(self.client.get('/api/homes',headers=self.headers).json['items'][0]['deleted'])

    def test_community_and_other_notes_round_trip_for_every_check_kind(self):
        self.home['community']='花园小区'
        self.home['name']='3栋1203'
        self.home['costs']['internet']=80
        keys = ['balcony','bedroom_door','entry_notice','natural_gas','balcony_privacy','parking_position','ac_efficiency','door_lock','entrance_gates','traffic_separation','ebike_access']
        for key in keys:
            self.home['checks'][key]={'status':'other','note':'约定后再确认'}
        self.assertEqual(self.put().status_code,201)
        restarted=create_app(self.config).test_client()
        home=restarted.get('/api/homes',headers=self.headers).json['items'][0]['data']
        self.assertEqual(home['community'],'花园小区')
        self.assertEqual(home['name'],'3栋1203')
        self.assertEqual(home['costs']['internet'],80)
        self.assertEqual(home['propertyFeeBasis'],'monthly')
        for key in keys:
            self.assertEqual(home['checks'][key],{'status':'other','note':'约定后再确认'})

    def test_area_property_fee_and_simplified_home_fields_survive_sync(self):
        self.home.update(community='花园小区',layout='四房',bathrooms='两卫',floor='12 / 26',area='120',propertyFeeBasis='area')
        self.home['costs']['property']=1.5
        self.assertEqual(self.put().status_code,201)
        home=create_app(self.config).test_client().get('/api/homes',headers=self.headers).json['items'][0]['data']
        for key in ['community','layout','bathrooms','floor','area','propertyFeeBasis']:
            self.assertEqual(home[key],self.home[key])
        self.assertEqual(home['costs']['property'],1.5)
        self.home['propertyFeeBasis']='unknown'
        self.assertEqual(self.put(1).status_code,400)

    def test_invalid_values_and_mismatched_ids_are_rejected(self):
        self.home['costs']['rent']=-5
        self.assertEqual(self.put().status_code,400)
        self.home['costs']['rent']=float('nan')
        self.assertEqual(self.put().status_code,400)
        self.home['costs']['rent']=True
        self.assertEqual(self.put().status_code,400)
        self.home['costs']['rent']=2600
        for key, status in [('balcony','good'),('natural_gas','good'),('balcony_privacy','pass'),('parking_position','pass'),('ac_efficiency','pass'),('door_lock','pass'),('entrance_gates','pass'),('traffic_separation','pass'),('ebike_access','pass')]:
            home = copy.deepcopy(self.home)
            home['checks'][key] = {'status':status,'note':''}
            with self.subTest(check=key):
                self.assertEqual(self.put(home=home).status_code,400)

    def test_rental_terms_and_individual_appliances_survive_sync_and_recalculate_amounts(self):
        self.home.update(depositMonths=3, paymentMonths=2, agencyRate=0.5)
        self.home['costs'].update(rent=2601, deposit=1, agency=1, parking=300, cleanOut=200)
        for key, status in [('fridge', 'pass'), ('sterilizer', 'other'), ('range_hood', 'fail'), ('gas_water_heater', 'unknown')]:
            self.home['checks'][key] = {'status': status, 'note': '分别核实'}
        self.assertEqual(self.put().status_code, 201)
        home = create_app(self.config).test_client().get('/api/homes', headers=self.headers).json['items'][0]['data']
        for key in ['depositMonths', 'paymentMonths', 'agencyRate']:
            self.assertEqual(home[key], self.home[key])
        self.assertEqual(home['costs']['deposit'], 7803)
        self.assertEqual(home['costs']['agency'], 1301)
        for key in ['fridge', 'sterilizer', 'range_hood', 'gas_water_heater']:
            self.assertEqual(home['checks'][key], self.home['checks'][key])
        self.home.update(agencyRate=0)
        self.home['costs']['rent'] = None
        self.assertEqual(self.put(1).status_code, 200)
        home = self.client.get('/api/homes', headers=self.headers).json['items'][0]['data']
        self.assertIsNone(home['costs']['deposit'])
        self.assertEqual(home['costs']['agency'], 0)

    def test_legacy_amounts_and_combined_appliance_answer_are_preserved_without_new_defaults(self):
        self.home['costs'].update(deposit=3900.5, agency=700.5, cleanIn=88.5, parking=None, cleanOut=None)
        self.home['checks']['appliances'] = {'status': 'pass', 'note': '原有整体记录'}
        self.assertEqual(self.put().status_code, 201)
        home = self.client.get('/api/homes', headers=self.headers).json['items'][0]['data']
        for key in ['depositMonths', 'paymentMonths', 'agencyRate']:
            self.assertIsNone(home[key])
        for key in ['deposit', 'agency', 'cleanIn', 'parking', 'cleanOut']:
            self.assertEqual(home['costs'][key], self.home['costs'][key])
        self.assertEqual(home['checks']['appliances'], self.home['checks']['appliances'])
        for key in ['fridge', 'sterilizer', 'range_hood', 'gas_water_heater']:
            self.assertNotIn(key, home['checks'])

    def test_rental_term_options_reject_invalid_types_and_values(self):
        for key in ['depositMonths', 'paymentMonths', 'agencyRate']:
            for value in [True, False, '1', '', -1, 4, {}, [], float('nan')]:
                with self.subTest(field=key, value=value):
                    home = copy.deepcopy(self.home)
                    home[key] = value
                    self.assertEqual(self.put(home=home).status_code, 400)
        for key in ['fridge', 'sterilizer', 'range_hood', 'gas_water_heater']:
            home = copy.deepcopy(self.home)
            home['checks'][key] = {'status': 'good', 'note': ''}
            self.assertEqual(self.put(home=home).status_code, 400)

    def test_unapproved_origins_are_rejected_and_allowed_origin_gets_cors(self):
        result=self.client.get('/api/homes',headers={**self.headers,'Origin':'https://malicious.example'})
        self.assertEqual(result.status_code,403)
        self.assertNotIn('Access-Control-Allow-Origin',result.headers)
        result=self.client.options('/api/homes',headers={'Origin':'https://example.github.io'})
        self.assertEqual(result.status_code,204)
        self.assertEqual(result.headers['Access-Control-Allow-Origin'],'https://example.github.io')
        self.assertEqual(self.client.get('/api/homes',headers={'Origin':'https://example.github.io'}).status_code,401)

    def test_login_rate_limit(self):
        for _ in range(9):self.assertEqual(self.client.post('/api/login',json={'password':'wrong'}).status_code,401)
        self.assertEqual(self.client.post('/api/login',json={'password':self.password}).status_code,429)

    def test_logout_revokes_the_session(self):
        self.assertEqual(self.client.post('/api/logout',headers=self.headers).status_code,200)
        self.assertEqual(self.client.get('/api/homes',headers=self.headers).status_code,401)

    def test_exported_data_excludes_unknown_fields_and_api_is_not_cached(self):
        self.home['injected']='<script>alert(1)</script>'
        self.put()
        result=self.client.get('/api/homes',headers=self.headers)
        self.assertNotIn('injected',result.json['items'][0]['data'])
        self.assertEqual(result.headers['Cache-Control'],'no-store')
        self.assertNotIn('token',str(result.json))

    def test_consistent_sqlite_backup(self):
        self.put()
        output=Path(self.temp.name)/'backup.sqlite3'
        with closing(sqlite3.connect(self.app.config['DB_PATH'])) as src,closing(sqlite3.connect(output)) as dest:src.backup(dest)
        with closing(sqlite3.connect(output)) as con:self.assertEqual(con.execute('SELECT count(*) FROM homes').fetchone()[0],1)


if __name__ == '__main__':
    unittest.main()
