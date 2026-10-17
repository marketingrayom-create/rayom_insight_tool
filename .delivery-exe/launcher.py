import sys,threading,webbrowser,logging
from runtime_paths import APP_DIR
from app import app,connection
from werkzeug.serving import make_server

def main():
 if '--self-test' in sys.argv:
  response=app.test_client().get('/api/cities')
  assert response.status_code==200 and len(response.json['cities'])==198
  assert b'Recent checks' not in app.test_client().get('/').data
  assert app.test_client().get('/static/app.js').status_code==200
  from playwright.sync_api import sync_playwright
  with sync_playwright() as p: assert p.chromium is not None
  return
 logging.basicConfig(filename=str(APP_DIR/'data'/'exe.log'),level=logging.INFO)
 server=make_server('127.0.0.1',0,app,threaded=True)
 with connection() as db:
  db.execute("UPDATE runs SET status='interrupted' WHERE status='running'")
 threading.Timer(1,lambda:webbrowser.open('http://127.0.0.1:'+str(server.server_port))).start()
 server.serve_forever()

if __name__=='__main__': main()
